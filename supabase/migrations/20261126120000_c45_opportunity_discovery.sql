-- C4.5 is preparation and disposable discovery. It adds no live activation path.
create table private.c45_fixture (
  singleton boolean primary key default true check (singleton),
  cursor_key bytea not null default extensions.gen_random_bytes(32)
);
create table private.c45_settings (
  version integer primary key check(version>0),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  request uuid not null unique,
  fingerprint bytea not null,
  reason text not null check(length(reason) between 10 and 500),
  configuration jsonb not null,
  recorded_at timestamptz not null default statement_timestamp()
);
create table private.c45_preferences (
  actor uuid primary key references auth.users(id) on delete cascade,
  version integer not null check(version>0),
  preferences jsonb not null check(octet_length(preferences::text)<=4800),
  consent boolean not null default false,
  paused boolean not null default false,
  consent_at timestamptz,
  expires_on date,
  check(consent=(consent_at is not null))
);
-- Bookmark payloads are deliberately limited to the owner's opaque listing reference.
create table private.c45_saved (
  actor uuid not null references auth.users(id) on delete cascade,
  opportunity uuid not null references private.c41_opportunities(id) on delete cascade,
  saved_at timestamptz not null default statement_timestamp(),
  primary key(actor,opportunity)
);
create index c45_saved_page on private.c45_saved(actor,saved_at desc,opportunity desc);
create index c45_saved_cleanup on private.c45_saved(opportunity);
create table private.c45_dismissed (
  actor uuid not null references auth.users(id) on delete cascade,
  opportunity uuid not null,
  revision integer not null,
  expires_at timestamptz not null,
  primary key(actor,opportunity),
  foreign key(opportunity,revision) references private.c42_publications(opportunity,revision) on delete cascade
);
create index c45_dismissed_cleanup on private.c45_dismissed(opportunity,revision);
-- One write receipt per owner is enough to reconcile the last request. Earlier versions
-- fail the owner's optimistic concurrency check. Resetting bookmarks does not delete preferences.
create table private.c45_owner_state (
  actor uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 0 check(version>=0),
  request uuid,
  fingerprint bytea,
  last_action text,
  changed_at timestamptz not null default statement_timestamp()
);
-- Discovery keys are derived exclusively from publication and its exact approved snapshot.
-- The index carries no external destinations, staff data or private candidate data.
create table private.c45_listing_keys (
  opportunity uuid primary key,
  revision integer not null,
  published_at timestamptz not null,
  closing date not null,
  document tsvector not null,
  kind text not null,
  country text not null,
  department text,
  foreign key(opportunity,revision) references private.c42_publications(opportunity,revision) on delete cascade
);
create index c45_latest on private.c45_listing_keys(published_at desc,opportunity desc);
create index c45_closing on private.c45_listing_keys(closing,opportunity);
create index c45_type_latest on private.c45_listing_keys(kind,published_at desc,opportunity desc);
create index c45_country_latest on private.c45_listing_keys(country,published_at desc,opportunity desc);
create index c45_department_latest on private.c45_listing_keys(department,published_at desc,opportunity desc) where department is not null;
create index c45_keywords on private.c45_listing_keys using gin(document);

do $$
declare name text;
begin
  foreach name in array array['fixture','settings','preferences','saved','dismissed','owner_state','listing_keys'] loop
    execute format('alter table private.%I enable row level security','c45_'||name);
    execute format('revoke all on table private.%I from public,anon,authenticated,authenticator,service_role','c45_'||name);
  end loop;
end $$;

create function private.c45_document(snapshot jsonb) returns tsvector
language sql immutable set search_path='' as $$
  select to_tsvector('simple'::regconfig,private.c31_term(concat_ws(' ',snapshot->>'title',snapshot->>'description')))
$$;

create function private.c45_index_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if new.suppressed_at is not null then
    delete from private.c45_listing_keys where opportunity=new.opportunity and revision=new.revision;
    return new;
  end if;
  select r.snapshot into snapshot from private.c41_revisions r
    join private.c42_cases c on c.opportunity=r.opportunity_id and c.revision=r.version and c.state='approved'
    where r.opportunity_id=new.opportunity and r.version=new.revision;
  if found then
    insert into private.c45_listing_keys(opportunity,revision,published_at,closing,document,kind,country,department)
    values(new.opportunity,new.revision,new.published_at,coalesce((snapshot->>'closesOn')::date,'infinity'),
      private.c45_document(snapshot),snapshot->>'type',snapshot->>'country',snapshot->>'department')
    on conflict(opportunity) do update set revision=excluded.revision,published_at=excluded.published_at,
      closing=excluded.closing,document=excluded.document,kind=excluded.kind,country=excluded.country,department=excluded.department;
  end if;
  return new;
