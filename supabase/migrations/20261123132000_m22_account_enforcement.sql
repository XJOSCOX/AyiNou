-- Legacy sanctions stay in their original ledger. New actions require a session-bound command.
create table private.m22_account_sanctions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('suspended','banned')),
  category text not null check (category in ('safety','harassment','spam','integrity','other')),
  started_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  expiry_event_id uuid not null unique default gen_random_uuid(),
  check ((kind='banned' and expires_at is null) or
    (kind='suspended' and expires_at is not null and expires_at>started_at and expires_at<=started_at+interval '2160 hours')),
  check (revoked_at is null or (revoked_at>=started_at and (expires_at is null or revoked_at<expires_at)))
);
create index m22_sanctions_subject on private.m22_account_sanctions(subject_id,started_at desc,id);

create table private.m22_account_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  subject_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  authority text not null check (authority in ('founder','administrator')),
  workspace_id uuid not null,
  request_id uuid not null,
  action text not null check (action in ('suspension_created','suspension_extended','restriction_revoked',
    'account_reinstated','ban_issued','ban_lifted')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  occurred_at timestamptz not null,
  before_state jsonb not null,
  after_state jsonb not null,
  command jsonb not null,
  unique(actor_id,request_id,action)
);
create index m22_events_subject on private.m22_account_events(subject_id,occurred_at desc,id desc);

create table private.m22_reauthentication (
  subject_id uuid primary key references auth.users(id) on delete cascade,
  after_at timestamptz not null
);

alter table private.m22_account_sanctions enable row level security;
alter table private.m22_account_events enable row level security;
alter table private.m22_reauthentication enable row level security;
revoke all on private.m22_account_sanctions,private.m22_account_events,private.m22_reauthentication
  from public,anon,authenticated,service_role;

create function private.m22_effective_sanctions(p_subject uuid,p_now timestamptz)
returns setof private.m22_account_sanctions language sql stable set search_path='' as $$
  select s.* from private.m22_account_sanctions s where s.subject_id=p_subject and s.revoked_at is null
    and s.started_at<=p_now and (s.expires_at is null or s.expires_at>p_now)
$$;

create or replace function private.institution_actor(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select exists (select from auth.users u where u.id=p_user and not u.is_anonymous and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=statement_timestamp()))
    and not exists (select from private.account_restrictions r where r.user_id=p_user and r.status<>'active')
    and not exists (select from private.m22_effective_sanctions(p_user,statement_timestamp()))
$$;

create or replace function private.live_account_session(p_user uuid,p_session uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_user)
    and private.s2a_session_within_policy(p_user,p_session,clock_timestamp())
    and exists (
      select from auth.sessions s where s.id=p_session and s.user_id=p_user
        and not exists (select from private.m22_reauthentication r where r.subject_id=p_user and s.created_at<=r.after_at)
        and not exists (select from private.m22_account_sanctions r where r.subject_id=p_user
          and r.expires_at is not null and r.revoked_at is null and r.expires_at<=statement_timestamp()
          and s.created_at<=r.expires_at))
$$;

create or replace function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if not private.platform_admin(p_actor) or p_subject is null or p_subject=p_actor
    then raise exception 'access denied' using errcode='42501'; end if;
  if (p_action in ('grant','revoke') and p_value in ('administrator','founder')) or (p_action='status' and
    (private.platform_founder(p_subject) or exists(select from public.role_assignments where user_id=p_subject and role='administrator')))
    then raise exception 'protected governance action' using errcode='O5002'; end if;
  if p_action is null or p_action not in ('grant','revoke')
    then raise exception 'workspace-bound enforcement required' using errcode='42501'; end if;
  perform private.admin_account_action_for_api(p_actor,p_subject,p_action,p_value,p_reason);
end
$$;

create function private.m22_revision(p_subject uuid)
returns uuid language sql stable set search_path='' as $$
  select id from private.m22_account_events where subject_id=p_subject order by occurred_at desc,id desc limit 1
$$;

