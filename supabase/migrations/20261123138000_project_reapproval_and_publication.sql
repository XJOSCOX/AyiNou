-- Keep the canonical row on the last approved revision while amendments are reviewed.
alter table private.community_projects
  add column pending_revision integer,
  add column pending_status text,
  add column pending_submitted_by uuid references auth.users(id) on delete set null,
  add column pending_submitted_at timestamptz,
  add column pending_reviewer_id uuid references auth.users(id) on delete set null,
  add column directory_published_at timestamptz,
  add constraint community_projects_pending_revision_check check (
    (pending_revision is null and pending_status is null and pending_submitted_by is null
      and pending_submitted_at is null and pending_reviewer_id is null)
    or (status='approved' and pending_revision is not null and pending_revision>revision
      and pending_status is not null and pending_status in ('draft','submitted','under_review','changes_requested','rejected'))
  ),
  add constraint community_projects_pending_revision_fkey
    foreign key(id,pending_revision) references private.project_revisions(project_id,revision);

create index community_projects_pending_queue on private.community_projects(pending_submitted_at,id)
  where pending_status in ('submitted','under_review');
create index community_projects_directory on private.community_projects(directory_published_at desc,id desc)
  where directory_published_at is not null and restricted_at is null;

-- Carry forward the owner's pre-existing directory choice for already approved proposals.
update private.community_projects p set directory_published_at=p.approved_at
  from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
  and p.status='approved' and r.proposal->>'publishRequested'='true';

alter table private.project_events drop constraint project_events_action_check,
  add constraint project_events_action_check
    check(action in ('create','edit','submit','assign','release','request_changes','approve','reject','restrict','publish','unpublish'));

create function private.project_working_copy(p private.community_projects)
returns private.community_projects language plpgsql immutable set search_path='' as $$
begin
  if p.pending_revision is not null then
    p.revision:=p.pending_revision;
    p.status:=p.pending_status;
    p.submitted_by:=p.pending_submitted_by;
    p.submitted_at:=p.pending_submitted_at;
    p.reviewer_id:=p.pending_reviewer_id;
    p.approved_at:=null;
    p.directory_published_at:=null;
  end if;
  return p;
end;
$$;

