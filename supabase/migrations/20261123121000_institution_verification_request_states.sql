-- Report institution-wide and current-membership request states independently.
-- Keep this separate from the limited, applicant-only history.
create or replace function public.verification_workspace_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'applications',public.verification_own_for_api(p_actor),
    'personalRequests',jsonb_build_object(
      'identity',private.personal_verification_request_state(p_actor,'identity'),
      'notable_person',private.personal_verification_request_state(p_actor,'notable_person')
    ),
    'institutionRequests',coalesce((
      select jsonb_object_agg(o.id,jsonb_build_object(
        'institution',case
          when o.verification_status='verified' or a.status='approved' then 'already_verified'
          when a.status='pending' then 'pending'
          else 'available'
        end,
        'representative',case
          when r.status='approved' then 'already_verified'
          when r.status='pending' then 'pending'
          else 'available'
        end
      ))
      from private.organization_memberships m
      join private.organizations o on o.id=m.organization_id and o.status='active'
      left join private.verification_applications a on a.organization_id=o.id
        and a.kind in ('organization','government') and a.status in ('pending','approved')
      left join private.verification_applications r on r.membership_id=m.id
        and r.kind='representative' and r.status in ('pending','approved')
      where m.user_id=p_actor and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
    ),'{}'::jsonb)
  )
$$;
