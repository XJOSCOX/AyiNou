-- Keep the logo asset reference in the service-only list so the API can sign URLs in one batch.
create or replace function public.institution_accounts_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'organizations', coalesce((select jsonb_agg(private.institution_view(o) || jsonb_build_object('role',m.role,'expiresAt',m.expires_at) order by o.name)
      from private.organization_memberships m join private.organizations o on o.id = m.organization_id
      where m.user_id = p_actor and m.revoked_at is null and (m.expires_at is null or m.expires_at > now()) and o.status = 'active'), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'organizationName',o.name,'role',i.role,
      'expiresAt',i.expires_at,'termDays',i.term_days) order by i.created_at desc)
      from private.organization_invitations i join private.organizations o on o.id = i.organization_id
      where i.recipient_id = p_actor and i.state = 'pending' and i.expires_at > now() and o.status = 'active'), '[]'::jsonb),
    'canReview', private.institution_reviewer(p_actor)
  );
end;
$$;
