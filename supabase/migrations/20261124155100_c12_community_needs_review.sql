
-- C1.2 stays closed on hosted infrastructure. Only disposable fixtures open this gate.
insert into private.m23_capabilities(capability,high_impact,scopes)
values ('community_need_submit',false,'{community}');

create table private.c12_fixture (enabled boolean primary key check (enabled));
create table private.c12_authority (
  community_id uuid not null references feed_data.communities(id),
  actor_id uuid not null references auth.users(id) on delete cascade,
  lane text not null check(lane in ('triage','review')),
  granted_by uuid references auth.users(id) on delete set null,
  until_at timestamptz not null,
  revoked_at timestamptz,
  primary key(community_id,actor_id,lane)
);
create table private.c12_cases (
  need_id uuid primary key references private.c11_needs(id),
  revision integer not null default 1,
  state text not null default 'submitted' check(state in ('submitted','under_review','needs_information','supported','insufficient_evidence','not_supported','withdrawn','closed')),
  triager uuid references auth.users(id) on delete set null,
  reviewer uuid references auth.users(id) on delete set null,
  previous_reviewer uuid references auth.users(id) on delete set null,
  accepted boolean not null default false,
  resume_state text,
  referred boolean not null default false,
  unsafe boolean not null default false,
  escalated boolean not null default false,
  finding_id uuid,
  updated_at timestamptz not null default clock_timestamp()
);
create index c12_triage_assignments on private.c12_cases(triager,need_id);
create index c12_review_assignments on private.c12_cases(reviewer,need_id);
create table private.c12_events (
  id uuid primary key default gen_random_uuid(),
  need_id uuid references private.c11_needs(id),
  community_id uuid not null references feed_data.communities(id),
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid,
  command_hash bytea,
  workspace_id uuid,
  action text not null,
  state text,
  case_revision integer,
  evidence_revision integer,
  subject_id uuid references auth.users(id) on delete set null,
  note text,
  safe_code text,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor_id, request_id)
);
create index c12_case_history on private.c12_events(need_id,happened_at desc,id desc);
create table private.c12_conflicts (
  need_id uuid not null references private.c11_needs(id),
  actor_id uuid not null references auth.users(id) on delete cascade,
  primary key(need_id,actor_id)
);
create table private.c12_duplicates (
  low_id uuid not null references private.c11_needs(id),
  high_id uuid not null references private.c11_needs(id),
  event_id uuid not null references private.c12_events(id),
  primary key(low_id,high_id), check(low_id<high_id)
);
create table private.c12_challenges (
  finding_id uuid primary key references private.c12_events(id),
  need_id uuid not null references private.c11_needs(id),
  reviewer uuid references auth.users(id) on delete set null,
  accepted boolean not null default false,
  status text not null default 'pending' check(status in ('pending','upheld','returned')),
  filed_at timestamptz not null default clock_timestamp()
);
create unique index c12_one_pending_challenge on private.c12_challenges(need_id) where status='pending';

alter table private.c12_fixture enable row level security;
alter table private.c12_authority enable row level security;
alter table private.c12_cases enable row level security;
alter table private.c12_events enable row level security;
alter table private.c12_conflicts enable row level security;
alter table private.c12_duplicates enable row level security;
alter table private.c12_challenges enable row level security;
revoke all on private.c12_fixture,private.c12_authority,private.c12_cases,private.c12_events,private.c12_conflicts,
  private.c12_duplicates,private.c12_challenges from public,anon,authenticated,service_role;

create function private.c12_enabled() returns boolean language sql stable set search_path='' as $$
  select exists(select from private.c11_intake_fixture where enabled) and exists(select from private.c12_fixture where enabled)
$$;

create function private.c12_granted(p_actor uuid,p_community uuid,p_lane text)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and private.verified_totp(p_actor)
    and exists(select from private.c12_authority a where a.actor_id=p_actor and a.community_id=p_community
      and a.lane=p_lane and a.revoked_at is null and a.until_at>statement_timestamp())
    and case p_lane when 'review' then private.institution_reviewer(p_actor)
      when 'triage' then feed_data.community_member(p_community,p_actor)
        and exists(select from feed_data.community_staff s where s.community_id=p_community and s.user_id=p_actor)
      else false end
