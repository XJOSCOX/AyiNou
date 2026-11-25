-- This fixture is deliberately unseeded. Both C2 fixture gates must be open.
create table private.c22_fixture (enabled boolean primary key check(enabled));

create table private.c22_authority (
  department text not null references public.departments(code),
  actor uuid not null references auth.users(id) on delete cascade,
  lane text not null check(lane in ('initial','challenge','assign')),
  version integer not null check(version>0),
  state text not null check(state in ('active','suspended','revoked')),
  expires_at timestamptz not null,
  primary key(department,actor,lane)
);

-- Dedicated Outcome credentials cannot be used to open verification or moderation.
create table private.c22_workspaces (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  lane text not null check(lane in ('admin','review')),
  expires_at timestamptz not null,
  unique(actor,session_id,lane)
);

create table private.c22_cases (
  id uuid primary key references private.c21_outcome_requests(id) on delete cascade,
  department text not null references public.departments(code),
  version integer not null default 1 check(version>0),
  revision integer not null default 1 check(revision>0),
  state text not null default 'queued' check(state in
    ('queued','clarification','decided','challenge','reassessment','withdrawn'))
);
create index c22_department_queue on private.c22_cases(department,state,id);

create table private.c22_revisions (
  case_id uuid not null references private.c22_cases(id) on delete cascade,
  revision integer not null check(revision>0),
  submitted_revision integer not null check(submitted_revision>0),
  result jsonb not null,
  manifest jsonb not null check(jsonb_typeof(manifest)='array'),
  explanation text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(case_id,revision)
);

create table private.c22_releases (
  case_id uuid not null,
  revision integer not null,
  generation integer not null check(generation>0),
  released_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(case_id,revision,generation),
  foreign key(case_id,revision) references private.c22_revisions on delete cascade
);
create unique index c22_current_release on private.c22_releases(case_id,revision) where revoked_at is null;

create table private.c22_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  revision integer not null,
  reviewer uuid references auth.users(id) on delete set null,
  lane text not null check(lane in ('initial','challenge','reassessment')),
  grant_version integer not null,
  deadline timestamptz not null,
  accepted_at timestamptz,
  ended_at timestamptz,
  foreign key(case_id,revision) references private.c22_revisions on delete cascade
);
create unique index c22_unended_assignment on private.c22_assignments(case_id) where ended_at is null;
create index c22_reviewer_assignments on private.c22_assignments(reviewer,case_id) where ended_at is null;

create table private.c22_findings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  revision integer not null,
  release_generation integer not null,
  reviewer uuid references auth.users(id) on delete set null,
  lane text not null check(lane in ('initial','challenge','reassessment')),
  classification text not null check(classification in ('supported','partially_supported','insufficient_evidence','not_supported')),
  explanation text not null,
  limitations text not null,
  measurement jsonb,
  available_at timestamptz not null default clock_timestamp(),
  foreign key(case_id,revision,release_generation) references private.c22_releases on delete cascade,
  unique(case_id,revision,lane)
);

create table private.c22_challenges (
  finding_id uuid primary key references private.c22_findings(id) on delete cascade,
  explanation text not null,
  filed_at timestamptz not null default clock_timestamp(),
  resolution text check(resolution in ('upheld','revised','returned','reassessed')),
  decision_reason text,
  decided_at timestamptz,
  new_finding uuid references private.c22_findings(id) on delete set null
);

