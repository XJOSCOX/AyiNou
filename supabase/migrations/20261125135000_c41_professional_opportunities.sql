-- C4.1 private organization opportunity preparation.
create or replace function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
    'projects.propose','projects.edit','projects.submit','projects.view_private','projects.operate','polls.manage',
    'opportunities.draft','opportunities.edit'];
$$;

create table private.c41_fixture (singleton boolean primary key check(singleton));
create table private.c41_settings (
  version integer primary key check(version>0),
  settings jsonb not null,
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  request_id uuid not null unique,
  fingerprint text not null,
  reason text not null,
  registered_at timestamptz not null default clock_timestamp()
);
create table private.c41_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete restrict,
  representative uuid references auth.users(id) on delete set null,
  version integer not null check(version>0),
  status text not null check(status in ('draft','submitted','changes_requested','approved','published','closed','withdrawn','restricted','expired','archived')),
  created_at timestamptz not null default clock_timestamp(),
  unique(organization_id,id)
);
create index c41_organization_created on private.c41_opportunities(organization_id,created_at);
create index c41_organization_drafts on private.c41_opportunities(organization_id) where status='draft';

create table private.c41_revisions (
  organization_id uuid not null,
  opportunity_id uuid not null,
  version integer not null check(version>0),
  status text not null check(status in ('draft','withdrawn')),
  revised_by uuid references auth.users(id) on delete set null,
  representative uuid references auth.users(id) on delete set null,
  action text not null check(action in ('create','edit','withdraw')),
  snapshot jsonb not null,
  request_id uuid not null,
  fingerprint text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(opportunity_id,version),
  unique(organization_id,request_id),
  foreign key(organization_id,opportunity_id) references private.c41_opportunities(organization_id,id) on delete restrict
);
alter table private.c41_opportunities add constraint c41_current_revision
  foreign key (id,version) references private.c41_revisions(opportunity_id,version) deferrable initially deferred;
alter table private.c41_fixture enable row level security;
alter table private.c41_settings enable row level security;
alter table private.c41_opportunities enable row level security;
alter table private.c41_revisions enable row level security;
revoke all on private.c41_fixture,private.c41_settings,private.c41_opportunities,private.c41_revisions
  from public,anon,authenticated,authenticator,service_role;

create function private.c41_defaults() returns jsonb language sql immutable set search_path='' as $$
  select '{"types":["employment","internship","scholarship","training","education","apprenticeship","workshop"],
    "organizationKinds":["haitian_organization","international_organization","ngo","nonprofit","foundation","business","education","media","municipality","ministry","embassy","government_agency"],
    "scopes":["haiti","international"],"modes":["remote","on_site","hybrid"],"draftLimit":25}'::jsonb
$$;

create function private.c41_set_valid(value jsonb, allowed jsonb) returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)='array' and value <@ allowed then
    jsonb_array_length(value)>0 and jsonb_array_length(value)=(select count(distinct x) from jsonb_array_elements(value) x)
    else false end
$$;

