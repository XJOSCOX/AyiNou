-- Independent C4 stage controls. The only release authority in this migration
-- is the isolated test runner. A hosted release requires a later authorization.
create table private.c46_fixture (
  singleton boolean primary key default true check(singleton),
  release_authorized boolean not null default false,
  opportunity_operations boolean not null default false,
  opportunity_privacy boolean not null default false,
  opportunity_safeguarding boolean not null default false,
  mentorship_operations boolean not null default false,
  mentorship_privacy boolean not null default false,
  mentorship_safeguarding boolean not null default false
);

create function private.c46_capabilities() returns text[] language sql immutable set search_path='' as $$
  select array['drafts','publication','external','interest','discovery','personalization',
    'mentorship_intake','mentorship_matching','mentorship_requests','mentorship_coordination']
$$;

create table private.c46_stage (
  capability text primary key check(capability=any(private.c46_capabilities())),
  status text not null check(status in ('active','paused'))
);

create table private.c46_history (
  version integer generated always as identity primary key,
  capability text not null check(capability=any(private.c46_capabilities()||array['opportunities','mentorship','all'])),
  action text not null check(action in ('enable','pause','resume','emergency_pause','readiness_changed')),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid unique,
  fingerprint bytea,
  configuration text not null,
  reason text not null check(length(reason) between 10 and 500),
  affected text[] not null,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table private.c46_fixture enable row level security;
alter table private.c46_stage enable row level security;
alter table private.c46_history enable row level security;
revoke all on private.c46_fixture,private.c46_stage,private.c46_history from public,anon,authenticated,authenticator,service_role;

-- Include transitive prerequisites so one transaction pauses the entire branch.
-- Coordination is deliberately independent of the new-relationship funnel.
create function private.c46_dependencies(stage text) returns text[] language sql immutable set search_path='' as $$
  select case stage
    when 'publication' then array['drafts']
    when 'external' then array['drafts','publication']
    when 'interest' then array['drafts','publication']
    when 'discovery' then array['drafts','publication']
    when 'personalization' then array['drafts','publication','discovery']
    when 'mentorship_matching' then array['mentorship_intake']
    when 'mentorship_requests' then array['mentorship_intake','mentorship_matching']
    else '{}'::text[] end
$$;

create function private.c46_domain(stage text) returns text language sql immutable set search_path='' as $$
  select case when stage like 'mentorship\_%' then 'mentorship' else 'opportunities' end
$$;

create function private.c46_lock(exclusive boolean) returns void language plpgsql set search_path='' as $$
begin
  if exists(select from private.c46_fixture) then
    if exclusive then perform pg_advisory_xact_lock(20261126,460);
    else perform pg_advisory_xact_lock_shared(20261126,460); end if;
  end if;
end $$;

create function private.c46_fixture_allowed(stage text) returns boolean
language sql stable set search_path='' as $$
  select coalesce((select f.release_authorized and case private.c46_domain(stage)
    when 'mentorship' then f.mentorship_operations and f.mentorship_privacy and f.mentorship_safeguarding
    else f.opportunity_operations and f.opportunity_privacy and f.opportunity_safeguarding end
    from private.c46_fixture f),false)
$$;

-- Older suites still use their original disposable fixtures. Once C4.6 is
-- installed in an isolated rehearsal, the older fixtures cannot bypass stages.
create function private.c46_gate(stage text, synthetic boolean) returns boolean language sql stable set search_path='' as $$
  select coalesce(synthetic,false) and stage=any(private.c46_capabilities()) and
    (not exists(select from private.c46_fixture)
      or (private.c46_fixture_allowed(stage)
        and exists(select from private.c46_stage where capability=stage and status='active')
        and not exists(select from unnest(private.c46_dependencies(stage)) needed(capability)
          where not exists(select from private.c46_stage s where s.capability=needed.capability and s.status='active'))))
$$;

create function private.c46_stage_configuration(stage text) returns jsonb language sql stable set search_path='' as $$
  with present as (
    select coalesce((select max(version) from private.c41_settings),0) drafts,
      coalesce((select max(version) from private.c42_settings),0) publication,
      coalesce((select max(version) from private.c45_settings),0) discovery,
      coalesce((select version from private.c43_settings where singleton),0) intake,
      coalesce((select max(version) from private.c44_preparation),0) coordination,
      (select md5(coalesce(string_agg(code||':'||version||':'||status,',' order by code),'')) from private.c31_skills) catalog
  )
  select case stage
    when 'drafts' then jsonb_build_object('drafts',drafts,'catalog',catalog)
    when 'publication' then jsonb_build_object('drafts',drafts,'publication',publication)
    when 'external' then jsonb_build_object('drafts',drafts,'publication',publication)
    when 'interest' then jsonb_build_object('drafts',drafts,'publication',publication)
    when 'discovery' then jsonb_build_object('drafts',drafts,'publication',publication,'discovery',discovery,'catalog',catalog)
    when 'personalization' then jsonb_build_object('drafts',drafts,'publication',publication,'discovery',discovery,'catalog',catalog)
    when 'mentorship_intake' then jsonb_build_object('intake',intake,'catalog',catalog)
    when 'mentorship_coordination' then jsonb_build_object('intake',intake,'coordination',coordination,'catalog',catalog)
    else jsonb_build_object('intake',intake,'coordination',coordination,'catalog',catalog)
  end from present
$$;

create function private.c46_digest(stage text) returns text language sql stable set search_path='' as $$
  select encode(sha256(convert_to(case when stage=any(private.c46_capabilities()) then private.c46_stage_configuration(stage)
    else (select jsonb_object_agg(key,private.c46_stage_configuration(key))
      from unnest(private.c46_capabilities()) key where stage='all' or private.c46_domain(key)=stage) end::text,'UTF8')),'hex')
$$;

create function private.c46_config_ready(stage text, configuration jsonb) returns boolean
language sql stable set search_path='' as $$
  select not exists(select from jsonb_each(configuration) c(k,v)
      where c.k<>'catalog' and c.v='0'::jsonb)
    and case stage
      when 'drafts' then coalesce((select jsonb_array_length(settings->'types')>0
        and jsonb_array_length(settings->'scopes')>0 and jsonb_array_length(settings->'modes')>0
        and jsonb_array_length(settings->'organizationKinds')>0 from private.c41_settings order by version desc limit 1),false)
      when 'publication' then jsonb_array_length(private.c42_configuration()->'types')>0
        and jsonb_array_length(private.c42_configuration()->'methods')>0
      when 'external' then private.c42_configuration()->'methods' ? 'external'
      when 'interest' then private.c42_configuration()->'methods' ? 'expression_of_interest'
      when 'discovery' then jsonb_array_length(private.c45_settings_current()->'types')>0
        and jsonb_array_length(private.c45_settings_current()->'scopes')>0
      when 'personalization' then jsonb_array_length(private.c45_settings_current()->'criteria')>0
        and jsonb_array_length(private.c45_settings_current()->'fields')>0
      else coalesce((select jsonb_array_length(s.configuration->'roles')>0
        and jsonb_array_length(s.configuration->'topics')>0 and jsonb_array_length(s.configuration->'modes')>0
        and jsonb_array_length(s.configuration->'geographies')>0 and length(s.safeguarding_plan)>0
        from private.c43_settings s where s.singleton),false)
    end
$$;

create function private.c46_reviewer_ready() returns boolean language sql stable set search_path='' as $$
  select exists(select from private.c42_reviewers g where g.revoked_at is null and g.expires_at>statement_timestamp()
    and private.institution_reviewer(g.reviewer) and private.member_identity_verified(g.reviewer))
$$;

create function private.c46_technical(stage text) returns boolean language sql stable set search_path='' as $$
  select case when stage in ('drafts','personalization','mentorship_intake','mentorship_matching','mentorship_requests','mentorship_coordination')
    then exists(select from private.c31_skills where status='active') else true end
$$;

create function private.c46_test_prerequisites(stage text) returns boolean language sql stable set search_path='' as $$
  select case stage
    when 'drafts' then exists(select from private.c41_fixture)
    when 'publication' then exists(select from private.c42_fixture)
    when 'discovery' then exists(select from private.c45_fixture)
    when 'personalization' then exists(select from private.c45_fixture)
    when 'mentorship_intake' then exists(select from private.c43_fixture)
    when 'mentorship_matching' then exists(select from private.c44_fixture)
    when 'mentorship_requests' then exists(select from private.c44_fixture)
    when 'mentorship_coordination' then exists(select from private.c43_fixture) and exists(select from private.c44_fixture)
    else true end
$$;

create function private.c46_readiness(stage text, synthetic boolean) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'configuration',private.c46_stage_configuration(stage),
    'configurationPrepared',private.c46_config_ready(stage,private.c46_stage_configuration(stage)),
    'technicalReady',private.c46_technical(stage),
    'operationsApproved',coalesce(synthetic and case private.c46_domain(stage)
      when 'mentorship' then f.mentorship_operations else f.opportunity_operations end,false),
    'privacyApproved',coalesce(synthetic and case private.c46_domain(stage)
      when 'mentorship' then f.mentorship_privacy else f.opportunity_privacy end,false),
    'safeguardingApproved',coalesce(synthetic and case private.c46_domain(stage)
      when 'mentorship' then f.mentorship_safeguarding else f.opportunity_safeguarding end,false),
    'reviewerReady',case when stage='publication' then private.c46_reviewer_ready() end,
    'releaseAuthorized',coalesce(synthetic and f.release_authorized,false),
    'dependencies',(select coalesce(jsonb_object_agg(dep,synthetic and exists(select from private.c46_fixture)
      and private.c46_gate(dep,synthetic)),'{}') from unnest(private.c46_dependencies(stage)) dep))
  from (select 1) anchor left join private.c46_fixture f on f.singleton
