-- Founder-direct approval is separate from the ordinary reviewer predicate and vote count.
alter table private.institution_audit add column decision_reason text
  check (decision_reason is null or (event in ('founder_identity_approved','founder_identity_rejected')
    and char_length(btrim(decision_reason)) between 10 and 1000)),
  add column decision_policy_version integer check (decision_policy_version=1);
create unique index institution_founder_identity_once on private.institution_audit(subject_id)
  where event in ('founder_identity_approved','founder_identity_rejected');
create unique index institution_founder_identity_request on private.institution_audit(actor_id,request_id)
  where event in ('founder_identity_approved','founder_identity_rejected');

create function public.founder_blue_verification_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_workspace uuid,p_id uuid,p_expected integer,p_request uuid,p_reason text,p_no_conflict boolean,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.verification_applications;
  prior private.institution_audit;
  marked_at timestamptz;
  deciding boolean := p_request is not null;
  outcome text := case when p_decision='approve' then 'approved' else 'rejected' end;
  audit_event text := 'founder_identity_' || outcome;
begin
  if deciding then
    perform pg_advisory_xact_lock(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp_at,'read',null,p_workspace,'admin',null,null) is null
    then return null; end if;
  if not deciding then
    select * into a from private.verification_applications
      where id=p_id and kind='identity' and organization_id is null and status='pending';
    if not found or private.institution_conflicted(p_actor,a) or not private.institution_actor(a.applicant_id)
      then return null; end if;
    return jsonb_build_object('id',a.id,'revision',a.revision,'evidence',coalesce((
      select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id
    ),'[]'::jsonb));
  end if;
  if p_no_conflict is distinct from true or coalesce(char_length(btrim(p_reason)),0) not between 10 and 1000
    or p_expected is null or not coalesce(p_decision in ('approve','reject'),false) then raise exception 'invalid decision' using errcode='23514'; end if;

  select * into a from private.verification_applications where id=p_id and kind='identity'
    and organization_id is null for no key update;
  if not found or private.institution_conflicted(p_actor,a) then return null; end if;
  select * into prior from private.institution_audit where actor_id=p_actor and request_id=p_request
    and event in ('founder_identity_approved','founder_identity_rejected');
  if found then
    if prior.subject_id is distinct from p_id or prior.case_version is distinct from p_expected
      or prior.decision_reason is distinct from btrim(p_reason) or prior.event is distinct from audit_event
      then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('id',p_id,'status',outcome,'auditId',prior.id);
  end if;
  if a.status<>'pending' or a.revision<>p_expected or not private.institution_actor(a.applicant_id)
    or not exists(select from private.verification_evidence where application_id=a.id)
    then raise exception 'application unavailable' using errcode='55000'; end if;
  if exists (select from private.platform_claim_approval_holds h
      where h.application_id=a.id and h.lifted_at is null and h.expires_at>clock_timestamp())
    or exists (select from public.verification_records v where v.user_id=a.applicant_id and v.verification_type='identity'
      and (v.publication_held_at is not null or v.status='verified'))
    then raise exception 'identity decision unavailable' using errcode='O5003'; end if;

  marked_at:=clock_timestamp();
  insert into private.verification_reviews(application_id,reviewer_id,decision,rationale,created_at)
    values(a.id,p_actor,p_decision,btrim(p_reason),marked_at)
    on conflict(application_id,reviewer_id) where decision='approve' do nothing;
  if p_decision='approve' then
    insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at,review_application_id)
      values(a.applicant_id,'identity','verified',p_actor,marked_at,a.id)
      on conflict(user_id,verification_type) do update
        set status=excluded.status,reviewed_by=excluded.reviewed_by,verified_at=excluded.verified_at,
            review_application_id=excluded.review_application_id;
  end if;
  update private.verification_applications set status=outcome,decided_at=marked_at where id=a.id;
  insert into private.institution_audit(actor_id,subject_id,event,occurred_at,request_id,case_version,decision_reason,decision_policy_version)
    values(p_actor,a.id,audit_event,marked_at,p_request,p_expected,btrim(p_reason),1) returning * into prior;
  return jsonb_build_object('id',a.id,'status',outcome,'auditId',prior.id);
