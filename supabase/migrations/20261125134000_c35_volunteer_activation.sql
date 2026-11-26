-- C3 release control is closed on hosted databases. Only the disposable runner supplies readiness.
create table private.c35_fixture (
  singleton boolean primary key check(singleton),
  privacy_ready boolean not null,
  safeguarding_ready boolean not null,
  operations_ready boolean not null
);
create table private.c35_stage (
  capability text primary key check(capability in ('intake','requirements','matching','discovery','recruitment')),
  status text not null check(status in ('active','paused'))
);
create table private.c35_events (
  version integer generated always as identity primary key,
  capability text not null check(capability in ('intake','requirements','matching','discovery','recruitment','all')),
  action text not null check(action in ('enable','pause','resume','emergency_pause','configuration_changed')),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid unique,
  fingerprint text,
  configuration text not null,
  reason text not null,
  affected text[] not null,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table private.c35_fixture enable row level security;
alter table private.c35_stage enable row level security;
alter table private.c35_events enable row level security;
revoke all on private.c35_fixture,private.c35_stage,private.c35_events from public,anon,authenticated,authenticator,service_role;

create function private.c35_fixture_ready() returns boolean language sql stable set search_path='' as $$
  select exists(select from private.c35_fixture where privacy_ready and safeguarding_ready and operations_ready)
$$;

create function private.c35_dependencies(stage text) returns text[] language sql immutable set search_path='' as $$
  select case stage when 'matching' then array['intake','requirements']
    when 'discovery' then array['intake','requirements']
    when 'recruitment' then array['intake','requirements','discovery'] else '{}'::text[] end
$$;

create function private.c35_gate(stage text, fixture boolean) returns boolean language sql stable set search_path='' as $$
  select coalesce(fixture,false) and case when exists(select from private.c35_fixture) then
    private.c35_fixture_ready()
    and exists(select from private.c35_stage where capability=stage and status='active')
    and not exists(select from unnest(private.c35_dependencies(stage)) required(capability)
      where not exists(select from private.c35_stage x where x.capability=required.capability and x.status='active'))
  else case stage
    when 'intake' then exists(select from private.c31_fixture)
    when 'requirements' then exists(select from private.c32_fixture)
    when 'matching' then exists(select from private.c31_fixture) and exists(select from private.c32_fixture) and exists(select from private.c33_fixture)
    when 'discovery' then exists(select from private.c31_fixture) and exists(select from private.c32_fixture) and exists(select from private.c33_fixture)
    when 'recruitment' then exists(select from private.c31_fixture) and exists(select from private.c32_fixture)
      and exists(select from private.c33_fixture) and exists(select from private.c34_fixture)
    else false end
  end
$$;

create function private.c35_lock(exclusive boolean) returns void language plpgsql set search_path='' as $$
begin
  if exists(select from private.c35_fixture) then
    if exclusive then perform pg_advisory_xact_lock(20261125,350);
    else perform pg_advisory_xact_lock_shared(20261125,350);
    end if;
  end if;
end $$;

create function private.c35_configuration() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'intake',coalesce((select version from private.c31_settings where singleton),0),
    'catalog',coalesce((select max(recorded_at)::text from private.c31_admin_history),''),
    'requirements',coalesce((select max(version) from private.c32_configuration),0),
    'matching',coalesce((select max(version) from private.c33_configuration),0),
    'discovery',coalesce((select max(version) from private.c33_configuration),0),
    'recruitment',coalesce((select max(version) from private.c34_configuration),0))
$$;

create function private.c35_catalog_ready(stage text) returns boolean language sql stable set search_path='' as $$
  select (stage='intake' or exists(select from private.c32_catalog(private.c32_settings())))
    and exists(select from private.c31_skills s
      left join private.c31_settings settings on settings.singleton
      where s.status='active' and (settings.categories is null or s.category=any(settings.categories)))
    and case when stage in ('matching','discovery','recruitment') then coalesce((
      select jsonb_array_length(settings->'departments')>0 and jsonb_array_length(settings->'modes')>0
      from private.c33_configuration order by version desc limit 1),true) else true end
    and case when stage='recruitment' then jsonb_array_length(private.c34_settings()->'departments')>0
      and jsonb_array_length(private.c34_settings()->'modes')>0 else true end
$$;

