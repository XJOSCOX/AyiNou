-- Disposable only. A guard checks the unpublished L6.2A baseline before inserting synthetic rows.
do $$
begin
  if current_database() <> 'postgres'
    or (select max(version) from supabase_migrations.schema_migrations) <> '20261121010000'
    or exists (select 1 from auth.users)
  then raise exception 'D1 requires a fresh disposable baseline'; end if;
end
$$;
insert into auth.users(id,email,email_confirmed_at)
values ('d1000000-0000-4000-8000-000000000001','d1-owner@example.invalid',now()),
  ('d1000000-0000-4000-8000-000000000002','d1-editor@example.invalid',now());
insert into private.organizations(id,handle,name,kind,country_code,created_by)
values ('d1000000-0000-4000-8000-000000000003','d1-disposable-legacy','D1 disposable legacy institution',
  'nonprofit','HT','d1000000-0000-4000-8000-000000000001');
insert into private.organization_memberships(organization_id,user_id,role)
values ('d1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','owner'),
  ('d1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000002','editor');