end $$;
create trigger c45_publication_index after insert or update of suppressed_at on private.c42_publications
  for each row execute function private.c45_index_publication();

insert into private.c45_listing_keys(opportunity,revision,published_at,closing,document,kind,country,department)
select p.opportunity,p.revision,p.published_at,coalesce((r.snapshot->>'closesOn')::date,'infinity'),
  private.c45_document(r.snapshot),r.snapshot->>'type',r.snapshot->>'country',r.snapshot->>'department'
from private.c42_publications p
join private.c41_revisions r on r.opportunity_id=p.opportunity and r.version=p.revision
join private.c42_cases c on c.opportunity=p.opportunity and c.revision=p.revision and c.state='approved'
where p.suppressed_at is null;

create function private.c45_defaults() returns jsonb language sql immutable set search_path='' as $$
  select '{
    "types":["employment","internship","scholarship","training","education","apprenticeship","workshop"],
    "scopes":["haiti","international"],
    "dimensions":["keyword","type","category","country","department","mode","skill","language","deadline","employmentType","payment","funding"],
    "criteria":["type","interest","skill","language","location","mode","experience","compensation"],
    "fields":["types","interests","skills","experience","countries","departments","modes","languages","objectives","compensation"],
    "pageLimit":16,"recommendationLimit":12,"savedLimit":100,"dismissDays":30,"readinessNotes":""
  }'::jsonb
$$;
create function private.c45_settings_current() returns jsonb language sql stable set search_path='' as $$
  select coalesce((select configuration from private.c45_settings order by version desc limit 1),private.c45_defaults())
$$;
create function private.c45_empty_preferences() returns jsonb language sql immutable set search_path='' as $$
  select '{"types":[],"interests":[],"skills":[],"experience":null,"countries":[],"departments":[],"modes":[],"languages":[],"objectives":"","compensation":null}'::jsonb
$$;

create function private.c45_skill_codes(snapshot jsonb) returns text[] language sql immutable set search_path='' as $$
  select array(
    select distinct code from (
      select skill->>'code' as code from jsonb_array_elements(coalesce(snapshot->'skills','[]')) skill
      union all
      select jsonb_array_elements_text(coalesce(snapshot->'details'->'requiredSkills','[]'))
      union all
      select jsonb_array_elements_text(coalesce(snapshot->'details'->'preferredSkills','[]'))
      union all
      select jsonb_array_elements_text(coalesce(snapshot->'details'->'skillsTaught','[]'))
    ) all_codes where code is not null order by code)
$$;

create function private.c45_amount(snapshot jsonb) returns jsonb language sql immutable set search_path='' as $$
  select coalesce(snapshot->'details'->'compensation', snapshot->'details'->'cost',
    snapshot->'details'->'tuition','{"state":"unknown"}'::jsonb)
$$;

create function private.c45_listing(target uuid,actor uuid,configuration jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.opportunity,'revision',p.revision,'publishedAt',p.published_at,
    'organizationId',org.id,'organization',org.name,'handle',org.handle,'kind',org.kind,
    'verified',true,'status','published',
    'snapshot',jsonb_strip_nulls(jsonb_build_object('title',r.snapshot->'title','description',left(r.snapshot->>'description',220),
      'type',r.snapshot->'type','category',r.snapshot->'category','country',r.snapshot->'country',
      'department',r.snapshot->'department','language',r.snapshot->'language','mode',r.snapshot->'mode',
      'opensOn',r.snapshot->'opensOn','closesOn',r.snapshot->'closesOn')),
    'amount',private.c45_amount(r.snapshot),'period',r.snapshot->'details'->'compensationPeriod',
    'methods',methods,'saved',exists(select from private.c45_saved b where b.actor=c45_listing.actor and b.opportunity=p.opportunity))
  from private.c42_publications p
  join private.c41_opportunities o on o.id=p.opportunity and o.version=p.revision and o.status='published'
  join private.c41_revisions r on r.opportunity_id=p.opportunity and r.version=p.revision
  join private.c42_cases c on c.opportunity=p.opportunity and c.revision=p.revision and c.state='approved'
  join private.organizations org on org.id=p.organization
  cross join lateral (select private.c42_methods(r.snapshot,p.organization) as methods offset 0) approved
  where p.opportunity=target and p.suppressed_at is null and p.published_at<=statement_timestamp()
    and private.c42_publication_eligible(p,r.snapshot)
    and configuration->'types' ? (r.snapshot->>'type')
    and configuration->'scopes' ? (case when r.snapshot->>'country'='HT' then 'haiti' else 'international' end)
    and coalesce((r.snapshot->>'opensOn')::date,'-infinity')<=(statement_timestamp() at time zone 'America/Port-au-Prince')::date
    and not feed_data.blocked_pair(actor,p.responsible) and not feed_data.blocked_pair(actor,p.published_by)
    and not exists(select from feed_data.member_mutes m where m.actor_id=actor and m.target_id in(p.responsible,p.published_by))
    and case r.snapshot->>'applicationMethod'
      when 'external' then (methods->>'external')::boolean and private.c41_reference(r.snapshot->'references'->>0)
      when 'event_registration' then methods->>'event' is not null
      when 'expression_of_interest' then (methods->>'interest')::boolean
      else false end
