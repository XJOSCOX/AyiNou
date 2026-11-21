-- Read-only D2 development postflight. Catalog and aggregate fingerprints, never individual rows.
with retained(source,records,identity_digest) as (
  select 'auth_users',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from auth.users
  union all select 'role_assignments',count(*),md5(coalesce(string_agg(user_id::text||'/'||role,',' order by user_id,role),'')) from public.role_assignments
  union all select 'profiles',count(*),md5(coalesce(string_agg(user_id::text,',' order by user_id),'')) from public.profiles
  union all select 'verification_records',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from public.verification_records
  union all select 'organizations',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from private.organizations
  union all select 'organization_memberships',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from private.organization_memberships
  union all select 'verification_applications',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from private.verification_applications
  union all select 'posts',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from feed_data.posts
  union all select 'projects',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from private.community_projects
  union all select 'polls',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from private.polls
  union all select 'storage_objects',count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from storage.objects
), private_tables as (
  select c.* from pg_class c where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname ~
    '^(organization_signup_choices|organization_onboarding_|founder_identity_|onboarding_corrections|platform_governance|platform_claim_approval_holds|early_partner_)'
), organization_rpcs as (
  select p.* from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~
    '^(organization_intent|organization_setup|institution_registration|founder_identity|o5_|early_partner_).*_for_api$'
), closed_definitions as (
  select p.proname, regexp_replace(lower(p.prosrc),'[[:space:];]','','g')='selectfalse' as closed
  from pg_proc p where p.oid in ('private.founder_identity_policy_open()'::regprocedure,
    'private.organization_setup_founder_parity_enabled()'::regprocedure,'private.early_partner_synthetic_gate(uuid)'::regprocedure)
)
select jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'retained',(select jsonb_object_agg(source,jsonb_build_array(records,identity_digest)) from retained),
 'private_tables',(select count(*) from private_tables),
 'unsafe_tables',(select count(*) from private_tables t where not t.relrowsecurity or exists (
   select 1 from unnest(array['anon','authenticated','service_role']) r
   where has_table_privilege(r,t.oid,'select,insert,update,delete,truncate,references,trigger'))),
 'organization_rpcs',(select count(*) from organization_rpcs),
 'unsafe_rpcs',(select count(*) from organization_rpcs p where not p.prosecdef
   or not coalesce('search_path=""'=any(p.proconfig),false)
   or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
   or not has_function_privilege('service_role',p.oid,'execute')),
 'closed_definitions',(select jsonb_object_agg(proname,closed) from closed_definitions),
 'governance_bootstrap',(select count(*)=1 and bool_and(mode='bootstrap' and recovery_until is null) from private.platform_governance),
 'governance_authorities',(select count(*) from private.platform_governance_authorities),
 'founder_authorities',(select count(*) from private.founder_identity_authorities),
 'early_partner_programs',(select count(*) from private.early_partner_programs),
 'enabled_legal_policies',(select count(*) from private.legal_policy_settings where enabled and state='published'),
 'legal_global_enabled',exists(select 1 from private.legal_publication_settings where enabled and not suspended),
 'privacy_intake_fixtures',(select count(*) from private.privacy_intake_fixtures),
 'new_intents',(select count(*) from private.organization_onboarding_intents),
 'new_receipts',(select count(*) from private.organization_onboarding_receipts)
) as evidence;