create function private.m22_case_json(s private.m22_account_sanctions,p_now timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('reference',s.id,'kind',s.kind,'category',s.category,'startsAt',s.started_at,
    'expiresAt',s.expires_at,'status',case when s.revoked_at is not null then 'revoked'
      when s.expires_at<=p_now then 'expired' else 'active' end)
$$;

create function public.m22_enforce_account_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_subject uuid,p_action text,p_case uuid,p_expected uuid,p_request uuid,p_minutes int,
  p_category text,p_reason text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  at_time timestamptz;
  acting_as text;
  current_case private.m22_account_sanctions;
  prior private.m22_account_events;
  legacy private.account_restrictions;
  expires timestamptz;
  source_id uuid;
  event_id uuid;
  event_action text;
  before_value jsonb;
  after_value jsonb;
  command_value jsonb:=jsonb_build_object('action',p_action,'case',p_case,'expected',p_expected,'minutes',p_minutes,
    'category',p_category,'reason',btrim(p_reason),'confirmed',p_confirmed);
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  if not private.platform_admin(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    or p_subject is null or p_subject=p_actor
  then raise exception 'access denied' using errcode='42501'; end if;
  if private.platform_founder(p_subject) or exists(select from public.role_assignments where user_id=p_subject and role='administrator')
    then raise exception 'protected governance action' using errcode='O5002'; end if;
  perform 1 from auth.users where id=p_subject and not is_anonymous and deleted_at is null for no key update;
  if not found then raise exception 'unknown account' using errcode='O2003'; end if;
  acting_as:=case when private.platform_founder(p_actor) then 'founder' else 'administrator' end;
  if p_request is null or p_action is null or p_action not in ('suspend','extend','ban','lift','lift_legacy')
    or p_confirmed is distinct from true or coalesce(char_length(btrim(p_reason)),0) not between 10 and 500
    or p_reason ~ '[[:cntrl:]]'
    or (p_action in ('suspend','extend') and (p_minutes is null or p_minutes not between 1 and 129600))
    or (p_action not in ('suspend','extend') and p_minutes is not null)
    or (p_action in ('suspend','ban') and (p_case is not null or p_category is null or p_category not in ('safety','harassment','spam','integrity','other')))
    or (p_action in ('extend','lift','lift_legacy') and (p_case is null or p_category is not null))
  then raise exception 'invalid enforcement action' using errcode='23514'; end if;
  if p_action in ('ban','lift_legacy') and acting_as<>'founder'
    then raise exception 'Founder required' using errcode='42501'; end if;
  select * into prior from private.m22_account_events where actor_id=p_actor and request_id=p_request
    and action<>'account_reinstated' limit 1;
  if found then
    if prior.command is distinct from command_value or prior.subject_id is distinct from p_subject
      then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('eventId',prior.id,'reference',prior.case_id);
  end if;
  if private.m22_revision(p_subject) is distinct from p_expected
    then raise exception 'account changed' using errcode='O2004'; end if;

  at_time:=clock_timestamp();
  select * into legacy from private.account_restrictions where user_id=p_subject and status<>'active' for update;
  before_value:=jsonb_build_object('status','active');

  if p_action in ('suspend','ban') then
    if not exists(select from auth.users where id=p_subject and email_confirmed_at is not null)
      then raise exception 'eligible account required' using errcode='42501'; end if;
    if legacy.user_id is not null or exists(select from private.m22_effective_sanctions(p_subject,at_time))
      then raise exception 'active enforcement exists' using errcode='55000'; end if;
    -- A release or expiry cannot be used to immediately restart the administrator's episode.
    if acting_as='administrator' and exists(select from private.m22_account_sanctions s where s.subject_id=p_subject
      and s.kind='suspended' and greatest(s.started_at+interval '2160 hours',least(s.revoked_at,s.expires_at)+interval '24 hours')>at_time)
      then raise exception 'administrator renewal limit' using errcode='M2201'; end if;
    insert into private.m22_account_sanctions(subject_id,kind,category,started_at,expires_at)
      values(p_subject,case when p_action='ban' then 'banned' else 'suspended' end,p_category,
        at_time,case when p_action='suspend' then at_time+make_interval(mins=>p_minutes) end) returning * into current_case;
    source_id:=current_case.id;
    after_value:=private.m22_case_json(current_case,at_time);
    event_action:=case p_action when 'ban' then 'ban_issued' else 'suspension_created' end;
  elsif p_action='lift_legacy' then
    if legacy.user_id is null or p_case<>p_subject then raise exception 'legacy sanction changed' using errcode='O2004'; end if;
    source_id:=p_subject;
    before_value:=jsonb_build_object('status',legacy.status,'updatedAt',legacy.updated_at,'reason',legacy.reason,'changedBy',legacy.changed_by);
    -- Preserve the original sanction row and append the reason and prior state to the new ledger.
    update private.account_restrictions set status='active',updated_at=at_time where user_id=p_subject;
    after_value:=jsonb_build_object('status','revoked','legacy',true);
    event_action:=case legacy.status when 'banned' then 'ban_lifted' else 'restriction_revoked' end;
  else
    select * into current_case from private.m22_effective_sanctions(p_subject,at_time) s where s.id=p_case;
    if not found then raise exception 'sanction changed' using errcode='O2004'; end if;
    if current_case.kind='banned' and acting_as<>'founder' then raise exception 'Founder required' using errcode='42501'; end if;
    source_id:=current_case.id;
    before_value:=private.m22_case_json(current_case,at_time);
    if p_action='extend' then
      expires:=at_time+make_interval(mins=>p_minutes);
      if current_case.kind<>'suspended' or expires<=current_case.expires_at
        or expires>current_case.started_at+interval '2160 hours'
        then raise exception 'duration limit' using errcode='M2201'; end if;
      update private.m22_account_sanctions set expires_at=expires where id=source_id returning * into current_case;
      event_action:='suspension_extended';
    else
      update private.m22_account_sanctions set revoked_at=at_time where id=source_id returning * into current_case;
      event_action:=case current_case.kind when 'banned' then 'ban_lifted' else 'restriction_revoked' end;
    end if;
    after_value:=private.m22_case_json(current_case,at_time);
  end if;

  if p_action in ('lift','lift_legacy') then
    insert into private.m22_reauthentication(subject_id,after_at) values(p_subject,at_time)
      on conflict(subject_id) do update set after_at=greatest(private.m22_reauthentication.after_at,excluded.after_at);
  end if;
  insert into private.m22_account_events(case_id,subject_id,actor_id,authority,workspace_id,request_id,action,
    reason,occurred_at,before_state,after_state,command)
  values(source_id,p_subject,p_actor,acting_as,p_workspace,p_request,event_action,btrim(p_reason),at_time,before_value,after_value,command_value)
  returning id into event_id;
  if p_action in ('lift','lift_legacy') and private.institution_actor(p_subject) then
    insert into private.m22_account_events(case_id,subject_id,actor_id,authority,workspace_id,request_id,action,
      reason,occurred_at,before_state,after_state,command)
    values(source_id,p_subject,p_actor,acting_as,p_workspace,p_request,'account_reinstated',btrim(p_reason),
      at_time,before_value,jsonb_build_object('status','active'),command_value);
  end if;
  return jsonb_build_object('eventId',event_id,'reference',source_id);
end
$$;
create function private.m22_notice_session(p_user uuid,p_session uuid)
returns boolean language sql stable set search_path='' as $$
  select exists (select from auth.users u where u.id=p_user and not u.is_anonymous and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=statement_timestamp()))
    and private.s2a_session_within_policy(p_user,p_session,clock_timestamp())
$$;

create function public.m22_recovery_session_active()
returns boolean language sql stable security definer set search_path='' as $$
  select private.m22_notice_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
    and exists (select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) entry
      where entry->>'method'='recovery' and jsonb_typeof(entry->'timestamp')='number'
      and (entry->>'timestamp')::numeric between extract(epoch from statement_timestamp())-900
        and extract(epoch from statement_timestamp())+30)