create function private.c41_text(value jsonb, maximum integer) returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(value)='string' and private.valid_trust_text(value #>> '{}',1,maximum)
    and (value #>> '{}') !~ '[[:cntrl:]]',false)
$$;

create function private.c41_country(code text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(code=any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ')),false)
$$;

create function private.c41_reference(value text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(length(value)<=300
    and value collate "C" ~ '^https://([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}([/?#][a-zA-Z0-9._~!$&()*+,;=:/?%#@-]*)?$'
    and strpos(regexp_replace(value,'%[0-9A-Fa-f]{2}','','g'),'%')=0
    and value !~* '%(0[0-9a-f]|1[0-9a-f]|7f|5c)'
    and value !~* '^https://[^/?#]+\.(local|localhost|internal|test|invalid|onion)([/?#]|$)',false)
$$;

create function private.c41_snapshot(value jsonb, settings jsonb) returns jsonb language plpgsql set search_path='' as $$
declare skill_count integer; skill_snapshot jsonb; opening date; closing date; method text;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or value-array['title','description','type','language','category','skills','country','department','mode','opensOn','closesOn','references','applicationMethod']<>'{}'
    or not private.c41_text(value->'title',120) or jsonb_typeof(value->'description') is distinct from 'string'
    or not private.c41_text(to_jsonb(replace(value->>'description',chr(10),' ')),2400)
    or not coalesce(settings->'types' ? (value->>'type') and settings->'modes' ? (value->>'mode'),false)
    or not coalesce(value->>'language' in ('ht','fr','en','es'),false)
    or not coalesce(value->>'category' in ('professional','educational'),false)
    or not private.c41_country(value->>'country')
    or not (settings->'scopes' ? case when value->>'country'='HT' then 'haiti' else 'international' end)
    or (value->>'department' is not null and (value->>'country'<>'HT' or not exists(
      select from feed_data.communities c where c.kind='department' and c.department_code=value->>'department')))
    or jsonb_typeof(value->'skills') is distinct from 'array'
    or jsonb_typeof(value->'references') is distinct from 'array'
    then raise exception 'invalid opportunity snapshot' using errcode='23514'; end if;
  if jsonb_array_length(value->'skills')>12 or jsonb_array_length(value->'references')>4
    or exists(select from jsonb_array_elements(value->'references') r where jsonb_typeof(r)<>'string' or not private.c41_reference(r #>> '{}'))
    or exists(select from jsonb_array_elements(value->'skills') s where jsonb_typeof(s)<>'string')
    then raise exception 'invalid references or skills' using errcode='23514'; end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('code',s.code,'version',s.version,'names',s.names) order by s.code),'[]')
    into skill_count,skill_snapshot from private.c31_skills s where s.status='active' and (value->'skills') ? s.code;
  if skill_count<>jsonb_array_length(value->'skills') then raise exception 'invalid skill selection' using errcode='23514'; end if;
  if (value->>'opensOn' is not null and value->>'opensOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or (value->>'closesOn' is not null and value->>'closesOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    then raise exception 'invalid dates' using errcode='23514'; end if;
  opening:=(value->>'opensOn')::date; closing:=(value->>'closesOn')::date;
  method:=coalesce(value->>'applicationMethod','undecided');
  if opening>closing or method not in ('undecided','external','expression_of_interest','event_registration')
    or (method='external' and jsonb_array_length(value->'references')=0)
    then raise exception 'invalid dates or application method' using errcode='23514'; end if;
  return value||jsonb_build_object('skills',skill_snapshot,'applicationMethod',method,'schemaVersion',1);
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'invalid dates' using errcode='23514';
end $$;

create function public.c41_opportunities_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_org uuid,p_opportunity uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  settings jsonb; settings_rev integer; org private.organizations; item private.c41_opportunities; receipt private.c41_revisions;
  next_version integer; snap jsonb; request_key uuid; digest text; draft_access boolean; edit_access boolean; fixture boolean;
  command boolean:=p_action in ('configure','create','edit','withdraw'); result jsonb; target uuid;
  cursor_id uuid; before_version integer; next_status text; reason text;
begin
  if p_action is null or p_action not in ('settings','configure','list','detail','create','edit','withdraw')
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'invalid command' using errcode='23514'; end if;
  if command then
    perform private.s2b_lock_actor(p_actor,p_session);
    if p_action='configure' then perform pg_advisory_xact_lock(20261125,410);
    else perform pg_advisory_xact_lock_shared(20261125,410); end if;
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  select s.settings,s.version into settings,settings_rev from private.c41_settings s order by s.version desc limit 1;
  settings:=coalesce(settings,private.c41_defaults()); settings_rev:=coalesce(settings_rev,0);
  fixture:=coalesce(p_fixture,false) and exists(select from private.c41_fixture);

  if p_action in ('settings','configure') then
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    if p_action='settings' then
      select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]') into result
        from (select s.version,s.reason,s.registered_at from private.c41_settings s order by s.version desc limit 20) h;
      return jsonb_build_object('settings',settings,'defaults',private.c41_defaults(),'version',settings_rev,'history',result,'live',false);
    end if;
    reason:=btrim(p_input->>'reason');
    snap:=p_input->'settings';
    if p_input-array['requestId','expectedVersion','reason','confirmed','settings']<>'{}'
      or p_input->'confirmed' is distinct from 'true'
      or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
      or not coalesce(length(reason) between 10 and 500 and reason !~ '[[:cntrl:]]',false)
      or jsonb_typeof(snap) is distinct from 'object'
      or snap-array['types','organizationKinds','scopes','modes','draftLimit']<>'{}'
      or not private.c41_set_valid(snap->'types',private.c41_defaults()->'types')
      or not private.c41_set_valid(snap->'organizationKinds',private.c41_defaults()->'organizationKinds')
      or not private.c41_set_valid(snap->'scopes',private.c41_defaults()->'scopes')
      or not private.c41_set_valid(snap->'modes',private.c41_defaults()->'modes')
      or not private.c32_integer(snap->'draftLimit',1,50)
      then raise exception 'invalid settings' using errcode='23514'; end if;
    request_key:=(p_input->>'requestId')::uuid;
    if request_key is null then raise exception 'request required' using errcode='23514'; end if;
    digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    select s.version into next_version from private.c41_settings s
      where s.request_id=request_key and s.actor=p_actor and s.workspace=p_workspace and s.fingerprint=digest;
    if found then return jsonb_build_object('version',next_version); end if;
    if settings_rev<>(p_input->>'expectedVersion')::integer or exists(select from private.c41_settings s where s.request_id=request_key)
      then raise exception 'stale settings' using errcode='55000'; end if;
    insert into private.c41_settings(version,settings,actor,workspace,request_id,fingerprint,reason)
      values(settings_rev+1,snap,p_actor,p_workspace,request_key,digest,reason);
    return jsonb_build_object('version',settings_rev+1);
  end if;

  if command then
    select * into org from private.organizations o where o.id=p_org for update;
    perform 1 from private.organization_memberships m where m.organization_id=p_org and m.user_id=p_actor for share;
    perform 1 from private.organization_custom_assignments a join private.organization_custom_roles r on r.id=a.role_id
      where a.organization_id=p_org and a.user_id=p_actor and a.revoked_at is null for share of a,r;
  else
    select * into org from private.organizations o where o.id=p_org;
  end if;
  if org.id is null or org.status<>'active' or org.verification_status='revoked'
    or private.institution_role(p_actor,p_org) is null or not private.organization_setup_identity_eligible(p_actor)
    then raise exception 'organization access denied' using errcode='42501'; end if;
  draft_access:=private.organization_has_permission(p_actor,p_org,'opportunities.draft');
  edit_access:=private.organization_has_permission(p_actor,p_org,'opportunities.edit');
  if not (draft_access or edit_access) then raise exception 'opportunity access denied' using errcode='42501'; end if;
  if p_action='list' then
    if p_input-'after'<>'{}' then raise exception 'invalid query' using errcode='23514'; end if;
    cursor_id:=(p_input->>'after')::uuid;
    select coalesce(jsonb_agg(to_jsonb(rows) order by rows.id),'[]') into result
      from (select o.id,o.version,o.status,r.snapshot->>'title' title,r.snapshot->>'type' type
        from private.c41_opportunities o join private.c41_revisions r on r.opportunity_id=o.id and r.version=o.version
        where fixture and o.organization_id=p_org and (cursor_id is null or o.id>cursor_id)
        order by o.id limit 21) rows;
    return jsonb_build_object('enabled',fixture,'organizationName',org.name,'canCreate',draft_access and fixture and settings->'organizationKinds' ? org.kind,
      'canEdit',edit_access and fixture,'verified',org.verification_status='verified',
      'publisherEligible',settings->'organizationKinds' ? org.kind and private.project_organization_verified(p_org),
      'settings',settings,'items',case when jsonb_array_length(result)>20 then result-20 else result end,
      'next',case when jsonb_array_length(result)>20 then result->19->>'id' else null end,
      'skills',case when fixture then (select coalesce(jsonb_agg(to_jsonb(k) order by k.code),'[]') from
        (select s.code,s.names,s.version from private.c31_skills s where s.status='active' order by s.code limit 250) k)
        else '[]'::jsonb end);
  end if;
  if not fixture then raise exception 'draft preparation closed' using errcode='42501'; end if;
  if command and ((p_action='create' and not draft_access) or (p_action<>'create' and not edit_access))
    then raise exception 'opportunity write denied' using errcode='42501'; end if;

  if p_action='detail' then
    if p_input-'before'<>'{}' or (p_input ? 'before' and not private.c32_integer(p_input->'before',1,2147483647))
      then raise exception 'invalid revision cursor' using errcode='23514'; end if;
    before_version:=(p_input->>'before')::integer;
    select * into item from private.c41_opportunities where organization_id=p_org and id=p_opportunity;
    if not found then raise exception 'opportunity unavailable' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]') into result
      from (select r.version,r.status,r.action,r.snapshot,r.representative,r.recorded_at
        from private.c41_revisions r where r.opportunity_id=item.id and (before_version is null or r.version<before_version)
        order by r.version desc limit 6) h;
    return jsonb_build_object('id',item.id,'version',item.version,'status',item.status,'representative',item.representative,
      'history',case when jsonb_array_length(result)>5 then result-5 else result end,
      'next',case when jsonb_array_length(result)>5 then result->4->'version' else null end);
  end if;

  if p_input-array['requestId','expectedVersion','snapshot']<>'{}'
    or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
    or (p_action='withdraw' and p_input ? 'snapshot')
    or ((p_action='create') is distinct from (p_opportunity is null))
    then raise exception 'invalid draft command' using errcode='23514'; end if;
  request_key:=(p_input->>'requestId')::uuid;
  if request_key is null then raise exception 'request required' using errcode='23514'; end if;
  digest:=encode(sha256(convert_to(jsonb_build_array(p_action,p_opportunity,p_input)::text,'UTF8')),'hex');
  select * into receipt from private.c41_revisions r where r.organization_id=p_org and r.request_id=request_key;
  if found then
    if receipt.revised_by is distinct from p_actor or receipt.fingerprint is distinct from digest
      then raise exception 'conflicting draft receipt' using errcode='55000'; end if;
    return jsonb_build_object('id',receipt.opportunity_id,'version',receipt.version,'status',receipt.status);
  end if;
  if p_action<>'withdraw' and not (settings->'organizationKinds' ? org.kind)
    then raise exception 'organization kind unavailable' using errcode='42501'; end if;
  next_status:=case when p_action='withdraw' then 'withdrawn' else 'draft' end;
  if p_action='create' then
    if (p_input->>'expectedVersion')::integer<>0 then raise exception 'stale draft' using errcode='55000'; end if;
    if (select count(*) from private.c41_opportunities where organization_id=p_org and status='draft')>=(settings->>'draftLimit')::int
      then raise exception 'draft limit' using errcode='55000'; end if;
    if (select count(*) from private.c41_opportunities where organization_id=p_org and created_at>=now()-interval '1 day')>=50
      then raise exception 'creation limit' using errcode='54000'; end if;
    snap:=private.c41_snapshot(p_input->'snapshot',settings);
    insert into private.c41_opportunities(organization_id,representative,version,status) values(p_org,p_actor,1,'draft')
      returning id into target;
    next_version:=1;
  else
    select * into item from private.c41_opportunities where organization_id=p_org and id=p_opportunity for update;
    if not found then raise exception 'opportunity unavailable' using errcode='42501'; end if;
    if item.status<>'draft' or item.version<>(p_input->>'expectedVersion')::integer
      then raise exception 'stale draft' using errcode='55000'; end if;
    if item.version>=100 and p_action='edit' then raise exception 'revision limit' using errcode='55000'; end if;
    if p_action='edit' then snap:=private.c41_snapshot(p_input->'snapshot',settings);
    else select r.snapshot into snap from private.c41_revisions r where r.opportunity_id=item.id and r.version=item.version; end if;
    target:=item.id; next_version:=item.version+1;
    update private.c41_opportunities set version=next_version,status=next_status,
      representative=case when p_action='withdraw' then item.representative else p_actor end where id=target;
  end if;
  insert into private.c41_revisions(organization_id,opportunity_id,version,status,revised_by,representative,action,snapshot,request_id,fingerprint)
    values(p_org,target,next_version,next_status,p_actor,case when p_action='withdraw' then item.representative else p_actor end,
      p_action,snap,request_key,digest);
  return jsonb_build_object('id',target,'version',next_version,'status',next_status);
exception when invalid_text_representation then raise exception 'invalid identifier' using errcode='23514';
end $$;

revoke all on function private.c41_defaults(),private.c41_set_valid(jsonb,jsonb),private.c41_text(jsonb,integer),
  private.c41_country(text),private.c41_reference(text),private.c41_snapshot(jsonb,jsonb),
  public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb) to service_role;