$$;

-- Moderation workspace access alone does not confer any existing M2.3 delegation.
create or replace function private.s2c_workspace_allowed(p_actor uuid,p_kind text)
returns boolean language sql stable set search_path='' as $$
  select case p_kind when 'admin_workspace' then private.s2a_leadership(p_actor)
    when 'verification_workspace' then private.institution_reviewer(p_actor)
    when 'moderation_workspace' then exists(select from private.m23_live_delegations(p_actor,statement_timestamp()))
      or (private.c12_enabled() and exists(select from private.c12_authority a
        where a.actor_id=p_actor and a.lane='triage' and private.c12_granted(p_actor,a.community_id,'triage')))
    else false end
$$;

create function private.c12_conflicted(p_actor uuid,n private.c11_needs,r private.c12_cases,p_appeal boolean)
returns boolean language sql stable set search_path='' as $$
  select p_actor is null or p_actor is not distinct from n.author_id
    or p_actor is not distinct from r.triager or p_actor is not distinct from r.previous_reviewer
    or exists(select from private.c12_conflicts c where c.need_id=n.id and c.actor_id=p_actor)
    or (p_appeal and exists(select from private.c12_events e where e.id=r.finding_id and e.actor_id=p_actor))
    or exists(select from private.community_projects p where n.community_id in (p.community_id,p.association_id)
      and (private.project_conflicted(p,p_actor)
        or (p.organization_id is not null and private.m24_org_conflict(p_actor,p.organization_id))
        or exists(select from private.project_team t where t.project_id=p.id and t.user_id=p_actor
          and t.revoked_at is null and t.role in ('manager','supervisor'))))
$$;

create function private.c12_intake_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' or (old.status='draft' and new.status in ('draft','submitted')) then
    perform private.m23_require(new.author_id,'community_need_submit','community',new.community_id);
  elsif new.status='withdrawn' and old.status<>'withdrawn' then
    if exists(select from private.c12_challenges a where a.need_id=new.id and a.status='pending')
      or exists(select from private.c12_cases r where r.need_id=new.id and r.state not in ('submitted','under_review','needs_information'))
    then raise exception 'withdrawal unavailable' using errcode='O2004'; end if;
    update private.c12_cases set state='withdrawn',revision=revision+1,updated_at=clock_timestamp() where need_id=new.id;
  end if;
  return new;
end
$$;
create trigger c12_intake_guard before insert or update on private.c11_needs for each row execute function private.c12_intake_guard();

create function private.c12_intake_event() returns trigger language plpgsql set search_path='' as $$
begin
  if new.action in ('submit','withdraw') then
    insert into private.c12_events(need_id,community_id,actor_id,action,state,evidence_revision,happened_at)
      values(new.need_id,new.community_id,new.actor_id,new.action,new.status::text,new.revision,new.occurred_at);
  end if;
  return new;
end
$$;
create trigger c12_intake_event after insert on private.c11_need_revisions for each row execute function private.c12_intake_event();

create function private.c12_staff_session(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,p_lane text)
returns boolean language sql stable set search_path='' as $$
  select case p_lane
    when 'admin' then private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin')
    when 'review' then private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'review')
    when 'triage' then coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
      and public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'moderation',null,null) is not null
    else false end
$$;

create function private.c12_staff_case(p_actor uuid,p_lane text,n private.c11_needs,r private.c12_cases)
returns boolean language sql stable set search_path='' as $$
  select n.status<>'draft' and case p_lane
    when 'admin' then true
    when 'triage' then r.triager=p_actor and n.author_id is distinct from p_actor
      and private.c12_granted(p_actor,n.community_id,'triage')
    when 'review' then private.c12_granted(p_actor,n.community_id,'review') and (
      (r.reviewer=p_actor and not private.c12_conflicted(p_actor,n,r,false)
        and not exists(select from private.c12_challenges a where a.finding_id=r.finding_id))
      or (not private.c12_conflicted(p_actor,n,r,true) and exists(select from private.c12_challenges a
        where a.need_id=n.id and a.reviewer=p_actor and a.status='pending')))
    else false end
$$;

