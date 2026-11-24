create table private.m23_capabilities (
  capability text primary key,
  high_impact boolean not null default false,
  scopes text[] not null default '{}'
);
insert into private.m23_capabilities(capability,high_impact,scopes) values
  ('post',false,'{community,organization}'),('comment',false,'{community,organization}'),
  ('reaction',false,'{community,organization}'),('repost',false,'{community,organization}'),
  ('follow',false,'{organization}'),('mention',false,'{community,organization}'),('media',false,'{}'),
  ('organization_create',false,'{}'),('organization_claim',false,'{organization}'),
  ('organization_publish',false,'{organization}'),('organization_manage',true,'{organization}'),
  ('event_create',false,'{organization,community,project}'),('event_manage',true,'{event,organization,community,project}'),
  ('event_announce',false,'{event,organization,community,project}'),('event_rsvp',false,'{event,organization,community,project}'),
  ('community_create',false,'{}'),('community_publish',false,'{community}'),('group_manage',true,'{community}'),
  ('project_create',false,'{organization,community,project}'),('project_update',false,'{project,organization,community}'),
  ('volunteer_apply',false,'{project,organization,community}'),('project_manage',true,'{project,organization,community}'),
  ('poll_create',false,'{organization,community,project}'),('nomination',false,'{poll,organization,community,project}'),
  ('poll_manage',true,'{poll,organization,community,project}');

create table private.m23_delegations (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references auth.users(id) on delete set null,
  issuer_id uuid references auth.users(id) on delete set null,
  capability text not null references private.m23_capabilities,
  scope_kind text not null,
  scope_id uuid,
  max_minutes integer not null check(max_minutes between 1 and 10080),
  starts_at timestamptz not null, expires_at timestamptz, revoked_at timestamptz,
  expiry_id uuid not null unique default gen_random_uuid(),
  version integer not null default 1,
  check ((scope_kind='platform')=(scope_id is null)),
  check (expires_at is null or expires_at>starts_at)
);
create index m23_delegations_moderator on private.m23_delegations(moderator_id,capability,scope_kind,scope_id) where revoked_at is null;

create table private.m23_restrictions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references auth.users(id) on delete set null,
  capability text not null references private.m23_capabilities,
  scope_kind text not null,
  scope_id uuid,
  issuer_id uuid references auth.users(id) on delete set null,
  authority text not null check(authority in ('founder','administrator','moderator')),
  delegation_id uuid references private.m23_delegations,
  max_minutes integer not null check (max_minutes between 1 and 129600),
  category text not null check(category in ('safety','harassment','spam','integrity','other')),
  starts_at timestamptz not null, expires_at timestamptz, revoked_at timestamptz,
  expiry_id uuid not null unique default gen_random_uuid(),
  version integer not null default 1,
  check ((scope_kind='platform')=(scope_id is null)),
  check (expires_at>starts_at or (expires_at is null and authority='founder'))
);
create index m23_restrictions_subject on private.m23_restrictions(subject_id,capability,starts_at desc);
create index m23_restrictions_current on private.m23_restrictions(subject_id,capability,scope_kind,scope_id) where revoked_at is null;

create table private.m23_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, subject_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null, authority text not null,
  workspace_id uuid not null, request_id uuid not null, command jsonb not null,
  capability text not null, scope_kind text not null, scope_id uuid,
  action text not null, reason text not null,
  happened_at timestamptz not null, policy_version integer not null default 1,
  previous jsonb, current jsonb not null
);
create unique index m23_event_request_capability on private.m23_events(actor_id,request_id,capability);
create index m23_event_clock on private.m23_events(happened_at desc,id desc);

alter table private.m23_capabilities enable row level security;
alter table private.m23_delegations enable row level security;
alter table private.m23_restrictions enable row level security;
alter table private.m23_events enable row level security;
revoke all on private.m23_capabilities,private.m23_delegations,private.m23_restrictions,private.m23_events
  from public,anon,authenticated,service_role;

create function private.m23_scope_exists(p_kind text,p_id uuid)
returns boolean language sql stable set search_path='' as $$
  select case p_kind
    when 'platform' then p_id is null
    when 'community' then exists(select from feed_data.communities where id=p_id)
    when 'organization' then exists(select from private.organizations where id=p_id)
    when 'event' then exists(select from feed_data.events where id=p_id)
    when 'project' then exists(select from private.community_projects where id=p_id)
    when 'poll' then exists(select from private.polls where id=p_id)
    else false end
$$;

create function private.m23_scope_includes(p_parent text,p_parent_id uuid,p_child text,p_child_id uuid)
returns boolean language sql stable set search_path='' as $$
  select p_parent='platform' or (p_parent=p_child and p_parent_id=p_child_id) or case p_child
    when 'event' then exists(select from feed_data.events e where e.id=p_child_id and (
      (p_parent='organization' and p_parent_id=e.organization_id) or
      (p_parent='community' and p_parent_id=e.community_id) or
      (e.project_id is not null and private.m23_scope_includes(p_parent,p_parent_id,'project',e.project_id))))
    when 'poll' then exists(select from private.polls p where p.id=p_child_id and (
      (p_parent='organization' and p_parent_id=p.organization_id) or
      (p_parent='community' and p_parent_id=p.community_id) or
      (p.project_id is not null and private.m23_scope_includes(p_parent,p_parent_id,'project',p.project_id))))
    when 'project' then exists(select from private.community_projects p where p.id=p_child_id and (
      (p_parent='organization' and p_parent_id=p.organization_id) or
      (p_parent='community' and p_parent_id in (p.community_id,p.association_id))))
    else false end