end;
$$;
revoke all on function public.founder_blue_verification_for_api(uuid,uuid,boolean,bigint,uuid,uuid,integer,uuid,text,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function public.founder_blue_verification_for_api(uuid,uuid,boolean,bigint,uuid,uuid,integer,uuid,text,boolean,text)
  to service_role;

-- Blue projects the same public badge for either review path. Sensitive eligibility
-- predicates continue to use the existing independent blue criteria.
create function private.independently_reviewed_personal_claims(p_actor uuid)
returns text[] language sql stable set search_path='' as $$
  select array(select claim from unnest(private.reviewed_personal_claims(p_actor)) claim
    where claim<>'identity' or not exists (
      select from public.verification_records v join private.institution_audit e on e.subject_id=v.review_application_id
      where v.user_id=p_actor and v.verification_type='identity' and e.event='founder_identity_approved'
    ))
$$;
revoke all on function private.independently_reviewed_personal_claims(uuid) from public,anon,authenticated,service_role;

create or replace function private.personal_identity_provenance(p_subject uuid)
returns text[] language sql stable set search_path='' as $$
  select case when private.institution_actor(p_subject) then array_remove(array[
    case when 'identity'=any(private.reviewed_personal_claims(p_subject)) then case when 'identity'=any(private.independently_reviewed_personal_claims(p_subject))
      then 'independent' else 'founder_direct_blue' end end,
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

create or replace function private.project_identity_state(p_actor uuid)
returns text language sql stable set search_path='' as $$
  select case
    when 'identity'=any(private.independently_reviewed_personal_claims(p_actor)) then 'verified'
    when exists(select 1 from private.verification_applications
      where applicant_id=p_actor and kind='identity' and status='pending') then 'pending'
    when exists(select 1 from public.verification_records where user_id=p_actor and verification_type='identity'
      and source='review' and (status='revoked' or publication_held_at is not null)) then 'revoked'
    else 'required'
  end;
$$;

create or replace function private.organization_setup_identity_eligible(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and (
    'identity'=any(private.independently_reviewed_personal_claims(p_actor))
    or (private.organization_setup_founder_parity_enabled() and private.organization_setup_founder_candidate(p_actor))
  )
$$;

create or replace function private.ambassador_public_eligible(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select 'identity'=any(private.independently_reviewed_personal_claims(p_user))
    and exists(select 1 from public.profiles p where p.user_id=p_user and feed_data.followable_member(p));
$$;

create or replace function private.f11_appointment_state(p private.platform_governance_proposals,i private.f1_appointment)
returns text language sql stable set search_path='' as $$
  select case
    when p.accepted_at is not null then 'activated'
    when p.withdrawn_at is not null then 'withdrawn'
    when i.closed_at<i.expires_at then 'unavailable'
    when p.expires_at<=statement_timestamp() or i.expires_at<=statement_timestamp() then 'expired'
    when i.closed_at is not null then 'unavailable'
    when not private.platform_founder(p.proposer_id) or not private.platform_admin(p.proposer_id)
      or p.governance_version<>(select version from private.platform_governance where singleton)
      or not private.institution_actor(p.target_id) or not private.verified_totp(p.target_id)
      or not ('identity'=any(private.independently_reviewed_personal_claims(p.target_id)))
      or exists(select 1 from public.role_assignments where user_id=p.target_id and role='administrator')
      then 'unavailable'
    else 'awaiting_acceptance'
  end;
$$;

create or replace function private.o5_proposal_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  g private.platform_governance;
  p private.platform_governance_proposals;
  target uuid;
  kind text := p_input->>'kind';
  reason text := p_input->>'reason';
  digest bytea := private.o5_digest('proposal',p_id,p_action,p_version,p_input);
  result jsonb;
  event_id uuid := gen_random_uuid();
begin
  if not coalesce(p_action in ('propose','approve','accept','withdraw','execute'),false)
    or not coalesce(p_version between 1 and 2147483646,false) or (p_id is null)<>(p_action='propose')
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>1536
    or p_input->'confirm' is distinct from 'true'::jsonb
    or (p_input - case p_action when 'propose' then array['confirm','reason','kind','target']
      when 'approve' then array['confirm','reason','noConflict'] when 'accept' then array['confirm']
      else array['confirm','reason'] end)<>'{}'::jsonb
    or (p_action<>'accept' and not coalesce(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]',false))
  then raise exception 'invalid proposal' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform private.o5_lock_actor(p_actor,p_session);
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_action<>'accept',true);
  select * into g from private.platform_governance where singleton for update;
  if p_action<>'propose' then
    select * into p from private.platform_governance_proposals where id=p_id for update;
    if not found or (p_action='accept' and p.target_id is distinct from p_actor)
      then raise exception 'proposal unavailable' using errcode='O2003'; end if;
  end if;
  result := private.o5_replay(p_actor,p_request,digest);
  if result is not null then return result; end if;

  if p_action='propose' then
    if not coalesce(kind in ('appoint','revoke','suspend','succession','distributed','recovery'),false)
      then raise exception 'invalid proposal' using errcode='23514'; end if;
    if kind='appoint' and not private.platform_founder(p_actor)
      then raise exception 'Founder authorization required' using errcode='42501'; end if;
    target := (p_input->>'target')::uuid;
    if (target is null)<>(kind in ('distributed','recovery')) or target=p_actor
      then raise exception 'access denied' using errcode='42501'; end if;
    if g.version<>p_version then raise exception 'stale governance' using errcode='O2004'; end if;
    if kind='distributed' and g.mode<>'bootstrap' then raise exception 'transition unavailable' using errcode='55000'; end if;
    if target is not null and not private.institution_actor(target) then raise exception 'target unavailable' using errcode='O2003'; end if;
    if kind in ('appoint','succession') and not ('identity'=any(private.independently_reviewed_personal_claims(target))
      and private.verified_totp(target)) then raise exception 'reviewed MFA account required' using errcode='PVE01'; end if;
    if kind in ('revoke','suspend') and not private.platform_admin(target)
      then raise exception 'administrator unavailable' using errcode='O2003'; end if;
    if exists(select 1 from private.platform_governance_proposals x where x.kind=(p_input->>'kind')
      and x.target_id is not distinct from target and x.withdrawn_at is null and x.expires_at>now())
    then raise exception 'proposal already pending' using errcode='55000'; end if;
    insert into private.platform_governance_proposals(proposer_id,target_id,kind,governance_version,authorization_mode)
      values(p_actor,target,kind,g.version,case when kind='appoint' then 'founder_direct' else 'independent' end)
      returning * into p;
  else
    if p.version<>p_version or p.governance_version<>g.version or p.withdrawn_at is not null or p.expires_at<=clock_timestamp()
      then raise exception 'stale proposal' using errcode='O2004'; end if;
    if p.authorization_mode='founder_direct'
      and (p_action in ('approve','accept') or (p_action='withdraw' and p.accepted_at is not null))
      then raise exception 'appointment action unavailable' using errcode='42501'; end if;
    if p_action='approve' then
      if p_input->'noConflict' is distinct from 'true'::jsonb or p_actor=p.proposer_id or p_actor=p.target_id
        or not private.platform_admin(p.proposer_id)
        then raise exception 'independent administrator required' using errcode='42501'; end if;
      if p.approved_at is not null then raise exception 'decision exists' using errcode='55000'; end if;
      if (p.kind in ('appoint','succession') and not ('identity'=any(private.independently_reviewed_personal_claims(p.target_id))
          and private.verified_totp(p.target_id))) or (p.kind in ('revoke','suspend') and not private.platform_admin(p.target_id))
        then raise exception 'target eligibility changed' using errcode='55000'; end if;
      update private.platform_governance_proposals set approver_id=p_actor,approved_at=clock_timestamp(),version=version+1
        where id=p.id returning * into p;
    elsif p_action='accept' then
      if p.kind not in ('appoint','succession') or p.approved_at is null
        or not private.platform_admin(p.proposer_id) or not private.platform_admin(p.approver_id)
        or not ('identity'=any(private.independently_reviewed_personal_claims(p_actor)) and private.verified_totp(p_actor))
        then raise exception 'acceptance unavailable' using errcode='42501'; end if;
      if p.accepted_at is not null then raise exception 'acceptance exists' using errcode='55000'; end if;
      update private.platform_governance_proposals set accepted_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
    elsif p_action='withdraw' then
      if p.proposer_id is distinct from p_actor then raise exception 'access denied' using errcode='42501'; end if;
      update private.platform_governance_proposals set withdrawn_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
    else
      if not exists(select 1 from private.platform_governance_authorities x where x.user_id=p_actor and x.revoked_at is null
        and x.starts_at<=now() and x.expires_at>now() and x.scope=case p.kind
          when 'recovery' then 'recovery_coordination' when 'distributed' then 'governance_transition' else 'administrator_continuity' end)
        then raise exception 'delegated authority required' using errcode='42501'; end if;
      -- Even a scoped authority cannot execute until an independently reviewed policy and recovery rehearsal exist.
      raise exception 'governance execution unavailable' using errcode='O5002';
    end if;
  end if;
  result := private.o5_proposal_card(p) || jsonb_build_object('receiptId',event_id);
  insert into private.platform_governance_events(id,scope,resource_id,actor_id,subject_id,action,version,reason,request_id,fingerprint,outcome)
    values(event_id,'proposal',p.id,p_actor,p.target_id,p_action,p.version,reason,p_request,digest,result);
  return result;
end
$$;

create or replace function public.f1_appointment_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_id uuid,p_action text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i private.f1_appointment;
  p private.platform_governance_proposals;
  decision_receipt private.platform_governance_events;
  state text;
  authorized boolean;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,false,p_action<>'status');
  if p_action='issue' then
    if not private.platform_founder(p_actor) or not private.platform_admin(p_actor) or p_hash is null then return null; end if;
    select * into p from private.platform_governance_proposals where id=p_id for update;
  else
    if p_action='revoke' then
      select * into i from private.f1_appointment where proposal_id=p_id and founder_id=p_actor for update;
    else
      select * into i from private.f1_appointment where id=p_id for update;
    end if;
    if not found or
      (case when p_action='revoke' then i.founder_id else i.target_id end) is distinct from p_actor then return null; end if;
    if p_action='revoke' then
      if i.closed_at is not null then return null; end if;
      if not private.platform_founder(p_actor) or not private.platform_admin(p_actor) then return null; end if;
      update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id;
      insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'revoked');
      return jsonb_build_object('revoked',true);
    end if;
    select * into p from private.platform_governance_proposals where id=i.proposal_id for update;
    if p.id is null or i.target_id is distinct from p.target_id or i.founder_id is distinct from p.proposer_id
      then return null; end if;
    if i.closed_at is null and i.expires_at<=clock_timestamp() then
      update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id returning * into i;
      insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'expired');
    end if;
    if p.authorization_mode='founder_direct' and p_action='status' then
      state:=private.f11_appointment_state(p,i);
      if state<>'awaiting_acceptance' then
        return jsonb_build_object('ready',false,'authorizationMode','founder_direct','state',state);
      end if;
    end if;
    if i.closed_at is not null or i.code_hash is null or i.attempts>=5 then return null; end if;
  end if;
  if p.id is null or p.kind<>'appoint' or not private.platform_founder(p.proposer_id)
    or not private.platform_admin(p.proposer_id) or p.withdrawn_at is not null or p.expires_at<=clock_timestamp()
    or p.governance_version<>(select version from private.platform_governance where singleton)
    or not private.institution_actor(p.target_id) or not private.verified_totp(p.target_id)
    or not ('identity'=any(private.independently_reviewed_personal_claims(p.target_id)))
    or exists(select 1 from public.role_assignments where user_id=p.target_id and role='administrator')
  then return null; end if;
  select * into decision_receipt from private.platform_governance_events
    where scope='proposal' and resource_id=p.id and action='propose' and version=1
      and actor_id=p.proposer_id and subject_id=p.target_id and reason is not null;
  authorized:=case when p.authorization_mode='founder_direct' then
      coalesce(decision_receipt.outcome->>'authorizationMode'='founder_direct',false)
    else p.approved_at is not null and p.approver_id is not null
      and p.approver_id not in (p.target_id,p.proposer_id) and coalesce(private.platform_admin(p.approver_id),false) end;
  if p_action='issue' then
    if p.proposer_id is distinct from p_actor or (p.authorization_mode='founder_direct' and not authorized)
      then return null; end if;
    insert into private.f1_appointment(proposal_id,target_id,founder_id,code_hash,expires_at)
      values(p.id,p.target_id,p_actor,decode(p_hash,'hex'),least(p.expires_at,clock_timestamp()+interval '24 hours'))
      on conflict(proposal_id) do nothing returning * into i;
    if not found then return null; end if;
    insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'issued');
    return jsonb_build_object('flowId',i.id,'expiresAt',i.expires_at);
  end if;
  if p_action='status' then
    return jsonb_build_object('ready',authorized) ||
      case when p.authorization_mode='founder_direct' then
        jsonb_build_object('authorizationMode','founder_direct',
          'state',case when authorized then 'awaiting_acceptance' else 'unavailable' end)
      else '{}'::jsonb end;
  end if;
  if p_action is distinct from 'activate' or not authorized or decision_receipt.id is null then return null; end if;
  if p_hash is distinct from encode(i.code_hash,'hex') then
    update private.f1_appointment set attempts=attempts+1,
      closed_at=case when attempts=4 then clock_timestamp() end,code_hash=case when attempts<4 then code_hash end where id=i.id;
    insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'rejected');
    return null;
  end if;
  insert into public.role_assignments(user_id,role,granted_by) values(p_actor,'administrator',p.proposer_id);
  insert into private.platform_admin_audit(actor_id,subject_id,event,role,reason) values(p.proposer_id,p_actor,'role_granted','administrator',decision_receipt.reason);
  update private.platform_governance_proposals set accepted_at=coalesce(accepted_at,clock_timestamp()),version=version+1
    where id=p.id returning * into p;
  update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id;
  insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'accepted'),(i.id,p_actor,'activated');
  if p.authorization_mode='founder_direct' then
    insert into private.platform_governance_events(scope,resource_id,actor_id,subject_id,action,version,outcome)
      values('proposal',p.id,p_actor,p_actor,'activate',p.version,
        jsonb_build_object('authorizationReceiptId',decision_receipt.id,'invitationId',i.id,'role','administrator'));
    return jsonb_build_object('activated',true,'authorizationMode','founder_direct');
  end if;
  return jsonb_build_object('activated',true);