create function private.c35_pause_stages(stage text) returns text[] language plpgsql set search_path='' as $$
declare affected text[];
begin
  with paused as (
    update private.c35_stage set status='paused' where status='active'
      and (stage='all' or capability=stage or stage=any(private.c35_dependencies(capability)))
      returning capability
  ) select coalesce(array_agg(capability order by capability),'{}') into affected from paused;
  if 'recruitment'=any(affected) or stage in ('all','intake','requirements','discovery','recruitment') then
    with closed as (
      update private.c34_invitations set status='invalidated',version=version+1,changed_at=clock_timestamp()
        where status='pending' returning id,version,status
    ) insert into private.c34_events(invitation,version,status) select id,version,status from closed;
  end if;
  return affected;
end $$;

create function private.c35_config_change() returns trigger language plpgsql security definer set search_path='' as $$
declare affected text[]; stage text:=tg_argv[0];
begin
  if not exists(select from private.c35_fixture) then return null; end if;
  perform private.c35_lock(true);
  affected:=private.c35_pause_stages(stage);
  if stage='matching' then affected:=affected||private.c35_pause_stages('discovery'); end if;
  if cardinality(affected)>0 then
    insert into private.c35_events(capability,action,configuration,reason,affected)
      values(stage,'configuration_changed',private.c35_configuration()::text,'Configuration changed. Explicit resumption is required.',affected);
  end if;
  return null;
end $$;

create trigger c35_intake_settings after insert or update or delete on private.c31_settings
  for each statement execute function private.c35_config_change('intake');
create trigger c35_catalog after insert or update or delete on private.c31_skills
  for each statement execute function private.c35_config_change('all');
create trigger c35_requirements_settings after insert on private.c32_configuration
  for each statement execute function private.c35_config_change('requirements');
create trigger c35_matching_settings after insert on private.c33_configuration
  for each statement execute function private.c35_config_change('matching');
create trigger c35_recruitment_settings after insert on private.c34_configuration
  for each statement execute function private.c35_config_change('recruitment');
create trigger c35_fixture_readiness after update on private.c35_fixture
  for each statement execute function private.c35_config_change('all');

create function public.c35_activation_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_fixture boolean,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  configured jsonb; cfg text; latest integer; stage text; command text; state text;
  reason text; receipt uuid; digest text; previous private.c35_events; affected text[];
  environment_ready boolean;
