-- Closed disposable operations gate. Live reporting requires a future reviewed deployment.
create table private.c24_fixture (enabled boolean primary key check(enabled));

create table private.c24_settings (
  singleton boolean primary key default true check(singleton),
  version integer not null check(version>0),
  enabled boolean not null,
  sectors text[] not null,
  departments text[] not null,
  years integer[] not null,
  measurements boolean not null,
  needs boolean not null,
  links boolean not null
);

create table private.c24_governors (
  actor uuid primary key references auth.users(id) on delete cascade,
  version integer not null check(version>0),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table private.c24_definitions (
  code text not null,
  version integer not null check(version>0),
  sector text not null,
  unit text not null,
  classification text not null check(classification in ('output','outcome')),
  names jsonb not null,
  descriptions jsonb not null,
  methods jsonb not null,
  units jsonb not null,
  methodology_code text not null,
  aggregatable boolean not null,
  privacy text not null check(privacy in ('public_nonsensitive','restricted')),
  period text not null default 'calendar_year' check(period='calendar_year'),
  deduplication text not null default 'independent_delivery_reference' check(deduplication='independent_delivery_reference'),
  state text not null check(state in ('draft','active','retired')),
  proposer uuid references auth.users(id) on delete set null,
  reviewer uuid references auth.users(id) on delete set null,
  primary key(code,version),
  check(not aggregatable or privacy='public_nonsensitive' and classification='output')
);
create unique index c24_active_definition on private.c24_definitions(code) where state='active';

create table private.c24_mappings (
  publication uuid primary key references private.c23_publications(id) on delete cascade,
  version integer not null,
  project uuid not null references private.community_projects(id) on delete cascade,
  department text not null references public.departments(code),
  report_year integer not null,
  source_id uuid not null,
  source_revision integer not null,
  finding uuid not null,
  disclosure_revision integer not null,
  disclosure_hash bytea not null,
  code text not null,
  definition_version integer not null,
  delivery_hash bytea not null,
  proposer uuid references auth.users(id) on delete set null,
  reviewer uuid references auth.users(id) on delete set null,
  state text not null check(state in ('submitted','approved','rejected','withdrawn')),
  foreign key(code,definition_version) references private.c24_definitions(code,version)
);
create index c24_mapping_scope on private.c24_mappings(department,state,publication);
create index c24_mapping_delivery on private.c24_mappings(code,delivery_hash) where state='approved';

create table private.c24_need_consents (
  link uuid primary key references private.c14_links(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  link_revision integer not null,
  consented boolean not null,
  version integer not null
);

create table private.c24_releases (
  report_year integer not null,
  sector text not null,
  version integer not null,
  state text not null check(state in ('proposed','sealed','suppressed','rejected')),
  basis bytea not null,
  projection jsonb not null,
  projects uuid[] not null,
  proposer uuid references auth.users(id) on delete set null,
  reviewer uuid references auth.users(id) on delete set null,
  primary key(report_year,sector)
);
create index c24_release_projects on private.c24_releases using gin(projects) where state in ('sealed','suppressed');

create table private.c24_events (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid,
  command_hash bytea,
  action text not null,
  resource text not null,
  version integer,
  previous jsonb,
  current jsonb,
  reason text,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);
create index c24_event_scope on private.c24_events(resource,happened_at desc,id);

alter table private.c24_fixture enable row level security;
alter table private.c24_settings enable row level security;
alter table private.c24_governors enable row level security;
alter table private.c24_definitions enable row level security;
alter table private.c24_mappings enable row level security;
alter table private.c24_need_consents enable row level security;
alter table private.c24_releases enable row level security;
alter table private.c24_events enable row level security;
revoke all on private.c24_fixture,private.c24_settings,private.c24_governors,private.c24_definitions,private.c24_mappings,
 private.c24_need_consents,private.c24_releases,private.c24_events from public,anon,authenticated,service_role;

create function private.c24_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c23_enabled() and exists(select from private.c24_fixture where enabled)
$$;

create function private.c24_sectors() returns text[] language sql immutable set search_path='' as $$
  select array['education','healthcare','agriculture','environment','infrastructure','economic_development','community_development']
$$;

create function private.c24_sector(p_category text) returns text language sql immutable set search_path='' as $$
  select case when p_category in ('education','healthcare','agriculture','environment','infrastructure') then p_category
    when p_category in ('entrepreneurship','employment','technology') then 'economic_development'
    when p_category in ('peace','culture') then 'community_development' end
$$;

create function private.c24_localized(p jsonb) returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p)='object'
    and (select count(*)=4 and bool_and(k in ('en','ht','fr','es')
      and jsonb_typeof(v)='string' and private.c23_safe_text(v #>> '{}',1,500))
      from jsonb_each(p) as a(k,v)),false)
$$;

create function private.c24_catalog_row(d private.c24_definitions) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('code',d.code,'version',d.version,'sector',d.sector,'unit',d.unit,'classification',d.classification,
    'names',d.names,'descriptions',d.descriptions,'methods',d.methods,'units',d.units,
    'methodologyCode',d.methodology_code,'aggregatable',d.aggregatable,'privacy',d.privacy,
    'period',d.period,'deduplication',d.deduplication,'status',d.state)
$$;

-- Conservative designs enter as drafts. No metrics are approved by installation.
insert into private.c24_definitions(code,version,sector,unit,classification,names,descriptions,methods,units,
 methodology_code,aggregatable,privacy,state) values
 ('school_desks',1,'education','desks','output',
  '{"en":"School desks delivered","ht":"Biwo lekòl ki te livre","fr":"Pupitres scolaires livrés","es":"Pupitres escolares entregados"}',
  '{"en":"New desks accepted by a school.","ht":"Nouvo biwo lekòl la resevwa.","fr":"Pupitres neufs acceptés par une école.","es":"Pupitres nuevos aceptados por una escuela."}',
  '{"en":"Count accepted desks once against a signed delivery inventory in the reporting year.","ht":"Konte chak biwo yo resevwa yon sèl fwa avèk envantè livrezon siyen nan ane a.","fr":"Compter chaque pupitre accepté une fois selon le bordereau signé dans l’année.","es":"Contar cada pupitre aceptado una vez según el inventario firmado del año."}',
  '{"en":"desks","ht":"biwo","fr":"pupitres","es":"pupitres"}','SIGNED_DESK_HANDOVER_V1',true,'public_nonsensitive','draft'),
 ('tree_planting',1,'environment','trees','output',
  '{"en":"Trees planted","ht":"Pyebwa plante","fr":"Arbres plantés","es":"Árboles plantados"}',
  '{"en":"New trees planted during a recorded delivery.","ht":"Nouvo pyebwa plante pandan yon aktivite anrejistre.","fr":"Arbres nouvellement plantés pendant une activité enregistrée.","es":"Árboles nuevos plantados durante una actividad registrada."}',
  '{"en":"Count newly planted trees once from the accepted planting log for the reporting year.","ht":"Konte nouvo pyebwa plante yon sèl fwa nan rejis plantasyon ane a.","fr":"Compter une fois les arbres nouvellement plantés selon le registre accepté de l’année.","es":"Contar una vez los árboles nuevos según el registro de plantación aceptado del año."}',
  '{"en":"trees","ht":"pyebwa","fr":"arbres","es":"árboles"}','ACCEPTED_PLANTING_LOG_V1',true,'public_nonsensitive','draft');

-- Fixed cohort: completed, publicly listed Haitian projects with a recorded native completion date.
create function private.c24_projects(p_year int,p_sector text,p_departments text[] default null)
returns table(id uuid,department text,revision int,owner text,title text) language sql stable set search_path='' as $$
  select p.id,g.department,p.revision,
    coalesce('person:'||p.owner_user_id,'institution:'||p.organization_id,'community:'||p.community_id),
    v.proposal->>'title'
  from private.project_execution e
  join private.community_projects p on p.id=e.project_id and p.revision=e.approved_revision
  join private.project_revisions v on v.project_id=p.id and v.revision=p.revision
  cross join lateral (select private.c22_department(p) as department) g
  where e.status in ('completed','archived') and p.directory_published_at is not null and p.restricted_at is null
    and v.proposal->>'country'='HT' and private.c24_sector(v.proposal->>'category')=p_sector
    and private.project_completion_on(p.id)>=make_date(p_year,1,1)
    and private.project_completion_on(p.id)<make_date(p_year+1,1,1)
    and g.department is not null and (p_departments is null or g.department=any(p_departments))
    and private.project_progress_public(p)
  order by p.id limit 601
$$;

create function private.c24_disclosure(x private.c23_publications,p private.community_projects,r private.c21_outcome_requests,
 f private.c22_findings,d private.c23_disclosures) returns boolean language sql stable set search_path='' as $$
  select coalesce(x.state='approved' and x.approved_at is not null and p.revision=x.project_revision
    and d.publication_id=x.id and d.revision=x.revision and d.fingerprint=x.consent_hash and d.finding_id=x.finding_id
    and exists(select from private.c22_cases c where c.id=x.case_id and c.department=x.department
      and private.c23_finding_current(p,r,c,f)),false)
$$;

create function private.c24_compatible(d private.c24_definitions,r private.c21_outcome_requests,f private.c22_findings,p_year int)
returns boolean language sql stable set search_path='' as $$
  select coalesce(d.state='active' and d.aggregatable and d.privacy='public_nonsensitive' and d.classification=r.classification
    and r.source_kind='observation' and f.classification in ('supported','partially_supported')
    and jsonb_typeof(f.measurement->'quantity')='number' and (f.measurement->>'quantity')::numeric between 0 and 100000000
    and (f.measurement->>'quantity')::numeric=trunc((f.measurement->>'quantity')::numeric)
    and f.measurement->>'methodology'=d.methodology_code
    and f.measurement->>'unit'=d.unit and r.result->>'unit'=d.unit
    and f.measurement->>'startsOn'=make_date(p_year,1,1)::text and f.measurement->>'endsOn'=make_date(p_year,12,31)::text
    and r.result->>'startsOn'=f.measurement->>'startsOn' and r.result->>'endsOn'=f.measurement->>'endsOn',false)
$$;
create function private.c24_value(n numeric,a integer,enabled boolean)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('state',case when not enabled or n is null then 'unavailable'
    when a>=5 then 'available' else 'suppressed' end,
    'value',case when enabled and a>=5 then n end)
$$;

-- The snapshot carries no source pointers in the public cells. The private basis binds current inputs.
create function private.c24_snapshot(p_year int,p_sector text,s private.c24_settings)
returns jsonb language sql stable set search_path='' as $$
  with projects as materialized (
    select * from private.c24_projects(p_year,p_sector,s.departments)
  ), bounded_publications as materialized (
    select x.* from projects eligible join private.c23_publications x on x.project_id=eligible.id
      and x.department=eligible.department and x.state='approved'
    order by x.id limit 2401
  ), candidates as materialized (
    select x.id,x.revision,x.project_id,x.department,r.id case_id,f.id finding_id,f.classification,f.measurement,
      x.consent_hash,r.source_id,x.version
    from bounded_publications x
    join private.community_projects p on p.id=x.project_id
    join private.c21_outcome_requests r on r.id=x.case_id
    join private.c22_findings f on f.id=x.finding_id
    join private.c23_disclosures d on d.publication_id=x.id and d.revision=x.revision
    where private.c24_disclosure(x,p,r,f,d)
  ), outcomes as (
    select project_id,bool_or(classification in ('supported','partially_supported')) supported
    from candidates group by project_id
  ), compatible as materialized (
    select m.*,eligible.owner,(f.measurement->>'quantity')::numeric quantity
    from candidates x join projects eligible on eligible.id=x.project_id
    join private.c24_mappings m on m.publication=x.id and m.state='approved'
    join private.c24_definitions d on d.code=m.code and d.version=m.definition_version
    join private.c21_outcome_requests r on r.id=x.case_id
    join private.c22_findings f on f.id=x.finding_id
    where s.measurements and m.report_year=p_year and d.sector=p_sector and m.department=x.department
      and m.project=x.project_id and m.finding=x.finding_id and m.disclosure_revision=x.revision and m.disclosure_hash=x.consent_hash
      and m.source_id=r.source_id and m.source_revision=r.source_revision and private.c24_compatible(d,r,f,p_year)
      and not exists(select from private.c24_mappings other where other.state='approved' and other.code=m.code
        and other.delivery_hash=m.delivery_hash and other.publication<>m.publication)
  ), counts as (
    select a.*,count(*) over (partition by code,project,report_year) per_project,
      count(*) over (partition by source_id) per_source
    from compatible a
  ), measurements as materialized (
    select * from counts where per_project=1 and per_source=1
  ), needs as materialized (
    select distinct l.publication_id,p.department,l.author,p.owner
    from projects p join private.c14_links l on l.project_id=p.id and l.state='approved'
    join private.c24_need_consents consent on consent.link=l.id and consent.consented
      and consent.author=l.author and consent.link_revision=l.revision
    join private.community_projects native on native.id=p.id
    join private.c13_publications shared on shared.id=l.publication_id
    join private.c11_needs n on n.id=shared.need_id
    join feed_data.communities community on community.id=n.community_id and community.department_code=p.department
    where s.needs and private.c14_enabled() and private.c14_current(l,native,shared,n)
    order by l.publication_id limit 1201
  ), groups as (
    select p.department,count(*) completed,count(distinct p.owner)::int owners,
      count(*) filter(where o.project_id is not null) reviewed,count(*) filter(where o.supported) supported,
      count(distinct p.owner) filter(where o.project_id is null) unreviewed_owners,
      count(distinct p.owner) filter(where o.project_id is not null and not o.supported) adverse_owners,
      count(distinct p.owner) filter(where o.supported) supported_owners
    from projects p left join outcomes o on o.project_id=p.id group by p.department
  ), need_counts as (
    select department,count(distinct publication_id) n,least(count(distinct author),count(distinct owner))::int owners
    from needs group by department
  ), departments as (
    select dept.code,coalesce(g.completed,0) completed,coalesce(g.reviewed,0) reviewed,coalesce(g.supported,0) supported,
      coalesce(g.owners,0) owners,
      coalesce(g.owners>=5 and (g.unreviewed_owners=0 or g.unreviewed_owners>=5)
        and (g.adverse_owners=0 or g.adverse_owners>=5) and (g.supported_owners=0 or g.supported_owners>=5),false) split,
      nc.n needs,nc.owners need_owners
    from public.departments dept left join groups g on g.department=dept.code left join need_counts nc on nc.department=dept.code
    where dept.code=any(s.departments)
  ), definitions as materialized (
    select a.* from private.c24_definitions a where s.measurements and a.sector=p_sector
      and a.state='active' and a.aggregatable order by a.code limit 31
  ), department_measures as (
    select code,department,sum(quantity) quantity,count(distinct owner)::int owners
    from measurements group by code,department
  ), national_measures as (
    select code,sum(quantity) quantity,case when bool_and(owners>=5) and count(*)=cardinality(s.departments) then 5 else 0 end owners
    from department_measures group by code
  ), disclosure_policy as (
    select bool_and(completed=0 or owners>=5) safe_completed,bool_and(completed=0 or split) safe_split,
      bool_and(coalesce(need_owners>=5,false)) safe_needs,count(*) filter(where completed>0) participating,
      sum(completed) completed,sum(reviewed) reviewed,sum(supported) supported,sum(needs) needs
    from departments
  ), cells as (
    select dept.code scope,jsonb_build_object('completed',private.c24_value(nullif(dept.completed,0),dept.owners,true),
      'reviewed',private.c24_value(case when dept.completed>0 then dept.reviewed end,case when dept.split then 5 else 0 end,true),
      'supported',private.c24_value(case when dept.completed>0 then dept.supported end,case when dept.split then 5 else 0 end,true),
      'participating',private.c24_value(null,0,false),'linkedNeeds',private.c24_value(coalesce(dept.needs,0),coalesce(dept.need_owners,0),s.needs),
      'measurements',coalesce((select jsonb_agg(jsonb_build_object('definition',private.c24_catalog_row(d),
        'result',private.c24_value(coalesce(dm.quantity,0),coalesce(dm.owners,0),true)) order by d.code)
        from definitions d left join department_measures dm on dm.code=d.code and dm.department=dept.code),'[]'),
      'projects',case when s.links and dept.owners>=5 then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title) order by v.id)
        from (select id,title from projects where department=dept.code order by id limit 12) v),'[]') else '[]'::jsonb end) cell
    from departments dept
    union all
    select 'national',jsonb_build_object(
      'completed',private.c24_value(nullif(a.completed,0),case when a.safe_completed then 5 else 0 end,true),
      'reviewed',private.c24_value(case when a.completed>0 then a.reviewed end,case when a.safe_split then 5 else 0 end,true),
      'supported',private.c24_value(case when a.completed>0 then a.supported end,case when a.safe_split then 5 else 0 end,true),
      'participating',private.c24_value(nullif(a.participating,0),case when a.safe_completed then 5 else 0 end,true),
      'linkedNeeds',private.c24_value(coalesce(a.needs,0),case when a.safe_needs then 5 else 0 end,s.needs),
      'measurements',coalesce((select jsonb_agg(jsonb_build_object('definition',private.c24_catalog_row(d),
        'result',private.c24_value(coalesce(nm.quantity,0),coalesce(nm.owners,0),true)) order by d.code)
        from definitions d left join national_measures nm on nm.code=d.code),'[]'),
      'projects',case when s.links and a.safe_completed then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title) order by v.id)
        from (select id,title from projects order by id limit 12) v),'[]') else '[]'::jsonb end)
    from disclosure_policy a
  )
  select case when (select count(*) from projects)>600 or (select count(*) from bounded_publications)>2400
     or (select count(*) from needs)>1200 or (select count(*) from definitions)>30
    then null else jsonb_build_object(
      'projects',coalesce((select jsonb_agg(p.id order by p.id) from projects p),'[]'),
      'basis',encode(extensions.digest(jsonb_build_array(s.version,
        (select jsonb_agg(to_jsonb(p) order by p.id) from projects p),
        (select jsonb_agg(to_jsonb(v) order by v.id) from candidates v),
        (select jsonb_agg(to_jsonb(m) order by m.publication) from measurements m),
        (select jsonb_agg(to_jsonb(n) order by n.publication_id,n.department,n.author,n.owner) from needs n),
        (select jsonb_agg(to_jsonb(v) order by v.code) from definitions v))::text,'sha256'),'hex'),
      'cells',(select jsonb_object_agg(scope,cell) from cells)) end
