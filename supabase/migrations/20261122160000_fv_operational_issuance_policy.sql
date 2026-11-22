-- Add a standing policy scope without activating issuance or rewriting test policy history.
alter table private.fv_development_policies
  add column scope text not null default 'development_cohort',
  alter column expires_at drop not null,
  drop constraint fv_development_policies_tstzrange_excl,
  add constraint fv_policy_scope_window check (
    (scope='development_cohort' and expires_at is not null)
    or (scope='eligible_members' and expires_at is null)
  ),
  add constraint fv_cohort_policy_windows_excl
    exclude using gist (tstzrange(starts_at,expires_at,'[)') with &&) where (scope='development_cohort');

create unique index fv_single_unstopped_operating_policy on private.fv_development_policies(scope)
  where scope='eligible_members' and stopped_at is null;

create or replace function private.fv_active_policy()
returns private.fv_development_policies language sql stable set search_path='' as $$
  select p.* from private.fv_development_policies p
  where p.stopped_at is null and p.starts_at<=clock_timestamp()
    and private.platform_founder(p.approved_by) and private.institution_actor(p.approved_by)
    and (p.scope='eligible_members' or (
      p.expires_at>clock_timestamp() and not exists (
        select 1 from private.fv_development_policies standing
        where standing.scope='eligible_members' and standing.starts_at<=clock_timestamp()
      )
    ))
  limit 1
$$;

create or replace function private.fv_policy_for_member(p_user uuid,p_case_policy integer,p_method text default null)
returns uuid language sql stable set search_path='' as $$
  select p.id from private.fv_active_policy() p
  where p.case_policy=p_case_policy and p.proof_enabled and p.issuance_enabled
    and p.approved_by<>p_user
    and private.institution_actor(p_user)
    and (p_method is null or p_method=any(p.methods))
    and (p.scope='eligible_members' or exists(
      select 1 from private.fv_development_members m where m.policy_id=p.id and m.user_id=p_user
    ))
$$;

-- New proof always uses the current policy. Preserve an existing grant only when its
-- original policy actually authorized its subject, proof method and issuance time.
create or replace function private.personal_identity_provenance(p_subject uuid)
returns text[] language sql stable set search_path='' as $$
  select case when private.institution_actor(p_subject) then array_remove(array[
    case when 'identity'=any(private.reviewed_personal_claims(p_subject)) then 'independent' end,
    case when exists(select from private.founder_identity_grants g
      join private.founder_identity_cases c on c.id=g.case_id
      join private.founder_identity_proofs p on p.id=g.proof_id and p.case_id=c.id
      join private.fv_development_policies approved on approved.id=p.deployment_policy_id
      join private.founder_identity_controls r on r.case_id=c.id and r.case_version=p.bound_version
      cross join private.fv_active_policy() live
      where g.subject_id=p_subject and private.platform_founder(g.issuer_id)
        and c.state='granted' and not c.conflicted and c.consent_at is not null and c.consent_version=c.policy_version
        and live.id=private.fv_policy_for_member(p_subject,c.policy_version,p.method)
        and r.deployment_policy_id=approved.id and p.method=any(approved.methods) and p.consumed_at is not null
        and (approved.id=live.id or (
          live.scope='eligible_members' and approved.case_policy=c.policy_version
          and approved.approved_by=g.issuer_id and approved.proof_enabled and approved.issuance_enabled
          and p.confirmed_at>=approved.starts_at and p.consumed_at>=p.confirmed_at
          and (approved.stopped_at is null or p.consumed_at<approved.stopped_at)
          and (approved.scope='eligible_members' or (p.consumed_at<approved.expires_at and exists (
            select 1 from private.fv_development_members original
            where original.policy_id=approved.id and original.user_id=g.subject_id and original.recorded_at<=p.confirmed_at
          )))
        )))
    then 'founder' end],null) else array[]::text[] end
$$;

-- Serialize confirmation with authorized policy cutover and emergency stop, just as
-- the Founder workspace serializes the grant. Keep the existing service RPC contract.
alter function public.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  set schema private;
revoke all on function private.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

create function public.fv_member_confirmation_for_api(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_expected integer,p_policy integer,
  p_request uuid,p_challenge uuid,p_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  return private.fv_member_confirmation_for_api(
    p_actor,p_session,p_aal2,p_id,p_expected,p_policy,p_request,p_challenge,p_confirmed
  );
end;
$$;
revoke all on function public.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  to service_role;
