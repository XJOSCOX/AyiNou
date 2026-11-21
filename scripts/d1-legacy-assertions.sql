-- Disposable only. Use after the full chain on the same isolated database as d1-legacy-fixture.sql.
do $$
declare
  owner_id constant uuid := 'd1000000-0000-4000-8000-000000000001';
  editor_id constant uuid := 'd1000000-0000-4000-8000-000000000002';
  org_id constant uuid := 'd1000000-0000-4000-8000-000000000003';
begin
  if (select max(version) from supabase_migrations.schema_migrations where version <= '20261121070000') <> '20261121070000'
    or (select count(*) from supabase_migrations.schema_migrations where version between '20261121020000' and '20261121070000') <> 6
    or not exists (select 1 from private.organizations where id=org_id and handle='d1-disposable-legacy'
      and created_by=owner_id and claimed_registration_status='unknown' and registration_version=0)
    or private.institution_role(owner_id,org_id) is distinct from 'owner'
    or private.institution_role(editor_id,org_id) is distinct from 'editor'
  then raise exception 'D1 legacy records or authority changed'; end if;

  begin
    perform public.institution_save_for_api(owner_id,null,'{"name":"D1 legacy route creation"}'::jsonb);
    raise exception 'Legacy create did not deny';
  exception when sqlstate 'O4001' then null;
  end;

  perform public.institution_save_for_api(owner_id,org_id,'{"description":"D1 existing owner still authorized"}'::jsonb);
  if not exists (select 1 from private.organizations where id=org_id and description='D1 existing owner still authorized')
    or not exists (select 1 from private.institution_audit where organization_id=org_id and actor_id=owner_id and event='organization_updated')
    or private.founder_identity_policy_open()
    or private.organization_setup_founder_parity_enabled()
    or exists (select 1 from private.early_partner_programs)
    or exists (select 1 from private.platform_governance where mode<>'bootstrap' or recovery_until is not null)
    or exists (select 1 from private.platform_governance_authorities)
    or (public.legal_availability_for_api()->>'enabled')::boolean
  then raise exception 'D1 owner audit or closed gate check failed'; end if;
end
$$;