$$;

create function public.m22_my_account_enforcement()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  legacy private.account_restrictions;
begin
  if not private.m22_notice_session(actor,sid) then return null; end if;
  select * into legacy from private.account_restrictions where user_id=actor and status<>'active';
  return jsonb_build_object('notices',coalesce((
      select jsonb_agg(private.m22_case_json(s,statement_timestamp()) order by s.started_at desc,s.id desc)
      from (select * from private.m22_account_sanctions where subject_id=actor order by started_at desc,id desc limit 20) s
    ),'[]'::jsonb) ||
    case when legacy.user_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('reference',actor,'kind',legacy.status,'category','other',
        'startsAt',legacy.updated_at,'expiresAt',null,'status','active')) end,
    'canResume',private.institution_actor(actor),'appealAvailable',false);
end
$$;

create or replace function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(x.account || jsonb_build_object(
    'verified',cardinality(private.reviewed_personal_claims(t.subject))>0,
    'founder',private.platform_founder(t.subject),
    'bootstrapTrust',exists(select from private.platform_bootstrap b where b.user_id=t.subject),
    'restrictionRevision',private.m22_revision(t.subject),
    'enforcementEligible',t.subject<>p_actor and not private.platform_founder(t.subject)
      and not exists(select from public.role_assignments where user_id=t.subject and role='administrator')
      and (x.account->>'confirmed'='true' or x.account->>'status'<>'active'),
    'status',coalesce(s.kind,x.account->>'status'),
    'reason',case when s.id is null then x.account->>'reason' else e.reason end,
    'restrictionUpdatedAt',coalesce(to_jsonb(e.occurred_at),x.account->'restrictionUpdatedAt'),
    'enforcement',case when s.id is not null then private.m22_case_json(s,statement_timestamp())
      when x.account->>'status' in ('suspended','banned') then jsonb_build_object(
        'reference',t.subject,'kind',x.account->>'status','category','other',
        'startsAt',x.account->'restrictionUpdatedAt','expiresAt',null,'status','active','legacy',true) end
    ) order by x.position),'[]'::jsonb)
  from jsonb_array_elements(private.admin_accounts_for_api(p_actor,p_query,p_offset)) with ordinality x(account,position)
  cross join lateral (select (x.account->>'id')::uuid as subject) t
  left join lateral (
    select * from private.m22_effective_sanctions(t.subject,statement_timestamp()) s
    order by (s.kind='banned') desc,s.started_at desc,s.id desc limit 1
  ) s on true
  left join lateral (
    select reason,occurred_at from private.m22_account_events where subject_id=t.subject and case_id=s.id
    order by occurred_at desc,id desc limit 1
  ) e on true