$$;

create index c46_publication_pause on private.c46_history(recorded_at desc)
  where affected @> array['publication'] and action in ('pause','emergency_pause','readiness_changed');

create function private.c46_publication_cutoff() returns timestamptz
language sql stable set search_path='' as $$
  select coalesce((select recorded_at from private.c46_history
    where affected @> array['publication'] and action in ('pause','emergency_pause','readiness_changed')
    order by recorded_at desc limit 1),'-infinity'::timestamptz)
$$;

create function private.c46_pause(target text) returns text[]
language plpgsql set search_path='' as $$
declare affected text[];
begin
  with changed as (
    update private.c46_stage set status='paused'
      where status='active' and (target in ('all',capability,private.c46_domain(capability))
        or target=any(private.c46_dependencies(capability))) returning capability
  ) select coalesce(array_agg(capability order by capability),'{}') into affected from changed;

  if affected && array['publication','external','interest','discovery','personalization'] then
    update private.c45_fixture set cursor_key=extensions.gen_random_bytes(32) where singleton;
  end if;
  if affected && array['mentorship_intake','mentorship_matching','mentorship_requests','mentorship_coordination'] then
    update private.c44_fixture set selection_key=extensions.gen_random_bytes(32) where singleton;
  end if;
  if 'mentorship_requests'=any(affected) then
    with closed as (
      update private.c44_requests set state='invalidated',version=version+1,introduction=''
        where state='pending' or (state='accepted' and exists(select from private.c44_relationships r
          where r.request=c44_requests.id and r.state='agreement_pending'))
        returning id,version
    ) insert into private.c44_events(request,action,state,version)
      select id,'activation_pause','invalidated',version from closed;
  end if;
  if affected && array['mentorship_requests','mentorship_coordination'] then
    with closed as (
      update private.c44_relationships set
        state=case when state='agreement_pending' then 'ended' else 'paused' end,
        completion_actor=null,version=version+1
      where (state='agreement_pending' and ('mentorship_coordination'=any(affected) or exists(
        select from private.c44_requests r where r.id=c44_relationships.request and r.state='invalidated')))
        or (state='active' and 'mentorship_coordination'=any(affected))
      returning id,state,version
    ) insert into private.c44_events(relationship,action,state,version)
      select id,'activation_pause',state,version from closed;
  end if;
  return affected;
