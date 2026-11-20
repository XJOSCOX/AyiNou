create function private.project_person(p_user uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p_user,'name',p.display_name,'handle',p.username)
  from public.profiles p where p.user_id=p_user;
$$;

create function public.project_work_for_client(p_id uuid)
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
      'status',t.status,'priority',t.priority,'sensitive',t.sensitive,'dueOn',t.due_on,'version',t.version,
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

create function public.project_work_index_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'work',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',r.proposal->>'title','status',e.status)
      order by e.updated_at desc,p.id)
      from (select p.id as project_id,coalesce(x.status,'approved') as status,coalesce(x.updated_at,p.updated_at) as updated_at
        from private.community_projects p left join private.project_execution x on p.id=x.project_id
        where private.project_execution_actor(p,actor) and private.project_executable(p) and (
          private.project_execution_role(p,actor) is not null or exists(select 1 from private.project_invitations i
            where i.project_id=p.id and i.recipient_id=actor and i.status='pending' and i.expires_at>now()
              and feed_data.community_member(p.community_id,actor)
              and not feed_data.blocked_pair(actor,i.inviter_id)
              and private.project_can_invite(private.project_execution_role(p,i.inviter_id),i.role))
          or (feed_data.community_member(p.community_id,actor) and exists(
            select 1 from private.project_applications a where a.project_id=p.id and a.applicant_id=actor)))
        order by coalesce(x.updated_at,p.updated_at) desc,p.id limit 50) e join private.community_projects p on p.id=e.project_id
        join private.project_revisions r on r.project_id=p.id and r.revision=p.revision),'[]'),
    'opportunities',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'projectId',o.project_id,'title',o.title,'remote',o.remote)
      order by o.created_at desc,o.id desc) from (select o.* from private.project_opportunities o
      join private.project_execution e on e.project_id=o.project_id join private.community_projects p on p.id=e.project_id
      where e.status='active' and o.closed_at is null and (o.closes_on is null or o.closes_on>=current_date)
        and private.project_executable(p) and private.project_visible(p) and private.project_execution_actor(p,actor)
        and feed_data.author_active(o.manager_id) and not feed_data.blocked_pair(actor,o.manager_id)
      order by o.created_at desc,o.id desc limit 50) o),'[]'));
end;
$$;
revoke all on function private.project_person(uuid),public.project_work_for_client(uuid),public.project_work_index_for_client()
  from public,anon,authenticated,service_role;
grant execute on function public.project_work_for_client(uuid),public.project_work_index_for_client() to authenticated;

create or replace function public.project_detail_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.community_projects; actor uuid:=auth.uid(); operator boolean; assigned boolean; identity_state text;
begin
  select * into p from private.community_projects where id=p_id;
  if not found or not private.project_has_read_access(p) then raise exception 'project unavailable' using errcode='PJP04'; end if;
  operator:=feed_data.member_allowed() and (private.project_owner_access(p,actor,'view_private') or private.project_owner_access(p,actor,'edit')
    or private.project_owner_access(p,actor,'submit') or private.project_owner_access(p,actor,'propose'));
  assigned:=p.status='under_review' and p.reviewer_id=actor and private.project_reviewer(p,actor) and feed_data.recent_feed_totp();
  if operator and p.restricted_at is null and p.status in ('draft','changes_requested')
    and private.project_owner_access(p,actor,'submit') then
    identity_state:=private.project_identity_state(actor);
  end if;
  return private.project_card(p)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=p.id and r.revision=p.revision),
    'version',case when operator or assigned then p.version end,
    'restricted',p.restricted_at is not null, 'canEdit',operator and p.restricted_at is null
      and p.status in ('draft','changes_requested') and private.project_owner_access(p,actor,'edit'),
    'canSubmit',coalesce(identity_state='verified',false),
    'submissionIdentity',identity_state,
    'publicationEligibility',case when operator and p.status='approved' and p.restricted_at is null then
      case when private.project_visible(p) then 'published'
        when not exists(select 1 from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
          and r.proposal->>'publishRequested'='true') then 'private'
        when p.organization_id is not null and exists(select 1 from private.organizations o
          where o.id=p.organization_id and o.status='active' and o.verification_status='unverified')
          then 'pending_institution_verification'
        else 'unavailable' end
      end,
    'canOpenWork',feed_data.member_allowed() and private.project_executable(p)
      and private.project_execution_actor(p,actor) and (
        private.project_execution_role(p,actor) is not null or (private.project_visible(p) and exists(
          select 1 from private.project_execution where project_id=p.id and status='active'))),
    'canDecide',coalesce(assigned,false),
    'canReport',private.project_visible(p) and feed_data.member_allowed() and p.creator_id is distinct from actor and p.submitted_by is distinct from actor,
    'history',case when operator or assigned then coalesce((select jsonb_agg(jsonb_build_object(
      'action',e.action,'revision',e.revision,'reason',e.reason,'createdAt',e.created_at) order by e.version desc)
      from private.project_events e where e.project_id=p.id and e.action in ('submit','request_changes','approve','reject','restrict')),'[]') else '[]'::jsonb end
  );
