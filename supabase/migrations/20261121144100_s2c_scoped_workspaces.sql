-- Complete the S2C workspace lifecycle and include independent verification review.
alter table private.s2b_workflows
  drop constraint s2b_workflows_kind_check,
  drop constraint s2b_workflows_binding_check,
  add constraint s2b_workflows_kind_check check (kind in ('organization_draft','revoke_other_sessions','admin_workspace','verification_workspace')),
  add constraint s2b_workflows_binding_check check (
    (kind='organization_draft' and step='resume' and bound_session is null)
    or (kind='revoke_other_sessions' and step='confirm' and bound_session is not null and scope_id=owner_id)
    or (kind='admin_workspace' and step='admin' and bound_session is not null and scope_id=owner_id)
    or (kind='verification_workspace' and step='review' and bound_session is not null and scope_id=owner_id));

create function private.s2c_workspace_allowed(p_actor uuid,p_kind text)
returns boolean language sql stable set search_path='' as $$
  select case p_kind when 'admin_workspace' then private.s2a_leadership(p_actor)
    when 'verification_workspace' then private.institution_reviewer(p_actor) else false end;
$$;

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
    and p_step is distinct from 'admin' and p_step is distinct from 'review' then
    return private.s2b_initial_workflow_for_api(p_actor,p_session,p_aal2,p_totp,
      p_action,p_kind,p_id,p_step,p_expected,p_request);
  end if;
  if p_action in ('open','cancel') then perform private.s2b_lock_actor(p_actor,p_session); end if;

  if p_action='open' then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not private.s2c_workspace_allowed(p_actor,p_kind) then return null; end if;
    if not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
      then raise exception 'recent MFA required' using errcode='O5001'; end if;
    step_name:=case p_kind when 'admin_workspace' then 'admin' else 'review' end;
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
  elsif p_action in ('read','cancel') and p_step in ('admin','review') then
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

revoke all on function private.s2c_workspace_allowed(uuid,text) from public,anon,authenticated,service_role;
