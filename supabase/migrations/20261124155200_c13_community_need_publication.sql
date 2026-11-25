-- Community-only publication is available only to all three disposable fixture gates.
create table private.c13_fixture (enabled boolean primary key check(enabled));
create table private.c13_publications (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null unique references private.c11_needs(id),
  revision integer not null default 0,
  state text not null default 'unrequested' check(state in
    ('unrequested','pending','published','rejected','changes_requested','challenged','hidden','removed','withdrawn','stale')),
  proposal uuid,
  live_proposal uuid,
  reviewer uuid references auth.users(id) on delete set null,
  decision uuid,
  consent_epoch integer not null default 0,
  published_at timestamptz
);
create table private.c13_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references private.c13_publications(id),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid,
  command_hash bytea,
  revision integer not null,
  action text not null,
  state text not null,
  proposal uuid references private.c13_events(id),
  finding uuid references private.c12_events(id),
  evidence_revision integer,
  content jsonb,
  audience text check(audience='community'),
  attribution boolean,
  consent_epoch integer,
  subject uuid references auth.users(id) on delete set null,
  note text,
  reason_code text,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);
alter table private.c13_publications
  add foreign key(proposal) references private.c13_events(id),
  add foreign key(live_proposal) references private.c13_events(id),
  add foreign key(decision) references private.c13_events(id);
create index c13_history on private.c13_events(publication_id, revision desc);
create index c13_assigned on private.c13_publications(reviewer,id);
create table private.c13_challenges (
  decision uuid primary key references private.c13_events(id),
  publication_id uuid not null references private.c13_publications(id),
  outcome text check (outcome in ('upheld','returned','stale'))
);
create unique index c13_one_challenge_pending on private.c13_challenges(publication_id) where outcome is null;

alter table private.c13_fixture enable row level security;
alter table private.c13_publications enable row level security;
alter table private.c13_events enable row level security;
alter table private.c13_challenges enable row level security;
revoke all on private.c13_fixture,private.c13_publications,private.c13_events,private.c13_challenges
  from public,anon,authenticated,service_role;

create function private.c13_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c12_enabled() and exists(select from private.c13_fixture where enabled)
$$;

create function private.c13_current(n private.c11_needs,r private.c12_cases,f uuid,v integer)
returns boolean language sql stable set search_path='' as $$
  select n.status='submitted' and n.revision=v and r.state='supported' and r.finding_id=f
    and exists(select from private.c12_events e where e.id=f and e.need_id=n.id and e.state='supported'
      and e.action='supported' and e.evidence_revision=v)
$$;

create function private.c13_independent(candidate_actor uuid,n private.c11_needs,r private.c12_cases,
  snapshot private.c13_events, contested private.c13_events)
returns boolean language sql stable set search_path='' as $$
  select private.c12_granted(candidate_actor,n.community_id,'review') and not private.c12_conflicted(candidate_actor,n,r,false)
    and candidate_actor is distinct from r.reviewer and candidate_actor is distinct from contested.actor
    and not exists(select from private.c12_events e where e.need_id=n.id
      and ((e.id=snapshot.finding and e.actor_id=candidate_actor) or (e.action='assign_triage' and e.subject_id=candidate_actor)))
    and not exists(select from private.c13_events e where e.publication_id=snapshot.publication_id
      and e.proposal=snapshot.id and e.actor=candidate_actor and e.action in ('approve','reject','request_correction','uphold','return'))
$$;

create function private.c13_public_view(p private.c13_publications,n private.c11_needs,s private.c13_events,viewer uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'content',s.content,'publishedAt',p.published_at,
    'attribution',case when s.attribution and s.consent_epoch=p.consent_epoch
      and feed_data.community_member(n.community_id,n.author_id) and private.institution_actor(n.author_id)
      and not feed_data.blocked_pair(viewer,n.author_id)
      then (select jsonb_build_object('username',x.username,'displayName',x.display_name) from public.profiles x
        where x.user_id=n.author_id and feed_data.f24_identity(x,null)) end)
