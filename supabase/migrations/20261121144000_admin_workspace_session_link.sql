-- Platform Administration uses the existing S2B locator and session assurance model.
alter table private.s2b_workflows
  drop constraint s2b_workflows_kind_check,
  drop constraint s2b_workflows_check,
  add constraint s2b_workflows_kind_check check (kind in ('organization_draft','revoke_other_sessions','admin_workspace')),
  add constraint s2b_workflows_binding_check check (
    (kind='organization_draft' and step='resume' and bound_session is null)
    or (kind='revoke_other_sessions' and step='confirm' and bound_session is not null and scope_id=owner_id)
    or (kind='admin_workspace' and step='admin' and bound_session is not null and scope_id=owner_id));

alter function public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid) set schema private;
alter function private.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)
  rename to s2b_initial_workflow_for_api;
revoke all on function private.s2b_initial_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)
  from public,anon,authenticated,service_role;

create function public.s2b_workflow_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_action text,p_kind text,p_id uuid,p_step text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  flow private.s2b_workflows;
  opened_at timestamptz;
  deadline timestamptz;
begin
  if p_kind is distinct from 'admin_workspace' and p_step is distinct from 'admin' then
    return private.s2b_initial_workflow_for_api(p_actor,p_session,p_aal2,p_totp,
      p_action,p_kind,p_id,p_step,p_expected,p_request);
  end if;

  if p_action='open' and p_kind='admin_workspace' then
    perform private.s2b_lock_actor(p_actor,p_session);
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not private.s2a_leadership(p_actor) then return null; end if;
    if not private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp)
      then raise exception 'recent MFA required' using errcode='O5001'; end if;
    select * into flow from private.s2b_workflows w where w.owner_id=p_actor and w.kind='admin_workspace'
      and w.bound_session=p_session and w.state='open' and w.expires_at>clock_timestamp()
      order by w.created_at desc limit 1;
    if not found then
      if (select count(*) from private.s2b_security_events where actor_id=p_actor
        and occurred_at>clock_timestamp()-interval '1 day')>=100
        then raise exception 'command limit' using errcode='54000'; end if;
      opened_at:=clock_timestamp();
      select least(opened_at+interval '5 minutes',to_timestamp(p_totp)+interval '15 minutes',
        s.not_after,private.s2a_deadline(s.created_at,true,false)) into deadline
      from auth.sessions s where s.id=p_session and s.user_id=p_actor;
      if deadline is null or deadline<=opened_at then return null; end if;
      insert into private.s2b_workflows(owner_id,kind,scope_id,step,bound_session,created_at,expires_at)
        values(p_actor,'admin_workspace',p_actor,'admin',p_session,opened_at,deadline)
        returning * into flow;
      insert into private.s2b_security_events(actor_id,scope_ref,action,mfa_verified_at)
        values(p_actor,flow.id,'workflow_created',to_timestamp(p_totp));
    end if;
  elsif p_action='read' and p_step='admin' then
    select * into flow from private.s2b_workflows w where w.id=p_id and w.kind='admin_workspace'
      and w.owner_id=p_actor and w.bound_session=p_session and w.step=p_step and w.state='open'
      and w.expires_at>clock_timestamp();
    if not found or not private.s2a_leadership(p_actor)
      or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
      then return null; end if;
  else
    return null;
  end if;
  return jsonb_build_object('id',flow.id,'kind',flow.kind,'step',flow.step,'version',flow.version,'expiresAt',flow.expires_at);
end;
$$;

revoke all on function public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid) to service_role;