$$;

-- Natural expiry is a deterministic audit event anchored by the case's persisted expiry ID.
-- The command cannot extend an elapsed term or revoke it after expiry.
create view private.m22_account_history as
select e.id,e.case_id,e.subject_id,e.actor_id,e.authority,e.request_id,e.action,e.occurred_at,
  e.before_state-'reason'-'changedBy' as before_state,e.after_state
from private.m22_account_events e
union all
select s.expiry_event_id,s.id,s.subject_id,null,'system',null,'restriction_expired',s.expires_at,
  jsonb_build_object('status','active','kind','suspended','expiresAt',s.expires_at),jsonb_build_object('status','expired')
from private.m22_account_sanctions s
where s.kind='suspended' and s.revoked_at is null and s.expires_at<=statement_timestamp();

revoke all on private.m22_account_history from public,anon,authenticated,service_role;
revoke all on function private.m22_effective_sanctions(uuid,timestamptz),private.m22_revision(uuid),
  private.m22_case_json(private.m22_account_sanctions,timestamptz),private.m22_notice_session(uuid,uuid),
  public.m22_enforce_account_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,uuid,uuid,uuid,int,text,text,boolean),
  public.m22_my_account_enforcement(),public.m22_recovery_session_active()
  from public,anon,authenticated,service_role;
grant execute on function public.m22_enforce_account_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,uuid,uuid,uuid,int,text,text,boolean)
  to service_role;
grant execute on function public.m22_my_account_enforcement(),public.m22_recovery_session_active() to authenticated;
-- Integrate native event references with both existing audit readers.
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
  e.id, e.occurred_at, case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'founder_direct_regular_approval' else 'founder_direct_regular_rejection' end,
  e.actor_id, 'verification_case'::text, e.subject_id, e.organization_id, null::uuid, e.decision_policy_version,
  e.request_id, case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'approved' else 'rejected' end, 'founder'::text,
  jsonb_build_object('status','pending'),
  jsonb_build_object('status',case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'approved' else 'rejected' end)
from private.institution_audit e where e.event in ('founder_identity_approved','founder_identity_rejected',
  'founder_organization_approved','founder_organization_rejected',
  'founder_representative_approved','founder_representative_rejected')
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
  where c.id=a.comment_id and p.community_id is null)