$$;

create function private.c13_status(p private.c13_publications,n private.c11_needs,r private.c12_cases, lane text)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'revision',coalesce(p.revision,0),'state',coalesce(p.state,'unrequested'),
    'evidenceRevision',n.revision,'finding',r.finding_id,'published',p.live_proposal is not null,
    'deadline',(select e.happened_at + interval '14 days' from private.c13_events e
      where p.state='rejected' and e.id=p.decision and not exists(select from private.c13_challenges c where c.decision=e.id)),
    'canRequest',coalesce(private.c13_current(n,r,r.finding_id,n.revision),false),
    'snapshot',case when lane in ('member','review') then
      (select jsonb_build_object('content',e.content,'attribution',e.attribution and e.consent_epoch=p.consent_epoch,
        'evidenceRevision',e.evidence_revision) from private.c13_events e where e.id=p.proposal) end,
    'history',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'state',e.state,'at',e.happened_at,
      'reason',case when lane='review' then e.note end,'code',e.reason_code)
      order by e.revision desc),'[]'::jsonb) from
      (select x.* from private.c13_events x where x.publication_id=p.id
        and (lane<>'member' or x.action not in ('assign','assign_challenge'))
        order by revision desc limit 40) e))
$$;

-- Preserve evidence and decisions when an approved finding stops being current.
create function private.c13_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare n private.c11_needs; r private.c12_cases; p private.c13_publications; s private.c13_events;
begin
  if tg_table_name='c11_needs' then
    n:=new;
    select * into r from private.c12_cases where need_id=n.id;
  else
    r:=new;
    select * into n from private.c11_needs where id=r.need_id;
  end if;
  select * into p from private.c13_publications where need_id=n.id for update;
  if p.id is null or p.state in ('stale','removed','withdrawn') then return new; end if;
  select * into s from private.c13_events where id=p.proposal;
  if s.id is not null and not coalesce(private.c13_current(n,r,s.finding,s.evidence_revision),false) then
    update private.c13_challenges set outcome='stale' where publication_id=p.id and outcome is null;
    update private.c13_publications set state='stale',reviewer=null,live_proposal=null,revision=p.revision+1 where id=p.id;
    insert into private.c13_events(publication_id,revision,action,state,proposal)
      values(p.id,p.revision+1,'publication_stale','stale',s.id);
  end if;
  return new;
end
$$;
create trigger c13_evidence_visibility after update of revision,status on private.c11_needs for each row execute function private.c13_invalidate();
create trigger c13_finding_visibility after update of state,finding_id on private.c12_cases for each row execute function private.c13_invalidate();


create function public.c13_publication_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_lane text,p_id uuid,p_room uuid,p_category text,p_after uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  n private.c11_needs; r private.c12_cases; p private.c13_publications;
  s private.c13_events; contested private.c13_events; prior private.c13_events;
  a text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; rationale text:=trim(p_command->>'note');
  next_id uuid:=gen_random_uuid(); contents jsonb:=p_command->'content'; digest bytea; moment timestamptz;
  safe_reason text:=p_command->>'reason'; requires_finding boolean;
