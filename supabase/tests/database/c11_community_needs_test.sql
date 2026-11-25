begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select ok(not exists(select from private.c11_intake_fixture), 'database has no intake activation row');
select ok(not has_function_privilege('anon','public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)','execute'), 'anonymous RPC denied');
select ok(not has_function_privilege('authenticated','public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)','execute'), 'member RPC denied');
select ok(has_function_privilege('service_role','public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)','execute'), 'backend RPC allowed');
select ok(not has_table_privilege('service_role','private.c11_need_revisions','select'), 'service cannot read history directly');
select ok(not has_table_privilege('authenticated','private.c11_needs','select'), 'member cannot read need table directly');
select ok((select relrowsecurity from pg_class where oid='private.c11_needs'::regclass), 'needs enforce a row boundary');
select ok((select relrowsecurity from pg_class where oid='private.c11_need_revisions'::regclass), 'history enforces a row boundary');
select throws_ok($$select public.c11_needs_for_api(null,null,false,'list',null,null,null,null,null,null)$$,
  'C1101', 'intake disabled', 'database fails closed even for a direct call');

select * from finish();
rollback;
