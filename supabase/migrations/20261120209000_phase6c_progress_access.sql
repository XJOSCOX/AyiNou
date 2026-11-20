create function private.project_progress_public(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select private.project_visible(p) and private.project_executable(p)
    and exists(select 1 from private.project_execution e where e.project_id=p.id);
$$;

create function private.project_entry_public(p private.community_projects,x private.project_progress_entries)
returns boolean language sql stable set search_path='' as $$
  select x.project_id=p.id and x.visibility='public' and x.kind<>'evidence' and x.state='approved'
    and private.project_progress_public(p) and feed_data.author_active(x.author_id) and feed_data.viewer_can_interact(x.author_id)
    and (x.milestone_id is null or exists(select 1 from private.project_milestones m where m.project_id=p.id
      and m.id=x.milestone_id and m.status='completed' and m.public_requested));
$$;

create function private.project_entry_internal(p private.community_projects,x private.project_progress_entries,p_actor uuid,p_role text)
returns boolean language sql stable set search_path='' as $$
  select x.project_id=p.id and p_role is not null and p_role<>'delegate' and not feed_data.blocked_pair(p_actor,x.author_id)
    and (x.author_id=p_actor or private.project_progress_manager(p_role)
      or (x.kind<>'evidence' and x.state='approved'));
$$;

create function public.project_progress_for_client(p_id uuid,p_internal boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; actor_role text; execution text; managing boolean;
  milestone_rows jsonb; entry_rows jsonb; metric_rows jsonb:='[]'; audit_rows jsonb:='[]'; milestone_count integer; task_count integer;
begin
  if p_internal is null then raise exception 'invalid view' using errcode='22023'; end if;
  select * into p from private.community_projects where id=p_id;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  select status into execution from private.project_execution where project_id=p.id;
  if execution is null then raise exception 'project progress unavailable' using errcode='PJP04'; end if;
  if p_internal then
    if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
    actor_role:=private.project_execution_role(p,actor);
    if actor_role is null or actor_role='delegate' then raise exception 'project unavailable' using errcode='PJP04'; end if;
  elsif not private.project_progress_public(p) then
    raise exception 'project progress unavailable' using errcode='PJP04';
  end if;
  managing:=private.project_progress_manager(actor_role);

  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'description',m.description,'status',m.status,
    'startsOn',m.starts_on,'targetOn',m.target_on,'target',m.target,'unit',m.unit,'displayOrder',m.display_order,'updatedAt',m.updated_at,
    'publicRequested',m.public_requested,'version',case when p_internal then m.version end,
    'responsibleId',case when managing then m.responsible_id end,
    'mine',p_internal and m.responsible_id is not distinct from actor,
    'canReview',p_internal and managing and m.submitter_id is distinct from actor and m.status='submitted',
    'canApprove',p_internal and managing and m.submitter_id is distinct from actor and m.status='submitted'
      and (not m.public_requested or m.creator_id is distinct from actor))
    order by m.display_order,m.id),'[]'),count(*) filter(where m.status='completed')
    into milestone_rows,milestone_count from private.project_milestones m where m.project_id=p.id
    and (case when p_internal then not feed_data.blocked_pair(actor,m.responsible_id) and not feed_data.blocked_pair(actor,m.creator_id)
      else m.status='completed' and m.public_requested end);

  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'visibility',x.visibility,'state',x.state,
    'content',x.content,'supersedesId',case when p_internal then x.supersedes_id else
      (select y.id from private.project_progress_entries y where y.id=x.supersedes_id and private.project_entry_public(p,y)) end,
    'superseded',exists(select 1 from private.project_progress_entries y where y.supersedes_id=x.id
      and y.approved_at is not null),
    'milestoneId',x.milestone_id,'hasImage',x.image_digest is not null,'reviewed',x.reviewer_id is not null,
    'approvedAt',x.approved_at,'updatedAt',x.updated_at,'version',case when p_internal then x.version end,
    'mine',p_internal and x.author_id is not distinct from actor,
    'canReview',p_internal and managing and x.author_id is distinct from actor and x.state='submitted',
    'snapshot',case when p_internal or x.kind<>'report' then x.snapshot else
      jsonb_set(x.snapshot,'{milestones}',coalesce((select jsonb_agg(v-'id') from jsonb_array_elements(x.snapshot->'milestones') v
        where exists(select 1 from private.project_milestones m where m.project_id=p.id and m.id=(v->>'id')::uuid
          and m.status='completed' and m.public_requested)),'[]'::jsonb)) end)
    order by x.created_at desc,x.id desc),'[]') into entry_rows
    from private.project_progress_entries x where x.project_id=p.id
    and (case when p_internal then private.project_entry_internal(p,x,actor,actor_role) else private.project_entry_public(p,x) end);

  if p_internal then
    select count(*) into task_count from private.project_tasks t where t.project_id=p.id and t.status='completed'
      and private.project_task_visible(p,t,actor,actor_role);
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'unit',m.unit,'target',m.target,'version',m.version,
      'observations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'actual',o.actual,'startsOn',o.starts_on,'endsOn',o.ends_on,
        'explanation',case when not feed_data.blocked_pair(actor,o.reporter_id) then o.explanation end,
        'reference',case when not feed_data.blocked_pair(actor,o.reporter_id) then o.reference end,'source','self_reported')
        order by o.ends_on desc,o.id) from private.project_metric_observations o where o.metric_id=m.id),'[]'))
      order by m.name),'[]') into metric_rows from private.project_metrics m where m.project_id=p.id;
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'subjectId',a.progress_subject,
      'reason',a.detail,'at',a.created_at) order by a.created_at desc,a.id desc),'[]') into audit_rows
      from (select e.* from private.project_operations_events e where e.project_id=p.id and e.progress_subject is not null
        and not feed_data.blocked_pair(actor,e.actor_id) and (
          managing or exists(select 1 from private.project_milestones m where m.id=e.progress_subject and m.responsible_id=actor)
          or exists(select 1 from private.project_progress_entries x where x.id=e.progress_subject and x.author_id=actor))
        order by e.created_at desc,e.id desc limit 80) a;
  end if;
  return jsonb_build_object('status',execution,'completedOn',private.project_completion_on(p.id),'role',actor_role,
    'canManage',managing,'milestones',milestone_rows,'entries',entry_rows,'metrics',metric_rows,'history',audit_rows,
    'taskCount',task_count,'milestoneCount',milestone_count);