begin
  if not private.c13_enabled() then raise exception 'publication disabled' using errcode='C1301'; end if;
  if p_lane in ('directory','member') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false)
    then raise exception 'member required' using errcode='42501'; end if;
  elsif p_lane not in ('admin','review','triage') or not coalesce(
    private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false) then
    raise exception 'workspace required' using errcode='42501';
  end if;
  if p_lane='directory' then
    if p_command is not null or p_room is null or not feed_data.community_member(p_room,p_actor) then
      raise exception 'publication unavailable' using errcode='C1302';
    end if;
    return jsonb_build_object('items',coalesce((
      select jsonb_agg(x.item order by x.id desc) from (
        select pub.id,private.c13_public_view(pub,need,approved,p_actor) item
        from private.c13_publications pub join private.c11_needs need on need.id=pub.need_id
        join private.c12_cases evidence on evidence.need_id=need.id
        join private.c13_events approved on approved.id=pub.live_proposal
        where need.community_id=p_room and (p_id is null or pub.id=p_id)
          and (p_category is null or approved.content->>'category'=p_category)
          and (p_after is null or pub.id<p_after)
          and private.c13_current(need,evidence,approved.finding,approved.evidence_revision)
        order by pub.id desc limit 21
      ) x
    ),'[]'::jsonb));
  end if;
  if p_id is null then
    if p_lane='member' or p_command is not null then raise exception 'case required' using errcode='42501'; end if;
    return jsonb_build_object('items',coalesce((
      select jsonb_agg(x.item order by x.id desc) from (
        select pub.id,jsonb_build_object('id',pub.id,'revision',pub.revision,'state',pub.state,'published',pub.live_proposal is not null,
          'snapshot',case when p_lane='review' then jsonb_build_object('content',candidate.content,
            'attribution',candidate.attribution and candidate.consent_epoch=pub.consent_epoch,
            'evidenceRevision',candidate.evidence_revision) end) item
        from private.c13_publications pub join private.c11_needs need on need.id=pub.need_id
        join private.c12_cases evidence on evidence.need_id=need.id join private.c13_events candidate on candidate.id=pub.proposal
        left join private.c13_events decision on decision.id=pub.decision and pub.state='challenged'
        where (p_after is null or pub.id<p_after) and (
          (p_lane='admin' and (pub.state in ('pending','challenged') or pub.live_proposal is not null))
          or (p_lane='review' and pub.state in ('pending','challenged') and pub.reviewer=p_actor
            and private.c13_current(need,evidence,candidate.finding,candidate.evidence_revision)
            and private.c13_independent(p_actor,need,evidence,candidate,decision))
          or (p_lane='triage' and pub.live_proposal is not null and private.c12_granted(p_actor,need.community_id,'triage')))
        order by pub.id desc limit 21
      ) x
    ),'[]'::jsonb));
  end if;
  if p_command is not null then
    if p_command->'confirmed' is distinct from 'true'::jsonb or req is null or a is null
      or (rationale is not null and (char_length(rationale) not between 5 and 1500 or rationale ~ '[[:cntrl:]]'))
    then raise exception 'invalid publication command' using errcode='23514'; end if;
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
    -- Share C1.2's mutation ordering, then lock the publication.
    perform pg_advisory_xact_lock(20261124,1551);
    if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
      or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
    then raise exception 'session required' using errcode='42501'; end if;
  end if;
  if p_lane='member' then
    select * into n from private.c11_needs where id=p_id and author_id=p_actor and status<>'draft';
    select * into p from private.c13_publications where need_id=n.id;
  else
    select * into p from private.c13_publications where id=p_id;
    select * into n from private.c11_needs where id=p.need_id;
  end if;
  select * into r from private.c12_cases where need_id=n.id;
  if n.id is null
    or (p_lane='triage' and not coalesce(private.c12_granted(p_actor,n.community_id,'triage'),false))
  then raise exception 'publication unavailable' using errcode='C1302'; end if;
  select * into s from private.c13_events where id=p.proposal;
  if p.state='challenged' then select * into contested from private.c13_events where id=p.decision; end if;
  if p_command is null then
    if p_lane='review' and (p.reviewer is distinct from p_actor or not coalesce(private.c13_independent(p_actor,n,r,s,contested),false)) then
      raise exception 'publication unavailable' using errcode='C1302';
    end if;
    return private.c13_status(p,n,r,p_lane);
  end if;
  digest:=extensions.digest(jsonb_build_array(p_lane,p_id,p_command)::text,'sha256');
  select * into prior from private.c13_events where actor=p_actor and request_id=req;
  if prior.id is not null then
    if prior.command_hash is distinct from digest then raise exception 'command changed' using errcode='C1303'; end if;
    return case when p_lane='review' and p.reviewer is distinct from p_actor
      then jsonb_build_object('id',p.id,'revision',prior.revision,'state',prior.state)
      else private.c13_status(p,n,r,p_lane) end;
  end if;
  if p_lane='review' and p.reviewer is distinct from p_actor then raise exception 'publication unavailable' using errcode='C1302'; end if;
  if coalesce(p.revision,0) is distinct from (p_command->>'expectedRevision')::integer
    then raise exception 'publication revision changed' using errcode='C1303'; end if;
  moment:=clock_timestamp();
  requires_finding:=a in ('assign','assign_challenge','approve','reject','request_correction','challenge','uphold','return');
  if requires_finding and not coalesce(private.c13_current(n,r,s.finding,s.evidence_revision),false) then
    raise exception 'evidence changed' using errcode='C1303';
  end if;
  if a='request' and p_lane='member' then
    if p.state in ('pending','challenged') or p_command->>'audience' is distinct from 'community'
      or p_command->'attribution' is null or jsonb_typeof(p_command->'attribution')<>'boolean'
      or not coalesce(private.c13_current(n,r,(p_command->>'finding')::uuid,(p_command->>'expectedEvidenceRevision')::integer),false)
    then raise exception 'publication request unavailable' using errcode='C1303'; end if;
    perform private.m23_require(p_actor,'community_need_submit','community',n.community_id);
    perform 1 from feed_data.community_memberships m where m.community_id=n.community_id and m.user_id=p_actor for key share;
    if not found then raise exception 'current membership required' using errcode='42501'; end if;
    if jsonb_typeof(contents) is distinct from 'object' or contents ? 'references'
      or char_length(contents->>'description')>1200 or contents::text ~* '(https?://|www\.|@|([0-9][ .()+-]*){7,}|[0-9]+[.][0-9]{2,}[ ,;-]+-?[0-9]+[.][0-9]{2,})'
    then raise exception 'invalid publication summary' using errcode='23514'; end if;
    perform private.c11_validate_content(contents||'{"references":[]}'::jsonb,true);
    if p.id is null then insert into private.c13_publications(need_id) values(n.id) returning * into p; end if;
    p.state:='pending'; p.reviewer:=null; p.decision:=null;
  elsif a in ('assign','assign_challenge') and p_lane='admin' and rationale is not null
    and ((a='assign' and p.state='pending') or (a='assign_challenge' and p.state='challenged')) then
    if target is null or target=p_actor or not coalesce(private.c13_independent(target,n,r,s,contested),false) then
      raise exception 'independent reviewer required' using errcode='42501';
    end if;
    p.reviewer:=target;
  elsif a in ('approve','reject','request_correction') and p_lane='review' and p.state='pending' and rationale is not null
    and coalesce(private.c13_independent(p_actor,n,r,s,contested),false) then
    if a='approve' then
      if not private.institution_actor(n.author_id) then raise exception 'author unavailable' using errcode='42501'; end if;
      perform private.m23_require(n.author_id,'community_need_submit','community',n.community_id);
      perform 1 from feed_data.community_memberships m where m.community_id=n.community_id and m.user_id=n.author_id for key share;
      if not found then raise exception 'current membership required' using errcode='42501'; end if;
      p.state:='published'; p.live_proposal:=p.proposal; p.published_at:=moment;
    else
      if not coalesce(safe_reason in ('privacy','clarity','evidence'),false) then
        raise exception 'safe reason required' using errcode='23514';
      end if;
      p.state:=case when a='reject' then 'rejected' else 'changes_requested' end;
    end if;
    p.decision:=next_id;
  elsif a='challenge' and p_lane='member' and p.state='rejected' and rationale is not null then
    select * into contested from private.c13_events where id=p.decision and action='reject';
    if contested.id is null or moment>=contested.happened_at+interval '14 days'
      or exists(select from private.c13_challenges where decision=contested.id)
    then raise exception 'challenge unavailable' using errcode='C1303'; end if;
    insert into private.c13_challenges(decision,publication_id) values(contested.id,p.id);
    p.state:='challenged'; p.reviewer:=null;
  elsif a in ('uphold','return') and p_lane='review' and p.state='challenged' and rationale is not null
    and coalesce(private.c13_independent(p_actor,n,r,s,contested),false) then
    update private.c13_challenges set outcome=case when a='uphold' then 'upheld' else 'returned' end
      where decision=contested.id and outcome is null;
    if not found then raise exception 'challenge unavailable' using errcode='C1303'; end if;
    p.state:=case when a='uphold' then 'rejected' else 'pending' end;
    p.reviewer:=null;
  elsif a='revoke_attribution' and p_lane='member' and p.proposal is not null then
    p.consent_epoch:=p.consent_epoch+1;
  elsif a='withdraw' and p_lane='member' and p.proposal is not null and p.state<>'withdrawn' then
    p.state:='withdrawn'; p.live_proposal:=null; p.reviewer:=null;
    update private.c13_challenges set outcome='stale' where publication_id=p.id and outcome is null;
  elsif a in ('hide','remove') and rationale is not null and p.live_proposal is not null
    and (p_lane='admin' or (a='hide' and p_lane='triage')) then
    p.state:=case when a='hide' then 'hidden' else 'removed' end;
    p.live_proposal:=null; p.reviewer:=null;
    update private.c13_challenges set outcome='stale' where publication_id=p.id and outcome is null;
  else
    raise exception 'publication command unavailable' using errcode='42501';
  end if;

  insert into private.c13_events(id,publication_id,actor,workspace,request_id,command_hash,revision,
    action,state,proposal,finding,evidence_revision,content,audience,attribution,consent_epoch,subject,note,reason_code,happened_at)
  values(next_id,p.id,p_actor,p_workspace,req,digest,p.revision+1,a,p.state,p.proposal,
    case when a='request' then r.finding_id else s.finding end,
    case when a='request' then n.revision else s.evidence_revision end,
    case when a='request' then contents end,case when a='request' then 'community' end,
    case when a='request' then (p_command->>'attribution')::boolean end,
    p.consent_epoch,target,rationale,case when a in ('reject','request_correction') then safe_reason end,moment);
  if a='request' then p.proposal:=next_id; end if;
  update private.c13_publications set revision=p.revision+1,state=p.state,proposal=p.proposal,live_proposal=p.live_proposal,
    reviewer=p.reviewer,decision=p.decision,consent_epoch=p.consent_epoch,published_at=p.published_at where id=p.id returning * into p;
  return private.c13_status(p,n,r,p_lane);
