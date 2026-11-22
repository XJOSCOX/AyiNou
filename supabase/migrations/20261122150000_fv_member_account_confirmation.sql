-- Permit ordinary authenticated sessions to complete a single explicit, scoped member confirmation.
create table private.fv_member_challenges (
  case_id uuid primary key references private.founder_identity_cases(id) on delete restrict,
  subject_id uuid not null references auth.users(id) on delete restrict,
  subject_session uuid not null,
  case_version integer not null check(case_version>0),
  deployment_policy_id uuid not null references private.fv_development_policies(id) on delete restrict,
  challenge_hash bytea not null check(octet_length(challenge_hash)=32),
  issued_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>issued_at and expires_at<=issued_at+interval '2 minutes')
);
alter table private.fv_member_challenges enable row level security;
revoke all on private.fv_member_challenges from public,anon,authenticated,service_role;

-- NULL identifies the pre-existing authenticator-backed receipts, whose checks remain in force.
alter table private.founder_identity_controls add column confirmation_aal2 boolean;

create or replace function private.founder_identity_live_control(c private.founder_identity_cases,p_version integer)
returns boolean language sql stable set search_path='' as $$
  select exists(select from private.founder_identity_controls r
    where r.case_id=c.id and r.case_version=p_version and r.expires_at>clock_timestamp()
      and r.confirmed_at>=c.consent_at
      and r.deployment_policy_id=private.fv_policy_for_member(c.subject_id,c.policy_version)
      and public.account_session_for_api(c.subject_id,r.subject_session,
        coalesce(r.confirmation_aal2,true),r.confirmation_aal2 is null))
$$;

create function public.fv_member_confirmation_for_api(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_id uuid,p_expected integer,p_policy integer,
  p_request uuid,p_challenge uuid,p_confirmed boolean
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
begin
  if p_request is null or p_expected is null or p_policy is null
    or not ((p_challenge is null and p_confirmed is null)
      or (p_challenge is not null and p_confirmed is true))
    then raise exception 'invalid confirmation command' using errcode='23514'; end if;
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
  if approved is null or c.state not in ('proof_pending','ready_for_review','held') or c.conflicted
    or c.consent_at is null or c.consent_version is distinct from c.policy_version
    then raise exception 'confirmation unavailable' using errcode='55000'; end if;
  at_time:=clock_timestamp();

  if p_challenge is null then
    -- At most one outstanding challenge per case. A newer request invalidates the previous nonce.
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
    and occurred_at>at_time-interval '1 day')>=60
    then raise exception 'command limit' using errcode='54000'; end if;
  delete from private.fv_member_challenges d
    where d.case_id=c.id and d.subject_id=p_actor and d.subject_session=p_session and d.case_version=c.version
      and d.deployment_policy_id=approved and d.challenge_hash=sha256(uuid_send(p_challenge))
      and d.expires_at>clock_timestamp() and d.issued_at>=c.consent_at;
  if not found then raise exception 'confirmation expired or unavailable' using errcode='55000'; end if;
  previous_state:=c.state;
  update private.founder_identity_cases x set version=x.version+1,updated_at=at_time,
    state=case when x.state='held' then 'held' else 'proof_pending' end where x.id=c.id returning * into c;

  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
  values(p_actor,c.id,c.authority_id,'account_control',previous_state,c.state,c.version,c.policy_version,p_request,
    jsonb_build_object('action','account_control','method','session_confirmation','version',p_expected),at_time)
  returning id into receipt;

  insert into private.founder_identity_controls(case_id,case_version,subject_session,confirmed_at,expires_at,event_id,confirmation_aal2)
    values(c.id,c.version,p_session,at_time,at_time+interval '10 minutes',receipt,coalesce(p_aal2,false));
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;

revoke all on function public.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.fv_member_confirmation_for_api(uuid,uuid,boolean,uuid,integer,integer,uuid,uuid,boolean)
  to service_role;