end;
$$;

create function public.project_progress_media_for_client(p_id uuid,p_entry uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare p private.community_projects; x private.project_progress_entries;
begin
  select * into p from private.community_projects where id=p_id;
  if not found then raise exception 'evidence unavailable' using errcode='PJC06'; end if;
  select * into x from private.project_progress_entries where project_id=p.id and id=p_entry;
  if not found or not coalesce(private.project_entry_public(p,x) or (feed_data.member_allowed() and
    private.project_entry_internal(p,x,auth.uid(),private.project_execution_role(p,auth.uid()))),false)
    then raise exception 'evidence unavailable' using errcode='PJC06'; end if;
  return (select encode(image,'base64') from private.project_images where project_id=p.id and digest=x.image_digest);
end;
$$;

revoke all on function private.project_progress_public(private.community_projects),
  private.project_entry_public(private.community_projects,private.project_progress_entries),
  private.project_entry_internal(private.community_projects,private.project_progress_entries,uuid,text),
  public.project_progress_for_client(uuid,boolean),public.project_progress_media_for_client(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.project_progress_for_client(uuid,boolean),public.project_progress_media_for_client(uuid,uuid)
  to anon,authenticated;

create or replace function public.project_work_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; e private.project_execution; actor_role text;
  public_access boolean; recruits boolean; manager boolean; applications jsonb; invites jsonb;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into p from private.community_projects where id=p_id;
  if not found or not private.project_executable(p) or not private.project_execution_actor(p,actor)
    then raise exception 'project unavailable' using errcode='PJP04'; end if;
  select * into e from private.project_execution where project_id=p_id;
  actor_role:=private.project_execution_role(p,actor);
  public_access:=e.status='active' and private.project_visible(p);
  manager:=private.project_permission(actor_role,'team.manage');
  recruits:=private.project_permission(actor_role,'volunteers.review');
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expiresAt',i.expires_at,'mine',i.recipient_id=actor,'recipient',
    case when manager then private.project_person(i.recipient_id) end) order by i.created_at desc),'[]') into invites
  from private.project_invitations i where i.project_id=p_id and i.status='pending' and i.expires_at>now()
    and feed_data.community_member(p.community_id,i.recipient_id)
    and not feed_data.blocked_pair(actor,i.inviter_id) and not feed_data.blocked_pair(actor,i.recipient_id)
    and private.project_can_invite(private.project_execution_role(p,i.inviter_id),i.role)
    and (i.recipient_id=actor or (manager and (actor_role in ('owner','delegate') or i.inviter_id=actor)));
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'opportunityId',a.opportunity_id,'status',a.status,
    'feedback',case when not feed_data.blocked_pair(actor,a.reviewer_id) then a.feedback end,
    'title',o.title,'mine',a.applicant_id=actor,'applicant',case when recruits then private.project_person(a.applicant_id) end)
    order by a.created_at desc),'[]')
    into applications from (select a.* from private.project_applications a where a.project_id=p_id
      and ((a.applicant_id=actor and feed_data.community_member(p.community_id,actor))
        or (recruits and private.project_execution_actor(p,a.applicant_id)
        and not feed_data.blocked_pair(actor,a.applicant_id))) order by a.created_at desc limit 100) a
      join private.project_opportunities o on o.id=a.opportunity_id;
  if actor_role is null and not coalesce(public_access,false) and invites='[]' and applications='[]'
    then raise exception 'project unavailable' using errcode='PJP04'; end if;
  return jsonb_build_object(
    'projectId',p.id,'title',(private.project_card(p)->>'title'),'status',coalesce(e.status,'approved'),'version',coalesce(e.version,0),
    'role',actor_role,'identity',private.project_identity_state(actor),
    'canApply',coalesce(e.status='active' and (actor_role is not null or public_access) and feed_data.community_member(p.community_id,actor),false),
    'invites',invites,'applications',applications,
    'team',case when actor_role in ('owner','delegate','manager','supervisor') then coalesce((select jsonb_agg(
      jsonb_build_object('person',private.project_person(t.user_id),'role',t.role,'mine',t.user_id=actor,
        'eligible',private.project_execution_role(p,t.user_id) is not null) order by t.joined_at)
      from private.project_team t where t.project_id=p_id and t.revoked_at is null
        and private.project_execution_actor(p,t.user_id) and not feed_data.blocked_pair(actor,t.user_id)),'[]') else '[]'::jsonb end,
    'opportunities',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'description',o.description,
      'skills',o.skills,'commitment',o.commitment,'remote',o.remote,'capacity',o.capacity,'closesOn',o.closes_on,
      'open',e.status='active' and o.closed_at is null and (o.closes_on is null or o.closes_on>=current_date))
      order by o.created_at desc) from private.project_opportunities o where o.project_id=p_id
      and (recruits or ((actor_role is not null or public_access) and e.status='active' and o.closed_at is null
        and (o.closes_on is null or o.closes_on>=current_date) and feed_data.author_active(o.manager_id)
        and not feed_data.blocked_pair(actor,o.manager_id)))),'[]'),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,
      'status',t.status,'milestoneId',t.milestone_id,'canCoordinate',actor_role='supervisor' and t.created_by=actor,
      'priority',t.priority,'sensitive',t.sensitive,'dueOn',t.due_on,'version',t.version,
      'assigned',t.assignee_id is not null,'mine',t.assignee_id is not distinct from actor,'accepted',t.accepted_at is not null,
      'assignee',case when actor_role in ('owner','manager','supervisor') then private.project_person(t.assignee_id) end)
      order by t.created_at desc) from private.project_tasks t where t.project_id=p_id
        and private.project_task_visible(p,t,actor,actor_role)),'[]'),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'date',x.created_at,
      'taskId',x.task_id,'detail',case when x.action<>'member_revoke' then x.detail end) order by x.created_at desc)
      from (select a.* from private.project_operations_events a left join private.project_tasks t
        on t.project_id=a.project_id and t.id=a.task_id where a.project_id=p_id
        and not feed_data.blocked_pair(actor,a.actor_id) and not feed_data.blocked_pair(actor,a.recipient_id)
        and (case when a.task_id is not null then private.project_task_visible(p,t,actor,actor_role)
          else actor_role in ('owner','delegate','manager') and (a.action not like 'volunteer_%' or recruits) end)
        order by a.created_at desc,a.id desc limit 60) x),'[]'));