$$;
revoke all on function private.m23_scope_includes(text,uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.m23_require(p_actor uuid,p_capability text,p_scope text default null,p_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Serialize actions by member with sanctions issued in the same transaction ordering.
  if p_actor is null then return; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended(p_actor::text,20261123133000));
  if exists(select from private.m23_restrictions r where r.subject_id=p_actor and r.capability=p_capability
    and r.starts_at<=clock_timestamp() and r.revoked_at is null and (r.expires_at is null or r.expires_at>clock_timestamp())
    and (r.scope_kind='platform' or (r.scope_kind=p_scope and r.scope_id=p_id)))
  then raise exception 'feature restriction active' using errcode='M2301'; end if;
end
$$;

create function private.m23_moderator(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and private.verified_totp(p_actor)
    and exists(select from public.role_assignments r where r.user_id=p_actor and r.role='moderator')
$$;

create function private.m23_live_delegations(p_actor uuid,p_at timestamptz)
returns setof private.m23_delegations language sql stable set search_path='' as $$
  select d.* from private.m23_delegations d where d.moderator_id=p_actor and d.revoked_at is null
    and d.starts_at<=p_at and (d.expires_at is null or d.expires_at>p_at)
    and private.m23_moderator(p_actor) and private.platform_admin(d.issuer_id)
$$;

-- Reuse S2C's session, expiry, MFA and cancellation lifecycle with a least-privilege workspace kind.
alter table private.s2b_workflows drop constraint s2b_workflows_kind_check,drop constraint s2b_workflows_binding_check,
  add constraint s2b_workflows_kind_check check(kind in ('organization_draft','revoke_other_sessions','admin_workspace','verification_workspace','moderation_workspace')),
  add constraint s2b_workflows_binding_check check(
    (kind='organization_draft' and step='resume' and bound_session is null)
    or (bound_session is not null and scope_id=owner_id and
      ((kind='revoke_other_sessions' and step='confirm') or (kind='admin_workspace' and step='admin')
      or (kind='verification_workspace' and step='review') or (kind='moderation_workspace' and step='moderation'))));

create or replace function private.s2c_workspace_allowed(p_actor uuid,p_kind text)
returns boolean language sql stable set search_path='' as $$
  select case p_kind when 'admin_workspace' then private.s2a_leadership(p_actor)
    when 'verification_workspace' then private.institution_reviewer(p_actor)
    when 'moderation_workspace' then exists(select from private.m23_live_delegations(p_actor,statement_timestamp()))
    else false end
$$;

revoke all on function private.m23_scope_exists(text,uuid),private.m23_require(uuid,text,text,uuid),
  private.m23_moderator(uuid),private.m23_live_delegations(uuid,timestamptz) from public,anon,authenticated,service_role;
create or replace function public.s2b_workflow_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_action text,p_kind text,p_id uuid,p_step text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  flow private.s2b_workflows;
  prior private.s2b_security_events;
  step_name text;
  opened_at timestamptz;
  deadline timestamptz;
begin
  if p_kind is distinct from 'admin_workspace' and p_kind is distinct from 'verification_workspace'
    and p_kind is distinct from 'moderation_workspace'
    and p_step is distinct from 'admin' and p_step is distinct from 'review' and p_step is distinct from 'moderation' then
    return private.s2b_initial_workflow_for_api(p_actor,p_session,p_aal2,p_totp,
      p_action,p_kind,p_id,p_step,p_expected,p_request);
  end if;
  if p_action in ('open','cancel') then perform private.s2b_lock_actor(p_actor,p_session); end if;

  if p_action='open' then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not private.s2c_workspace_allowed(p_actor,p_kind) then return null; end if;
    if not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
      then raise exception 'recent MFA required' using errcode='O5001'; end if;
    step_name:=case p_kind when 'admin_workspace' then 'admin' when 'moderation_workspace' then 'moderation' else 'review' end;
    select * into flow from private.s2b_workflows w where w.owner_id=p_actor and w.kind=p_kind
      and w.bound_session=p_session and w.state='open' and w.expires_at>clock_timestamp()
      order by w.created_at desc limit 1;
    if not found then
      if (select count(*) from private.s2b_security_events where actor_id=p_actor
        and occurred_at>clock_timestamp()-interval '1 day')>=100
        then raise exception 'command limit' using errcode='54000'; end if;
      opened_at:=clock_timestamp();
      select least(opened_at+interval '5 minutes',to_timestamp(p_totp)+interval '15 minutes',s.not_after,
        private.s2a_deadline(s.created_at,p.privileged_at_sign_in or private.s2a_leadership(p_actor),p.remembered))
        into deadline from auth.sessions s join private.s2a_session_policy p on p.session_id=s.id
        where s.id=p_session and s.user_id=p_actor;
      if deadline is null or deadline<=opened_at then return null; end if;
      insert into private.s2b_workflows(owner_id,kind,scope_id,step,bound_session,created_at,expires_at)
        values(p_actor,p_kind,p_actor,step_name,p_session,opened_at,deadline) returning * into flow;
      insert into private.s2b_security_events(actor_id,scope_ref,action,mfa_verified_at)
        values(p_actor,flow.id,'workflow_created',to_timestamp(p_totp));
    end if;
  elsif p_action in ('read','cancel') and p_step in ('admin','review','moderation') then
    select * into flow from private.s2b_workflows w where w.id=p_id
      and w.owner_id=p_actor and w.bound_session=p_session and w.step=p_step and w.expires_at>clock_timestamp();
    if not found or not private.s2c_workspace_allowed(p_actor,flow.kind)
      or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
      then return null; end if;

    if p_action='cancel' then
      if p_request is null or p_expected is null then return null; end if;
      select * into prior from private.s2b_security_events where actor_id=p_actor and request_ref=p_request;
      if found then
        if prior.scope_ref=flow.id and prior.action='workflow_cancelled' and prior.version-1=p_expected
          then return jsonb_build_object('state','cancelled','affected',null); end if;
        raise exception 'request conflict' using errcode='O2002';
      end if;
      if flow.state<>'open' or flow.version<>p_expected then return null; end if;
      update private.s2b_workflows set state='cancelled',version=version+1 where id=flow.id returning * into flow;
      insert into private.s2b_security_events(actor_id,scope_ref,action,version,request_ref,mfa_verified_at)
        values(p_actor,flow.id,'workflow_cancelled',flow.version,p_request,to_timestamp(p_totp));
      return jsonb_build_object('state','cancelled','affected',null);
    end if;
    if flow.state<>'open' then return null; end if;
  else return null;
  end if;
  return jsonb_build_object('id',flow.id,'kind',flow.kind,'step',flow.step,'version',flow.version,'expiresAt',flow.expires_at);
end;
$$;
create function private.m23_authority(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid)
returns text language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    then raise exception 'recent MFA required' using errcode='O5001'; end if;
  if private.platform_admin(p_actor) and
    public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is not null
    then return case when private.platform_founder(p_actor) then 'founder' else 'administrator' end; end if;
  if private.m23_moderator(p_actor) and
    public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'moderation',null,null) is not null
    then return 'moderator'; end if;
  raise exception 'workspace required' using errcode='42501';
end
$$;

create function private.m23_case_summary(p_case private.m23_restrictions,p_now timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p_case.id,'subject',p_case.subject_id,'capability',p_case.capability,
    'scope',p_case.scope_kind,'scopeId',p_case.scope_id,'authority',p_case.authority,'issuer',p_case.issuer_id,
    'version',p_case.version,'category',p_case.category,'startsAt',p_case.starts_at,'expiresAt',p_case.expires_at,
    'status',case when p_case.revoked_at is not null then 'revoked' when p_case.expires_at<=p_now then 'expired' else 'active' end)
$$;

create function private.m23_delegation_summary(p_case private.m23_delegations,p_now timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p_case.id,'subject',p_case.moderator_id,'issuer',p_case.issuer_id,
    'capability',p_case.capability,'scope',p_case.scope_kind,'scopeId',p_case.scope_id,'version',p_case.version,
    'maxMinutes',p_case.max_minutes,'startsAt',p_case.starts_at,'expiresAt',p_case.expires_at,
    'status',case when p_case.revoked_at is not null then 'revoked' when p_case.expires_at<=p_now then 'expired'
      when not private.m23_moderator(p_case.moderator_id) or not private.platform_admin(p_case.issuer_id)
        then 'inactive' else 'active' end)
$$;

create function public.m23_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_request uuid,p_subject uuid,p_action text,p_caps text[],p_scope text,p_scope_id uuid,p_case uuid,
  p_version integer,p_minutes integer,p_max integer,p_indefinite boolean,p_category text,p_reason text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  power text;
  moment timestamptz;
  term_end timestamptz;
  cap private.m23_capabilities;
  delegation private.m23_delegations;
  sanctioned private.m23_restrictions;
  prior private.m23_events;
  ceiling integer;
  before_value jsonb;
  after_value jsonb;
  stable_id uuid;
  results jsonb:='[]'::jsonb;
  is_delegation boolean:=p_action in ('delegate','update_delegation','revoke_delegation');
  input jsonb:=jsonb_build_array(p_subject,p_action,p_caps,p_scope,p_scope_id,p_case,p_version,p_minutes,p_max,p_indefinite,p_category,btrim(p_reason));
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  power:=private.m23_authority(p_actor,p_session,p_aal2,p_totp,p_workspace);
  if p_subject is null or p_subject=p_actor or private.s2a_leadership(p_subject)
    or (is_delegation and power='moderator')
    then raise exception 'protected subject or authority' using errcode='42501'; end if;
  if not exists(select from auth.users u where u.id=p_subject and u.email_confirmed_at is not null
    and u.deleted_at is null and not u.is_anonymous) then raise exception 'subject unavailable' using errcode='O2003'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_subject::text,20261123133000));
  moment:=clock_timestamp();
  if p_action is null or p_action not in ('restrict','extend','revoke','delegate','update_delegation','revoke_delegation')
    or p_request is null or p_confirmed is distinct from true or coalesce(length(btrim(p_reason)),0) not between 10 and 500
    or p_reason ~ '[[:cntrl:]]' or coalesce(cardinality(p_caps),0) not between 1 and 25
    or cardinality(p_caps)<>(select count(distinct c) from unnest(p_caps) c)
    or (p_action in ('extend','revoke','update_delegation','revoke_delegation') and
      (p_case is null or p_version is null or cardinality(p_caps)<>1))
    or (p_action in ('restrict','delegate') and (p_case is not null or p_version is not null))
    or not private.m23_scope_exists(p_scope,p_scope_id)
    then raise exception 'invalid feature enforcement command' using errcode='23514'; end if;
  if p_indefinite and (p_action<>'restrict' or power<>'founder' or p_minutes is not null)
    then raise exception 'Founder indefinite authority required' using errcode='42501'; end if;
  if p_action='restrict' and (p_category is null or p_category not in ('safety','harassment','spam','integrity','other'))
    then raise exception 'invalid category' using errcode='23514'; end if;
  if p_action in ('delegate','update_delegation') and
    (not private.m23_moderator(p_subject) or p_max is null or p_max not between 1 and 10080
      or (p_minutes is not null and p_minutes not between 1 and 129600))
    then raise exception 'invalid delegation' using errcode='23514'; end if;

  select * into prior from private.m23_events where actor_id=p_actor and request_id=p_request limit 1;
  if found then
    if prior.command is distinct from input then raise exception 'request conflict' using errcode='O2002'; end if;
    return (select jsonb_agg(current order by capability) from private.m23_events where actor_id=p_actor and request_id=p_request);
  end if;

  for cap in select * from private.m23_capabilities where capability=any(p_caps) order by capability loop
    if (p_scope<>'platform' and not (p_scope=any(cap.scopes))) or
      (cap.high_impact and (is_delegation or power<>'founder'))
      then raise exception 'scope or capability forbidden' using errcode='42501'; end if;
    before_value:=null;
    if is_delegation then
      term_end:=moment+make_interval(mins=>p_minutes);
      if p_action='delegate' then
        if exists(select from private.m23_delegations d where d.moderator_id=p_subject and d.capability=cap.capability
          and d.scope_kind=p_scope and d.scope_id is not distinct from p_scope_id and d.revoked_at is null
          and (d.expires_at is null or d.expires_at>moment))
          then raise exception 'delegation already exists' using errcode='55000'; end if;
        insert into private.m23_delegations(moderator_id,issuer_id,capability,scope_kind,scope_id,max_minutes,starts_at,expires_at)
          values(p_subject,p_actor,cap.capability,p_scope,p_scope_id,p_max,moment,term_end) returning * into delegation;
      else
        select * into delegation from private.m23_delegations where id=p_case and moderator_id=p_subject
          and capability=cap.capability and scope_kind=p_scope and scope_id is not distinct from p_scope_id
          and version=p_version and revoked_at is null and (expires_at is null or expires_at>moment);
        if not found then raise exception 'delegation changed' using errcode='O2004'; end if;
        if power<>'founder' and delegation.issuer_id is distinct from p_actor
          then raise exception 'delegation issuer required' using errcode='42501'; end if;
        before_value:=private.m23_delegation_summary(delegation,moment);
        update private.m23_delegations set version=version+1,
          max_minutes=case when p_action='update_delegation' then p_max else max_minutes end,
          expires_at=case when p_action='update_delegation' then term_end else expires_at end,
          revoked_at=case when p_action='revoke_delegation' then moment end
          where id=delegation.id returning * into delegation;
      end if;
      after_value:=private.m23_delegation_summary(delegation,moment);
      stable_id:=delegation.id;
    else
      ceiling:=129600;
      if power='moderator' then
        if (p_scope='organization' and exists(select from private.organization_memberships
          where organization_id=p_scope_id and user_id=p_actor and revoked_at is null
            and (expires_at is null or expires_at>moment) and role in ('owner','administrator')))
          or (p_scope='community' and exists(select from feed_data.communities where id=p_scope_id and owner_id=p_actor))
          or (p_scope='event' and exists(select from feed_data.events where id=p_scope_id and creator_id=p_actor))
          or (p_scope='project' and exists(select from private.community_projects where id=p_scope_id and creator_id=p_actor))
          or (p_scope='poll' and exists(select from private.polls where id=p_scope_id and creator_id=p_actor))
          then raise exception 'resource management conflict' using errcode='42501'; end if;
        select * into delegation from private.m23_live_delegations(p_actor,moment) d
          where d.capability=cap.capability and (d.scope_kind='platform' or
            (d.scope_kind=p_scope and d.scope_id=p_scope_id))
          order by d.max_minutes desc,d.id limit 1;
        if not found then raise exception 'delegation required' using errcode='42501'; end if;
        ceiling:=delegation.max_minutes;
      end if;
      if p_action<>'revoke' and not coalesce(p_indefinite,false) and (p_minutes is null or p_minutes not between 1 and ceiling)
        then raise exception 'duration limit' using errcode='M2302'; end if;
      term_end:=case when p_indefinite then null else moment+make_interval(mins=>p_minutes) end;
      if p_action='restrict' then
        if exists(select from private.m23_restrictions r where r.subject_id=p_subject and r.capability=cap.capability
          and (private.m23_scope_includes(r.scope_kind,r.scope_id,p_scope,p_scope_id)
            or private.m23_scope_includes(p_scope,p_scope_id,r.scope_kind,r.scope_id))
          and r.revoked_at is null and (r.expires_at is null or r.expires_at>moment))
          then raise exception 'overlapping restriction' using errcode='55000'; end if;
        if power<>'founder' and exists(select from private.m23_restrictions r where r.subject_id=p_subject and r.capability=cap.capability
          and (private.m23_scope_includes(r.scope_kind,r.scope_id,p_scope,p_scope_id)
            or private.m23_scope_includes(p_scope,p_scope_id,r.scope_kind,r.scope_id))
          and greatest(r.starts_at+make_interval(mins=>greatest(ceiling,r.max_minutes)),
            least(r.revoked_at,r.expires_at)+interval '24 hours')>moment)
          then raise exception 'renewal limit' using errcode='M2302'; end if;
        insert into private.m23_restrictions(subject_id,capability,scope_kind,scope_id,issuer_id,authority,
          delegation_id,max_minutes,category,starts_at,expires_at)
          values(p_subject,cap.capability,p_scope,p_scope_id,p_actor,power,
            case when power='moderator' then delegation.id end,ceiling,p_category,moment,term_end) returning * into sanctioned;
      else
        select * into sanctioned from private.m23_restrictions where id=p_case and subject_id=p_subject
          and capability=cap.capability and scope_kind=p_scope and scope_id is not distinct from p_scope_id
          and version=p_version and revoked_at is null and (expires_at is null or expires_at>moment);
        if not found then raise exception 'restriction changed' using errcode='O2004'; end if;
        if power='moderator' and sanctioned.issuer_id is distinct from p_actor
          or power<>'founder' and sanctioned.expires_at is null
          then raise exception 'revocation authority required' using errcode='42501'; end if;
        before_value:=private.m23_case_summary(sanctioned,moment);
        if p_action='extend' and (sanctioned.expires_at is null or term_end<=sanctioned.expires_at
          or term_end>sanctioned.starts_at+make_interval(mins=>least(ceiling,sanctioned.max_minutes)))
          then raise exception 'extension limit' using errcode='M2302'; end if;
        update private.m23_restrictions set version=version+1,
          expires_at=case when p_action='extend' then term_end else expires_at end,
          revoked_at=case when p_action='revoke' then moment end
          where id=sanctioned.id returning * into sanctioned;
      end if;
      after_value:=private.m23_case_summary(sanctioned,moment);
      stable_id:=sanctioned.id;
    end if;
    insert into private.m23_events(case_id,subject_id,actor_id,authority,workspace_id,request_id,command,
      capability,scope_kind,scope_id,action,reason,happened_at,previous,current)
    values(stable_id,p_subject,p_actor,power,p_workspace,p_request,input,cap.capability,p_scope,p_scope_id,p_action,
      btrim(p_reason),moment,before_value,after_value);
    results:=results || jsonb_build_array(after_value);
  end loop;
  if jsonb_array_length(results)<>cardinality(p_caps) then raise exception 'unknown capability' using errcode='23514'; end if;
  return results;