create function private.project_operator(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.member_allowed() and (
    private.project_owner_access(p,p_actor,'view_private') or private.project_owner_access(p,p_actor,'edit')
    or private.project_owner_access(p,p_actor,'submit') or private.project_owner_access(p,p_actor,'propose')
  );
$$;

create function private.project_assigned_review(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='under_review' and p.reviewer_id=p_actor
    and private.project_reviewer(p,p_actor) and feed_data.recent_feed_totp(),false);
$$;

revoke all on function private.project_working_copy(private.community_projects),
  private.project_operator(private.community_projects,uuid),private.project_assigned_review(private.community_projects,uuid)
  from public,anon,authenticated,service_role;

create function private.project_directory_eligible(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.status='approved' and p.restricted_at is null and (auth.uid() is null or feed_data.member_allowed())
    and private.project_proposal_identity_state(p.submitted_by,p.owner_user_id)='verified'
    and private.project_owner_access(p,p.submitted_by,'submit') and feed_data.viewer_can_interact(p.submitted_by)
    and case
      when p.owner_user_id is not null then exists(select 1 from public.profiles m
        where m.user_id=p.owner_user_id and feed_data.followable_member(m))
      when p.organization_id is not null then private.project_organization_verified(p.organization_id)
      else private.project_community_public(p.community_id,p.submitted_at) end
    and private.project_community_public(p.association_id,p.submitted_at);
$$;

revoke all on function private.project_directory_eligible(private.community_projects) from public,anon,authenticated,service_role;

create or replace function private.project_visible(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.directory_published_at is not null and private.project_directory_eligible(p);
$$;

create or replace function private.project_append_revision(p private.community_projects,p_actor uuid,p_proposal jsonb,p_image text)
returns integer language plpgsql set search_path='' as $$
declare next_revision integer:=coalesce(p.pending_revision,p.revision)+1;
begin
  if next_revision>25 then raise exception 'revision limit' using errcode='PFR29'; end if;
  insert into private.project_revisions(project_id,revision,author_id,proposal,image_digest)
    values(p.id,next_revision,p_actor,p_proposal,p_image);
  if p.status='approved' then
    update private.community_projects set version=version+1,pending_revision=next_revision,
      pending_status=case when p.pending_status='changes_requested' then 'changes_requested' else 'draft' end,
      pending_submitted_by=null,pending_submitted_at=null,pending_reviewer_id=null,updated_at=clock_timestamp()
      where id=p.id;
  else
    update private.community_projects set version=version+1,revision=next_revision,updated_at=clock_timestamp() where id=p.id;
  end if;
  insert into private.project_events(project_id,version,revision,actor_id,action)
    values(p.id,p.version+1,next_revision,p_actor,'edit');
  return p.version+1;
end;
$$;

create or replace function public.project_edit_for_client(p_id uuid,p_version integer,p_proposal jsonb,p_remove_image boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; previous private.project_revisions; cover text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_remove_image is null or not private.project_content_valid(p_proposal,false) then
    raise exception 'invalid proposal' using errcode='PJP03'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,actor,'edit') then raise exception 'project unavailable' using errcode='PJP04'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or not (
    item.status in ('draft','changes_requested')
    or (item.status='approved' and coalesce(item.pending_status,'draft') in ('draft','changes_requested','rejected'))
  )
    then raise exception 'project changed' using errcode='PJP09'; end if;
  select * into previous from private.project_revisions where project_id=p_id and revision=coalesce(item.pending_revision,item.revision);
  cover:=case when not p_remove_image then previous.image_digest end;
  if p_proposal=previous.proposal and cover is not distinct from previous.image_digest then return item.version; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  return private.project_append_revision(item,actor,p_proposal,cover);
end;
$$;

create or replace function public.project_image_for_api(p_actor uuid,p_id uuid,p_version integer,p_webp text)
returns integer language plpgsql security definer set search_path='' as $$
declare item private.community_projects; previous private.project_revisions; bytes bytea; fingerprint text;
begin
  if p_actor is null or char_length(coalesce(p_webp,'')) not between 22 and 699052
    then raise exception 'invalid image' using errcode='22023'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,p_actor,'edit') then raise exception 'project unavailable' using errcode='PJP04'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or not (
    item.status in ('draft','changes_requested')
    or (item.status='approved' and coalesce(item.pending_status,'draft') in ('draft','changes_requested','rejected'))
  )
    then raise exception 'project changed' using errcode='PJP09'; end if;
  bytes:=decode(p_webp,'base64');
  if substring(bytes from 1 for 4)<>convert_to('RIFF','UTF8') or substring(bytes from 9 for 4)<>convert_to('WEBP','UTF8')
    or octet_length(bytes)>524288 then raise exception 'invalid image' using errcode='22023'; end if;
  fingerprint:=encode(sha256(bytes),'hex');
  select * into previous from private.project_revisions where project_id=p_id and revision=coalesce(item.pending_revision,item.revision);
  if fingerprint=previous.image_digest then return item.version; end if;
  perform feed_data.consume_limit(p_actor,'project_image',5);
  insert into private.project_images(project_id,digest,image) values(p_id,fingerprint,bytes) on conflict(project_id,digest) do nothing;
  return private.project_append_revision(item,p_actor,previous.proposal,fingerprint);
end;
$$;

create or replace function public.project_submit_for_client(p_id uuid,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; proposal jsonb; review_revision integer;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  -- Take the trust lock before the proposal and its owner scope, as identity can change during submission.
  perform pg_advisory_xact_lock(20261120,300);
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
  perform 1 from public.verification_records where user_id=actor and verification_type='identity' for share;
  if private.project_proposal_identity_state(actor,item.owner_user_id)<>'verified'
    then perform private.project_require_identity(actor); end if;
  if item.restricted_at is not null or item.version is distinct from p_version or coalesce(item.pending_status,item.status) not in ('draft','changes_requested')
    then raise exception 'project changed or already submitted' using errcode='PJP09'; end if;
  review_revision:=coalesce(item.pending_revision,item.revision);
  select r.proposal into proposal from private.project_revisions r where r.project_id=p_id and r.revision=review_revision;
  if not private.project_content_valid(proposal,true) then raise exception 'incomplete proposal' using errcode='PJP03'; end if;
  if not feed_data.community_member(item.association_id,actor) then raise exception 'association unavailable' using errcode='PJP13'; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  if item.pending_revision is not null then
    update private.community_projects set version=version+1,pending_status='submitted',pending_submitted_by=actor,
      pending_submitted_at=clock_timestamp(),pending_reviewer_id=null,updated_at=clock_timestamp() where id=p_id;
  else
    update private.community_projects set version=version+1,status='submitted',submitted_by=actor,
      submitted_at=clock_timestamp(),reviewer_id=null,updated_at=clock_timestamp() where id=p_id;
  end if;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action)
    values(p_id,item.version+1,review_revision,actor,actor,'submit');
  return item.version+1;
end;
$$;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
returns integer language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); item private.community_projects; target uuid; recipient uuid; next_status text;
  founder_owner_action boolean; amendment boolean;
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_action='approve' then perform pg_advisory_xact_lock(20261120,300); end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'review unavailable' using errcode='PJP14'; end if;
  amendment:=item.pending_revision is not null;
  item:=private.project_working_copy(item);
  founder_owner_action:=private.project_founder_owner_review(item,actor)
    and coalesce(p_action='approve' or (p_action='assign' and p_reviewer is not null),false);
  if not founder_owner_action and not coalesce(private.project_reviewer(item,actor),false)
    then raise exception 'review unavailable' using errcode='PJP14'; end if;
  perform private.project_lock_scope(item);
  founder_owner_action:=private.project_founder_owner_review(item,actor)
    and coalesce(p_action='approve' or (p_action='assign' and p_reviewer is not null),false);
  if not founder_owner_action and not coalesce(private.project_reviewer(item,actor),false)
    then raise exception 'review unavailable' using errcode='PJP14'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('submitted','under_review')
    then raise exception 'project changed' using errcode='PJP09'; end if;
  if not private.valid_trust_text(p_reason,10,1000) then raise exception 'written reason required' using errcode='PJP03'; end if;
  if p_action='assign' then
    target:=actor;
    if p_reviewer is not null then
      if not private.platform_admin(actor) then raise exception 'assignment outside authority' using errcode='42501'; end if;
      select user_id into target from public.profiles where username=p_reviewer;
    end if;
    if target is null or not coalesce(private.project_reviewer(item,target),false) or not private.verified_totp(target)
      or (item.status='under_review' and private.project_reviewer(item,item.reviewer_id) and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if item.status='under_review' and target=item.reviewer_id then return item.version; end if;
    next_status:='under_review'; recipient:=target;
  elsif p_action='release' then
    if item.status<>'under_review' or (item.reviewer_id is distinct from actor and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    next_status:='submitted';
  elsif p_action in ('approve','reject','request_changes') then
    if not founder_owner_action and (item.status<>'under_review' or item.reviewer_id is distinct from actor)
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if p_action='approve' and (not private.project_owner_access(item,item.submitted_by,'submit')
      or not feed_data.community_member(item.association_id,item.submitted_by))
      then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    if p_action='approve' then
      -- An independent reviewer sees only a generic accountability failure.
      perform 1 from public.verification_records where user_id=item.submitted_by and verification_type='identity' for share;
      if private.project_proposal_identity_state(item.submitted_by,item.owner_user_id)<>'verified'
        then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    end if;
    next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
    recipient:=item.submitted_by;
  else raise exception 'invalid action' using errcode='22023';
  end if;
  perform feed_data.consume_limit(actor,'project_review',20);
  if amendment and next_status='approved' then
    update private.community_projects set version=version+1,revision=item.revision,
      submitted_by=item.submitted_by,submitted_at=item.submitted_at,approved_at=clock_timestamp(),reviewer_id=null,
      pending_revision=null,pending_status=null,pending_submitted_by=null,pending_submitted_at=null,pending_reviewer_id=null,
      directory_published_at=null,updated_at=clock_timestamp() where id=p_id;
  elsif amendment then
    update private.community_projects set version=version+1,pending_status=next_status,pending_reviewer_id=target,
      updated_at=clock_timestamp() where id=p_id;
  else
    update private.community_projects set version=version+1,status=next_status,
      reviewer_id=target,approved_at=case when next_status='approved' then clock_timestamp() end,
      updated_at=clock_timestamp() where id=p_id;
  end if;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action,reason,founder_owner_action)
    values(p_id,item.version+1,item.revision,actor,recipient,p_action,btrim(p_reason),founder_owner_action);
  return item.version+1;
end;
$$;

create or replace function public.project_queue_for_client(p_reports boolean)
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
  return coalesce((with submissions as (
    select private.project_working_copy(b) as item from private.community_projects b
      where b.restricted_at is null and (b.pending_status in ('submitted','under_review')
        or (b.pending_status is null and b.status in ('submitted','under_review')))
  ), candidates as (
    select (item).id,(item).owner_user_id,(item).submitted_at,item from submissions
  ) select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,
    'title',r.proposal->>'title','category',r.category,'assignedToMe',coalesce(p.reviewer_id=actor,false),
    'assigned',p.reviewer_id is not null,
    'canClaim',not q.founder_owned and not coalesce(private.project_reviewer(a.item,p.reviewer_id),false),
    'founderOwned',q.founder_owned)
    order by p.submitted_at,p.id) from (
      (select a.id,false as founder_owned from candidates a
        where private.project_reviewer(a.item,actor)
        order by a.submitted_at,a.id limit 40)
      union all
      (select a.id,true as founder_owned from candidates a
        where a.owner_user_id=actor and private.project_founder_owner_review(a.item,actor)
        order by a.submitted_at,a.id limit 10)
    ) q
    join candidates a using(id) cross join lateral (select (a.item).*) p
    join private.project_revisions r on r.project_id=p.id and r.revision=p.revision),'[]');
