create or replace function feed_data.moderate_scoped_post(p_room uuid,p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p feed_data.posts;
begin
  if not coalesce(feed_data.community_review_allowed(p_room),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('hide','restore','remove','dismiss') or p_reason is null
  then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into p from feed_data.posts where id=p_id and community_id is not distinct from p_room and status<>'draft' for update;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if p.author_id=auth.uid() then raise exception 'own post' using errcode='42501'; end if;
  if p.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_action='dismiss' then
    if not exists(select 1 from feed_data.content_reports where post_id=p_id and status='pending')
    then raise exception 'no pending report' using errcode='PFR09'; end if;
  else
    if p.deleted_at is not null or (p_action='hide' and p.status<>'published') or (p_action='restore' and p.status<>'hidden')
      or (p_action='remove' and p.status not in ('published','hidden'))
    then raise exception 'action unavailable' using errcode='PFR09'; end if;
  end if;
  update feed_data.posts set status=case p_action when 'hide' then 'hidden' when 'restore' then 'published'
    when 'remove' then 'removed' else status end,updated_at=clock_timestamp(),version=version+1 where id=p_id;
  update feed_data.content_reports set status='closed',closed_at=clock_timestamp() where post_id=p_id and status='pending';
  insert into feed_data.post_moderation_actions(post_id,actor_id,action,reason)
  values(p_id,auth.uid(),p_action,btrim(p_reason));
end;
$$;

create or replace function feed_data.moderate_scoped_comment(p_room uuid,p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c feed_data.comments;
begin
  if not coalesce(feed_data.community_review_allowed(p_room),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('hide','restore','remove','dismiss') or p_reason is null
  then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into c from feed_data.comments x where x.id=p_id and exists(select 1 from feed_data.posts p
    where p.id=x.post_id and p.community_id is not distinct from p_room) for update;
  if not found then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  if c.author_id=auth.uid() then raise exception 'own comment' using errcode='42501'; end if;
  if c.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_action='dismiss' then
    if not exists(select 1 from feed_data.comment_reports where comment_id=p_id and status='pending')
    then raise exception 'no pending report' using errcode='PFR09'; end if;
  elsif c.deleted_at is not null or (p_action='hide' and c.status<>'published') or (p_action='restore' and c.status<>'hidden')
    or (p_action='remove' and c.status not in ('published','hidden'))
  then raise exception 'action unavailable' using errcode='PFR09'; end if;

  update feed_data.comments set status=case p_action when 'hide' then 'hidden' when 'restore' then 'published'
    when 'remove' then 'removed' else status end,updated_at=clock_timestamp(),version=version+1 where id=p_id;
  update feed_data.comment_reports set status='closed',closed_at=clock_timestamp() where comment_id=p_id and status='pending';
  insert into feed_data.comment_moderation_actions(comment_id,actor_id,action,reason)
    values(p_id,auth.uid(),p_action,btrim(p_reason));
end;
$$;

create or replace function feed_data.list_scoped_post_reports(p_room uuid,p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(feed_data.community_review_allowed(p_room),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('reports','hidden') or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'postId',p.id,'body',p.body,'language',p.language,'status',p.status,'deleted',p.deleted_at is not null,
    'own',p.author_id=auth.uid(),'version',p.version,'category',q.category,'note',q.note,'createdAt',q.date,
    'lastAction',(select jsonb_build_object('action',a.action,'reason',a.reason,'createdAt',a.created_at)
      from feed_data.post_moderation_actions a where a.post_id=p.id order by a.created_at desc,a.id desc limit 1)
  ) order by q.date desc,q.id desc) from (
      select r.id,r.post_id,r.category,r.note,r.created_at as date from feed_data.content_reports r
        where p_scope='reports' and r.status='pending' and exists(select 1 from feed_data.posts p
          where p.id=r.post_id and p.community_id is not distinct from p_room) and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
      union all
      select x.id,x.id,null,null,x.updated_at from feed_data.posts x where p_scope='hidden' and x.community_id is not distinct from p_room and x.status='hidden' and x.deleted_at is null
        and (p_before_at is null or (x.updated_at,x.id)<(p_before_at,p_before_id))
      order by date desc,id desc limit 26
    ) q join feed_data.posts p on p.id=q.post_id),'[]'::jsonb);
end;
$$;

create or replace function feed_data.list_scoped_comment_reports(p_room uuid,p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(feed_data.community_review_allowed(p_room),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('reports','hidden') or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'postId',c.post_id,'commentId',c.id,'body',c.body,'language',c.language,'status',c.status,
    'deleted',c.deleted_at is not null,'own',c.author_id=auth.uid(),'version',c.version,
    'category',q.category,'note',q.note,'createdAt',q.date,
    'lastAction',(select jsonb_build_object('action',a.action,'reason',a.reason,'createdAt',a.created_at)
      from feed_data.comment_moderation_actions a where a.comment_id=c.id order by a.created_at desc,a.id desc limit 1)
  ) order by q.date desc,q.id desc) from (
    select r.id,r.comment_id,r.category,r.note,r.created_at as date from feed_data.comment_reports r
      where p_scope='reports' and r.status='pending' and exists(
        select 1 from feed_data.comments c join feed_data.posts p on p.id=c.post_id
        where c.id=r.comment_id and p.community_id is not distinct from p_room) and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
    union all
    select x.id,x.id,null,null,x.updated_at from feed_data.comments x where p_scope='hidden' and x.status='hidden' and exists(
        select 1 from feed_data.posts p where p.id=x.post_id and p.community_id is not distinct from p_room)
      and x.deleted_at is null and (p_before_at is null or (x.updated_at,x.id)<(p_before_at,p_before_id))
    order by date desc,id desc limit 26
  ) q join feed_data.comments c on c.id=q.comment_id),'[]'::jsonb);
