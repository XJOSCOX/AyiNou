-- The two operational gates remain closed. Disposable tests can enable them independently.
create function private.founder_identity_live_proof_enabled()
returns boolean language sql immutable set search_path='' as $$ select false $$;

create table private.founder_identity_controls (
  case_id uuid not null references private.founder_identity_cases(id) on delete restrict,
  case_version integer not null check(case_version>0),
  subject_session uuid not null,
  confirmed_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>confirmed_at and expires_at<=confirmed_at+interval '10 minutes'),
  event_id uuid not null unique references private.founder_identity_events(id) on delete restrict,
  primary key(case_id,case_version)
);
alter table private.founder_identity_controls enable row level security;
revoke all on private.founder_identity_controls from public,anon,authenticated,service_role;

alter table private.founder_identity_events drop constraint founder_identity_events_action_check,
  add constraint founder_identity_events_action_check check(action in (
    'authority_assigned','authority_revoked','open','consent','visibility','withdraw','proof_recorded',
    'grant','hold','release','revoke','deny','conflict','correction','supersede','account_control','attest'));
alter table private.founder_identity_proofs drop constraint founder_identity_proofs_method_check,
  add constraint founder_identity_proofs_method_check check(method in (
    'synthetic_identity_and_control','in_person_identity_check','live_video_identity_check'));

create function private.founder_identity_live_control(c private.founder_identity_cases,p_version integer)
returns boolean language sql stable set search_path='' as $$
  select exists(select from private.founder_identity_controls r
    where r.case_id=c.id and r.case_version=p_version and r.expires_at>clock_timestamp()
      and r.confirmed_at>=c.consent_at
      and public.account_session_for_api(c.subject_id,r.subject_session,true,true))
$$;

create function private.founder_identity_lock_control(c private.founder_identity_cases,p_version integer)
returns boolean language plpgsql set search_path='' as $$
declare subject_session uuid;
begin
  select r.subject_session into subject_session from private.founder_identity_controls r
    where r.case_id=c.id and r.case_version=p_version;
  perform 1 from auth.sessions s where s.id=subject_session and s.user_id=c.subject_id for share;
  if not found then return false; end if;
  perform 1 from private.s2a_session_policy p where p.session_id=subject_session for share;
  return private.founder_identity_live_control(c,p_version);
end;
$$;

-- Native case and proposal security remain authoritative. This proof command adds
-- a versioned subject receipt and an exact Founder attestation, never an identity document.
create function private.founder_identity_live_command(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
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
  if p_admin and not private.platform_founder(p_actor) then raise exception 'founder required' using errcode='42501'; end if;
  if p_request is null or p_expected is null or p_policy is null or not coalesce(
    (p_admin and p_action='attest' and p_basis in ('in_person_identity_check','live_video_identity_check')
      and private.platform_founder(p_actor)) or (not p_admin and p_action='account_control' and p_basis is null),false)
    then raise exception 'invalid proof command' using errcode='23514'; end if;
  select * into c from private.founder_identity_cases x where id=p_id
    and case when p_admin then x.reviewer_id=p_actor
      and x.authority_id=private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at)
      else x.subject_id=p_actor end for update;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  select * into prior from private.founder_identity_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.command is distinct from command then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',prior.id,'caseId',c.id,'version',prior.case_version);
  end if;
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
  if p_admin then
    select expires_at into deadline from private.founder_identity_controls where case_id=c.id and case_version=c.version;
    if not private.founder_identity_lock_control(c,c.version) or deadline<=at_time
      then raise exception 'current account-control receipt required' using errcode='55000'; end if;
    insert into private.founder_identity_proofs(case_id,subject_id,reviewer_id,policy_version,bound_version,method,confirmed_at,expires_at)
      values(c.id,c.subject_id,p_actor,c.policy_version,c.version,p_basis,at_time,deadline);
    select * into strict c from private.founder_identity_cases where id=c.id;
  else
    if p_totp_at<floor(extract(epoch from c.consent_at))::bigint
      then raise exception 'confirm after accepting' using errcode='O5001'; end if;
    update private.founder_identity_cases x set version=x.version+1,updated_at=at_time,
      state=case when x.state='held' then 'held' else 'proof_pending' end where x.id=c.id returning * into c;
  end if;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
    values(p_actor,c.id,c.authority_id,p_action,previous_state,c.state,c.version,c.policy_version,p_request,command,at_time)
    returning id into receipt;
  if not p_admin then
    insert into private.founder_identity_controls(case_id,case_version,subject_session,confirmed_at,expires_at,event_id)
      values(c.id,c.version,p_session,at_time,at_time+interval '10 minutes',receipt);
  end if;
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;