end
$$;
create function private.m23_resource_guard(p_actor uuid,p_cap text,p_kind text,p_key uuid)
returns void language plpgsql security definer set search_path='' as $$
declare relation record;
begin
  perform private.m23_require(p_actor,p_cap,p_kind,p_key);
  if p_kind='post' then
    select p.organization_id,p.community_id into relation from feed_data.posts p where p.id=p_key;
  elsif p_kind='event' then
    select e.organization_id,e.community_id,e.project_id into relation from feed_data.events e where e.id=p_key;
    if found and relation.project_id is not null then
      perform private.m23_resource_guard(p_actor,p_cap,'project',relation.project_id);
    end if;
  elsif p_kind='project' then
    select p.organization_id,p.community_id,p.association_id into relation from private.community_projects p where p.id=p_key;
    if found and relation.association_id is not null then
      perform private.m23_require(p_actor,p_cap,'community',relation.association_id);
    end if;
  elsif p_kind='poll' then
    select p.organization_id,p.community_id,p.project_id into relation from private.polls p where p.id=p_key;
    if found and relation.project_id is not null then
      perform private.m23_resource_guard(p_actor,p_cap,'project',relation.project_id);
    end if;
  else return;
  end if;
  if relation.organization_id is not null then perform private.m23_require(p_actor,p_cap,'organization',relation.organization_id); end if;
  if relation.community_id is not null then perform private.m23_require(p_actor,p_cap,'community',relation.community_id); end if;
