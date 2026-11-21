create or replace function private.platform_admin(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_user) and private.verified_totp(p_user) and (
    private.platform_founder(p_user) or exists(select 1 from public.role_assignments where user_id=p_user and role='administrator')
  );
$$;

create or replace function public.platform_access_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'founder',private.platform_founder(p_actor),
    'administrator',private.institution_actor(p_actor) and (
      private.platform_founder(p_actor) or exists(select 1 from public.role_assignments where user_id=p_actor and role='administrator')
    ),
    'reviewer',private.institution_actor(p_actor) and exists(select 1 from private.verification_reviewers where user_id=p_actor),
    'totp',private.verified_totp(p_actor)
  );
$$;

create or replace function private.protect_admin_authenticator()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.user_id=old.user_id and new.factor_type=old.factor_type and new.status=old.status then
    return new;
  end if;
  if old.factor_type='totp' and old.status='verified' and private.platform_admin(old.user_id) then
    perform pg_advisory_xact_lock(20261120,300);
    if private.platform_admin(old.user_id) and not exists (
      select 1 from auth.mfa_factors where user_id=old.user_id and status='verified' and factor_type='totp' and id<>old.id
    ) and not exists (
      select 1 from (
        select user_id from public.role_assignments where role='administrator'
        union all select user_id from private.platform_bootstrap where singleton
      ) candidates where user_id<>old.user_id and private.platform_admin(user_id)
    ) then raise exception 'last eligible administrator' using errcode='55000'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function feed_data.moderation_role()
returns boolean language sql stable security definer set search_path='' as $$
  select feed_data.member_allowed() and (
    private.platform_founder(auth.uid()) or exists(select 1 from public.role_assignments
      where user_id=auth.uid() and role in ('administrator','moderator'))
  );
$$;

create or replace function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if not private.platform_admin(p_actor) or p_subject is null or p_subject=p_actor
    then raise exception 'access denied' using errcode='42501'; end if;
  if (p_action in ('grant','revoke') and p_value in ('administrator','founder')) or (p_action='status' and (private.platform_founder(p_subject) or exists(
    select 1 from public.role_assignments where user_id=p_subject and role='administrator')))
  then raise exception 'protected governance action' using errcode='O5002'; end if;
  perform private.admin_account_action_for_api(p_actor,p_subject,p_action,p_value,p_reason);
end
$$;

create or replace function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(row.account || jsonb_build_object(
    'verified',cardinality(private.reviewed_personal_claims((row.account->>'id')::uuid))>0,
    'founder',private.platform_founder((row.account->>'id')::uuid),
    'bootstrapTrust',exists(select 1 from private.platform_bootstrap b where b.user_id=(row.account->>'id')::uuid))
    order by row.position),'[]'::jsonb)
  from jsonb_array_elements(private.admin_accounts_for_api(p_actor,p_query,p_offset)) with ordinality as row(account,position);
$$;

create or replace function public.founder_identity_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare authority uuid;
begin
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_admin then
    authority := private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at);
    if authority is null then raise exception 'access denied' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('issuanceEnabled',private.founder_identity_policy_open(),
    'canIssue',p_admin and private.platform_founder(p_actor),'cases',
    coalesce((select jsonb_agg(private.founder_identity_card(c.item,p_admin) order by (c.item).updated_at desc,(c.item).id)
      from (select x as item from private.founder_identity_cases x
        where case when p_admin then x.authority_id=authority else x.subject_id=p_actor end
        order by x.updated_at desc,x.id limit 30) c),'[]'::jsonb));
end
$$;

-- A member may first opt in after a valid Founder grant. The grant stays distinct.
alter table private.founder_identity_events drop constraint founder_identity_events_action_check,
  add constraint founder_identity_events_action_check check (action in ('authority_assigned','authority_revoked','open',
    'consent','visibility','withdraw','proof_recorded','grant','hold','release','revoke','deny','conflict','correction','supersede'));

