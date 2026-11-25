-- The fixture gate is empty in hosted environments. This migration adds no appointments or policies.
create table private.c21_outcome_fixture (
  enabled boolean primary key check (enabled)
);

create table private.c21_outcome_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  requester_id uuid references auth.users(id) on delete set null,
  source_kind text not null check (source_kind in ('milestone','observation','progress_report','final_report','accomplishment')),
  source_id uuid not null,
  source_revision integer not null check (source_revision > 0),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  classification text not null check (classification in ('output','outcome')),
  explanation text not null,
  status text not null check (status in ('draft','submitted','withdrawn')),
  revision integer not null check (revision > 0),
  created_at timestamptz not null,
  submitted_at timestamptz,
  check (status <> 'submitted' or submitted_at is not null)
);

-- Classification describes the claim. It cannot create a second active case for the same source.
create unique index c21_outcome_active_source on private.c21_outcome_requests
  (project_id, source_kind, source_id, source_revision) where status <> 'withdrawn';
create index c21_outcome_project_cases on private.c21_outcome_requests(project_id, id);

create table private.c21_outcome_history (
  case_id uuid not null references private.c21_outcome_requests(id) on delete cascade,
  revision integer not null check (revision > 0),
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  fingerprint bytea not null,
  action text not null check (action in ('create','edit','submit','withdraw')),
  status text not null check (status in ('draft','submitted','withdrawn')),
  classification text not null check (classification in ('output','outcome')),
  explanation text not null,
  occurred_at timestamptz not null,
  primary key (case_id, revision),
  unique (actor_id, request_id)
);

alter table private.c21_outcome_fixture enable row level security;
alter table private.c21_outcome_requests enable row level security;
alter table private.c21_outcome_history enable row level security;
revoke all on private.c21_outcome_fixture, private.c21_outcome_requests, private.c21_outcome_history
  from public, anon, authenticated, service_role;

create function private.c21_sources(p private.community_projects, p_actor uuid, p_role text, p_kind text,
  p_id uuid, p_after uuid, p_limit integer)
returns table (id uuid, revision integer, result jsonb) language sql stable set search_path='' as $$
  select src.* from (
    select m.id, m.version, jsonb_build_object('title',m.title,'reportedResult',m.description,
      'measurement',null,'unit',null,'startsOn',m.starts_on,'endsOn',completion.on_date,
      'internallyReviewed',m.reviewer_id is not null,'evidence',coalesce(related.items,'[]'::jsonb))
    from private.project_milestones m
    left join lateral (
      select (e.created_at at time zone 'UTC')::date as on_date from private.project_operations_events e
      where e.project_id=p.id and e.progress_subject=m.id and e.action='milestone_approved'
      order by e.created_at desc,e.id desc limit 1
    ) completion on true
    left join lateral (
      select jsonb_agg(f.item order by x.id,f.ordinal) as items
      from private.project_progress_entries x
      cross join lateral (
        select ordinality as ordinal,jsonb_build_object('kind','reference','sourceId',x.id,
          'revision',x.version,'reference',value) as item
        from jsonb_array_elements_text(x.content->'references') with ordinality
        union all select 0,jsonb_build_object('kind','image','sourceId',x.id,'revision',x.version,'digest',x.image_digest)
        where x.image_digest is not null
      ) f
      where x.project_id=p.id and x.milestone_id=m.id and x.kind='evidence' and x.state='approved'
        and private.project_entry_internal(p,x,p_actor,p_role)
        and not exists(select from private.project_progress_entries newer where newer.project_id=p.id
          and newer.supersedes_id=x.id and newer.approved_at is not null)
    ) related on true
    where p_kind='milestone' and m.project_id=p.id and m.status='completed'
      and not feed_data.blocked_pair(p_actor,m.creator_id) and not feed_data.blocked_pair(p_actor,m.responsible_id)
    union all
    select o.id, 1, jsonb_build_object('title',m.name,'reportedResult',o.explanation,
      'measurement',o.actual,'unit',m.unit,'startsOn',o.starts_on,'endsOn',o.ends_on,'internallyReviewed',false,
      'evidence',case when o.reference is null then '[]'::jsonb else jsonb_build_array(
        jsonb_build_object('kind','reference','sourceId',o.id,'revision',1,'reference',o.reference)) end)
    from private.project_metric_observations o join private.project_metrics m
      on m.project_id=o.project_id and m.id=o.metric_id
    where p_kind='observation' and o.project_id=p.id and not feed_data.blocked_pair(p_actor,o.reporter_id)
    union all
    select x.id, x.version, jsonb_build_object('title',x.content->>'title',
      'reportedResult',coalesce(x.content->>'summary',x.content->>'description'),
      'measurement',null,'unit',null,'startsOn',null,'endsOn',x.snapshot->>'completedOn',
      'internallyReviewed',x.reviewer_id is not null,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('kind','reference','sourceId',x.id,
        'revision',x.version,'reference',reference.value) order by reference.ordinality)
        from jsonb_array_elements_text(x.content->'references') with ordinality reference),'[]'::jsonb)
        || case when x.image_digest is null then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object('kind','image','sourceId',x.id,'revision',x.version,'digest',x.image_digest)) end)
    from private.project_progress_entries x
    where x.project_id=p.id and x.state='approved'
      and private.project_entry_internal(p,x,p_actor,p_role)
      and case p_kind
        when 'final_report' then x.kind='report'
        when 'progress_report' then x.kind='update'
        when 'accomplishment' then x.kind='update' and x.milestone_id is not null
        else false end
      and not exists(select from private.project_progress_entries newer where newer.project_id=p.id
        and newer.supersedes_id=x.id and newer.approved_at is not null)
  ) as src(id,revision,result)
  where (p_id is null or src.id=p_id) and (p_after is null or src.id>p_after)
  order by src.id limit p_limit