$$;

create function public.c24_impact_for_api(p_year int,p_sector text,p_department text)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='4s' as $$
declare settings private.c24_settings; report private.c24_releases; snapshot jsonb; filters jsonb;
begin
  if not private.c24_enabled() then return '{"state":"disabled"}'::jsonb; end if;
  select * into settings from private.c24_settings;
  if not coalesce(settings.enabled,false) then return '{"state":"disabled","operations":true}'::jsonb; end if;
  filters:=jsonb_build_object('years',settings.years,'sectors',settings.sectors,'departments',settings.departments);
  if not coalesce(p_year=any(settings.years) and p_sector=any(settings.sectors)
    and (p_department='national' or p_department=any(settings.departments)),false)
  then return jsonb_build_object('state','unavailable','filters',filters); end if;
  select * into report from private.c24_releases a where a.report_year=p_year and a.sector=p_sector;
  if report.state='suppressed' then return jsonb_build_object('state','suppressed','filters',filters); end if;
  if report.state is distinct from 'sealed' then return jsonb_build_object('state','unavailable','filters',filters); end if;
  snapshot:=private.c24_snapshot(p_year,p_sector,settings);
  if snapshot->>'basis' is distinct from encode(report.basis,'hex') then
    return jsonb_build_object('state','suppressed','filters',filters);
  end if;
  return jsonb_build_object('state','available','filters',filters,'report',report.projection->p_department);
