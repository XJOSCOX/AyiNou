-- Exercise the deployed aggregation bodies against transaction-local inputs.
create temp table users (id uuid primary key, deleted_at timestamptz, is_anonymous boolean not null default false,
  banned_until timestamptz, email_confirmed_at timestamptz default now());
create temp table member_private (user_id uuid primary key, residence_country_code text, residence_department_code text, membership_category text);
create temp table member_metric_exclusions (user_id uuid primary key);
create temp table user_activity_daily (user_id uuid primary key, activity_day date);
create temp table verification_records (user_id uuid primary key, status text, verification_type text,
  source text not null default 'review', publication_held_at timestamptz);
create temp table account_restrictions (user_id uuid primary key, status text not null);
create temp table departments as select code, name from public.departments;
create temp table fixture_members (id uuid primary key, sequence integer not null);

do $fixture$
declare
  definition text;
  mapping record;
  source record;
begin
  -- Pin the reviewed read-only bodies. A later migration must be reviewed before it can run here.
  for source in select * from (values
    ('private.institution_actor(uuid)'::regprocedure, '1fe14367f7d841f093b9023523fd8055'),
    ('private.build_community_stats()'::regprocedure, '09d143c3ed08a4690aaf5bc168f96980'),
    ('public.community_stats_v2_for_api()'::regprocedure, '8a87f9c6f7b3a8a113c2f46c03a1ff11')
  ) as functions(name, body_hash) loop
    if (select md5(btrim(replace(prosrc, chr(13), ''), E' \n\t')) from pg_proc where oid=source.name)
      is distinct from source.body_hash
    then raise exception 'Aggregation body changed. Review fixture isolation before executing it.'; end if;
    definition := replace(pg_get_functiondef(source.name), 'SECURITY DEFINER', 'SECURITY INVOKER');
    for mapping in select * from (values
      ('private.build_community_stats', 'pg_temp.build_community_stats'),
      ('private.institution_actor', 'pg_temp.institution_actor'),
      ('private.account_restrictions', 'pg_temp.account_restrictions'),
      ('public.community_stats_v2_for_api', 'pg_temp.community_stats_v2_for_api'),
      ('auth.users', 'pg_temp.users'),
      ('public.member_private', 'pg_temp.member_private'),
      ('public.member_metric_exclusions', 'pg_temp.member_metric_exclusions'),
      ('public.user_activity_daily', 'pg_temp.user_activity_daily'),
      ('public.verification_records', 'pg_temp.verification_records'),
      ('public.departments', 'pg_temp.departments')
    ) as replacements(source, target) loop
      definition := replace(definition, mapping.source, mapping.target);
    end loop;
    if not starts_with(definition, 'CREATE OR REPLACE FUNCTION pg_temp.')
    then raise exception 'Aggregation definition changed. Review fixture isolation before executing it.'; end if;
    execute definition;
  end loop;
end
$fixture$;

create function pg_temp.expect_stats(s jsonb, expected jsonb)
returns void language plpgsql as $fixture$
declare item record;
begin
  for item in select * from jsonb_each(expected) loop
    if s->item.key is distinct from item.value then
      raise exception 'Unexpected or missing aggregate field %', item.key;
    end if;
  end loop;
end
$fixture$;

create function pg_temp.expect_group(s jsonb, field text, code text, expected_count integer)
returns void language plpgsql as $fixture$
declare group_count bigint;
begin
  if jsonb_typeof(s->field) is distinct from 'array' then raise exception 'Missing aggregate group list %', field; end if;
  select (value->>'members')::bigint into group_count from jsonb_array_elements(s->field) where value->>'code'=code;
  if not found or group_count is distinct from expected_count::bigint then raise exception 'Missing or wrong count for group %', code; end if;
end
$fixture$;