union all
select 'platform_admin'::text collate "C",'platform',h.id::text collate "C",h.id,h.occurred_at,h.action,
  h.actor_id,'account',h.subject_id,null,null,null,h.request_id,'recorded',
  case when h.authority='founder' then h.authority end,
  h.before_state,h.after_state-'legacy' || jsonb_build_object('caseReference',h.case_id)
from private.m22_account_history h;
create or replace view private.m21_history_source as
select case when a.new_state ? 'caseReference' then 'account_enforcement' else a.source end collate "C" as source,
  case when a.source='platform_admin' then 'accounts' else 'feed' end as domain,
  a.uuid_id as id,a.resource_type as target,a.resource_ref as target_id,
  null::text as scope_key,a.outcome as status,a.event_type as action,a.occurred_at,a.actor_ref
from private.a1a_audit_source a
where a.source in ('platform_admin','post_moderation','comment_moderation')
  and a.event_type in ('account_suspended','account_banned','account_reinstated','suspension_created','suspension_extended','restriction_expired','restriction_revoked','ban_issued','ban_lifted','hide','restore','remove','dismiss')
union all
select 'post_moderation','communities',a.id,'post',a.post_id,c.slug,'recorded',a.action,a.created_at,null
from feed_data.post_moderation_actions a join feed_data.posts p on p.id=a.post_id
join feed_data.communities c on c.id=p.community_id
union all
select 'comment_moderation','communities',a.id,'comment',a.comment_id,c.slug,'recorded',a.action,a.created_at,null
from feed_data.comment_moderation_actions a join feed_data.comments m on m.id=a.comment_id
join feed_data.posts p on p.id=m.post_id join feed_data.communities c on c.id=p.community_id
union all
select 'event_moderation','events',a.id,'event',a.event_id,c.slug,a.action,a.action,a.occurred_at,a.actor_id
from feed_data.event_audit a join feed_data.events e on e.id=a.event_id
left join feed_data.communities c on c.id=e.community_id
where a.action in ('restricted','restored','dismissed')
union all
select 'project_report','projects',r.id,'project',r.project_id,c.slug,r.outcome,r.outcome,r.decided_at,r.reviewer_id
from private.project_reports r join private.community_projects p on p.id=r.project_id
left join feed_data.communities c on c.id=p.community_id where r.decided_at is not null
union all
select 'organization_restriction','trust',a.id,'organization',a.organization_id,null,'restricted',a.event,a.occurred_at,a.actor_id
from private.institution_audit a where a.event='institution_restricted';
create or replace view private.m21_restriction_source as
select 'account_restriction'::text as source,'accounts'::text as domain,r.user_id as id,'account'::text as target,
  r.user_id as target_id,null::text as scope_key,r.status,r.status as action,r.updated_at as occurred_at,
  null::timestamptz as expires_at
from private.account_restrictions r join auth.users u on u.id=r.user_id
where r.status in ('suspended','banned') and u.deleted_at is null
union all
select 'provider_ban','accounts',u.id,'account',u.id,null,'provider_ban','provider_ban',null,u.banned_until
from auth.users u where u.deleted_at is null and not u.is_anonymous and u.banned_until>statement_timestamp()
union all
select 'event_restriction','events',e.id,'event',e.id,c.slug,'restricted','restricted',e.moderated_at,null
from feed_data.events e left join feed_data.communities c on c.id=e.community_id where e.moderated_at is not null
union all
select 'project_restriction','projects',p.id,'project',p.id,c.slug,'restricted','restricted',p.restricted_at,null
from private.community_projects p left join feed_data.communities c on c.id=p.community_id where p.restricted_at is not null
union all
select 'organization_restriction','trust',o.id,'organization',o.id,null,'restricted','restricted',a.occurred_at,null
from private.organizations o left join lateral (
  select s.occurred_at from private.institution_audit s where s.organization_id=o.id and s.event='institution_restricted'
  order by s.occurred_at desc,s.id desc limit 1
) a on true where o.status='restricted'
union all
select 'account_enforcement','accounts',s.id,'account',s.subject_id,null,s.kind,s.kind,s.started_at,s.expires_at
from private.m22_account_sanctions s join auth.users u on u.id=s.subject_id
where u.deleted_at is null and s.revoked_at is null and s.started_at<=statement_timestamp()
  and (s.expires_at is null or s.expires_at>statement_timestamp());