end
$$;

create function private.m23_feed_write_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; publisher uuid;
begin
  case tg_table_name
  when 'posts' then
    if tg_op='UPDATE' and (new.deleted_at is not null or
      (new.body is not distinct from old.body and new.language is not distinct from old.language
        and (new.status is distinct from 'published' or old.status is distinct from 'draft')
        and new.visibility is not distinct from old.visibility
        and new.organization_id is not distinct from old.organization_id
        and new.community_id is not distinct from old.community_id
        and new.linked_event_id is not distinct from old.linked_event_id))
      then return new; end if;
    if new.linked_event_id is not null and (tg_op='INSERT' or new.linked_event_id is distinct from old.linked_event_id) then
      perform private.m23_resource_guard(new.author_id,'event_announce','event',new.linked_event_id);
    end if;
    if new.community_id is not null then
      perform private.m23_require(new.author_id,'community_publish','community',new.community_id);
    end if;
    if new.organization_id is not null then
      perform private.m23_require(new.author_id,'organization_publish','organization',new.organization_id);
    end if;
    perform private.m23_require(new.author_id,'post','community',new.community_id);
    if new.organization_id is not null then
      perform private.m23_require(new.author_id,'post','organization',new.organization_id);
    end if;
  when 'comments' then
    if tg_op='UPDATE' and (new.deleted_at is not null or new.body is not distinct from old.body) then return new; end if;
    perform private.m23_resource_guard(new.author_id,'comment','post',new.post_id);
  when 'post_reactions' then
    perform private.m23_resource_guard(new.user_id,'reaction','post',new.post_id);
  when 'comment_reactions' then
    select c.post_id into target from feed_data.comments c where c.id=new.comment_id;
    perform private.m23_resource_guard(new.user_id,'reaction','post',target);
  when 'reposts' then
    perform private.m23_resource_guard(new.actor_id,'repost','post',new.post_id);
  when 'post_quotes' then
    select p.author_id into publisher from feed_data.posts p where p.id=new.post_id;
    perform private.m23_resource_guard(publisher,'repost','post',new.source_id);
    perform private.m23_resource_guard(publisher,'repost','post',new.post_id);
  when 'member_follows' then
    perform private.m23_require(new.follower_id,'follow');
  when 'institution_follows' then
    perform private.m23_require(new.follower_id,'follow','organization',new.organization_id);
  when 'follow_requests' then
    perform private.m23_require(new.requester_id,'follow');
  when 'social_mentions' then
    if new.member_id is null and new.organization_id is null then return new; end if;
    if exists(select from feed_data.social_mentions m where m.post_id=new.post_id
      and m.comment_id is not distinct from new.comment_id and m.token=new.token
      and m.member_id is not distinct from new.member_id and m.organization_id is not distinct from new.organization_id)
      then return new; end if;
    if new.comment_id is null then select p.author_id into publisher from feed_data.posts p where p.id=new.post_id;
    else select c.author_id into publisher from feed_data.comments c where c.id=new.comment_id; end if;
    perform private.m23_resource_guard(publisher,'mention','post',new.post_id);
    if new.organization_id is not null then perform private.m23_require(publisher,'mention','organization',new.organization_id); end if;
  when 'post_attachments' then
    if tg_op='INSERT' or (new.state='ready' and old.state='uploading')
      or (new.state='uploading' and new.lease is not null and new.lease is distinct from old.lease)
      or (new.state='attached' and new.post_id is distinct from old.post_id)
      then perform private.m23_require(new.author_id,'media'); end if;
  end case;
  return new;