create function private.founder_identity_live_queue(payload jsonb)
returns jsonb language sql stable set search_path='' as $$
  select payload||jsonb_build_object('liveProofEnabled',private.founder_identity_policy_open() and private.founder_identity_live_proof_enabled(),
    'cases',coalesce((select jsonb_agg(item||jsonb_build_object('controlReady',private.founder_identity_live_control(c,c.version),
      'proofReady',coalesce((item->>'proofReady')::boolean,exists(select from private.founder_identity_proofs p
        where p.case_id=c.id and p.bound_version=c.version-1 and p.expires_at>clock_timestamp() and p.consumed_at is null)))
      order by position)
      from jsonb_array_elements(payload->'cases') with ordinality as entry(item,position)
      join private.founder_identity_cases c on c.id=(item->>'id')::uuid),'[]'::jsonb))
$$;

alter function public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean) rename to founder_identity_read_v1_for_api;
alter function public.founder_identity_read_v1_for_api(uuid,uuid,boolean,bigint,boolean) set schema private;
alter function public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean)
  rename to founder_identity_command_v1_for_api;
alter function public.founder_identity_command_v1_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean)
  set schema private;
revoke all on function private.founder_identity_read_v1_for_api(uuid,uuid,boolean,bigint,boolean),
  private.founder_identity_command_v1_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean)
  from public,anon,authenticated,service_role;

create function public.founder_identity_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_admin boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.founder_identity_live_queue(private.founder_identity_read_v1_for_api(p_actor,p_session,p_aal2,p_totp_at,p_admin))
$$;

create function public.founder_identity_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_username text,p_action text,p_expected integer,p_policy integer,p_request uuid,p_reason text,
  p_disclose boolean,p_no_conflict boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action='account_control' and p_admin is false then
    return private.founder_identity_live_command(p_actor,p_session,p_aal2,p_totp_at,false,p_id,p_expected,p_policy,
      p_request,p_action,null);
  end if;
  -- The legacy service entry cannot issue or release live grants without an original workspace.
  if p_admin and p_action in ('grant','release') and private.founder_identity_live_proof_enabled()
    then raise exception 'private workspace required' using errcode='42501'; end if;
  return private.founder_identity_command_v1_for_api(p_actor,p_session,p_aal2,p_totp_at,p_admin,p_id,p_username,p_action,
    p_expected,p_policy,p_request,p_reason,p_disclose,p_no_conflict);
end;
$$;

create function public.founder_identity_workspace_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_workspace uuid,p_id uuid,p_username text,p_action text,p_expected integer,p_policy integer,p_request uuid,p_reason text,
  p_no_conflict boolean,p_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  proof private.founder_identity_proofs;
  authority uuid;
  bootstrap_event uuid;
  is_founder boolean;
begin
  if p_action is distinct from 'read' then
    -- Use the same ordering as the underlying grant, regular review and restriction writers.
    perform pg_advisory_xact_lock(20261120,300);
    perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp_at,'read',null,p_workspace,'admin',null,null) is null
    then return null; end if;
  is_founder:=private.platform_founder(p_actor);
  authority:=private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at);
  if p_action='read' then
    if is_founder and authority is null then
      return private.founder_identity_live_queue(jsonb_build_object('cases','[]'::jsonb,
        'issuanceEnabled',private.founder_identity_policy_open(),'canIssue',true));
    end if;
    return private.founder_identity_live_queue(private.founder_identity_read_v1_for_api(p_actor,p_session,p_aal2,p_totp_at,true));
  end if;
  if p_action='open' and authority is null and is_founder then
    -- Preserve an explicit historical authority revocation as an operational stop.
    if exists(select from private.founder_identity_authorities where actor_id=p_actor)
      then raise exception 'existing authority needs operational review' using errcode='42501'; end if;
    select a.id into strict bootstrap_event from private.platform_admin_audit a join private.platform_bootstrap b
      on b.user_id=a.subject_id and a.occurred_at>=b.completed_at
      where b.user_id=p_actor and a.event='first_account_bootstrapped'
      order by a.occurred_at,a.id limit 1;
    insert into private.founder_identity_authorities(actor_id,scope,approval_ref,expires_at)
      values(p_actor,'founder_identity',bootstrap_event,'infinity');
  end if;
  if p_action='attest' then
    if p_no_conflict is distinct from true then raise exception 'conflict declaration required' using errcode='23514'; end if;
    return private.founder_identity_live_command(p_actor,p_session,p_aal2,p_totp_at,true,p_id,p_expected,p_policy,
      p_request,p_action,p_basis);
  end if;
  if p_action in ('grant','release') and private.founder_identity_live_proof_enabled() then
    if not is_founder then raise exception 'founder required' using errcode='42501'; end if;
    select * into c from private.founder_identity_cases where id=p_id and reviewer_id=p_actor for update;
    if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
    -- The original command verifies the complete fingerprint before returning a replay.
    if not exists(select from private.founder_identity_events where actor_id=p_actor and request_id=p_request) then
      if c.version is distinct from p_expected then raise exception 'stale case' using errcode='O2004'; end if;
      select * into proof from private.founder_identity_proofs where case_id=c.id and bound_version=c.version-1;
      if proof.id is null or proof.method='synthetic_identity_and_control'
        or not private.founder_identity_lock_control(c,proof.bound_version)
        then raise exception 'current account-control receipt required' using errcode='55000'; end if;
    end if;
  end if;
  return private.founder_identity_command_v1_for_api(p_actor,p_session,p_aal2,p_totp_at,true,p_id,p_username,p_action,
    p_expected,p_policy,p_request,p_reason,null,p_no_conflict);