$$;

create function private.c45_filter(snapshot jsonb, filters jsonb) returns boolean
language sql stable set search_path='' as $$
  select (filters->>'category' is null or snapshot->>'category'=filters->>'category')
    and (filters->>'mode' is null or snapshot->>'mode'=filters->>'mode')
    and (filters->>'language' is null or snapshot->>'language'=filters->>'language')
    and (filters->>'skill' is null or (filters->>'skill')=any(private.c45_skill_codes(snapshot))
      and exists(select from private.c31_skills s where s.code=filters->>'skill' and s.status='active'))
    and (filters->>'deadline' is null or (snapshot->>'closesOn')::date <= (filters->>'deadline')::date)
    and (filters->>'employmentType' is null or snapshot->>'type'='employment' and snapshot->'details'->>'employmentType'=filters->>'employmentType')
    and (filters->>'funding' is null or snapshot->>'type'='scholarship' and snapshot->'details'->>'funding'=filters->>'funding')
    and (filters->>'payment' is null or case snapshot->>'type'
      when 'employment' then case private.c45_amount(snapshot)->>'state' when 'zero' then 'unpaid' when 'range' then 'paid' end
      when 'internship' then snapshot->'details'->>'payment'
      when 'apprenticeship' then snapshot->'details'->>'payment'
      when 'training' then snapshot->'details'->>'payment'
      when 'education' then case private.c45_amount(snapshot)->>'state' when 'zero' then 'free' when 'range' then 'paid' end
      else null end=filters->>'payment')
$$;

create function private.c45_reasons(snapshot jsonb, preferences jsonb, criteria jsonb) returns text[]
language sql stable set search_path='' as $$
  select array_remove(array[
    case when criteria ? 'type' and preferences->'types' ? (snapshot->>'type') then 'typeFit' end,
    case when criteria ? 'interest' and preferences->'interests' ? (snapshot->>'category') then 'interestFit' end,
    case when criteria ? 'skill' and exists(select from jsonb_array_elements(preferences->'skills') skill
      join private.c31_skills s on s.code=skill->>'code' and s.status='active'
      where s.code=any(private.c45_skill_codes(snapshot))) then 'skillFit' end,
    case when criteria ? 'skill' and jsonb_array_length(coalesce(snapshot->'details'->'requiredSkills','[]'))>0
      and exists(select from jsonb_array_elements_text(snapshot->'details'->'requiredSkills') required(code)
        where not exists(select from jsonb_array_elements(preferences->'skills') skill where skill->>'code'=required.code))
      then 'qualificationsRequested' end,
    case when criteria ? 'language' and preferences->'languages' ? (snapshot->>'language') then 'languageFit' end,
    case when criteria ? 'location' and (preferences->'countries' ? (snapshot->>'country')
      or preferences->'departments' ? (snapshot->>'department')) then 'locationFit' end,
    case when criteria ? 'mode' and preferences->'modes' ? (snapshot->>'mode')
      then case snapshot->>'mode' when 'remote' then 'remoteFit' else 'modeFit' end end,
    case when criteria ? 'experience' and nullif(snapshot->'details'->>'experience','') is not null then
      case when experience_years is not null and jsonb_typeof(preferences->'experience')='number' and
        (preferences->>'experience')::int>=experience_years::int then 'experienceFits'
      else 'experienceRequested' end
    end,
    case when criteria ? 'compensation' and jsonb_typeof(preferences->'compensation')='object' then
      case
        when snapshot->>'type' not in ('employment','internship','apprenticeship') then null
        when amount->>'state' in ('unknown','undisclosed') then 'amountUnavailable'
        when amount->>'state'='zero' then 'amountZero'
        when amount->>'currency' is distinct from preferences->'compensation'->>'currency'
          or snapshot->'details'->>'compensationPeriod' is distinct from preferences->'compensation'->>'period' then 'amountIncomparable'
        when (amount->>'min')::numeric >= (preferences->'compensation'->>'minimum')::numeric then 'amountFits'
        when (amount->>'max')::numeric < (preferences->'compensation'->>'minimum')::numeric then 'amountBelow'
        else 'amountOverlaps'
      end
    end
  ],null)
  from (select private.c45_amount(snapshot) amount,
    substring(lower(snapshot->'details'->>'experience') from '^([0-9]|[1-5][0-9]|60)[+]? years?$') as experience_years) money