$$;

create function private.c21_case(r private.c21_outcome_requests,p_actor uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',r.id,'projectId',r.project_id,'mine',r.requester_id is not distinct from p_actor,
    'sourceKind',r.source_kind,'sourceId',r.source_id,'sourceRevision',r.source_revision,'result',r.result,
    'classification',r.classification,'explanation',r.explanation,'status',r.status,'revision',r.revision,
    'createdAt',r.created_at,'submittedAt',r.submitted_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'action',h.action,
      'status',h.status,'classification',h.classification,'explanation',h.explanation,'occurredAt',h.occurred_at)
      order by h.revision desc) from private.c21_outcome_history h where h.case_id=r.id),'[]'::jsonb))
$$;

create function public.c21_outcomes_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_project uuid,
  p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.community_projects; r private.c21_outcome_requests; prior private.c21_outcome_history;
  permission text; execution text; source record; source_type text; source_key uuid; source_version integer;
  source_hash text; request_key uuid; request_hash bytea; expected integer; note text; claim_type text;
  case_id uuid; after_id uuid; moment timestamptz;
begin
  if not exists(select from private.c21_outcome_fixture where enabled) then
    raise exception 'validation intake disabled' using errcode='C2101';
  end if;
  if p_action is null or p_action not in ('sources','list','read','create','edit','submit','withdraw')
    or jsonb_typeof(p_input) is distinct from 'object'
  then raise exception 'invalid validation command' using errcode='23514'; end if;

  if p_action in ('create','edit','submit','withdraw') then
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    or not coalesce(private.member_onboarding_access(p_actor),false)
    or not coalesce(feed_data.author_active(p_actor),false)
  then raise exception 'member access denied' using errcode='42501'; end if;

  if p_action in ('create','edit','submit','withdraw') then
    select * into p from private.community_projects where id=p_project for update;
    if found then perform private.project_lock_scope(p); end if;
  else
    select * into p from private.community_projects where id=p_project;
  end if;
  if p.id is null then raise exception 'project unavailable' using errcode='O2003'; end if;
  permission:=private.project_execution_role(p,p_actor);
  select status into execution from private.project_execution where project_id=p.id;
  if execution is null or not private.project_progress_manager(permission) then
    raise exception 'project unavailable' using errcode='O2003';
  end if;
  case_id:=(p_input->>'id')::uuid;
  after_id:=(p_input->>'after')::uuid;
  source_type:=p_input->>'sourceKind';

  if p_action='sources' then
    if source_type is null or source_type not in ('milestone','observation','progress_report','final_report','accomplishment')
    then raise exception 'invalid source kind' using errcode='23514'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'result',s.result,
      'fingerprint',encode(extensions.digest(s.result::text,'sha256'),'hex')) order by s.id)
      from private.c21_sources(p,p_actor,permission,source_type,null,after_id,31) s),'[]'::jsonb);
  end if;
  if p_action='list' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sourceKind',x.source_kind,
      'title',x.result->>'title','status',x.status,'createdAt',x.created_at) order by x.id)
      from (select * from private.c21_outcome_requests x where x.project_id=p.id
        and (after_id is null or x.id>after_id)
        and x.requester_id=p_actor
        order by x.id limit 31) x),'[]'::jsonb);
  end if;
  if p_action='read' then
    select * into r from private.c21_outcome_requests where id=case_id and project_id=p.id
      and requester_id=p_actor;
    if not found then raise exception 'request unavailable' using errcode='O2003'; end if;
    return private.c21_case(r,p_actor);
  end if;

  if p_action in ('create','edit','submit') then
    if execution not in ('active','completed','archived')
      or (execution='archived' and private.project_completion_on(p.id) is null)
    then raise exception 'project lifecycle unavailable' using errcode='O2005'; end if;
    perform private.m23_resource_guard(p_actor,'project_update','project',p.id);
    perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
  end if;

  request_key:=(p_input->>'key')::uuid;
  expected:=(p_input->>'expectedRevision')::integer;
  if request_key is null
    or (p_action<>'create' and (case_id is null or expected is null or expected not between 1 and 2147483646))
    or (p_action in ('submit','withdraw') and p_input->'confirmed' is distinct from 'true'::jsonb)
  then raise exception 'invalid validation command' using errcode='23514'; end if;
  request_hash:=extensions.digest(jsonb_build_array(p.id,p_action,p_input)::text,'sha256');
  select * into prior from private.c21_outcome_history where actor_id=p_actor and request_id=request_key;
  if found then
    if prior.fingerprint<>request_hash then raise exception 'request conflict' using errcode='O2002'; end if;
    select * into r from private.c21_outcome_requests where id=prior.case_id and project_id=p.id and requester_id=p_actor;
    if not found then raise exception 'request unavailable' using errcode='O2003'; end if;
    return private.c21_case(r,p_actor);
  end if;

  if p_action in ('create','edit') then
    note:=btrim(p_input->>'explanation'); claim_type:=p_input->>'classification';
    if not private.project_operational_text(note,3,800) or claim_type is null or claim_type not in ('output','outcome')
    then raise exception 'invalid validation explanation' using errcode='23514'; end if;
  end if;
  if p_action<>'create' then
    select * into r from private.c21_outcome_requests where id=case_id and project_id=p.id and requester_id=p_actor for update;
    if not found then raise exception 'request unavailable' using errcode='O2003'; end if;
    if r.revision<>expected or r.status='withdrawn' or (p_action<>'withdraw' and r.status<>'draft')
    then raise exception 'request changed' using errcode='O2004'; end if;
  end if;
  if p_action in ('create','submit') then
    if p_action='create' then
      source_key:=(p_input->>'sourceId')::uuid;
      source_version:=(p_input->>'sourceRevision')::integer;
      source_hash:=p_input->>'sourceFingerprint';
    else
      source_type:=r.source_kind; source_key:=r.source_id;
      source_version:=r.source_revision; source_hash:=r.source_fingerprint;
    end if;
    if source_type is null or source_type not in ('milestone','observation','progress_report','final_report','accomplishment')
      or source_key is null or source_version is null or source_version<1
      or source_hash is null or source_hash !~ '^[0-9a-f]{64}$'
    then raise exception 'invalid source revision' using errcode='23514'; end if;
    select * into source from private.c21_sources(p,p_actor,permission,source_type,source_key,null,1);
    if not found or source.revision<>source_version or
      encode(extensions.digest(source.result::text,'sha256'),'hex')<>source_hash
    then raise exception 'source unavailable or changed' using errcode='O2004'; end if;
  end if;

  perform private.project_progress_limit(p_actor);
  moment:=clock_timestamp();
  if p_action='create' then
    -- An approved milestone-linked update can be selected as a report or an accomplishment.
    -- It may have only one active validation request across those views.
    if exists(select from private.c21_outcome_requests x where x.project_id=p.id and x.source_id=source_key
      and x.source_revision=source_version and x.status<>'withdrawn'
      and (x.source_kind=source_type or (source_type in ('accomplishment','progress_report')
        and x.source_kind in ('accomplishment','progress_report'))))
    then raise exception 'active request exists' using errcode='23505'; end if;
    insert into private.c21_outcome_requests(project_id,requester_id,source_kind,source_id,source_revision,
      source_fingerprint,result,classification,explanation,status,revision,created_at)
    values(p.id,p_actor,source_type,source_key,source_version,source_hash,source.result,claim_type,note,'draft',1,moment)
    returning * into r;
  else
    update private.c21_outcome_requests set revision=r.revision+1,
      status=case p_action when 'submit' then 'submitted' when 'withdraw' then 'withdrawn' else r.status end,
      submitted_at=case when p_action='submit' then moment else r.submitted_at end,
      classification=coalesce(claim_type,r.classification),explanation=coalesce(note,r.explanation)
    where id=r.id returning * into r;
  end if;
  insert into private.c21_outcome_history(case_id,revision,actor_id,request_id,fingerprint,action,status,
    classification,explanation,occurred_at)
  values(r.id,r.revision,p_actor,request_key,request_hash,p_action,r.status,r.classification,r.explanation,moment);
  return private.c21_case(r,p_actor);
end
$$;

revoke all on function private.c21_sources(private.community_projects,uuid,text,text,uuid,uuid,integer),
  private.c21_case(private.c21_outcome_requests,uuid),
  public.c21_outcomes_for_api(uuid,uuid,boolean,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.c21_outcomes_for_api(uuid,uuid,boolean,uuid,text,jsonb) to service_role;
