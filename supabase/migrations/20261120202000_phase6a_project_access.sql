create function public.projects_list_for_client(p_category text,p_country text,p_department text,p_before timestamptz,p_before_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(private.project_card(p) order by p.approved_at desc,p.id desc),'[]')
  from (select p.id from private.community_projects p join private.project_revisions r on r.project_id=p.id and r.revision=p.revision
    where p.status='approved' and p.restricted_at is null and private.project_visible(p)
      and (p_category is null or p_category=r.category)
      and (p_country is null or p_country=r.proposal->>'country') and (p_department is null or p_department=r.department)
      and (p_before is null or (p.approved_at,p.id)<(p_before,p_before_id))
    order by p.approved_at desc,p.id desc limit 16) eligible
  join private.community_projects p using(id);
$$;

create function public.project_detail_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.community_projects; actor uuid:=auth.uid(); operator boolean; assigned boolean;
begin
  select * into p from private.community_projects where id=p_id;
  if not found or not private.project_has_read_access(p) then raise exception 'project unavailable' using errcode='PJP04'; end if;
  operator:=feed_data.member_allowed() and (private.project_owner_access(p,actor,'view_private') or private.project_owner_access(p,actor,'edit')
    or private.project_owner_access(p,actor,'submit') or private.project_owner_access(p,actor,'propose'));
  assigned:=p.status='under_review' and p.reviewer_id=actor and private.project_reviewer(p,actor) and feed_data.recent_feed_totp();
  return private.project_card(p)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=p.id and r.revision=p.revision),
    'version',case when operator or assigned then p.version end,
    'restricted',p.restricted_at is not null, 'canEdit',operator and p.restricted_at is null
      and p.status in ('draft','changes_requested') and private.project_owner_access(p,actor,'edit'),
    'canSubmit',operator and p.restricted_at is null and p.status in ('draft','changes_requested')
      and private.project_owner_access(p,actor,'submit'),'canDecide',coalesce(assigned,false),
    'canReport',private.project_visible(p) and feed_data.member_allowed() and p.creator_id is distinct from actor and p.submitted_by is distinct from actor,
    'history',case when operator or assigned then coalesce((select jsonb_agg(jsonb_build_object(
      'action',e.action,'revision',e.revision,'reason',e.reason,'createdAt',e.created_at) order by e.version desc)
      from private.project_events e where e.project_id=p.id and e.action in ('submit','request_changes','approve','reject','restrict')),'[]') else '[]'::jsonb end
  );
end;
$$;

create function public.project_media_for_client(p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare p private.community_projects;
begin
  select * into p from private.community_projects where id=p_id;
  if not found or not private.project_has_read_access(p) then raise exception 'project unavailable' using errcode='PJP04'; end if;
  return (select encode(i.image,'base64') from private.project_revisions r
    join private.project_images i on i.project_id=r.project_id and i.digest=r.image_digest
    where r.project_id=p.id and r.revision=p.revision);
end;
$$;

create function public.my_projects_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.project_card(p)||jsonb_build_object('createdByMe',p.creator_id=actor,
    'restricted',p.restricted_at is not null) order by p.updated_at desc,p.id desc)
    from (select x.id from private.community_projects x where
      private.project_owner_access(x,actor,'view_private') or private.project_owner_access(x,actor,'edit')
      or private.project_owner_access(x,actor,'submit') or private.project_owner_access(x,actor,'propose')
      order by x.updated_at desc,x.id desc limit 50) eligible join private.community_projects p using(id)),'[]');
end;
$$;

create function public.project_options_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'handle',o.handle) order by o.name,o.id)
      from private.organizations o where o.status='active' and private.organization_has_permission(actor,o.id,'projects.propose')),'[]'),
    'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',coalesce(c.name,d.name),'handle',c.slug,
      'canOwn',private.project_community_manager(c.id,actor)) order by coalesce(c.name,d.name),c.id)
      from feed_data.communities c left join public.departments d on d.code=c.department_code
      join feed_data.community_memberships m on m.community_id=c.id and m.user_id=actor),'[]'),
    'canReview',feed_data.moderation_role() or exists(select 1 from feed_data.community_staff s
      where s.user_id=actor and s.role='moderator' and feed_data.community_member(s.community_id,actor)),
    'canModerate',feed_data.moderation_role(),'canAssignOthers',private.platform_admin(actor));