create table private.c22_conflicts (
  case_id uuid not null references private.c22_cases(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  primary key(case_id,actor)
);

create table private.c22_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references private.c22_cases(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  target uuid references auth.users(id) on delete set null,
  department text not null references public.departments(code),
  workspace uuid,
  request_id uuid,
  command_hash bytea,
  action text not null,
  version integer,
  revision integer,
  note text,
  detail jsonb,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);
create index c22_case_events on private.c22_events(case_id,happened_at desc,id);
create index c22_recipient_events on private.c22_events(target,happened_at desc,id);

alter table private.c22_fixture enable row level security;
alter table private.c22_authority enable row level security;
alter table private.c22_workspaces enable row level security;
alter table private.c22_cases enable row level security;
alter table private.c22_revisions enable row level security;
alter table private.c22_releases enable row level security;
alter table private.c22_assignments enable row level security;
alter table private.c22_findings enable row level security;
alter table private.c22_challenges enable row level security;
alter table private.c22_conflicts enable row level security;
alter table private.c22_events enable row level security;
revoke all on private.c22_fixture,private.c22_authority,private.c22_workspaces,private.c22_cases,
  private.c22_revisions,private.c22_releases,private.c22_assignments,private.c22_findings,
  private.c22_challenges,private.c22_conflicts,private.c22_events from public,anon,authenticated,service_role;

create function private.c22_enabled() returns boolean language sql stable set search_path='' as $$
  select exists(select from private.c21_outcome_fixture where enabled)
    and exists(select from private.c22_fixture where enabled)
$$;

create function private.c22_department(p private.community_projects)
returns text language sql stable set search_path='' as $$
  select case when count(distinct x.code)=1 then min(x.code) end
  from private.project_execution e join private.project_revisions r
    on r.project_id=e.project_id and r.revision=e.approved_revision
  cross join lateral (
    select r.department as code union all
    select c.department_code from feed_data.communities c
      where c.id in (p.community_id,p.association_id) and c.kind='department'
  ) x where e.project_id=p.id and r.proposal->>'country'='HT'
$$;

create function private.c22_identity(p_actor uuid) returns boolean language sql stable set search_path='' as $$
  select coalesce(feed_data.author_active(p_actor) and private.member_onboarding_access(p_actor)
    and private.project_identity_state(p_actor)='verified' and private.verified_totp(p_actor),false)
$$;

create function private.c22_grant(p_actor uuid,p_department text,p_lane text) returns integer
language sql stable set search_path='' as $$
  select a.version from private.c22_authority a where a.actor=p_actor and a.department=p_department
    and a.lane=p_lane and a.state='active' and a.expires_at>clock_timestamp() and private.c22_identity(p_actor)
$$;

create function private.c22_coordinator(p_actor uuid,p_department text) returns boolean
language sql stable set search_path='' as $$
  select private.platform_founder(p_actor) or
    (exists(select from public.role_assignments where user_id=p_actor and role='administrator')
      and private.c22_grant(p_actor,p_department,'assign') is not null)
$$;

create function private.c22_conflicted(p private.community_projects,r private.c21_outcome_requests,p_actor uuid,p_lane text,
  p_assignment uuid default null)
returns boolean language sql stable set search_path='' as $$
  select p_actor is null or p_actor=r.requester_id or private.project_conflicted(p,p_actor)
    or feed_data.blocked_pair(p_actor,r.requester_id) or feed_data.blocked_pair(p_actor,p.submitted_by)
    or exists(select from private.project_team t where t.project_id=p.id and t.user_id=p_actor)
    or exists(select from private.project_execution e where e.project_id=p.id and e.operator_id=p_actor)
    or p_actor is not distinct from p.reviewer_id
    or exists(select from private.project_events e where e.project_id=p.id and e.actor_id=p_actor
      and e.action in ('approve','request_changes','reject','release'))
    or exists(select from private.project_milestones m where m.id=r.source_id and m.project_id=p.id
      and p_actor in (m.creator_id,m.reviewer_id,m.submitter_id,m.responsible_id))
    or exists(select from private.project_progress_entries e where e.id=r.source_id and e.project_id=p.id
      and p_actor in (e.author_id,e.reviewer_id))
    or exists(select from private.project_metric_observations o where o.id=r.source_id and o.project_id=p.id and o.reporter_id=p_actor)
    or exists(select from private.c14_links l where l.project_id=p.id and
      (p_actor in (l.author,l.organizer,l.reviewer) or exists(select from private.c14_events e
        where e.link_id=l.id and p_actor in (e.actor,e.subject))))
    or exists(select from private.c22_conflicts c where c.case_id=r.id and c.actor=p_actor)
    or (p_lane<>'initial' and exists(select from private.c22_events e where e.case_id=r.id and e.actor=p_actor
      and e.action in ('evidence','image','clarify','finding','uphold','revise','return')
      and (p_assignment is null or e.detail->>'assignmentId' is distinct from p_assignment::text)))
$$;

create function private.c22_source(p private.community_projects,r private.c21_outcome_requests)
returns jsonb language sql stable set search_path='' as $$
  select s.result from private.c21_sources(p,r.requester_id,private.project_execution_role(p,r.requester_id),
    r.source_kind,r.source_id,null,1) s
  where s.revision=r.source_revision and (s.result-'evidence')=(r.result-'evidence')
$$;

create function private.c22_assignment_live(a private.c22_assignments,c private.c22_cases,
  r private.c21_outcome_requests,p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select coalesce(a.ended_at is null and a.deadline>clock_timestamp() and a.revision=c.revision
    and private.c22_grant(a.reviewer,c.department,case when a.lane='challenge' then 'challenge' else 'initial' end)=a.grant_version
    and not private.c22_conflicted(p,r,a.reviewer,a.lane,a.id)
    and private.c22_department(p)=c.department and r.status='submitted'
    and private.project_progress_manager(private.project_execution_role(p,r.requester_id)),false)
$$;

create function private.c22_capture_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.c21_outcome_requests; p private.community_projects; department_code text;
begin
  if new.action not in ('submit','withdraw') or not private.c22_enabled() then return new; end if;
  select * into r from private.c21_outcome_requests where id=new.case_id;
  if new.action='withdraw' then
    update private.c22_cases set state='withdrawn',version=version+1 where id=r.id;
    update private.c22_assignments set ended_at=clock_timestamp() where case_id=r.id and ended_at is null;
    update private.c22_releases set revoked_at=clock_timestamp() where case_id=r.id and revoked_at is null;
    return new;
  end if;
  select * into p from private.community_projects where id=r.project_id;
  department_code:=private.c22_department(p);
  if department_code is not null then
    insert into private.c22_cases(id,department) values(r.id,department_code);
    insert into private.c22_revisions(case_id,revision,submitted_revision,result,manifest,explanation)
      values(r.id,1,r.revision,r.result-'evidence',r.result->'evidence',r.explanation);
    insert into private.c22_events(case_id,actor,department,action,version,revision)
      values(r.id,r.requester_id,department_code,'submitted',1,1);
  end if;
  return new;
end
$$;
create trigger c22_capture_submission after insert on private.c21_outcome_history
  for each row execute function private.c22_capture_submission();

create function private.c22_live_manifest(m jsonb,s jsonb) returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(m)='array' and jsonb_array_length(m)<=30 and s is not null
    and (s->'evidence') @> m,false)
$$;

create function private.c22_findings_view(c private.c22_cases,p_current boolean)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'lane',f.lane,
    'classification',f.classification,'explanation',f.explanation,'limitations',f.limitations,'measurement',f.measurement,
    'availableAt',f.available_at,'current',p_current and c.state='decided' and f.revision=c.revision
      and (f.lane<>'initial' or q.new_finding is null)
      and exists(select from private.c22_releases l where l.case_id=f.case_id and l.revision=f.revision
        and l.generation=f.release_generation and l.revoked_at is null),
    'challengeUntil',case when f.lane='initial' and f.classification<>'supported' and q.finding_id is null
      and c.state='decided' and f.revision=c.revision and f.available_at+interval '14 days'>clock_timestamp()
      then f.available_at+interval '14 days' end,
    'challenge',case when q.finding_id is not null then jsonb_build_object('filedAt',q.filed_at,
      'resolution',q.resolution,'reason',q.decision_reason,'decidedAt',q.decided_at) end)
    order by f.available_at desc,f.id desc),'[]'::jsonb)
  from (select * from private.c22_findings x where x.case_id=c.id order by available_at desc,id desc limit 80) f
  left join private.c22_challenges q on q.finding_id=f.id
