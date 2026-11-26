-- C4.2 publication, independent review and limited expressions of interest.
create or replace function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
    'projects.propose','projects.edit','projects.submit','projects.view_private','projects.operate','polls.manage',
    'opportunities.draft','opportunities.edit','opportunities.submit','opportunities.publish','opportunities.interest'];
$$;

alter table private.c41_opportunities drop constraint c41_opportunities_status_check,
  add constraint c41_opportunities_status_check check(status in
    ('draft','submitted','changes_requested','rejected','approved','published','closed','withdrawn','restricted','expired','archived'));

create table private.c42_fixture (singleton boolean primary key check(singleton));
create table private.c42_settings (
  version integer primary key check(version>0), settings jsonb not null
);
create table private.c42_reviewers (
  id uuid primary key default gen_random_uuid(),
  reviewer uuid references auth.users(id) on delete set null,
  country text not null check(private.c41_country(country)),
  department text references public.departments(code),
  expires_at timestamptz not null, revoked_at timestamptz,
  check((country='HT')=(department is not null))
);
create unique index c42_active_reviewer_scope on private.c42_reviewers(reviewer,country,coalesce(department,'')) where revoked_at is null;
create table private.c42_cases (
  opportunity uuid not null,
  revision integer not null,
  submitted_by uuid references auth.users(id) on delete set null,
  authority uuid references private.c42_reviewers(id),
  assigned_until timestamptz,
  next_state text not null default 'submitted' check(next_state in ('submitted','challenge')),
  state text not null check(state in ('submitted','assigned','approved','changes_requested','rejected','challenge','withdrawn')),
  decision_by uuid references auth.users(id) on delete set null,
  decision_at timestamptz,
  explanation text,
  challenged boolean not null default false,
  submission_at timestamptz not null default statement_timestamp(),
  primary key(opportunity,revision),
  foreign key(opportunity,revision) references private.c41_revisions(opportunity_id,version)
);
create index c42_case_staff_queue on private.c42_cases(state,opportunity,revision) where state in ('submitted','assigned','challenge');
create index c42_case_reviewer on private.c42_cases(authority,opportunity,revision) where state='assigned';

create table private.c42_publications (
  opportunity uuid not null,
  revision integer not null,
  organization uuid not null,
  responsible uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default statement_timestamp(),
  suppressed_at timestamptz,
  primary key(opportunity,revision),
  foreign key(opportunity,revision) references private.c42_cases(opportunity,revision),
  foreign key(organization,opportunity) references private.c41_opportunities(organization_id,id)
);
create unique index c42_one_publication on private.c42_publications(opportunity) where suppressed_at is null;
create index c42_public_by_organization on private.c42_publications(organization,opportunity) where suppressed_at is null;
create index c42_by_publisher on private.c42_publications(published_by) where suppressed_at is null;
create index c42_by_representative on private.c42_publications(responsible) where suppressed_at is null;

create table private.c42_interest (
  id uuid primary key default gen_random_uuid(),
  opportunity uuid not null,
  revision integer not null,
  member uuid references auth.users(id) on delete set null,
  state text not null check(state in ('submitted','acknowledged','follow_up','closed','withdrawn')),
  version integer not null default 1 check(version>0),
  shared_identity jsonb,
  statement text,
  consent_at timestamptz not null default statement_timestamp(),
  foreign key(opportunity,revision) references private.c42_publications(opportunity,revision),
  unique(opportunity,member)
);
create index c42_interest_organization_page on private.c42_interest(opportunity,id);
create index c42_interest_member_page on private.c42_interest(member,id);

create table private.c42_receipts (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid,
  fingerprint bytea,
  action text not null,
  opportunity uuid,
  revision integer,
  subject uuid,
  explanation text,
  result jsonb,
  recorded_at timestamptz not null default statement_timestamp(),
  unique(actor,request_id)
);
create index c42_receipt_rate on private.c42_receipts(actor,action,recorded_at desc);
create index c42_receipt_case on private.c42_receipts(opportunity,revision,id desc);
create unique index c42_report_once on private.c42_receipts(actor,opportunity,revision) where action='report';

do $guards$
declare name text;
begin
  foreach name in array array['c42_fixture','c42_settings','c42_reviewers','c42_cases','c42_publications','c42_interest','c42_receipts'] loop
    execute format('alter table private.%I enable row level security',name);
    execute format('revoke all on private.%I from public,anon,authenticated,authenticator,service_role',name);
  end loop;
end $guards$;
revoke all on sequence private.c42_receipts_id_seq from public,anon,authenticated,authenticator,service_role;

create function private.c42_field_contract() returns jsonb language sql immutable set search_path='' as $$
  select '{"employment":{"employmentType":"full_time part_time temporary contract seasonal","responsibilities":"text","compensation":"money","compensationPeriod":"hour day week month year project","experience":"text?","requiredSkills":"skills?","preferredSkills":"skills?","languages":"text?","qualifications":"text?","benefits":"text?","startDate":"date?","positions":"count?"},"internship":{"duration":"text","learningObjectives":"text","payment":"paid unpaid","compensation":"money?","prerequisites":"text?","supervision":"text","startDate":"date","endDate":"date"},"scholarship":{"sponsor":"text","purpose":"text","academicLevel":"text","subject":"text","funding":"full partial","expenses":"text","eligibility":"text","deadline":"date","awardPeriod":"text","awards":"count?"},"training":{"skillsTaught":"skills","provider":"text","duration":"text","format":"remote on_site hybrid","prerequisites":"text?","payment":"free paid","cost":"money","certificate":"text?","eventId":"uuid?","startsAt":"instant?","endsAt":"instant?"},"education":{"institution":"text","subject":"text","academicLevel":"text","duration":"text","admission":"text","tuition":"money","format":"remote on_site hybrid","deadline":"date","enrollmentDeadline":"date"},"apprenticeship":{"trade":"text","learningObjectives":"text","practicalExperience":"text","supervision":"text","duration":"text","payment":"paid unpaid","compensation":"money?","qualifications":"text?","safeguarding":"text"},"workshop":{"topic":"text","learningObjectives":"text","startsAt":"instant","endsAt":"instant","format":"remote on_site hybrid","capacity":"count","participationRequirements":"text?","eventId":"uuid?"}}'::jsonb
$$;

