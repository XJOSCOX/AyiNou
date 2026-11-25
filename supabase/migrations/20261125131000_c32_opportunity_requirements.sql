-- C3.2 stores only opportunity requirements, never member skills or decisions.
create table private.c32_fixture (singleton boolean primary key check(singleton));
create table private.c32_configuration (
  version integer primary key check(version>0),
  categories text[] not null, fields text[] not null, modes text[] not null,
  max_skills integer not null check(max_skills between 1 and 12),
  max_languages integer not null check(max_languages between 0 and 6),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null, request uuid unique not null, fingerprint text not null,
  reason text not null check(length(reason) between 10 and 500),
  recorded_at timestamptz not null default clock_timestamp()
);
create table private.c32_requirements (
  project uuid not null,
  opportunity uuid not null,
  version integer check(version>0),
  action text not null check(action in ('draft','publish')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=12000),
  actor uuid references auth.users(id) on delete set null,
  request uuid unique not null,
  fingerprint text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(opportunity,version),
  foreign key(project,opportunity) references private.project_opportunities(project_id,id) on delete cascade
);
create index c32_requirements_project on private.c32_requirements(project,opportunity,version desc);
create index c32_requirements_published on private.c32_requirements(opportunity,version desc) where action='publish';
alter table private.c32_fixture enable row level security;
alter table private.c32_configuration enable row level security;
alter table private.c32_requirements enable row level security;
revoke all on private.c32_fixture,private.c32_configuration,private.c32_requirements
  from public,anon,authenticated,service_role;

create function private.c32_settings() returns jsonb
language sql stable set search_path='' as $$
  select coalesce((select jsonb_build_object('version',version,'categories',categories,'fields',fields,
    'modes',modes,'maxSkills',max_skills,'maxLanguages',max_languages)
    from private.c32_configuration order by version desc limit 1),
    '{"version":0,"categories":["education","healthcare","engineering","agriculture","environment","technology","business","finance","administration","community","logistics","communications","arts","trades","languages"],"fields":["experience","languages","screening"],"modes":["remote","on_site","hybrid"],"maxSkills":12,"maxLanguages":6}'::jsonb)
$$;

create function private.c32_enum_list(value jsonb, allowed jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)='array' then
    not exists(select from jsonb_array_elements(value) as x(item) where not (allowed @> jsonb_build_array(x.item)))
    and (select count(distinct item) from jsonb_array_elements(value) as x(item))=jsonb_array_length(value)
    else false end
$$;

create function private.c32_integer(value jsonb, minimum integer, maximum integer) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)='number' and value::text ~ '^[0-9]{1,10}$'
    then (value::text)::numeric between minimum and maximum else false end
$$;

create function private.c32_catalog(settings jsonb) returns setof private.c31_skills
language sql stable set search_path='' as $$
  select s.* from private.c31_skills s left join private.c31_settings c on c.singleton
  where s.status='active' and settings->'categories' ? s.category
    and (c.categories is null or s.category=any(c.categories))
$$;