create function private.c12_projection(n private.c11_needs,r private.c12_cases,p_lane text)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',n.id,'communityId',n.community_id,'revision',coalesce(r.revision,0),
    'evidenceRevision',n.revision,'findingId',case when p_lane='member' then r.finding_id end,
    'state',case when n.status='withdrawn' then 'withdrawn' else coalesce(r.state,n.status::text) end,
    'triager',case when p_lane in ('admin','triage') then r.triager end,
    'reviewer',case when p_lane in ('admin','review') then r.reviewer end,
    'accepted',r.accepted,'referred',r.referred,'escalated',r.escalated,'unsafe',r.unsafe,
    'challengeUntil',(select e.happened_at + interval '14 days' from private.c12_events e
      where e.id=r.finding_id and e.state in ('insufficient_evidence','not_supported')
        and not exists(select from private.c12_challenges a where a.finding_id=e.id)),
    'challenge',(select jsonb_build_object('status',a.status,'accepted',a.accepted,
      'reviewer',case when p_lane in ('admin','review') then a.reviewer end)
      from private.c12_challenges a where a.need_id=n.id order by a.filed_at desc limit 1),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'state',e.state,
        'revision',e.case_revision,'evidenceRevision',e.evidence_revision,'at',e.happened_at,'summary',e.safe_code,
        'note',case when p_lane in ('triage','review') then e.note end)
        order by e.happened_at desc,e.id desc),'[]'::jsonb)
      from (select * from private.c12_events x where x.need_id=n.id and (p_lane<>'member' or x.safe_code is not null
        or x.action in ('submit','withdraw','correct','challenge')) and x.action<>'access'
        order by x.happened_at desc,x.id desc limit 80) e))
    || case when p_lane in ('triage','review') then jsonb_build_object('versions',(
      select jsonb_agg(jsonb_build_object('revision',v.revision,'content',v.content,'at',v.occurred_at) order by v.revision desc)
      from private.c11_need_revisions v where v.need_id=n.id)) else '{}'::jsonb end
$$;

create function public.c12_needs_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_lane text,p_id uuid,p_command jsonb,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  n private.c11_needs; other_need private.c11_needs; r private.c12_cases; other_review private.c12_cases;
  appeal private.c12_challenges; prior private.c12_events; finding private.c12_events;
  a text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; scope_id uuid:=(p_command->>'communityId')::uuid;
  scope_lane text:=p_command->>'role'; feedback text:=p_command->>'summary';
  note text:=btrim(p_command->>'note'); evidence jsonb:=p_command->'content';
  hash bytea; event_id uuid:=gen_random_uuid(); moment timestamptz;
  next_state text; evidence_revision integer;
  conflict_denied boolean:=false;