end;
$$;

create function public.project_queue_for_client(p_reports boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); platform boolean:=feed_data.moderation_role();
begin
  if not coalesce(platform or (not p_reports and exists(select 1 from feed_data.community_staff s
    where s.user_id=actor and s.role='moderator' and feed_data.community_member(s.community_id,actor))),false)
    then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_reports then
    return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'projectId',r.project_id,'version',p.version,
      'title',v.proposal->>'title','category',r.category,'explanation',r.explanation,
      'restricted',p.restricted_at is not null) order by r.created_at,r.id)
      from (select f.* from private.project_reports f join private.community_projects x on x.id=f.project_id where f.outcome='pending'
        and f.reporter_id is distinct from actor and not private.project_conflicted(x,actor) order by f.created_at,f.id limit 40) r
      join private.community_projects p on p.id=r.project_id join private.project_revisions v on v.project_id=p.id and v.revision=p.revision),'[]');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,
    'title',r.proposal->>'title','category',r.category,'assignedToMe',coalesce(p.reviewer_id=actor,false),
    'assigned',p.reviewer_id is not null,'canClaim',not coalesce(private.project_reviewer(p,p.reviewer_id),false))
    order by p.submitted_at,p.id) from (select a.id from private.community_projects a where a.status in ('submitted','under_review')
      and a.restricted_at is null and private.project_reviewer(a,actor) order by a.submitted_at,a.id limit 40) q
    join private.community_projects p using(id) join private.project_revisions r on r.project_id=p.id and r.revision=p.revision),'[]');
end;
$$;

revoke all on function public.projects_list_for_client(text,text,text,timestamptz,uuid),public.project_detail_for_client(uuid),
  public.project_media_for_client(uuid),public.my_projects_for_client(),public.project_options_for_client(),public.project_queue_for_client(boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.projects_list_for_client(text,text,text,timestamptz,uuid),public.project_detail_for_client(uuid),
  public.project_media_for_client(uuid) to anon,authenticated;
grant execute on function public.my_projects_for_client(),public.project_options_for_client(),public.project_queue_for_client(boolean) to authenticated;

create or replace function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
    'projects.propose','projects.edit','projects.submit','projects.view_private'];
$$;
alter table private.organization_custom_roles drop constraint organization_custom_roles_permissions_check,
  add constraint organization_custom_roles_permissions_check check(cardinality(permissions) between 1 and 11
    and array_position(permissions,null) is null and permissions <@ private.organization_permission_catalog());

alter table feed_data.notifications drop constraint notifications_kind_check,
  add column project_event_id uuid references private.project_events(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved','project_rejected')),
  add constraint notification_project_scope check(
    (kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected'))=(project_event_id is not null)
    and (project_event_id is null or (actor_id is null and post_id is null and comment_id is null and appeal_id is null
      and verification_application_id is null and verification_appeal_id is null and representative_membership_id is null
      and ambassador_case_id is null and organization_role_event_id is null)));
create index notifications_project_event on feed_data.notifications(project_event_id) where project_event_id is not null;

create function private.notify_project_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare notice text;
begin
  notice:=case new.action when 'submit' then 'project_submitted' when 'assign' then 'project_assigned'
    when 'request_changes' then 'project_changes' when 'approve' then 'project_approved' when 'reject' then 'project_rejected' end;
  if notice is not null and new.recipient_id is not null and feed_data.author_active(new.recipient_id) then
    insert into feed_data.notifications(recipient_id,kind,project_event_id,dedupe)
      values(new.recipient_id,notice,new.id,'project:'||new.id::text) on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_project_event() from public,anon,authenticated,service_role;
create trigger notify_project_event after insert on private.project_events for each row execute function private.notify_project_event();
create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
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
      or coalesce(cardinality(p_permissions),0) not between 1 and 11
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
