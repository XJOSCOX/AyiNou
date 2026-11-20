create function private.project_lock_scope(p private.community_projects)
returns void language plpgsql set search_path='' as $$
begin
  if p.organization_id is not null then
    perform 1 from private.organizations where id=p.organization_id for share;
  end if;
  perform 1 from feed_data.communities where id in (p.community_id,p.association_id) order by id for share;
end;
$$;

create function private.project_has_read_access(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select private.project_visible(p) or (feed_data.member_allowed() and (
    private.project_owner_access(p,auth.uid(),'view_private') or private.project_owner_access(p,auth.uid(),'edit')
    or private.project_owner_access(p,auth.uid(),'submit') or private.project_owner_access(p,auth.uid(),'propose')
    or (p.status='under_review' and p.reviewer_id=auth.uid() and private.project_reviewer(p,auth.uid()) and feed_data.recent_feed_totp())));
$$;

create function public.project_create_for_client(p_key uuid,p_kind text,p_owner uuid,p_association uuid,p_proposal jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; request_hash bytea;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_key is null or p_kind is null or p_kind not in ('individual','organization','community')
    or ((p_kind='individual')<>(p_owner is null)) or not private.project_content_valid(p_proposal,false)
  then raise exception 'invalid proposal' using errcode='PJP03'; end if;
  item.owner_user_id:=case when p_kind='individual' then actor end;
  item.organization_id:=case when p_kind='organization' then p_owner end;
  item.community_id:=case when p_kind='community' then p_owner end;
  item.association_id:=p_association;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,actor,'propose') or
    (p_association is not null and not feed_data.community_member(p_association,actor))
  then raise exception 'owner scope unavailable' using errcode='PJP13'; end if;
  perform pg_advisory_xact_lock(hashtextextended('project-create:'||actor::text,0));
  request_hash:=sha256(convert_to(jsonb_build_array(p_kind,p_owner,p_association,p_proposal)::text,'UTF8'));
  select * into item from private.community_projects where creator_id=actor and submission_key=p_key;
  if found then
    if item.request_digest is distinct from request_hash then raise exception 'request changed' using errcode='PJP09'; end if;
    return item.id;
  end if;
  perform feed_data.consume_limit(actor,'project_create',5);
  if (select count(*) from private.community_projects where creator_id=actor and created_at>now()-interval '1 day')>=10
    then raise exception 'proposal limit' using errcode='PFR29'; end if;
  insert into private.community_projects(creator_id,owner_user_id,organization_id,community_id,association_id,submission_key,request_digest)
    values(actor,case when p_kind='individual' then actor end,case when p_kind='organization' then p_owner end,
      case when p_kind='community' then p_owner end,p_association,p_key,request_hash) returning * into item;
  insert into private.project_revisions(project_id,revision,author_id,proposal) values(item.id,1,actor,p_proposal);
  insert into private.project_events(project_id,version,revision,actor_id,action) values(item.id,1,1,actor,'create');
  return item.id;
end;
$$;

create function private.project_append_revision(p private.community_projects,p_actor uuid,p_proposal jsonb,p_image text)
returns integer language plpgsql set search_path='' as $$
begin
  if p.revision>=25 then raise exception 'revision limit' using errcode='PFR29'; end if;
  insert into private.project_revisions(project_id,revision,author_id,proposal,image_digest)
    values(p.id,p.revision+1,p_actor,p_proposal,p_image);
  update private.community_projects set version=version+1,revision=revision+1,updated_at=clock_timestamp() where id=p.id;
  insert into private.project_events(project_id,version,revision,actor_id,action)
    values(p.id,p.version+1,p.revision+1,p_actor,'edit');
  return p.version+1;
end;
$$;

create function public.project_edit_for_client(p_id uuid,p_version integer,p_proposal jsonb,p_remove_image boolean)
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
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('draft','changes_requested')
    then raise exception 'project changed' using errcode='PJP09'; end if;
  select * into previous from private.project_revisions where project_id=p_id and revision=item.revision;
  cover:=case when not p_remove_image then previous.image_digest end;
  if p_proposal=previous.proposal and cover is not distinct from previous.image_digest then return item.version; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  return private.project_append_revision(item,actor,p_proposal,cover);
end;
$$;

create function public.project_image_for_api(p_actor uuid,p_id uuid,p_version integer,p_webp text)
returns integer language plpgsql security definer set search_path='' as $$
declare item private.community_projects; previous private.project_revisions; bytes bytea; fingerprint text;
begin
  if p_actor is null or char_length(coalesce(p_webp,'')) not between 22 and 699052
    then raise exception 'invalid image' using errcode='22023'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,p_actor,'edit') then raise exception 'project unavailable' using errcode='PJP04'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('draft','changes_requested')
    then raise exception 'project changed' using errcode='PJP09'; end if;
  bytes:=decode(p_webp,'base64');
  if substring(bytes from 1 for 4)<>convert_to('RIFF','UTF8') or substring(bytes from 9 for 4)<>convert_to('WEBP','UTF8')
    or octet_length(bytes)>524288 then raise exception 'invalid image' using errcode='22023'; end if;
  fingerprint:=encode(sha256(bytes),'hex');
  select * into previous from private.project_revisions where project_id=p_id and revision=item.revision;
  if fingerprint=previous.image_digest then return item.version; end if;
  perform feed_data.consume_limit(p_actor,'project_image',5);
  insert into private.project_images(project_id,digest,image) values(p_id,fingerprint,bytes) on conflict(project_id,digest) do nothing;
  return private.project_append_revision(item,p_actor,previous.proposal,fingerprint);