create or replace function public.m21_moderation_center_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_view text,p_domain text,p_status text,p_action text,p_scope text,p_target uuid,
  p_from timestamptz,p_to timestamptz,p_high timestamptz,p_before_at timestamptz,p_before_source text,p_before_id uuid,p_take integer)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan'
set statement_timeout='4s' as $$
declare
  high_mark timestamptz:=coalesce(p_high,statement_timestamp());
  until_at timestamptz:=coalesce(p_to,high_mark);
  since_at timestamptz:=coalesce(p_from,until_at-interval '30 days');
  safety jsonb;
begin
  if not private.platform_admin(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
  then return null; end if;
  if p_view is null or p_view not in ('overview','reports','content','restrictions','history')
    or p_take is null or p_take not between 1 and 50 or not isfinite(high_mark)
    or not isfinite(since_at) or not isfinite(until_at)
    or ((p_before_at is not null or p_before_source is not null or p_before_id is not null)
      and (p_high is null or p_before_at is null or p_before_source is null or p_before_id is null))
    or (p_view in ('reports','history') and (since_at>=until_at or until_at-since_at>interval '90 days'))
  then raise exception 'invalid moderation filters' using errcode='22023'; end if;

  if p_view='overview' then
    safety:=public.safety_overview_for_api(p_actor);
    return (select jsonb_build_object('high',high_mark,'rows','[]'::jsonb,'metrics',jsonb_build_object(
      'pendingReports',count(*),
      'eventReports',count(*) filter (where r.domain='events'),
      'projectReports',count(*) filter (where r.domain='projects'),
      'pendingAppeals',safety->'pendingAppeals',
      'restrictedAccounts',(select count(distinct h.target_id) from private.m21_restriction_source h where h.domain='accounts'),
      'recentDecisions',(
        select count(*) from private.m21_history_source h where h.occurred_at>=high_mark-interval '30 days'
          and h.occurred_at<=high_mark and (h.domain<>'trust' or not private.institution_report_conflict(p_actor,h.target_id))
          and (h.domain<>'projects' or exists (select from private.community_projects p
            where p.id=h.target_id and not private.project_conflicted(p,p_actor)))),
      'hiddenContent',(
        (select count(*) from feed_data.posts where status='hidden' and deleted_at is null) +
        (select count(*) from feed_data.comments where status='hidden' and deleted_at is null)),
      'removedContent',(
        (select count(*) from feed_data.posts where status='removed' and deleted_at is null) +
        (select count(*) from feed_data.comments where status='removed' and deleted_at is null))))
      from private.m21_report_source r where r.status='pending' and private.m21_report_allowed(r,p_actor));
  end if;

  return (
    with source as (
      select r.source,r.domain,r.id,r.target,r.target_id,r.scope_key,r.status,r.action,r.occurred_at,
        null::timestamptz as expires_at,null::uuid as actor_ref
      from private.m21_report_source r where p_view='reports' and private.m21_report_allowed(r,p_actor)
      union all
      select c.source,c.domain,c.id,c.target,c.target_id,c.scope_key,c.status,c.status,c.occurred_at,null,null
      from private.m21_content_source c where p_view='content'
      union all
      select h.source,h.domain,h.id,h.target,h.target_id,h.scope_key,h.status,h.action,h.occurred_at,null,h.actor_ref
      from private.m21_history_source h where p_view='history'
        and (h.domain<>'trust' or not private.institution_report_conflict(p_actor,h.target_id))
        and (h.domain<>'projects' or exists (
          select from private.community_projects p where p.id=h.target_id and not private.project_conflicted(p,p_actor)))
      union all
      select r.source,r.domain,r.id,r.target,r.target_id,r.scope_key,r.status,r.action,r.occurred_at,r.expires_at,null
      from private.m21_restriction_source r where p_view='restrictions'
        and (r.domain<>'trust' or not private.institution_report_conflict(p_actor,r.target_id))
        and (r.domain<>'projects' or exists (
          select from private.community_projects p where p.id=r.target_id and not private.project_conflicted(p,p_actor)))
    ), page as (
      select s.*, coalesce(s.occurred_at,s.expires_at,'0001-01-01'::timestamptz) as sort_at
      from source s
      where (p_domain is null or p_domain=s.domain) and (p_status is null or p_status=s.status)
        and (p_action is null or p_action=s.action) and (p_scope is null or p_scope=s.scope_key)
        and (p_target is null or p_target=s.target_id)
        and (p_view in ('restrictions','content') or (s.occurred_at>=since_at and s.occurred_at<=least(until_at,high_mark)))
        and (p_before_at is null or (coalesce(s.occurred_at,s.expires_at,'0001-01-01'::timestamptz),s.source collate "C",s.id)
          < (p_before_at,p_before_source collate "C",p_before_id))
      order by sort_at desc,s.source collate "C" desc,s.id desc limit p_take+1
    )
    select jsonb_build_object('high',high_mark,'metrics',null,'rows',coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'source',source,'domain',domain,'target',target,'targetId',target_id,'scopeKey',scope_key,
      'status',status,'action',action,'occurredAt',occurred_at,'sortAt',sort_at,'expiresAt',expires_at,'actorRef',actor_ref,
      'caseReference',case when source='account_enforcement' then
        case when p_view='restrictions' then id else (select h.case_id from private.m22_account_history h where h.id=page.id) end end
    ) order by sort_at desc,source collate "C" desc,id desc),'[]'::jsonb)) from page
  );