end
$$;

create trigger m23_post_guard before insert or update on feed_data.posts for each row execute function private.m23_feed_write_guard();
create trigger m23_comment_guard before insert or update on feed_data.comments for each row execute function private.m23_feed_write_guard();
create trigger m23_post_reaction_guard before insert or update of kind on feed_data.post_reactions for each row execute function private.m23_feed_write_guard();
create trigger m23_comment_reaction_guard before insert or update of kind on feed_data.comment_reactions for each row execute function private.m23_feed_write_guard();
create trigger m23_repost_guard before insert on feed_data.reposts for each row execute function private.m23_feed_write_guard();
create trigger m23_quote_guard before insert on feed_data.post_quotes for each row execute function private.m23_feed_write_guard();
create trigger m23_follow_guard before insert on feed_data.member_follows for each row execute function private.m23_feed_write_guard();
create trigger m23_institution_follow_guard before insert on feed_data.institution_follows for each row execute function private.m23_feed_write_guard();
create trigger m23_follow_request_guard before insert on feed_data.follow_requests for each row execute function private.m23_feed_write_guard();
create trigger m23_mention_guard before insert on feed_data.social_mentions for each row execute function private.m23_feed_write_guard();
create trigger m23_attachment_guard before insert or update on feed_data.post_attachments for each row execute function private.m23_feed_write_guard();