end
$$;
create function private.c24_governor(who uuid) returns boolean language sql stable set search_path='' as $$
  select private.c22_identity(who) and exists(select from private.c24_governors
    where actor=who and revoked_at is null and expires_at>clock_timestamp())
$$;

create function private.c24_review_workspace(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp) and private.c22_identity(p_actor)
    and exists(select from private.c23_workspaces w where w.id=p_workspace and w.actor=p_actor
      and w.session_id=p_session and w.lane='review' and w.expires_at>clock_timestamp()),false)
$$;

create function private.c24_mapping_reviewer(p_actor uuid,p private.community_projects,r private.c21_outcome_requests,x private.c23_publications)
returns boolean language sql stable set search_path='' as $$
  select private.c23_grant(p_actor,x.department) is not null and private.c23_independent(p,r,x,p_actor)
    and not exists(select from private.c23_events where publication_id=x.id and actor=p_actor and action in ('inspect','approve','reject','changes'))
$$;

-- A released slice is never resealed or adjusted after withdrawal. Logs retain the old scope privately.
create function private.c24_freeze() returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb; row_value jsonb; p uuid; owner_ref uuid; organization_ref uuid;
  community_ref uuid; sector_scope text;
begin
  if not exists(select from private.c24_releases where state='sealed') then return null; end if;
  if tg_op<>'INSERT' then old_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then new_row:=to_jsonb(new); end if;
  if old_row is not distinct from new_row then return null; end if;
  row_value:=coalesce(new_row,old_row);
  case tg_table_name
    when 'c24_settings' then null;
    when 'c24_definitions' then
      if old_row->>'state' is distinct from 'active' and new_row->>'state' is distinct from 'active' then return null; end if;
      sector_scope:=row_value->>'sector';
    when 'c24_mappings' then
      if old_row->>'state' is distinct from 'approved' and new_row->>'state' is distinct from 'approved' then return null; end if;
      select d.sector into sector_scope from private.c24_definitions d where d.code=row_value->>'code'
        and d.version=(row_value->>'definition_version')::int;
    when 'c24_need_consents' then select l.project_id into p from private.c14_links l where l.id=(row_value->>'link')::uuid;
    when 'community_projects' then p:=(row_value->>'id')::uuid;
    when 'c23_publications' then
      if old_row->>'state' is distinct from 'approved' and new_row->>'state' is distinct from 'approved' then return null; end if;
      p:=(row_value->>'project_id')::uuid;
    when 'profiles' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'profile_privacy' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'user_settings' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'verification_records' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'account_restrictions' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'm22_account_sanctions' then owner_ref:=(row_value->>'subject_id')::uuid;
    when 'users' then owner_ref:=(row_value->>'id')::uuid;
    when 'organizations' then organization_ref:=(row_value->>'id')::uuid;
    when 'organization_memberships','organization_custom_assignments','organization_custom_roles','organization_affiliations','verification_applications' then
      organization_ref:=(row_value->>'organization_id')::uuid;
    when 'communities' then community_ref:=(row_value->>'id')::uuid;
    when 'community_memberships','community_staff' then community_ref:=(row_value->>'community_id')::uuid;
    else p:=(row_value->>'project_id')::uuid;
  end case;
  with removed as (
    update private.c24_releases a set state='suppressed',version=a.version+1
    where a.state='sealed' and (tg_table_name='c24_settings'
      or sector_scope=a.sector or (p is not null and a.projects @> array[p])
      or ((owner_ref is not null or organization_ref is not null or community_ref is not null) and exists(
        select from private.community_projects pr where pr.id=any(a.projects) and (
          pr.organization_id=organization_ref or community_ref in(pr.community_id,pr.association_id)
          or owner_ref in(pr.owner_user_id,pr.submitted_by) or exists(select from private.organization_memberships om
            where om.organization_id=pr.organization_id and om.user_id=owner_ref)))))
    returning a.*
  )
  insert into private.c24_events(action,resource,version,reason)
    select 'suppress',report_year||'/'||sector,version,'An input to the sealed reporting cohort changed.' from removed;
  return null;