end;
$$;

create or replace function private.project_card(p private.community_projects)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'status',p.status,'title',r.proposal->>'title','category',r.category,
    'department',r.department,'country',r.proposal->>'country','publishedAt',case when private.project_visible(p) then p.directory_published_at end,
    'hasImage',r.image_digest is not null,
    'owner',case
      when p.owner_user_id is not null then coalesce((select jsonb_build_object('kind','individual','name',m.display_name,'handle',m.username)
        from public.profiles m where m.user_id=p.owner_user_id),jsonb_build_object('kind','individual','name',null,'handle',null))
      when p.organization_id is not null then (select jsonb_build_object('kind','organization','name',o.name,'handle',o.handle)
        from private.organizations o where o.id=p.organization_id)
      else (select jsonb_build_object('kind','community','name',coalesce(c.name,d.name),'handle',c.slug)
        from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.community_id) end,
    'association',(select jsonb_build_object('name',coalesce(c.name,d.name),'handle',c.slug)
      from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.association_id))
  from private.project_revisions r where r.project_id=p.id and r.revision=p.revision;
$$;

create or replace function public.projects_list_for_client(p_category text,p_country text,p_department text,p_before timestamptz,p_before_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(private.project_card(p) order by p.directory_published_at desc,p.id desc),'[]')
  from (select p.id from private.community_projects p join private.project_revisions r on r.project_id=p.id and r.revision=p.revision
    where p.status='approved' and p.restricted_at is null and private.project_visible(p)
      and (p_category is null or p_category=r.category)
      and (p_country is null or p_country=r.proposal->>'country') and (p_department is null or p_department=r.department)
      and (p_before is null or (p.directory_published_at,p.id)<(p_before,p_before_id))
    order by p.directory_published_at desc,p.id desc limit 16) eligible
  join private.community_projects p using(id);
