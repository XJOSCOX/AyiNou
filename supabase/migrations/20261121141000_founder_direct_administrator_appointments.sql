-- Direct authorization is recorded only for new Founder appointments.
alter table private.platform_governance_proposals
  add column authorization_mode text not null default 'independent'
  check (authorization_mode='independent'
    or (authorization_mode='founder_direct' and kind='appoint' and approver_id is null and approved_at is null));

create function private.f11_appointment_state(p private.platform_governance_proposals,i private.f1_appointment)
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
      or not ('identity'=any(private.reviewed_personal_claims(p.target_id)))
      or exists(select 1 from public.role_assignments where user_id=p.target_id and role='administrator')
      then 'unavailable'
    else 'awaiting_acceptance'
  end;
$$;
revoke all on function private.f11_appointment_state(private.platform_governance_proposals,private.f1_appointment)
  from public,anon,authenticated,service_role;

create or replace function private.o5_proposal_card(p private.platform_governance_proposals)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  i private.f1_appointment;
  state text;
  metadata jsonb:='{}'::jsonb;
begin
  if p.authorization_mode='founder_direct' then
    select * into i from private.f1_appointment where proposal_id=p.id;
    state:=private.f11_appointment_state(p,i);
    metadata:=jsonb_build_object('authorizationMode','founder_direct','invitationIssued',i.id is not null);
  else
    state:=private.o5_proposal_state(p);
  end if;
  return jsonb_build_object('id',p.id,'kind',p.kind,'version',p.version,'governanceVersion',p.governance_version,
    'state',state,'expiresAt',coalesce(least(i.expires_at,p.expires_at),p.expires_at),'accepted',p.accepted_at is not null) || metadata;
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
    if kind in ('appoint','succession') and not ('identity'=any(private.reviewed_personal_claims(target))
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
      if (p.kind in ('appoint','succession') and not ('identity'=any(private.reviewed_personal_claims(p.target_id))
          and private.verified_totp(p.target_id))) or (p.kind in ('revoke','suspend') and not private.platform_admin(p.target_id))
        then raise exception 'target eligibility changed' using errcode='55000'; end if;
      update private.platform_governance_proposals set approver_id=p_actor,approved_at=clock_timestamp(),version=version+1
        where id=p.id returning * into p;
    elsif p_action='accept' then
      if p.kind not in ('appoint','succession') or p.approved_at is null
        or not private.platform_admin(p.proposer_id) or not private.platform_admin(p.approver_id)
        or not ('identity'=any(private.reviewed_personal_claims(p_actor)) and private.verified_totp(p_actor))
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
    or not ('identity'=any(private.reviewed_personal_claims(p.target_id)))
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