end;
$$;

create or replace function feed_data.can_read_post_media(p feed_data.posts,p_review boolean)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.deleted_at is null and case when p_review then p.status in ('published','hidden') and feed_data.community_review_allowed(p.community_id)
    else feed_data.discussion_visible(p) or (p.status='draft' and auth.uid()=p.author_id and feed_data.member_allowed()) end,false);
$$;

create or replace function public.moderate_post_for_client(p_id uuid,p_version integer,p_action text,p_reason text)
returns void language sql security definer set search_path='' as $$
  select feed_data.moderate_scoped_post(null,p_id,p_version,p_action,p_reason);
$$;
create or replace function public.moderate_comment_for_client(p_id uuid,p_version integer,p_action text,p_reason text)
returns void language sql security definer set search_path='' as $$
  select feed_data.moderate_scoped_comment(null,p_id,p_version,p_action,p_reason);
$$;
create or replace function public.list_feed_reports_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select feed_data.list_scoped_post_reports(null,p_scope,p_before_at,p_before_id);
$$;
create or replace function public.list_comment_reports_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select feed_data.list_scoped_comment_reports(null,p_scope,p_before_at,p_before_id);
$$;

create function public.can_review_department_for_client(p_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from feed_data.communities c where c.id=feed_data.community_reference(p_key)
    and feed_data.community_review_role(c.id));