$$;

create or replace function public.my_projects_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.project_card(private.project_working_copy(p))||jsonb_build_object('createdByMe',p.creator_id=actor,
    'restricted',p.restricted_at is not null) order by p.updated_at desc,p.id desc)
    from (select x.id from private.community_projects x where
      private.project_owner_access(x,actor,'view_private') or private.project_owner_access(x,actor,'edit')
      or private.project_owner_access(x,actor,'submit') or private.project_owner_access(x,actor,'propose')
      order by x.updated_at desc,x.id desc limit 50) eligible join private.community_projects p using(id)),'[]');
end;
$$;

create or replace function public.project_detail_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  base private.community_projects; p private.community_projects; actor uuid:=auth.uid();
  operator boolean; assigned boolean; identity_state text; directory_authority boolean;
begin
  select * into base from private.community_projects where id=p_id;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  p:=private.project_working_copy(base);
  operator:=private.project_operator(base,actor);
  assigned:=feed_data.member_allowed() and private.project_assigned_review(p,actor);
  if not coalesce(operator or assigned or private.project_visible(base),false)
    then raise exception 'project unavailable' using errcode='PJP04'; end if;
  if not (operator or assigned) then p:=base; end if;
  directory_authority:=operator and base.status='approved' and private.project_owner_access(base,actor,'submit');
  if operator and p.restricted_at is null and p.status in ('draft','changes_requested')
    and private.project_owner_access(p,actor,'submit') then
    identity_state:=private.project_proposal_identity_state(actor,p.owner_user_id);
  end if;
  return private.project_card(p)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=p.id and r.revision=p.revision),
    'version',case when operator or assigned then p.version end,
    'publishedAt',case when private.project_visible(base) then base.directory_published_at end,
    'revisionPending',coalesce((operator or assigned) and base.pending_revision is not null,false),
    'canPublish',coalesce(directory_authority and base.pending_revision is null and base.directory_published_at is null
      and private.project_directory_eligible(base),false),
    'canUnpublish',coalesce(directory_authority and base.directory_published_at is not null,false),
    'restricted',p.restricted_at is not null, 'canEdit',operator and p.restricted_at is null
      and (p.status in ('draft','changes_requested','approved') or (base.pending_revision is not null and p.status='rejected'))
      and private.project_owner_access(p,actor,'edit'),
    'canSubmit',coalesce(identity_state='verified',false),
    'submissionIdentity',identity_state,
    'publicationEligibility',case when operator and base.status='approved' and base.restricted_at is null then
      case when private.project_visible(base) then 'published'
        when private.project_directory_eligible(base) then 'private'
        when base.organization_id is not null and exists(select 1 from private.organizations o
          where o.id=base.organization_id and o.status='active' and o.verification_status='unverified')
          then 'pending_institution_verification'
        else 'unavailable' end
      end,
    'canOpenWork',feed_data.member_allowed() and private.project_executable(base)
      and private.project_execution_actor(base,actor) and (
        private.project_execution_role(base,actor) is not null or (private.project_visible(base) and exists(
          select 1 from private.project_execution where project_id=p.id and status='active'))),
    'canDecide',coalesce(assigned,false),
    'canReport',private.project_visible(base) and feed_data.member_allowed()
      and base.creator_id is distinct from actor and base.submitted_by is distinct from actor,
    'history',case when operator or assigned then coalesce((select jsonb_agg(jsonb_build_object(
      'action',e.action,'revision',e.revision,'reason',e.reason,'createdAt',e.created_at) order by e.version desc)
      from private.project_events e where e.project_id=p.id and e.action in ('submit','request_changes','approve','reject','restrict','publish','unpublish')),'[]') else '[]'::jsonb end
  );
