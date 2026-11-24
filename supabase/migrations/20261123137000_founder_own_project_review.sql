-- A trusted Founder can directly approve their own individual submission or route it to an independent reviewer.
-- Keep the conflict predicate for every other review and moderation surface.
create function private.project_founder_owner_review(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.owner_user_id=p_actor and p.creator_id=p_actor and p.submitted_by=p_actor
    and private.platform_founder(p_actor) and private.platform_admin(p_actor) and feed_data.author_active(p_actor),false);
$$;
revoke all on function private.project_founder_owner_review(private.community_projects,uuid)
  from public,anon,authenticated,service_role;

alter table private.project_events add column founder_owner_action boolean not null default false
  check (not founder_owner_action or action in ('assign','approve'));

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
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,
    'title',r.proposal->>'title','category',r.category,'assignedToMe',coalesce(p.reviewer_id=actor,false),
    'assigned',p.reviewer_id is not null,
    'canClaim',not q.founder_owned and not coalesce(private.project_reviewer(p,p.reviewer_id),false),
    'founderOwned',q.founder_owned)
    order by p.submitted_at,p.id) from (
      (select a.id,false as founder_owned from private.community_projects a
        where a.status in ('submitted','under_review') and a.restricted_at is null and private.project_reviewer(a,actor)
        order by a.submitted_at,a.id limit 40)
      union all
      (select a.id,true as founder_owned from private.community_projects a
        where a.owner_user_id=actor and a.status in ('submitted','under_review') and a.restricted_at is null
          and private.project_founder_owner_review(a,actor)
        order by a.submitted_at,a.id limit 10)
    ) q
    join private.community_projects p using(id) join private.project_revisions r on r.project_id=p.id and r.revision=p.revision),'[]');
end;
$$;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
returns integer language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); item private.community_projects; target uuid; recipient uuid; next_status text;
  founder_owner_action boolean;
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_action='approve' then perform pg_advisory_xact_lock(20261120,300); end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'review unavailable' using errcode='PJP14'; end if;
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
  update private.community_projects set version=version+1,status=next_status,
    reviewer_id=target,approved_at=case when next_status='approved' then clock_timestamp() end,
    updated_at=clock_timestamp() where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action,reason,founder_owner_action)
    values(p_id,item.version+1,item.revision,actor,recipient,p_action,btrim(p_reason),founder_owner_action);
  return item.version+1;
end;
$$;
