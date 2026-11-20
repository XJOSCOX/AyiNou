-- Reuse trust outcomes, keeping personal identity distinct from public-figure claims.
create function private.project_identity_state(p_actor uuid)
returns text language sql stable set search_path='' as $$
  select case
    when 'identity'=any(private.reviewed_personal_claims(p_actor)) then 'verified'
    when exists(select 1 from private.verification_applications
      where applicant_id=p_actor and kind='identity' and status='pending') then 'pending'
    when exists(select 1 from public.verification_records where user_id=p_actor and verification_type='identity'
      and source='review' and (status='revoked' or publication_held_at is not null)) then 'revoked'
    else 'required'
  end;
$$;

create function private.project_require_identity(p_actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  -- Serialize with decisions updating the active identity record.
  perform 1 from public.verification_records
    where user_id=p_actor and verification_type='identity' for share;
  case private.project_identity_state(p_actor)
    when 'verified' then return;
    when 'pending' then raise exception 'identity verification pending' using errcode='PJP21';
    when 'revoked' then raise exception 'identity verification unavailable' using errcode='PJP22';
    else raise exception 'identity verification required' using errcode='PJP20';
  end case;
end;
$$;

create function private.project_organization_verified(p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.organizations o where o.id=p_org
    and o.status='active' and o.verification_status='verified'
    and exists(select 1 from private.verification_applications a
      where a.organization_id=o.id and a.kind in ('organization','government') and a.status='approved')
    and exists(select 1 from private.organization_memberships m
      where m.organization_id=o.id and m.role='owner' and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>now()) and feed_data.author_active(m.user_id)));
$$;

revoke all on function private.project_identity_state(uuid),private.project_require_identity(uuid),
  private.project_organization_verified(uuid) from public,anon,authenticated,service_role;

create or replace function private.project_visible(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.status='approved' and p.restricted_at is null and (auth.uid() is null or feed_data.member_allowed())
    and private.project_identity_state(p.submitted_by)='verified'
    and private.project_owner_access(p,p.submitted_by,'submit') and feed_data.viewer_can_interact(p.submitted_by)
    and exists(select 1 from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
      and r.proposal->>'publishRequested'='true')
    and case
      when p.owner_user_id is not null then exists(select 1 from public.profiles m
        where m.user_id=p.owner_user_id and feed_data.followable_member(m))
      when p.organization_id is not null then private.project_organization_verified(p.organization_id)
      else private.project_community_public(p.community_id,p.submitted_at) end
    and private.project_community_public(p.association_id,p.submitted_at);
$$;

create or replace function public.project_submit_for_client(p_id uuid,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; proposal jsonb;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,actor,'submit') then
    -- Only disclose a former owner-scope failure to a known participant or someone with current read access.
    if actor is not distinct from item.creator_id or actor is not distinct from item.submitted_by
      or private.project_owner_access(item,actor,'view_private') or private.project_owner_access(item,actor,'edit')
      or private.project_owner_access(item,actor,'propose') then
      if item.organization_id is not null then raise exception 'institutional authority unavailable' using errcode='PJP23';
      elsif item.community_id is not null or item.association_id is not null
        then raise exception 'community authority unavailable' using errcode='PJP24';
      else raise exception 'project owner unavailable' using errcode='PJP13'; end if;
    end if;
    raise exception 'project unavailable' using errcode='PJP04';
  end if;
  perform private.project_require_identity(actor);
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('draft','changes_requested')
    then raise exception 'project changed or already submitted' using errcode='PJP09'; end if;
  select r.proposal into proposal from private.project_revisions r where r.project_id=p_id and r.revision=item.revision;
  if not private.project_content_valid(proposal,true) then raise exception 'incomplete proposal' using errcode='PJP03'; end if;
  if not feed_data.community_member(item.association_id,actor) then raise exception 'association unavailable' using errcode='PJP13'; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  update private.community_projects set version=version+1,status='submitted',submitted_by=actor,
    submitted_at=clock_timestamp(),reviewer_id=null,updated_at=clock_timestamp() where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action)
    values(p_id,item.version+1,item.revision,actor,actor,'submit');
  return item.version+1;
end;
$$;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; target uuid; recipient uuid; next_status text;
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found or not private.project_reviewer(item,actor) then raise exception 'review unavailable' using errcode='PJP14'; end if;
  perform private.project_lock_scope(item);
  if not private.project_reviewer(item,actor) then raise exception 'review unavailable' using errcode='PJP14'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('submitted','under_review')
    then raise exception 'project changed' using errcode='PJP09'; end if;
  if not private.valid_trust_text(p_reason,10,1000) then raise exception 'written reason required' using errcode='PJP03'; end if;
  if p_action='assign' then
    target:=actor;
    if p_reviewer is not null then
      if not private.platform_admin(actor) then raise exception 'assignment outside authority' using errcode='42501'; end if;
      select user_id into target from public.profiles where username=p_reviewer;
    end if;
    if target is null or not private.project_reviewer(item,target) or not private.verified_totp(target)
      or (item.status='under_review' and private.project_reviewer(item,item.reviewer_id) and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if item.status='under_review' and target=item.reviewer_id then return item.version; end if;
    next_status:='under_review'; recipient:=target;
  elsif p_action='release' then
    if item.status<>'under_review' or (item.reviewer_id is distinct from actor and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    next_status:='submitted';
  elsif p_action in ('approve','reject','request_changes') then
    if item.status<>'under_review' or item.reviewer_id is distinct from actor
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if p_action='approve' and (not private.project_owner_access(item,item.submitted_by,'submit')
      or not feed_data.community_member(item.association_id,item.submitted_by))
      then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    if p_action='approve' then
      -- An independent reviewer sees only a generic accountability failure.
      perform 1 from public.verification_records where user_id=item.submitted_by and verification_type='identity' for share;
      if private.project_identity_state(item.submitted_by)<>'verified'
        then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    end if;
    next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
    recipient:=item.submitted_by;
  else raise exception 'invalid action' using errcode='22023';
  end if;
  perform feed_data.consume_limit(actor,'project_review',20);
  update private.community_projects set version=version+1,status=next_status,
    reviewer_id=target,approved_at=case when next_status='approved' then clock_timestamp() end,
    updated_at=clock_timestamp() where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action,reason)
    values(p_id,item.version+1,item.revision,actor,recipient,p_action,btrim(p_reason));
  return item.version+1;
end;
$$;

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
    'canDecide',coalesce(assigned,false),
    'canReport',private.project_visible(p) and feed_data.member_allowed() and p.creator_id is distinct from actor and p.submitted_by is distinct from actor,
    'history',case when operator or assigned then coalesce((select jsonb_agg(jsonb_build_object(
      'action',e.action,'revision',e.revision,'reason',e.reason,'createdAt',e.created_at) order by e.version desc)
      from private.project_events e where e.project_id=p.id and e.action in ('submit','request_changes','approve','reject','restrict')),'[]') else '[]'::jsonb end
  );
end;
$$;

create or replace function public.project_options_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'submissionIdentity',private.project_identity_state(actor),
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