end
$$;
create or replace function public.admin_overview_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'members',(select count(*) from auth.users u where not u.is_anonymous and u.deleted_at is null and u.email_confirmed_at is not null
      and not exists (select 1 from public.member_metric_exclusions where user_id=u.id)),
    'organizations',(select count(*) from private.organizations where status='active'),
    'recentMembershipEvents',(select count(*) from private.organization_affiliation_events where occurred_at>=now()-interval '30 days'),
    'pendingVerifications',(select count(*) from private.verification_applications where status='pending'),
    'restrictedAccounts',(select count(distinct target_id) from private.m21_restriction_source where domain='accounts'),
    'recentAdminActions',(select count(*) from private.platform_admin_audit where occurred_at>=now()-interval '30 days')
  );
end;
$$;
create or replace function public.safety_overview_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'pendingPostReports',(select count(*) from feed_data.content_reports where status='pending'),
    'pendingCommentReports',(select count(*) from feed_data.comment_reports where status='pending'),
    'pendingAppeals',(select count(*) from feed_data.moderation_appeals where outcome='pending'),
    'restrictedAccounts',(select count(distinct target_id) from private.m21_restriction_source where domain='accounts'),
    'moderationActions30Days',(select count(*) from feed_data.post_moderation_actions where created_at>=now()-interval '30 days')
      +(select count(*) from feed_data.comment_moderation_actions where created_at>=now()-interval '30 days'),
    'cleanupBacklog',(select count(*) from feed_data.post_attachments m where feed_data.media_cleanup_allowed(m)));
end;
$$;
alter function public.admin_accounts_for_api(uuid,text,integer) rename to m22_admin_account_projection;
alter function public.m22_admin_account_projection(uuid,text,integer) set schema private;
revoke all on function private.m22_admin_account_projection(uuid,text,integer) from public,anon,authenticated,service_role;

create function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg((x.account-'enforcement'-'restrictionRevision'-'enforcementEligible') ||
    case when x.account->'enforcement'->>'legacy' is null and x.account->'enforcement'->>'kind' is not null
      then jsonb_build_object('reason',null) else '{}'::jsonb end order by x.position),'[]'::jsonb)
  from jsonb_array_elements(private.m22_admin_account_projection(p_actor,p_query,p_offset)) with ordinality x(account,position)
$$;

create function public.m22_admin_accounts_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_query text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.platform_admin(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'access denied' using errcode='42501'; end if;
  return private.m22_admin_account_projection(p_actor,p_query,p_offset);
end
$$;
revoke all on function public.admin_accounts_for_api(uuid,text,integer),
  public.m22_admin_accounts_for_api(uuid,uuid,boolean,bigint,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_accounts_for_api(uuid,text,integer),
  public.m22_admin_accounts_for_api(uuid,uuid,boolean,bigint,uuid,text,integer) to service_role;