create function public.founder_supersession_after_grant_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_id uuid,p_expected integer,p_policy integer,p_request uuid,p_application uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  a private.verification_applications;
  g private.founder_identity_events;
  previous private.founder_identity_events;
  s private.founder_supersession_events;
  receipt uuid;
  at_time timestamptz;
  command jsonb := jsonb_build_object('action','supersede','case',p_id,'expected',p_expected,
    'policy',p_policy,'application',p_application,'revision',p_revision);
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_request is null or not private.institution_actor(p_actor)
  then raise exception 'access denied' using errcode='42501'; end if;
  select * into c from private.founder_identity_cases where id=p_id and subject_id=p_actor for update;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  select * into previous from private.founder_identity_events where actor_id=p_actor and request_id=p_request;
  if found then
    if previous.command is distinct from command then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',previous.id,'caseId',previous.case_id,'version',previous.case_version);
  end if;
  if c.version is distinct from p_expected or c.policy_version is distinct from p_policy
  then raise exception 'stale case' using errcode='O2004'; end if;
  if (select count(*) from private.founder_identity_events where actor_id=p_actor and request_id is not null
      and occurred_at>now()-interval '1 day')>=60 then raise exception 'command limit' using errcode='54000'; end if;
  if not private.founder_identity_policy_open() or c.state<>'granted' or c.conflicted or c.consent_at is null
    or c.consent_version is distinct from c.policy_version or not private.platform_founder(c.reviewer_id)
    or not private.platform_admin(c.reviewer_id) or not exists (
      select 1 from private.founder_identity_authorities where id=c.authority_id and scope='founder_identity'
        and revoked_at is null and active_from<=clock_timestamp() and expires_at>clock_timestamp()
    ) then raise exception 'supersession unavailable' using errcode='55000'; end if;
  select e.* into g from private.founder_identity_events e join private.founder_identity_grants x on x.case_id=e.case_id
    where e.case_id=c.id and e.action='grant' and e.actor_id=x.issuer_id;
  if not found or exists(
    select 1 from private.founder_supersession_events x join private.founder_identity_events e on e.id=x.founder_event_id
      where e.case_id=c.id and x.event='application_resolved' and x.reason='superseded_by_founder_verification'
  ) then raise exception 'supersession unavailable' using errcode='55000'; end if;
  select * into a from private.verification_applications where id=p_application and applicant_id=p_actor
    and kind='identity' and organization_id is null for no key update;
  if not found then raise exception 'application unavailable' using errcode='O2003'; end if;
  if a.status<>'pending' or a.revision is distinct from p_revision
  then raise exception 'application changed' using errcode='O2004'; end if;
  s.founder_event_id := g.id;
  s.application_revision := p_revision;
  if private.founder_supersession_reason(a,s,p_actor)<>'superseded_by_founder_verification'
  then raise exception 'supersession unavailable' using errcode='55000'; end if;

  at_time := clock_timestamp();
  update private.founder_identity_cases set version=version+1,updated_at=at_time where id=c.id returning * into c;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
    values(p_actor,c.id,c.authority_id,'supersede',c.state,c.state,c.version,c.policy_version,p_request,command,at_time)
    returning id into receipt;
  update private.verification_applications set status='closed',decided_at=at_time,closed_by_founder_event_id=g.id where id=a.id;
  insert into private.founder_supersession_events(founder_event_id,event,application_id,application_revision,application_status,reason,occurred_at)
    values(receipt,'member_consented',a.id,a.revision,a.status,'member_opted_in',at_time),
      (receipt,'application_resolved',a.id,a.revision,a.status,'superseded_by_founder_verification',at_time);
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;
revoke all on function public.founder_supersession_after_grant_for_api(uuid,uuid,boolean,bigint,uuid,integer,integer,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.founder_supersession_after_grant_for_api(uuid,uuid,boolean,bigint,uuid,integer,integer,uuid,uuid,integer)
  to service_role;