end
$$;

create trigger c24_setting_basis after update or delete on private.c24_settings for each row execute function private.c24_freeze();
create trigger c24_definition_basis after insert or update or delete on private.c24_definitions for each row execute function private.c24_freeze();
create trigger c24_mapping_basis after insert or update or delete on private.c24_mappings for each row execute function private.c24_freeze();
create trigger c24_consent_basis after insert or update or delete on private.c24_need_consents for each row execute function private.c24_freeze();
create trigger c24_project_basis after update of status,restricted_at,directory_published_at,revision,owner_user_id,organization_id,community_id,association_id,submitted_by
 on private.community_projects for each row execute function private.c24_freeze();
create trigger c24_progress_basis after update of status,approved_revision or delete on private.project_execution
 for each row execute function private.c24_freeze();
create trigger c24_publication_basis after update or delete on private.c23_publications for each row execute function private.c24_freeze();
create trigger c24_association_basis after update of revision,state or delete on private.c14_links for each row execute function private.c24_freeze();
create trigger c24_profile_basis after update of is_visible or delete on public.profiles for each row execute function private.c24_freeze();
create trigger c24_discovery_basis after insert or update of discoverable or delete on public.user_settings for each row execute function private.c24_freeze();
create trigger c24_privacy_basis after insert or update of mode or delete on feed_data.profile_privacy for each row execute function private.c24_freeze();
create trigger c24_identity_basis after update of status or delete on public.verification_records for each row execute function private.c24_freeze();
create trigger c24_status_basis after insert or update of status or delete on private.account_restrictions for each row execute function private.c24_freeze();
create trigger c24_sanction_basis after insert or update or delete on private.m22_account_sanctions for each row execute function private.c24_freeze();
create trigger c24_auth_basis after update of banned_until,deleted_at on auth.users for each row execute function private.c24_freeze();

