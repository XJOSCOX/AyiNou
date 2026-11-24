-- A live gold grant qualifies wherever the product asks for verified personal identity.
-- Keep the badge and its disclosure separate from the identity decision.
create function private.founder_gold_identity_eligible(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select 'founder'=any(private.personal_identity_provenance(p_actor))
    and not exists (
      select 1 from public.verification_records v
      where v.user_id=p_actor and v.verification_type='identity' and v.source='review'
        and (v.status='revoked' or v.publication_held_at is not null)
    );
$$;

create function private.member_identity_verified(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select 'identity'=any(private.independently_reviewed_personal_claims(p_actor))
    or private.founder_gold_identity_eligible(p_actor);
$$;

revoke all on function private.founder_gold_identity_eligible(uuid),private.member_identity_verified(uuid)
  from public,anon,authenticated,service_role;

-- The platform Founder still qualifies for their own proposal through recognized bootstrap
-- provenance and a live administrator account. This does not assign any reviewer or owner role.
create or replace function private.project_proposal_identity_state(p_actor uuid,p_owner uuid)
returns text language sql stable set search_path='' as $$
  select case
    when state in ('required','pending') and p_actor=p_owner
      and private.platform_founder(p_actor) and private.platform_admin(p_actor)
      and not exists (
        select 1 from public.verification_records v
        where v.user_id=p_actor and v.verification_type='identity' and v.source='review'
          and (v.status='revoked' or v.publication_held_at is not null)
      ) then 'verified'
    else state
  end
  from (select private.project_identity_state(p_actor) as state) evaluated;
$$;

create or replace function private.project_identity_state(p_actor uuid)
returns text language sql stable set search_path='' as $$
  select case
    when private.member_identity_verified(p_actor) then 'verified'
    when exists(select 1 from private.verification_applications
      where applicant_id=p_actor and kind='identity' and status='pending') then 'pending'
    when exists(select 1 from public.verification_records where user_id=p_actor and verification_type='identity'
      and source='review' and (status='revoked' or publication_held_at is not null)) then 'revoked'
    else 'required'
  end;
$$;

create or replace function private.project_require_identity(p_actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  -- Lock the identity source used by a project or poll write before rechecking eligibility.
  if private.founder_gold_identity_eligible(p_actor) then
    perform 1 from private.fv_development_policies p
      where p.id=(select id from private.fv_active_policy()) for share;
    perform 1 from private.founder_identity_cases
      where subject_id=p_actor and state='granted' for share;
  end if;
  perform 1 from public.verification_records
    where user_id=p_actor and verification_type='identity' for share;
  case private.project_identity_state(p_actor)
    when 'verified' then return;
    when 'pending' then raise exception 'identity verification pending' using errcode='PJP21';
    when 'revoked' then raise exception 'identity verification unavailable' using errcode='PJP22';
    else raise exception 'identity verification required' using errcode='PJP20';
  end case;
end;
$$;

create or replace function private.organization_setup_identity_eligible(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and private.member_identity_verified(p_actor);
$$;

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
      or private.founder_gold_identity_eligible(p_actor)
    ),
    false
  )
$$;

create or replace function private.ambassador_public_eligible(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select private.member_identity_verified(p_user)
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
      or not (private.member_identity_verified(p.target_id))
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
    if kind in ('appoint','succession') and not (private.member_identity_verified(target)
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
      if (p.kind in ('appoint','succession') and not (private.member_identity_verified(p.target_id)
          and private.verified_totp(p.target_id))) or (p.kind in ('revoke','suspend') and not private.platform_admin(p.target_id))
        then raise exception 'target eligibility changed' using errcode='55000'; end if;
      update private.platform_governance_proposals set approver_id=p_actor,approved_at=clock_timestamp(),version=version+1
        where id=p.id returning * into p;
    elsif p_action='accept' then
      if p.kind not in ('appoint','succession') or p.approved_at is null
        or not private.platform_admin(p.proposer_id) or not private.platform_admin(p.approver_id)
        or not (private.member_identity_verified(p_actor) and private.verified_totp(p_actor))
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
    or not (private.member_identity_verified(p.target_id))
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

create or replace function feed_data.member_card(p public.profiles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id','member:'||p.username,'kind','member','handle',p.username,'name',p.display_name,
    'self',p.user_id=auth.uid(),'personalClaims',case when d.visible then private.reviewed_personal_claims(p.user_id) end,
    'verified',d.visible and (cardinality(private.reviewed_personal_claims(p.user_id))>0 or (private.founder_gold_identity_eligible(p.user_id) and public.founder_identity_public_for_api(p.user_id))),
    'avatarPath',case when d.visible and private.member_experience_flag('profilePictures') and p.avatar_asset is not null
      then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'following',d.state->'following','requestPending',d.state->'requestPending',
    'requiresApproval',d.state->'requiresApproval','canFollow',d.state->'canFollow')
  || case when d.visible and feed_data.followable_member(p) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end
  from (select feed_data.f24_details(p.user_id,auth.uid()) visible,
    feed_data.f24_member_follow_status(p) state) d
$$;

create or replace function public.search_members_f24_for_client(p_search text,p_verified boolean,p_country text,p_department text,
  p_interest text,p_language text,p_after text,p_limit int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(p_search,''))); needle text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'discovery_search',90);
  if char_length(q)=1 or char_length(q)>80 or q ~ '[[:cntrl:]@]'
    or p_limit is null or p_limit not between 1 and 20
    or char_length(coalesce(p_after,''))>24 then raise exception 'invalid search' using errcode='22023'; end if;
  needle:='%'||replace(replace(replace(q,'!','!!'),'%','!%'),'_','!_')||'%';
  return coalesce((select jsonb_agg(feed_data.member_card(candidate) order by candidate.username)
    from (select p.* from public.profiles p join public.user_settings s using(user_id)
      join public.member_private m using(user_id) left join feed_data.profile_privacy a using(user_id)
      where p.is_visible and p.username>coalesce(p_after,'') and p.display_name is not null
        and feed_data.followable_member(p)
        and (q='' or p.username like needle escape '!' or lower(p.display_name) like needle escape '!'
          or (char_length(q) between 3 and 32 and lower(p.display_name) operator(extensions.%>) q))
        and (not coalesce(p_verified,false) or cardinality(private.reviewed_personal_claims(p.user_id))>0
          or (feed_data.f24_details(p.user_id,auth.uid()) and (private.founder_gold_identity_eligible(p.user_id) and public.founder_identity_public_for_api(p.user_id))))
        and (p_country is null or (s.show_country and private.member_experience_flag('displayCountry') and m.residence_country_code=p_country))
        and (p_department is null or (s.show_department and private.member_experience_flag('displayDepartment')
          and coalesce(m.residence_department_code,m.diaspora_department_code)=p_department))
        and (p_interest is null or (s.show_interests and private.member_experience_flag('displayInterests')
          and exists(select from public.member_interests i where i.user_id=p.user_id and i.interest_code=p_interest)))
        and (p_language is null or (a.share_language and p.preferred_locale=p_language))
      order by p.username limit p_limit+1) candidate),'[]'::jsonb);
end
$$;
