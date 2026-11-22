-- Combine explicit consent and account confirmation under the existing trust lock.
create function private.fv_confirm_member(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_expected integer,p_policy integer,
  p_request uuid,p_challenge uuid,p_confirmed boolean,p_disclose boolean,p_application uuid,p_revision integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  approved uuid;
  nonce uuid;
  at_time timestamptz;
  deadline timestamptz;
  receipt uuid;
  previous_state text;
  consent_receipt jsonb;
  accepting boolean := p_disclose is not null;
begin
  if p_request is null or p_expected is null or p_policy is null
    or (p_application is null)<>(p_revision is null)
    or (p_application is not null and (not accepting or p_revision<1))
    or (accepting and p_challenge is null)
    or not ((p_challenge is null and p_confirmed is null)
      or (p_challenge is not null and p_confirmed is true))
    then raise exception 'invalid confirmation command' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  perform private.s2b_lock_actor(p_actor,p_session);
  perform 1 from private.s2a_session_policy s where s.session_id=p_session for share;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'active member session required' using errcode='42501'; end if;

  select * into c from private.founder_identity_cases x
    where x.id=p_id and x.subject_id=p_actor for update;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  if c.version<>p_expected or c.policy_version<>p_policy
    then raise exception 'stale case' using errcode='O2004'; end if;
  approved:=private.fv_policy_for_member(c.subject_id,c.policy_version);
  if approved is null or c.conflicted or not (
    (c.state='consent_pending' and c.consent_at is null and (p_challenge is null or accepting))
    or (not accepting and c.state in ('proof_pending','ready_for_review','held')
      and c.consent_at is not null and c.consent_version=c.policy_version)
  ) then raise exception 'confirmation unavailable' using errcode='55000'; end if;
  at_time:=clock_timestamp();

  if p_challenge is null then
    nonce:=gen_random_uuid();
    deadline:=at_time+interval '2 minutes';
    insert into private.fv_member_challenges(case_id,subject_id,subject_session,case_version,
      deployment_policy_id,challenge_hash,issued_at,expires_at)
    values(c.id,p_actor,p_session,c.version,approved,sha256(uuid_send(nonce)),at_time,deadline)
    on conflict(case_id) do update set subject_id=excluded.subject_id,subject_session=excluded.subject_session,
      case_version=excluded.case_version,deployment_policy_id=excluded.deployment_policy_id,
      challenge_hash=excluded.challenge_hash,issued_at=excluded.issued_at,expires_at=excluded.expires_at;
    return jsonb_build_object('challenge',nonce,'expiresAt',deadline);
  end if;

  if (select count(*) from private.founder_identity_events where actor_id=p_actor and request_id is not null
    and occurred_at>at_time-interval '1 day') >= (case when accepting then 59 else 60 end)
    then raise exception 'command limit' using errcode='54000'; end if;
  delete from private.fv_member_challenges d
    where d.case_id=c.id and d.subject_id=p_actor and d.subject_session=p_session and d.case_version=c.version
      and d.deployment_policy_id=approved and d.challenge_hash=sha256(uuid_send(p_challenge))
      and d.expires_at>clock_timestamp() and (accepting or d.issued_at>=c.consent_at);
  if not found then raise exception 'confirmation expired or unavailable' using errcode='55000'; end if;

  -- The native consent command owns acceptance and optional closure consent. Any
  -- failure rolls back acceptance, proof, case revision and challenge consumption.
  if accepting then
    if p_application is null then
      consent_receipt:=private.founder_identity_command_for_api(p_actor,p_session,p_aal2,null,false,p_id,null,'consent',
        p_expected,p_policy,p_request,null,p_disclose,null);
    else
      consent_receipt:=public.founder_supersession_consent_for_api(p_actor,p_session,p_aal2,null,p_id,p_expected,p_policy,
        p_request,p_disclose,p_application,p_revision);
    end if;
    select * into strict c from private.founder_identity_cases x where x.id=p_id;
    if c.version is distinct from p_expected+1 or c.state<>'proof_pending'
      or c.consent_at is null or c.consent_version is distinct from c.policy_version
    then raise exception 'consent receipt unavailable' using errcode='55000'; end if;
    at_time:=clock_timestamp();
  end if;
  previous_state:=c.state;
  update private.founder_identity_cases x set version=x.version+1,updated_at=at_time,
    state=case when x.state='held' then 'held' else 'proof_pending' end where x.id=c.id returning * into c;

  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
  values(p_actor,c.id,c.authority_id,'account_control',previous_state,c.state,c.version,c.policy_version,
    case when accepting then gen_random_uuid() else p_request end,
    jsonb_strip_nulls(jsonb_build_object('action','account_control','method','session_confirmation',
      'version',p_expected,'consentAuditId',consent_receipt->>'auditId')),at_time)
  returning id into receipt;
  insert into private.founder_identity_controls(case_id,case_version,subject_session,confirmed_at,expires_at,event_id,confirmation_aal2)
    values(c.id,c.version,p_session,at_time,at_time+interval '10 minutes',receipt,coalesce(p_aal2,false));
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;
revoke all on function private.fv_confirm_member(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean,boolean,uuid,integer)
  from public,anon,authenticated,service_role;

create or replace function public.fv_member_confirmation_for_api(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_expected integer,p_policy integer,
  p_request uuid,p_challenge uuid,p_confirmed boolean
)
returns jsonb language sql security definer set search_path='' as $$
  select private.fv_confirm_member(p_actor,p_session,p_aal2,p_id,p_expected,p_policy,p_request,p_challenge,
    p_confirmed,null,null,null)
$$;
drop function private.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean);

create function public.fv_member_accept_and_confirm_for_api(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_expected integer,p_policy integer,
  p_request uuid,p_challenge uuid,p_confirmed boolean,p_disclose boolean,p_application uuid,p_revision integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_disclose is null then raise exception 'disclosure preference required' using errcode='23514'; end if;
  return private.fv_confirm_member(p_actor,p_session,p_aal2,p_id,p_expected,p_policy,p_request,p_challenge,
    p_confirmed,p_disclose,p_application,p_revision);
end;
$$;
revoke all on function public.fv_member_accept_and_confirm_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean,boolean,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.fv_member_accept_and_confirm_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean,boolean,uuid,integer)
  to service_role;