begin
  if p_action is null or p_action not in ('read','change') then raise exception 'invalid action' using errcode='23514'; end if;
  if p_action='change' then
    perform private.s2b_lock_actor(p_actor,p_session);
    perform pg_advisory_xact_lock(20261125,350);
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false) and private.member_onboarding_access(p_actor)
    and private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    then raise exception 'Founder workspace required' using errcode='42501'; end if;

  configured:=private.c35_configuration();
  cfg:=encode(sha256(convert_to(configured::text,'UTF8')),'hex');
  select coalesce(max(version),0) into latest from private.c35_events;
  environment_ready:=coalesce(p_fixture,false) and private.c35_fixture_ready();
  if p_action='read' then
    return jsonb_build_object('version',latest,'configuration',cfg,'environmentReady',environment_ready,
      'stages',(select jsonb_agg(jsonb_build_object('capability',c.key,'configurationVersion',(configured->>c.key)::int,
        'configurationReady',private.c35_catalog_ready(c.key),'operationalReady',environment_ready,
        'status',case when not coalesce(p_fixture,false) then 'disabled'
          when s.status='active' and not private.c35_gate(c.key,p_fixture) then 'paused'
          else coalesce(s.status,'disabled') end,
        'dependencies',private.c35_dependencies(c.key),
        'dependenciesReady',not exists(select from unnest(private.c35_dependencies(c.key)) required(key)
          where not private.c35_gate(required.key,p_fixture))) order by c.ordinal)
        from unnest(array['intake','requirements','matching','discovery','recruitment']) with ordinality c(key,ordinal)
        left join private.c35_stage s on s.capability=c.key),
      'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
        from (select e.version,e.capability,e.action,e.reason,e.affected,e.recorded_at as at
          from private.c35_events e order by e.version desc limit 30) h));
  end if;

  stage:=p_input->>'capability'; command:=p_input->>'command'; reason:=btrim(p_input->>'reason');
  if jsonb_typeof(p_input) is distinct from 'object'
    or p_input-array['capability','command','reason','configuration','expectedVersion','requestId','confirmed']<>'{}'
    or not coalesce(stage in ('intake','requirements','matching','discovery','recruitment','all') and
      (case when stage='all' then command='emergency_pause' else command in ('enable','pause','resume') end),false)
    or not private.c32_integer(p_input->'expectedVersion',0,2147483646) or p_input->'confirmed' is distinct from 'true'
    or not coalesce(length(reason) between 10 and 500 and reason !~ '[[:cntrl:]]',false)
    or jsonb_typeof(p_input->'requestId') is distinct from 'string'
    then raise exception 'invalid activation command' using errcode='23514'; end if;
  receipt:=(p_input->>'requestId')::uuid;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  select * into previous from private.c35_events where request_id=receipt;
  if found then
    if previous.actor is distinct from p_actor or previous.workspace is distinct from p_workspace or previous.fingerprint<>digest
      then raise exception 'conflicting receipt' using errcode='55000'; end if;
    return jsonb_build_object('version',previous.version,'affected',previous.affected);
  end if;
  if latest<>(p_input->>'expectedVersion')::integer or cfg is distinct from p_input->>'configuration'
    then raise exception 'stale activation configuration' using errcode='55000'; end if;

  select status into state from private.c35_stage where capability=stage;
  if command='emergency_pause' then
    affected:=private.c35_pause_stages('all');
  elsif command='pause' then
    if state is distinct from 'active' then raise exception 'stage not active' using errcode='55000'; end if;
    affected:=private.c35_pause_stages(stage);
  else
    if not environment_ready or not private.c35_catalog_ready(stage)
      or exists(select from unnest(private.c35_dependencies(stage)) required(key) where not private.c35_gate(required.key,p_fixture))
      then raise exception 'activation readiness unavailable' using errcode='42501'; end if;
    if (command='enable' and state is not null) or (command='resume' and state is distinct from 'paused')
      then raise exception 'invalid activation transition' using errcode='55000'; end if;
    insert into private.c35_stage(capability,status) values(stage,'active')
      on conflict(capability) do update set status=excluded.status;
    affected:=array[stage];
  end if;
  insert into private.c35_events(capability,action,actor,workspace,request_id,fingerprint,configuration,reason,affected)
    values(stage,command,p_actor,p_workspace,receipt,digest,cfg,reason,affected) returning version into latest;
  return jsonb_build_object('version',latest,'affected',affected);
end $$;

revoke all on function private.c35_fixture_ready(),private.c35_dependencies(text),private.c35_gate(text,boolean),
  private.c35_lock(boolean),private.c35_configuration(),private.c35_catalog_ready(text),
  private.c35_pause_stages(text),private.c35_config_change(),public.c35_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c35_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb) to service_role;