end;
$$;

create or replace view private.a1a_audit_source as
select 'platform_admin'::text collate "C" as source, 'platform'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'account'::text as resource_type, subject_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case when event='role_revoked' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.platform_admin_audit
union all
select 'governance'::text collate "C" as source, 'governance'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, action as event_type,
  actor_id as actor_ref, 'proposal'::text as resource_type, resource_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, schema_version as source_version,
  request_id as request_ref, (case action when 'approve' then 'approved' when 'withdraw' then 'cancelled' else 'recorded' end)::text as outcome, (case when action='propose' and outcome->>'authorizationMode'='founder_direct' then 'founder' end)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.platform_governance_events where scope='proposal' and action in ('propose','approve','withdraw','accept','activate','execute')
union all
select 'session_policy'::text collate "C" as source, 'security'::text as category, id::text collate "C" as source_id,
  null::uuid as uuid_id, occurred_at as occurred_at, event as event_type,
  null::uuid as actor_ref, 'session_policy'::text as resource_type, null::uuid as resource_ref,
  null::uuid as organization_ref, user_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case event when 'expired' then 'expired' when 'revocation' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.s2a_session_events
union all
select 'session_security'::text collate "C" as source, 'security'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, action as event_type,
  actor_id as actor_ref, case when action in ('session_revoked','other_sessions_revoked') then 'session_policy' else 'private_workflow' end as resource_type, null::uuid as resource_ref,
  null::uuid as organization_ref, actor_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case action when 'workflow_cancelled' then 'cancelled' when 'session_revoked' then 'revoked' when 'other_sessions_revoked' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.s2b_security_events