end $$;

create function private.c46_configuration_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare affected text[]; target text;
begin
  if not exists(select from private.c46_fixture) then return null; end if;
  perform private.c46_lock(true);
  foreach target in array tg_argv loop
    affected:=private.c46_pause(target);
    if cardinality(affected)>0 then
      insert into private.c46_history(capability,action,configuration,reason,affected)
        values(target,'readiness_changed',private.c46_digest(target),
          'Configuration or readiness changed. Explicit resumption is required.',affected);
    end if;
  end loop;
  return null;
end $$;

create trigger c46_draft_configuration after insert or update or delete on private.c41_settings
  for each statement execute function private.c46_configuration_changed('drafts');
create trigger c46_publication_configuration after insert or update or delete on private.c42_settings
  for each statement execute function private.c46_configuration_changed('publication');
create trigger c46_discovery_configuration after insert or update or delete on private.c45_settings
  for each statement execute function private.c46_configuration_changed('discovery');
create trigger c46_intake_configuration after insert or update or delete on private.c43_settings
  for each statement execute function private.c46_configuration_changed('mentorship');
create trigger c46_coordination_configuration after insert or update or delete on private.c44_preparation
  for each statement execute function private.c46_configuration_changed('mentorship_matching','mentorship_coordination');
create trigger c46_catalog_changed after insert or update or delete on private.c31_skills
  for each statement execute function private.c46_configuration_changed('drafts','mentorship');