begin
  if not private.c12_enabled() then raise exception 'review disabled' using errcode='C1201'; end if;
  if p_lane in ('member','access') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false)
    then raise exception 'authorization required' using errcode='42501'; end if;
  elsif not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false)
    then raise exception 'workspace required' using errcode='42501';
  end if;

  if p_lane='access' then
    return jsonb_build_object('oversight',private.platform_admin(p_actor),'allowed',exists(select from private.c12_authority a where a.actor_id=p_actor
      and a.lane='triage' and private.c12_granted(p_actor,a.community_id,'triage')));
  end if;

  if p_command is not null then
    if p_command->'confirmed' is distinct from 'true'::jsonb or req is null or a is null
      or (note is not null and (length(note) not between 5 and 1500 or note ~ '[[:cntrl:]]'))
    then raise exception 'invalid review command' using errcode='23514'; end if;
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
    perform pg_advisory_xact_lock(20261124,1551);
    if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
      or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
    then raise exception 'session unavailable' using errcode='42501'; end if;
    hash:=extensions.digest(jsonb_build_array(p_id,p_lane,p_command)::text,'sha256');
    moment:=clock_timestamp();

    if a in ('grant','revoke') then
      if p_lane<>'admin' or not private.platform_founder(p_actor) or target is null or target=p_actor or scope_id is null
        or scope_lane is null or scope_lane not in ('triage','review') or note is null or p_id is not null
      then raise exception 'authority unavailable' using errcode='42501'; end if;
      select * into prior from private.c12_events where actor_id=p_actor and request_id=req;
      if found then
        if prior.command_hash<>hash then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('eventId',prior.id);
      end if;
      if a='grant' then
        if not private.institution_actor(target) or not private.verified_totp(target)
          or (scope_lane='review' and not private.institution_reviewer(target))
          or (scope_lane='triage' and (not feed_data.community_member(scope_id,target)
            or not exists(select from feed_data.community_staff s where s.community_id=scope_id and s.user_id=target)))
        then raise exception 'candidate unavailable' using errcode='42501'; end if;
        insert into private.c12_authority(community_id,actor_id,lane,granted_by,until_at)
          values(scope_id,target,scope_lane,p_actor,moment+interval '30 days')
          on conflict(community_id,actor_id,lane) do update set granted_by=p_actor,until_at=excluded.until_at,revoked_at=null;
      else
        update private.c12_authority set revoked_at=moment where community_id=scope_id and actor_id=target and c12_authority.lane=(p_command->>'role') and revoked_at is null;
        if not found then raise exception 'grant unavailable' using errcode='O2003'; end if;
      end if;
      insert into private.c12_events(id,community_id,actor_id,request_id,command_hash,workspace_id,action,subject_id,note)
        values(event_id,scope_id,p_actor,req,hash,p_workspace,a||'_'||scope_lane,target,note);
      return jsonb_build_object('eventId',event_id);
    end if;
  end if;

  if p_id is null then
    if p_command is not null or p_lane='member' then raise exception 'case required' using errcode='23514'; end if;
    return jsonb_build_object('cases',coalesce((
      select jsonb_agg(jsonb_build_object('id',x.id,'communityId',x.community_id,'state',x.state,'revision',x.revision) order by x.id)
      from (select item.id,item.community_id,coalesce(review.state,item.status::text) state,coalesce(review.revision,0) revision
        from private.c11_needs item left join private.c12_cases review on review.need_id=item.id
        where item.status='submitted' and (p_after is null or item.id>p_after)
          and private.c12_staff_case(p_actor,p_lane,item,review) order by item.id limit 21) x),'[]'::jsonb),
      'canGrant',p_lane='admin' and private.platform_founder(p_actor),
      'communities',case when p_lane='admin' then (select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug) order by c.slug)
        from feed_data.communities c) else '[]'::jsonb end);
  end if;

  if p_command is null then
    select * into n from private.c11_needs where id=p_id;
  else
    -- Match C1.1 ordering for withdrawn cases, and order both ends of duplicate links.
    if a='duplicate' and target is not null then
      perform 1 from private.c11_needs where id in (p_id,target) order by id for update;
    end if;
    select * into n from private.c11_needs where id=p_id for update;
  end if;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  select * into r from private.c12_cases where need_id=p_id;
  if p_lane='member' then
    if n.author_id is distinct from p_actor then raise exception 'case unavailable' using errcode='O2003'; end if;
  elsif not coalesce(private.c12_staff_case(p_actor,p_lane,n,r),false) then
    raise exception 'case unavailable' using errcode='O2003';
  end if;

  if p_command is null then
    if p_lane in ('triage','review') then
      insert into private.c12_events(need_id,community_id,actor_id,workspace_id,action,case_revision,evidence_revision)
        values(n.id,n.community_id,p_actor,p_workspace,'access',r.revision,n.revision);
    end if;
    return private.c12_projection(n,r,p_lane);
  end if;
  select * into prior from private.c12_events where actor_id=p_actor and request_id=req;
  if found then
    if prior.command_hash<>hash then raise exception 'request conflict' using errcode='O2002'; end if;
    if prior.action='conflict_denied' then return jsonb_build_object('denied',true); end if;
    return private.c12_projection(n,r,p_lane);
  end if;
  if n.status<>'submitted' or coalesce(r.revision,0) is distinct from (p_command->>'expectedRevision')::integer then
    raise exception 'case changed' using errcode='O2004';
  end if;
  if r.need_id is null then
    if p_lane<>'admin' or a not in ('assign_triage','assign_review','flag_conflict') then
      raise exception 'assignment required' using errcode='42501'; end if;
    insert into private.c12_cases(need_id,revision) values(n.id,0) returning * into r;
  end if;
  select * into appeal from private.c12_challenges where need_id=n.id and status='pending';
  next_state:=r.state;
  evidence_revision:=n.revision;

  case a
    when 'assign_triage','assign_review','assign_challenge' then
      if p_lane<>'admin' or p_actor=n.author_id or target is null or target=p_actor or note is null
        or (a='assign_challenge' and appeal.finding_id is null)
        or (a<>'assign_challenge' and (appeal.finding_id is not null or r.state not in ('submitted','under_review')))
        or (a='assign_review' and not r.referred)
        or (a='assign_triage' and (r.referred or r.reviewer is not null))
      then raise exception 'assignment unavailable' using errcode='42501'; end if;
      if not private.c12_granted(target,n.community_id,case when a='assign_triage' then 'triage' else 'review' end)
        or target=n.author_id or exists(select from private.c12_conflicts where need_id=n.id and actor_id=target)
        or (a<>'assign_triage' and private.c12_conflicted(target,n,r,a='assign_challenge'))
      then conflict_denied:=true;
      elsif a='assign_triage' then
        r.triager:=target;
      elsif a='assign_review' then
        r.reviewer:=target;
        r.accepted:=false;
        next_state:='submitted';
      else
        update private.c12_challenges set reviewer=target,accepted=false where finding_id=appeal.finding_id;
      end if;
    when 'flag_conflict','declare_conflict' then
      if note is null or (a='flag_conflict' and (p_lane<>'admin' or p_actor=n.author_id or target is null))
        or (a='declare_conflict' and p_lane not in ('review','triage'))
      then raise exception 'conflict command unavailable' using errcode='42501'; end if;
      target:=case when a='declare_conflict' then p_actor else target end;
      insert into private.c12_conflicts(need_id,actor_id) values(n.id,target) on conflict do nothing;
      if r.reviewer=target and r.state in ('submitted','under_review','needs_information') then
        r.reviewer:=null; r.accepted:=false;
        if r.state='needs_information' then r.resume_state:='submitted'; else next_state:='submitted'; end if;
      end if;
      if r.triager=target then r.triager:=null; end if;
      if appeal.reviewer=target then
        update private.c12_challenges set reviewer=null,accepted=false where finding_id=appeal.finding_id;
      end if;
    when 'triage','refer','escalate','flag_unsafe' then
      if p_lane<>'triage' or r.state<>'submitted' or r.reviewer is not null or note is null then
        raise exception 'triage unavailable' using errcode='42501'; end if;
      if a='refer' then r.referred:=true;
      elsif a='escalate' then r.escalated:=true; r.referred:=true;
      elsif a='flag_unsafe' then r.unsafe:=true;
      end if;
    when 'duplicate' then
      if p_lane not in ('triage','review') or target is null or target=n.id or note is null then
        raise exception 'duplicate link unavailable' using errcode='42501'; end if;
      select * into other_need from private.c11_needs where id=target and community_id=n.community_id and status='submitted';
      select * into other_review from private.c12_cases where need_id=target;
      if other_need.id is null or not coalesce(private.c12_staff_case(p_actor,p_lane,other_need,other_review),false)
        then raise exception 'duplicate link unavailable' using errcode='O2003'; end if;
      if exists(select from private.c12_duplicates where low_id=least(n.id,target) and high_id=greatest(n.id,target))
        then raise exception 'duplicate link exists' using errcode='O2002'; end if;
    when 'accept' then
      if p_lane<>'review' or p_command->'conflictFree' is distinct from 'true'::jsonb then raise exception 'independence required' using errcode='42501'; end if;
      if appeal.finding_id is not null and appeal.reviewer=p_actor and not appeal.accepted
        and not private.c12_conflicted(p_actor,n,r,true) then
        update private.c12_challenges set accepted=true where finding_id=appeal.finding_id;
      elsif appeal.finding_id is null and r.reviewer=p_actor and not r.accepted and r.state='submitted' then
        r.accepted:=true; next_state:='under_review';
      else raise exception 'accept unavailable' using errcode='42501'; end if;
    when 'request_information' then
      if note is null or feedback is null or feedback not in ('clarify_scope','clarify_beneficiaries','clarify_references','remove_personal_information')
        or not coalesce((p_lane='triage' and r.state='submitted' and r.reviewer is null)
          or (p_lane='review' and r.state='under_review' and r.reviewer=p_actor and r.accepted),false)
      then raise exception 'information request unavailable' using errcode='42501'; end if;
      r.resume_state:=r.state; next_state:='needs_information';
    when 'correct' then
      if p_lane<>'member' or r.state<>'needs_information' or appeal.finding_id is not null
        or n.revision is distinct from (p_command->>'expectedEvidenceRevision')::integer then
        raise exception 'correction unavailable' using errcode='O2004'; end if;
      perform private.c11_validate_content(evidence,true);
      update private.c11_needs set content=evidence,revision=revision+1,updated_at=moment where id=n.id returning * into n;
      evidence_revision:=n.revision;
      insert into private.c11_need_revisions(need_id,community_id,revision,actor_id,request_id,fingerprint,action,status,content,occurred_at)
        values(n.id,n.community_id,n.revision,p_actor,req,hash,'edit','submitted',evidence,moment);
      next_state:=coalesce(r.resume_state,'submitted'); r.resume_state:=null;
    when 'observe' then
      if p_lane<>'review' or note is null or not coalesce((appeal.reviewer=p_actor and appeal.accepted)
        or (appeal.finding_id is null and r.reviewer=p_actor and r.accepted and r.state='under_review'),false)
      then raise exception 'observation unavailable' using errcode='42501'; end if;
    when 'supported','insufficient_evidence','not_supported','close','return' then
      if p_lane<>'review' or r.reviewer is distinct from p_actor or not r.accepted or note is null
        or appeal.finding_id is not null or r.state<>'under_review'
      then raise exception 'decision unavailable' using errcode='42501'; end if;
      if a='return' then r.reviewer:=null; r.accepted:=false; r.previous_reviewer:=p_actor; next_state:='submitted';
      elsif a='close' then next_state:='closed'; feedback:='closed';
      else
        if not coalesce(case a
          when 'supported' then feedback='evidence_matches'
          when 'insufficient_evidence' then feedback in ('missing_independent_sources','scope_unconfirmed')
          when 'not_supported' then feedback='conflicting_evidence' end,false)
        then raise exception 'safe explanation required' using errcode='23514'; end if;
        next_state:=a; r.finding_id:=event_id;
      end if;
    when 'challenge' then
      if p_lane<>'member' or note is null
        or (p_command->>'findingId')::uuid is distinct from r.finding_id then
        raise exception 'challenge unavailable' using errcode='42501'; end if;
      select * into finding from private.c12_events where id=r.finding_id and need_id=n.id;
      if not found or appeal.finding_id is not null or finding.state not in ('insufficient_evidence','not_supported')
        or moment>=finding.happened_at+interval '14 days'
        or exists(select from private.c12_challenges where finding_id=finding.id)
      then raise exception 'challenge unavailable' using errcode='O2004'; end if;
      insert into private.c12_challenges(finding_id,need_id,filed_at) values(finding.id,n.id,moment);
    when 'uphold_challenge','return_challenge' then
      if p_lane<>'review' or appeal.reviewer is distinct from p_actor or not coalesce(appeal.accepted,false)
        or note is null or private.c12_conflicted(p_actor,n,r,true)
      then raise exception 'challenge decision unavailable' using errcode='42501'; end if;
      update private.c12_challenges set status=case when a='uphold_challenge' then 'upheld' else 'returned' end where finding_id=appeal.finding_id;
      if a='return_challenge' then
        r.previous_reviewer:=r.reviewer; r.reviewer:=null; r.accepted:=false; r.finding_id:=null;
        next_state:='submitted';
      end if;
      feedback:=a;
    else raise exception 'invalid action' using errcode='23514';
  end case;

  if a not in ('request_information','supported','insufficient_evidence','not_supported','close','uphold_challenge','return_challenge') then feedback:=null; end if;
  if conflict_denied then
    insert into private.c12_events(id,need_id,community_id,actor_id,request_id,command_hash,workspace_id,action,case_revision,evidence_revision,subject_id)
      values(event_id,n.id,n.community_id,p_actor,req,hash,p_workspace,'conflict_denied',r.revision,n.revision,target);
    return jsonb_build_object('denied',true);
  end if;
  update private.c12_cases set revision=r.revision+1,state=next_state,reviewer=r.reviewer,triager=r.triager,
    previous_reviewer=r.previous_reviewer,accepted=r.accepted,resume_state=r.resume_state,referred=r.referred,
    escalated=r.escalated,unsafe=r.unsafe,finding_id=r.finding_id,updated_at=moment where need_id=n.id returning * into r;
  insert into private.c12_events(id,need_id,community_id,actor_id,request_id,command_hash,workspace_id,
    action,state,case_revision,evidence_revision,subject_id,note,safe_code,happened_at)
    values(event_id,n.id,n.community_id,p_actor,req,hash,p_workspace,a,r.state,r.revision,evidence_revision,
      case when a<>'duplicate' then target end,note,feedback,moment);
  if a='duplicate' then
    insert into private.c12_duplicates(low_id,high_id,event_id) values(least(n.id,target),greatest(n.id,target),event_id);
  end if;
  return private.c12_projection(n,r,p_lane);
