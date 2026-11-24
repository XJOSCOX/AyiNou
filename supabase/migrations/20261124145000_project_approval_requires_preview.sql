-- Limit approval proofs to the actor, authenticated session, project and exact submitted version.
create table private.project_preview_signing_key (
  singleton boolean primary key default true check(singleton),
  secret bytea not null
);
alter table private.project_preview_signing_key enable row level security;
revoke all on private.project_preview_signing_key from public,anon,authenticated,service_role;
insert into private.project_preview_signing_key(secret) values (extensions.gen_random_bytes(32));

create function private.project_preview_proof(p private.community_projects)
returns text language sql stable set search_path='' as $$
  select encode(extensions.hmac(
    convert_to(concat_ws(':',p.id,p.version,p.revision,auth.uid(),auth.jwt()->>'session_id'),'UTF8'),
    k.secret,'sha256'),'hex')
  from private.project_preview_signing_key k
  where k.singleton and auth.uid() is not null and auth.jwt()->>'session_id' is not null;
$$;
revoke all on function private.project_preview_proof(private.community_projects) from public,anon,authenticated,service_role;

create or replace function public.project_review_preview_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item private.community_projects:=private.project_review_preview(p_id);
  founder_owned boolean:=private.project_founder_owner_review(item,auth.uid());
begin
  return private.project_card(item)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=item.id and r.revision=item.revision),
    'version',null,'publishedAt',null,'restricted',false,'canEdit',false,'canSubmit',false,
    'canDecide',false,'canReport',false,'submissionIdentity',null,'publicationEligibility',null,'history','[]'::jsonb,
    'approval',case when founder_owned or private.project_assigned_review(item,auth.uid())
      then jsonb_build_object('version',item.version,'proof',private.project_preview_proof(item),'founderOwned',founder_owned) end);
end;
$$;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text,p_preview_proof text)
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
      if p_preview_proof is null or p_preview_proof is distinct from private.project_preview_proof(item)
        then raise exception 'open the current project preview before approving' using errcode='PJP26'; end if;
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

revoke all on function public.project_review_for_client(uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.project_review_for_client(uuid,integer,text,text,text,text) to authenticated;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
returns integer language sql security invoker set search_path='' as $$
  select public.project_review_for_client(p_id,p_version,p_action,p_reason,p_reviewer,null::text);
$$;
