create function public.project_operation_for_client(p_project uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; execution private.project_execution;
  actor_role text; target_role text; target uuid; resource uuid; request_key uuid; expected integer;
  invite private.project_invitations; opportunity private.project_opportunities; application private.project_applications;
  task private.project_tasks; notice_to uuid; note text; state text; sensitive boolean;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16000 or p_action is null then
    raise exception 'invalid operation' using errcode='22023'; end if;
  select * into p from private.community_projects where id=p_project for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(p);
  select * into execution from private.project_execution where project_id=p_project;
  if p_action='execution_status' and p.status='approved' and p.restricted_at is null
    and (p.owner_user_id=actor or private.organization_has_permission(actor,p.organization_id,'projects.operate')
      or private.project_community_manager(p.community_id,actor)) then
    perform private.project_require_identity(actor);
  end if;
  actor_role:=private.project_execution_role(p,actor);
  if not private.project_execution_actor(p,actor) or not private.project_executable(p) then
    raise exception 'project unavailable' using errcode='PJP04'; end if;
  if actor_role is null and p_action not in ('invite_accept','invite_decline','volunteer_apply','volunteer_confirm','volunteer_withdraw') then
    raise exception 'access denied' using errcode='42501'; end if;

  expected:=(p_data->>'version')::integer;
  resource:=(p_data->>'id')::uuid;
  note:=p_data->>'reason';
  perform feed_data.consume_limit(actor,case
    when p_action='invite' then 'project_invite' when p_action='volunteer_apply' then 'project_apply'
    when p_action='task_create' then 'project_task_create' else 'project_operations' end,
    case when p_action in ('invite','volunteer_apply','task_create') then 8 else 30 end);

  if p_action='execution_status' then
    if not private.project_permission(actor_role,'project.status_manage') then raise exception 'access denied' using errcode='42501'; end if;
    perform private.project_require_identity(actor);
    if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
    state:=p_data->>'status';
    if (execution.project_id is null and expected is distinct from 0)
      or (execution.project_id is not null and execution.version is distinct from expected)
      then raise exception 'execution changed' using errcode='PJP09'; end if;
    if not coalesce(case coalesce(execution.status,'approved')
      when 'approved' then state='active'
      when 'active' then state in ('paused','completed')
      when 'paused' then state in ('active','completed','archived')
      when 'completed' then state='archived' else false end,false)
      then raise exception 'invalid execution transition' using errcode='PJB09'; end if;
    insert into private.project_execution(project_id,approved_revision,status,operator_id) values(p.id,p.revision,state,actor)
      on conflict(project_id) do update set status=excluded.status,version=private.project_execution.version+1,updated_at=clock_timestamp();
    note:=state;
  else
    if not coalesce(execution.status='active',false)
      and not coalesce(execution.status='paused' and p_action in ('invite_revoke','member_revoke','invite_decline','volunteer_withdraw','opportunity_close'),false)
      then raise exception 'project is not active' using errcode='PJB01'; end if;

    if p_action='invite' then
      target_role:=p_data->>'role'; request_key:=(p_data->>'key')::uuid;
      if target_role is null or target_role not in ('manager','supervisor','contributor','volunteer') or request_key is null then
        raise exception 'invalid invitation' using errcode='22023'; end if;
      if not private.project_can_invite(actor_role,target_role) then raise exception 'access denied' using errcode='42501'; end if;
      perform private.project_require_identity(actor);
      if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
      select user_id into target from public.profiles where username=p_data->>'handle';
      if target is null or target=actor or not private.project_execution_actor(p,target)
        or not feed_data.community_member(p.community_id,target) or feed_data.blocked_pair(actor,target)
        or private.project_execution_role(p,target)='owner'
        or (target_role in ('manager','supervisor') and private.project_identity_state(target)<>'verified')
        then raise exception 'recipient unavailable' using errcode='PJB03'; end if;
      select * into invite from private.project_invitations
        where project_id=p.id and inviter_id=actor and private.project_invitations.request_key=(p_data->>'key')::uuid;
      if found then
        if invite.recipient_id<>target or invite.role<>target_role then raise exception 'request changed' using errcode='PJP09'; end if;
        return jsonb_build_object('id',invite.id);
      end if;
      if exists(select 1 from private.project_team where project_id=p.id and user_id=target and revoked_at is null
        and (private.project_team.role=target_role or actor_role not in ('owner','delegate')))
        then raise exception 'team role conflict' using errcode='PJB09'; end if;
      update private.project_invitations set status='expired'
        where project_id=p.id and status='pending' and expires_at<=clock_timestamp();
      if exists(select 1 from private.project_invitations where project_id=p.id and recipient_id=target and status='pending')
        then raise exception 'invitation already exists' using errcode='PJB09'; end if;
      if (select count(*) from private.project_invitations where project_id=p.id and status='pending')>=50
        then raise exception 'invitation limit' using errcode='PFR29'; end if;
      insert into private.project_invitations(project_id,inviter_id,recipient_id,role,request_key)
        values(p.id,actor,target,target_role,request_key) returning * into invite;
      notice_to:=target;
    elsif p_action in ('invite_accept','invite_decline','invite_revoke') then
      select * into invite from private.project_invitations where id=resource and project_id=p.id;
      if not found then raise exception 'invitation unavailable' using errcode='PJB03'; end if;
      if p_action='invite_revoke' then
        if not private.project_can_invite(actor_role,invite.role) or (actor_role not in ('owner','delegate') and invite.inviter_id is distinct from actor)
          then raise exception 'access denied' using errcode='42501'; end if;
        perform private.project_require_identity(actor);
        if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
        state:='revoked';
      else
        if invite.recipient_id<>actor then raise exception 'invitation unavailable' using errcode='PJB03'; end if;
        state:=case p_action when 'invite_accept' then 'accepted' else 'declined' end;
        notice_to:=invite.inviter_id;
      end if;
      if invite.status<>'pending' then raise exception 'invitation changed' using errcode='PJB09'; end if;
      if invite.expires_at<=clock_timestamp() then raise exception 'invitation expired' using errcode='PJB02'; end if;
      if state='accepted' then
        if not private.project_can_invite(private.project_execution_role(p,invite.inviter_id),invite.role)
          or private.project_execution_role(p,actor)='owner'
          or not feed_data.community_member(p.community_id,actor) or feed_data.blocked_pair(actor,invite.inviter_id)
          or (invite.role in ('manager','supervisor') and private.project_identity_state(actor)<>'verified')
          then raise exception 'invitation unavailable' using errcode='PJB03'; end if;
        if exists(select 1 from private.project_team where project_id=p.id and user_id=actor and revoked_at is null
          and (private.project_team.role=invite.role or not private.project_execution_owner(p,invite.inviter_id)))
          then raise exception 'team role conflict' using errcode='PJB09'; end if;
        if (select count(*) from private.project_team where project_id=p.id and revoked_at is null)>=100
          and not exists(select 1 from private.project_team where project_id=p.id and user_id=actor and revoked_at is null)
          then raise exception 'team limit' using errcode='PFR29'; end if;
        insert into private.project_team(project_id,user_id,role,sponsor_id,membership_source) values(p.id,actor,invite.role,invite.inviter_id,'invitation')
          on conflict(project_id,user_id) do update set role=excluded.role,sponsor_id=excluded.sponsor_id,
            membership_source='invitation',revoked_at=null,joined_at=clock_timestamp();
      end if;
      update private.project_invitations set status=state where id=invite.id;
    elsif p_action='member_revoke' then
      if not private.project_permission(actor_role,'team.manage') then raise exception 'access denied' using errcode='42501'; end if;
      perform private.project_require_identity(actor);
      if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
      target:=(p_data->>'userId')::uuid;
      update private.project_team t set revoked_at=clock_timestamp()
        where t.project_id=p.id and t.user_id=target and t.user_id<>actor and t.revoked_at is null
          and (actor_role in ('owner','delegate') or t.role in ('contributor','volunteer'));
      if not found then raise exception 'team role unavailable' using errcode='PJB03'; end if;
      update private.project_invitations set status='revoked' where project_id=p.id and recipient_id=target and status='pending';
      note:=target::text;
    elsif p_action='opportunity_publish' then
      if not private.project_permission(actor_role,'volunteers.review') then raise exception 'access denied' using errcode='42501'; end if;
      perform private.project_require_identity(actor);
      if not private.project_operational_text(p_data->>'title',3,120)
        or not private.project_operational_text(p_data->>'description',10,2000)
        or not private.project_operational_text(p_data->>'skills',1,300)
        or not private.project_operational_text(p_data->>'commitment',1,180)
        or jsonb_typeof(p_data->'remote') is distinct from 'boolean'
        or ((p_data->>'closesOn')::date<current_date)
        then raise exception 'invalid opportunity' using errcode='22023'; end if;
      if (select count(*) from private.project_opportunities where project_id=p.id)>=100 then
        raise exception 'opportunity limit' using errcode='PFR29'; end if;
      insert into private.project_opportunities(project_id,manager_id,title,description,skills,commitment,remote,capacity,closes_on)
        values(p.id,actor,btrim(p_data->>'title'),btrim(p_data->>'description'),btrim(p_data->>'skills'),btrim(p_data->>'commitment'),
          (p_data->>'remote')::boolean,(p_data->>'capacity')::smallint,(p_data->>'closesOn')::date) returning * into opportunity;
      resource:=opportunity.id;
    elsif p_action in ('opportunity_close','volunteer_apply') then
      select * into opportunity from private.project_opportunities where id=resource and project_id=p.id;
      if not found then raise exception 'opportunity unavailable' using errcode='PJB04'; end if;
      if p_action='opportunity_close' then
        if not private.project_permission(actor_role,'volunteers.review') then raise exception 'access denied' using errcode='42501'; end if;
        perform private.project_require_identity(actor);
        update private.project_opportunities set closed_at=clock_timestamp() where id=resource and closed_at is null;
        if not found then raise exception 'opportunity closed' using errcode='PJB04'; end if;
      else
        if (actor_role is null and not private.project_visible(p)) or not feed_data.community_member(p.community_id,actor)
          or not feed_data.author_active(opportunity.manager_id) or feed_data.blocked_pair(actor,opportunity.manager_id)
          then raise exception 'opportunity unavailable' using errcode='PJB04'; end if;
        select * into application from private.project_applications where opportunity_id=resource and applicant_id=actor;
        if found then return jsonb_build_object('id',application.id); end if;
        if opportunity.closed_at is not null or opportunity.closes_on<current_date
          then raise exception 'opportunity closed' using errcode='PJB04'; end if;
        if (select count(*) from private.project_applications where opportunity_id=resource)>=200 then
          raise exception 'application limit' using errcode='PFR29'; end if;
        insert into private.project_applications(project_id,opportunity_id,applicant_id)
          values(p.id,resource,actor) returning * into application;
        notice_to:=opportunity.manager_id;
      end if;
    elsif p_action in ('volunteer_offer','volunteer_reject','volunteer_confirm','volunteer_withdraw') then
      select * into application from private.project_applications where id=resource and project_id=p.id;
      if not found then raise exception 'application unavailable' using errcode='PJB04'; end if;
      select * into opportunity from private.project_opportunities where id=application.opportunity_id;
      if p_action in ('volunteer_offer','volunteer_reject') then
        if not private.project_permission(actor_role,'volunteers.review') or application.applicant_id=actor
          or not private.project_execution_actor(p,application.applicant_id)
          or feed_data.blocked_pair(actor,application.applicant_id)
          then raise exception 'access denied' using errcode='42501'; end if;
        perform private.project_require_identity(actor);
        if application.status<>'pending' or not private.project_operational_text(note,3,500)
          then raise exception 'application changed or invalid feedback' using errcode='PJB09'; end if;
        if p_action='volunteer_offer' and (opportunity.closed_at is not null or opportunity.closes_on<current_date
          or (select count(*) from private.project_applications where opportunity_id=opportunity.id and status in ('offered','accepted'))>=opportunity.capacity)
          then raise exception 'opportunity full or closed' using errcode='PJB04'; end if;
        state:=case p_action when 'volunteer_offer' then 'offered' else 'rejected' end;
        notice_to:=application.applicant_id;
      else
        if application.applicant_id<>actor then raise exception 'application unavailable' using errcode='PJB04'; end if;
        if p_action='volunteer_confirm' then
          if application.status<>'offered' or not private.project_permission(private.project_execution_role(p,application.reviewer_id),'volunteers.review')
            or feed_data.blocked_pair(actor,application.reviewer_id) or not feed_data.community_member(p.community_id,actor)
            then raise exception 'offer unavailable' using errcode='PJB04'; end if;
          if (select count(*) from private.project_team where project_id=p.id and revoked_at is null)>=100
            and not exists(select 1 from private.project_team where project_id=p.id and user_id=actor and revoked_at is null)
            then raise exception 'team limit' using errcode='PFR29'; end if;
          insert into private.project_team(project_id,user_id,role,sponsor_id,membership_source)
            values(p.id,actor,'volunteer',application.reviewer_id,'opportunity')
            on conflict(project_id,user_id) do update set role='volunteer',revoked_at=null,joined_at=clock_timestamp(),
              sponsor_id=excluded.sponsor_id,membership_source='opportunity'
            where private.project_team.revoked_at is not null;
          state:='accepted';
        else
          if application.status not in ('pending','offered','accepted') then raise exception 'application changed' using errcode='PJB09'; end if;
          state:='withdrawn';
          if application.status='accepted' and not exists(select 1 from private.project_applications
              where project_id=p.id and applicant_id=actor and id<>application.id and status='accepted') then
            update private.project_team set revoked_at=clock_timestamp()
              where project_id=p.id and user_id=actor and private.project_team.role='volunteer' and revoked_at is null
                and membership_source='opportunity';
          end if;
        end if;
      end if;
      update private.project_applications set status=state,updated_at=clock_timestamp(),
        reviewer_id=case when p_action in ('volunteer_offer','volunteer_reject') then actor else reviewer_id end,
        feedback=case when p_action in ('volunteer_offer','volunteer_reject') then btrim(note) else feedback end
        where id=application.id;
    elsif p_action like 'task_%' then
      if p_action='task_create' then
        if not private.project_permission(actor_role,'tasks.create') then raise exception 'access denied' using errcode='42501'; end if;
        if (select count(*) from private.project_tasks where project_id=p.id)>=300 then
          raise exception 'task limit' using errcode='PFR29'; end if;
      else
        select * into task from private.project_tasks where id=resource and project_id=p.id;
        if not found or not private.project_task_visible(p,task,actor,actor_role) then raise exception 'task unavailable' using errcode='PJB05'; end if;
        if expected is distinct from task.version then raise exception 'task changed' using errcode='PJB06'; end if;
      end if;

      if p_action in ('task_create','task_edit') then
        if p_action='task_edit' and (not private.project_permission(actor_role,'tasks.edit') or task.status not in ('todo','blocked') or task.assignee_id is not null)
          then raise exception 'task cannot be edited while assigned' using errcode='PJB09'; end if;
        if not private.project_operational_text(p_data->>'title',3,120)
          or not private.project_operational_text(p_data->>'description',3,2000)
          or coalesce(p_data->>'priority','') not in ('low','normal','high')
          or jsonb_typeof(p_data->'sensitive') is distinct from 'boolean'
          then raise exception 'invalid task' using errcode='22023'; end if;
        sensitive:=(p_data->>'sensitive')::boolean;
        if p_action='task_create' then
          insert into private.project_tasks(project_id,title,description,priority,sensitive,created_by,due_on)
            values(p.id,btrim(p_data->>'title'),btrim(p_data->>'description'),p_data->>'priority',sensitive,actor,(p_data->>'dueOn')::date)
            returning * into task;
        else
          update private.project_tasks set title=btrim(p_data->>'title'),description=btrim(p_data->>'description'),
            priority=p_data->>'priority',sensitive=(p_data->>'sensitive')::boolean,due_on=(p_data->>'dueOn')::date,
            version=version+1,updated_at=clock_timestamp() where id=task.id;
        end if;
      elsif p_action='task_assign' then
        if not private.project_permission(actor_role,'tasks.assign') or task.status not in ('todo','blocked','in_progress')
          then raise exception 'assignment unavailable' using errcode='PJB09'; end if;
        perform private.project_require_identity(actor);
        target:=(p_data->>'userId')::uuid;
        if target is not null and (target=actor or private.project_execution_role(p,target) is null
          or not exists(select 1 from private.project_team t where t.project_id=p.id and t.user_id=target and t.revoked_at is null)
          or feed_data.blocked_pair(actor,target) or feed_data.blocked_pair(task.created_by,target)
          or (task.sensitive and private.project_identity_state(target)<>'verified'))
          then raise exception 'assignment conflict' using errcode='PJB09'; end if;
        if target is not distinct from task.assignee_id then return jsonb_build_object('id',task.id,'version',task.version); end if;
        update private.project_tasks set assignee_id=target,accepted_at=null,status='todo',version=version+1,
          updated_at=clock_timestamp() where id=task.id;
        notice_to:=target;
      elsif p_action in ('task_accept','task_decline','task_progress','task_block','task_submit') then
        if task.assignee_id is distinct from actor or not private.project_permission(actor_role,'tasks.update_own') then
          raise exception 'task unavailable' using errcode='PJB05'; end if;
        if p_action in ('task_accept','task_decline') then
          if task.accepted_at is not null or task.status<>'todo' then raise exception 'assignment changed' using errcode='PJB09'; end if;
          update private.project_tasks set assignee_id=case when p_action='task_accept' then actor end,
            accepted_at=case when p_action='task_accept' then clock_timestamp() end,
            version=version+1,updated_at=clock_timestamp() where id=task.id;
          notice_to:=task.created_by;
        else
          if task.accepted_at is null or task.status not in ('todo','in_progress','blocked')
            then raise exception 'task changed' using errcode='PJB09'; end if;
          state:=case p_action when 'task_progress' then 'in_progress' when 'task_block' then 'blocked' else 'submitted' end;
          if state=task.status then return jsonb_build_object('id',task.id,'version',task.version); end if;
          update private.project_tasks set status=state,version=version+1,updated_at=clock_timestamp() where id=task.id;
          notice_to:=task.created_by;
        end if;
      elsif p_action in ('task_approve','task_return','task_cancel') then
        if not private.project_permission(actor_role,'tasks.review') or task.assignee_id=actor
          or (p_action='task_cancel' and task.status in ('completed','cancelled'))
          or (p_action<>'task_cancel' and (task.status<>'submitted' or private.project_execution_role(p,task.assignee_id) is null))
          then raise exception 'task review unavailable' using errcode='PJB09'; end if;
        perform private.project_require_identity(actor);
        if not private.project_operational_text(note,3,500) then raise exception 'reason required' using errcode='22023'; end if;
        state:=case p_action when 'task_approve' then 'completed' when 'task_return' then 'in_progress' else 'cancelled' end;
        update private.project_tasks set status=state,reviewer_id=actor,version=version+1,updated_at=clock_timestamp() where id=task.id;
        notice_to:=task.assignee_id;
      else raise exception 'invalid operation' using errcode='22023';
      end if;
      resource:=task.id;
    else raise exception 'invalid operation' using errcode='22023';
    end if;
  end if;

  insert into private.project_operations_events(project_id,actor_id,recipient_id,task_id,invitation_id,application_id,action,detail)
    values(p.id,actor,case when notice_to is distinct from actor then notice_to end,task.id,invite.id,application.id,p_action,note);
  return jsonb_build_object('id',coalesce(task.id,invite.id,application.id,resource,p.id));
end;
$$;
revoke all on function public.project_operation_for_client(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_operation_for_client(uuid,text,jsonb) to authenticated;