$$;

create function public.c22_reviews_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.c22_cases; r private.c21_outcome_requests; p private.community_projects; v private.c22_revisions;
  a private.c22_assignments; g private.c22_authority; w private.c22_workspaces; rel private.c22_releases;
  f private.c22_findings; q private.c22_challenges; e private.c22_events;
  moment timestamptz:=clock_timestamp(); ends timestamptz; case_ref uuid; target_actor uuid; request_key uuid;
  scope text; purpose text; expected integer; grant_revision integer; chosen_lane text; actor_role text;
  note text; limits text; finding_class text; execution text; stage text; source jsonb; manifest jsonb;
  command_hash bytea; payload jsonb; measurement jsonb; amount numeric; output_id uuid; recipient uuid;
  can_review boolean; live boolean; released boolean; member_lane boolean;
begin
  if not private.c22_enabled() then raise exception 'review disabled' using errcode='C2201'; end if;
  if p_lane is null or p_lane not in ('admin','review','member')
    or p_action is null or p_action not in ('open','queue','roster','grant','suspend','revoke','notices','read',
      'assign','release_assignment','accept','recuse','release_evidence','revoke_evidence','evidence','image',
      'clarify','correct','finding','challenge','uphold','revise','return')
    or jsonb_typeof(p_input) is distinct from 'object'
  then raise exception 'invalid review command' using errcode='23514'; end if;
  member_lane:=p_lane='member';
  if p_action not in ('queue','roster','read','notices') then
    -- Serialize reviewer authority, evidence access and decisions with each other and account enforcement.
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform pg_advisory_xact_lock(20261125,220);
    perform private.s2b_lock_actor(p_actor,p_session);
    moment:=clock_timestamp();
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false)
  then raise exception 'session unavailable' using errcode='42501'; end if;

  if not member_lane then
    if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    then raise exception 'recent MFA required' using errcode='O5001'; end if;
    if (p_lane='review' and not exists(select from private.c22_authority g0 where g0.actor=p_actor
          and g0.lane in ('initial','challenge') and private.c22_grant(p_actor,g0.department,g0.lane) is not null))
      or (p_lane='admin' and not private.platform_founder(p_actor)
        and not exists(select from private.c22_authority g0 where g0.actor=p_actor and g0.lane='assign'
          and private.c22_coordinator(p_actor,g0.department)))
    then raise exception 'review workspace unavailable' using errcode='42501'; end if;
    if p_action='open' then
      select least(moment+interval '5 minutes',to_timestamp(p_totp)+interval '15 minutes',s.not_after,
        private.s2a_deadline(s.created_at,coalesce(z.privileged_at_sign_in,false) or private.s2a_leadership(p_actor),
          coalesce(z.remembered,false)))
      into ends from auth.sessions s left join private.s2a_session_policy z on z.session_id=s.id
      where s.id=p_session and s.user_id=p_actor;
      if ends is null or ends<=moment then raise exception 'workspace unavailable' using errcode='42501'; end if;
      select * into w from private.c22_workspaces where actor=p_actor and session_id=p_session and lane=p_lane;
      if not found or w.expires_at<=moment then
        insert into private.c22_workspaces(actor,session_id,lane,expires_at) values(p_actor,p_session,p_lane,ends)
          on conflict(actor,session_id,lane) do update set id=gen_random_uuid(),expires_at=excluded.expires_at returning * into w;
        insert into private.s2b_security_events(actor_id,scope_ref,action,mfa_verified_at)
          values(p_actor,w.id,'workflow_created',to_timestamp(p_totp));
      end if;
      return jsonb_build_object('id',w.id,'expiresAt',w.expires_at);
    end if;
    if not exists(select from private.c22_workspaces where id=p_workspace and actor=p_actor
      and session_id=p_session and lane=p_lane and expires_at>moment)
    then raise exception 'workspace unavailable' using errcode='42501'; end if;
  elsif p_action='open' then
    raise exception 'workspace unavailable' using errcode='42501';
  end if;

  scope:=p_input->>'department';
  expected:=(p_input->>'expectedVersion')::integer;
  request_key:=(p_input->>'requestId')::uuid;
  target_actor:=(p_input->>'target')::uuid;
  purpose:=p_input->>'purpose';
  case_ref:=(p_input->>'caseId')::uuid;
  note:=btrim(p_input->>'note');

  if p_action='notices' and member_lane then
    return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'at',x.happened_at,
      'projectId',case when x.action<>'assign' then x.project_id end,
      'caseId',case when x.action<>'assign' then x.case_id end) order by x.happened_at desc,x.id desc)
      from (select e0.*,r0.project_id from private.c22_events e0
        join private.c21_outcome_requests r0 on r0.id=e0.case_id
        join private.c22_cases c0 on c0.id=r0.id
        join private.community_projects p0 on p0.id=r0.project_id
        where e0.target=p_actor and (
          (e0.action='assign' and exists(select from private.c22_assignments a0 where a0.id=(e0.detail->>'assignmentId')::uuid
            and private.c22_assignment_live(a0,c0,r0,p0))) or
          (r0.requester_id=p_actor and private.project_progress_manager(private.project_execution_role(p0,p_actor))
            and e0.action in ('clarify','finding','uphold','revise','return')))
        order by e0.happened_at desc,e0.id desc limit 20) x),'[]'::jsonb);
  end if;

  if p_action in ('queue','roster','grant','suspend','revoke') then
    if member_lane or scope is null or not exists(select from public.departments where code=scope)
    then raise exception 'department unavailable' using errcode='42501'; end if;
    if p_lane='admin' and not coalesce(private.c22_coordinator(p_actor,scope),false)
    then raise exception 'department unavailable' using errcode='42501'; end if;
    if p_lane='review' and not (private.c22_grant(p_actor,scope,'initial') is not null
      or private.c22_grant(p_actor,scope,'challenge') is not null)
    then raise exception 'department unavailable' using errcode='42501'; end if;

    if p_action='queue' then
      stage:=p_input->>'status';
      return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'department',x.department,'version',x.version,
          'revision',x.revision,'status',x.state) order by x.id)
        from (select c0.* from private.c22_cases c0 join private.c21_outcome_requests r0 on r0.id=c0.id
          join private.community_projects p0 on p0.id=r0.project_id
          where c0.department=scope and (stage is null or stage=c0.state)
          and (p_input->>'after' is null or c0.id>(p_input->>'after')::uuid)
          and private.project_progress_manager(private.project_execution_role(p0,r0.requester_id))
          and (p_lane='admin' or exists(select from private.c22_assignments a0 where a0.case_id=c0.id
            and a0.reviewer=p_actor and private.c22_assignment_live(a0,c0,r0,p0)))
          order by c0.id limit 21) x),'[]'::jsonb);
    end if;
    if p_lane<>'admin' then raise exception 'coordinator required' using errcode='42501'; end if;
    if p_action='roster' then
      return jsonb_build_object('canAppoint',private.platform_founder(p_actor),
        'candidates',case when private.platform_founder(p_actor) and char_length(p_input->>'search') between 2 and 60 then
          coalesce((select jsonb_agg(jsonb_build_object('actor',x.user_id,'label',coalesce(x.display_name,x.username))
            order by x.username) from (select m.* from public.profiles m where m.user_id<>p_actor
            and (strpos(lower(coalesce(m.username,'')),lower(p_input->>'search'))>0
              or strpos(lower(coalesce(m.display_name,'')),lower(p_input->>'search'))>0)
            and private.c22_identity(m.user_id) order by m.username limit 15) x),'[]'::jsonb)
          else '[]'::jsonb end,
        'grants',coalesce((select jsonb_agg(jsonb_build_object('actor',x.actor,'label',coalesce(p0.display_name,p0.username),
          'purpose',x.lane,'state',x.state,'version',x.version,'expiresAt',x.expires_at,
          'eligible',private.c22_grant(x.actor,x.department,x.lane) is not null) order by x.actor,x.lane)
        from (select * from private.c22_authority where department=scope
          and (p_input->>'after' is null or actor>(p_input->>'after')::uuid)
          order by actor,lane limit 150) x left join public.profiles p0 on p0.user_id=x.actor),'[]'::jsonb),
        'history',case when private.platform_founder(p_actor) then
          coalesce((select jsonb_agg(jsonb_build_object('action',x.action,'actor',x.actor,'target',x.target,
            'note',x.note,'at',x.happened_at,'version',x.version,'purpose',x.detail->>'purpose') order by x.happened_at desc)
          from (select * from private.c22_events where case_id is null and department=scope
            order by happened_at desc limit 40) x),'[]'::jsonb) else '[]'::jsonb end);
    end if;
    if not private.platform_founder(p_actor) or target_actor is null or target_actor=p_actor
      or purpose is null or purpose not in ('initial','challenge','assign')
    then raise exception 'Founder appointment required' using errcode='42501'; end if;
  elsif case_ref is not null then
    select * into r from private.c21_outcome_requests where id=case_ref;
    if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
    if p_action='read' then select * into p from private.community_projects where id=r.project_id;
    else
      select * into p from private.community_projects where id=r.project_id for update;
      if found then perform private.project_lock_scope(p); end if;
      select * into r from private.c21_outcome_requests where id=case_ref for update;
    end if;
    actor_role:=private.project_execution_role(p,r.requester_id);
    if not private.project_progress_manager(actor_role) or p.id is null
    then raise exception 'case unavailable' using errcode='O2003'; end if;
    if member_lane and (r.requester_id is distinct from p_actor or (p_input->>'project')::uuid is distinct from p.id)
    then raise exception 'case unavailable' using errcode='O2003'; end if;
    if p_action='read' then select * into c from private.c22_cases where id=case_ref;
    else select * into c from private.c22_cases where id=case_ref for update; end if;
    if c.id is null then
      if member_lane and p_action='read' then return jsonb_build_object('unavailable',true); end if;
      raise exception 'case unavailable' using errcode='O2003';
    end if;
    scope:=c.department;
    if p_lane='admin' and not coalesce(private.c22_coordinator(p_actor,scope),false)
    then raise exception 'case unavailable' using errcode='O2003'; end if;
    select * into v from private.c22_revisions where case_id=c.id and revision=c.revision;
    select * into a from private.c22_assignments where case_id=c.id and ended_at is null;
    select * into rel from private.c22_releases where case_id=c.id and revision=c.revision and revoked_at is null;
    select pe.status into execution from private.project_execution pe where pe.project_id=p.id;
    source:=private.c22_source(p,r);
    live:=source is not null and private.c22_department(p) is not distinct from c.department
      and r.status='submitted' and r.revision=v.submitted_revision;
    released:=rel.case_id is not null and private.c22_live_manifest(v.manifest,source);
    can_review:=live and execution in ('active','completed','archived') and
      (execution<>'archived' or private.project_completion_on(p.id) is not null);
    if p_lane='review' and request_key is not null then
      select * into e from private.c22_events where actor=p_actor and request_id=request_key and case_id=c.id;
      if found then
        if e.command_hash<>extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256')
        then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('version',e.version,'revision',e.revision);
      end if;
    end if;
    if p_lane='review' and (a.reviewer is distinct from p_actor or
      (p_action<>'recuse' and not private.c22_assignment_live(a,c,r,p)))
    then raise exception 'assignment unavailable' using errcode='O2003'; end if;

    if p_action='read' then
      payload:=jsonb_build_object('id',c.id,'status',c.state,'version',c.version,'revision',c.revision,'department',scope,
        'activeSource',live,'availableForReview',can_review,'released',released,'releaseActive',rel.case_id is not null,
        'assignment',case when a.id is not null then jsonb_build_object('id',a.id,'lane',a.lane,
          'deadline',a.deadline,'acceptedAt',a.accepted_at,'valid',private.c22_assignment_live(a,c,r,p),
          'reviewer',case when p_lane='admin' then a.reviewer end) end);
      if p_lane='member' then
        return payload||jsonb_build_object('findings',private.c22_findings_view(c,live and released),
          'evidenceOptions',source->'evidence','manifest',v.manifest,
          'clarification',case when c.state='clarification' then (select h.note from private.c22_events h
            where h.case_id=c.id and h.action='clarify' order by h.happened_at desc,h.id desc limit 1) end,
          'history',coalesce((select jsonb_agg(jsonb_build_object('revision',x.revision,'explanation',x.explanation,
            'manifest',x.manifest,'createdAt',x.created_at) order by x.revision desc)
            from (select * from private.c22_revisions where case_id=c.id order by revision desc limit 25) x),'[]'::jsonb));
      end if;
      if p_lane='admin' then
        return payload||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object(
          'action',x.action,'actor',x.actor,'target',x.target,'at',x.happened_at,'version',x.version,
          'note',case when x.action in ('assign','release_assignment','recuse') then x.note end)
          order by x.happened_at desc,x.id desc)
          from (select * from private.c22_events where case_id=c.id order by happened_at desc,id desc limit 40) x),'[]'::jsonb));
      end if;
      return payload;
    end if;
  else
    raise exception 'case unavailable' using errcode='O2003';
  end if;

  if p_action in ('evidence','image') then
    if p_lane<>'review' or not can_review or a.accepted_at is null or not released
      or expected is distinct from c.version
    then raise exception 'evidence unavailable' using errcode='42501'; end if;
    if p_action='image' then
      select jsonb_build_object('bytes',encode(i.image,'base64')) into payload
      from jsonb_array_elements(v.manifest) m join private.project_images i
        on i.project_id=p.id and i.digest=m->>'digest'
      where m->>'kind'='image' and m->>'sourceId'=p_input->>'entry'
        and m->>'revision'=p_input->>'sourceRevision' limit 1;
      if payload is null then raise exception 'evidence unavailable' using errcode='O2003'; end if;
    else
      payload:=jsonb_build_object('result',v.result,'explanation',v.explanation,'manifest',v.manifest,
        'sourceId',r.source_id,'sourceRevision',r.source_revision,'reviewRevision',v.revision);
      if a.lane='challenge' then
        payload:=payload||jsonb_build_object('challenge',(select jsonb_build_object('explanation',q0.explanation,
          'classification',f0.classification,'findingExplanation',f0.explanation,'limitations',f0.limitations)
          from private.c22_challenges q0 join private.c22_findings f0 on f0.id=q0.finding_id
          where f0.case_id=c.id and f0.revision=c.revision and q0.resolution is null));
      end if;
    end if;
    insert into private.c22_events(case_id,actor,department,workspace,action,version,revision,detail)
      values(c.id,p_actor,scope,p_workspace,p_action,c.version,c.revision,jsonb_build_object('assignmentId',a.id,
        'releaseGeneration',rel.generation,'entry',p_input->>'entry'));
    return payload;
  end if;

  if request_key is null or expected is null or expected not between 0 and 2147483646
    or p_input->'confirmed' is distinct from 'true'::jsonb
    or not private.project_operational_text(note,3,1200)
  then raise exception 'invalid review command' using errcode='23514'; end if;
  command_hash:=extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256');
  select * into e from private.c22_events where actor=p_actor and request_id=request_key;
  if found then
    if e.command_hash<>command_hash then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('version',e.version,'revision',e.revision);
  end if;
  if case_ref is null then
    select * into g from private.c22_authority where actor=target_actor and department=scope and lane=purpose;
    if expected<>coalesce(g.version,0) then raise exception 'appointment changed' using errcode='O2004'; end if;
    ends:=(p_input->>'expiresAt')::timestamptz;
    if p_action='grant' then
      if ends is null or ends<=moment or ends>moment+interval '180 days' or not private.c22_identity(target_actor)
        or (purpose='assign' and not exists(select from public.role_assignments where user_id=target_actor and role='administrator'))
      then raise exception 'reviewer ineligible' using errcode='42501'; end if;
      insert into private.c22_authority(department,actor,lane,version,state,expires_at)
        values(scope,target_actor,purpose,expected+1,'active',ends)
        on conflict(department,actor,lane) do update set version=excluded.version,state='active',expires_at=excluded.expires_at;
    else
      if g.version is null or g.state='revoked' or (p_action='suspend' and g.state<>'active')
      then raise exception 'appointment changed' using errcode='O2004'; end if;
      update private.c22_authority set version=expected+1,state=case when p_action='revoke' then 'revoked' else 'suspended' end
        where department=scope and actor=target_actor and lane=purpose;
    end if;
    insert into private.c22_events(actor,target,department,workspace,request_id,command_hash,action,version,note,detail)
      values(p_actor,target_actor,scope,p_workspace,request_key,command_hash,p_action,expected+1,note,
        jsonb_build_object('purpose',purpose,'expiresAt',coalesce(ends,g.expires_at),'previous',g.state));
    return jsonb_build_object('version',expected+1);
  end if;

  if c.version<>expected or c.state='withdrawn' or r.status<>'submitted'
  then raise exception 'case changed' using errcode='O2004'; end if;
  if p_action not in ('recuse','release_assignment','revoke_evidence','challenge') and not can_review
  then raise exception 'source or lifecycle unavailable' using errcode='O2005'; end if;
  perform private.project_progress_limit(p_actor);

  case p_action
  when 'assign' then
    if p_lane<>'admin' or c.state not in ('queued','challenge','reassessment') or
      target_actor is null or target_actor=p_actor or (a.id is not null and private.c22_assignment_live(a,c,r,p))
    then raise exception 'assignment unavailable' using errcode='O2004'; end if;
    chosen_lane:=case c.state when 'challenge' then 'challenge' when 'reassessment' then 'reassessment' else 'initial' end;
    grant_revision:=private.c22_grant(target_actor,scope,case when chosen_lane='challenge' then 'challenge' else 'initial' end);
    ends:=(p_input->>'expiresAt')::timestamptz;
    if grant_revision is null or private.c22_conflicted(p,r,target_actor,chosen_lane)
      or ends is null or ends<=moment or ends>moment+interval '14 days'
    then raise exception 'reviewer ineligible' using errcode='42501'; end if;
    update private.c22_assignments set ended_at=moment where id=a.id;
    insert into private.c22_assignments(case_id,revision,reviewer,lane,grant_version,deadline)
      values(c.id,c.revision,target_actor,chosen_lane,grant_revision,ends) returning id into output_id;
    recipient:=target_actor;
  when 'release_assignment','recuse' then
    if a.id is null or (p_action='release_assignment' and p_lane<>'admin')
      or (p_action='recuse' and (p_lane<>'review' or a.reviewer is distinct from p_actor))
    then raise exception 'assignment unavailable' using errcode='42501'; end if;
    update private.c22_assignments set ended_at=moment where id=a.id;
    if p_action='recuse' then insert into private.c22_conflicts values(c.id,p_actor) on conflict do nothing; end if;
  when 'accept' then
    if p_lane<>'review' or a.accepted_at is not null or p_input->'conflictFree' is distinct from 'true'::jsonb
    then raise exception 'independent acceptance required' using errcode='42501'; end if;
    update private.c22_assignments set accepted_at=moment where id=a.id;
  when 'release_evidence','revoke_evidence' then
    if not member_lane then raise exception 'requester required' using errcode='42501'; end if;
    if p_action='release_evidence' then
      if rel.case_id is not null or not private.c22_live_manifest(v.manifest,source)
      then raise exception 'evidence changed' using errcode='O2004'; end if;
      insert into private.c22_releases(case_id,revision,generation)
        select c.id,c.revision,coalesce(max(generation),0)+1 from private.c22_releases
        where case_id=c.id and revision=c.revision returning * into rel;
    else
      if rel.case_id is null then raise exception 'evidence changed' using errcode='O2004'; end if;
      update private.c22_releases set revoked_at=moment where case_id=c.id and revision=c.revision and generation=rel.generation;
    end if;
  when 'correct' then
    if not member_lane or c.state not in ('queued','clarification','decided') or c.revision>=25
      or exists(select from private.c22_challenges q0 join private.c22_findings f0 on f0.id=q0.finding_id
        where f0.case_id=c.id and f0.revision=c.revision)
    then raise exception 'correction unavailable' using errcode='42501'; end if;
    perform private.m23_resource_guard(p_actor,'project_update','project',p.id);
    perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
    manifest:=p_input->'manifest';
    if not private.c22_live_manifest(manifest,source) or
      (select count(distinct x) from jsonb_array_elements(manifest) x)<>jsonb_array_length(manifest)
    then raise exception 'invalid evidence selection' using errcode='23514'; end if;
    update private.c22_assignments set ended_at=moment where id=a.id;
    update private.c22_releases set revoked_at=moment where case_id=c.id and revision=c.revision and revoked_at is null;
    insert into private.c22_revisions(case_id,revision,submitted_revision,result,manifest,explanation)
      values(c.id,c.revision+1,r.revision,v.result,manifest,note);
    c.revision:=c.revision+1;
    c.state:='queued';
  when 'clarify' then
    if p_lane<>'review' or a.lane<>'initial' or a.accepted_at is null or not released
    then raise exception 'clarification unavailable' using errcode='42501'; end if;
    update private.c22_assignments set ended_at=moment where id=a.id;
    c.state:='clarification';
    recipient:=r.requester_id;
  when 'challenge' then
    if not member_lane or c.state<>'decided' or not live then raise exception 'challenge unavailable' using errcode='42501'; end if;
    select * into f from private.c22_findings where id=(p_input->>'findingId')::uuid and case_id=c.id
      and revision=c.revision and lane='initial' and classification<>'supported';
    if not found or moment>=f.available_at+interval '14 days'
      or exists(select from private.c22_challenges where finding_id=f.id)
    then raise exception 'challenge unavailable' using errcode='O2004'; end if;
    insert into private.c22_challenges(finding_id,explanation) values(f.id,note) returning * into q;
    c.state:='challenge';
  when 'finding','uphold','revise','return' then
    if p_lane<>'review' or a.accepted_at is null or not released
      or (p_action='finding')<>(a.lane in ('initial','reassessment'))
      or not exists(select from private.c22_events y where y.case_id=c.id and y.actor=p_actor and y.action='evidence'
        and y.detail->>'assignmentId'=a.id::text and y.detail->>'releaseGeneration'=rel.generation::text)
    then raise exception 'independent evidence review required' using errcode='42501'; end if;
    if a.lane in ('challenge','reassessment') then
      select q0.* into q from private.c22_challenges q0 join private.c22_findings f0 on f0.id=q0.finding_id
        where f0.case_id=c.id and f0.revision=c.revision and f0.lane='initial';
      if not found or (a.lane='challenge' and q.resolution is not null)
        or (a.lane='reassessment' and q.resolution is distinct from 'returned')
      then raise exception 'challenge changed' using errcode='O2004'; end if;
    end if;
    if p_action in ('finding','revise') then
      finding_class:=p_input->>'classification';
      limits:=btrim(p_input->>'limitations');
      measurement:=nullif(p_input->'measurement','null'::jsonb);
      if finding_class is null or finding_class not in ('supported','partially_supported','insufficient_evidence','not_supported')
        or not private.project_operational_text(limits,3,1000)
        or (finding_class in ('supported','partially_supported') and jsonb_array_length(v.manifest)=0)
      then raise exception 'invalid finding' using errcode='23514'; end if;
      if measurement is not null then
        amount:=(measurement->>'quantity')::numeric;
        if jsonb_typeof(measurement->'quantity') is distinct from 'number' or amount is null or scale(amount)>2
          or amount not between 0 and 100000000 or r.source_kind<>'observation'
          or finding_class not in ('supported','partially_supported')
          or amount>(v.result->>'measurement')::numeric
          or (finding_class='supported')<>(amount=(v.result->>'measurement')::numeric)
          or measurement->>'unit' is distinct from v.result->>'unit'
          or measurement->>'startsOn' is distinct from v.result->>'startsOn'
          or measurement->>'endsOn' is distinct from v.result->>'endsOn'
          or not private.project_operational_text(measurement->>'methodology',5,1000)
        then raise exception 'invalid measurement' using errcode='23514'; end if;
        measurement:=jsonb_build_object('quantity',amount,'unit',measurement->>'unit',
          'startsOn',measurement->>'startsOn','endsOn',measurement->>'endsOn','methodology',measurement->>'methodology');
      end if;
      insert into private.c22_findings(case_id,revision,release_generation,reviewer,lane,classification,explanation,limitations,measurement)
        values(c.id,c.revision,rel.generation,p_actor,a.lane,finding_class,note,limits,measurement) returning id into output_id;
    end if;
    if q.finding_id is not null then
      update private.c22_challenges set resolution=case p_action when 'return' then 'returned' when 'uphold' then 'upheld'
        when 'revise' then 'revised' else 'reassessed' end,
        decision_reason=note,decided_at=moment,new_finding=output_id where finding_id=q.finding_id;
    end if;
    update private.c22_assignments set ended_at=moment where id=a.id;
    c.state:=case when p_action='return' then 'reassessment' else 'decided' end;
    recipient:=r.requester_id;
  else raise exception 'invalid review command' using errcode='23514';
  end case;
  update private.c22_cases set state=c.state,revision=c.revision,version=c.version+1 where id=c.id returning * into c;
  insert into private.c22_events(case_id,actor,target,department,workspace,request_id,command_hash,action,version,revision,note,detail)
    values(c.id,p_actor,recipient,scope,p_workspace,request_key,command_hash,p_action,c.version,c.revision,note,
      jsonb_build_object('assignmentId',case when p_action='assign' then output_id else a.id end,
        'findingId',case when p_action in ('finding','revise') then output_id end,'challengedFindingId',q.finding_id,
        'releaseGeneration',rel.generation));
  return jsonb_build_object('version',c.version,'revision',c.revision);
end
$$;

revoke all on function private.c22_enabled(),private.c22_department(private.community_projects),private.c22_identity(uuid),
  private.c22_grant(uuid,text,text),private.c22_coordinator(uuid,text),
  private.c22_conflicted(private.community_projects,private.c21_outcome_requests,uuid,text,uuid),
  private.c22_source(private.community_projects,private.c21_outcome_requests),
  private.c22_assignment_live(private.c22_assignments,private.c22_cases,private.c21_outcome_requests,private.community_projects),
  private.c22_capture_submission(),private.c22_live_manifest(jsonb,jsonb),private.c22_findings_view(private.c22_cases,boolean),
  public.c22_reviews_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.c22_reviews_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb) to service_role;
