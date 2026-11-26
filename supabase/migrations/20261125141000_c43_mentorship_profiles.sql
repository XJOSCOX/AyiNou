-- C4.3 adds private preferences. Only an isolated disposable database can open intake.
create table private.c43_fixture (singleton boolean primary key check(singleton));
create table private.c43_settings (
  singleton boolean primary key check(singleton),
  version integer not null check(version>0),
  configuration jsonb not null check(jsonb_typeof(configuration)='object'),
  safeguarding_plan text not null check(length(safeguarding_plan)<=500),
  readiness_notes text not null check(length(readiness_notes)<=500)
);
create table private.c43_profiles (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('mentor','mentee')),
  version integer not null check(version>0),
  preferences jsonb not null check(jsonb_typeof(preferences)='object' and octet_length(preferences::text)<=10000),
  adult_at timestamptz not null,
  participation_at timestamptz,
  safeguarding_at timestamptz not null,
  paused boolean not null default false,
  recommendations boolean not null default false,
  discovery boolean not null default false,
  requests boolean not null default false,
  consent_recorded_at timestamptz not null default statement_timestamp(),
  request_id uuid not null,
  request_hash text not null,
  unique(actor,role),
  check(participation_at is not null or (paused and not recommendations and not discovery and not requests))
);
create table private.c43_skills (
  profile uuid not null references private.c43_profiles(id) on delete cascade,
  code text not null references private.c31_skills(code),
  version integer not null check(version>0),
  names jsonb not null,
  proficiency text not null check(proficiency in ('beginner','intermediate','advanced')),
  primary key(profile,code)
);
create index c43_skills_catalog on private.c43_skills(code);
create table private.c43_admin_history (
  version integer primary key check(version>0),
  request_id uuid not null unique,
  request_hash text not null,
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  reason text not null check(length(reason) between 10 and 500),
  configuration jsonb not null,
  recorded_at timestamptz not null default statement_timestamp()
);
do $$
declare relation text;
begin
  foreach relation in array array['fixture','settings','profiles','skills','admin_history'] loop
    execute format('alter table private.%I enable row level security','c43_'||relation);
    execute format('revoke all on table private.%I from public, anon, authenticated, authenticator, service_role','c43_'||relation);
  end loop;
end $$;

create function private.c43_defaults() returns jsonb language sql immutable set search_path='' as $$
  select '{
    "roles":["mentor","mentee"],
    "topics":["beginner_guidance","career_development","entrepreneurship","professional_development","educational_guidance",
      "technical_development","leadership","professional_communication","business_development","skilled_trades","language_learning"],
    "fields":["experience","summary","goals"],
    "skillCategories":["education","healthcare","engineering","agriculture","environment","technology","business","finance",
      "administration","community","logistics","communications","arts","trades","languages"],
    "modes":["remote","on_site","hybrid"],
    "geographies":["haiti_departments","haiti_nationwide","international","worldwide_remote"],
    "maxWeeklyHours":16,"maxSessionMinutes":120,"maxDurationWeeks":52,"maxCapacity":8
  }'::jsonb
$$;

create function private.c43_strings(input jsonb, vocabulary jsonb, maximum integer)
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(input)='array' then
    jsonb_array_length(input)<=maximum and
    (select count(*)=count(distinct v) and coalesce(bool_and(jsonb_typeof(v)='string'
      and (vocabulary is null or vocabulary @> jsonb_build_array(v))),true) from jsonb_array_elements(input) v)
    else false end
$$;

create function private.c43_number(input jsonb, minimum integer, maximum integer)
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(input)='number' and input::text ~ '^[0-9]{1,10}$'
    then input::text::numeric between minimum and maximum else false end
$$;

