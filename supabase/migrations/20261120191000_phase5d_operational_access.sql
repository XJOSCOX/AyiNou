create function public.organization_roles_for_client(p_org uuid,p_username text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); caps text[]; actor_foundation text; owner_admin boolean; can_view_team boolean; can_assign boolean;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  caps:=private.organization_effective_permissions(actor,p_org);
  if cardinality(caps)=0 then raise exception 'organization unavailable' using errcode='POR04'; end if;
  if p_username is not null and p_username !~ '^[a-z0-9][a-z0-9_]{2,23}$'
    then raise exception 'invalid team search' using errcode='22023'; end if;
  actor_foundation:=private.institution_role(actor,p_org);
  owner_admin:=coalesce(actor_foundation in ('owner','administrator'),false);
  can_view_team:='team.view'=any(caps);
  can_assign:='roles.assign'=any(caps);
  return jsonb_build_object('organization',(select jsonb_build_object('id',o.id,'name',o.name,'handle',o.handle,'description',o.description)
      from private.organizations o where o.id=p_org),
    'foundation',actor_foundation,'permissions',caps,'canEditRoles',owner_admin,'canAssign',can_assign,'canViewTeam',can_view_team,
    'roles',coalesce((select jsonb_agg(private.organization_role_card(r)||jsonb_build_object(
      'canDelegate',can_assign and r.deactivated_at is null and private.organization_can_delegate(caps,actor_foundation,r.permissions),
      'assignedToMe',exists(select 1 from private.organization_custom_assignments a where a.role_id=r.id and a.user_id=actor
        and private.organization_grant_current(a))) order by r.deactivated_at nulls first,lower(r.name),r.id)
      from private.organization_custom_roles r where r.organization_id=p_org and
        (owner_admin or (r.deactivated_at is null and (can_view_team
          or (can_assign and private.organization_can_delegate(caps,actor_foundation,r.permissions))
          or exists(select 1 from private.organization_custom_assignments a where a.role_id=r.id and a.user_id=actor
            and private.organization_grant_current(a)))))),'[]'),
    'team',case when can_view_team or (can_assign and p_username is not null) then
      coalesce((select jsonb_agg(jsonb_build_object('id',candidate.user_id,'username',candidate.username,
        'displayName',candidate.display_name,'foundation',candidate.foundation,
        'assignable',can_assign and candidate.user_id<>actor and candidate.foundation is distinct from 'owner'
          and (candidate.foundation is distinct from 'administrator' or actor_foundation is not distinct from 'owner'),
        'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'roleId',a.role_id) order by a.granted_at,a.id)
          from private.organization_custom_assignments a join private.organization_custom_roles r on r.id=a.role_id and r.deactivated_at is null
          where a.organization_id=p_org and a.user_id=candidate.user_id and private.organization_grant_current(a)
            and (can_view_team or private.organization_can_delegate(caps,actor_foundation,r.permissions))),'[]'))
        order by candidate.username,candidate.user_id) from (
        select p.user_id,p.username,p.display_name,private.institution_role(p.user_id,p_org) as foundation
        from (select m.user_id from private.organization_memberships m where m.organization_id=p_org and m.revoked_at is null
                and (m.expires_at is null or m.expires_at>statement_timestamp())
              union select a.user_id from private.organization_affiliations a where a.organization_id=p_org and a.status='active') member
        join public.profiles p on p.user_id=member.user_id
        where (p_username is null or p.username=p_username) and private.institution_actor(p.user_id)
        order by p.username,p.user_id limit 100) candidate),'[]') else '[]'::jsonb end,
    'activity',case when owner_admin then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'event',a.event,
        'roleId',a.role_id,'before',a.before_state,'after',a.after_state,'occurredAt',a.created_at,
        'actor',actor_profile.username,'subject',subject_profile.username) order by a.created_at desc,a.id)
      from (select * from private.organization_role_audit where organization_id=p_org order by created_at desc,id limit 30) a
      left join public.profiles actor_profile on actor_profile.user_id=a.actor_id
      left join public.profiles subject_profile on subject_profile.user_id=a.subject_id),'[]') else '[]'::jsonb end);
end;
$$;

create function public.my_organization_roles_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'handle',o.handle) order by o.name,o.id)
    from private.organizations o where o.status='active' and exists(
      select 1 from private.organization_custom_assignments a join private.organization_custom_roles r on r.id=a.role_id
      where a.organization_id=o.id and a.user_id=auth.uid() and r.deactivated_at is null and private.organization_grant_current(a))
      and private.institution_role(auth.uid(),o.id) is null),'[]');
end;
$$;
revoke all on function public.organization_roles_for_client(uuid,text),public.my_organization_roles_for_client()
  from public,anon,authenticated,service_role;
