-- Revocation is durable for the lifetime of the provider session, including refresh rotation.
alter table private.s2a_session_policy add column revoked_at timestamptz;

create or replace function private.s2a_session_within_policy(p_user uuid,p_session uuid,p_now timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from auth.sessions s
    left join private.s2a_session_policy p on p.session_id=s.id
    left join private.s2a_privilege_transition t on t.user_id=s.user_id
    where s.id=p_session and s.user_id=p_user and s.created_at<=p_now
      and p.revoked_at is null
      and (s.not_after is null or s.not_after>p_now)
      and (t.reauthenticate_after is null or s.created_at>t.reauthenticate_after)
      and private.s2a_deadline(s.created_at,
        coalesce(p.privileged_at_sign_in,false) or private.s2a_leadership(p_user),
        coalesce(p.remembered,false))>p_now
  );
$$;

create table private.s2b_workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('organization_draft','revoke_other_sessions')),
  scope_id uuid not null,
  step text not null,
  bound_session uuid,
  state text not null default 'open' check (state in ('open','completed','cancelled')),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check ((kind='organization_draft' and step='resume' and bound_session is null)
    or (kind='revoke_other_sessions' and step='confirm' and bound_session is not null and scope_id=owner_id)),
  check (expires_at>created_at)
);
create index s2b_workflow_owner on private.s2b_workflows(owner_id,kind,scope_id,created_at desc);
create index s2b_workflow_org_open on private.s2b_workflows(scope_id)
  where kind='organization_draft' and state='open';

create table private.s2b_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  scope_ref uuid,
  action text not null check (action in ('workflow_created','workflow_completed','workflow_cancelled','session_revoked','other_sessions_revoked')),
  version integer not null default 1,
  request_ref uuid,
  affected integer check (affected>=0),
  mfa_verified_at timestamptz,
  occurred_at timestamptz not null default clock_timestamp(),
  unique(actor_id,request_ref)
);
create index s2b_event_actor_recent on private.s2b_security_events(actor_id,occurred_at desc);

alter table private.s2b_workflows enable row level security;
alter table private.s2b_security_events enable row level security;
revoke all on private.s2b_workflows,private.s2b_security_events from public,anon,authenticated,service_role;