create trigger c46_readiness_changed after update on private.c46_fixture
  for each statement execute function private.c46_configuration_changed('all');

create function public.c46_activation_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  latest integer;
  stage_key text:=p_input->>'capability';
  command text:=p_input->>'command';
  request_key uuid;
  fingerprint bytea;
  reason text:=btrim(p_input->>'reason');
  cfg text;
  previous private.c46_history;
  old_status text;
  affected text[];
  readiness jsonb;
begin
  if p_action is null or p_action not in ('read','change') or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>2200 then raise exception 'invalid command' using errcode='23514'; end if;
  if p_action='change' then
    perform pg_advisory_xact_lock(20261126,460);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false) and private.member_onboarding_access(p_actor)
    and feed_data.author_active(p_actor) and private.platform_founder(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    then raise exception 'Founder workspace required' using errcode='42501'; end if;
  select coalesce(max(h.version),0) into latest from private.c46_history h;

  if p_action='read' then
    if p_input<>'{}' then raise exception 'invalid read' using errcode='23514'; end if;
    return jsonb_build_object('version',latest,
      'emergency',(select jsonb_object_agg(target,private.c46_digest(target)) from unnest(array['all','mentorship','opportunities']) target),
      'stages',(select jsonb_agg(jsonb_build_object('capability',ordered.key,'digest',private.c46_digest(ordered.key),
        'status',case when not coalesce(p_fixture,false) or not exists(select from private.c46_fixture) then 'disabled'
          when s.status='active' and not private.c46_gate(ordered.key,p_fixture) then 'paused'
          else coalesce(s.status,'disabled') end,
        'readiness',private.c46_readiness(ordered.key,coalesce(p_fixture,false))) order by ordered.ordinal)
        from unnest(private.c46_capabilities()) with ordinality ordered(key,ordinal)
        left join private.c46_stage s on s.capability=ordered.key),
      'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
        from (select e.version,e.capability,e.action,e.reason,e.affected,e.recorded_at as at
          from private.c46_history e order by e.version desc limit 25) h));
  end if;

  if p_input-array['capability','command','reason','configuration','expectedVersion','requestId','confirmed']<>'{}'
    or not coalesce(case when stage_key=any(private.c46_capabilities()) then command in ('enable','pause','resume')
      when stage_key in('opportunities','mentorship','all') then command='emergency_pause' else false end,false)
    or not coalesce(private.c43_number(p_input->'expectedVersion',0,2147483646),false)
    or p_input->'confirmed' is distinct from 'true'
    or not coalesce(length(reason) between 10 and 500 and reason !~ '[[:cntrl:]]',false)
    or not coalesce((p_input->>'configuration')~'^[a-f0-9]{64}$',false)
    or jsonb_typeof(p_input->'requestId') is distinct from 'string'
    then raise exception 'invalid transition' using errcode='23514'; end if;
  request_key:=(p_input->>'requestId')::uuid;
  fingerprint:=sha256(convert_to(p_input::text,'UTF8'));
  select * into previous from private.c46_history where request_id=request_key;
  if found then
    if previous.actor is distinct from p_actor or previous.workspace is distinct from p_workspace or previous.fingerprint<>fingerprint
      then raise exception 'conflicting receipt' using errcode='40001'; end if;
    return jsonb_build_object('version',previous.version,'affected',previous.affected);
  end if;
  cfg:=private.c46_digest(stage_key);
  if latest<>(p_input->>'expectedVersion')::integer or cfg is distinct from p_input->>'configuration'
    then raise exception 'stale activation state' using errcode='40001'; end if;
  select s.status into old_status from private.c46_stage s where s.capability=stage_key;
  if command in ('pause','emergency_pause') then
    if (command='pause' and old_status is distinct from 'active')
      or (command='emergency_pause' and not exists(select from private.c46_stage s where s.status='active'
        and (stage_key='all' or private.c46_domain(s.capability)=stage_key)))
      then raise exception 'nothing to pause' using errcode='40001'; end if;
    affected:=private.c46_pause(stage_key);
  else
    readiness:=private.c46_readiness(stage_key,coalesce(p_fixture,false));
    if not coalesce(p_fixture,false) or not private.c46_fixture_allowed(stage_key)
      or not private.c46_test_prerequisites(stage_key)
      or readiness->'configurationPrepared' is distinct from 'true'
      or readiness->'technicalReady' is distinct from 'true'
      or readiness->'reviewerReady'='false'
      or exists(select from jsonb_each(readiness->'dependencies') r where r.value='false')
      then raise exception 'activation readiness unavailable' using errcode='42501'; end if;
    if (command='enable' and old_status is not null) or (command='resume' and old_status is distinct from 'paused')
      then raise exception 'invalid transition' using errcode='40001'; end if;
    insert into private.c46_stage values(stage_key,'active') on conflict on constraint c46_stage_pkey do update set status='active';
    affected:=array[stage_key];
  end if;
  insert into private.c46_history(capability,action,actor,workspace,request_id,fingerprint,configuration,reason,affected)
    values(stage_key,command,p_actor,p_workspace,request_key,fingerprint,cfg,reason,affected) returning version into latest;
  return jsonb_build_object('version',latest,'affected',affected);