end
$$;

revoke all on function private.c12_enabled(),private.c12_granted(uuid,uuid,text),
  private.c12_conflicted(uuid,private.c11_needs,private.c12_cases,boolean),private.c12_intake_guard(),private.c12_intake_event(),
  private.c12_staff_session(uuid,uuid,boolean,bigint,uuid,text),
  private.c12_staff_case(uuid,text,private.c11_needs,private.c12_cases),
  private.c12_projection(private.c11_needs,private.c12_cases,text),
  public.c12_needs_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.c12_needs_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,jsonb,uuid) to service_role;

-- Only the recipient-bound native inbox can render a case event. No notes or people
-- are projected into the inbox, nor is any notification sent outside the app.
alter table feed_data.notifications add column community_need_event_id uuid references private.c12_events(id),
  add constraint c12_notice_shape check ((kind='community_need_notice')=(community_need_event_id is not null)
    and (community_need_event_id is null or (actor_id is null and post_id is null and comment_id is null))),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice','community_need_notice'));

create function private.c12_notify_event() returns trigger language plpgsql set search_path='' as $$
begin
  if private.c12_enabled() and new.action in ('submit','withdraw','request_information','assign_review','accept',
    'supported','insufficient_evidence','not_supported','challenge','uphold_challenge','return_challenge','close') then
    insert into feed_data.notifications(recipient_id,kind,community_need_event_id,dedupe)
      select n.author_id,'community_need_notice',new.id,'need:'||new.id::text
      from private.c11_needs n where n.id=new.need_id and n.author_id is not null
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end
$$;
revoke all on function private.c12_notify_event() from public,anon,authenticated,service_role;
create trigger c12_notify_event after insert on private.c12_events for each row execute function private.c12_notify_event();
create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='community_need_notice' then private.c12_enabled() and private.institution_actor(n.recipient_id)
      and exists(select from private.c12_events e join private.c11_needs c on c.id=e.need_id
        where e.id=n.community_need_event_id and c.author_id=n.recipient_id)
    when n.kind='event_notice' then exists (select 1 from feed_data.events e where e.id=n.community_event_id
        and feed_data.f25_event_visible(e) and (n.actor_id is null or (not feed_data.blocked_pair(n.recipient_id,n.actor_id)
          and not exists(select 1 from feed_data.member_mutes m where m.actor_id=n.recipient_id and m.target_id=n.actor_id))))
      when n.kind='poll_event' then private.poll_notice_visible(n.poll_event_id,n.recipient_id)
    when n.kind='project_operation' then private.project_operation_notice_visible(n.project_operation_event_id,n.recipient_id)
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
    when n.kind='organization_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_role_audit a where a.id=n.organization_role_event_id and a.subject_id=n.recipient_id)
    when n.kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected') then
      feed_data.author_active(n.recipient_id) and exists(select 1 from private.project_events e
        join private.community_projects p on p.id=e.project_id where e.id=n.project_event_id and e.recipient_id=n.recipient_id
          and (case when e.action='assign' then p.status='under_review' and p.reviewer_id=n.recipient_id
            and private.project_reviewer(p,n.recipient_id)
            else private.project_owner_access(p,n.recipient_id,'submit') or private.project_owner_access(p,n.recipient_id,'view_private') end))
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind in ('post_mention','post_repost','post_quote') then
      not exists(select from feed_data.member_mutes where actor_id=n.recipient_id and target_id=n.actor_id)
      and exists(select from feed_data.posts p where p.id=n.post_id
        and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        and case n.kind
          when 'post_mention' then feed_data.f24_allows_mention(n.recipient_id,n.actor_id) and exists(select from feed_data.social_mentions m
            where m.post_id=p.id and m.comment_id is not distinct from n.comment_id and m.member_id=n.recipient_id)
            and (n.comment_id is null or exists(select from feed_data.comments c where c.id=n.comment_id
              and feed_data.comment_visible(c) and (c.parent_id is null or exists(select from feed_data.comments parent
                where parent.id=c.parent_id and feed_data.comment_visible(parent)))))
          when 'post_repost' then feed_data.f21_shareable(p) and exists(select from feed_data.reposts r
            where r.post_id=p.id and r.actor_id=n.actor_id)
          else exists(select from feed_data.post_quotes q join feed_data.posts source on source.id=q.source_id
            where q.post_id=p.id and source.author_id=n.recipient_id and feed_data.f21_shareable(source))
        end)
    when n.kind='follow_requested' then exists(select from feed_data.follow_requests r
      where r.requester_id=n.actor_id and r.target_id=n.recipient_id and n.dedupe='follow_requested:'||r.id::text)
    when n.kind='follow_approved' then exists(select from feed_data.member_follows f
      where f.follower_id=n.recipient_id and f.target_id=n.actor_id and f.explicitly_approved_at is not null)
    when n.kind='new_follower' then feed_data.follower_visible(n.actor_id)
      and feed_data.follower_visible(n.recipient_id) and exists(
        select 1 from feed_data.member_follows where follower_id=n.actor_id and target_id=n.recipient_id)
    else exists(select 1 from feed_data.posts p where p.id=n.post_id and feed_data.discussion_visible(p))
      and case when n.kind='post_reaction' then exists(
        select 1 from feed_data.post_reactions r where r.post_id=n.post_id and r.user_id=n.actor_id)
      else exists(select 1 from feed_data.comments c where c.id=n.comment_id and c.post_id=n.post_id
        and feed_data.comment_visible(c)
        and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
          and feed_data.comment_visible(parent)))) end
    end;
