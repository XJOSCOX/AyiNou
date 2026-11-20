-- L3.2 uses an empty, database-owner-only fixture allowlist. No live intake or reviewer grant.
create table private.privacy_intake_fixtures (
  subject_id uuid primary key references auth.users(id) on delete cascade
);

create table private.privacy_cases (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('access','correction','export','closure','deletion','restriction','appeal')),
  state text not null default 'received' check (state in ('received','withdrawn')),
  version integer not null default 1 check (version in (1,2)),
  policy_context text not null default 'unresolved' check (policy_context = 'unresolved'),
  assurance text not null default 'live_session' check (assurance = 'live_session'),
  next_action text not null default 'await_policy' check (next_action in ('await_policy','none')),
  created_at timestamptz not null default now(),
  check ((state,version,next_action) in (('received',1,'await_policy'),('withdrawn',2,'none')))
);
create index privacy_cases_by_subject on private.privacy_cases (subject_id,created_at desc,id desc);

create table private.privacy_case_events (
  case_id uuid not null references private.privacy_cases(id) on delete restrict,
  version integer not null,
  previous_state text,
  new_state text not null,
  actor_category text not null check (actor_category = 'subject'),
  reason text not null,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  primary key (case_id,version),
  check ((version = 1 and previous_state is null and new_state = 'received' and reason = 'submitted')
    or (version = 2 and previous_state is not distinct from 'received' and new_state = 'withdrawn' and reason = 'withdrawn_by_subject'))
);

create table private.privacy_case_assignments (
  case_id uuid primary key references private.privacy_cases(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create table private.privacy_case_commands (
  actor_id uuid not null references auth.users(id) on delete restrict,
  key uuid not null,
  operation text not null check (operation in ('create','withdraw')),
  payload jsonb not null,
  case_id uuid not null,
  receipt_version integer not null,
  primary key (actor_id,key),
  foreign key (case_id,receipt_version) references private.privacy_case_events(case_id,version) on delete restrict
);

alter table private.privacy_intake_fixtures enable row level security;
alter table private.privacy_cases enable row level security;
alter table private.privacy_case_events enable row level security;
alter table private.privacy_case_assignments enable row level security;
alter table private.privacy_case_commands enable row level security;
revoke all on private.privacy_intake_fixtures,private.privacy_cases,private.privacy_case_events,
  private.privacy_case_assignments,private.privacy_case_commands from public,anon,authenticated,service_role;

create function private.require_privacy_intake(p_actor uuid,p_session uuid,p_aal2 boolean)
returns void language plpgsql stable set search_path = '' as $$
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false) then
    raise exception using errcode='PT401', message='UNAUTHORIZED';
  end if;
  if not exists (select 1 from private.privacy_intake_fixtures f where f.subject_id=p_actor) then
    raise exception using errcode='PT404', message='PRIVACY_DISABLED';
  end if;
end;
$$;

create function private.privacy_case_projection(p_case private.privacy_cases)
returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',p_case.id,'kind',p_case.kind,'state',p_case.state,
    'version',p_case.version,'createdAt',p_case.created_at,'nextAction',p_case.next_action)
$$;

create function public.privacy_cases_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_after uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  before_time timestamptz;
begin
  perform private.require_privacy_intake(p_actor,p_session,p_aal2);
  if p_id is not null then
    select private.privacy_case_projection(c) || pg_catalog.jsonb_build_object('events',
      (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('state',e.new_state,'at',e.created_at,
        'version',e.version) order by e.version) from private.privacy_case_events e where e.case_id=c.id))
      into result from private.privacy_cases c where c.subject_id=p_actor and c.id=p_id;
    if result is null then raise exception using errcode='PT404', message='NOT_FOUND'; end if;
    return result;
  end if;
  if p_after is not null then
    select created_at into before_time from private.privacy_cases where subject_id=p_actor and id=p_after;
    if not found then raise exception using errcode='PT404', message='NOT_FOUND'; end if;
  end if;
  return coalesce((select pg_catalog.jsonb_agg(private.privacy_case_projection(c) order by c.created_at desc,c.id desc)
    from (select * from private.privacy_cases where subject_id=p_actor
      and (p_after is null or (created_at,id) < (before_time,p_after))
      order by created_at desc,id desc limit 21) c), '[]'::jsonb);
end;
$$;

create function public.privacy_case_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
  p_operation text,p_key uuid,p_request uuid,p_kind text,p_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c private.privacy_cases;
  previous private.privacy_case_commands;
  fingerprint jsonb;
  old_state text;
  reason_code text;
begin
  perform private.require_privacy_intake(p_actor,p_session,p_aal2);
  if p_key is null or p_request is null or not coalesce((
      p_operation='create' and p_kind in ('access','correction','export','closure','deletion','restriction','appeal')
        and p_id is null and p_version is null
    ) or (p_operation='withdraw' and p_id is not null and p_version in (1,2) and p_kind is null),false) then
    raise exception using errcode='PT400', message='INVALID_INPUT';
  end if;
  fingerprint := pg_catalog.jsonb_build_array('unresolved',p_kind,p_id,p_version);
  -- Serialize this actor's small command stream across API processes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('privacy:' || p_actor::text,0));
  perform private.require_privacy_intake(p_actor,p_session,p_aal2);
  select * into previous from private.privacy_case_commands where actor_id=p_actor and key=p_key;
  if found then
    if previous.operation <> p_operation or previous.payload <> fingerprint then
      raise exception using errcode='PT409', message='PRIVACY_KEY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('id',previous.case_id,'version',previous.receipt_version,
      'state',case when p_operation='create' then 'received' else 'withdrawn' end);
  end if;
  if p_operation='create' then
    if (select count(*) from private.privacy_cases where subject_id=p_actor and created_at>=now()-interval '1 hour') >= 12 then
      raise exception using errcode='PT429', message='RATE_LIMITED';
    end if;
    insert into private.privacy_cases(subject_id,kind) values(p_actor,p_kind) returning * into c;
    reason_code := 'submitted';
  else
    select * into c from private.privacy_cases where subject_id=p_actor and id=p_id for update;
    if not found then raise exception using errcode='PT404', message='NOT_FOUND'; end if;
    if c.version<>p_version or c.state<>'received' then
      raise exception using errcode='PT409', message='PRIVACY_STATE_CONFLICT';
    end if;
    old_state := c.state;
    update private.privacy_cases set state='withdrawn',version=version+1,next_action='none'
      where id=c.id and version=p_version returning * into c;
    reason_code := 'withdrawn_by_subject';
  end if;
  insert into private.privacy_case_events(case_id,version,previous_state,new_state,actor_category,reason,request_id)
    values(c.id,c.version,old_state,c.state,'subject',reason_code,p_request);
  insert into private.privacy_case_commands(actor_id,key,operation,payload,case_id,receipt_version)
    values(p_actor,p_key,p_operation,fingerprint,c.id,c.version);
  return pg_catalog.jsonb_build_object('id',c.id,'version',c.version,'state',c.state);
end;
$$;

revoke all on function private.require_privacy_intake(uuid,uuid,boolean),private.privacy_case_projection(private.privacy_cases),
  public.privacy_cases_for_api(uuid,uuid,boolean,uuid,uuid),
  public.privacy_case_command_for_api(uuid,uuid,boolean,text,uuid,uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.privacy_cases_for_api(uuid,uuid,boolean,uuid,uuid),
  public.privacy_case_command_for_api(uuid,uuid,boolean,text,uuid,uuid,text,uuid,integer) to service_role;