$$;
create function public.can_review_post_for_client(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from feed_data.posts p where p.id=p_id and feed_data.community_review_role(p.community_id));
$$;
create function public.department_reports_for_client(p_key text,p_target text,p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null or not coalesce(feed_data.community_review_allowed(room),false)
  then raise exception 'moderator required' using errcode='42501'; end if;
  if p_target='posts' then return feed_data.list_scoped_post_reports(room,p_scope,p_before_at,p_before_id); end if;
  if p_target='comments' then return feed_data.list_scoped_comment_reports(room,p_scope,p_before_at,p_before_id); end if;
  raise exception 'invalid target' using errcode='22023';
end;
$$;
create function public.moderate_department_content_for_client(p_key text,p_target text,p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null or not coalesce(feed_data.community_review_allowed(room),false)
  then raise exception 'moderator required' using errcode='42501'; end if;
  if p_target='posts' then perform feed_data.moderate_scoped_post(room,p_id,p_version,p_action,p_reason);
  elsif p_target='comments' then perform feed_data.moderate_scoped_comment(room,p_id,p_version,p_action,p_reason);
  else raise exception 'invalid target' using errcode='22023'; end if;
end;
$$;
revoke all on function feed_data.moderate_scoped_post(uuid,uuid,integer,text,text),
  feed_data.moderate_scoped_comment(uuid,uuid,integer,text,text), feed_data.list_scoped_post_reports(uuid,text,timestamptz,uuid),
  feed_data.list_scoped_comment_reports(uuid,text,timestamptz,uuid),
  public.can_review_department_for_client(text),public.can_review_post_for_client(uuid),
  public.department_reports_for_client(text,text,text,timestamptz,uuid),
  public.moderate_department_content_for_client(text,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.can_review_department_for_client(text),public.can_review_post_for_client(uuid),
  public.department_reports_for_client(text,text,text,timestamptz,uuid),
  public.moderate_department_content_for_client(text,text,uuid,integer,text,text) to authenticated;

create or replace function public.review_appeals_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('pending','history') or p_limit is null or p_limit not between 1 and 30
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(feed_data.appeal_projection(q.appeal) || jsonb_build_object(
    'createdAt',q.date,'kind',q.kind,'postId',q.post_id,'commentId',q.comment_id,
    'body',q.body,'language',q.language,'originalReason',q.original_reason,'originalAt',q.original_at,
    'conflict',q.conflict,'canRestore',q.can_restore) order by q.date desc,(q.appeal).id desc) from (
    select s as appeal,coalesce(s.decided_at,s.created_at) date,a.kind,a.post_id,a.comment_id,a.body,a.language,
      a.reason original_reason,a.created_at original_at,
      (auth.uid()=a.actor_id or auth.uid()=s.appellant_id or a.actor_id is null) as conflict,
      (s.appellant_id is not null and a.current and a.status='hidden' and a.deleted_at is null
        and feed_data.author_active(s.appellant_id)) as can_restore
    from feed_data.moderation_appeals s join feed_data.appealable_actions a
      on (a.kind='post' and a.id=s.post_action_id or a.kind='comment' and a.id=s.comment_action_id)
    where exists(select 1 from feed_data.posts p where p.id=a.post_id
      and (p.community_id is null or private.platform_admin(auth.uid())))
      and s.appellant_id is distinct from auth.uid() and ((p_scope='pending')=(s.outcome='pending'))
      and (p_before_at is null or (coalesce(s.decided_at,s.created_at),s.id)<(p_before_at,p_before_id))
    order by date desc,s.id desc limit p_limit+1
  ) q),'[]'::jsonb);
end;
$$;

create or replace function public.decide_moderation_appeal_for_client(p_id uuid,p_outcome text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare request feed_data.moderation_appeals; decision feed_data.appealable_actions; room uuid;
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_id is null or p_outcome is null or p_outcome not in ('upheld','overturned','closed') or p_explanation is null
    or char_length(btrim(p_explanation)) not between 10 and 500 or p_explanation ~ '[[:cntrl:]]'
  then raise exception 'invalid decision' using errcode='22023'; end if;
  perform feed_data.consume_limit(auth.uid(),'appeal_review',20);
  select * into request from feed_data.moderation_appeals where id=p_id;
  if not found then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
  select * into decision from feed_data.appealable_actions a
    where (a.kind='post' and a.id=request.post_action_id or a.kind='comment' and a.id=request.comment_action_id);
  if not found then raise exception 'decision unavailable' using errcode='PFR09'; end if;
  select community_id into room from feed_data.posts where id=decision.post_id;
  if room is not null and not coalesce(private.platform_admin(auth.uid()),false)
  then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
  if decision.kind='post' then perform 1 from feed_data.posts where id=decision.post_id for update;
  else
    perform 1 from feed_data.posts where id=decision.post_id for share;
    perform 1 from feed_data.comments where id=decision.comment_id for update;
  end if;
  select * into request from feed_data.moderation_appeals where id=p_id for update;
  select * into decision from feed_data.appealable_actions a
    where (a.kind='post' and a.id=request.post_action_id or a.kind='comment' and a.id=request.comment_action_id);
  if decision.actor_id is null or decision.actor_id=auth.uid() or request.appellant_id=auth.uid()
  then raise exception 'reviewer conflict' using errcode='PSF03'; end if;
  if request.outcome<>'pending' then raise exception 'decision changed' using errcode='PFR09'; end if;
  if p_outcome='overturned' and (not decision.current or decision.status<>'hidden' or decision.deleted_at is not null
      or request.appellant_id is null or not feed_data.author_active(request.appellant_id)
      or (decision.kind='comment' and not exists(select 1 from feed_data.posts p
        where p.id=decision.post_id and p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id))))
  then raise exception 'restore unavailable' using errcode='PFR09'; end if;
  update feed_data.moderation_appeals set outcome=p_outcome,reviewer_id=auth.uid(),
    explanation=btrim(p_explanation),decided_at=clock_timestamp() where id=p_id;
  if p_outcome='overturned' then
    if decision.kind='post' then perform feed_data.moderate_scoped_post(room,decision.post_id,decision.version,'restore',btrim(p_explanation));
    else perform feed_data.moderate_scoped_comment(room,decision.comment_id,decision.version,'restore',btrim(p_explanation)); end if;
  end if;
  if request.appellant_id is not null and feed_data.author_active(request.appellant_id) then
    insert into feed_data.notifications(recipient_id,kind,appeal_id,dedupe)
    values(request.appellant_id,'appeal_decided',p_id,'appeal:'||p_id::text)
    on conflict(recipient_id,dedupe) do nothing;
  end if;
end;
$$;