grant execute on function public.organization_roles_for_client(uuid,text),public.my_organization_roles_for_client() to authenticated;


create function private.affiliation_inviter(p_actor uuid,p_org uuid,p_type text)
returns boolean language sql stable set search_path='' as $$
  select private.affiliation_manager(p_actor,p_org)
    or (p_type<>'staff' and private.organization_has_permission(p_actor,p_org,'affiliations.invite'));
$$;

create function private.affiliation_can_manage_subject(p_actor uuid,p_org uuid,p_subject uuid,p_type text)
returns boolean language sql stable set search_path='' as $$
  select p_subject<>p_actor and (private.affiliation_manager(p_actor,p_org) or
    (p_type<>'staff' and private.institution_role(p_subject,p_org) is null
      and private.organization_has_permission(p_actor,p_org,'affiliations.manage')
      and not exists(select 1 from private.organization_custom_assignments a
        where a.organization_id=p_org and a.user_id=p_subject and private.organization_grant_current(a))));
$$;

revoke all on function private.affiliation_inviter(uuid,uuid,text),private.affiliation_can_manage_subject(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;


create or replace function public.institution_save_for_api(p_actor uuid, p_org uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or p_input = '{}'::jsonb or pg_column_size(p_input) > 4096
    or (p_input - array['handle','name','kind','description','countryCode','departmentCode','website','contactEmail']) <> '{}'::jsonb
  then raise exception 'invalid organization fields' using errcode = '23514'; end if;
  if p_org is null then
    perform 1 from auth.users where id = p_actor for no key update;
    if (select count(*) from private.organizations where created_by = p_actor) >= 10 then
      raise exception 'creation limit' using errcode = '54000';
    end if;
    insert into private.organizations(handle,name,kind,description,country_code,department_code,website,contact_email,created_by)
      values (p_input->>'handle',p_input->>'name',p_input->>'kind',p_input->>'description',
        p_input->>'countryCode',p_input->>'departmentCode',p_input->>'website',p_input->>'contactEmail',p_actor)
      returning * into o;
    insert into private.organization_memberships(organization_id,user_id,role,granted_by) values (o.id,p_actor,'owner',p_actor);
    insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,o.id,o.id,'organization_created');
  else
    select * into o from private.organizations where id = p_org for no key update;
    actor_role := private.institution_role(p_actor,p_org);
    if (actor_role is distinct from 'owner' and actor_role is distinct from 'administrator'
        and ((p_input-'description')<>'{}'::jsonb or not private.organization_has_permission(p_actor,p_org,'content.edit')))
      or (actor_role = 'administrator' and p_input ?| array['handle','name','kind','countryCode','departmentCode','website'])
    then raise exception 'access denied' using errcode = '42501'; end if;
    if (o.verification_status = 'verified' or exists (
      select 1 from private.verification_applications where organization_id = p_org
        and kind in ('organization','government') and status = 'pending'
    )) and p_input ?| array['handle','name','kind','countryCode','departmentCode','website']
    then raise exception 'identity fields locked' using errcode = '55000'; end if;
    update private.organizations set
      handle = coalesce(p_input->>'handle',o.handle), name = coalesce(p_input->>'name',o.name),
      kind = coalesce(p_input->>'kind',o.kind), country_code = coalesce(p_input->>'countryCode',o.country_code),
      department_code = case when p_input ? 'departmentCode' then p_input->>'departmentCode' else o.department_code end,
      description = case when p_input ? 'description' then p_input->>'description' else o.description end,
      website = case when p_input ? 'website' then p_input->>'website' else o.website end,
      contact_email = case when p_input ? 'contactEmail' then p_input->>'contactEmail' else o.contact_email end,
      updated_at = now() where id = p_org;
    insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,p_org,'organization_updated');
  end if;
  return o.id;
end;
$$;

