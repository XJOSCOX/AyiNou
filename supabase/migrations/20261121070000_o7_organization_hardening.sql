-- A queued request must not inherit validity from the start of its transaction.
create or replace function private.live_account_session(p_user uuid,p_session uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.institution_actor(p_user) and exists (
    select 1 from auth.sessions where id=p_session and user_id=p_user
      and (not_after is null or not_after>clock_timestamp())
  );
$$;

-- Preserve O2/O4 signatures and grants while pinning the live session through receipt and mutation.
create or replace function public.organization_intent_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
  p_id uuid,p_action text,p_stage text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  intent private.organization_onboarding_intents;
  receipt private.organization_onboarding_receipts;
  command jsonb := jsonb_build_object('id',p_id,'action',p_action,'stage',p_stage,'expected',p_expected);
  result jsonb;
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_expected is null or p_expected<0 or p_request is null
    or (p_id is null)<>(p_expected=0)
    or not coalesce((p_action='save' and p_stage in ('drafting','awaiting_identity'))
      or (p_action='cancel' and p_stage is null and p_id is not null),false)
  then raise exception 'invalid command' using errcode='23514'; end if;

  -- Institution creation and claim submission also take this actor lock.
  perform 1 from auth.users where id=p_actor for no key update;
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  select * into receipt from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.request_id=p_request;
  if found then
    if receipt.command<>command then raise exception 'request conflict' using errcode='O2002'; end if;
    return receipt.result;
  end if;
  if (select count(*) from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.created_at>now()-interval '1 day')>=60
  then raise exception 'command limit' using errcode='54000'; end if;

  if p_id is not null and not exists (select 1 from private.organization_onboarding_intents i
    where i.id=p_id and i.subject_id=p_actor)
  then raise exception 'intent unavailable' using errcode='O2003'; end if;
  select * into intent from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled' and i.completed_at is null for update;
  if intent.id is distinct from p_id or coalesce(intent.version,0)<>p_expected
  then raise exception 'stale intent' using errcode='O2004'; end if;

  if p_action='cancel' and (
    exists(select 1 from private.organization_memberships m
      where m.user_id=p_actor and m.role='owner' and m.revoked_at is null)
    or exists(select 1 from private.verification_applications a
      where a.applicant_id=p_actor and a.kind='claim' and a.status in ('pending','approved'))
  ) then raise exception 'protected dependency' using errcode='O2005'; end if;

  if intent.id is null then
    insert into private.organization_onboarding_intents(subject_id,pathway,stage)
      values(p_actor,'organization',p_stage) returning * into intent;
  else
    update private.organization_onboarding_intents i set
      pathway=case when p_action='cancel' then 'individual' else 'organization' end,
      stage=case when p_action='cancel' then 'cancelled' else p_stage end,
      setup_draft=case when p_action='cancel' then null else i.setup_draft end,
      version=i.version+1,updated_at=clock_timestamp() where i.id=intent.id returning * into intent;
  end if;
  result := jsonb_build_object('intent',private.organization_intent_card(intent),'requestId',p_request);
  insert into private.organization_onboarding_receipts(subject_id,request_id,intent_id,command,result)
    values(p_actor,p_request,intent.id,command,result);
  return result;
end;
$$;

-- Keep user-before-session lock order for O5 and O6 commands, including Auth cascade deletion.
create or replace function private.o5_lock_actor(p_actor uuid,p_session uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121050000));
  perform 1 from auth.users where id=p_actor for no key update;
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
end
$$;

create or replace function public.institution_resolve_invite_for_api(p_actor uuid,p_invitation uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i private.organization_invitations;
  actor_role text;
  inviter_role text;
  org uuid;
  decided_at timestamptz;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  select organization_id into org from private.organization_invitations where id=p_invitation;
  perform 1 from private.organizations where id=org for no key update;
  select * into i from private.organization_invitations where id=p_invitation;
  decided_at := clock_timestamp();
  actor_role := private.institution_role(p_actor,org);
  if actor_role is not null and not exists (select 1 from private.organization_memberships
    where organization_id=org and user_id=p_actor and revoked_at is null
      and (expires_at is null or expires_at>decided_at)) then actor_role := null; end if;
  if i.id is null or (p_accept and i.recipient_id<>p_actor) or
    (not p_accept and i.recipient_id<>p_actor and not coalesce(actor_role='owner'
      or (actor_role='administrator' and i.role<>'administrator'),false))
  then raise exception 'access denied' using errcode = '42501'; end if;
  -- Evaluate expiry after taking the same organization lock used by ownership and role decisions.
  if i.state<>'pending' or i.expires_at<=decided_at then raise exception 'invitation unavailable' using errcode='55000'; end if;
  if p_accept then
    inviter_role := private.institution_role(i.invited_by,org);
    if not private.institution_actor(i.invited_by) or not coalesce(inviter_role='owner'
      or (inviter_role='administrator' and i.role<>'administrator'),false) or actor_role is not null
      or not exists (select 1 from private.organization_memberships where organization_id=org
        and user_id=i.invited_by and revoked_at is null and (expires_at is null or expires_at>decided_at))
    then raise exception 'invitation unavailable' using errcode='55000'; end if;
    if (select count(*) from private.organization_memberships where organization_id=org and revoked_at is null
      and (expires_at is null or expires_at>decided_at)) >= 50 then raise exception 'organization limit' using errcode='54000'; end if;
    update private.organization_memberships set revoked_at=decided_at where organization_id=org and user_id=p_actor and revoked_at is null;
    insert into private.organization_memberships(organization_id,user_id,role,granted_by,expires_at)
      values (org,p_actor,i.role,i.invited_by,decided_at+make_interval(days=>i.term_days));
  end if;
  update private.organization_invitations set state=case when p_accept then 'accepted' else 'revoked' end,closed_at=decided_at
    where id=p_invitation;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event,occurred_at)
    values (p_actor,org,p_invitation,case when p_accept then 'invitation_accepted' else 'invitation_revoked' end,decided_at);
end;
$$;

revoke all on function private.o5_lock_actor(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.organization_intent_command_for_api(uuid,uuid,boolean,uuid,text,text,integer,uuid),
  public.institution_resolve_invite_for_api(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.organization_intent_command_for_api(uuid,uuid,boolean,uuid,text,text,integer,uuid),
  public.institution_resolve_invite_for_api(uuid,uuid,boolean) to service_role;