create function private.m23_resource_write_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cap text;
begin
  case tg_table_name
  when 'organizations' then
    perform private.m23_require(coalesce(actor,new.created_by),'organization_create');
  when 'verification_applications' then
    if new.kind in ('claim','representative') then
      perform private.m23_require(new.applicant_id,'organization_claim','organization',new.organization_id);
    end if;
  when 'organization_invitations' then
    perform private.m23_require(coalesce(actor,new.invited_by),'organization_manage','organization',new.organization_id);
  when 'organization_role_audit' then
    perform private.m23_require(new.actor_id,'organization_manage','organization',new.organization_id);
  when 'organization_affiliation_events' then
    if new.event in ('invited','approved','rejected','type_changed','removed','suspended','reinstated','policy_changed') then
      perform private.m23_require(new.actor_id,'organization_manage','organization',new.organization_id);
    end if;
  when 'events' then
    if tg_op='INSERT' then
      actor:=coalesce(actor,new.creator_id);
      perform private.m23_require(actor,'event_create','organization',new.organization_id);
      if new.community_id is not null then perform private.m23_require(actor,'event_create','community',new.community_id); end if;
      if new.project_id is not null then perform private.m23_resource_guard(actor,'event_create','project',new.project_id); end if;
    elsif new.moderated_at is not distinct from old.moderated_at and new.status not in ('canceled','completed') then
      perform private.m23_resource_guard(actor,'event_manage','event',old.id);
      if new.organization_id is distinct from old.organization_id then
        perform private.m23_require(actor,'event_manage','organization',new.organization_id); end if;
      if new.community_id is distinct from old.community_id then perform private.m23_require(actor,'event_manage','community',new.community_id); end if;
      if new.project_id is distinct from old.project_id and new.project_id is not null then
        perform private.m23_resource_guard(actor,'event_manage','project',new.project_id); end if;
      if old.status='draft' and new.status='published' then perform private.m23_resource_guard(actor,'event_create','event',old.id); end if;
    end if;
  when 'event_updates' then
    perform private.m23_resource_guard(new.author_id,'event_announce','event',new.event_id);
  when 'event_rsvps' then
    if new.response<>'not_going' and (tg_op='INSERT' or new.response is distinct from old.response or (new.list_me and not old.list_me))
      then perform private.m23_resource_guard(new.user_id,'event_rsvp','event',new.event_id); end if;
  when 'communities' then
    if tg_op='INSERT' then perform private.m23_require(actor,'community_create');
    elsif new.owner_id is not distinct from old.owner_id then perform private.m23_require(actor,'group_manage','community',new.id); end if;
  when 'group_audit' then
    if new.action in ('approve','reject','invite','remove','staff','transfer') then
      perform private.m23_require(new.actor_id,'group_manage','community',new.community_id);
    end if;
  when 'community_projects' then
    if tg_op='INSERT' then
      actor:=coalesce(actor,new.creator_id);
      perform private.m23_require(actor,'project_create','organization',new.organization_id);
      if new.community_id is not null then perform private.m23_require(actor,'project_create','community',new.community_id); end if;
      if new.association_id is not null then perform private.m23_require(actor,'project_create','community',new.association_id); end if;
    elsif new.status='submitted' and old.status<>'submitted' then
      perform private.m23_resource_guard(actor,'project_create','project',new.id);
    end if;
  when 'project_progress_entries' then
    if new.kind='update' and tg_op='INSERT' then
      perform private.m23_resource_guard(new.author_id,'project_update','project',new.project_id);
    elsif new.kind='update' and new.state='submitted' and old.state<>'submitted' then
      perform private.m23_resource_guard(actor,'project_update','project',new.project_id);
    end if;
  when 'project_operations_events' then
    if new.action='volunteer_apply' then
      perform private.m23_resource_guard(new.actor_id,'volunteer_apply','project',new.project_id);
    elsif new.action in ('invite','opportunity_publish','volunteer_offer','volunteer_reject',
      'task_create','task_edit','task_assign','task_approve','task_return','task_cancel') then
      perform private.m23_resource_guard(new.actor_id,'project_manage','project',new.project_id);
    end if;
  when 'polls' then
    if tg_op='INSERT' then
      actor:=coalesce(actor,new.creator_id);
      perform private.m23_require(actor,'poll_create','organization',new.organization_id);
      if new.community_id is not null then perform private.m23_require(actor,'poll_create','community',new.community_id); end if;
      if new.project_id is not null then perform private.m23_resource_guard(actor,'poll_create','project',new.project_id); end if;
    elsif new.status='draft' or (new.status='published' and old.status='draft') then
      perform private.m23_resource_guard(actor,'poll_manage','poll',new.id);
      if new.status='published' then perform private.m23_resource_guard(actor,'poll_create','poll',new.id); end if;
    end if;
  when 'poll_options' then
    if new.nominee_id is not null then perform private.m23_resource_guard(actor,'nomination','poll',new.poll_id); end if;
  when 'poll_decisions' then
    perform private.m23_resource_guard(coalesce(actor,new.actor_id),'poll_manage','poll',new.poll_id);
  end case;
  return new;