-- The current actor and provider session are pinned in the same order as O2/O5 writes.
create function private.s2b_lock_actor(p_actor uuid,p_session uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform 1 from auth.users where id=p_actor for no key update;
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
end;
$$;

create function private.s2b_recent_mfa(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint)
returns boolean language sql stable set search_path='' as $$
  select public.account_session_for_api(p_actor,p_session,p_aal2,true)
    and coalesce(p_totp between extract(epoch from clock_timestamp())::bigint-900
      and extract(epoch from clock_timestamp())::bigint+30,false);
$$;

create function private.s2b_revoke_sessions(p_actor uuid,p_session uuid,p_target uuid)
returns integer language plpgsql set search_path='' as $$
declare affected integer;
begin
  -- Snapshot the authorized owner's other provider sessions. GoTrue retains custody of credentials.
  update private.s2a_session_policy p set revoked_at=clock_timestamp()
    from auth.sessions s
    where s.id=p.session_id and s.user_id=p_actor and s.id<>p_session
      and p.revoked_at is null and (p_target is null or p.audit_ref=p_target)
      and (p_target is null or private.s2a_session_within_policy(p_actor,s.id,clock_timestamp()));
  get diagnostics affected=row_count;
  return affected;
end;
$$;

create function public.s2b_sessions_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_action text,p_target uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  privileged boolean;
  prior private.s2b_security_events;
  event_name text;
  affected integer;
begin
  if p_action is distinct from 'list' then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false) then return null; end if;
  privileged:=private.s2a_leadership(p_actor);
  if p_action='list' then
    return jsonb_build_object('privileged',privileged,'sessions',coalesce((
      select jsonb_agg(jsonb_build_object('id',p.audit_ref,'current',s.id=p_session,
        'createdAt',s.created_at,'remembered',p.remembered,
        'expiresAt',least(s.not_after,private.s2a_deadline(s.created_at,p.privileged_at_sign_in or privileged,p.remembered)))
        order by s.id=p_session desc,s.created_at desc,p.audit_ref)
      from auth.sessions s join private.s2a_session_policy p on p.session_id=s.id
      where s.user_id=p_actor and private.s2a_session_within_policy(p_actor,s.id,clock_timestamp())
    ),'[]'::jsonb));
  end if;
  if p_request is null or not coalesce((p_action='single' and p_target is not null)
    or (p_action='others' and p_target is null),false) then return null; end if;
  if privileged and p_action='others' then return null; end if;
  if privileged and not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
    then raise exception 'recent MFA required' using errcode='O5001'; end if;

  event_name:=case p_action when 'single' then 'session_revoked' else 'other_sessions_revoked' end;
  select * into prior from private.s2b_security_events where actor_id=p_actor and request_ref=p_request;
  if found then
    if prior.action=event_name and prior.scope_ref is not distinct from p_target
      then return jsonb_build_object('affected',prior.affected); end if;
    raise exception 'request conflict' using errcode='O2002';
  end if;
  if (select count(*) from private.s2b_security_events where actor_id=p_actor and occurred_at>clock_timestamp()-interval '1 day')>=100
    then raise exception 'command limit' using errcode='54000'; end if;
  affected:=private.s2b_revoke_sessions(p_actor,p_session,p_target);
  if p_action='single' and affected=0 then return null; end if;
  insert into private.s2b_security_events(actor_id,scope_ref,action,request_ref,affected,mfa_verified_at)
    values(p_actor,p_target,event_name,p_request,affected,case when privileged then to_timestamp(p_totp) end);
  return jsonb_build_object('affected',affected);
end;
$$;

create function private.s2b_org_scope_active(p_owner uuid,p_scope uuid)
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from private.organization_onboarding_intents i
    where i.id=p_scope and i.subject_id=p_owner and i.pathway='organization'
      and i.stage<>'cancelled' and i.completed_at is null
      and (i.setup_draft->>'mode' is distinct from 'existing' or exists (
        select 1 from private.organizations o where o.handle=i.setup_draft->>'targetHandle'
          and o.status='active' and o.verification_status<>'verified'
          and not private.organization_setup_government(o.kind)
          and private.institution_role(p_owner,o.id) is null))
  );
$$;

create function private.s2b_close_org_workflow()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  with changed as (
    update private.s2b_workflows set state=case when new.completed_at is not null then 'completed' else 'cancelled' end,
      version=version+1 where kind='organization_draft' and scope_id=new.id and owner_id=new.subject_id and state='open'
      returning id,state,version
  )
  insert into private.s2b_security_events(actor_id,scope_ref,action,version)
    select new.subject_id,id,'workflow_'||state,version from changed;
  return new;
end;
$$;

create trigger ayinou_s2b_close_org_workflow after update of completed_at,stage on private.organization_onboarding_intents
for each row when ((old.completed_at is null and new.completed_at is not null)
  or (old.stage<>'cancelled' and new.stage='cancelled')) execute function private.s2b_close_org_workflow();

create function public.s2b_workflow_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_action text,p_kind text,p_id uuid,p_step text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  flow private.s2b_workflows;
  scope uuid;
  step_name text;
  anchor uuid;
  event_name text;
  prior private.s2b_security_events;
  affected integer;
  requested_at timestamptz;
