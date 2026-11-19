begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select is((select count(*)::int from public.departments), 10, 'ten Haiti departments are seeded');
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.departments'::regclass, 'public.profiles'::regclass,
  'public.member_private'::regclass, 'public.role_assignments'::regclass,
  'public.verification_records'::regclass
)), 'RLS is enabled on all five application tables');

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'phase1a-owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'phase1a-other@example.test');

select lives_ok($$select private.initialize_member('11111111-1111-4111-8111-111111111111')$$,
  'trusted initializer creates owner profile');
select lives_ok($$select private.initialize_member('11111111-1111-4111-8111-111111111111')$$,
  'trusted initializer can be retried');
select is((select count(*)::int from public.member_private), 1, 'retry does not duplicate private data');
select is((select preferred_locale from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'ht', 'Creole is the default locale');
select throws_ok($$select private.initialize_member('33333333-3333-4333-8333-333333333333')$$, '23503');
select is((select count(*)::int from public.profiles where user_id =
  '33333333-3333-4333-8333-333333333333'), 0, 'failed initialization leaves no orphan profile');

select throws_ok($$update public.profiles set preferred_locale = 'es'
  where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514');
select throws_ok($$update public.member_private set residence_department_code = 'HT-OU'
  where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514');
select throws_ok($$update public.member_private set residence_country_code = 'HT', diaspora_department_code = 'HT-OU'
  where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514');
select throws_ok($$update public.profiles set is_visible = true
  where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514');

set local role anon;
select is((select count(*)::int from public.departments), 10, 'anonymous visitor can read departments');
select is((select count(*)::int from public.profiles), 0, 'anonymous visitor cannot read hidden profiles');
select throws_ok($$select * from public.member_private$$, '42501');
select throws_ok($$insert into public.profiles (user_id) values
  ('11111111-1111-4111-8111-111111111111')$$, '42501');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.profiles), 1, 'owner reads own hidden profile');
select is((select count(*)::int from public.member_private), 1, 'owner reads own private data');
select results_eq(
  $$with changed as (update public.profiles set display_name = 'Owner' where user_id =
    '11111111-1111-4111-8111-111111111111' returning 1)
    select count(*)::int from changed$$,
  $$values (1)$$,
  'owner can update permitted public field'
);
select results_eq(
  $$with changed as (update public.member_private set residence_country_code = 'HT',
    residence_department_code = 'HT-OU' where user_id =
    '11111111-1111-4111-8111-111111111111' returning 1)
    select count(*)::int from changed$$,
  $$values (1)$$,
  'owner can update permitted private fields'
);
select throws_ok($$update public.profiles set is_visible = true$$,
  '42501');
select throws_ok($$insert into public.role_assignments (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'administrator')$$,
  '42501');
select throws_ok($$select * from public.role_assignments$$, '42501');
select throws_ok($$insert into public.verification_records (user_id, verification_type) values
  ('11111111-1111-4111-8111-111111111111', 'identity')$$,
  '42501');
select throws_ok($$select * from public.verification_records$$, '42501');
select throws_ok($$select private.initialize_member('22222222-2222-4222-8222-222222222222')$$,
  '42501');
reset role;

select private.initialize_member('22222222-2222-4222-8222-222222222222');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*)::int from public.member_private where user_id =
  '11111111-1111-4111-8111-111111111111'), 0, 'other user cannot read owner private data');
select is((select count(*)::int from public.profiles where user_id =
  '11111111-1111-4111-8111-111111111111'), 0, 'other user cannot read owner hidden profile');
select results_eq(
  $$with changed as (update public.member_private set residence_country_code = 'US'
    where user_id = '11111111-1111-4111-8111-111111111111' returning 1)
    select count(*)::int from changed$$,
  $$values (0)$$,
  'other user cannot update owner private data'
);
select results_eq(
  $$with changed as (update public.profiles set display_name = 'Impostor'
    where user_id = '11111111-1111-4111-8111-111111111111' returning 1)
    select count(*)::int from changed$$,
  $$values (0)$$,
  'other user cannot update owner public profile'
);
reset role;

select * from finish();
rollback;