-- Maintain existing RPC signatures and ACLs while changing only the reviewed gate points.
do $edit$
declare definition text; old_text text; new_text text;
begin
  select pg_get_functiondef('public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)'::regprocedure) into definition;
  old_text:=$old$  if p_action <> 'read' then
    perform private.s2b_lock_actor(p_actor,p_session);$old$;
  new_text:=$new$  if p_action <> 'read' then
    perform private.s2b_lock_actor(p_actor,p_session);
    perform private.c35_lock(p_lane='founder');$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$coalesce(p_fixture,false) and exists(select from private.c31_fixture)$old$;
  new_text:=$new$private.c35_gate('intake',p_fixture)$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  execute definition;

  select pg_get_functiondef('public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  old_text:=$old$    perform private.s2b_lock_actor(p_actor,p_session);
    perform pg_advisory_xact_lock(20261125,320);$old$;
  new_text:=$new$    perform private.s2b_lock_actor(p_actor,p_session);
    perform private.c35_lock(true);
    perform pg_advisory_xact_lock(20261125,320);$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$elsif not (coalesce(p_fixture,false) and exists(select from private.c32_fixture)) then
    if p_action='read' then return$old$;
  new_text:=$new$elsif not private.c35_gate('requirements',p_fixture) then
    if p_action='read' and coalesce(p_fixture,false) and exists(select from private.c35_fixture)
      and exists(select from private.c35_stage where capability='requirements' and status='paused') then
      null; -- Keep native-authorized frozen history visible while editing is paused.
    elsif p_action='read' then return$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$    raise exception 'structured requirements closed' using errcode='42501';
  end if;$old$;
  new_text:=$new$    else raise exception 'structured requirements closed' using errcode='42501'; end if;
  end if;$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$then return '{"state":"closed"}'; end if;
    else$old$;
  new_text:=$new$then return '{"state":"closed"}';
    else$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$'editable',edits and flags.open$old$;
  new_text:=$new$'editable',private.c35_gate('requirements',p_fixture) and edits and flags.open$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$    select * into p from private.community_projects where id=p_project for update;
    if found then perform private.project_lock_scope(p); end if;$old$;
  if strpos(definition,old_text)=0 then raise exception 'Unexpected requirements project lock'; end if;
  definition:=replace(definition,old_text,$new$    select * into p from private.community_projects where id=p_project for update;
    if found then perform private.project_lock_scope(p); end if;
    perform private.c35_lock(false);
    if not private.c35_gate('requirements',p_fixture) then raise exception 'structured requirements closed' using errcode='42501'; end if;$new$);
  execute definition;

  select pg_get_functiondef('public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  old_text:=$old$      perform private.s2b_lock_actor(p_actor,p_session);
      perform pg_advisory_xact_lock(20261125,330);$old$;
  new_text:=$new$      perform private.s2b_lock_actor(p_actor,p_session);
      perform private.c35_lock(true);
      perform pg_advisory_xact_lock(20261125,330);$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$elsif not (coalesce(p_fixture,false) and exists(select from private.c33_fixture)
    and exists(select from private.c32_fixture) and exists(select from private.c31_fixture)) then$old$;
  new_text:=$new$elsif not private.c35_gate(case when p_action='discover' then 'discovery' else 'matching' end,p_fixture)
    and not (p_action='pause' and coalesce(p_fixture,false) and exists(select from private.c35_fixture)) then$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$  if p_action in ('pause','resume','dismiss') then
    perform private.s2b_lock_actor(p_actor,p_session);$old$;
  if strpos(definition,old_text)=0 then raise exception 'Unexpected matching actor lock'; end if;
  definition:=replace(definition,old_text,$new$  if p_action in ('pause','resume','dismiss') then
    perform private.s2b_lock_actor(p_actor,p_session);
    perform private.c35_lock(false);
    if p_action<>'pause' and not private.c35_gate('matching',p_fixture) then
      raise exception 'matching closed' using errcode='42501';
    end if;$new$);
  execute definition;

  select pg_get_functiondef('private.c34_enabled()'::regprocedure) into definition;
  old_text:=$old$exists(select from private.c34_fixture) and exists(select from private.c33_fixture)
    and exists(select from private.c32_fixture) and exists(select from private.c31_fixture)$old$;
  new_text:=$new$private.c35_gate('recruitment',true)$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: private.c34_enabled()';
  end if;
  definition:=replace(definition,old_text,new_text);
  execute definition;

  select pg_get_functiondef('public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  old_text:=$old$  if command then
    perform private.s2b_lock_actor(p_actor,p_session);$old$;
  new_text:=$new$  if command then
    perform private.s2b_lock_actor(p_actor,p_session);
    if staff or (p_action='contact' and p_input->'allowed'='true') then perform private.c35_lock(staff); end if;$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$  elsif not (coalesce(p_fixture,false) and private.c34_enabled()) then$old$;
  new_text:=$new$  elsif not (coalesce(p_fixture,false) and private.c34_enabled())
    and not (coalesce(p_fixture,false) and exists(select from private.c35_fixture)
      and exists(select from private.c35_stage where capability='recruitment' and status='paused')
      and (p_action in ('inbox','open','sent','preferences','decline','withdraw','dismiss','report')
        or (p_action='contact' and p_input->'allowed'='false'))) then$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$'state','ready','allowed',coalesce(contact.allowed,false)$old$;
  new_text:=$new$'state','ready','outreachActive',private.c34_enabled(),'allowed',coalesce(contact.allowed,false)$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)';
  end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$      select * into p from private.community_projects where id=p_project for update;
      perform pg_advisory_xact_lock(20261125,341);$old$;
  if strpos(definition,old_text)=0 then raise exception 'Unexpected recruitment project lock'; end if;
  definition:=replace(definition,old_text,$new$      select * into p from private.community_projects where id=p_project for update;
      perform private.c35_lock(false);
      if not private.c35_gate('recruitment',p_fixture) then raise exception 'recruitment closed' using errcode='42501'; end if;
      perform pg_advisory_xact_lock(20261125,341);$new$);
  execute definition;

  select pg_get_functiondef('private.c34_native_application()'::regprocedure) into definition;
  old_text:=$old$  if not private.c34_enabled() then return new; end if;$old$;
  new_text:=$new$  perform private.c35_lock(false);
  if not private.c34_enabled() then return new; end if;$new$;
  if strpos(definition,old_text)=0 or strpos(substr(definition,strpos(definition,old_text)+length(old_text)),old_text)>0 then
    raise exception 'Unexpected source definition: private.c34_native_application()';
  end if;
  definition:=replace(definition,old_text,new_text);
  execute definition;
end $edit$;

-- The rotated cohort is stable for an opportunity and uses two indexed 96-row ranges.
-- The unmanaged branch exists for the isolated historical regression fixtures.
create function private.c35_discovery_cohort(opportunity uuid) returns table(actor uuid)
language sql stable set search_path='' as $$
  with position as (select case when exists(select from private.c35_fixture) then md5(opportunity::text)::uuid
    else '00000000-0000-0000-0000-000000000000'::uuid end as pivot),
  candidates as (
    (select 0 as segment,c.actor from private.c31_consents c, position p where c.discovery and c.actor>=p.pivot order by c.actor limit 96)
    union all
    (select 1 as segment,c.actor from private.c31_consents c, position p where c.discovery and c.actor<p.pivot order by c.actor limit 96)
  )
  select candidates.actor from candidates order by segment,candidates.actor limit 96
$$;
revoke all on function private.c35_discovery_cohort(uuid) from public,anon,authenticated,authenticator,service_role;

do $cohort$
declare definition text; marker text:='select actor from private.c31_consents where discovery order by actor limit 96';
begin
  select pg_get_functiondef('public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if strpos(definition,'select c.actor from private.c31_consents c where c.discovery order by c.actor limit 96')=0 then
    raise exception 'Unexpected matching cohort';
  end if;
  execute replace(definition,'select c.actor from private.c31_consents c where c.discovery order by c.actor limit 96',
    'select actor from private.c35_discovery_cohort(p_opportunity)');
  select pg_get_functiondef('public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'Unexpected recruitment cohort'; end if;
  execute replace(definition,marker,'select actor from private.c35_discovery_cohort(p_opportunity)');
end $cohort$;

-- These small bounded reads do not benefit from per-request JIT compilation.
alter function public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb) set jit='off';

create function private.c35_privacy_projection(subject uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'profile',(select to_jsonb(p)-'actor' from private.c31_profiles p where p.actor=subject),
    'skills',(select coalesce(jsonb_agg(to_jsonb(s)-'actor' order by s.code),'[]') from private.c31_selections s where s.actor=subject),
    'consent',(select to_jsonb(c)-'actor' from private.c31_consents c where c.actor=subject),
    'matchingPaused',(select paused from private.c33_pause where actor=subject),
    'contact',(select jsonb_build_object('allowed',allowed,'changedAt',changed_at) from private.c34_contact where actor=subject),
    'dismissals',(select coalesce(jsonb_agg(to_jsonb(d) order by d.opportunity,d.version),'[]') from
      (select opportunity,version,expires_at from private.c33_dismissed where actor=subject order by opportunity,version limit 101) d),
    'invitationHistory',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]') from
      (select status,created_at,expires_at,changed_at from private.c34_invitations where recipient=subject
        order by created_at desc,id limit 101) i))
$$;
revoke all on function private.c35_privacy_projection(uuid) from public,anon,authenticated,authenticator,service_role;

-- The existing session-bound disposable privacy export is the only entry point.
do $export$
declare definition text; marker text:='  select pg_catalog.jsonb_build_object('; footer text:='  )';
begin
  select pg_get_functiondef('private.privacy_export_projection(uuid)'::regprocedure) into definition;
  if strpos(definition,marker)=0 or strpos(definition,'''pollParticipation''')=0 then
    raise exception 'Unexpected privacy export projection';
  end if;
  definition:=replace(definition,
    '    ''pollParticipation'',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(''hasParticipated'',
      exists(select 1 from private.poll_ballots b where b.voter_id=p_subject)))
  )',
    '    ''pollParticipation'',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(''hasParticipated'',
      exists(select 1 from private.poll_ballots b where b.voter_id=p_subject)))
  ) || case when exists(select from private.c35_fixture) then
    pg_catalog.jsonb_build_object(''volunteering'',private.c35_privacy_projection(p_subject)) else ''{}''::jsonb end');
  if strpos(definition,'private.c35_privacy_projection(p_subject)')=0 then raise exception 'Unexpected export footer'; end if;
  execute definition;