do $fixture$
declare s jsonb;
begin
  if (select count(*) from pg_temp.departments) <> 10 then raise exception 'Expected ten reference departments'; end if;
  s := pg_temp.community_stats_v2_for_api();
  perform pg_temp.expect_stats(s, '{"registered":0,"active":0,"verified":0,"minimumCohort":10,"geographyAvailable":true,"haiti":0,"diaspora":0,"unknown":0,"representedDepartments":0,"diasporaCountries":[],"membership":{"haitian":0,"internationalSupporter":0,"unspecified":0}}');
  perform pg_temp.expect_group(s, 'departments', 'HT-OU', 0);
  begin
    perform pg_temp.expect_group(s, 'diasporaCountries', 'ZZ', 0);
    raise exception 'Missing result row unexpectedly passed';
  exception when raise_exception then
    if SQLERRM is distinct from 'Missing or wrong count for group ZZ' then raise; end if;
  end;

  insert into pg_temp.fixture_members select gen_random_uuid(), n from generate_series(1, 12) n;
  insert into pg_temp.users(id) select id from pg_temp.fixture_members where sequence <= 9;
  insert into pg_temp.member_private select id, 'HT', 'HT-OU', null from pg_temp.fixture_members where sequence <= 9;
  insert into pg_temp.user_activity_daily select id, current_date from pg_temp.fixture_members where sequence <= 9;
  insert into pg_temp.verification_records(user_id,status,verification_type)
    select id, 'verified', 'identity' from pg_temp.fixture_members where sequence <= 9;
  perform pg_temp.expect_stats(pg_temp.community_stats_v2_for_api(),
    '{"registered":null,"active":null,"verified":null,"geographyAvailable":false,"haiti":null,"diaspora":null,"unknown":null,"representedDepartments":null,"departments":null,"diasporaCountries":null,"membership":null}');

  insert into pg_temp.users(id) select id from pg_temp.fixture_members where sequence >= 10;
  insert into pg_temp.member_private select id, 'HT', 'HT-OU', null from pg_temp.fixture_members where sequence >= 10;
  insert into pg_temp.member_metric_exclusions select id from pg_temp.fixture_members where sequence = 12;
  update pg_temp.users set is_anonymous=true where id in (select id from pg_temp.fixture_members where sequence=11);
  insert into pg_temp.user_activity_daily select id, current_date from pg_temp.fixture_members where sequence >= 10;
  insert into pg_temp.verification_records(user_id,status,verification_type)
    select id, 'verified', 'identity' from pg_temp.fixture_members where sequence >= 10;
  s := pg_temp.community_stats_v2_for_api();
  perform pg_temp.expect_stats(s,
    '{"registered":10,"active":10,"verified":10,"haiti":10,"diaspora":0,"unknown":0,"representedDepartments":1,"geographyAvailable":true,"membership":{"haitian":0,"internationalSupporter":0,"unspecified":10}}');
  perform pg_temp.expect_group(s, 'departments', 'HT-OU', 10);
  perform pg_temp.expect_group(s, 'departments', 'HT-ND', 0);

  update pg_temp.users set is_anonymous=false where id in (select id from pg_temp.fixture_members where sequence=11);
  update pg_temp.member_private set residence_country_code='US', residence_department_code=null,
    membership_category='international_supporter';
  update pg_temp.member_private set membership_category='haitian' where user_id in (select id from pg_temp.fixture_members where sequence=1);
  s := pg_temp.community_stats_v2_for_api();
  perform pg_temp.expect_stats(s, '{"registered":11,"diaspora":11,"geographyAvailable":true,"membership":null}');
  perform pg_temp.expect_group(s,'diasporaCountries','US',11);

  update pg_temp.member_private set residence_country_code=null;
  perform pg_temp.expect_stats(pg_temp.community_stats_v2_for_api(),
    '{"registered":11,"haiti":0,"diaspora":0,"unknown":11,"geographyAvailable":true,"diasporaCountries":[]}');
  update pg_temp.member_private set residence_country_code='HT', residence_department_code='HT-ND'
    where user_id in (select id from pg_temp.fixture_members where sequence=1);
  perform pg_temp.expect_stats(pg_temp.community_stats_v2_for_api(),
    '{"registered":11,"active":11,"verified":11,"geographyAvailable":false,"haiti":null,"diaspora":null,"unknown":null,"representedDepartments":null,"departments":null,"diasporaCountries":null}');
end
$fixture$;
