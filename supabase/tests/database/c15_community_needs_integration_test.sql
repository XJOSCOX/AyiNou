begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select ok((select count(*)=17 and bool_and(c.relrowsecurity)
  from pg_class c
  where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname ~ '^c1[1-4]_'), 'private relations have RLS');

select ok((select count(*)=0 from pg_class c
  cross join unnest(array['anon','authenticated','authenticator','service_role']) r(role)
  where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname ~ '^c1[1-4]_'
    and (has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))),
  'no direct table or column privileges on Community Needs relations');

select ok((select count(*)=4 and bool_and(p.prosecdef)
  and bool_and(has_function_privilege('service_role',p.oid,'EXECUTE'))
  and not bool_or(has_function_privilege('anon',p.oid,'EXECUTE')
    or has_function_privilege('authenticated',p.oid,'EXECUTE')
    or has_function_privilege('authenticator',p.oid,'EXECUTE'))
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
    ('c11_needs_for_api','c12_needs_for_api','c13_publication_for_api','c14_links_for_api')),
  'all four API entry points are service-only');

select throws_ok($$select public.c11_needs_for_api(null,null,false,'list',null,null,null,null,null,null)$$,
  'C1101','intake disabled','closed intake rejects direct calls');
select throws_ok($$select public.c12_needs_for_api(null,null,false,null,null,'member',null,null,null)$$,
  'C1201','review disabled','closed review rejects direct calls');
select throws_ok($$select public.c13_publication_for_api(null,null,false,null,null,'directory',null,null,null,null,null)$$,
  'C1301','publication disabled','closed publication rejects direct calls');
select throws_ok($$select public.c14_links_for_api(null,null,false,null,null,'publication',null,null,null)$$,
  'C1401','association disabled','closed association rejects direct calls');

select * from finish();
rollback;