end;
$$;

-- Separately report the provenance of ordinary identity eligibility for future
-- named consumers, without changing existing project, poll or governance gates.
create function private.personal_identity_provenance(p_subject uuid)
returns text[] language sql stable set search_path='' as $$
  select case when private.institution_actor(p_subject) then array_remove(array[
    case when 'identity'=any(private.reviewed_personal_claims(p_subject)) then 'independent' end,
    case when private.founder_identity_policy_open() and private.founder_identity_live_proof_enabled()
      and exists(select from private.founder_identity_grants g
        join private.founder_identity_cases c on c.id=g.case_id
        join private.founder_identity_proofs p on p.id=g.proof_id and p.case_id=c.id
        join private.founder_identity_controls r on r.case_id=c.id and r.case_version=p.bound_version
        where g.subject_id=p_subject and private.platform_founder(g.issuer_id)
          and c.state='granted' and not c.conflicted and c.consent_at is not null and c.consent_version=c.policy_version
          and p.method in ('in_person_identity_check','live_video_identity_check') and p.consumed_at is not null)
      then 'founder' end],null) else array[]::text[] end
$$;

create or replace function public.founder_identity_public_for_api(p_subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.founder_identity_policy_open() and private.institution_actor(p_subject) and exists(
    select from private.founder_identity_grants g join private.founder_identity_cases c on c.id=g.case_id
    where g.subject_id=p_subject and private.platform_founder(g.issuer_id) and c.state='granted' and not c.conflicted and c.disclose
      and c.consent_at is not null and c.consent_version=c.policy_version and c.policy_version=1
      and (not private.founder_identity_live_proof_enabled() or 'founder'=any(private.personal_identity_provenance(p_subject)))
  )
$$;

revoke all on function private.founder_identity_live_proof_enabled(),
  private.founder_identity_live_control(private.founder_identity_cases,integer),
  private.founder_identity_lock_control(private.founder_identity_cases,integer),
  private.founder_identity_live_command(uuid,uuid,boolean,bigint,boolean,uuid,integer,integer,uuid,text,text),
  private.founder_identity_live_queue(jsonb),private.personal_identity_provenance(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_identity_workspace_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,text,integer,integer,uuid,text,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_identity_workspace_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,text,integer,integer,uuid,text,boolean,text)
  to service_role;

-- Reuse each existing visibility boundary before adding an independently disclosed designation.
create or replace function feed_data.author_projection(p_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName',p.display_name,'username',p.username,
    'avatarPath',case when p.avatar_asset is not null then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'personalClaims',private.reviewed_personal_claims(p.user_id),
    'verified',exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id
      and v.status='verified' and v.verification_type in ('identity','notable_person'))
  ) || case when feed_data.viewer_can_interact(p.user_id) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end from public.profiles p
  where p.user_id=p_author and p.is_visible and p.display_name is not null
    and private.member_discoverable(p.user_id) and private.institution_actor(p_user=>p_author);
$$;

create or replace function feed_data.member_card(p public.profiles)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id','member:'||p.username,'kind','member','handle',p.username,'name',p.display_name,
    'personalClaims',private.reviewed_personal_claims(p.user_id),
    'verified',exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id and v.status='verified'
      and v.verification_type in ('identity','notable_person')),
    'following',exists(select 1 from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id),
    'self',coalesce(auth.uid()=p.user_id,false))
  || case when feed_data.followable_member(p) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end;
$$;

create or replace function public.institution_representatives_for_api(p_actor uuid,p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'representatives',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'displayName',p.display_name)
      || case when public.founder_identity_public_for_api(p.user_id) then jsonb_build_object('founderVerified',true)
        else '{}'::jsonb end order by p.username)
      from private.organization_memberships m join public.profiles p on p.user_id=m.user_id
      where m.organization_id=p_org and m.public_verified_rep and private.representative_verified(m)
        and feed_data.followable_member(p) and not feed_data.blocked_pair(p_actor,m.user_id)),'[]'::jsonb),
    'ownConsent',(select m.public_verified_rep from private.organization_memberships m
      join public.profiles p on p.user_id=m.user_id
      where m.organization_id=p_org and m.user_id=p_actor and m.revoked_at is null
        and private.representative_verified(m) and (m.public_verified_rep or feed_data.followable_member(p))));
end;
$$;