begin
  if p_action is distinct from 'read' then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false) then return null; end if;
  if p_action='open' then
    if p_kind='organization_draft' then
      select i.id into scope from private.organization_onboarding_intents i
        where i.subject_id=p_actor and i.stage<>'cancelled' and i.completed_at is null;
      if not private.s2b_org_scope_active(p_actor,scope) then return null; end if;
      step_name:='resume';
    elsif p_kind='revoke_other_sessions' then
      if not private.s2a_leadership(p_actor) then return null; end if;
      if not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
        then raise exception 'recent MFA required' using errcode='O5001'; end if;
      scope:=p_actor;
      step_name:='confirm';
      anchor:=p_session;
    else return null;
    end if;
    select * into flow from private.s2b_workflows w where w.owner_id=p_actor and w.kind=p_kind
      and w.scope_id=scope and w.bound_session is not distinct from anchor
      and w.state='open' and w.expires_at>clock_timestamp()
      order by w.created_at desc limit 1;
    if not found then
      if (select count(*) from private.s2b_security_events where actor_id=p_actor and occurred_at>clock_timestamp()-interval '1 day')>=100
        then raise exception 'command limit' using errcode='54000'; end if;
      requested_at:=clock_timestamp();
      insert into private.s2b_workflows(owner_id,kind,scope_id,step,bound_session,created_at,expires_at)
        values(p_actor,p_kind,scope,step_name,anchor,requested_at,requested_at+
          case when anchor is null then interval '7 days' else interval '5 minutes' end)
        returning * into flow;
      insert into private.s2b_security_events(actor_id,scope_ref,action,mfa_verified_at)
        values(p_actor,flow.id,'workflow_created',case when anchor is not null then to_timestamp(p_totp) end);
    end if;
  else
    -- Check owner, exact step and original session before disclosing any state or MFA requirement.
    select * into flow from private.s2b_workflows w where w.id=p_id and w.owner_id=p_actor and w.step=p_step
      and (w.bound_session is null or w.bound_session=p_session);
    if not found or flow.expires_at<=clock_timestamp() then return null; end if;
    if flow.kind='revoke_other_sessions' then
      if not private.s2a_leadership(p_actor) or not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
        then return null; end if;
    elsif not private.s2b_org_scope_active(p_actor,flow.scope_id) then return null;
    end if;
    if p_action='read' then
      if flow.state<>'open' then return null; end if;
    elsif p_action='cancel' or (p_action='complete' and flow.kind='revoke_other_sessions') then
      if p_request is null or p_expected is null then return null; end if;
      event_name:=case when p_action='cancel' then 'workflow_cancelled' else 'workflow_completed' end;
      select * into prior from private.s2b_security_events where actor_id=p_actor and request_ref=p_request;
      if found then
        if prior.scope_ref=flow.id and prior.action=event_name and prior.version=p_expected+1
          then return jsonb_build_object('state',flow.state,'affected',prior.affected); end if;
        raise exception 'request conflict' using errcode='O2002';
      end if;
      if flow.state<>'open' or flow.version<>p_expected then return null; end if;
      if p_action='complete' then
        affected:=private.s2b_revoke_sessions(p_actor,p_session,null);
        insert into private.s2b_security_events(actor_id,scope_ref,action,affected)
          values(p_actor,flow.id,'other_sessions_revoked',affected);
      end if;
      update private.s2b_workflows set
        state=case when p_action='cancel' then 'cancelled' else 'completed' end,version=version+1
        where id=flow.id returning * into flow;
      insert into private.s2b_security_events(actor_id,scope_ref,action,version,request_ref,affected,mfa_verified_at)
        values(p_actor,flow.id,event_name,flow.version,p_request,affected,
          case when flow.bound_session is not null then to_timestamp(p_totp) end);
      return jsonb_build_object('state',flow.state,'affected',affected);
    else return null;
    end if;
  end if;
  return jsonb_build_object('id',flow.id,'kind',flow.kind,'step',flow.step,'version',flow.version,'expiresAt',flow.expires_at);
end;
$$;

revoke all on function private.s2b_lock_actor(uuid,uuid),private.s2b_recent_mfa(uuid,uuid,boolean,bigint),
  private.s2b_revoke_sessions(uuid,uuid,uuid),private.s2b_org_scope_active(uuid,uuid),private.s2b_close_org_workflow(),
  public.s2b_sessions_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid),
  public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.s2b_sessions_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid),
  public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid) to service_role;