exception when invalid_text_representation then raise exception 'invalid transition' using errcode='23514';
end $$;

revoke all on function public.c46_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c46_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb) to service_role;

create function private.c46_review_accepted(reviewer uuid, opportunity_id uuid, revision_number integer,
  authority_id uuid, assignment_deadline timestamptz) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c42_receipts e where e.opportunity=opportunity_id and e.revision=revision_number
    and e.action='accept_assignment' and e.actor=reviewer and e.subject=authority_id
    and e.result->'assignmentUntil'=to_jsonb(assignment_deadline)
    and e.result->>'assignmentReceipt'=(select a.id::text from private.c42_receipts a
      where a.opportunity=opportunity_id and a.revision=revision_number and a.action='assign' and a.subject=authority_id
      order by a.id desc limit 1))
$$;

create function private.c46_application_methods(snapshot jsonb, organization uuid)
returns jsonb language sql stable set search_path='' as $$
  select private.c42_methods(snapshot,organization) || jsonb_build_object(
    'external', (snapshot->>'applicationMethod'='external' and private.c42_configuration()->'methods' ? 'external')
      and private.c46_gate('external',true),
    'interest', (snapshot->>'applicationMethod'='expression_of_interest' and private.c42_configuration()->'methods' ? 'expression_of_interest')
      and private.c46_gate('interest',true))
$$;