end
$$;


create function private.c13_send_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare event_id uuid; n private.c11_needs;
begin
  if not private.c13_enabled() or new.action not in
    ('request','approve','reject','request_correction','hide','remove','withdraw','challenge','uphold','return','publication_stale') then
    return new;
  end if;
  select need.* into n from private.c11_needs need join private.c13_publications p on p.need_id=need.id
    where p.id=new.publication_id;
  if n.author_id is null then return new; end if;
  insert into private.c12_events(need_id,community_id,action,state)
    values(n.id,n.community_id,case when new.action='publication_stale' then new.action else 'publication_'||new.action end,new.state)
    returning id into event_id;
  insert into feed_data.notifications(recipient_id,kind,community_need_event_id,dedupe)
    values(n.author_id,'community_need_notice',event_id,'need:'||event_id::text);
  return new;
end
$$;
create trigger c13_publication_notice after insert on private.c13_events for each row execute function private.c13_send_notice();

revoke all on function private.c13_enabled(),private.c13_current(private.c11_needs,private.c12_cases,uuid,integer),
  private.c13_independent(uuid,private.c11_needs,private.c12_cases,private.c13_events,private.c13_events),
  private.c13_public_view(private.c13_publications,private.c11_needs,private.c13_events,uuid),
  private.c13_status(private.c13_publications,private.c11_needs,private.c12_cases,text),
  private.c13_invalidate(),private.c13_send_notice(),
  public.c13_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c13_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,text,uuid,jsonb) to service_role;
