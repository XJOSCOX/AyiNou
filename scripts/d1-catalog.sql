-- Catalog metadata and definition fingerprints only. Run with supabase db query --read-only.
with relations(schema_name, relation_name) as (
  values ('auth','users'), ('auth','sessions'), ('auth','mfa_factors'),
    ('public','profiles'), ('public','role_assignments'), ('public','verification_records'),
    ('private','organizations'), ('private','organization_memberships'), ('private','organization_invitations'),
    ('private','organization_custom_roles'), ('private','institution_audit'), ('private','verification_applications'),
    ('private','community_projects'), ('private','polls'), ('private','poll_ballots'),
    ('private','account_restrictions'), ('private','legal_publication_settings'),
    ('private','organization_onboarding_intents'), ('private','founder_identity_cases'),
    ('private','platform_governance'), ('private','early_partner_programs')
), tables as (
  select r.*, c.oid, c.relrowsecurity from relations r
  left join pg_namespace n on n.nspname=r.schema_name
  left join pg_class c on c.relnamespace=n.oid and c.relname=r.relation_name and c.relkind='r'
), routines as (
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
    md5(replace(pg_get_functiondef(p.oid), chr(13), '')) as digest, p.prosecdef as definer, p.proconfig as settings,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and p.prokind='f' and p.proname in (
    'account_session_active','account_session_for_api','live_account_session',
    'institution_actor','institution_role','institution_save_for_api','institution_resolve_invite_for_api','verification_submit_for_api',
    'verification_decide_for_api','organization_intent_for_api','organization_intent_command_for_api',
    'organization_setup_command_for_api','organization_setup_identity_eligible','platform_admin',
    'poll_vote_for_client','founder_identity_policy_open','o5_lock_actor','early_partner_command_for_api')
)
select jsonb_build_object(
  'read_only', current_setting('transaction_read_only'), 'server_version', current_setting('server_version'),
  'extensions', (select jsonb_object_agg(extname, extversion) from pg_extension),
  'history', (select jsonb_object_agg(version, md5(replace(array_to_string(statements,chr(10)),chr(13),'')))
    from supabase_migrations.schema_migrations),
  'relations', (select jsonb_object_agg(t.schema_name || '.' || t.relation_name, jsonb_build_object(
    'exists', t.oid is not null, 'rls', t.relrowsecurity,
    'columns', (select jsonb_object_agg(a.attname, jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull))
      from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_object_agg(c.conname,md5(pg_get_constraintdef(c.oid))) from pg_constraint c where c.conrelid=t.oid),
    'indexes', (select jsonb_object_agg(i.indexrelid::regclass::text, md5(pg_get_indexdef(i.indexrelid))) from pg_index i where i.indrelid=t.oid),
    'policies', (select jsonb_object_agg(p.polname, md5(concat_ws('|',p.polcmd,p.polpermissive,
      pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid),
      (select string_agg(coalesce(r.rolname,'PUBLIC'), ',' order by coalesce(r.rolname,'PUBLIC'))
        from unnest(p.polroles) role_id left join pg_roles r on r.oid=role_id))))
      from pg_policy p where p.polrelid=t.oid),
    'grants', (select jsonb_object_agg(role_name,jsonb_build_array(
      has_table_privilege(role_name,t.oid,'SELECT'),has_table_privilege(role_name,t.oid,'INSERT'),
      has_table_privilege(role_name,t.oid,'UPDATE'),has_table_privilege(role_name,t.oid,'DELETE')))
      from unnest(array['anon','authenticated','service_role']) role_name where t.oid is not null)
  )) from tables t),
  'routines', (select jsonb_object_agg(nspname || '.' || proname || '(' || args || ')', to_jsonb(routines)) from routines),
  'auth_user_triggers', (select jsonb_object_agg(tgname, jsonb_build_array(tgenabled, md5(pg_get_triggerdef(oid)),
      md5(replace(pg_get_functiondef(tgfoid), chr(13), ''))))
    from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal)
) as evidence;