create trigger c24_organization_basis after update of status,verification_status on private.organizations
 for each row execute function private.c24_freeze();
create trigger c24_org_member_basis after insert or update or delete on private.organization_memberships
 for each row execute function private.c24_freeze();
create trigger c24_org_role_basis after insert or update or delete on private.organization_custom_roles
 for each row execute function private.c24_freeze();
create trigger c24_org_assignment_basis after insert or update or delete on private.organization_custom_assignments
 for each row execute function private.c24_freeze();
create trigger c24_org_affiliation_basis after insert or update or delete on private.organization_affiliations
 for each row execute function private.c24_freeze();
create trigger c24_org_verification_basis after update of status or delete on private.verification_applications
 for each row execute function private.c24_freeze();
create trigger c24_community_basis after update of policy,public_since,owner_id,department_code on feed_data.communities
 for each row execute function private.c24_freeze();
create trigger c24_community_member_basis after insert or update or delete on feed_data.community_memberships
 for each row execute function private.c24_freeze();
create trigger c24_community_staff_basis after insert or update or delete on feed_data.community_staff
 for each row execute function private.c24_freeze();

create function public.c24_manage_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='4s' as $$
declare s private.c24_settings; def private.c24_definitions; m private.c24_mappings; a private.c24_releases;
  g private.c24_governors; n private.c24_need_consents; l private.c14_links;
  x private.c23_publications; p private.community_projects; r private.c21_outcome_requests; f private.c22_findings; d private.c23_disclosures;
  receipt private.c24_events; previous jsonb; updated jsonb; snapshot jsonb; text_reason text; resource text;
  scope text; metric text; selected_year int; expected int; next_version int; request_key uuid; fingerprint bytea; ref uuid; target uuid;
  chosen_years int[]; chosen_departments text[]; chosen_sectors text[]; expires timestamptz; moment timestamptz:=clock_timestamp();