end $export$;

-- Check directory visibility once for the discovery scope. A directory-eligible
-- project never needs a per-volunteer execution-role lookup to prove visibility.
create function private.c35_viewer(actor uuid,o private.project_opportunities,p private.community_projects,is_public boolean)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.project_execution_actor(p,actor) and private.member_onboarding_access(actor)
    and feed_data.community_member(p.community_id,actor) and not feed_data.blocked_pair(actor,o.manager_id)
    and case when is_public then true else private.project_execution_role(p,actor) is not null end
    and private.c33_standing(actor,p.id),false)
$$;

create or replace function private.c33_viewer(actor uuid,o private.project_opportunities,p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select private.c35_viewer(actor,o,p,private.project_visible(p))
$$;

create function private.c35_opportunity(r private.c32_requirements,o private.project_opportunities,
  p private.community_projects,settings jsonb,modes jsonb,catalog jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce(o.project_id=p.id and r.project=p.id and o.id=r.opportunity and r.action='publish'
    and o.closed_at is null and (o.closes_on is null or o.closes_on>=current_date)
    and feed_data.author_active(o.manager_id) and private.project_executable(p)
    and r.snapshot->>'department'=private.c22_department(p)
    and settings->'departments' ? (r.snapshot->>'department') and settings->'modes' ? (r.snapshot->>'mode')
    and modes ? (r.snapshot->>'mode')
    and exists(select from private.project_execution e where e.project_id=p.id and e.status='active'
      and e.approved_revision=(r.snapshot->>'projectRevision')::int)
    and (select count(*) from private.project_applications a where a.opportunity_id=o.id and a.status in ('offered','accepted'))<o.capacity
    and not exists(select from jsonb_array_elements(r.snapshot->'skills') as x(skill)
      where catalog->(x.skill->>'code') is distinct from x.skill->'skillVersion'),false)
$$;

revoke all on function private.c35_viewer(uuid,private.project_opportunities,private.community_projects,boolean),
  private.c35_opportunity(private.c32_requirements,private.project_opportunities,private.community_projects,jsonb,jsonb,jsonb)
  from public,anon,authenticated,authenticator,service_role;

do $optimize$
declare definition text;
begin
  select pg_get_functiondef('public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if strpos(definition,'select 1 from private.community_projects project_row')=0
    or strpos(definition,'and private.c33_viewer(x.actor,o,p)')=0
    or strpos(definition,'where (department_filter is null')=0 then raise exception 'Unexpected matching plan source'; end if;
  definition:=replace(definition,'select 1 from private.community_projects project_row',
    'select private.project_visible(project_row) as is_public from private.community_projects project_row');
  definition:=replace(definition,'and private.c33_viewer(x.actor,o,p)','and private.c35_viewer(x.actor,o,p,authorized.is_public)');
  definition:=replace(definition,'    eligible as materialized (
      select r.opportunity', '    catalog as materialized (
      select coalesce(jsonb_object_agg(code,version),''{}'') as versions from private.c32_catalog(private.c32_settings())
    ), eligible as materialized (
      select r.opportunity');
  definition:=replace(definition,'on project_row.id=r.project cross join current_profile',
    'on project_row.id=r.project cross join current_profile cross join catalog');
  definition:=replace(definition,'private.c33_opportunity(r,opp_row,project_row,settings,private.c32_settings())',
    'private.c35_opportunity(r,opp_row,project_row,settings,private.c32_settings()->''modes'',catalog.versions)');
  execute definition;
end $optimize$;

-- Treat synthetic C3 records as a protected dependency in the existing lifecycle
-- plan until message and retention dispositions are independently approved.
do $lifecycle$
declare definition text; marker text:='    union all select ''shared_media'',id::text,''preserve'' from media';
begin
  select pg_get_functiondef('private.lifecycle_inventory(uuid)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'Unexpected lifecycle inventory'; end if;
  execute replace(definition,marker,
    '    union all select ''protected_evidence'',null,''preserve'' where exists(select from private.c35_fixture)
      and (exists(select from private.c31_profiles where actor=p_subject)
        or exists(select from private.c34_invitations where recipient=p_subject or organizer=p_subject)
        or exists(select from private.c35_events where actor=p_subject))
'||marker);
end $lifecycle$;