$$;
create or replace function public.notifications_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 30 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.created_at,'readAt',n.read_at,
    'available',n.visible,'kind',case when n.visible then n.kind end,'postId',case when n.visible then n.post_id end,
    'commentId',case when n.visible then n.comment_id end,'appealId',case when n.visible then n.appeal_id end,
    'communityNeed',case when n.visible and n.kind='community_need_notice' then (
      select jsonb_build_object('needId',e.need_id,'action',e.action) from private.c12_events e where e.id=n.community_need_event_id)
    end,'communityEvent',case when n.visible and n.kind='event_notice' then jsonb_build_object('eventId',n.community_event_id,'action',n.event_action) end,
    'pollEvent',case when n.visible and n.kind='poll_event' then (
      select jsonb_build_object('pollId',e.poll_id,'action',e.action) from private.poll_events e where e.id=n.poll_event_id)
    end,'projectOperation',case when n.visible and n.kind='project_operation' then (
      select jsonb_build_object('projectId',e.project_id,'action',e.action) from private.project_operations_events e where e.id=n.project_operation_event_id)
    end,'actor',case when n.visible then feed_data.author_projection(n.actor_id)-'avatarPath' end) order by n.created_at desc,n.id desc)
    from (
      select n.*,feed_data.notification_visible(n) as visible from (
        select x.* from feed_data.notifications x where x.recipient_id=auth.uid() and x.created_at>=now()-interval '30 days'
          and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
        order by x.created_at desc,x.id desc limit p_limit+1
      ) n
    ) n),'[]');
end;
$$;