create function private.c42_qualified_details(details jsonb, kind text, complete boolean)
returns jsonb language plpgsql stable set search_path='' as $$
declare spec jsonb:=private.c42_field_contract()->kind; field record; value jsonb; rule text; optional boolean; money_state text;
begin
  if jsonb_typeof(details) is distinct from 'object' or spec is null
    or exists(select from jsonb_object_keys(details) k where not spec ? k)
    then raise exception 'invalid type details' using errcode='23514'; end if;
  for field in select * from jsonb_each_text(spec) loop
    optional:=right(field.value,1)='?'; rule:=rtrim(field.value,'?'); value:=details->field.key;
    if value is null then
      if complete and not optional then raise exception 'incomplete type details' using errcode='23514'; end if;
      continue;
    end if;
    if not coalesce(case rule
      when 'text' then private.c41_text(value,800)
      when 'date' then jsonb_typeof(value)='string' and (value#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (value#>>'{}')::date between date '1900-01-01' and date '2199-12-31'
      when 'instant' then jsonb_typeof(value)='string' and (value#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$'
        and (value#>>'{}')::timestamptz between '1900-01-01T00:00:00Z'::timestamptz and '2200-01-01T00:00:00Z'::timestamptz
      when 'count' then private.c32_integer(value,1,10000)
      when 'uuid' then jsonb_typeof(value)='string' and (value#>>'{}') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      when 'skills' then case when jsonb_typeof(value)='array' then jsonb_array_length(value) between 1 and 12
        and jsonb_array_length(value)=(select count(*) from private.c31_skills s where s.status='active' and value ? s.code)
        else false end
      when 'money' then case when jsonb_typeof(value)='object' and value->>'state' in ('unknown','undisclosed','zero','range') then
        value-array['state','min','max','currency']='{}' and case value->>'state'
          when 'range' then jsonb_typeof(value->'min')='number' and jsonb_typeof(value->'max')='number'
            and value->>'min' ~ '^[0-9]{1,8}([.][0-9]{1,2})?$' and value->>'max' ~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
            and (value->>'min')::numeric <= (value->>'max')::numeric and (value->>'max')::numeric>0
            and value->>'currency' ~ '^[A-Z]{3}$'
          else value-'state'='{}' end
        else false end
      else jsonb_typeof(value)='string' and (value#>>'{}')=any(string_to_array(rule,' '))
    end,false) then raise exception 'invalid opportunity field' using errcode='23514'; end if;
  end loop;
  money_state:=details->'compensation'->>'state';
  if (details->>'payment'='unpaid' and money_state is distinct from 'zero' and (complete or money_state is not null))
    or (details->>'payment'='paid' and money_state='zero')
    or (details->>'payment'='free' and details->'cost'->>'state' is distinct from 'zero' and (complete or details?'cost'))
    or (details->>'payment'='paid' and details->'cost'->>'state'='zero')
    or (details->>'endDate')::date < (details->>'startDate')::date
    or (details->>'enrollmentDeadline')::date < (details->>'deadline')::date
    or (details->>'endsAt')::timestamptz <= (details->>'startsAt')::timestamptz
    then raise exception 'inconsistent opportunity fields' using errcode='23514'; end if;
  return details;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception 'invalid opportunity date or amount' using errcode='23514';
end $$;

-- Reuse the existing validated C4.1 snapshots and the established private draft workspace.
do $extend$
declare definition text; old text; revised text;
begin
  select pg_get_functiondef('private.c41_snapshot(jsonb,jsonb)'::regprocedure) into definition;
  old:=$old$'references','applicationMethod']$old$;
  if strpos(definition,old)=0 then raise exception 'C4.1 snapshot source mismatch'; end if;
  definition:=replace(definition,old,$new$'references','applicationMethod','details']$new$);
  old:=$old$  return value||jsonb_build_object('skills',skill_snapshot,'applicationMethod',method,'schemaVersion',1);$old$;
  if strpos(definition,old)=0 then raise exception 'C4.1 snapshot return mismatch'; end if;
  revised:=$new$  if value?'details' then
    perform private.c42_qualified_details(value->'details',value->>'type',false);
  end if;
  if value?'details' then
    value:=value||jsonb_build_object('detailSkillVersions',coalesce((select jsonb_object_agg(s.code,s.version)
      from private.c31_skills s where s.status='active' and (
        value->'details'->'requiredSkills' ? s.code or value->'details'->'preferredSkills' ? s.code
        or value->'details'->'skillsTaught' ? s.code)),'{}'::jsonb));
  end if;
  return value||jsonb_build_object('skills',skill_snapshot,'applicationMethod',method,'schemaVersion',
    case when value?'details' then 2 else 1 end);$new$;
  execute replace(definition,old,revised);

  select pg_get_functiondef('public.c41_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  old:=$old$    or private.institution_role(p_actor,p_org) is null or not private.organization_setup_identity_eligible(p_actor)
    then raise exception 'organization access denied' using errcode='42501'; end if;$old$;
  revised:=$new$    or private.institution_role(p_actor,p_org) is null
    then raise exception 'organization access denied' using errcode='42501'; end if;
  if not private.organization_setup_identity_eligible(p_actor)
    then raise exception 'representative identity required' using errcode='PJP20'; end if;$new$;
  if strpos(definition,old)=0 then raise exception 'C4.1 organization source mismatch'; end if;
  definition:=replace(definition,old,revised);
  old:=$old$  if not (draft_access or edit_access) then raise exception 'opportunity access denied' using errcode='42501'; end if;$old$;
  if strpos(definition,old)=0 then raise exception 'C4.1 opportunity access mismatch'; end if;
  definition:=replace(definition,old,$new$  if not (draft_access or edit_access or (not command and (
      private.organization_has_permission(p_actor,p_org,'opportunities.submit')
      or private.organization_has_permission(p_actor,p_org,'opportunities.publish')
      or private.organization_has_permission(p_actor,p_org,'opportunities.interest'))))
    then raise exception 'opportunity access denied' using errcode='42501'; end if;$new$);
  old:=$old$    if item.status<>'draft' or item.version<>(p_input->>'expectedVersion')::integer$old$;
  if strpos(definition,old)=0 then raise exception 'C4.1 lifecycle source mismatch'; end if;
  execute replace(definition,old,$new$    if (item.status<>'draft' and not (p_action='edit'
      and item.status in ('changes_requested','rejected','approved','published','restricted','expired')
      and exists(select from private.c42_fixture))) or item.version<>(p_input->>'expectedVersion')::integer$new$);
end $extend$;


create function private.c42_configuration() returns jsonb language sql stable set search_path='' as $$
  select coalesce((select settings from private.c42_settings order by version desc limit 1),
    '{"types":["employment","internship","scholarship","training","education","apprenticeship","workshop"],
      "methods":["external","expression_of_interest","event_registration"],"submissionsPerDay":10,
      "interestPerDay":5,"reportsPerDay":4,"staffingPlan":"","readinessNotes":""}'::jsonb)
$$;

create function private.c42_representative(actor uuid, organization uuid, capability text)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.organization_setup_identity_eligible(actor)
    and private.institution_role(actor,organization) is not null
    and private.organization_has_permission(actor,organization,capability)
    and private.project_organization_verified(organization)
    and not exists(select from private.m23_restrictions r where r.subject_id=actor
      and r.capability in ('organization_manage','organization_publish')
      and r.starts_at<=statement_timestamp() and (r.expires_at is null or r.expires_at>statement_timestamp())
      and r.revoked_at is null and (r.scope_kind='platform' or r.scope_id=organization)),false)
$$;

create function private.c42_event(source jsonb, organization uuid) returns uuid
language sql stable set search_path='' as $$
  select e.id from feed_data.events e
  where e.id=(source->'details'->>'eventId')::uuid and e.organization_id=organization
    and e.status='published' and e.visibility='public' and e.moderated_at is null
    and e.country is not distinct from source->>'country' and e.department is not distinct from source->>'department'
    and e.starts_at=(source->'details'->>'startsAt')::timestamptz
    and e.ends_at=(source->'details'->>'endsAt')::timestamptz
    and e.ends_at>statement_timestamp()
    and e.format=case source->>'mode' when 'on_site' then 'in_person' when 'remote' then 'online' else source->>'mode' end
    and (source->'details'->>'capacity' is null or e.capacity=(source->'details'->>'capacity')::integer)
    and feed_data.f25_policy('events.enabled') and feed_data.f25_policy('events.organization')
    and feed_data.f25_policy('events.rsvp') and feed_data.f25_event_public_share(e)
$$;

create function private.c42_publication_eligible(p private.c42_publications, source jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce(p.suppressed_at is null
    and private.c42_configuration()->'types' ? (source->>'type')
    and private.c42_representative(p.published_by,p.organization,'opportunities.publish')
    and private.organization_setup_identity_eligible(p.responsible)
    and private.institution_role(p.responsible,p.organization) is not null
    and coalesce((source->>'closesOn')::date, date '2199-12-31')>=(statement_timestamp() at time zone 'America/Port-au-Prince')::date,false)
$$;

create function private.c42_methods(source jsonb, organization uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'external',source->>'applicationMethod'='external' and private.c42_configuration()->'methods' ? 'external',
    'interest',source->>'applicationMethod'='expression_of_interest' and private.c42_configuration()->'methods' ? 'expression_of_interest',
    'event',case when source->>'applicationMethod'='event_registration' and private.c42_configuration()->'methods' ? 'event_registration'
      then private.c42_event(source,organization) end)
$$;

create function private.c42_scope(grant_row private.c42_reviewers, source jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce(grant_row.revoked_at is null and grant_row.expires_at>statement_timestamp()
    and grant_row.country=source->>'country'
    and grant_row.department is not distinct from source->>'department'
    and private.institution_reviewer(grant_row.reviewer) and private.member_identity_verified(grant_row.reviewer),false)
$$;

create function private.c42_independent(person uuid, item private.c41_opportunities, review private.c42_cases) returns boolean
language sql stable set search_path='' as $$
  select coalesce(person is not null and person is distinct from item.representative and person is distinct from review.submitted_by
    and person is distinct from review.decision_by and not private.m24_org_conflict(person,item.organization_id)
    and not exists(select from private.c41_revisions r where r.opportunity_id=item.id and r.revised_by=person)
    and not exists(select from private.c42_interest i where i.opportunity=item.id and i.member=person)
    and not exists(select from private.c42_receipts e where e.opportunity=item.id and e.actor=person
      and e.action in ('report','recuse')),false)
$$;

create function private.c42_public_identity(actor uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('username',p.username,'displayName',p.display_name)
    from public.profiles p where p.user_id=actor and feed_data.f24_identity(p,null)
$$;

create function private.c42_interest_recipient(recipient uuid, applicant uuid, item private.c41_opportunities) returns boolean
language sql stable set search_path='' as $$
  select private.c42_representative(recipient,item.organization_id,'opportunities.interest')
    and feed_data.author_active(applicant)
    and not feed_data.blocked_pair(recipient,applicant)
    and not feed_data.blocked_pair(item.representative,applicant)
    and private.c42_public_identity(applicant) is not null
$$;

-- A database-driven suppression receipt prevents a restored entitlement from opening the old publication.
create function private.c42_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare changed jsonb; prior jsonb; org uuid; person uuid; changed_opportunity uuid;
begin
  changed:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prior:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  if tg_table_name='c41_opportunities' then
    if changed->'version'=prior->'version' and changed->>'status'='published' then return null; end if;
    changed_opportunity:=(changed->>'id')::uuid;
  elsif tg_table_name='organizations' then org:=(changed->>'id')::uuid;
  elsif tg_table_name in ('organization_memberships','organization_custom_assignments','organization_custom_roles','verification_applications') then
    org:=(changed->>'organization_id')::uuid;
    if org is null then return null; end if;
  elsif tg_table_name in ('account_restrictions','verification_records') then person:=(changed->>'user_id')::uuid;
  else person:=(changed->>'subject_id')::uuid;
  end if;
  if org is null and person is null and changed_opportunity is null then return null; end if;
  with removed as (
    update private.c42_publications p set suppressed_at=clock_timestamp()
    from private.c41_opportunities o, private.c41_revisions r
    where p.opportunity=o.id and r.opportunity_id=p.opportunity and r.version=p.revision and p.suppressed_at is null
      and (p.organization=org or p.opportunity=changed_opportunity or person in (p.responsible,p.published_by)
        or (person is not null and exists(select from private.organization_memberships m
          where m.organization_id=p.organization and m.user_id=person and m.role='owner')))
      and (o.status<>'published' or o.version<>p.revision or not private.c42_publication_eligible(p,r.snapshot))
    returning p.opportunity,p.revision
  ) insert into private.c42_receipts(action,opportunity,revision,explanation)
    select 'suppressed',r.opportunity,r.revision,'Current publication eligibility changed.' from removed r;
  return null;
end $$;

create trigger c42_opportunity_suppression after update of version,status on private.c41_opportunities
  for each row execute function private.c42_invalidate();
create trigger c42_organization_suppression after update of status,verification_status on private.organizations
  for each row execute function private.c42_invalidate();
create trigger c42_verification_suppression after update of status or delete on private.verification_applications
  for each row execute function private.c42_invalidate();
create trigger c42_membership_suppression after update or delete on private.organization_memberships
  for each row execute function private.c42_invalidate();
create trigger c42_assignment_suppression after update or delete on private.organization_custom_assignments
  for each row execute function private.c42_invalidate();
create trigger c42_role_suppression after update or delete on private.organization_custom_roles
  for each row execute function private.c42_invalidate();
create trigger c42_identity_suppression after update or delete on public.verification_records
  for each row execute function private.c42_invalidate();
create trigger c42_standing_suppression after insert or update on private.m22_account_sanctions
  for each row execute function private.c42_invalidate();
create trigger c42_legacy_standing_suppression after insert or update on private.account_restrictions
  for each row execute function private.c42_invalidate();
create trigger c42_feature_suppression after insert or update on private.m23_restrictions
  for each row execute function private.c42_invalidate();


create function public.c42_opportunities_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_org uuid,p_opportunity uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  enabled boolean:=coalesce(p_fixture,false) and exists(select from private.c42_fixture);
  founder_lane boolean:=p_action in ('settings','configure','appoint','revoke','assign','release','admin_queue','reports');
  review_lane boolean:=p_action in ('review_queue','review_reports','decide','recuse','restrict');
  write_action boolean:=p_action in ('configure','appoint','revoke','assign','release','submit','decide','recuse','challenge',
    'publish','close','withdraw','expire','archive','restrict','express','interest_state','interest_withdraw','report');
  config jsonb; result jsonb; settings_version integer; reason text; req uuid; hash bytea; previous private.c42_receipts;
  item private.c41_opportunities; review private.c42_cases; grant_row private.c42_reviewers; published private.c42_publications;
  interest private.c42_interest; source jsonb; scope_org uuid; target uuid; cursor_id uuid; deadline timestamptz;
  expected integer; operation text; next_status text; method text; identity_data jsonb; application_open boolean;
begin
  if p_action is null or p_action not in ('settings','configure','appoint','revoke','assign','release','admin_queue','reports',
    'review_queue','review_reports','decide','recuse','restrict','submit','challenge','publish','close','withdraw','expire','archive','organization_case',
    'public_list','public_detail','destination','interest_preview','express','my_interest','organization_interest','interest_state','interest_withdraw','report')
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'invalid command' using errcode='23514'; end if;
  if write_action then
    perform private.s2b_lock_actor(p_actor,p_session);
    if p_action='configure' then perform pg_advisory_xact_lock(20261125,420);
    else perform pg_advisory_xact_lock_shared(20261125,420); end if;
  end if;
  if (p_actor is not null or p_action not in ('public_list','public_detail'))
    and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
      and private.member_onboarding_access(p_actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if founder_lane and not coalesce(private.platform_founder(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    then raise exception 'Founder workspace required' using errcode='42501'; end if;
  if review_lane and not coalesce(private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'review')
    and private.member_identity_verified(p_actor),false) then raise exception 'review workspace required' using errcode='42501'; end if;
  config:=private.c42_configuration();

  if p_action='settings' then
    select coalesce(max(s.version),0) into settings_version from private.c42_settings s;
    return jsonb_build_object('settings',config,'version',settings_version,'live',false,
      'fixture',enabled,'history',coalesce((select jsonb_agg(to_jsonb(r) order by r.id desc) from (
        select e.id,e.explanation,e.recorded_at,e.result from private.c42_receipts e
        where e.action='configure' order by e.id desc limit 20) r),'[]'));
  end if;
  if not enabled and p_action<>'configure'
    and not (coalesce(p_fixture,false) and p_action in ('my_interest','interest_withdraw')) then
    if p_action in ('public_list','public_detail','admin_queue','review_queue','my_interest','organization_case') then
      return jsonb_build_object('enabled',false,'items','[]'::jsonb);
    end if;
    raise exception 'opportunity processing closed' using errcode='42501';
  end if;
  if write_action then
    req:=(p_input->>'requestId')::uuid;
    if req is null then raise exception 'missing request receipt' using errcode='23514'; end if;
    hash:=sha256(convert_to(jsonb_build_array(p_org,p_opportunity,p_action,p_input)::text,'UTF8'));
    select * into previous from private.c42_receipts e where e.actor=p_actor and e.request_id=req;
    if found then
      if previous.fingerprint is distinct from hash or previous.workspace is distinct from p_workspace
        then raise exception 'conflicting receipt' using errcode='55000'; end if;
      return previous.result;
    end if;
    if (select count(*) from private.c42_receipts e where e.actor=p_actor and e.action=p_action
      and e.recorded_at>statement_timestamp()-interval '1 day')>=(case p_action
        when 'submit' then (config->>'submissionsPerDay')::integer
        when 'express' then (config->>'interestPerDay')::integer
        when 'report' then (config->>'reportsPerDay')::integer else 80 end)
      then raise exception 'opportunity rate limit' using errcode='54000'; end if;
  end if;
  if p_action in ('configure','appoint','revoke','assign','release','decide','recuse','restrict','challenge','report') then
    reason:=p_input->>'reason';
    if not private.c41_text(p_input->'reason',500) or char_length(btrim(reason))<10
      then raise exception 'recorded reason required' using errcode='23514'; end if;
  end if;

  if p_action='configure' then
    select coalesce(max(s.version),0) into settings_version from private.c42_settings s;
    if not private.c32_integer(p_input->'version',0,2147483646) or p_input->'confirmed' is distinct from 'true'
      or p_input-array['requestId','version','confirmed','reason','settings']<>'{}'
      then raise exception 'invalid configuration receipt' using errcode='23514'; end if;
    if settings_version<>(p_input->>'version')::integer then raise exception 'stale settings' using errcode='55000'; end if;
    config:=p_input->'settings';
    if jsonb_typeof(config) is distinct from 'object' or config-array['types','methods','submissionsPerDay','interestPerDay','reportsPerDay','staffingPlan','readinessNotes']<>'{}'
      or not private.c41_set_valid(config->'types',private.c41_defaults()->'types')
      or not private.c41_set_valid(config->'methods','["external","expression_of_interest","event_registration"]')
      or not private.c32_integer(config->'submissionsPerDay',1,20)
      or not private.c32_integer(config->'interestPerDay',1,10)
      or not private.c32_integer(config->'reportsPerDay',1,8)
      or (config?'staffingPlan' and config->>'staffingPlan'<>'' and not private.c41_text(config->'staffingPlan',500))
      or (config?'readinessNotes' and config->>'readinessNotes'<>'' and not private.c41_text(config->'readinessNotes',500))
      then raise exception 'invalid prepared settings' using errcode='23514'; end if;
    insert into private.c42_settings values(settings_version+1,config);
    with removed as (
      update private.c42_publications p set suppressed_at=clock_timestamp()
      from private.c41_revisions r where p.suppressed_at is null and r.opportunity_id=p.opportunity and r.version=p.revision
        and (not config->'types' ? (r.snapshot->>'type') or
          (r.snapshot->>'applicationMethod' <> 'undecided' and not config->'methods' ? (r.snapshot->>'applicationMethod')))
      returning p.opportunity,p.revision
    ) insert into private.c42_receipts(action,opportunity,revision,explanation)
      select 'suppressed',r.opportunity,r.revision,'Prepared policy removed this listing type or method.' from removed r;
    result:=jsonb_build_object('version',settings_version+1);

  elsif p_action='appoint' then
    if p_input->'confirmed' is distinct from 'true' then raise exception 'confirmation required' using errcode='23514'; end if;
    target:=(p_input->>'reviewer')::uuid;
    deadline:=(p_input->>'expiresAt')::timestamptz;
    if not coalesce(target<>p_actor and private.institution_reviewer(target) and private.member_identity_verified(target)
      and deadline>statement_timestamp() and deadline<=statement_timestamp()+interval '90 days'
      and private.c41_country(p_input->>'country'),false) then raise exception 'reviewer ineligible' using errcode='42501'; end if;
    update private.c42_reviewers set revoked_at=clock_timestamp() where reviewer=target
      and country=p_input->>'country' and department is not distinct from p_input->>'department'
      and revoked_at is null and expires_at<=statement_timestamp();
    insert into private.c42_reviewers(reviewer,country,department,expires_at)
      values(target,p_input->>'country',p_input->>'department',deadline) returning id into target;
    result:=jsonb_build_object('grant',target);

  elsif p_action='revoke' then
    if p_input->'confirmed' is distinct from 'true' then raise exception 'confirmation required' using errcode='23514'; end if;
    target:=(p_input->>'grant')::uuid;
    update private.c42_reviewers set revoked_at=clock_timestamp() where id=target and revoked_at is null;
    if not found then raise exception 'grant unavailable' using errcode='55000'; end if;
    update private.c42_cases set state=next_state,authority=null,assigned_until=null where authority=target and state='assigned';
    with removed as (
      update private.c42_publications p set suppressed_at=clock_timestamp() from private.c42_cases c
      where c.opportunity=p.opportunity and c.revision=p.revision and c.authority=target and p.suppressed_at is null
      returning p.opportunity,p.revision
    ) insert into private.c42_receipts(action,opportunity,revision,explanation)
      select 'suppressed',r.opportunity,r.revision,'Publication approval authority was revoked.' from removed r;
    result:=jsonb_build_object('revoked',true);

  elsif p_action in ('admin_queue','review_queue') then
    cursor_id:=(p_input->>'after')::uuid;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.opportunity),'[]') into result from (
      select c.opportunity,c.revision,c.state,c.authority,c.assigned_until,o.organization_id,
        r.snapshot->>'title' title,r.snapshot->>'country' country,r.snapshot->>'department' department,
        case when review_lane then r.snapshot end as snapshot,
        case when review_lane then (select e.explanation from private.c42_receipts e where e.opportunity=c.opportunity
          and e.revision=c.revision and e.action='submit' order by e.id limit 1) end as ownership,
        case when review_lane and c.next_state='challenge' then (select e.explanation from private.c42_receipts e where e.opportunity=c.opportunity
          and e.revision=c.revision and e.action='challenge' order by e.id desc limit 1) end as challenge_reason
      from private.c42_cases c join private.c41_opportunities o on o.id=c.opportunity and o.version=c.revision
      join private.c41_revisions r on r.opportunity_id=c.opportunity and r.version=c.revision
      left join private.c42_reviewers g on g.id=c.authority
      where (cursor_id is null or c.opportunity>cursor_id)
        and c.state in ('submitted','assigned','challenge')
        and (founder_lane or (c.state='assigned' and c.assigned_until>statement_timestamp() and g.reviewer=p_actor
          and private.c42_scope(g,r.snapshot) and private.c42_independent(p_actor,o,c)))
      order by c.opportunity limit 21) q;
    return jsonb_build_object('enabled',true,'items',case when jsonb_array_length(result)>20 then result-20 else result end,
      'next',case when jsonb_array_length(result)>20 then result->19->>'opportunity' end,
      'grants',case when founder_lane then coalesce((select jsonb_agg(to_jsonb(a)) from (
        select g.id,g.reviewer,g.country,g.department,g.expires_at,p.username from private.c42_reviewers g
        left join public.profiles p on p.user_id=g.reviewer where g.revoked_at is null and g.expires_at>statement_timestamp()
        order by g.id limit 40) a),'[]') end);

  elsif p_action in ('reports','review_reports') then
    if p_opportunity is not null then raise exception 'report queue scope' using errcode='23514'; end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(q) order by q.id desc) from (
      select e.id,e.opportunity,e.revision,e.explanation,e.result->>'category' category,e.recorded_at,
        case when review_lane then (select g.id from private.c42_reviewers g
          where g.reviewer=p_actor and private.c42_scope(g,r.snapshot) order by g.id limit 1) end as grant_id
      from private.c42_receipts e join private.c41_revisions r on r.opportunity_id=e.opportunity and r.version=e.revision
      join private.c41_opportunities o on o.id=e.opportunity
      left join private.c42_cases c on c.opportunity=o.id and c.revision=e.revision
      where e.action='report' and (founder_lane or (o.status='published' and o.version=e.revision
        and private.c42_independent(p_actor,o,c) and not exists(select from private.c42_receipts prior
          where prior.opportunity=o.id and prior.revision=c.revision and prior.action='decide' and prior.actor=p_actor)
        and exists(select from private.c42_reviewers g
          where g.reviewer=p_actor and private.c42_scope(g,r.snapshot)))) and (p_input->>'before' is null or e.id<(p_input->>'before')::bigint)
      order by e.id desc limit 20) q),'[]'));

  elsif p_action in ('public_list','public_detail','destination') then
    cursor_id:=(p_input->>'after')::uuid;
    if p_org is null then raise exception 'organization required' using errcode='23514'; end if;
    if p_action='destination' then
      select r.snapshot into source from private.c42_publications p
        join private.c41_opportunities o on o.id=p.opportunity and o.version=p.revision and o.status='published'
        join private.c41_revisions r on r.opportunity_id=p.opportunity and r.version=p.revision
        where p.organization=p_org and p.opportunity=p_opportunity and p.revision=(p_input->>'version')::integer
          and not feed_data.blocked_pair(p_actor,p.responsible)
          and p_input->'confirmed'='true' and private.c42_publication_eligible(p,r.snapshot)
          and (private.c42_methods(r.snapshot,p.organization)->>'external')::boolean
          and coalesce((r.snapshot->>'opensOn')::date,date '1900-01-01')<=(statement_timestamp() at time zone 'America/Port-au-Prince')::date;
      if not found then raise exception 'destination unavailable' using errcode='42501'; end if;
      return jsonb_build_object('url',source->'references'->>0);
    end if;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from (
      select p.opportunity id,p.revision version,p.published_at,org.name organization,
        (org.verification_status='verified') verified,
        r.snapshot-array['references','representative'] || jsonb_build_object('details',coalesce(r.snapshot->'details','{}')-'eventId') snapshot,
        private.c42_methods(r.snapshot,p.organization) methods
      from private.c42_publications p join private.c41_opportunities o on o.id=p.opportunity and o.version=p.revision and o.status='published'
      join private.c41_revisions r on r.opportunity_id=p.opportunity and r.version=p.revision
      join private.organizations org on org.id=p.organization
      where p.organization=p_org and p.suppressed_at is null
        and (cursor_id is null or p.opportunity>cursor_id)
        and (p_action='public_list' or p.opportunity=p_opportunity)
        and (p_actor is null or not feed_data.blocked_pair(p_actor,p.responsible))
        and private.c42_publication_eligible(p,r.snapshot)
      order by p.opportunity limit 21) q;
    return jsonb_build_object('enabled',true,'items',case when jsonb_array_length(result)>20 then result-20 else result end,
      'next',case when jsonb_array_length(result)>20 then result->19->>'id' end);

  elsif p_action='my_interest' then
    cursor_id:=(p_input->>'after')::uuid;
    return jsonb_build_object('enabled',true,'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
      select i.id,i.opportunity,i.revision,i.state,i.version,i.consent_at,r.snapshot->>'title' title
      from private.c42_interest i join private.c41_revisions r on r.opportunity_id=i.opportunity and r.version=i.revision
      where i.member=p_actor and (cursor_id is null or i.id>cursor_id) order by i.id limit 20) q),'[]'));

  elsif p_action='interest_withdraw' then
    target:=(p_input->>'interest')::uuid;
    update private.c42_interest i set state='withdrawn',shared_identity=null,statement=null,version=i.version+1
      where i.id=target and i.member=p_actor and i.version=(p_input->>'version')::integer
        and i.state<>'withdrawn' returning * into interest;
    if not found then raise exception 'interest unavailable or changed' using errcode='55000'; end if;
    p_opportunity:=interest.opportunity; expected:=interest.revision;
    result:=jsonb_build_object('id',target,'state','withdrawn','version',interest.version);

  else
    if write_action then
      perform 1 from private.organizations org where org.id=(select o.organization_id from private.c41_opportunities o where o.id=p_opportunity) for share;
      select * into item from private.c41_opportunities o where o.id=p_opportunity for update;
    else
      select * into item from private.c41_opportunities o where o.id=p_opportunity;
    end if;
    if item.id is null or (p_org is not null and item.organization_id<>p_org)
      then raise exception 'opportunity unavailable' using errcode='42501'; end if;
    scope_org:=item.organization_id;
    expected:=item.version;
    if write_action and p_action<>'interest_state' and (p_input->>'version')::integer is distinct from expected
      then raise exception 'stale opportunity revision' using errcode='55000'; end if;
    select * into review from private.c42_cases c where c.opportunity=item.id and c.revision=expected;
    select r.snapshot into source from private.c41_revisions r where r.opportunity_id=item.id and r.version=expected;
    select * into published from private.c42_publications p where p.opportunity=item.id and p.revision=expected;
    method:=source->>'applicationMethod';
    application_open:=coalesce((source->>'opensOn')::date,date '1900-01-01')<=(statement_timestamp() at time zone 'America/Port-au-Prince')::date;

    if p_action='organization_case' then
      if private.institution_role(p_actor,scope_org) is null or not private.organization_setup_identity_eligible(p_actor)
        or not exists(select from unnest(array['opportunities.draft','opportunities.edit','opportunities.submit','opportunities.publish','opportunities.interest']) k
          where private.organization_has_permission(p_actor,scope_org,k)) then raise exception 'organization access denied' using errcode='42501'; end if;
      return jsonb_build_object('enabled',true,'version',expected,'status',item.status,
        'review',case when review.opportunity is not null then jsonb_build_object('state',review.state,'explanation',review.explanation,
          'decidedAt',review.decision_at,'challenged',review.challenged) end,
        'canSubmit',private.c42_representative(p_actor,scope_org,'opportunities.submit'),
        'canPublish',private.c42_representative(p_actor,scope_org,'opportunities.publish'),
        'canReadInterest',private.c42_representative(p_actor,scope_org,'opportunities.interest'));

    elsif p_action='submit' then
      if not private.c42_representative(p_actor,scope_org,'opportunities.submit') or item.status<>'draft'
        or not config->'types' ? (source->>'type') or (source->>'country'='HT' and source->>'department' is null)
        or (method<>'undecided' and not config->'methods' ? method)
        or source->>'closesOn' is null or (source->>'closesOn')::date<(statement_timestamp() at time zone 'America/Port-au-Prince')::date
        or (source->'details'->>'format' is not null and source->'details'->>'format'<>source->>'mode')
        or (source->'details'->>'deadline' is not null and source->'details'->>'deadline'<>source->>'closesOn')
        then raise exception 'submission unavailable' using errcode='42501'; end if;
      perform private.c42_qualified_details(source->'details',source->>'type',true);
      if method='external' then
        if not private.c41_text(p_input->'ownership',500) or not private.c41_reference(source->'references'->>0)
          then raise exception 'ownership evidence required' using errcode='23514'; end if;
        reason:=p_input->>'ownership';
      end if;
      if (method='event_registration' or source->'details' ? 'eventId')
        and (source->>'type' not in ('training','workshop') or private.c42_event(source,scope_org) is null)
        then raise exception 'event association unavailable' using errcode='42501'; end if;
      if p_input->'confirmed' is distinct from 'true' then raise exception 'confirmation required' using errcode='23514'; end if;
      insert into private.c42_cases(opportunity,revision,submitted_by,state) values(item.id,expected,p_actor,'submitted');
      update private.c41_opportunities set status='submitted' where id=item.id;
      result:=jsonb_build_object('status','submitted','version',expected);

    elsif p_action='assign' then
      if p_input->'confirmed' is distinct from 'true' then raise exception 'confirmation required' using errcode='23514'; end if;
      if review.state is null or (review.state not in ('submitted','challenge')
        and not (review.state='assigned' and (review.assigned_until<=statement_timestamp()
          or not exists(select from private.c42_reviewers g where g.id=review.authority and private.c42_scope(g,source)))))
        then raise exception 'case unavailable for assignment' using errcode='55000'; end if;
      select * into grant_row from private.c42_reviewers where id=(p_input->>'grant')::uuid for share;
      if grant_row.id is null or not private.c42_scope(grant_row,source) or not private.c42_independent(grant_row.reviewer,item,review)
        then raise exception 'reviewer scope or conflict' using errcode='42501'; end if;
      target:=grant_row.id;
      update private.c42_cases set authority=target,state='assigned',
        assigned_until=least(grant_row.expires_at,statement_timestamp()+interval '7 days') where opportunity=item.id and revision=expected;
      result:=jsonb_build_object('status','assigned','version',expected);

    elsif p_action='release' then
      if p_input->'confirmed' is distinct from 'true' or review.state is distinct from 'assigned'
        then raise exception 'assignment unavailable' using errcode='55000'; end if;
      update private.c42_cases set state=next_state,authority=null,assigned_until=null where opportunity=item.id and revision=expected;
      result:=jsonb_build_object('status',review.next_state,'version',expected);

    elsif p_action in ('decide','recuse') then
      select * into grant_row from private.c42_reviewers where id=review.authority for share;
      if not coalesce(review.state='assigned' and review.assigned_until>statement_timestamp() and grant_row.reviewer=p_actor
        and private.c42_scope(grant_row,source),false)
        then raise exception 'review assignment unavailable' using errcode='42501'; end if;
      if p_action='recuse' then
        update private.c42_cases set state=next_state,authority=null,assigned_until=null where opportunity=item.id and revision=expected;
        result:=jsonb_build_object('status',review.next_state,'version',expected);
      else
        if not private.c42_independent(p_actor,item,review) or p_input->'confirmed' is distinct from 'true'
          then raise exception 'independent review required' using errcode='42501'; end if;
        next_status:=p_input->>'decision';
        if not coalesce(next_status in ('approved','changes_requested','rejected'),false) then raise exception 'invalid decision' using errcode='23514'; end if;
        if next_status='approved' then
          if not coalesce(p_input->'checks' @> '["organization","accuracy","location","financial","application","fraud","safeguarding","destination"]'
            and jsonb_array_length(p_input->'checks')=8,false)
            or not private.project_organization_verified(scope_org)
            or (method='external' and not exists(select from private.c42_receipts e where e.opportunity=item.id
              and e.revision=expected and e.action='submit' and e.explanation is not null))
            then raise exception 'approval evidence incomplete' using errcode='42501'; end if;
        end if;
        update private.c42_cases set state=next_status,decision_by=p_actor,decision_at=statement_timestamp(),explanation=reason
          where opportunity=item.id and revision=expected;
        update private.c41_opportunities set status=next_status where id=item.id;
        result:=jsonb_build_object('status',next_status,'version',expected,
          'checks',case when next_status='approved' then p_input->'checks' end);
      end if;

    elsif p_action='challenge' then
      if not private.c42_representative(p_actor,scope_org,'opportunities.submit') or p_input->'confirmed' is distinct from 'true'
        or not coalesce(review.state in ('changes_requested','rejected') and not review.challenged
          and statement_timestamp()<review.decision_at+interval '14 days',false)
        then raise exception 'challenge unavailable' using errcode='42501'; end if;
      update private.c42_cases set challenged=true,next_state='challenge',state='challenge',authority=null,assigned_until=null
        where opportunity=item.id and revision=expected;
      update private.c41_opportunities set status='submitted' where id=item.id;
      result:=jsonb_build_object('status','challenge','version',expected);

    elsif p_action='publish' then
      select * into grant_row from private.c42_reviewers where id=review.authority for share;
      if not private.c42_representative(p_actor,scope_org,'opportunities.publish') or item.status<>'approved'
        or grant_row.id is null or not private.c42_scope(grant_row,source)
        or p_input->'confirmed' is distinct from 'true' or review.state is distinct from 'approved'
        or review.decision_by is null or not private.c42_independent(review.decision_by,item,
          jsonb_populate_record(review,jsonb_build_object('decision_by',null)))
        or not private.member_identity_verified(review.decision_by) or not private.institution_actor(review.decision_by)
        or not private.organization_setup_identity_eligible(item.representative)
        or private.institution_role(item.representative,scope_org) is null
        or (source->>'closesOn')::date<(statement_timestamp() at time zone 'America/Port-au-Prince')::date
        or not config->'types' ? (source->>'type') or (method<>'undecided' and not config->'methods' ? method)
        or (method='event_registration' and private.c42_event(source,scope_org) is null)
        or published.opportunity is not null then raise exception 'publication unavailable' using errcode='42501'; end if;
      insert into private.c42_publications(opportunity,revision,organization,responsible,published_by)
        values(item.id,expected,scope_org,item.representative,p_actor);
      update private.c41_opportunities set status='published' where id=item.id;
      result:=jsonb_build_object('status','published','version',expected);

    elsif p_action in ('close','withdraw','expire','archive','restrict') then
      if p_input->'confirmed' is distinct from 'true' then raise exception 'confirmation required' using errcode='23514'; end if;
      if p_action='restrict' then
        select * into grant_row from private.c42_reviewers where id=(p_input->>'grant')::uuid for share;
        if not coalesce(grant_row.reviewer=p_actor and private.c42_scope(grant_row,source)
          and private.c42_independent(p_actor,item,review) and item.status='published'
          and not exists(select from private.c42_receipts prior where prior.opportunity=item.id and prior.revision=expected
            and prior.action='decide' and prior.actor=p_actor)
          and exists(select from private.c42_receipts e where e.opportunity=item.id and e.revision=expected and e.action='report'),false)
          then raise exception 'independent restriction requires scoped grant and active report' using errcode='42501'; end if;
      elsif not private.c42_representative(p_actor,scope_org,case when p_action='withdraw' then 'opportunities.submit' else 'opportunities.publish' end)
        then raise exception 'lifecycle authority required' using errcode='42501'; end if;
      next_status:=case
        when p_action='close' and item.status='published' then 'closed'
        when p_action='withdraw' and item.status in ('submitted','approved','published','changes_requested','rejected') then 'withdrawn'
        when p_action='expire' and item.status='published' and
          (source->>'closesOn')::date<(statement_timestamp() at time zone 'America/Port-au-Prince')::date then 'expired'
        when p_action='archive' and item.status in ('closed','withdrawn','rejected','restricted','expired') then 'archived'
        when p_action='restrict' then 'restricted' end;
      if next_status is null then raise exception 'invalid lifecycle transition' using errcode='55000'; end if;
      update private.c41_opportunities set status=next_status where id=item.id;
      if p_action='restrict' then update private.c42_cases set state='rejected',decision_by=p_actor,
        decision_at=statement_timestamp(),explanation=reason where opportunity=item.id and revision=expected; end if;
      if p_action='withdraw' then update private.c42_cases set state='withdrawn' where opportunity=item.id and revision=expected; end if;
      result:=jsonb_build_object('status',next_status,'version',expected);

    elsif p_action='report' then
      if not coalesce(item.status='published' and private.c42_publication_eligible(published,source)
        and not feed_data.blocked_pair(p_actor,item.representative)
        and p_input->>'category' in ('fraud','scholarship','impersonation','unlawful_recruitment','exploitation','harassment','unsafe_destination','privacy'),false)
        then raise exception 'report unavailable' using errcode='42501'; end if;
      result:=jsonb_build_object('reported',true,'category',p_input->>'category');

    elsif p_action in ('interest_preview','express') then
      identity_data:=private.c42_public_identity(p_actor);
      if not coalesce(item.status='published' and private.c42_publication_eligible(published,source) and application_open
        and method='expression_of_interest' and config->'methods' ? method
        and identity_data is not null and not feed_data.blocked_pair(p_actor,item.representative),false)
        then raise exception 'expression of interest unavailable' using errcode='42501'; end if;
      if p_action='interest_preview' then return jsonb_build_object('identity',identity_data,'revision',expected,'organization',scope_org); end if;
      if p_input->'consent' is distinct from 'true' or p_input->'adult' is distinct from 'true' or p_input->'identity' is distinct from identity_data
        or not private.c41_text(p_input->'statement',500) then raise exception 'exact consent required' using errcode='23514'; end if;
      insert into private.c42_interest(opportunity,revision,member,state,shared_identity,statement)
        values(item.id,expected,p_actor,'submitted',identity_data,p_input->>'statement') returning id into target;
      result:=jsonb_build_object('id',target,'state','submitted','version',1);

    elsif p_action in ('organization_interest','interest_state') then
      if not private.c42_representative(p_actor,scope_org,'opportunities.interest') or item.status<>'published'
        or not private.c42_publication_eligible(published,source) then raise exception 'recipient access denied' using errcode='42501'; end if;
      if p_action='organization_interest' then
        cursor_id:=(p_input->>'after')::uuid;
        return jsonb_build_object('enabled',true,'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
          select i.id,i.revision,i.version,i.state,i.shared_identity,i.statement,i.consent_at from private.c42_interest i
          where i.opportunity=item.id and i.revision=expected and i.state<>'withdrawn'
            and (cursor_id is null or i.id>cursor_id) and private.c42_interest_recipient(p_actor,i.member,item)
          order by i.id limit 20) q),'[]'));
      end if;
      target:=(p_input->>'interest')::uuid;
      select * into interest from private.c42_interest i where i.id=target and i.opportunity=item.id and i.revision=expected for update;
      operation:=p_input->>'state';
      if interest.id is null or not private.c42_interest_recipient(p_actor,interest.member,item)
        then raise exception 'recipient access denied' using errcode='42501'; end if;
      if interest.version is distinct from (p_input->>'version')::integer
        or not coalesce((interest.state='submitted' and operation='acknowledged')
          or (interest.state='acknowledged' and operation='follow_up')
          or (interest.state in ('submitted','acknowledged','follow_up') and operation='closed'),false)
        then raise exception 'interest unavailable or changed' using errcode='55000'; end if;
      update private.c42_interest set state=operation,version=version+1 where id=target;
      result:=jsonb_build_object('id',target,'state',operation,'version',interest.version+1);
    end if;
  end if;
  if result is null then raise exception 'unsupported operation' using errcode='23514'; end if;
  insert into private.c42_receipts(actor,workspace,request_id,fingerprint,action,opportunity,revision,subject,explanation,result)
    values(p_actor,p_workspace,req,hash,p_action,p_opportunity,expected,target,reason,result);
  return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'invalid identifier or date' using errcode='23514';