-- Update reviewed gate and disclosure points in place. This preserves signatures,
-- security settings, grants, and the rest of the existing per-action checks.
do $integrate$
declare spec record; definition text; updated text;
begin
  for spec in select * from (values
    ('public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$begin
  if p_action is null$point$, $point$begin
  perform private.c46_lock(p_action='configure');
  if p_action is null$point$),
    ('public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'canCreate',draft_access and fixture$point$, $point$'canCreate',draft_access and fixture and private.c46_gate('drafts',p_fixture)$point$),
    ('public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'canEdit',edit_access and fixture,$point$, $point$'canEdit',edit_access and fixture and private.c46_gate('drafts',p_fixture),
      'intakePaused',fixture and not private.c46_gate('drafts',p_fixture),$point$),
    ('public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$  if not fixture then raise exception 'draft preparation closed' using errcode='42501'; end if;$point$, $point$  if not fixture or (p_action in ('create','edit') and not private.c46_gate('drafts',p_fixture))
    then raise exception 'draft preparation closed' using errcode='42501'; end if;$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$begin
  if p_action is null$point$, $point$begin
  perform private.c46_lock(p_action in ('configure','revoke'));
  if p_action is null$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$  if write_action then
    req:=$point$, $point$  if p_action in ('submit','assign','release','decide','recuse','challenge','publish','public_list','public_detail')
      and not private.c46_gate('publication',p_fixture) then
    if p_action in ('public_list','public_detail') then return '{"enabled":false,"items":[]}'::jsonb; end if;
    raise exception 'publication stages closed' using errcode='42501';
  end if;
  if (p_action='destination' and not private.c46_gate('external',p_fixture))
    or (p_action in ('interest_preview','express') and not private.c46_gate('interest',p_fixture))
    then raise exception 'application stage closed' using errcode='42501'; end if;
  if write_action then
    req:=$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'canSubmit',private.c42_representative$point$, $point$'canSubmit',private.c46_gate('publication',p_fixture) and private.c42_representative$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'canPublish',private.c42_representative$point$, $point$'canPublish',private.c46_gate('publication',p_fixture) and private.c42_representative$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$private.c42_methods(r.snapshot,p.organization) methods$point$, $point$private.c46_application_methods(r.snapshot,p.organization) methods$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$and (p_actor is null or not feed_data.blocked_pair(p_actor,p.responsible))$point$, $point$and (p_actor is null or (not feed_data.blocked_pair(p_actor,p.responsible) and not feed_data.blocked_pair(p_actor,p.published_by)))$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$          and not feed_data.blocked_pair(p_actor,p.responsible)$point$, $point$          and not feed_data.blocked_pair(p_actor,p.responsible) and not feed_data.blocked_pair(p_actor,p.published_by)$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$        or not private.c42_publication_eligible(published,source) then raise exception 'recipient access denied' using errcode='42501'; end if;$point$, $point$        or published.opportunity is null
        or (p_action='interest_state' and not private.c42_publication_eligible(published,source))
        then raise exception 'recipient access denied' using errcode='42501'; end if;$point$),
    ('public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)', $point$begin
  if p_lane is null$point$, $point$begin
  perform private.c46_lock(p_action='configure');
  if p_lane is null$point$),
    ('public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)', $point$fixture:=coalesce(p_fixture,false) and exists(select from private.c43_fixture);$point$, $point$fixture:=private.c46_gate('mentorship_intake',p_fixture) and exists(select from private.c43_fixture);$point$),
    ('public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$begin
  if p_action is null$point$, $point$begin
  perform private.c46_lock(p_action='configure');
  if p_action is null$point$),
    ('public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$  if p_action in('recommendations','discovery') then$point$, $point$  if p_action in('recommendations','discovery','dismiss') and not private.c46_gate('mentorship_matching',p_fixture) then
    if p_action<>'dismiss' then return '{"state":"closed","items":[],"next":null}'::jsonb; end if;
    raise exception 'mentorship matching closed' using errcode='42501';
  end if;
  if (p_action in ('send','accept') and not private.c46_gate('mentorship_requests',p_fixture))
    or (p_action='accept' and not private.c46_gate('mentorship_coordination',p_fixture))
    then raise exception 'new relationships closed' using errcode='42501'; end if;

  if p_action in('recommendations','discovery') then$point$),
    ('public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$      return private.c44_workspace(r,p_actor,settings,catalog);$point$, $point$      return private.c44_workspace(r,p_actor,settings,catalog) || jsonb_build_object('coordinationPaused',not private.c46_gate('mentorship_coordination',p_fixture));$point$),
    ('public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$    if not private.c43_number(p_input->'expectedVersion',1,2147483646)
      or r.version$point$, $point$    if p_action<>'end' and not private.c46_gate('mentorship_coordination',p_fixture)
      then raise exception 'relationship coordination closed' using errcode='42501'; end if;
    if p_action in ('propose_agreement','confirm_agreement') and r.active_revision is null and
      (q.state<>'accepted' or not private.c46_gate('mentorship_requests',p_fixture))
      then raise exception 'new relationships closed' using errcode='42501'; end if;
    if not private.c43_number(p_input->'expectedVersion',1,2147483646)
      or r.version$point$),
    ('private.c45_listing(uuid,uuid,jsonb)', $point$private.c42_methods(r.snapshot,p.organization) as methods$point$, $point$private.c46_application_methods(r.snapshot,p.organization) as methods$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$begin
  if p_action is null$point$, $point$begin
  perform private.c46_lock(p_action='configure');
  if p_action is null$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$allowed:=signing_key is not null and private.member_onboarding_access(p_actor);$point$, $point$allowed:=signing_key is not null and private.member_onboarding_access(p_actor) and private.c46_gate('discovery',p_fixture);$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$  elsif p_action='list' then
    if not allowed then$point$, $point$  elsif p_action='list' then
    if not allowed then
      if signing_key is not null and p_input->>'view'='saved' and p_input-array['view']='{}'
        and private.member_onboarding_access(p_actor) then
        return jsonb_build_object('state','available','items',(select coalesce(jsonb_agg(
          jsonb_build_object('id',b.opportunity,'unavailable',true,'saved',true) order by b.saved_at desc,b.opportunity),'[]')
          from (select opportunity,saved_at from private.c45_saved where actor=p_actor order by saved_at desc,opportunity limit 200) b),
          'next',null,'version',coalesce(owner_state.version,0));
      end if;$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$    return private.c45_page(p_actor,p_input,configuration,profile,signing_key) ||$point$, $point$    if p_input->>'view'='forYou' and not private.c46_gate('personalization',p_fixture) then
      return jsonb_build_object('state','personalization_disabled','items','[]'::jsonb,'next',null,'version',coalesce(owner_state.version,0));
    end if;
    return private.c45_page(p_actor,p_input,configuration,profile,signing_key) ||$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$  if not allowed and p_action not in$point$, $point$  if p_action in ('opt_in','resume','dismiss') and not private.c46_gate('personalization',p_fixture)
    then raise exception 'personalization stage closed' using errcode='42501'; end if;
  if not allowed and p_action not in$point$)
,
    ('public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$return private.c44_candidates(own,p_action,p_input-array['role','cursor'],p_input->>'cursor',settings,catalog,signing_key);$point$, $point$return private.c44_candidates(own,p_action,p_input-array['role','cursor'],p_input->>'cursor',settings,catalog,signing_key)
      || jsonb_build_object('requestsOpen', private.c46_gate('mentorship_requests',p_fixture) and private.c46_gate('mentorship_coordination',p_fixture));$point$),
    ('public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)', $point$'preferences',coalesce(profile.preferences,private.c45_empty_preferences()),'consent',coalesce(profile.consent,false),$point$, $point$'preferences',coalesce(profile.preferences,private.c45_empty_preferences()),'consent',coalesce(profile.consent,false),
      'personalizationAvailable',allowed and private.c46_gate('personalization',p_fixture),$point$),
    ('private.c42_publication_eligible(private.c42_publications,jsonb)', $point$select coalesce(p.suppressed_at is null$point$, $point$select coalesce(p.suppressed_at is null and p.published_at>private.c46_publication_cutoff()$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$insert into private.c42_publications(opportunity,revision,organization,responsible,published_by)
        values(item.id,expected,scope_org,item.representative,p_actor);$point$, $point$insert into private.c42_publications(opportunity,revision,organization,responsible,published_by,published_at)
        values(item.id,expected,scope_org,item.representative,p_actor,clock_timestamp());$point$),
    ('private.c45_page(uuid,jsonb,jsonb,private.c45_preferences,bytea)', $point$  today date:=(statement_timestamp() at time zone 'America/Port-au-Prince')::date;$point$, $point$  today date:=(statement_timestamp() at time zone 'America/Port-au-Prince')::date;
  published_after timestamptz:=private.c46_publication_cutoff();$point$),
    ('private.c45_page(uuid,jsonb,jsonb,private.c45_preferences,bytea)', $point$where sort_order<>'closing' and (before_id is null$point$, $point$where sort_order<>'closing' and k.published_at>published_after and (before_id is null$point$),
    ('private.c45_page(uuid,jsonb,jsonb,private.c45_preferences,bytea)', $point$where sort_order='closing' and (before_id is null$point$, $point$where sort_order='closing' and k.published_at>published_after and (before_id is null$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$review_lane boolean:=p_action in ('review_queue','review_reports','decide','recuse','restrict');$point$, $point$review_lane boolean:=p_action in ('review_queue','review_reports','accept_assignment','decide','recuse','restrict');$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'assign','release','submit','decide','recuse','challenge',$point$, $point$'assign','release','submit','accept_assignment','decide','recuse','challenge',$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$'review_queue','review_reports','decide','recuse','restrict','submit'$point$, $point$'review_queue','review_reports','accept_assignment','decide','recuse','restrict','submit'$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$p_action in ('submit','assign','release','decide','recuse','challenge','publish'$point$, $point$p_action in ('submit','assign','release','accept_assignment','decide','recuse','challenge','publish'$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$        case when review_lane then r.snapshot end as snapshot,$point$, $point$        case when review_lane then r.snapshot end as snapshot,
        case when review_lane then private.c46_review_accepted(p_actor,c.opportunity,c.revision,c.authority,c.assigned_until) end as assignment_accepted,$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$elsif p_action in ('decide','recuse') then$point$, $point$elsif p_action in ('accept_assignment','decide','recuse') then$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$      if p_action='recuse' then
        update private.c42_cases$point$, $point$      if p_action='accept_assignment' then
        if not private.c42_independent(p_actor,item,review) or p_input->'confirmed' is distinct from 'true'
          then raise exception 'eligible independent reviewer required' using errcode='42501'; end if;
        if private.c46_review_accepted(p_actor,item.id,expected,review.authority,review.assigned_until)
          then raise exception 'assignment already accepted' using errcode='55000'; end if;
        target:=review.authority;
        result:=jsonb_build_object('status','assigned','version',expected,'accepted',true,'assignmentUntil',review.assigned_until,
          'assignmentReceipt',(select a.id::text from private.c42_receipts a where a.opportunity=item.id and a.revision=expected
            and a.action='assign' and a.subject=review.authority order by a.id desc limit 1));
      elsif p_action='recuse' then
        update private.c42_cases$point$),
    ('public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)', $point$        if not private.c42_independent(p_actor,item,review) or p_input->'confirmed' is distinct from 'true'
          then raise exception 'independent review required'$point$, $point$        if not private.c42_independent(p_actor,item,review) or p_input->'confirmed' is distinct from 'true'
          or not private.c46_review_accepted(p_actor,item.id,expected,review.authority,review.assigned_until)
          then raise exception 'independent review required'$point$)
  ) replacements(signature, before_text, after_text)
  loop
    definition:=pg_get_functiondef(spec.signature::regprocedure);
    updated:=replace(definition,spec.before_text,spec.after_text);
    if (length(definition)-length(replace(definition,spec.before_text,'')))<>length(spec.before_text)
      then raise exception 'C4.6 gate point does not match %',spec.signature; end if;
    execute updated;
  end loop;
end $integrate$;

do $acl$
declare signature text;
begin
  for signature in select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'c46\_%'
  loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated,authenticator,service_role';
  end loop;
end $acl$;


-- Synthetic lifecycle planning includes the owner-side FK inventory plus a
-- coarse review blocker for data shared with an applicant, publisher or peer.
-- No partner identity, application statement or mentorship text is returned.
create function private.c46_privacy_review(subject uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c46_fixture) and (
    exists(select from private.c41_revisions r where subject in(r.revised_by,r.representative))
    or exists(select from private.c42_publications p where subject in(p.responsible,p.published_by))
    or exists(select from private.c42_interest i where i.member=subject)
    or exists(select from private.c42_reviewers r where r.reviewer=subject)
    or exists(select from private.c45_owner_state p where p.actor=subject)
    or exists(select from private.c43_profiles p where p.actor=subject)
    or exists(select from private.c44_requests r where subject in(r.sender,r.recipient))
    or exists(select from private.c44_reports r where r.reporter=subject)
    or exists(select from private.c46_history h where h.actor=subject))
$$;
revoke all on function private.c46_privacy_review(uuid) from public,anon,authenticated,authenticator,service_role;

do $privacy$
declare
  body text:=pg_get_functiondef('private.lifecycle_inventory(uuid)'::regprocedure);
  marker text:=$point$    union all select 'inventory_limit',null,'block' where greatest($point$;
begin
  if strpos(body,marker)=0 then raise exception 'C4 lifecycle inventory gate point missing'; end if;
  execute replace(body,marker,$point$    union all select 'c4_privacy_review',null,'block' where private.c46_privacy_review(p_subject)
    union all select 'inventory_limit',null,'block' where greatest($point$);
end $privacy$;