$$;

create function private.c45_page(actor uuid,filters jsonb,configuration jsonb,preferences private.c45_preferences,key bytea)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  requested_view text:=coalesce(filters->>'view','latest');
  sort_order text:=coalesce(filters->>'sort','latest');
  scope text:=encode(extensions.digest(jsonb_build_array(filters-'cursor',configuration,case when requested_view='forYou' then preferences.version end)::text,'sha256'),'hex');
  cursor_data jsonb:=private.c44_token(filters->>'cursor',key);
  before_id uuid;
  before_time timestamptz;
  before_closing date;
  page_size int;
  matches jsonb;
  next_page text;
  boundary jsonb;
  page_items jsonb;
  words tsquery;
  today date:=(statement_timestamp() at time zone 'America/Port-au-Prince')::date;
  criteria jsonb:=configuration->'criteria';
  effective jsonb;
begin
  if requested_view not in ('latest','forYou','saved') or sort_order not in ('latest','closing','relevance')
    or (sort_order='relevance' and requested_view<>'forYou')
    or (filters-array['view','sort','cursor']<>'{}' and requested_view='saved')
    or (select count(*) from jsonb_object_keys(filters) k
      where k not in ('view','sort','cursor') and not (configuration->'dimensions' ? k))>0
    or (filters ? 'keyword' and not private.c43_text(filters->'keyword',2,80))
    or (filters ? 'country' and not private.c41_country(filters->>'country'))
    or (filters ? 'department' and (coalesce(filters->>'country','HT')<>'HT'
      or not exists(select from public.departments where code=filters->>'department')))
    or (filters ? 'employmentType' and coalesce(filters->>'type','employment') <> 'employment')
    or (filters ? 'funding' and coalesce(filters->>'type','scholarship') <> 'scholarship')
    or (filters ? 'payment' and coalesce(filters->>'type','employment') in ('scholarship','workshop'))
    then raise exception 'unsupported discovery filter' using errcode='23514'; end if;
  if requested_view='forYou' then
    if not coalesce(preferences.consent,false) or preferences.paused or preferences.expires_on<today then
      return '{"state":"personalization_disabled","items":[],"next":null}';
    end if;
    select private.c45_empty_preferences()||coalesce(jsonb_object_agg(field,value),'{}') into effective
    from jsonb_each(preferences.preferences) f(field,value) where configuration->'fields' ? field;
    if effective->'types'='[]' and effective->'interests'='[]' and effective->'skills'='[]'
      and effective->'countries'='[]' and effective->'departments'='[]'
      and effective->'languages'='[]' and effective->'modes'='[]' and effective->'compensation'='null' and effective->'experience'='null'
    then return '{"state":"preferences_incomplete","items":[],"next":null}'; end if;
  end if;
  if filters ? 'cursor' then
    if cursor_data is null or cursor_data->>'actor'<>actor::text or cursor_data->>'scope'<>scope
      or (cursor_data->>'until')::bigint<extract(epoch from now())
    then raise exception 'cursor unavailable' using errcode='23514'; end if;
    before_id:=(cursor_data->>'id')::uuid;
    before_time:=(cursor_data->>'time')::timestamptz;
    before_closing:=(cursor_data->>'closing')::date;
  end if;
  page_size:=(configuration->>case when requested_view='forYou' then 'recommendationLimit' else 'pageLimit' end)::int;
  if requested_view='saved' then
    with chosen as materialized (
      select s.opportunity,s.saved_at from private.c45_saved s where s.actor=c45_page.actor
        and (before_id is null or (s.saved_at,s.opportunity)<(before_time,before_id))
      order by s.saved_at desc,s.opportunity desc limit page_size+1
    )
    select coalesce(jsonb_agg(jsonb_build_object('id',s.opportunity,'time',s.saved_at,'item',
      coalesce(private.c45_listing(s.opportunity,actor,configuration),jsonb_build_object('id',s.opportunity,'unavailable',true,'saved',true)))
      order by s.saved_at desc,s.opportunity desc),'[]') into matches from chosen s;
    if jsonb_array_length(matches)>page_size then boundary:=matches->(page_size-1); end if;
  else
    words:=case when filters ? 'keyword' then plainto_tsquery('simple',private.c31_term(filters->>'keyword')) end;
    with indexed as materialized (
      (select k.* from private.c45_listing_keys k
        where sort_order<>'closing' and (before_id is null or (k.published_at,k.opportunity)<(before_time,before_id))
          and k.published_at<=statement_timestamp() and k.closing>=today
          and (filters->>'type' is null or k.kind=filters->>'type')
          and (filters->>'country' is null or k.country=filters->>'country')
          and (filters->>'department' is null or k.department=filters->>'department')
          and (words is null or k.document@@words)
        order by k.published_at desc,k.opportunity desc limit 129)
      union all
      (select k.* from private.c45_listing_keys k
        where sort_order='closing' and (before_id is null or (k.closing,k.opportunity)>(before_closing,before_id))
          and k.published_at<=statement_timestamp() and k.closing>=today and k.closing<'infinity'
          and (filters->>'type' is null or k.kind=filters->>'type')
          and (filters->>'country' is null or k.country=filters->>'country')
          and (filters->>'department' is null or k.department=filters->>'department')
          and (words is null or k.document@@words)
        order by k.closing,k.opportunity limit 129)
    ), ordered as materialized (
      select k.*,row_number() over(order by
        case when sort_order='closing' then k.closing end,
        case when sort_order='closing' then k.opportunity end,
        k.published_at desc,k.opportunity desc) as position from indexed k
    ), permitted as materialized (
      select k.opportunity,k.position,k.published_at,k.closing,listing.item,
        case when requested_view='forYou' then private.c45_reasons(r.snapshot,effective,criteria) else '{}'::text[] end as reasons
      from ordered k
      join private.c41_revisions r on r.opportunity_id=k.opportunity and r.version=k.revision
      cross join lateral (select private.c45_listing(k.opportunity,actor,configuration) item offset 0) listing
      where k.position<=128 and private.c45_filter(r.snapshot,filters) and listing.item is not null
        and (requested_view<>'forYou' or not exists(select from private.c45_dismissed d
          where d.actor=c45_page.actor and d.opportunity=k.opportunity and d.revision=k.revision and d.expires_at>now()))
    ), chosen as materialized (
      select * from permitted p where requested_view<>'forYou' or p.reasons &&
        array['typeFit','interestFit','skillFit','languageFit','locationFit','remoteFit','modeFit','experienceFits','amountFits','amountOverlaps']
      order by position limit page_size+1
    )
    select coalesce((select jsonb_agg(jsonb_build_object('id',c.opportunity,'time',c.published_at,'closing',c.closing,
      'item',c.item||jsonb_build_object('reasons',c.reasons),'position',c.position,
      'rank',cardinality(array(select item from unnest(c.reasons) item where item in
        ('typeFit','interestFit','skillFit','languageFit','locationFit','remoteFit','modeFit','experienceFits','amountFits')))) order by c.position)
      from chosen c),'[]'),
      case when (select count(*) from ordered)=129 then (select jsonb_build_object('id',opportunity,'time',published_at,'closing',closing)
        from ordered where position=128) end into matches,boundary;
    if jsonb_array_length(matches)>page_size then boundary:=matches->(page_size-1); end if;
  end if;
  if boundary is not null then
    next_page:=private.c44_sign(jsonb_build_object('actor',actor,'scope',scope,'id',boundary->'id','time',boundary->'time',
      'closing',boundary->'closing','until',floor(extract(epoch from now()+interval '15 minutes'))),key);
  end if;
  select coalesce(jsonb_agg(entry->'item' order by case when sort_order='relevance' then (entry->>'rank')::int end desc,n),'[]')
    into page_items from jsonb_array_elements(matches) with ordinality as j(entry,n) where n<=page_size;
  return jsonb_build_object('state','available','items',page_items,'next',next_page);