end;
$$;

create or replace function private.project_operation_notice_visible(p_event uuid,p_recipient uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.project_operations_events a
    join private.community_projects p on p.id=a.project_id
    join private.project_execution e on e.project_id=p.id
    left join private.project_invitations i on i.id=a.invitation_id
    left join private.project_applications v on v.id=a.application_id
    left join private.project_tasks t on t.project_id=p.id and t.id=a.task_id
    cross join lateral (select private.project_execution_role(p,p_recipient) as role) access
    where a.id=p_event and a.recipient_id=p_recipient and private.project_executable(p)
      and private.project_execution_actor(p,p_recipient) and not feed_data.blocked_pair(p_recipient,a.actor_id)
      and case
        when a.action in ('milestone_assigned','milestone_approved','milestone_returned') then
          exists(select 1 from private.project_milestones m where m.project_id=p.id and m.id=a.progress_subject
            and access.role is not null and access.role<>'delegate'
            and not feed_data.blocked_pair(p_recipient,m.creator_id) and not feed_data.blocked_pair(p_recipient,m.responsible_id)
            and (case when a.action='milestone_assigned' then m.responsible_id=p_recipient else m.submitter_id=p_recipient end))
        when a.action='milestone_submitted' then private.project_progress_manager(access.role)
          and exists(select 1 from private.project_milestones m where m.project_id=p.id and m.id=a.progress_subject and m.status='submitted')
        when a.action in ('entry_submit','team_update_shared','entry_approve','entry_return','entry_reject',
          'report_submitted','report_returned','report_rejected','report_published') then
          exists(select 1 from private.project_progress_entries x where x.id=a.progress_subject
            and private.project_entry_internal(p,x,p_recipient,access.role)
            and (a.action not in ('entry_submit','report_submitted') or x.state='submitted'))
        when a.action='progress_project_completed' then private.project_progress_manager(access.role)
          and e.status in ('completed','archived')
        when a.action='invite' then e.status='active' and i.status='pending' and i.expires_at>now()
          and i.recipient_id=p_recipient and feed_data.community_member(p.community_id,p_recipient)
          and private.project_can_invite(private.project_execution_role(p,i.inviter_id),i.role)
        when a.action in ('invite_accept','invite_decline') then private.project_can_invite(access.role,i.role)
        when a.action='volunteer_apply' then private.project_permission(access.role,'volunteers.review')
        when a.action in ('volunteer_offer','volunteer_reject') then v.applicant_id=p_recipient
          and feed_data.community_member(p.community_id,p_recipient) and v.status in ('offered','accepted','rejected')
        when a.action='task_assign' then t.assignee_id=p_recipient and private.project_task_visible(p,t,p_recipient,access.role)
        when a.task_id is not null then private.project_task_visible(p,t,p_recipient,access.role)
        else false end);
$$;

create function private.notify_project_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.action='execution_status' and new.detail='completed' then
    insert into private.project_operations_events(project_id,actor_id,recipient_id,action)
      select p.id,new.actor_id,t.user_id,'progress_project_completed'
      from private.community_projects p join private.project_team t on t.project_id=p.id
      where p.id=new.project_id and t.role='manager' and t.revoked_at is null and t.user_id is distinct from new.actor_id
        and private.project_execution_role(p,t.user_id)='manager' and not feed_data.blocked_pair(new.actor_id,t.user_id)
      order by t.joined_at,t.user_id limit 10;
  end if;
  return new;
end;
$$;
create trigger notify_project_completion after insert on private.project_operations_events
  for each row execute function private.notify_project_completion();
revoke all on function private.notify_project_completion() from public,anon,authenticated,service_role;