create or replace function public.affiliations_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'affiliations',coalesce((
      select jsonb_agg(private.affiliation_projection(a) || jsonb_build_object('organizationName',o.name,'handle',o.handle) order by o.name,a.id)
      from private.organization_affiliations a join private.organizations o on o.id=a.organization_id
      where a.user_id=p_actor and a.status in ('pending','active','suspended') and o.status='active'
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'organizationName',o.name,'handle',o.handle,'affiliationType',i.affiliation_type,
        'expiresAt',i.expires_at) order by i.expires_at,i.id)
      from private.organization_affiliation_invitations i join private.organizations o on o.id=i.organization_id
      where i.recipient_id=p_actor and i.status='pending' and i.expires_at>now() and o.status='active'
        and private.affiliation_inviter(i.invited_by,o.id,i.affiliation_type)
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'event',e.event,'affiliationType',e.affiliation_type,
        'occurredAt',e.occurred_at,'organizationName',o.name,'reason',r.reason) order by e.occurred_at desc,e.id)
      from (select * from private.organization_affiliation_events where user_id=p_actor
        order by occurred_at desc,id limit 100) e
      join private.organizations o on o.id=e.organization_id
      left join private.organization_join_requests r on r.affiliation_id=e.affiliation_id and e.event='rejected'
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.affiliation_manage_for_api(p_actor uuid,p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o private.organizations; caps text[]:=private.organization_effective_permissions(p_actor,p_org);
  fixed_manager boolean:=private.affiliation_manager(p_actor,p_org);
  manage_members boolean:='affiliations.manage'=any(caps);
  review_requests boolean:='affiliations.review'=any(caps);
  invite_members boolean:='affiliations.invite'=any(caps);
begin
  if not (manage_members or review_requests or invite_members) then raise exception 'access denied' using errcode='42501'; end if;
  select * into strict o from private.organizations where id=p_org;
  return jsonb_build_object('membershipPolicy',o.membership_policy,'directoryEnabled',o.member_directory_enabled,
    'policyLocked',o.membership_policy_locked or o.kind in ('municipality','ministry','embassy','government_agency'),
    'canSetPolicy',private.institution_role(p_actor,p_org)='owner',
    'canManageMembers',manage_members,'canReviewRequests',review_requests,'canInvite',invite_members,'canInviteStaff',fixed_manager,
    'members',coalesce((
      select jsonb_agg(private.affiliation_projection(a) || jsonb_build_object('displayName',p.display_name,
        'username',p.username,'isSelf',a.user_id=p_actor,'canManage',
        private.affiliation_can_manage_subject(p_actor,p_org,a.user_id,a.affiliation_type)) order by a.joined_at,a.id)
      from private.organization_affiliations a left join public.profiles p using(user_id)
      where manage_members and a.organization_id=p_org and a.status in ('active','suspended')
    ),'[]'::jsonb),
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'affiliationType',r.affiliation_type,'message',r.message,
        'createdAt',r.created_at,'displayName',p.display_name,'username',p.username,'isSelf',r.requester_id=p_actor)
        order by r.created_at,r.id)
      from private.organization_join_requests r left join public.profiles p on p.user_id=r.requester_id
      where review_requests and r.organization_id=p_org and r.status='pending' and (fixed_manager or r.affiliation_type<>'staff')
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'affiliationType',i.affiliation_type,'expiresAt',i.expires_at,
        'username',p.username) order by i.expires_at,i.id)
      from private.organization_affiliation_invitations i left join public.profiles p on p.user_id=i.recipient_id
      where invite_members and i.organization_id=p_org and i.status='pending' and i.expires_at>now()
        and (fixed_manager or i.invited_by=p_actor)
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.affiliation_decide_for_api(p_actor uuid,p_org uuid,p_request uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare
  r private.organization_join_requests;
  policy text;
begin
  select membership_policy into policy from private.organizations where id=p_org for no key update;
  if not private.organization_has_permission(p_actor,p_org,'affiliations.review') then raise exception 'access denied' using errcode='42501'; end if;
  select * into r from private.organization_join_requests where id=p_request and organization_id=p_org;
  if r.id is null or r.requester_id=p_actor or (r.affiliation_type='staff' and not private.affiliation_manager(p_actor,p_org)) then raise exception 'access denied' using errcode='42501'; end if;
  if r.status<>'pending' or (p_approve and (policy='invitation_only' or not private.institution_actor(r.requester_id)))
    then raise exception 'decision unavailable' using errcode='55000'; end if;
  update private.organization_join_requests set status=case when p_approve then 'approved' else 'rejected' end,
    reason=nullif(btrim(p_reason),''),reviewer_id=p_actor,decided_at=now() where id=r.id;
  update private.organization_affiliations set status=case when p_approve then 'active' else 'removed' end,
    admission=case when p_approve then 'approved' end,approved_by=case when p_approve then p_actor end,
    joined_at=case when p_approve then now() end,ended_at=case when not p_approve then now() end,updated_at=now()
    where id=r.affiliation_id;
  perform private.affiliation_event(p_org,r.requester_id,p_actor,r.affiliation_id,
    case when p_approve then 'approved' else 'rejected' end,r.affiliation_type);
end;
$$;

create or replace function public.affiliation_member_action_for_api(p_actor uuid,p_org uuid,p_affiliation uuid,p_action text,p_type text)
returns void language plpgsql security definer set search_path='' as $$
declare a private.organization_affiliations;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.organization_has_permission(p_actor,p_org,'affiliations.manage') then raise exception 'access denied' using errcode='42501'; end if;
  select * into a from private.organization_affiliations where id=p_affiliation and organization_id=p_org;
  if a.id is null or not private.affiliation_can_manage_subject(p_actor,p_org,a.user_id,a.affiliation_type)
    or (p_action='change_type' and p_type='staff' and not private.affiliation_manager(p_actor,p_org)) then raise exception 'access denied' using errcode='42501'; end if;
  if p_action='suspend' and a.status='active' then
    update private.organization_affiliations set status='suspended',listed=false,updated_at=now() where id=a.id;
  elsif p_action='reinstate' and a.status='suspended' and private.institution_actor(a.user_id) then
    update private.organization_affiliations set status='active',listed=false,updated_at=now() where id=a.id;
  elsif p_action='remove' and a.status in ('active','suspended') then
    update private.organization_affiliations set status='removed',listed=false,ended_at=now(),updated_at=now() where id=a.id;
  elsif p_action='change_type' and a.status='active' then
    if a.affiliation_type=p_type then return; end if;
    update private.organization_affiliations set affiliation_type=p_type,listed=false,updated_at=now() where id=a.id;
  else raise exception 'transition unavailable' using errcode='55000'; end if;
  perform private.affiliation_event(p_org,a.user_id,p_actor,a.id,case p_action
    when 'suspend' then 'suspended' when 'reinstate' then 'reinstated' when 'remove' then 'removed' else 'type_changed' end,
    case when p_action='change_type' then p_type else a.affiliation_type end);
end;
$$;

create or replace function public.affiliation_invite_for_api(p_actor uuid,p_org uuid,p_username text,p_type text)
returns uuid language plpgsql security definer set search_path='' as $$
declare recipient uuid; invitation uuid;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.affiliation_inviter(p_actor,p_org,p_type) then raise exception 'access denied' using errcode='42501'; end if;
  select user_id into recipient from public.profiles where username=p_username;
  if recipient is null or recipient=p_actor or not private.institution_actor(recipient)
    or exists(select 1 from private.organization_affiliations where organization_id=p_org and user_id=recipient and status in ('pending','active','suspended'))
  then raise exception 'recipient unavailable' using errcode='55000'; end if;
  if (select count(*) from private.organization_affiliation_invitations where organization_id=p_org
    and created_at>now()-interval '1 day')>=25 then raise exception 'invitation limit' using errcode='54000'; end if;
  update private.organization_affiliation_invitations set status='revoked',closed_at=now()
    where organization_id=p_org and recipient_id=recipient and status='pending'
      and (expires_at<=now() or not private.affiliation_inviter(invited_by,p_org,affiliation_type));
  insert into private.organization_affiliation_invitations(organization_id,recipient_id,invited_by,affiliation_type)
    values(p_org,recipient,p_actor,p_type) returning id into invitation;
  perform private.affiliation_event(p_org,recipient,p_actor,null,'invited',p_type);
  return invitation;
end;
$$;

create or replace function public.affiliation_resolve_invite_for_api(p_actor uuid,p_invitation uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  i private.organization_affiliation_invitations;
  org uuid;
  affiliation uuid;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select organization_id into org from private.organization_affiliation_invitations where id=p_invitation;
  perform 1 from private.organizations where id=org for no key update;
  select * into i from private.organization_affiliation_invitations where id=p_invitation;
  if i.id is null or (p_accept and p_actor<>i.recipient_id)
    or (not p_accept and p_actor<>i.recipient_id and not (private.affiliation_manager(p_actor,org)
      or (p_actor=i.invited_by and private.affiliation_inviter(p_actor,org,i.affiliation_type))))
  then raise exception 'access denied' using errcode='42501'; end if;
  if i.status<>'pending' or i.expires_at<=now() then raise exception 'invitation unavailable' using errcode='55000'; end if;
  if p_accept then
    if not private.affiliation_inviter(i.invited_by,org,i.affiliation_type)
      or exists(select 1 from private.organization_affiliations where organization_id=org and user_id=p_actor
        and status in ('pending','active','suspended'))
    then raise exception 'invitation unavailable' using errcode='55000'; end if;
    insert into private.organization_affiliations(organization_id,user_id,affiliation_type,status,admission,approved_by,joined_at)
      values(org,p_actor,i.affiliation_type,'active','invited',i.invited_by,now()) returning id into affiliation;
  end if;
  update private.organization_affiliation_invitations set status=case when p_accept then 'accepted' else 'revoked' end,
    closed_at=now() where id=i.id;
  perform private.affiliation_event(org,i.recipient_id,p_actor,affiliation,
    case when p_accept then 'joined' else 'invitation_revoked' end,i.affiliation_type);
end;
$$;