-- Keep Founder attestation on the original MFA and private workspace path.
create or replace function private.founder_identity_live_command(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_expected integer,p_policy integer,p_request uuid,p_action text,p_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  prior private.founder_identity_events;
  receipt uuid;
  at_time timestamptz;
  deadline timestamptz;
  previous_state text;
  command jsonb:=jsonb_build_object('action',p_action,'case',p_id,'version',p_expected,'policy',p_policy,'basis',p_basis);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  perform private.s2b_lock_actor(p_actor,p_session);
  if not private.founder_identity_policy_open() or not private.founder_identity_live_proof_enabled()
    then raise exception 'proof workflow closed' using errcode='55000'; end if;
  if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp_at),false)
    then raise exception 'recent authenticator verification required' using errcode='O5001'; end if;
  if p_admin is distinct from true or not private.platform_founder(p_actor) then raise exception 'founder required' using errcode='42501'; end if;
  if p_request is null or p_expected is null or p_policy is null or not coalesce(
    p_action='attest' and p_basis in ('in_person_identity_check','live_video_identity_check'),false)
    then raise exception 'invalid proof command' using errcode='23514'; end if;
  select * into c from private.founder_identity_cases x where id=p_id
    and x.reviewer_id=p_actor
    and x.authority_id=private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at) for update;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  select * into prior from private.founder_identity_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.command is distinct from command then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',prior.id,'caseId',c.id,'version',prior.case_version);
  end if;
  if private.fv_policy_for_member(c.subject_id,c.policy_version,p_basis) is null
    then raise exception 'member outside the approved development policy' using errcode='55000'; end if;
  if c.version<>p_expected or c.policy_version<>p_policy then raise exception 'stale case' using errcode='O2004'; end if;
  if c.state not in ('proof_pending','ready_for_review','held') or c.conflicted
    or c.consent_at is null or c.consent_version is distinct from c.policy_version
    or not private.institution_actor(c.subject_id)
    then raise exception 'proof unavailable' using errcode='55000'; end if;
  if (select count(*) from private.founder_identity_events where actor_id=p_actor and request_id is not null
    and occurred_at>clock_timestamp()-interval '1 day')>=60
    then raise exception 'command limit' using errcode='54000'; end if;
  at_time:=clock_timestamp();
  previous_state:=c.state;
  select expires_at into deadline from private.founder_identity_controls where case_id=c.id and case_version=c.version;
  if not private.founder_identity_lock_control(c,c.version) or deadline<=at_time
    then raise exception 'current account-control receipt required' using errcode='55000'; end if;
  insert into private.founder_identity_proofs(case_id,subject_id,reviewer_id,policy_version,bound_version,method,confirmed_at,expires_at)
    values(c.id,c.subject_id,p_actor,c.policy_version,c.version,p_basis,at_time,deadline);
  select * into strict c from private.founder_identity_cases where id=c.id;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
    values(p_actor,c.id,c.authority_id,p_action,previous_state,c.state,c.version,c.policy_version,p_request,command,at_time)
    returning id into receipt;
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;

create or replace function public.founder_identity_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_username text,p_action text,p_expected integer,p_policy integer,p_request uuid,p_reason text,
  p_disclose boolean,p_no_conflict boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action='account_control' and p_admin is false then
    raise exception 'session challenge required' using errcode='23514';
  end if;
  -- The legacy service entry cannot issue or release live grants without an original workspace.
  if p_admin and p_action in ('grant','release') and private.founder_identity_live_proof_enabled()
    then raise exception 'private workspace required' using errcode='42501'; end if;
  return private.founder_identity_command_v1_for_api(p_actor,p_session,p_aal2,p_totp_at,p_admin,p_id,p_username,p_action,
    p_expected,p_policy,p_request,p_reason,p_disclose,p_no_conflict);
end;
$$;

create or replace function private.founder_identity_live_queue(payload jsonb)
returns jsonb language sql stable set search_path='' as $$
  select payload||jsonb_build_object('liveProofEnabled',private.founder_identity_policy_open() and private.founder_identity_live_proof_enabled(),
    'cases',coalesce((select jsonb_agg(item||jsonb_build_object('controlReady',private.founder_identity_live_control(c,c.version),
      'liveEligible',private.fv_policy_for_member(c.subject_id,c.policy_version) is not null,
      'appealStatus',(select a.outcome from private.fv_founder_appeals a where a.case_id=c.id),
      'appealRef',(select a.id from private.fv_founder_appeals a where a.case_id=c.id),
      'memberHistory',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'occurredAt',e.occurred_at) order by e.occurred_at desc,e.id)
        from (select action,occurred_at,id from private.founder_identity_events where case_id=c.id order by occurred_at desc,id limit 25) e),'[]'),
      'proofReady',case when private.founder_identity_live_proof_enabled() then exists(select from private.founder_identity_proofs p
        where p.case_id=c.id and p.bound_version=c.version-1 and p.expires_at>clock_timestamp()
          and p.consumed_at is null and private.founder_identity_live_control(c,p.bound_version))
        else coalesce((item->>'proofReady')::boolean,false) end)
      order by position)
      from jsonb_array_elements(payload->'cases') with ordinality as entry(item,position)
      join private.founder_identity_cases c on c.id=(item->>'id')::uuid),'[]'::jsonb))
$$;