end $$;

create function private.c45_import(actor uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.source,s.code),'[]') from (
    select 'volunteer' as source,p.version,s.code,s.proficiency,c.names
    from private.c31_profiles p join private.c31_selections s on s.actor=p.actor
    join private.c31_skills c on c.code=s.code and c.status='active' where p.actor=c45_import.actor
    union all
    select p.role,p.version,s.code,s.proficiency,c.names
    from private.c43_profiles p join private.c43_skills s on s.profile=p.id
    join private.c31_skills c on c.code=s.code and c.status='active'
    where p.actor=c45_import.actor and p.participation_at is not null
  ) s
$$;

create function private.c45_validate_preferences(preferences jsonb,configuration jsonb) returns boolean
language sql stable set search_path='' as $$
  select case when jsonb_typeof(preferences)='object' and preferences ?& array[
    'types','interests','skills','experience','countries','departments','modes','languages','objectives','compensation'] then
    preferences-array['types','interests','skills','experience','countries','departments','modes','languages','objectives','compensation']='{}'
    and not exists(select from jsonb_each(preferences) f where not configuration->'fields' ? f.key
      and f.value<>private.c45_empty_preferences()->f.key)
    and private.c43_strings(preferences->'types',configuration->'types',7)
    and private.c43_strings(preferences->'interests','["professional","educational"]',2)
    and private.c43_strings(preferences->'countries',null,12)
    and not exists(select from jsonb_array_elements_text(preferences->'countries') c where not private.c41_country(c)
      or not configuration->'scopes' ? (case when c='HT' then 'haiti' else 'international' end))
    and private.c43_strings(preferences->'departments',
      (select coalesce(jsonb_agg(code),'[]') from public.departments where configuration->'scopes' ? 'haiti'),10)
    and private.c43_strings(preferences->'modes','["remote","on_site","hybrid"]',3)
    and private.c43_strings(preferences->'languages','["ht","fr","en","es"]',4)
    and private.c43_text(preferences->'objectives',0,500)
    and (preferences->'experience'='null' or private.c43_number(preferences->'experience',0,60))
    and case when jsonb_typeof(preferences->'skills')='array' then
      jsonb_array_length(preferences->'skills')<=12
      and (select count(distinct s.code) from jsonb_array_elements(preferences->'skills') skill
        join private.c31_skills s on s.code=skill->>'code' and s.status='active'
        where skill-array['code','proficiency']='{}' and skill->>'proficiency' in ('beginner','intermediate','advanced'))=
          jsonb_array_length(preferences->'skills')
      else false end
    and (preferences->'compensation'='null' or (
      jsonb_typeof(preferences->'compensation')='object'
      and (preferences->'compensation')-array['currency','period','minimum']='{}'
      and preferences->'compensation'->>'currency' ~ '^[A-Z]{3}$'
      and preferences->'compensation'->>'period' in ('hour','day','week','month','year','project')
      and private.c43_number(preferences->'compensation'->'minimum',1,99999999)))
    else false end