create function private.c32_snapshot(body jsonb, settings jsonb, project_revision integer,
  department text, capacity integer, deadline date, remote boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  item jsonb; skill private.c31_skills; selected jsonb:='[]';
  fields jsonb:=settings->'fields'; beginner boolean;
  levels constant jsonb:='["beginner","intermediate","advanced"]';
  languages constant jsonb:='["ht","fr","en","es","pt","de","ar","zh","asl"]';
begin
  if jsonb_typeof(body) is distinct from 'object'
    or body-array['skills','languages','mode','hoursPerWeek','durationWeeks','beginnerFriendly','screening']<>'{}'
    or jsonb_typeof(body->'skills') is distinct from 'array'
    or jsonb_typeof(body->'languages') is distinct from 'array'
    or jsonb_typeof(body->'mode') is distinct from 'string'
    or not (settings->'modes' ? (body->>'mode'))
    or ((body->>'mode') in ('remote','hybrid'))<>remote
    or jsonb_typeof(body->'beginnerFriendly') is distinct from 'boolean'
    or jsonb_typeof(body->'screening') is distinct from 'boolean'
    or ((body->'screening')='true' and not (fields ? 'screening'))
    or not coalesce(body->'hoursPerWeek'='null' or private.c32_integer(body->'hoursPerWeek',1,40),false)
    or not coalesce(body->'durationWeeks'='null' or private.c32_integer(body->'durationWeeks',1,52),false)
    then raise exception 'invalid requirements' using errcode='23514'; end if;
  if jsonb_array_length(body->'skills')>(settings->>'maxSkills')::int
    or jsonb_array_length(body->'languages')>(settings->>'maxLanguages')::int
    or (not (fields ? 'languages') and body->'languages'<>'[]')
    then raise exception 'unsupported requirement' using errcode='23514'; end if;
  if (select count(distinct x->>'code') from jsonb_array_elements(body->'skills') x)<>jsonb_array_length(body->'skills')
    or (select count(distinct x->>'code') from jsonb_array_elements(body->'languages') x)<>jsonb_array_length(body->'languages')
    then raise exception 'duplicate requirement' using errcode='23514'; end if;
  beginner:=(body->>'beginnerFriendly')::boolean;
  for item in select value from jsonb_array_elements(body->'skills') loop
    if jsonb_typeof(item)<>'object' or item-array['code','priority','proficiency','experienceMin','experienceMax']<>'{}'
      or jsonb_typeof(item->'code') is distinct from 'string'
      or not coalesce((item->>'priority') in ('required','preferred'),false)
      or not coalesce(item->'proficiency'='null' or levels @> jsonb_build_array(item->'proficiency'),false)
      or not coalesce(item->'experienceMin'='null' or private.c32_integer(item->'experienceMin',0,60),false)
      or not coalesce(item->'experienceMax'='null' or private.c32_integer(item->'experienceMax',0,60),false)
      or (not (fields ? 'experience') and (item->'experienceMin'<>'null' or item->'experienceMax'<>'null'))
      then raise exception 'invalid skill requirement' using errcode='23514'; end if;
    if (item->>'experienceMin')::int>(item->>'experienceMax')::int or
      (beginner and item->>'priority'='required' and
        (coalesce((item->>'experienceMin')::int,0)>0 or coalesce(item->>'proficiency','beginner')<>'beginner'))
      then raise exception 'contradictory skill requirement' using errcode='23514'; end if;
    select * into skill from private.c32_catalog(settings) c where c.code=item->>'code';
    if not found then raise exception 'catalog skill unavailable' using errcode='55000'; end if;
    selected:=selected||jsonb_build_array(item||jsonb_build_object('skillVersion',skill.version,'names',skill.names));
  end loop;
  for item in select value from jsonb_array_elements(body->'languages') loop
    if jsonb_typeof(item)<>'object' or item-array['code','priority','proficiency']<>'{}'
      or not (languages @> jsonb_build_array(item->'code'))
      or not coalesce((item->>'priority') in ('required','preferred'),false)
      or not coalesce(item->'proficiency'='null' or levels @> jsonb_build_array(item->'proficiency'),false)
      then raise exception 'invalid language requirement' using errcode='23514'; end if;
  end loop;
  return body||jsonb_build_object('skills',selected,'department',department,'projectRevision',project_revision,
    'capacity',capacity,'deadline',deadline);
end $$;

create function public.c32_requirements_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_project uuid,p_opportunity uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p private.community_projects; e private.project_execution; o private.project_opportunities;
  config private.c32_configuration; r private.c32_requirements;
  settings jsonb; defaults jsonb; receipt text; role_name text; department text; reason_input text; prepared_snapshot jsonb;
  staff boolean; edits boolean; active boolean; request_key uuid; expected integer; actual integer;
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor),false)
    then raise exception 'member session required' using errcode='42501'; end if;
  staff:=p_action in ('settings','configure');
  if p_action is null or p_action not in ('settings','configure','read','draft','publish')
    then raise exception 'unsupported command' using errcode='42501'; end if;
  if staff then
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
  elsif not (coalesce(p_fixture,false) and exists(select from private.c32_fixture)) then
    if p_action='read' then return '{"state":"closed"}'; end if;
    raise exception 'structured requirements closed' using errcode='42501';
  end if;
  if p_action not in ('read','settings') then
    if jsonb_typeof(p_input) is distinct from 'object' or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
      or jsonb_typeof(p_input->'requestId') is distinct from 'string'
      then raise exception 'invalid receipt' using errcode='23514'; end if;
    expected:=(p_input->>'expectedVersion')::int;
    request_key:=(p_input->>'requestId')::uuid;
    receipt:=encode(sha256(convert_to(jsonb_build_array(p_project,p_opportunity,p_action,p_input)::text,'UTF8')),'hex');
  end if;
  if staff then
    if p_action='settings' then
      settings:=private.c32_settings();
      return jsonb_build_object('settings',settings,'availableSkills',(select count(*) from private.c32_catalog(settings)),
        'catalogSettings',jsonb_build_object('version',coalesce((select version from private.c31_settings),0),
          'categories',coalesce((select to_jsonb(categories) from private.c31_settings),settings->'categories'),
          'fields',coalesce((select to_jsonb(fields) from private.c31_settings),'["summary","experience","languages"]')),
        'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]') from
          (select version,reason,recorded_at as at from private.c32_configuration order by version desc limit 30) h));
    end if;
    perform private.s2b_lock_actor(p_actor,p_session);
    perform pg_advisory_xact_lock(20261125,320);
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    select * into config from private.c32_configuration where request=request_key;
    if found then
      if config.actor is distinct from p_actor or config.workspace is distinct from p_workspace or config.fingerprint<>receipt
        then raise exception 'conflicting request' using errcode='55000'; end if;
      return jsonb_build_object('version',config.version);
    end if;
    settings:=private.c32_settings();
    if expected<>(settings->>'version')::int then raise exception 'stale settings' using errcode='55000'; end if;
    defaults:='["education","healthcare","engineering","agriculture","environment","technology","business","finance","administration","community","logistics","communications","arts","trades","languages"]';
    reason_input:=trim(p_input->>'reason');
    if p_input-array['expectedVersion','requestId','confirmed','reason','categories','fields','modes','maxSkills','maxLanguages']<>'{}'
      or p_input->'confirmed' is distinct from 'true' or jsonb_typeof(p_input->'reason') is distinct from 'string'
      or length(reason_input) not between 10 and 500 or reason_input ~ '[[:cntrl:]]'
      or not private.c32_enum_list(p_input->'categories',defaults)
      or not private.c32_enum_list(p_input->'fields','["experience","languages","screening"]')
      or not private.c32_enum_list(p_input->'modes','["remote","on_site","hybrid"]')
      or p_input->'modes'='[]'
      or not private.c32_integer(p_input->'maxSkills',1,12)
      or not private.c32_integer(p_input->'maxLanguages',0,6)
      then raise exception 'invalid settings' using errcode='23514'; end if;
    insert into private.c32_configuration(version,categories,fields,modes,max_skills,max_languages,actor,workspace,request,fingerprint,reason)
      values(expected+1,array(select jsonb_array_elements_text(p_input->'categories')),
        array(select jsonb_array_elements_text(p_input->'fields')),array(select jsonb_array_elements_text(p_input->'modes')),
        (p_input->>'maxSkills')::int,(p_input->>'maxLanguages')::int,p_actor,p_workspace,request_key,receipt,reason_input);
    return jsonb_build_object('version',expected+1);
  end if;

  if p_action='read' then select * into p from private.community_projects where id=p_project;
  else
    -- This is the same project row lock used by native application and close commands.
    select * into p from private.community_projects where id=p_project for update;
    if found then perform private.project_lock_scope(p); end if;
    perform pg_advisory_xact_lock_shared(20261125,310);
    perform pg_advisory_xact_lock_shared(20261125,320);
  end if;
  if p.id is null or not coalesce(private.project_executable(p) and private.project_execution_actor(p,p_actor),false)
    then raise exception 'project unavailable' using errcode='42501'; end if;
  select * into e from private.project_execution where project_id=p.id;
  role_name:=private.project_execution_role(p,p_actor);
  edits:=private.project_permission(role_name,'volunteers.review');
  active:=coalesce(e.status='active',false);
  department:=private.c22_department(p);
  settings:=private.c32_settings();
  if p_action='read' then
    if not (edits or (feed_data.community_member(p.community_id,p_actor) and
      ((active and (role_name is not null or private.project_visible(p))) or
        exists(select from private.project_applications a where a.project_id=p.id and a.applicant_id=p_actor)))) then raise exception 'project unavailable' using errcode='42501'; end if;
    return jsonb_build_object('state','fixture','department',department,'settings',settings,
      'catalog',case when edits then (select coalesce(jsonb_agg(to_jsonb(c) order by c.category,c.code),'[]') from private.c32_catalog(settings) c)
        else '[]'::jsonb end,
      'items',(select coalesce(jsonb_agg(jsonb_build_object(
        'opportunityId',o0.id,'version',case when edits then coalesce(latest.version,0) else published.version end,
        'editable',edits and flags.open and department is not null and applicants.total=0,
        'eligible',coalesce(flags.open and department is not null and applicants.accepted<o0.capacity and
          feed_data.community_member(p.community_id,p_actor) and (role_name is not null or private.project_visible(p))
          and published.snapshot->>'department'=department and (published.snapshot->>'projectRevision')::int=e.approved_revision
          and not exists(select from jsonb_array_elements(published.snapshot->'skills') s
            where not exists(select from private.c32_catalog(settings) c where c.code=s->>'code'))
          and not exists(select from private.m23_restrictions m where m.subject_id=p_actor and m.capability='volunteer_apply'
            and m.revoked_at is null and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
            and private.m23_scope_includes(m.scope_kind,m.scope_id,'project',p.id)),false),
        'published',case when published.version is not null then published.snapshot||jsonb_build_object('version',published.version) end,
        'draft',case when edits and latest.action='draft' then latest.snapshot||jsonb_build_object('version',latest.version) end,
        'history',case when edits then (select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]') from
          (select version,action,recorded_at as at from private.c32_requirements where opportunity=o0.id order by version desc limit 15) h)
          else '[]'::jsonb end) order by o0.created_at desc),'[]')
        from private.project_opportunities o0
        cross join lateral (select active and o0.closed_at is null and (o0.closes_on is null or o0.closes_on>=current_date)
          and feed_data.author_active(o0.manager_id) and not feed_data.blocked_pair(p_actor,o0.manager_id) as open) flags
        cross join lateral (select count(*) total,count(*) filter(where a.status in ('offered','accepted')) accepted
          from private.project_applications a where a.opportunity_id=o0.id) applicants
        left join lateral (select version,action,snapshot from private.c32_requirements where opportunity=o0.id order by version desc limit 1) latest on true
        left join lateral (select version,snapshot from private.c32_requirements where opportunity=o0.id and action='publish' order by version desc limit 1) published on true
        where o0.project_id=p.id and (edits or (flags.open and published.version is not null
          and published.snapshot->>'department'=department and (published.snapshot->>'projectRevision')::int=e.approved_revision)
          or (published.version is not null and feed_data.community_member(p.community_id,p_actor)
            and not feed_data.blocked_pair(p_actor,o0.manager_id)
            and exists(select from private.project_applications a where a.opportunity_id=o0.id and a.applicant_id=p_actor)))));
  end if;

  if not edits or private.project_identity_state(p_actor) is distinct from 'verified'
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'recruitment authority required' using errcode='42501'; end if;
  perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
  select * into o from private.project_opportunities where id=p_opportunity and project_id=p.id;
  if not found then raise exception 'opportunity unavailable' using errcode='42501'; end if;
  select * into r from private.c32_requirements where request=request_key;
  if found then
    if r.actor is distinct from p_actor or r.fingerprint<>receipt then raise exception 'conflicting request' using errcode='55000'; end if;
    return jsonb_build_object('version',r.version);
  end if;
  if not active or department is null or o.closed_at is not null or o.closes_on<current_date
    or not feed_data.author_active(o.manager_id) or feed_data.blocked_pair(p_actor,o.manager_id)
    or exists(select from private.project_applications where opportunity_id=o.id)
    then raise exception 'requirements cannot change' using errcode='55000'; end if;
  select coalesce(max(version),0) into actual from private.c32_requirements where opportunity=o.id;
  if expected<>actual or actual>=100 then raise exception 'stale or exhausted revision' using errcode='55000'; end if;
  if (p_action='publish' and (p_input-array['requestId','expectedVersion','confirmed']<>'{}' or p_input->'confirmed' is distinct from 'true'))
    or (p_action='draft' and p_input-array['requestId','expectedVersion','requirements']<>'{}')
    then raise exception 'invalid requirement command' using errcode='23514'; end if;
  if p_action='publish' then
    select * into r from private.c32_requirements where opportunity=o.id and version=actual and action='draft';
    if not found then raise exception 'reviewed draft required' using errcode='55000'; end if;
    prepared_snapshot:=private.c32_snapshot((r.snapshot-array['department','projectRevision','capacity','deadline'])||
      jsonb_build_object('skills',(select coalesce(jsonb_agg(x-array['names','skillVersion']),'[]') from jsonb_array_elements(r.snapshot->'skills') x)),
      settings,e.approved_revision,department,o.capacity,o.closes_on,o.remote);
    if prepared_snapshot<>r.snapshot then raise exception 'review updated draft before publishing' using errcode='55000'; end if;
  else
    prepared_snapshot:=private.c32_snapshot(p_input->'requirements',settings,e.approved_revision,department,o.capacity,o.closes_on,o.remote);
  end if;
  perform feed_data.consume_limit(p_actor,'project_operations',30);
  insert into private.c32_requirements(project,opportunity,version,action,snapshot,actor,request,fingerprint)
    values(p.id,o.id,expected+1,p_action,prepared_snapshot,p_actor,request_key,receipt);
  return jsonb_build_object('version',expected+1);
end $$;

revoke all on function private.c32_settings(),private.c32_enum_list(jsonb,jsonb),private.c32_integer(jsonb,integer,integer),
  private.c32_catalog(jsonb),private.c32_snapshot(jsonb,jsonb,integer,text,integer,date,boolean),
  public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c32_requirements_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb) to service_role;