end
$$;

create trigger m23_org_create before insert on private.organizations for each row execute function private.m23_resource_write_guard();
create trigger m23_org_claim before insert on private.verification_applications for each row execute function private.m23_resource_write_guard();
create trigger m23_org_invite before insert on private.organization_invitations for each row execute function private.m23_resource_write_guard();
create trigger m23_org_roles before insert on private.organization_role_audit for each row execute function private.m23_resource_write_guard();
create trigger m23_affiliations before insert on private.organization_affiliation_events for each row execute function private.m23_resource_write_guard();
create trigger m23_event_guard before insert or update on feed_data.events for each row execute function private.m23_resource_write_guard();
create trigger m23_event_announce before insert on feed_data.event_updates for each row execute function private.m23_resource_write_guard();
create trigger m23_event_rsvp before insert or update on feed_data.event_rsvps for each row execute function private.m23_resource_write_guard();
create trigger m23_group_guard before insert or update on feed_data.communities for each row execute function private.m23_resource_write_guard();
create trigger m23_project_guard before insert or update of status on private.community_projects for each row execute function private.m23_resource_write_guard();
create trigger m23_project_updates before insert or update of state on private.project_progress_entries for each row execute function private.m23_resource_write_guard();
create trigger m23_project_operations before insert on private.project_operations_events for each row execute function private.m23_resource_write_guard();
create trigger m23_poll_guard before insert or update on private.polls for each row execute function private.m23_resource_write_guard();
create trigger m23_nomination before insert on private.poll_options for each row execute function private.m23_resource_write_guard();
create trigger m23_poll_decision before insert on private.poll_decisions for each row execute function private.m23_resource_write_guard();

revoke all on function private.m23_feed_write_guard(),private.m23_resource_write_guard(),
  private.m23_resource_guard(uuid,text,text,uuid) from public,anon,authenticated,service_role;
create view private.m23_history as
select e.id,e.case_id,e.subject_id,e.actor_id,e.authority,e.request_id,e.capability,e.scope_kind,e.scope_id,
  'feature_'||e.action as event,e.happened_at,e.policy_version
from private.m23_events e
union all
select r.expiry_id,r.id,r.subject_id,null,'system',null,r.capability,r.scope_kind,r.scope_id,
  'feature_expired',r.expires_at,1 from private.m23_restrictions r
where r.revoked_at is null and r.expires_at<=statement_timestamp()
union all
select d.expiry_id,d.id,d.moderator_id,null,'system',null,d.capability,d.scope_kind,d.scope_id,
  'feature_delegation_expired',d.expires_at,1 from private.m23_delegations d
where d.revoked_at is null and d.expires_at<=statement_timestamp();
revoke all on private.m23_history from public,anon,authenticated,service_role;

create function public.m23_access_for_api(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select from private.m23_live_delegations(p_actor,statement_timestamp()))
$$;