$$;

create function private.c45_prepare(actor uuid,workspace uuid,body jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  next_config jsonb:=body->'configuration';
  base jsonb:=private.c45_defaults();
  stored private.c45_settings;
  head integer;
  key uuid:=(body->>'requestId')::uuid;
  digest bytea:=extensions.digest(jsonb_build_array(workspace,body)::text,'sha256');
  label text;
begin
  if key is null or body-array['requestId','expectedVersion','confirmed','reason','configuration']<>'{}'
    or body->'confirmed' is distinct from 'true'
    or not private.c43_text(body->'reason',10,500) or not private.c43_number(body->'expectedVersion',0,2147483646)
    or jsonb_typeof(next_config) is distinct from 'object'
    or next_config-array['types','scopes','dimensions','criteria','fields','pageLimit','recommendationLimit','savedLimit','dismissDays','readinessNotes']<>'{}'
    or not private.c43_number(next_config->'pageLimit',4,24)
    or not private.c43_number(next_config->'recommendationLimit',4,20)
    or not private.c43_number(next_config->'savedLimit',10,200)
    or not private.c43_number(next_config->'dismissDays',7,60)
    or not private.c43_text(next_config->'readinessNotes',0,500)
    then raise exception 'invalid preparation' using errcode='23514'; end if;
  foreach label in array array['types','scopes','dimensions','criteria','fields'] loop
    if not private.c43_strings(next_config->label,base->label,jsonb_array_length(base->label))
    then raise exception 'invalid preparation vocabulary' using errcode='23514'; end if;
  end loop;
  perform pg_advisory_xact_lock(20261126,450);
  select * into stored from private.c45_settings where request=key;
  if found then
    if stored.actor is distinct from actor or stored.fingerprint<>digest then raise exception 'receipt conflict' using errcode='23505'; end if;
    return jsonb_build_object('version',stored.version);
  end if;
  select coalesce(max(version),0) into head from private.c45_settings;
  if head<>(body->>'expectedVersion')::int then raise exception 'stale preparation' using errcode='40001'; end if;
  insert into private.c45_settings(version,actor,workspace,request,fingerprint,reason,configuration)
    values(head+1,actor,workspace,key,digest,trim(body->>'reason'),next_config);
  return jsonb_build_object('version',head+1);
end $$;

create function public.c45_discovery_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='7s' as $$
declare
  configuration jsonb:=private.c45_settings_current();
  profile private.c45_preferences;
  owner_state private.c45_owner_state;
  signing_key bytea;
  allowed boolean;
  selected uuid;
  request_key uuid;
  digest bytea;
  preferences jsonb;
  choice jsonb;
  available jsonb;
  profile_version integer;
  new_version integer;
  expires date;
  listing jsonb;
begin
  if p_action is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>6000
      or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'session required' using errcode='42501'; end if;
  if p_action in ('settings','configure') then
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    if p_action='configure' then return private.c45_prepare(p_actor,p_workspace,p_input); end if;
    if p_input<>'{}' then raise exception 'invalid settings read' using errcode='23514'; end if;
    return jsonb_build_object('version',coalesce((select max(version) from private.c45_settings),0),'live',false,
      'stages','{"discovery":"disabled","preferences":"disabled","personalization":"disabled","saved":"disabled","activation":"unimplemented"}'::jsonb,
      'configuration',configuration,'history',(select coalesce(jsonb_agg(to_jsonb(s) order by s.version desc),'[]')
        from (select version,reason,recorded_at as "recordedAt" from private.c45_settings order by version desc limit 20) s));
  end if;

  if p_fixture and exists(select from private.c42_fixture) then select cursor_key into signing_key from private.c45_fixture; end if;
  allowed:=signing_key is not null and private.member_onboarding_access(p_actor);
  select * into profile from private.c45_preferences where actor=p_actor;
  select * into owner_state from private.c45_owner_state where actor=p_actor;
  if p_action='preferences' and p_input='{}' then
    return jsonb_build_object('enabled',allowed,'version',coalesce(owner_state.version,0),
      'preferences',coalesce(profile.preferences,private.c45_empty_preferences()),'consent',coalesce(profile.consent,false),
      'paused',coalesce(profile.paused,false),'expiresOn',profile.expires_on,'fields',configuration->'fields',
      'types',configuration->'types','scopes',configuration->'scopes');
  elsif p_action='list' then
    if not allowed then
      return jsonb_build_object('state','closed','items','[]'::jsonb,'next',null,'version',coalesce(owner_state.version,0));
    end if;
    return private.c45_page(p_actor,p_input,configuration,profile,signing_key) ||
      jsonb_build_object('version',coalesce(owner_state.version,0),'dimensions',configuration->'dimensions',
        'types',configuration->'types','scopes',configuration->'scopes');
  elsif p_action in ('import','catalog') then
    if not allowed then raise exception 'discovery unavailable' using errcode='42501'; end if;
    if p_action='import' and p_input='{}' then return private.c45_import(p_actor); end if;
    if p_action='catalog' and p_input-array['q']='{}' and private.c43_text(p_input->'q',0,80) then
      return (select coalesce(jsonb_agg(to_jsonb(s) order by s.code),'[]') from (
        select code,names from private.c31_skills
        where status='active' and (p_input->>'q'='' or code=private.c31_term(p_input->>'q')
          or exists(select from private.c31_catalog_terms t where t.code=c31_skills.code
            and starts_with(t.term,private.c31_term(p_input->>'q')))) order by code limit 20) s);
    end if;
    raise exception 'invalid lookup' using errcode='23514';
  end if;

  if not allowed and p_action not in ('withdraw','clear','unsave','reset') then
    raise exception 'discovery unavailable' using errcode='42501';
  end if;
  if not allowed and owner_state.actor is null then return '{"version":0}'; end if;
  request_key:=(p_input->>'requestId')::uuid;
  if request_key is null or not private.c43_number(p_input->'expectedVersion',0,2147483646)
    then raise exception 'request receipt required' using errcode='23514'; end if;
  perform private.s2b_lock_actor(p_actor,p_session);
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'session required' using errcode='42501'; end if;
  insert into private.c45_owner_state(actor) values(p_actor) on conflict do nothing;
  select * into owner_state from private.c45_owner_state where actor=p_actor for update;
  select * into profile from private.c45_preferences where actor=p_actor;
  digest:=extensions.digest(jsonb_build_array(p_action,p_input)::text,'sha256');
  if owner_state.request=request_key then
    if owner_state.fingerprint<>digest then raise exception 'receipt conflict' using errcode='23505'; end if;
    return jsonb_build_object('version',owner_state.version);
  end if;
  if owner_state.version<>(p_input->>'expectedVersion')::int then raise exception 'stale discovery state' using errcode='40001'; end if;
  new_version:=owner_state.version+1;
  profile_version:=coalesce(profile.version,0)+1;
  if p_action='save_preferences' then
    if p_input-array['requestId','expectedVersion','preferences','expiresOn','import']<>'{}'
      then raise exception 'invalid preference command' using errcode='23514'; end if;
    preferences:=p_input->'preferences';
    if p_input->>'expiresOn' is not null then
      expires:=(p_input->>'expiresOn')::date;
      if expires<=current_date or expires>current_date+365 then raise exception 'invalid preference expiry' using errcode='23514'; end if;
    end if;
    choice:=p_input->'import';
    if choice is not null then
      if jsonb_typeof(choice) is distinct from 'object' or choice-array['source','version','codes','confirmed']<>'{}'
        or choice->'confirmed' is distinct from 'true' or not private.c43_strings(choice->'codes',null,12)
        or not private.c43_number(choice->'version',1,2147483646)
        then raise exception 'invalid import selection' using errcode='23514'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('code',i->'code','proficiency',i->'proficiency') order by i->>'code'),'[]')
        into available from jsonb_array_elements(private.c45_import(p_actor)) i
        where i->>'source'=choice->>'source' and i->'version'=choice->'version' and choice->'codes' ? (i->>'code');
      if jsonb_array_length(available)=0 or jsonb_array_length(available)<>jsonb_array_length(choice->'codes')
        then raise exception 'source profile changed' using errcode='40001'; end if;
      preferences:=jsonb_set(preferences,'{skills}',coalesce((select jsonb_agg(s) from (
        select distinct on (entry->>'code') entry s from
          jsonb_array_elements(coalesce(preferences->'skills','[]')||available) with ordinality vals(entry,position)
        order by entry->>'code',position desc) merged),'[]'));
    end if;
    if not coalesce(private.c45_validate_preferences(preferences,configuration),false)
      then raise exception 'invalid preferences' using errcode='23514'; end if;
    insert into private.c45_preferences(actor,version,preferences,expires_on) values(p_actor,profile_version,preferences,expires)
      on conflict(actor) do update set version=excluded.version,preferences=excluded.preferences,expires_on=excluded.expires_on;
  elsif p_action in ('opt_in','pause','resume','withdraw','clear','reset') then
    if p_input-array['requestId','expectedVersion','confirmed']<>'{}' or p_input->'confirmed' is distinct from 'true'
      then raise exception 'confirmation required' using errcode='23514'; end if;
    if p_action='clear' then
      delete from private.c45_preferences where actor=p_actor;
      delete from private.c45_dismissed where actor=p_actor;
    elsif p_action='reset' then
      delete from private.c45_dismissed where actor=p_actor;
    elsif p_action='opt_in' then
      insert into private.c45_preferences(actor,version,preferences,consent,paused,consent_at)
        values(p_actor,profile_version,private.c45_empty_preferences(),true,false,now())
      on conflict(actor) do update set version=excluded.version,consent=true,paused=false,consent_at=now();
    elsif p_action='withdraw' then
      update private.c45_preferences set version=profile_version,consent=false,paused=false,consent_at=null where actor=p_actor;
      delete from private.c45_dismissed where actor=p_actor;
    else
      if not coalesce(profile.consent,false) then raise exception 'personalization consent required' using errcode='42501'; end if;
      update private.c45_preferences set version=profile_version,paused=p_action='pause' where actor=p_actor;
    end if;
  elsif p_action in ('save','unsave','dismiss') then
    if p_input-array['requestId','expectedVersion','id','revision']<>'{}' or p_input->>'id' is null
      then raise exception 'invalid opportunity reference' using errcode='23514'; end if;
    selected:=(p_input->>'id')::uuid;
    if p_action='unsave' then
      delete from private.c45_saved where actor=p_actor and opportunity=selected;
    else
      listing:=private.c45_listing(selected,p_actor,configuration);
      if listing is null or not private.c43_number(p_input->'revision',1,2147483646)
        or listing->'revision'<>p_input->'revision'
      then raise exception 'opportunity unavailable' using errcode='42501'; end if;
      if p_action='save' then
        if not exists(select from private.c45_saved where actor=p_actor and opportunity=selected)
          and (select count(*) from private.c45_saved where actor=p_actor)>=(configuration->>'savedLimit')::int
          then raise exception 'bookmark limit reached' using errcode='54000'; end if;
        insert into private.c45_saved(actor,opportunity) values(p_actor,selected) on conflict do nothing;
      else
        if not coalesce(profile.consent,false) or profile.paused or profile.expires_on<current_date
          then raise exception 'personalization consent required' using errcode='42501'; end if;
        delete from private.c45_dismissed where actor=p_actor and expires_at<=now();
        if not exists(select from private.c45_dismissed where actor=p_actor and opportunity=selected)
          and (select count(*) from private.c45_dismissed where actor=p_actor)>=200
          then raise exception 'dismissal limit reached' using errcode='54000'; end if;
        insert into private.c45_dismissed(actor,opportunity,revision,expires_at)
          values(p_actor,selected,(listing->>'revision')::int,now()+make_interval(days=>(configuration->>'dismissDays')::int))
          on conflict(actor,opportunity) do update set revision=excluded.revision,expires_at=excluded.expires_at;
      end if;
    end if;
  else raise exception 'unknown discovery command' using errcode='23514'; end if;
  update private.c45_owner_state set version=new_version,request=request_key,fingerprint=digest,last_action=p_action,
    changed_at=now() where actor=p_actor;
  return jsonb_build_object('version',new_version);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
  then raise exception 'invalid discovery input' using errcode='23514';
end $$;

revoke all on function public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c45_discovery_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb) to service_role;
do $$
declare signature text;
begin
  for signature in select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like 'c45\_%'
  loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated,authenticator,service_role';
  end loop;
end $$;