end;
$$;

create or replace function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
    'projects.propose','projects.edit','projects.submit','projects.view_private','projects.operate'];
$$;


alter table private.organization_custom_roles drop constraint organization_custom_roles_permissions_check,
  add constraint organization_custom_roles_permissions_check
  check(cardinality(permissions) between 1 and cardinality(private.organization_permission_catalog())
    and array_position(permissions,null) is null and permissions <@ private.organization_permission_catalog());

alter table feed_data.notifications drop constraint notifications_kind_check,
  add column project_operation_event_id uuid references private.project_operations_events(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved','project_rejected','project_operation')),
  add constraint notification_project_operation_scope check(
    (kind='project_operation')=(project_operation_event_id is not null)
    and (project_operation_event_id is null or (actor_id is null and post_id is null and comment_id is null and appeal_id is null
      and verification_application_id is null and verification_appeal_id is null and representative_membership_id is null
      and ambassador_case_id is null and organization_role_event_id is null and project_event_id is null)));
create index notifications_project_operation_event on feed_data.notifications(project_operation_event_id) where project_operation_event_id is not null;

create function private.project_operation_notice_visible(p_event uuid,p_recipient uuid)
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

create function private.notify_project_operation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.recipient_id is not null and new.recipient_id is distinct from new.actor_id
    and private.project_operation_notice_visible(new.id,new.recipient_id) then
    insert into feed_data.notifications(recipient_id,kind,project_operation_event_id,dedupe)
      values(new.recipient_id,'project_operation',new.id,'project-operation:'||new.id) on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
create trigger notify_project_operation after insert on private.project_operations_events
  for each row execute function private.notify_project_operation();

create function private.project_unassign_revoked_member()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    with removed as (
      update private.project_tasks set assignee_id=null,accepted_at=null,status='todo',
        version=version+1,updated_at=clock_timestamp()
      where project_id=new.project_id and assignee_id=new.user_id and status not in ('completed','cancelled') returning id
    ) insert into private.project_operations_events(project_id,actor_id,task_id,action)
      select new.project_id,auth.uid(),id,'task_unassigned' from removed;
  end if;
  return new;
end;
$$;
create trigger project_unassign_revoked_member after update of revoked_at on private.project_team
  for each row execute function private.project_unassign_revoked_member();
revoke all on function private.project_operation_notice_visible(uuid,uuid),private.notify_project_operation(),
  private.project_unassign_revoked_member() from public,anon,authenticated,service_role;

create or replace function public.organization_role_save_for_client(p_org uuid,p_id uuid,p_version integer,p_name text,p_description text,p_permissions text[],p_deactivate boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.organization_role_actor(p_org); r private.organization_custom_roles;
  previous jsonb; event_name text; removed record;
begin
  perform private.organization_role_budget(actor);
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.institution_actor(actor) or not coalesce(private.institution_role(actor,p_org) in ('owner','administrator'),false)
  then raise exception 'role definition reserved' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_deactivate is null or (p_id is null and (p_deactivate or p_version is not null))
  then raise exception 'invalid transition' using errcode='22023'; end if;
  if not p_deactivate then
    if not private.valid_trust_text(p_name,2,64) or p_name~'[[:cntrl:]]'
      or (p_description is not null and not private.valid_trust_text(p_description,1,300))
      or coalesce(cardinality(p_permissions),0) not between 1 and cardinality(private.organization_permission_catalog())
    then raise exception 'invalid role' using errcode='22023'; end if;
    if not (p_permissions <@ private.organization_permission_catalog())
      or exists(select 1 from unnest(p_permissions) p where p is null)
    then raise exception 'permission unavailable' using errcode='POR11'; end if;
    p_permissions:=array(select distinct p from unnest(p_permissions) p order by p);
  end if;
  if p_id is null then
    if (select count(*) from private.organization_custom_roles where organization_id=p_org)>=100
      or (select count(*) from private.organization_custom_roles where organization_id=p_org and deactivated_at is null)>=20
    then raise exception 'role limit' using errcode='PFR29'; end if;
    insert into private.organization_custom_roles(organization_id,name,description,permissions)
      values(p_org,btrim(p_name),btrim(p_description),p_permissions) returning * into r;
    event_name:='role_created';
  else
    select * into r from private.organization_custom_roles where id=p_id and organization_id=p_org and deactivated_at is null;
    if not found then raise exception 'role unavailable' using errcode='POR04'; end if;
    if r.version is distinct from p_version then raise exception 'role changed' using errcode='POR09'; end if;
    if not p_deactivate and (r.name,r.description,r.permissions) is not distinct from (btrim(p_name),btrim(p_description),p_permissions)
      then return r.id; end if;
    previous:=private.organization_role_card(r);
    if p_deactivate then
      update private.organization_custom_roles set deactivated_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1
        where id=p_id returning * into r;
      for removed in update private.organization_custom_assignments set revoked_at=clock_timestamp()
        where role_id=p_id and revoked_at is null returning id,user_id
      loop
        insert into private.organization_role_audit(organization_id,role_id,assignment_id,actor_id,subject_id,event)
          values(p_org,p_id,removed.id,actor,removed.user_id,'revoked');
      end loop;
      event_name:='role_deactivated';
    else
      update private.organization_custom_roles set name=btrim(p_name),description=btrim(p_description),permissions=p_permissions,
        updated_at=clock_timestamp(),version=version+1 where id=p_id returning * into r;
      event_name:='role_edited';
    end if;
  end if;
  insert into private.organization_role_audit(organization_id,role_id,actor_id,event,before_state,after_state)
    values(p_org,r.id,actor,event_name,previous,private.organization_role_card(r));
  return r.id;
exception when unique_violation then raise exception 'role name already exists' using errcode='POR12';
end;
$$;

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff','group_manage','group_response','community_rec_build','community_rec_write',
    'project_create','project_write','project_review','project_report','project_image','project_invite','project_apply','project_task_create','project_operations'));

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='project_operation' then private.project_operation_notice_visible(n.project_operation_event_id,n.recipient_id)
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
    when n.kind='organization_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_role_audit a where a.id=n.organization_role_event_id and a.subject_id=n.recipient_id)
    when n.kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected') then
      feed_data.author_active(n.recipient_id) and exists(select 1 from private.project_events e
        join private.community_projects p on p.id=e.project_id where e.id=n.project_event_id and e.recipient_id=n.recipient_id
          and (case when e.action='assign' then p.status='under_review' and p.reviewer_id=n.recipient_id
            and private.project_reviewer(p,n.recipient_id)
            else private.project_owner_access(p,n.recipient_id,'submit') or private.project_owner_access(p,n.recipient_id,'view_private') end))
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind='new_follower' then feed_data.follower_visible(n.actor_id)
      and feed_data.follower_visible(n.recipient_id) and exists(
        select 1 from feed_data.member_follows where follower_id=n.actor_id and target_id=n.recipient_id)
    else exists(select 1 from feed_data.posts p where p.id=n.post_id and feed_data.discussion_visible(p))
      and case when n.kind='post_reaction' then exists(
        select 1 from feed_data.post_reactions r where r.post_id=n.post_id and r.user_id=n.actor_id)
      else exists(select 1 from feed_data.comments c where c.id=n.comment_id and c.post_id=n.post_id
        and feed_data.comment_visible(c)
        and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
          and feed_data.comment_visible(parent)))) end
    end;
$$;

create or replace function public.notifications_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 30 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.created_at,'readAt',n.read_at,
    'available',n.visible,'kind',case when n.visible then n.kind end,'postId',case when n.visible then n.post_id end,
    'commentId',case when n.visible then n.comment_id end,'appealId',case when n.visible then n.appeal_id end,
    'projectOperation',case when n.visible and n.kind='project_operation' then (
      select jsonb_build_object('projectId',e.project_id,'action',e.action) from private.project_operations_events e where e.id=n.project_operation_event_id)
    end,'actor',case when n.visible then feed_data.author_projection(n.actor_id)-'avatarPath' end) order by n.created_at desc,n.id desc)
    from (
      select n.*,feed_data.notification_visible(n) as visible from (
        select x.* from feed_data.notifications x where x.recipient_id=auth.uid() and x.created_at>=now()-interval '30 days'
          and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
        order by x.created_at desc,x.id desc limit p_limit+1
      ) n
    ) n),'[]');
end;
$$;
