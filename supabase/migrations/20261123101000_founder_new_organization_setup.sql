-- O4 uses this predicate for both the saved draft projection and completion.
-- The new branch relies on the committed platform bootstrap, not a profile badge.
create or replace function private.fv_ordinary_organization_identity(p_actor uuid,p_draft jsonb)
returns boolean language sql stable set search_path='' as $$
  select coalesce(
    p_draft->>'mode'='new'
    and p_draft->>'kind' in (
      'haitian_organization','international_organization','ngo','nonprofit','foundation',
      'business','education','media'
    )
    and private.institution_actor(p_actor)
    and (
      private.platform_founder(p_actor)
      or 'founder'=any(private.personal_identity_provenance(p_actor))
    ),
    false
  )
$$;

revoke all on function private.fv_ordinary_organization_identity(uuid,jsonb)
  from public,anon,authenticated,service_role;
