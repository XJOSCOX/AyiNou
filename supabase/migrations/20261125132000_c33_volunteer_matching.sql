-- Hosted matching stays closed. All profile joins are purpose- and session-bound.
create table private.c33_fixture(singleton boolean primary key check(singleton));
create table private.c33_configuration(
  version integer primary key check(version>0),
  settings jsonb not null check(jsonb_typeof(settings)='object'),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  request uuid unique not null,
  fingerprint text not null,
  reason text not null check(length(reason) between 10 and 500),
  recorded_at timestamptz not null default clock_timestamp()
);
create table private.c33_pause(
  actor uuid primary key references private.c31_profiles(actor) on delete cascade,
  paused boolean not null,
  version integer not null check(version>0),
  request uuid not null
);
create table private.c33_dismissed(
  actor uuid references private.c31_profiles(actor) on delete cascade,
  opportunity uuid not null,
  version integer not null,
  expires_at timestamptz not null default (now()+interval '90 days'),
  primary key(actor,opportunity,version),
  foreign key(opportunity,version) references private.c32_requirements(opportunity,version) on delete cascade
);
create index c33_dismissed_opportunity on private.c33_dismissed(opportunity,version);
create index c33_discovery_cursor on private.c31_consents(actor) where discovery;
create index c33_project_opportunity_places on private.project_applications(opportunity_id) where status in ('offered','accepted');
alter table private.c33_fixture enable row level security;
alter table private.c33_configuration enable row level security;
alter table private.c33_pause enable row level security;
alter table private.c33_dismissed enable row level security;
revoke all on private.c33_fixture,private.c33_configuration,private.c33_pause,private.c33_dismissed
  from public,anon,authenticated,service_role;

create function private.c33_defaults() returns jsonb
language sql immutable set search_path='' as $$
select '{"version":0,"criteria":["preferred","skills","language","schedule","mode","department","beginner"],
  "departments":["HT-AR","HT-CE","HT-GA","HT-NI","HT-ND","HT-NE","HT-NO","HT-OU","HT-SD","HT-SE"],
  "modes":["remote","on_site","hybrid"],"requiredWeight":5,"preferredWeight":2,"recommendationLimit":10,"discoveryLimit":6}'::jsonb
$$;

create function private.c33_standing(actor uuid, project uuid) returns boolean
language sql stable set search_path='' as $$
  select not exists(select from private.m23_restrictions m where m.subject_id=actor and m.capability='volunteer_apply'
    and m.revoked_at is null and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
    and private.m23_scope_includes(m.scope_kind,m.scope_id,'project',project))
$$;