end;
$$;

create function public.project_submit_for_client(p_id uuid,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; proposal jsonb;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,actor,'submit') then raise exception 'project unavailable' using errcode='PJP04'; end if;
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

create function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
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

create function public.project_report_for_client(p_id uuid,p_category text,p_explanation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_category is null or p_category not in ('misleading','privacy','unsafe','fundraising')
    or not private.valid_trust_text(p_explanation,10,500) then raise exception 'invalid report' using errcode='22023'; end if;
  if not exists(select 1 from private.community_projects p where p.id=p_id and private.project_visible(p)
      and p.creator_id is distinct from actor and p.submitted_by is distinct from actor)
    then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform feed_data.consume_limit(actor,'project_report',5);
  insert into private.project_reports(project_id,reporter_id,category,explanation)
    values(p_id,actor,p_category,btrim(p_explanation)) returning id into result;
  return result;
end;
$$;

create function public.project_report_decide_for_client(p_id uuid,p_report uuid,p_version integer,p_restrict boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects;
begin
  if not feed_data.moderation_role() then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_restrict is null or not private.valid_trust_text(p_reason,10,1000) then raise exception 'invalid action' using errcode='22023'; end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if private.project_conflicted(item,actor) then raise exception 'review unavailable' using errcode='PJP14'; end if;
  if item.version is distinct from p_version then raise exception 'project changed' using errcode='PJP09'; end if;
  perform feed_data.consume_limit(actor,'project_review',20);
  update private.project_reports set outcome=case when p_restrict then 'restricted' else 'dismissed' end,
    decided_at=clock_timestamp(),reviewer_id=actor,reason=btrim(p_reason)
    where id=p_report and project_id=p_id and outcome='pending' and reporter_id is distinct from actor;
  if not found then raise exception 'report unavailable' using errcode='PJP04'; end if;
  if p_restrict and item.restricted_at is null then
    update private.community_projects set restricted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=p_id;
    insert into private.project_events(project_id,version,revision,actor_id,action,reason)
      values(p_id,item.version+1,item.revision,actor,'restrict',btrim(p_reason));
  end if;
end;
$$;

revoke all on function private.project_lock_scope(private.community_projects),private.project_has_read_access(private.community_projects),
  private.project_append_revision(private.community_projects,uuid,jsonb,text),
  public.project_create_for_client(uuid,text,uuid,uuid,jsonb),public.project_edit_for_client(uuid,integer,jsonb,boolean),
  public.project_image_for_api(uuid,uuid,integer,text),public.project_submit_for_client(uuid,integer),
  public.project_review_for_client(uuid,integer,text,text,text),public.project_report_for_client(uuid,text,text),
  public.project_report_decide_for_client(uuid,uuid,integer,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.project_create_for_client(uuid,text,uuid,uuid,jsonb),public.project_edit_for_client(uuid,integer,jsonb,boolean),
  public.project_submit_for_client(uuid,integer),public.project_review_for_client(uuid,integer,text,text,text),
  public.project_report_for_client(uuid,text,text),public.project_report_decide_for_client(uuid,uuid,integer,boolean,text) to authenticated;
grant execute on function public.project_image_for_api(uuid,uuid,integer,text) to service_role;