union all
select 'username'::text collate "C" as source, 'identity'::text as category, id::text collate "C" as source_id,
  null::uuid as uuid_id, occurred_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'username'::text as resource_type, subject_id as resource_ref,
  null::uuid as organization_ref, subject_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  case when old_username is not null then jsonb_build_object('username',old_username) end as previous_state, case when new_username is not null then jsonb_build_object('username',new_username) end as new_state
from private.username_events where event in ('assigned','changed')
union all
select 'organization_role'::text collate "C" as source, 'organization'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'organization_role'::text as resource_type, role_id as resource_ref,
  organization_id as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case when event in ('revoked','role_deactivated','relationship_ended','ownership_ended') then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.organization_role_audit
union all
select 'verification'::text collate "C" as source, 'verification'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, decision as event_type,
  reviewer_id as actor_ref, 'verification_case'::text as resource_type, application_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.verification_reviews r
where not exists (select from private.institution_audit e
  where e.subject_id=r.application_id and e.actor_id=r.reviewer_id and e.occurred_at=r.created_at
    and e.event in ('founder_identity_approved','founder_identity_rejected'))
union all
select 'verification'::text collate "C", 'verification'::text, e.id::text collate "C",
  e.id, e.occurred_at, case e.event when 'founder_identity_approved' then 'founder_direct_regular_approval' else 'founder_direct_regular_rejection' end,
  e.actor_id, 'verification_case'::text, e.subject_id, null::uuid, null::uuid, e.decision_policy_version,
  e.request_id, case e.event when 'founder_identity_approved' then 'approved' else 'rejected' end, 'founder'::text,
  jsonb_build_object('status','pending'),
  jsonb_build_object('status',case e.event when 'founder_identity_approved' then 'approved' else 'rejected' end)
from private.institution_audit e where e.event in ('founder_identity_approved','founder_identity_rejected')
union all
select 'post_moderation'::text collate "C" as source, 'moderation'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, action as event_type,
  null::uuid as actor_ref, 'post'::text as resource_type, post_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from feed_data.post_moderation_actions a
where exists(select from feed_data.posts p where p.id=a.post_id and p.community_id is null)
union all
select 'comment_moderation'::text collate "C" as source, 'moderation'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, action as event_type,
  null::uuid as actor_ref, 'comment'::text as resource_type, comment_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from feed_data.comment_moderation_actions a
where exists(select from feed_data.comments c join feed_data.posts p on p.id=c.post_id
  where c.id=a.comment_id and p.community_id is null);