end;
$$;

create or replace function public.project_media_for_client(p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare base private.community_projects; p private.community_projects; actor uuid:=auth.uid();
begin
  select * into base from private.community_projects where id=p_id;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  p:=private.project_working_copy(base);
  if not coalesce(private.project_operator(base,actor)
    or (feed_data.member_allowed() and private.project_assigned_review(p,actor)),false) then
    if not coalesce(private.project_visible(base),false) then raise exception 'project unavailable' using errcode='PJP04'; end if;
    p:=base;
  end if;
  return (select encode(i.image,'base64') from private.project_revisions r
    join private.project_images i on i.project_id=r.project_id and i.digest=r.image_digest
    where r.project_id=p.id and r.revision=p.revision);
end;
$$;

create function public.project_set_publication_for_client(p_id uuid,p_version integer,p_publish boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_publish is null then raise exception 'invalid publication choice' using errcode='PJP03'; end if;
  if p_publish then perform pg_advisory_xact_lock(20261120,300); end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not coalesce(private.project_owner_access(item,actor,'submit'),false)
    then raise exception 'project unavailable' using errcode='PJP04'; end if;
  if item.status<>'approved' or item.version is distinct from p_version
    then raise exception 'project changed' using errcode='PJP09'; end if;
  if p_publish and (item.pending_revision is not null or not coalesce(private.project_directory_eligible(item),false))
    then raise exception 'publication unavailable' using errcode='PJP25'; end if;
  if (item.directory_published_at is not null)=p_publish then return item.version; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  update private.community_projects set version=version+1,
    directory_published_at=case when p_publish then clock_timestamp() end,updated_at=clock_timestamp()
    where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,action)
    values(p_id,item.version+1,item.revision,actor,case when p_publish then 'publish' else 'unpublish' end);
  return item.version+1;
end;
$$;

revoke all on function public.project_set_publication_for_client(uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.project_set_publication_for_client(uuid,integer,boolean) to authenticated;