end $$;

revoke all on function private.c42_field_contract(),private.c42_qualified_details(jsonb,text,boolean),
 private.c42_configuration(),private.c42_representative(uuid,uuid,text),private.c42_event(jsonb,uuid),
 private.c42_publication_eligible(private.c42_publications,jsonb),private.c42_methods(jsonb,uuid),
 private.c42_scope(private.c42_reviewers,jsonb),private.c42_independent(uuid,private.c41_opportunities,private.c42_cases),
 private.c42_public_identity(uuid),private.c42_interest_recipient(uuid,uuid,private.c41_opportunities),private.c42_invalidate(),
 public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb)
 from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c42_opportunities_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,text,jsonb) to service_role;


-- Existing in-app notification infrastructure receives an opaque status-update receipt only.
alter table feed_data.notifications add column opportunity_interest_receipt bigint references private.c42_receipts(id),
  add constraint c42_notice_shape check((kind='opportunity_interest')=(opportunity_interest_receipt is not null)
    and (opportunity_interest_receipt is null or (actor_id is null and post_id is null and comment_id is null))),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice','community_need_notice','need_project_notice','volunteer_recruitment','opportunity_interest'));

create function private.c42_notice_visible(receipt_id bigint, recipient uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c42_fixture) and feed_data.author_active(recipient) and exists (
    select from private.c42_receipts e join private.c42_interest i on i.id=e.subject
    where e.id=receipt_id and e.action='interest_state' and i.member=recipient and i.state<>'withdrawn'
      and not feed_data.blocked_pair(recipient,e.actor)
      and not exists(select from feed_data.member_mutes m where m.actor_id=recipient and m.target_id=e.actor))
$$;

create function private.c42_notify_interest() returns trigger language plpgsql security definer set search_path='' as $$
declare receiver uuid;
begin
  if new.action<>'interest_state' then return new; end if;
  select i.member into receiver from private.c42_interest i where i.id=new.subject;
  if receiver is not null and private.c42_notice_visible(new.id,receiver) then
    insert into feed_data.notifications(recipient_id,kind,opportunity_interest_receipt,dedupe)
      values(receiver,'opportunity_interest',new.id,'opportunity-interest:'||new.id::text)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end $$;
create trigger c42_interest_status_notice after insert on private.c42_receipts
  for each row execute function private.c42_notify_interest();

do $notices$
declare definition text; marker text:='    when n.kind=''volunteer_recruitment'' then';
begin
  select pg_get_functiondef('feed_data.notification_visible(feed_data.notifications)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'notification visibility source mismatch'; end if;
  execute replace(definition,marker,
    '    when n.kind=''opportunity_interest'' then private.c42_notice_visible(n.opportunity_interest_receipt,n.recipient_id)'||chr(10)||marker);
end $notices$;
revoke all on function private.c42_notice_visible(bigint,uuid),private.c42_notify_interest()
 from public,anon,authenticated,authenticator,service_role;