create function private.c43_text(input jsonb, minimum integer, maximum integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(input)='string' and length(trim(input#>>'{}')) between minimum and maximum
    and regexp_replace(input#>>'{}',E'\\n','','g') !~ '[[:cntrl:]]',false)
$$;

create function private.c43_complete(role text, preferences jsonb)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_array_length(preferences->'topics')>0 and jsonb_array_length(preferences->'languages')>0
    and (role='mentor' or length(trim(preferences->>'learningObjectives'))>0)
$$;

create function private.c43_allowed(role text, preferences jsonb, configuration jsonb)
returns boolean language sql immutable set search_path='' as $$
  select configuration->'roles' ? role
    and configuration->'topics' @> (preferences->'topics')
    and configuration->'modes' ? (preferences->>'mode')
    and configuration->'geographies' ? (preferences->>'geography')
    and private.c43_number(preferences->'weeklyHours',1,(configuration->>'maxWeeklyHours')::integer)
    and private.c43_number(preferences->'sessionMinutes',15,(configuration->>'maxSessionMinutes')::integer)
    and private.c43_number(preferences->'durationWeeks',1,(configuration->>'maxDurationWeeks')::integer)
    and (role='mentee' or private.c43_number(preferences->'capacity',1,(configuration->>'maxCapacity')::integer))
$$;

create function public.c43_mentorship_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  defaults constant jsonb:=private.c43_defaults();
  departments constant jsonb:='["HT-AR","HT-CE","HT-GA","HT-NI","HT-ND","HT-NE","HT-NO","HT-OU","HT-SD","HT-SE"]';
  languages constant jsonb:='["ht","fr","en","es","pt","de","ar","zh","asl"]';
  levels constant jsonb:='["beginner","intermediate","advanced"]';
  countries constant text[]:=string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ');
  preference_keys constant text[]:=array['topics','skills','languages','mode','geography','departments','countries','weeklyHours',
    'sessionMinutes','durationWeeks','capacity','expiresOn','summary','experience','goals','learningObjectives'];
  now_at constant timestamptz:=statement_timestamp();
  today constant date:=(now_at at time zone 'America/Port-au-Prince')::date;
  settings private.c43_settings;
  current_profile private.c43_profiles;
  prior private.c43_admin_history;
  profile_preferences jsonb;
  configuration jsonb;
  consents jsonb;
  item jsonb;
  key text;
  selected_role text;
  selected_code text;
  search_term text;
  reason_input text;
  request_key uuid;
  hash_input text;
  expected integer;
  next_version integer;
  profile_id uuid;
  imports jsonb;
  fixture boolean;
  eligible boolean;
  identity_ok boolean;
  active_config boolean;
begin
  if p_lane is null or p_action is null or p_lane not in ('owner','founder')
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'member session required' using errcode='42501'; end if;
  if p_action not in ('read','catalog') then
    perform private.s2b_lock_actor(p_actor,p_session);
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'member session required' using errcode='42501'; end if;
  end if;
  if p_lane='founder' and not coalesce(private.platform_founder(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
  then raise exception 'Founder workspace required' using errcode='42501'; end if;

  if p_action='configure' and p_lane='founder' then
    perform pg_advisory_xact_lock(20261125,430);
  elsif p_action in ('save','resume') and p_lane='owner' then
    perform pg_advisory_xact_lock_shared(20261125,430);
    perform pg_advisory_xact_lock_shared(20261125,310);
  end if;
  select * into settings from private.c43_settings;
  configuration:=coalesce(settings.configuration,defaults);
  if p_lane='founder' and p_action='read' and p_input='{}' then
    return jsonb_build_object('version',coalesce(settings.version,0),'live',false,'configuration',configuration,
      'safeguardingPlan',coalesce(settings.safeguarding_plan,''),'readinessNotes',coalesce(settings.readiness_notes,''),
      'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
        from (select version,reason,recorded_at as "recordedAt" from private.c43_admin_history order by version desc limit 20) h));
  end if;
  fixture:=coalesce(p_fixture,false) and exists(select from private.c43_fixture);
  eligible:=coalesce(feed_data.author_active(p_actor) and private.member_onboarding_access(p_actor),false);
  identity_ok:=coalesce(private.member_identity_verified(p_actor),false);
  if p_lane='owner' and p_action='read' and p_input='{}' then
    return jsonb_build_object('intake',fixture and eligible,'mentorIdentity',identity_ok,
      'nativeDiscovery',coalesce(private.member_discoverable(p_actor),false),'configuration',configuration,
      'volunteerSkills',case when fixture and eligible then (
        select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'names',s.names,'version',s.version,'status',s.status)
          order by s.code),'[]') from private.c31_selections v join private.c31_skills s using(code)
        where v.actor=p_actor and s.status='active' and configuration->'skillCategories' ? s.category) else '[]'::jsonb end,
      'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'version',p.version,
        'paused',p.paused,'adult',p.adult_at is not null,'participation',p.participation_at is not null,'safeguarding',p.safeguarding_at is not null,
        'preferences',p.preferences || jsonb_build_object('skills',s.preferences),
        'skills',s.details,'consent',jsonb_build_object('recommendations',p.recommendations,'discovery',p.discovery,'requests',p.requests,'public',false),
        'status',case when not private.c43_complete(p.role,p.preferences) then 'incomplete'
          when (p.preferences->>'expiresOn')::date<today then 'expired'
          when not fixture or not eligible or p.paused or p.participation_at is null or (p.role='mentor' and not identity_ok)
            or not coalesce(private.c43_allowed(p.role,p.preferences,configuration),false) then 'unavailable' else 'available' end)
        order by p.role),'[]') from private.c43_profiles p
        cross join lateral (select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'proficiency',v.proficiency) order by v.code),'[]') preferences,
          coalesce(jsonb_agg(jsonb_build_object('code',v.code,'names',v.names,'selectedVersion',v.version,'version',c.version,
            'status',case when configuration->'skillCategories' ? c.category then c.status else 'retired' end) order by v.code),'[]') details
          from private.c43_skills v join private.c31_skills c using(code) where v.profile=p.id) s where p.actor=p_actor));
  end if;
  if p_lane='owner' and p_action='catalog' then
    if not (fixture and eligible) then raise exception 'mentorship intake closed' using errcode='42501'; end if;
    if jsonb_typeof(p_input) is distinct from 'object' or p_input-array['q']<>'{}'
      or not private.c43_text(p_input->'q',0,80) then raise exception 'invalid search' using errcode='23514'; end if;
    search_term:=private.c31_term(p_input->>'q');
    return (select coalesce(jsonb_agg(to_jsonb(s) order by s.code),'[]') from (
      select code,names,version,status from private.c31_skills c
      where c.status='active' and configuration->'skillCategories' ? c.category
        and (search_term='' or exists(select from private.c31_catalog_terms t
          where t.code=c.code and position(search_term in t.term)>0) or position(search_term in replace(c.code,'_',' '))>0)
      order by code limit 25) s);
  end if;

  if jsonb_typeof(p_input) is distinct from 'object' or not private.c43_number(p_input->'expectedVersion',0,2147483646)
    or jsonb_typeof(p_input->'requestId') is distinct from 'string'
  then raise exception 'invalid receipt' using errcode='23514'; end if;
  expected:=(p_input->>'expectedVersion')::integer;
  next_version:=expected+1;
  request_key:=(p_input->>'requestId')::uuid;
  hash_input:=encode(sha256(convert_to(jsonb_build_array(p_action,p_input)::text,'UTF8')),'hex');

  if p_lane='founder' then
    if p_action<>'configure' or p_input-array['expectedVersion','requestId','configuration','reason','confirmed','safeguardingPlan','readinessNotes']<>'{}'
      or p_input->'confirmed' is distinct from 'true'::jsonb or not private.c43_text(p_input->'reason',10,500)
      or not private.c43_text(p_input->'safeguardingPlan',0,500) or not private.c43_text(p_input->'readinessNotes',0,500)
    then raise exception 'invalid mentorship configuration' using errcode='23514'; end if;
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    then raise exception 'Founder workspace required' using errcode='42501'; end if;
    select * into prior from private.c43_admin_history where request_id=request_key;
    if found then
      if prior.actor is distinct from p_actor or prior.workspace is distinct from p_workspace or prior.request_hash<>hash_input
      then raise exception 'request conflict' using errcode='55000'; end if;
      return jsonb_build_object('version',prior.version);
    end if;
    if expected<>coalesce(settings.version,0) then raise exception 'revision conflict' using errcode='55000'; end if;
    configuration:=p_input->'configuration';
    if jsonb_typeof(configuration) is distinct from 'object' or exists(
      select from jsonb_object_keys(configuration) k where not defaults ? k)
    then raise exception 'invalid configuration structure' using errcode='23514'; end if;
    foreach key in array array['roles','topics','fields','modes','geographies','skillCategories'] loop
      if not private.c43_strings(configuration->key,defaults->key,jsonb_array_length(defaults->key))
      then raise exception 'invalid configuration options' using errcode='23514'; end if;
    end loop;
    foreach key in array array['maxWeeklyHours','maxSessionMinutes','maxDurationWeeks','maxCapacity'] loop
      if not private.c43_number(configuration->key,case when key='maxSessionMinutes' then 15 else 1 end,(defaults->>key)::integer)
      then raise exception 'invalid configuration bounds' using errcode='23514'; end if;
    end loop;
    insert into private.c43_settings values(true,next_version,configuration,trim(p_input->>'safeguardingPlan'),trim(p_input->>'readinessNotes'))
      on conflict(singleton) do update set version=excluded.version,configuration=excluded.configuration,
        safeguarding_plan=excluded.safeguarding_plan,readiness_notes=excluded.readiness_notes;
    insert into private.c43_admin_history(version,request_id,request_hash,actor,workspace,reason,configuration)
      values(next_version,request_key,hash_input,p_actor,p_workspace,trim(p_input->>'reason'),
        jsonb_build_object('options',configuration,'safeguardingPlan',trim(p_input->>'safeguardingPlan'),'readinessNotes',trim(p_input->>'readinessNotes')));
    return jsonb_build_object('version',next_version);
  end if;

  selected_role:=p_input->>'role';
  if not coalesce(selected_role in ('mentor','mentee'),false) then raise exception 'invalid role' using errcode='23514'; end if;
  select * into current_profile from private.c43_profiles p where p.actor=p_actor and p.role=selected_role for update;
  if current_profile.request_id=request_key then
    if current_profile.request_hash<>hash_input then raise exception 'request conflict' using errcode='55000'; end if;
    return jsonb_build_object('id',current_profile.id,'version',current_profile.version);
  end if;
  if expected<>coalesce(current_profile.version,0) then raise exception 'revision conflict' using errcode='55000'; end if;

  if p_action in ('pause','resume','withdraw') then
    if current_profile.id is null or p_input-array['expectedVersion','requestId','role','purpose']<>'{}'
      or (p_input ? 'purpose' and (p_action<>'withdraw' or
        not coalesce((p_input->>'purpose') in ('recommendations','discovery','requests'),false)))
    then raise exception 'invalid participation change' using errcode='23514'; end if;
    if p_action='resume' and not (fixture and eligible and (selected_role='mentee' or identity_ok)
      and current_profile.participation_at is not null and private.c43_complete(selected_role,current_profile.preferences)
      and private.c43_allowed(selected_role,current_profile.preferences,configuration)
      and coalesce((current_profile.preferences->>'expiresOn')::date>=today,true))
    then raise exception 'mentorship participation unavailable' using errcode='42501'; end if;
    key:=p_input->>'purpose';
    update private.c43_profiles set version=next_version,request_id=request_key,request_hash=hash_input,
      paused=case when p_action='pause' or (p_action='withdraw' and key is null) then true
        when p_action='resume' then false else paused end,
      participation_at=case when p_action='withdraw' and key is null then null else participation_at end,
      recommendations=recommendations and (p_action<>'withdraw' or coalesce(key<>'recommendations',false)),
      discovery=discovery and (p_action<>'withdraw' or coalesce(key<>'discovery',false)),
      requests=requests and (p_action<>'withdraw' or coalesce(key<>'requests',false)),
      consent_recorded_at=case when p_action='withdraw' then now_at else consent_recorded_at end
      where id=current_profile.id returning id into profile_id;
    return jsonb_build_object('id',profile_id,'version',next_version);
  end if;

  if p_action<>'save' or not (fixture and eligible and (selected_role='mentee' or identity_ok))
  then raise exception 'mentorship profile unavailable' using errcode='42501'; end if;
  if p_input-array['expectedVersion','requestId','role','preferences','adult','participation','safeguarding','consent','importSkills']<>'{}'
    or p_input->'adult' is distinct from 'true'::jsonb or p_input->'participation' is distinct from 'true'::jsonb
    or p_input->'safeguarding' is distinct from 'true'::jsonb
  then raise exception 'adult participation and safeguarding confirmation required' using errcode='23514'; end if;
  consents:=p_input->'consent';
  if jsonb_typeof(consents) is distinct from 'object' or consents-array['recommendations','discovery','requests']<>'{}'
    or not (consents ?& array['recommendations','discovery','requests'])
    or exists(select from jsonb_each(consents) c where jsonb_typeof(c.value)<>'boolean')
  then raise exception 'invalid independent consent' using errcode='23514'; end if;
  imports:=coalesce(p_input->'importSkills','[]');
  profile_preferences:=p_input->'preferences';
  if jsonb_typeof(profile_preferences) is distinct from 'object' or profile_preferences-preference_keys<>'{}'
    or not (profile_preferences ?& preference_keys)
    or not coalesce(private.c43_allowed(selected_role,profile_preferences,configuration),false)
    or not private.c43_strings(profile_preferences->'topics',configuration->'topics',8)
    or not private.c43_strings(profile_preferences->'departments',departments,10)
    or not private.c43_strings(profile_preferences->'countries',to_jsonb(countries),10)
    or not private.c43_strings(imports,null,12)
    or jsonb_typeof(profile_preferences->'skills') is distinct from 'array'
    or jsonb_typeof(profile_preferences->'languages') is distinct from 'array'
    or not private.c43_text(profile_preferences->'summary',0,500)
    or not private.c43_text(profile_preferences->'goals',0,500)
    or not private.c43_text(profile_preferences->'learningObjectives',0,500)
    or (selected_role='mentor' and profile_preferences->>'learningObjectives'<>'')
    or (selected_role='mentee' and profile_preferences->'capacity'<>'null')
    or (profile_preferences->'experience'<>'null' and not private.c43_number(profile_preferences->'experience',0,60))
  then raise exception 'invalid mentorship preferences' using errcode='23514'; end if;

  if jsonb_array_length(profile_preferences->'skills')>12 or jsonb_array_length(profile_preferences->'languages')>9
    or (select count(*)<>count(distinct v->>'code') from jsonb_array_elements(profile_preferences->'skills') v)
    or (select count(*)<>count(distinct v->>'code') from jsonb_array_elements(profile_preferences->'languages') v)
    or (profile_preferences->>'geography'='haiti_departments')<>(profile_preferences->'departments'<>'[]')
    or (profile_preferences->>'geography'='international')<>(profile_preferences->'countries'<>'[]')
    or (profile_preferences->'countries' ? 'HT')
    or (profile_preferences->>'geography'='worldwide_remote' and profile_preferences->>'mode'<>'remote')
  then raise exception 'invalid selections or geography' using errcode='23514'; end if;
  if profile_preferences->'expiresOn'<>'null' then
    if jsonb_typeof(profile_preferences->'expiresOn')<>'string'
      or (profile_preferences->>'expiresOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'invalid expiry' using errcode='23514'; end if;
    if (profile_preferences->>'expiresOn')::date>today+730 then raise exception 'expiry too far ahead' using errcode='23514'; end if;
  end if;
  foreach key in array array['summary','goals','experience'] loop
    if not (configuration->'fields' ? key) and profile_preferences->key not in ('null'::jsonb,'""'::jsonb)
      and profile_preferences->key is distinct from current_profile.preferences->key
    then raise exception 'optional field unavailable' using errcode='23514'; end if;
  end loop;
  for item in select value from jsonb_array_elements(profile_preferences->'languages') loop
    if jsonb_typeof(item) is distinct from 'object' or item-array['code','proficiency']<>'{}'
      or not coalesce(languages ? (item->>'code') and levels ? (item->>'proficiency'),false)
    then raise exception 'invalid language' using errcode='23514'; end if;
  end loop;
  for item in select value from jsonb_array_elements(profile_preferences->'skills') loop
    selected_code:=item->>'code';
    if jsonb_typeof(item) is distinct from 'object' or item-array['code','proficiency']<>'{}'
      or not coalesce(levels ? (item->>'proficiency'),false)
    then raise exception 'invalid skill' using errcode='23514'; end if;
    select exists(select from private.c31_skills s where s.code=selected_code and s.status='active'
      and configuration->'skillCategories' ? s.category) into active_config;
    if not active_config and not exists(select from private.c43_skills s
      where s.profile=current_profile.id and s.code=selected_code and s.proficiency=item->>'proficiency')
    then raise exception 'skill unavailable' using errcode='23514'; end if;
  end loop;
  if exists(select from jsonb_array_elements_text(imports) i(code)
    where not exists(select from jsonb_array_elements(profile_preferences->'skills') v where v->>'code'=i.code)
      or not exists(select from private.c31_selections v join private.c31_skills s using(code)
        where v.actor=p_actor and v.code=i.code and s.status='active' and configuration->'skillCategories' ? s.category))
  then raise exception 'invalid deliberate import' using errcode='23514'; end if;

  insert into private.c43_profiles(actor,role,version,preferences,adult_at,participation_at,safeguarding_at,
    recommendations,discovery,requests,consent_recorded_at,request_id,request_hash)
    values(p_actor,selected_role,next_version,profile_preferences-'skills',now_at,now_at,now_at,
      (consents->>'recommendations')::boolean,(consents->>'discovery')::boolean,(consents->>'requests')::boolean,
      now_at,request_key,hash_input)
    on conflict(actor,role) do update set version=excluded.version,preferences=excluded.preferences,
      participation_at=coalesce(private.c43_profiles.participation_at,excluded.participation_at),
      recommendations=excluded.recommendations,discovery=excluded.discovery,requests=excluded.requests,
      consent_recorded_at=case when row(private.c43_profiles.recommendations,private.c43_profiles.discovery,private.c43_profiles.requests)
        is distinct from row(excluded.recommendations,excluded.discovery,excluded.requests) or private.c43_profiles.participation_at is null
        then excluded.consent_recorded_at else private.c43_profiles.consent_recorded_at end,
      request_id=excluded.request_id,request_hash=excluded.request_hash
    returning id into profile_id;
  delete from private.c43_skills s where s.profile=profile_id and not exists(select
    from jsonb_array_elements(profile_preferences->'skills') x where x->>'code'=s.code);
  insert into private.c43_skills(profile,code,version,names,proficiency)
    select profile_id,c.code,c.version,c.names,v->>'proficiency'
    from jsonb_array_elements(profile_preferences->'skills') v join private.c31_skills c on c.code=v->>'code'
    where c.status='active' and configuration->'skillCategories' ? c.category
    on conflict(profile,code) do update set proficiency=excluded.proficiency;
  return jsonb_build_object('id',profile_id,'version',next_version);
end $$;

revoke all on function private.c43_defaults(),private.c43_strings(jsonb,jsonb,integer),
  private.c43_number(jsonb,integer,integer),private.c43_text(jsonb,integer,integer),private.c43_complete(text,jsonb),
  private.c43_allowed(text,jsonb,jsonb),public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c43_mentorship_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb) to service_role;