begin
  if not private.c24_enabled() then raise exception 'impact reporting disabled' using errcode='C2401'; end if;
  if p_lane is null or p_lane not in ('founder','review','member') or p_action is null
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'invalid impact scope' using errcode='23514'; end if;
  if p_action not in ('overview','mapping_queue','mapping_read','need_read') then
    -- Serialize against the underlying review mutations before binding a receipt.
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform pg_advisory_xact_lock(20261125,220);
    perform private.s2b_lock_actor(p_actor,p_session);
    moment:=clock_timestamp();
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false)
  then raise exception 'sign in required' using errcode='42501'; end if;
  if p_lane='founder' and not coalesce(private.platform_founder(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
  then raise exception 'Founder workspace required' using errcode='42501'; end if;
  if p_lane='review' and not private.c24_review_workspace(p_actor,p_session,p_aal2,p_totp,p_workspace)
  then raise exception 'review workspace required' using errcode='42501'; end if;

  select * into s from private.c24_settings;
  scope:=p_input->>'scope'; metric:=p_input->>'code'; ref:=(p_input->>'id')::uuid;
  selected_year:=(p_input->>'year')::int; expected:=(p_input->>'expectedVersion')::int;
  if p_action='overview' and p_lane in ('founder','review') then
    return jsonb_build_object('settings',case when p_lane='founder' then to_jsonb(s)-'singleton' end,
      'globalReviewer',p_lane='review' and private.c24_governor(p_actor),
      'catalog',case when p_lane='founder' or private.c24_governor(p_actor) then coalesce((
        select jsonb_agg(private.c24_catalog_row(q) order by q.code,q.version desc)
        from (select * from private.c24_definitions order by code,version desc limit 150) q),'[]') else '[]'::jsonb end,
      'releases',case when p_lane='founder' or private.c24_governor(p_actor) then coalesce((select jsonb_agg(jsonb_build_object(
        'year',b.report_year,'sector',b.sector,'version',b.version,'state',b.state,'fingerprint',encode(b.basis,'hex'),
        'preview',case when b.state='proposed' then b.projection end) order by b.report_year desc,b.sector)
        from (select * from private.c24_releases order by report_year desc,sector limit 70) b),'[]') else '[]'::jsonb end,
      'grants',case when p_lane='founder' then coalesce((select jsonb_agg(jsonb_build_object(
        'id',b.actor,'label',coalesce(h.display_name,h.username),'version',b.version,'expiresAt',b.expires_at,'revoked',b.revoked_at is not null))
        from (select * from private.c24_governors order by actor limit 100) b join public.profiles h on h.user_id=b.actor),'[]') else '[]'::jsonb end,
      'candidates',case when p_lane='founder' and char_length(p_input->>'search') between 2 and 60 then coalesce((
        select jsonb_agg(jsonb_build_object('id',j.user_id,'label',coalesce(j.display_name,j.username)))
        from (select h.* from public.profiles h where h.user_id<>p_actor and private.c22_identity(h.user_id)
          and exists(select from private.c23_grants z where z.actor=h.user_id and private.c23_grant(h.user_id,z.department) is not null)
          and (strpos(lower(coalesce(h.username,'')),lower(p_input->>'search'))>0
            or strpos(lower(coalesce(h.display_name,'')),lower(p_input->>'search'))>0) order by h.username limit 15) j),'[]') else '[]'::jsonb end,
      'history',case when p_lane='founder' then coalesce((select jsonb_agg(jsonb_build_object(
        'action',h.action,'at',h.happened_at,'reason',h.reason,'version',h.version) order by h.happened_at desc,h.id desc)
        from (select * from private.c24_events where action in ('configure','grant','revoke','define','approve_definition',
          'retire_definition','propose_report','seal_report','reject_report','suppress') order by happened_at desc,id desc limit 60) h),'[]')
        else '[]'::jsonb end);
  end if;
  if p_action='mapping_queue' and p_lane='review' then
    if private.c23_grant(p_actor,scope) is null then raise exception 'department grant required' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',q.publication,'version',q.version,
      'code',q.code,'year',q.report_year,'title',q.title,'state',q.state) order by q.publication)
      from (select b.*,v.proposal->>'title' title from private.c24_mappings b
        join private.c23_publications u on u.id=b.publication join private.community_projects pr on pr.id=b.project
        join private.c21_outcome_requests rr on rr.id=u.case_id
        join private.project_revisions v on v.project_id=pr.id and v.revision=pr.revision
        where b.department=scope and b.state='submitted' and u.state='approved'
          and (ref is null or b.publication>ref) and private.c24_mapping_reviewer(p_actor,pr,rr,u)
        order by b.publication limit 21) q),'[]');
  end if;
  if p_action in ('mapping_read','submit_mapping','approve_mapping','reject_mapping','withdraw_mapping') then
    select * into x from private.c23_publications where id=ref;
    if not found then raise exception 'publication unavailable' using errcode='O2003'; end if;
    select * into r from private.c21_outcome_requests where id=x.case_id;
    select * into p from private.community_projects where id=x.project_id;
    select * into f from private.c22_findings where id=x.finding_id;
    select * into d from private.c23_disclosures where publication_id=x.id and revision=x.revision;
    select * into m from private.c24_mappings where publication=x.id;
    if (p_lane='member' and (r.requester_id is distinct from p_actor or not coalesce(
        private.project_progress_manager(private.project_execution_role(p,p_actor)),false)))
       or (p_lane='review' and (m.publication is null or m.proposer=p_actor or not private.c24_mapping_reviewer(p_actor,p,r,x)))
       or p_lane not in ('member','review')
    then raise exception 'mapping unavailable' using errcode='O2003'; end if;
    if p_action<>'withdraw_mapping' and not private.c24_disclosure(x,p,r,f,d)
    then raise exception 'current disclosure required' using errcode='O2005'; end if;
    if f.measurement is not null then selected_year:=extract(year from (f.measurement->>'startsOn')::date)::int; end if;
    if p_action='mapping_read' then
      return jsonb_build_object('id',x.id,'version',coalesce(m.version,0),'state',m.state,'year',selected_year,'code',m.code,
        'disclosure',d.snapshot,'method',f.measurement->>'methodology',
        'reviewReference',case when p_lane='review' then (
          select latest.current->>'deliveryReference' from private.c24_events latest
          where latest.resource=x.id::text and latest.action='submit_mapping'
          order by latest.version desc limit 1) end,
        'catalog',coalesce((select jsonb_agg(private.c24_catalog_row(q) order by q.code)
          from (select b.* from private.c24_definitions b join private.project_revisions v on v.project_id=p.id and v.revision=p.revision
            where b.sector=private.c24_sector(v.proposal->>'category') and private.c24_compatible(b,r,f,selected_year) limit 30) q),'[]'));
    end if;
  elsif p_action in ('need_read','allow_need','withdraw_need') then
    if p_lane<>'member' then raise exception 'member scope required' using errcode='42501'; end if;
    select * into l from private.c14_links where id=ref and author=p_actor;
    if not found then raise exception 'association unavailable' using errcode='O2003'; end if;
    select * into n from private.c24_need_consents where link=l.id;
    if p_action='need_read' then
      return jsonb_build_object('version',coalesce(n.version,0),'consented',coalesce(n.consented and n.link_revision=l.revision,false));
    end if;
    if p_action='allow_need' and not (private.c14_enabled() and l.state='approved' and exists(
      select from private.c13_publications publication join private.c11_needs need on need.id=publication.need_id
      join private.community_projects project on project.id=l.project_id
      where publication.id=l.publication_id and private.c14_current(l,project,publication,need)))
    then raise exception 'current reviewed association required' using errcode='O2005'; end if;
  elsif p_lane='member' then raise exception 'member command unavailable' using errcode='42501';
  end if;

  request_key:=(p_input->>'requestId')::uuid;
  text_reason:=btrim(p_input->>'reason');
  if expected is null or expected not between 0 and 2147483646 or request_key is null
    or p_input->'confirmed' is distinct from 'true'::jsonb
    or not coalesce(private.project_operational_text(text_reason,10,500),false)
  then raise exception 'reason and confirmation required' using errcode='23514'; end if;
  fingerprint:=extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256');
  select * into receipt from private.c24_events where actor=p_actor and request_id=request_key;
  if found then
    if receipt.command_hash is distinct from fingerprint then raise exception 'request changed' using errcode='O2002'; end if;
    return jsonb_build_object('version',receipt.version);
  end if;
  perform private.project_progress_limit(p_actor);

  if p_action='configure' and p_lane='founder' then
    if coalesce(s.version,0)<>expected then raise exception 'settings changed' using errcode='O2004'; end if;
    chosen_years:=array(select cast(v as int) from jsonb_array_elements_text(p_input->'years') v order by v);
    chosen_sectors:=array(select v from jsonb_array_elements_text(p_input->'sectors') v order by v);
    chosen_departments:=array(select v from jsonb_array_elements_text(p_input->'departments') v order by v);
    if cardinality(chosen_years) not between 1 and 5 or cardinality(chosen_departments) not between 1 and 10
      or cardinality(chosen_sectors) not between 1 and 7 or not (chosen_sectors<@private.c24_sectors())
      or exists(select from unnest(chosen_years) y where y is null or y<2020 or y>=extract(year from current_date))
      or not chosen_departments<@array(select code from public.departments)
      or cardinality(chosen_years)<>(select count(distinct z) from unnest(chosen_years) z)
      or cardinality(chosen_departments)<>(select count(distinct z) from unnest(chosen_departments) z)
      or cardinality(chosen_sectors)<>(select count(distinct z) from unnest(chosen_sectors) z)
    then raise exception 'invalid reporting dimensions' using errcode='23514'; end if;
    previous:=to_jsonb(s);
    insert into private.c24_settings(version,enabled,sectors,departments,years,measurements,needs,links)
      values(expected+1,(p_input->>'enabled')::boolean,chosen_sectors,chosen_departments,chosen_years,
        (p_input->>'measurements')::boolean,(p_input->>'needs')::boolean,(p_input->>'links')::boolean)
    on conflict(singleton) do update set version=excluded.version,enabled=excluded.enabled,sectors=excluded.sectors,
      departments=excluded.departments,years=excluded.years,measurements=excluded.measurements,needs=excluded.needs,links=excluded.links
    returning * into s;
    next_version:=s.version; updated:=to_jsonb(s); resource:='settings';
  elsif p_action in ('grant','revoke') and p_lane='founder' then
    target:=(p_input->>'target')::uuid;
    select * into g from private.c24_governors where actor=target;
    if expected<>coalesce(g.version,0) or target is null or target=p_actor then raise exception 'appointment changed' using errcode='O2004'; end if;
    previous:=to_jsonb(g);
    if p_action='grant' then
      expires:=(p_input->>'expiresAt')::timestamptz;
      if not private.c22_identity(target) or not exists(select from private.c23_grants existing where existing.actor=target
        and private.c23_grant(target,existing.department) is not null)
        or expires is null or expires<=moment or expires>moment+interval '180 days'
      then raise exception 'verified reviewer required' using errcode='42501'; end if;
      insert into private.c24_governors(actor,version,expires_at) values(target,expected+1,expires)
        on conflict(actor) do update set version=excluded.version,expires_at=excluded.expires_at,revoked_at=null returning * into g;
    else
      if g.actor is null or g.revoked_at is not null then raise exception 'appointment changed' using errcode='O2004'; end if;
      update private.c24_governors set revoked_at=moment,version=expected+1 where actor=target returning * into g;
    end if;
    next_version:=g.version; updated:=to_jsonb(g); resource:=target::text;
  elsif p_action in ('define','approve_definition','retire_definition') then
    if metric is null or metric !~ '^[a-z][a-z0-9_]{2,39}$' then raise exception 'invalid measurement code' using errcode='23514'; end if;
    select * into def from private.c24_definitions where code=metric order by version desc limit 1;
    if expected<>coalesce(def.version,0) then raise exception 'definition changed' using errcode='O2004'; end if;
    previous:=to_jsonb(def);
    if p_action='define' and p_lane='founder' then
      if not coalesce(p_input->>'sector'=any(private.c24_sectors()),false)
        or (def.code is not null and def.sector is distinct from p_input->>'sector')
        or not(private.c24_localized(p_input->'names') and private.c24_localized(p_input->'descriptions')
          and private.c24_localized(p_input->'methods') and private.c24_localized(p_input->'units'))
        or p_input->>'unit' !~ '^[a-z][a-z_]{1,23}$' or p_input->>'methodologyCode' !~ '^[A-Z][A-Z0-9_]{4,63}$'
        or (p_input->>'aggregatable')::boolean and
          (p_input->>'sector'='healthcare' or p_input->>'unit' not in ('desks','trees','items','classrooms','sessions','kilograms','hectares','meters','wells'))
      then raise exception 'invalid definition' using errcode='23514'; end if;
      if def.state='draft' then update private.c24_definitions set state='retired' where code=metric and version=def.version; end if;
      if expected>=25 or (def.code is null and (select count(distinct code) from private.c24_definitions)>=100)
      then raise exception 'catalog limit reached' using errcode='PFR29'; end if;
      insert into private.c24_definitions(code,version,sector,unit,classification,names,descriptions,methods,units,
        methodology_code,aggregatable,privacy,state,proposer) values(metric,expected+1,p_input->>'sector',p_input->>'unit',
        p_input->>'classification',p_input->'names',p_input->'descriptions',p_input->'methods',p_input->'units',
        p_input->>'methodologyCode',(p_input->>'aggregatable')::boolean,p_input->>'privacy','draft',p_actor) returning * into def;
    elsif p_action='approve_definition' and p_lane='review' and private.c24_governor(p_actor)
      and def.state='draft' and def.proposer is distinct from p_actor and p_input->'methodReviewed'='true'::jsonb then
      update private.c24_definitions set state='retired' where code=metric and state='active';
      update private.c24_definitions set state='active',reviewer=p_actor where code=metric and version=expected returning * into def;
    elsif p_action='retire_definition' and p_lane='founder' and def.state in ('draft','active') then
      update private.c24_definitions set state='retired' where code=metric and state in ('draft','active');
      select * into def from private.c24_definitions where code=metric and version=expected;
    else raise exception 'independent catalog authority required' using errcode='42501'; end if;
    next_version:=def.version; updated:=to_jsonb(def); resource:=metric;
  elsif p_action in ('submit_mapping','withdraw_mapping','approve_mapping','reject_mapping') then
    if expected<>coalesce(m.version,0) then raise exception 'mapping changed' using errcode='O2004'; end if;
    previous:=to_jsonb(m);
    if p_action='submit_mapping' and p_lane='member' then
      perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
      select * into def from private.c24_definitions where code=metric and version=(p_input->>'definitionVersion')::int;
      if not private.c24_compatible(def,r,f,selected_year) or not exists(select from private.c24_projects(selected_year,def.sector,array[x.department]) eligible where eligible.id=p.id
        and eligible.department=x.department) or p_input->>'deliveryReference' is null
        or p_input->>'deliveryReference' !~ '^[A-Z0-9][A-Z0-9_-]{7,79}$'
      then raise exception 'incompatible observation or delivery reference' using errcode='O2005'; end if;
      insert into private.c24_mappings(publication,version,project,department,report_year,source_id,source_revision,finding,
        disclosure_revision,disclosure_hash,code,definition_version,delivery_hash,proposer,state)
        values(x.id,expected+1,p.id,x.department,selected_year,r.source_id,r.source_revision,f.id,x.revision,d.fingerprint,
          def.code,def.version,extensions.digest(p_input->>'deliveryReference','sha256'),p_actor,'submitted')
      on conflict(publication) do update set version=excluded.version,department=excluded.department,report_year=excluded.report_year,
        source_id=excluded.source_id,source_revision=excluded.source_revision,finding=excluded.finding,
        disclosure_revision=excluded.disclosure_revision,disclosure_hash=excluded.disclosure_hash,code=excluded.code,
        definition_version=excluded.definition_version,delivery_hash=excluded.delivery_hash,proposer=excluded.proposer,
        reviewer=null,state='submitted'
      returning * into m;
    elsif p_action='withdraw_mapping' and p_lane='member' and m.state in ('submitted','approved','rejected') then
      update private.c24_mappings set state='withdrawn',version=expected+1 where publication=x.id returning * into m;
    elsif p_lane='review' and p_action in ('approve_mapping','reject_mapping') and m.state='submitted' then
      select * into def from private.c24_definitions where code=m.code and version=m.definition_version;
      if p_action='approve_mapping' and (not private.c24_compatible(def,r,f,selected_year)
        or m.finding<>f.id or m.source_revision<>r.source_revision or m.source_id<>r.source_id or m.disclosure_revision<>x.revision
        or m.disclosure_hash<>d.fingerprint or m.report_year<>selected_year or m.department<>x.department
        or p_input->'methodReviewed' is distinct from 'true'::jsonb)
      then raise exception 'mapping no longer matches inspected source' using errcode='O2005'; end if;
      update private.c24_mappings set state=case when p_action='approve_mapping' then 'approved' else 'rejected' end,
        version=expected+1,reviewer=p_actor where publication=x.id returning * into m;
    else raise exception 'mapping authority required' using errcode='42501'; end if;
    next_version:=m.version; resource:=x.id::text; updated:=to_jsonb(m);
    if p_action='submit_mapping' then updated:=updated||jsonb_build_object('deliveryReference',p_input->>'deliveryReference'); end if;
  elsif p_action in ('allow_need','withdraw_need') and p_lane='member' then
    if expected<>coalesce(n.version,0) or (p_action='withdraw_need' and n.consented is distinct from true)
    then raise exception 'association consent changed' using errcode='O2004'; end if;
    previous:=to_jsonb(n);
    insert into private.c24_need_consents(link,author,link_revision,consented,version)
      values(l.id,p_actor,l.revision,p_action='allow_need',expected+1)
       on conflict(link) do update set author=excluded.author,link_revision=excluded.link_revision,
         consented=excluded.consented,version=excluded.version returning * into n;
    next_version:=n.version; updated:=to_jsonb(n); resource:=l.id::text;
  elsif p_action in ('propose_report','seal_report','reject_report') then
    if not coalesce(s.enabled and selected_year=any(s.years) and scope=any(s.sectors),false)
    then raise exception 'configured year and sector required' using errcode='O2005'; end if;
    select * into a from private.c24_releases where report_year=selected_year and sector=scope;
    if expected<>coalesce(a.version,0) or a.state in ('sealed','suppressed')
    then raise exception 'report version unavailable' using errcode='O2004'; end if;
    previous:=to_jsonb(a)-'projection';
    if p_action='propose_report' and p_lane='founder' then
      snapshot:=private.c24_snapshot(selected_year,scope,s);
      if snapshot is null then raise exception 'report scope exceeds safe bounds' using errcode='PFR29'; end if;
      insert into private.c24_releases(report_year,sector,version,state,basis,projection,projects,proposer)
        values(selected_year,scope,expected+1,'proposed',decode(snapshot->>'basis','hex'),snapshot->'cells',
          array(select v::uuid from jsonb_array_elements_text(snapshot->'projects') v),p_actor)
      on conflict(report_year,sector) do update set version=excluded.version,state='proposed',basis=excluded.basis,
        projection=excluded.projection,projects=excluded.projects,proposer=excluded.proposer,reviewer=null returning * into a;
    elsif p_lane='review' and private.c24_governor(p_actor) and a.state='proposed' and a.proposer is distinct from p_actor
       and not exists(select from private.community_projects pr where pr.id=any(a.projects) and (
        private.project_conflicted(pr,p_actor) or pr.submitted_by=p_actor
        or exists(select from private.c23_publications cp join private.c21_outcome_requests cr on cr.id=cp.case_id
          join private.c22_findings cf on cf.id=cp.finding_id where cp.project_id=pr.id and cp.state='approved'
          and (cr.requester_id=p_actor or cf.reviewer=p_actor or exists(select from private.c23_events ce
            where ce.publication_id=cp.id and ce.actor=p_actor and ce.action in ('inspect','approve'))))
        or exists(select from private.c24_mappings cm where cm.project=pr.id and cm.state='approved'
          and p_actor in(cm.proposer,cm.reviewer))
        or exists(select from private.c14_links cl join private.c24_need_consents cn on cn.link=cl.id
          where cl.project_id=pr.id and cn.consented and p_actor in(cl.author,cl.organizer,cl.reviewer))))
    then
      if p_action='seal_report' then
        snapshot:=private.c24_snapshot(selected_year,scope,s);
        if snapshot->>'basis' is distinct from encode(a.basis,'hex') or p_input->>'fingerprint' is distinct from encode(a.basis,'hex')
          or p_input->'methodReviewed' is distinct from 'true'::jsonb
          or exists(select from private.c24_releases prior where prior.state in ('sealed','suppressed') and prior.projects && a.projects)
        then raise exception 'review the current distinct reporting cohort again' using errcode='O2004'; end if;
      end if;
      update private.c24_releases set state=case when p_action='seal_report' then 'sealed' else 'rejected' end,
        version=expected+1,reviewer=p_actor where report_year=selected_year and sector=scope returning * into a;
    else raise exception 'independent report reviewer required' using errcode='42501'; end if;
    next_version:=a.version; updated:=to_jsonb(a)-'projection'; resource:=selected_year||'/'||scope;
  else raise exception 'impact command unavailable' using errcode='42501';
  end if;

  insert into private.c24_events(actor,workspace,request_id,command_hash,action,resource,version,previous,current,reason)
    values(p_actor,p_workspace,request_key,fingerprint,p_action,resource,next_version,previous,updated,text_reason);
  return jsonb_build_object('version',next_version);
end
$$;

revoke all on function private.c24_enabled(),private.c24_sectors(),private.c24_sector(text),private.c24_localized(jsonb),
 private.c24_catalog_row(private.c24_definitions),private.c24_projects(int,text,text[]),
 private.c24_disclosure(private.c23_publications,private.community_projects,private.c21_outcome_requests,private.c22_findings,private.c23_disclosures),
 private.c24_compatible(private.c24_definitions,private.c21_outcome_requests,private.c22_findings,int),
 private.c24_value(numeric,int,boolean),private.c24_snapshot(int,text,private.c24_settings),
 private.c24_governor(uuid),private.c24_review_workspace(uuid,uuid,boolean,bigint,uuid),
 private.c24_mapping_reviewer(uuid,private.community_projects,private.c21_outcome_requests,private.c23_publications),private.c24_freeze(),
 public.c24_impact_for_api(int,text,text),public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.c24_impact_for_api(int,text,text),
 public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb) to service_role;
