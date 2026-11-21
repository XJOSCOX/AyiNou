-- Aggregate data-fit evidence only. Intended for the pre-O2 baseline and postflight.
select jsonb_build_object(
  'read_only', current_setting('transaction_read_only'),
  'accounts', (select count(*) from auth.users),
  'institutions', (select count(*) from private.organizations),
  'active_institutions_without_owner', (select count(*) from private.organizations o where o.status='active'
    and not exists(select 1 from private.organization_memberships m where m.organization_id=o.id and m.role='owner' and m.revoked_at is null)),
  'active_owner_grants', (select count(*) from private.organization_memberships where role='owner' and revoked_at is null),
  'duplicate_active_owners', (select count(*) from (
    select organization_id from private.organization_memberships where role='owner' and revoked_at is null
    group by organization_id having count(*)>1
  ) d),
  'representative_grants_by_role', (select jsonb_object_agg(role,total) from (
    select role,count(*) as total from private.organization_memberships where revoked_at is null and (expires_at is null or expires_at>now())
    group by role
  ) r),
  'verification_applications', (select count(*) from private.verification_applications),
  'pending_claims', (select count(*) from private.verification_applications where kind='claim' and status='pending'),
  'projects', (select count(*) from private.community_projects),
  'polls', (select count(*) from private.polls),
  'electorate_rows', (select count(*) from private.poll_electorate),
  'restrictions', (select count(*) from private.account_restrictions),
  'administrator_assignments', (select count(*) from public.role_assignments where role='administrator'),
  'legal_global_enabled', exists (select 1 from private.legal_publication_settings where enabled and not suspended),
  'enabled_published_policies', (select count(*) from private.legal_policy_settings where enabled and state='published'),
  'privacy_synthetic_fixtures', (select count(*) from private.privacy_intake_fixtures)
) as evidence;