create function public.m23_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_query text,p_subject uuid,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare power text:=private.m23_authority(p_actor,p_session,p_aal2,p_totp,p_workspace);
begin
  if char_length(coalesce(p_query,''))>100 or (p_before is null)<>(p_before_id is null)
    then raise exception 'invalid query' using errcode='23514'; end if;
  return jsonb_build_object(
    'authority',power,
    'capabilities',(select jsonb_agg(jsonb_build_object('key',c.capability,'highImpact',c.high_impact,'scopes',c.scopes) order by c.capability)
      from private.m23_capabilities c),
    'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'username',x.username,'moderator',x.moderator))
      from (select u.id,p.username,private.m23_moderator(u.id) as moderator
        from auth.users u join public.profiles p on p.user_id=u.id and p.username is not null
        where u.deleted_at is null and not u.is_anonymous and u.email_confirmed_at is not null and u.id<>p_actor
          and not private.s2a_leadership(u.id) and char_length(coalesce(p_query,''))>=2
          and (u.id::text=lower(p_query) or starts_with(lower(p.username),lower(p_query)))
          and (power<>'moderator' or feed_data.author_active(u.id))
        order by p.username,u.id limit 20) x),'[]'::jsonb),
    'delegations',coalesce((select jsonb_agg(private.m23_delegation_summary(d,statement_timestamp()))
      from (select d.* from private.m23_delegations d
        where (case when power='moderator' then d.moderator_id=p_actor
          else (p_subject is null or d.moderator_id=p_subject) end)
        order by d.starts_at desc,d.id desc limit 50) d),'[]'::jsonb),
    'restrictions',coalesce((select jsonb_agg(private.m23_case_summary(r,statement_timestamp()))
      from (select r.* from private.m23_restrictions r where (p_subject is null or r.subject_id=p_subject)
        and (power<>'moderator' or r.issuer_id=p_actor)
        order by (r.revoked_at is null and coalesce(r.expires_at>statement_timestamp(),true)) desc,r.starts_at desc,r.id desc limit 50) r),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'caseId',h.case_id,'subject',h.subject_id,
        'capability',h.capability,'scope',h.scope_kind,'scopeId',h.scope_id,'action',h.event,
        'actor',h.actor_id,'authority',h.authority,'occurredAt',h.happened_at,'policyVersion',h.policy_version)
        order by h.happened_at desc,h.id desc)
      from (select h.* from private.m23_history h where (p_subject is null or h.subject_id=p_subject)
        and (power<>'moderator' or h.actor_id=p_actor or h.subject_id=p_actor or exists (
          select from private.m23_restrictions r where r.id=h.case_id and r.issuer_id=p_actor))
        and (p_before is null or (h.happened_at,h.id)<(p_before,p_before_id))
        order by h.happened_at desc,h.id desc limit 26) h),'[]'::jsonb));
end
$$;

create function public.m23_my_feature_notices()
returns jsonb language sql stable security definer set search_path='' as $$
  select case when not private.m22_notice_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then null
    else coalesce((select jsonb_agg(private.m23_case_summary(r,statement_timestamp())-'subject'-'issuer'-'authority'-'version'
      order by r.starts_at desc,r.id desc) from (select r.* from private.m23_restrictions r where r.subject_id=auth.uid()
      order by r.starts_at desc,r.id desc limit 50) r),'[]'::jsonb) end
$$;

revoke all on function private.m23_authority(uuid,uuid,boolean,bigint,uuid),
  private.m23_case_summary(private.m23_restrictions,timestamptz),private.m23_delegation_summary(private.m23_delegations,timestamptz),
  public.m23_access_for_api(uuid),public.m23_read_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,timestamptz,uuid),
  public.m23_command_for_api(uuid,uuid,boolean,bigint,uuid,uuid,uuid,text,text[],text,uuid,uuid,integer,integer,integer,boolean,text,text,boolean),
  public.m23_my_feature_notices() from public,anon,authenticated,service_role;
grant execute on function public.m23_access_for_api(uuid),public.m23_read_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,timestamptz,uuid),
  public.m23_command_for_api(uuid,uuid,boolean,bigint,uuid,uuid,uuid,text,text[],text,uuid,uuid,integer,integer,integer,boolean,text,text,boolean)
  to service_role;
grant execute on function public.m23_my_feature_notices() to authenticated;

create trigger m23_group_management before insert on feed_data.group_audit for each row execute function private.m23_resource_write_guard();
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
from private.m22_account_history h
union all
select 'platform_admin'::text collate "C",'moderation',h.id::text collate "C",h.id,h.happened_at,h.event,
  h.actor_id,'account',h.subject_id,null,null,h.policy_version,h.request_id,'recorded',
  case when h.authority='founder' then 'founder' end,null::jsonb,
  jsonb_build_object('caseReference',h.case_id,'capability',h.capability,'scope',h.scope_kind,'scopeId',h.scope_id)
from private.m23_history h;
create or replace view private.m21_history_source as
select case when a.event_type like 'feature_%' then 'feature_enforcement' when a.new_state ? 'caseReference' then 'account_enforcement' else a.source end collate "C" as source,
  case when a.event_type like 'feature_%' then 'features' when a.source='platform_admin' then 'accounts' else 'feed' end as domain,
  a.uuid_id as id,a.resource_type as target,a.resource_ref as target_id,
  null::text as scope_key,a.outcome as status,a.event_type as action,a.occurred_at,a.actor_ref
from private.a1a_audit_source a
where a.source in ('platform_admin','post_moderation','comment_moderation')
  and (a.event_type like 'feature_%' or a.event_type in ('account_suspended','account_banned','account_reinstated','suspension_created','suspension_extended','restriction_expired','restriction_revoked','ban_issued','ban_lifted','hide','restore','remove','dismiss'))
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
  and (s.expires_at is null or s.expires_at>statement_timestamp())
union all
select 'feature_enforcement','features',r.id,'account',r.subject_id,null,'restricted','restricted',r.starts_at,r.expires_at
from private.m23_restrictions r join auth.users u on u.id=r.subject_id
where u.deleted_at is null and r.revoked_at is null and r.starts_at<=statement_timestamp()
  and (r.expires_at is null or r.expires_at>statement_timestamp());
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
        case when p_view='restrictions' then id else (select h.case_id from private.m22_account_history h where h.id=page.id) end
        when source='feature_enforcement' then case when p_view='restrictions' then id
          else (select h.case_id from private.m23_history h where h.id=page.id) end end,
      'capability',case when source='feature_enforcement' then case when p_view='restrictions'
        then (select r.capability from private.m23_restrictions r where r.id=page.id)
        else (select h.capability from private.m23_history h where h.id=page.id) end end
    ) order by sort_at desc,source collate "C" desc,id desc),'[]'::jsonb)) from page
  );
end
$$;