create function private.c33_opportunity(r private.c32_requirements, o private.project_opportunities,
  p private.community_projects, settings jsonb, catalog_settings jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce(o.project_id=p.id and r.project=p.id and o.id=r.opportunity and r.action='publish'
    and o.closed_at is null and (o.closes_on is null or o.closes_on>=current_date)
    and feed_data.author_active(o.manager_id) and private.project_executable(p)
    and r.snapshot->>'department'=private.c22_department(p)
    and settings->'departments' ? (r.snapshot->>'department') and settings->'modes' ? (r.snapshot->>'mode')
    and catalog_settings->'modes' ? (r.snapshot->>'mode')
    and exists(select from private.project_execution e where e.project_id=p.id and e.status='active'
      and e.approved_revision=(r.snapshot->>'projectRevision')::int)
    and (select count(*) from private.project_applications a where a.opportunity_id=o.id and a.status in ('offered','accepted'))<o.capacity
    and not exists(select from jsonb_array_elements(r.snapshot->'skills') as x(skill)
      where not exists(select from private.c32_catalog(catalog_settings) c where c.code=x.skill->>'code'
        and c.version=(x.skill->>'skillVersion')::int)),false)
$$;

create function private.c33_viewer(actor uuid,o private.project_opportunities,p private.community_projects) returns boolean
language sql stable set search_path='' as $$
  select coalesce(private.project_execution_actor(p,actor) and private.member_onboarding_access(actor)
    and feed_data.community_member(p.community_id,actor) and not feed_data.blocked_pair(actor,o.manager_id)
    and (private.project_execution_role(p,actor) is not null or private.project_visible(p)) and private.c33_standing(actor,p.id),false)
$$;

create function private.c33_skills(actor uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(s.code,jsonb_build_object('level',s.proficiency,'years',s.experience)),'{}')
  from private.c31_selections s join private.c31_skills c on c.code=s.code and c.status='active'
  left join private.c31_settings settings on settings.singleton
  where s.actor=c33_skills.actor and (settings.categories is null or c.category=any(settings.categories))
$$;

create function private.c33_compare(profile private.c31_profiles, skills jsonb, terms jsonb, settings jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  reasons text[]:='{}'; level_order constant text[]:=array['beginner','intermediate','advanced'];
  required_weight integer:=(settings->>'requiredWeight')::int; preferred_weight integer:=(settings->>'preferredWeight')::int;
  criteria jsonb:=settings->'criteria'; score integer:=0; required_gap boolean:=false; uncertain boolean:=false;
  item jsonb; chosen jsonb; required boolean; sufficient boolean; wanted integer; lower_hours integer; upper_hours integer;
  term_mode text:=terms->>'mode'; dept text:=terms->>'department'; years integer; language_level text;
  beginner boolean:=(terms->>'beginnerFriendly')::boolean; mode_fit boolean; area_fit boolean; weekly_fit boolean:=false;
begin
  foreach item in array array(select value from jsonb_array_elements(terms->'skills')) loop
    required:=item->>'priority'='required';
    if not required and not (criteria ? 'preferred') then continue; end if;
    chosen:=skills->(item->>'code');
    if chosen is null then
      if required then required_gap:=true; reasons:=array_append(reasons,'skillMissing'); end if;
      uncertain:=true; continue;
    end if;
    sufficient:=item->>'proficiency' is null or
      array_position(level_order,chosen->>'level')>=array_position(level_order,item->>'proficiency');
    if sufficient is not true then
      uncertain:=true;
      if required then required_gap:=true; reasons:=array_append(reasons,'skillMissing'); end if;
      continue;
    end if;
    years:=(chosen->>'years')::int;
    if (item->>'experienceMin' is not null or item->>'experienceMax' is not null) and (required or not beginner) then
      if years is null then uncertain:=true; continue; end if;
      if years<coalesce((item->>'experienceMin')::int,0) or years>coalesce((item->>'experienceMax')::int,60) then
        uncertain:=true;
        if required then required_gap:=true; reasons:=array_append(reasons,'experienceNeeded'); end if;
        continue;
      end if;
    end if;
    reasons:=array_append(reasons,case when required then 'skillFit' else 'preferredFit' end);
    if criteria ? 'skills' then score:=score+case when required then required_weight else preferred_weight end; end if;
  end loop;
  foreach item in array array(select value from jsonb_array_elements(terms->'languages')) loop
    required:=item->>'priority'='required';
    if not required and not (criteria ? 'preferred') then continue; end if;
    select x->>'proficiency' into language_level from jsonb_array_elements(profile.languages) x where x->>'code'=item->>'code';
    if language_level is null or (item->>'proficiency' is not null
      and array_position(level_order,language_level)<array_position(level_order,item->>'proficiency')) then
      uncertain:=true;
      if required then required_gap:=true; reasons:=array_append(reasons,'languageNeeded'); end if;
    else
      reasons:=array_append(reasons,'languageFit');
      if criteria ? 'language' then score:=score+case when required then required_weight else preferred_weight end; end if;
    end if;
  end loop;
  mode_fit:=profile.mode=term_mode or profile.mode='hybrid';
  area_fit:=profile.nationwide or dept=any(profile.departments) or (term_mode='remote' and cardinality(profile.departments)=0);
  reasons:=array_append(reasons,case when mode_fit then 'modeFit' else 'modeGap' end);
  if profile.nationwide or dept=any(profile.departments) then reasons:=array_append(reasons,'departmentFit');
  elsif not area_fit then reasons:=array_append(reasons,'departmentGap'); end if;
  required_gap:=required_gap or not mode_fit or not area_fit;
  score:=score+case when mode_fit and criteria ? 'mode' then 1 else 0 end+
    case when (profile.nationwide or dept=any(profile.departments)) and criteria ? 'department' then 1 else 0 end;
  wanted:=(terms->>'hoursPerWeek')::int;
  if wanted is not null then
    lower_hours:=case profile.commitment when 'one_three' then 1 when 'four_eight' then 4 when 'nine_plus' then 9 end;
    upper_hours:=case profile.commitment when 'one_three' then 3 when 'four_eight' then 8 when 'nine_plus' then 40 end;
    if wanted>upper_hours then required_gap:=true; reasons:=array_append(reasons,'weeklyGap');
    elsif wanted<=lower_hours then weekly_fit:=true; reasons:=array_append(reasons,'weeklyFit');
      if criteria ? 'schedule' then score:=score+1; end if;
    else uncertain:=true; end if;
  end if;
  if terms->>'durationWeeks' is not null then
    if profile.expires_on is null then uncertain:=true;
    elsif profile.expires_on < (now() at time zone 'America/Port-au-Prince')::date + 7*(terms->>'durationWeeks')::int then
      required_gap:=true; reasons:=array_append(reasons,'durationGap');
    end if;
  end if;
  if beginner then reasons:=array_append(reasons,'beginner'); if criteria ? 'beginner' then score:=score+1; end if; end if;
  if (terms->>'screening')::boolean then required_gap:=true; reasons:=array_append(reasons,'screening'); end if;
  if uncertain then reasons:=array_append(reasons,'unknown'); end if;
  return jsonb_build_object('classification',case when required_gap then 'additional' when uncertain then 'partial' else 'strong' end,
    'score',score,'weeklyFit',weekly_fit,'reasons',array(select distinct x from unnest(reasons) x order by x));
end $$;

create function public.c33_matching_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_fixture boolean,p_project uuid,p_opportunity uuid,p_after uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='6s' as $$
declare
  settings jsonb; defaults jsonb:=private.c33_defaults(); catalog_settings jsonb;
  profile private.c31_profiles; consent private.c31_consents; pause private.c33_pause;
  p private.community_projects; o private.project_opportunities; requirement private.c32_requirements;
  config private.c33_configuration; reason_input text; version_input integer; request_key uuid; fingerprint text;
  role_name text; page_limit integer; opener uuid:=coalesce(p_after,'00000000-0000-0000-0000-000000000000');
  skill_filter text; department_filter text; mode_filter text; weekly_filter boolean;
  empty_page constant jsonb:='{"state":"unavailable","items":[],"nextKey":null}';
begin
  if p_action is null or p_action not in ('settings','configure','recommend','discover','dismiss','pause','resume')
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
      and private.member_onboarding_access(p_actor),false)
    then raise exception 'member session required' using errcode='42501'; end if;
  if p_action in ('settings','configure') then
    if not coalesce(private.platform_founder(p_actor)
      and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    if p_action='configure' then
      perform private.s2b_lock_actor(p_actor,p_session);
      perform pg_advisory_xact_lock(20261125,330);
      if not coalesce(private.platform_founder(p_actor)
        and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
        then raise exception 'Founder workspace required' using errcode='42501'; end if;
    end if;
  elsif not (coalesce(p_fixture,false) and exists(select from private.c33_fixture)
    and exists(select from private.c32_fixture) and exists(select from private.c31_fixture)) then
    if p_action in ('recommend','discover') then return '{"state":"closed","items":[],"nextKey":null}'; end if;
    raise exception 'matching closed' using errcode='42501';
  end if;
  select * into config from private.c33_configuration order by version desc limit 1;
  settings:=coalesce(config.settings||jsonb_build_object('version',config.version),defaults);
  if p_action='settings' then
    return jsonb_build_object('settings',settings,'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
      from (select version,reason,recorded_at as at from private.c33_configuration order by version desc limit 30) h));
  elsif p_action='configure' then
    reason_input:=trim(p_input->>'reason');
    if jsonb_typeof(p_input) is distinct from 'object'
      or p_input-array['expectedVersion','requestId','confirmed','reason','criteria','departments','modes','requiredWeight','preferredWeight','recommendationLimit','discoveryLimit']<>'{}'
      or jsonb_typeof(p_input->'requestId') is distinct from 'string'
      or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
      or p_input->'confirmed' is distinct from 'true'
      or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(reason_input) not between 10 and 500 or reason_input ~ '[[:cntrl:]]'
      or not private.c32_enum_list(p_input->'criteria',defaults->'criteria')
      or not private.c32_enum_list(p_input->'departments',defaults->'departments')
      or not private.c32_enum_list(p_input->'modes',defaults->'modes')
      or not private.c32_integer(p_input->'requiredWeight',3,9)
      or not private.c32_integer(p_input->'preferredWeight',1,2)
      or not private.c32_integer(p_input->'recommendationLimit',1,16)
      or not private.c32_integer(p_input->'discoveryLimit',1,8)
      then raise exception 'invalid matching settings' using errcode='23514'; end if;
    request_key:=(p_input->>'requestId')::uuid;
    fingerprint:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    version_input:=(p_input->>'expectedVersion')::int;
    select * into config from private.c33_configuration where request=request_key;
    if found then
      if config.actor is distinct from p_actor or config.workspace is distinct from p_workspace or config.fingerprint<>fingerprint
        then raise exception 'conflicting request' using errcode='55000'; end if;
      return jsonb_build_object('version',config.version);
    end if;
    if version_input<>(settings->>'version')::int then raise exception 'stale settings' using errcode='55000'; end if;
    insert into private.c33_configuration(version,settings,actor,workspace,request,fingerprint,reason)
      values(version_input+1,p_input-array['expectedVersion','requestId','confirmed','reason'],p_actor,p_workspace,request_key,fingerprint,reason_input);
    return jsonb_build_object('version',version_input+1);
  end if;

  catalog_settings:=private.c32_settings();
  if p_action in ('pause','resume','dismiss') then
    perform private.s2b_lock_actor(p_actor,p_session);
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      then raise exception 'member session required' using errcode='42501'; end if;
  end if;
  if p_action<>'discover' then
    select * into profile from private.c31_profiles where actor=p_actor;
    select * into consent from private.c31_consents where actor=p_actor;
    select * into pause from private.c33_pause where actor=p_actor;
    if p_action in ('pause','resume') then
      if profile.actor is null or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
        or jsonb_typeof(p_input->'requestId') is distinct from 'string'
        or p_input-array['expectedVersion','requestId']<>'{}'
        then raise exception 'invalid preference' using errcode='23514'; end if;
      request_key:=(p_input->>'requestId')::uuid;
      version_input:=(p_input->>'expectedVersion')::int;
      if pause.request=request_key then
        if pause.paused<>(p_action='pause') or pause.version<>version_input+1 then raise exception 'conflicting request' using errcode='55000'; end if;
        return jsonb_build_object('version',pause.version);
      end if;
      if version_input<>coalesce(pause.version,0) then raise exception 'stale preference' using errcode='55000'; end if;
      insert into private.c33_pause values(p_actor,p_action='pause',version_input+1,request_key)
        on conflict(actor) do update set paused=excluded.paused,version=excluded.version,request=excluded.request;
      return jsonb_build_object('version',version_input+1);
    end if;
    if not coalesce(consent.matching and profile.availability='available' and
      (profile.expires_on is null or profile.expires_on>=(now() at time zone 'America/Port-au-Prince')::date)
      and not coalesce(pause.paused,false) and private.member_experience_flag('profilesEnabled'),false) then
      if p_action='recommend' then return empty_page||jsonb_build_object('paused',coalesce(pause.paused,false),'pauseVersion',coalesce(pause.version,0),'hasProfile',profile.actor is not null); end if;
      raise exception 'volunteer unavailable' using errcode='42501';
    end if;
  end if;

  if p_action in ('discover','dismiss') then
    select * into p from private.community_projects where id=p_project;
    select * into o from private.project_opportunities where id=p_opportunity and project_id=p_project;
    select * into requirement from private.c32_requirements where opportunity=p_opportunity and action='publish'
      order by version desc limit 1;
    if p.id is null or o.id is null or not private.c33_opportunity(requirement,o,p,settings,catalog_settings)
      then raise exception 'opportunity unavailable' using errcode='42501'; end if;
  end if;
  if p_action='dismiss' then
    if not private.c33_viewer(p_actor,o,p) or p_input-array['revision']<>'{}'
      or not private.c32_integer(p_input->'revision',1,100) or requirement.version<>(p_input->>'revision')::int
      then raise exception 'opportunity unavailable' using errcode='42501'; end if;
    delete from private.c33_dismissed where actor=p_actor and expires_at<=now();
    if exists(select from private.c33_dismissed where actor=p_actor and opportunity=o.id and version=requirement.version)
      then return '{"dismissed":true}'; end if;
    if (select count(*) from private.c33_dismissed where actor=p_actor)>=200
      then raise exception 'dismissal limit' using errcode='54000'; end if;
    insert into private.c33_dismissed(actor,opportunity,version) values(p_actor,o.id,requirement.version);
    return '{"dismissed":true}';
  end if;
  if p_action='discover' then
    role_name:=private.project_execution_role(p,p_actor);
    if not private.project_permission(role_name,'volunteers.review') or private.project_identity_state(p_actor) is distinct from 'verified'
      or not private.project_execution_actor(p,p_actor) or feed_data.blocked_pair(p_actor,o.manager_id)
      then raise exception 'recruitment authority required' using errcode='42501'; end if;
    perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
    if p_after is not null and not coalesce(private.c32_integer(p_input->'revision',1,100)
      and (p_input->>'revision')::int=requirement.version,false) then raise exception 'stale matching cursor' using errcode='55000'; end if;
    if (requirement.snapshot->>'screening')::boolean then return empty_page; end if;
    -- Fixed first cohort per opportunity. Cursor continuation can never walk the full consent index.
    page_limit:=(settings->>'discoveryLimit')::int;
    return (with authorized as materialized (
        select 1 from private.community_projects project_row join private.project_opportunities opp_row on opp_row.project_id=project_row.id
        join lateral (select r.* from private.c32_requirements r where r.opportunity=opp_row.id and r.action='publish'
          order by version desc limit 1) published on true
        where project_row.id=p_project and opp_row.id=p_opportunity and published.version=requirement.version
          and public.account_session_for_api(p_actor,p_session,p_aal2,false)
          and private.member_onboarding_access(p_actor)
          and private.project_permission(private.project_execution_role(project_row,p_actor),'volunteers.review')
          and private.project_identity_state(p_actor)='verified'
          and not feed_data.blocked_pair(p_actor,opp_row.manager_id)
          and private.c33_opportunity(published,opp_row,project_row,settings,private.c32_settings())),
      cohort as materialized (select c.actor from private.c31_consents c where c.discovery order by c.actor limit 96),
      eligible as materialized (
        select x.actor, pr.username, pr.display_name, private.c33_compare(v,private.c33_skills(x.actor),requirement.snapshot,settings) as fit
        from authorized cross join cohort x join private.c31_profiles v on v.actor=x.actor join public.profiles pr on pr.user_id=x.actor
        where x.actor>opener and x.actor<>p_actor and v.availability='available'
          and (v.expires_on is null or v.expires_on>=(now() at time zone 'America/Port-au-Prince')::date)
          and (v.mode=requirement.snapshot->>'mode' or v.mode='hybrid')
          and (v.nationwide or (requirement.snapshot->>'department')=any(v.departments)
            or (requirement.snapshot->>'mode'='remote' and cardinality(v.departments)=0))
          and feed_data.f24_mode(x.actor)<>'private' and feed_data.f24_identity(pr,p_actor)
          and private.c33_viewer(x.actor,o,p)
          and not exists(select from private.project_applications a where a.opportunity_id=o.id and a.applicant_id=x.actor)),
      page as (select * from eligible where fit->>'classification'<>'additional'
        and (fit->'reasons' ?| array['skillFit','preferredFit','languageFit'] or (requirement.snapshot->>'beginnerFriendly')::boolean)
        order by actor limit page_limit+1),
      shown as (select * from page order by actor limit page_limit)
      select jsonb_build_object('state','ready','requirementVersion',requirement.version,'items',(select coalesce(jsonb_agg(jsonb_build_object(
        'handle',username,'name',display_name,'classification',fit->>'classification') order by actor),'[]') from shown),
        'nextKey',case when (select count(*) from page)>page_limit then (select max(actor::text) from shown) end));
  end if;

  department_filter:=p_input->>'department'; mode_filter:=p_input->>'mode'; skill_filter:=p_input->>'skill';
  weekly_filter:=coalesce((p_input->>'weekly')::boolean,false); page_limit:=(settings->>'recommendationLimit')::int;
  if p_input-array['department','mode','skill','weekly']<>'{}'
    or (department_filter is not null and not (defaults->'departments' ? department_filter))
    or (mode_filter is not null and not (defaults->'modes' ? mode_filter))
    or (skill_filter is not null and skill_filter !~ '^[a-z][a-z0-9_]{2,39}$')
    then raise exception 'invalid recommendation filters' using errcode='23514'; end if;
  return (with raw as materialized (
      select distinct on (r.opportunity) r.opportunity,r.version from private.c32_requirements r
      where r.action='publish' and r.opportunity>opener order by r.opportunity,r.version desc limit 97),
    current_profile as materialized (
      select v as model,private.c33_skills(p_actor) as skills from private.c31_profiles v
      join private.c31_consents c on c.actor=v.actor and c.matching
      left join private.c33_pause preference on preference.actor=v.actor
      where v.actor=p_actor and v.availability='available' and not coalesce(preference.paused,false)
        and (v.expires_on is null or v.expires_on>=(now() at time zone 'America/Port-au-Prince')::date)
        and public.account_session_for_api(p_actor,p_session,p_aal2,false) and private.member_experience_flag('profilesEnabled')),
    eligible as materialized (
      select r.opportunity, r.project,r.version, opp_row.title,r.snapshot,
        private.c33_compare(current_profile.model,current_profile.skills,r.snapshot,settings) as fit
      from (select * from raw order by opportunity limit 96) keys
      join private.c32_requirements r on r.opportunity=keys.opportunity and r.version=keys.version
      join private.project_opportunities opp_row on opp_row.id=r.opportunity
      join private.community_projects project_row on project_row.id=r.project cross join current_profile
      where (department_filter is null or r.snapshot->>'department'=department_filter)
        and (mode_filter is null or r.snapshot->>'mode'=mode_filter)
        and (skill_filter is null or r.snapshot->'skills' @> jsonb_build_array(jsonb_build_object('code',skill_filter)))
        and private.c33_opportunity(r,opp_row,project_row,settings,private.c32_settings()) and private.c33_viewer(p_actor,opp_row,project_row)
        and not exists(select from private.c33_dismissed d where d.actor=p_actor and d.opportunity=r.opportunity
          and d.version=r.version and d.expires_at>now())
        and not exists(select from private.project_applications a where a.opportunity_id=r.opportunity and a.applicant_id=p_actor)),
    page as (select * from eligible where not weekly_filter or (fit->>'weeklyFit')::boolean order by opportunity limit page_limit+1),
    shown as (select * from page order by opportunity limit page_limit)
    select jsonb_build_object('state','ready','hasProfile',true,'paused',false,'pauseVersion',coalesce(pause.version,0),
      'items',(select coalesce(jsonb_agg(jsonb_build_object('projectId',project,'opportunityId',opportunity,
        'requirementVersion',version,'title',title,'department',snapshot->>'department','mode',snapshot->>'mode',
        'classification',fit->>'classification','reasons',fit->'reasons')
        order by case fit->>'classification' when 'strong' then 0 when 'partial' then 1 else 2 end,
          (fit->>'score')::int desc,opportunity),'[]') from shown),
      'nextKey',case when (select count(*) from page)>page_limit then (select max(opportunity::text) from shown)
        when (select count(*) from raw)>96 then (select opportunity::text from raw order by opportunity offset 95 limit 1) end));
end $$;

revoke all on function private.c33_defaults(),private.c33_standing(uuid,uuid),
  private.c33_opportunity(private.c32_requirements,private.project_opportunities,private.community_projects,jsonb,jsonb),
  private.c33_viewer(uuid,private.project_opportunities,private.community_projects),private.c33_skills(uuid),
  private.c33_compare(private.c31_profiles,jsonb,jsonb,jsonb),
  public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c33_matching_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,text,jsonb) to service_role;
