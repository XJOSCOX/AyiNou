-- Use the same live submission rule for the member workspace and its command.
-- Existing application records remain authoritative and do not need backfilling.
create function private.personal_verification_request_state(p_actor uuid,p_kind text)
returns text language sql stable set search_path='' as $$
  select case
    when (p_kind='identity' and 'founder'=any(private.personal_identity_provenance(p_actor)))
      or p_kind=any(private.reviewed_personal_claims(p_actor))
      or exists (
        select from private.verification_applications a
        where a.applicant_id=p_actor and a.organization_id is null and a.kind=p_kind and a.status='approved'
      ) then 'already_verified'
    when exists (
      select from private.verification_applications a
      where a.applicant_id=p_actor and a.organization_id is null and a.status='pending'
    ) then 'pending'
    else 'available'
  end
$$;
revoke all on function private.personal_verification_request_state(uuid,text) from public,anon,authenticated,service_role;

create function public.verification_workspace_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'applications',public.verification_own_for_api(p_actor),
    'personalRequests',jsonb_build_object(
      'identity',private.personal_verification_request_state(p_actor,'identity'),
      'notable_person',private.personal_verification_request_state(p_actor,'notable_person')
    )
  )
$$;
revoke all on function public.verification_workspace_for_api(uuid) from public,anon,authenticated,service_role;
grant execute on function public.verification_workspace_for_api(uuid) to service_role;

create or replace function public.verification_submit_for_api(p_actor uuid,p_org uuid,p_kind text,p_evidence text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare
  request_state text;
begin
  if p_kind='claim' then raise exception 'use organization setup' using errcode='O4001'; end if;
  if p_org is null and p_kind in ('identity','notable_person') then
    -- Personal verification decisions and Founder grants use this same trust lock.
    -- Acquire it ahead of the existing actor lock to serialize requests and decisions.
    perform pg_advisory_xact_lock(20261120,300);
    if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
    request_state:=private.personal_verification_request_state(p_actor,p_kind);
    if request_state='pending' then raise exception 'personal request pending' using errcode='PV120'; end if;
    if request_state='already_verified' then raise exception 'verification already held' using errcode='PV121'; end if;
  end if;
  return private.verification_submit_for_api(p_actor,p_org,p_kind,p_evidence);
end
$$;
