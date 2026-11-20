create table feed_data.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reactions boolean not null default true,
  comments boolean not null default true,
  replies boolean not null default true,
  followers boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

create table feed_data.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('post_reaction','post_comment','comment_reply','new_follower')),
  post_id uuid references feed_data.posts(id) on delete set null,
  comment_id uuid references feed_data.comments(id) on delete set null,
  dedupe text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique(recipient_id,dedupe),
  check(recipient_id<>actor_id)
);
create index notifications_recipient_page on feed_data.notifications(recipient_id,created_at desc,id desc);
create index notifications_unread on feed_data.notifications(recipient_id,created_at) where read_at is null;
create index notifications_expiry on feed_data.notifications(created_at,id);
create index notifications_actor on feed_data.notifications(actor_id);
create index notifications_post on feed_data.notifications(post_id);
create index notifications_comment on feed_data.notifications(comment_id);

alter table feed_data.notifications enable row level security;
alter table feed_data.notification_preferences enable row level security;
revoke all on feed_data.notifications,feed_data.notification_preferences from public,anon,authenticated,service_role;
alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write'));

create function feed_data.emit_notification(p_recipient uuid,p_actor uuid,p_kind text,p_post uuid,p_comment uuid)
returns void language plpgsql set search_path='' as $$
declare enabled boolean;
begin
  if p_recipient is null or p_recipient=p_actor or auth.uid() is distinct from p_actor
    or not feed_data.author_active(p_recipient) or not feed_data.author_active(p_actor)
    or (p_kind='new_follower' and not feed_data.follower_visible(p_actor))
  then return; end if;

  select case p_kind when 'post_reaction' then reactions when 'post_comment' then comments
    when 'comment_reply' then replies when 'new_follower' then followers end into enabled
    from feed_data.notification_preferences where user_id=p_recipient;
  if enabled is false then return; end if;
  insert into feed_data.notifications(recipient_id,actor_id,kind,post_id,comment_id,dedupe)
    values(p_recipient,p_actor,p_kind,p_post,p_comment,p_kind||':'||p_actor::text||':'||
      coalesce(p_comment,p_post,p_recipient)::text)
    on conflict(recipient_id,dedupe) do nothing;
  if found then
    delete from feed_data.notifications where id in (
      select id from feed_data.notifications where created_at<now()-interval '30 days'
      order by created_at,id limit 32 for update skip locked
    );
  end if;
end;
$$;

create function feed_data.capture_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare post_author uuid; parent_author uuid;
begin
  if tg_table_name='post_reactions' then
    select author_id into post_author from feed_data.posts where id=new.post_id;
    perform feed_data.emit_notification(post_author,new.user_id,'post_reaction',new.post_id,null);
  elsif tg_table_name='comments' then
    select author_id into post_author from feed_data.posts where id=new.post_id;
    if new.parent_id is not null then
      select author_id into parent_author from feed_data.comments where id=new.parent_id;
      perform feed_data.emit_notification(parent_author,new.author_id,'comment_reply',new.post_id,new.id);
    end if;
    if post_author is distinct from parent_author then
      perform feed_data.emit_notification(post_author,new.author_id,'post_comment',new.post_id,new.id);
    end if;
  else
    perform feed_data.emit_notification(new.target_id,new.follower_id,'new_follower',null,null);
  end if;
  return new;
end;
$$;
create trigger notify_post_reaction after insert on feed_data.post_reactions
  for each row execute function feed_data.capture_notification();
create trigger notify_post_comment after insert on feed_data.comments
  for each row execute function feed_data.capture_notification();
create trigger notify_member_follow after insert on feed_data.member_follows
  for each row execute function feed_data.capture_notification();

create function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.actor_id is null or not feed_data.author_active(n.actor_id) then false
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

create function public.notifications_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 30 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.created_at,'readAt',n.read_at,
    'available',n.visible,'kind',case when n.visible then n.kind end,'postId',case when n.visible then n.post_id end,
    'commentId',case when n.visible then n.comment_id end,
    'actor',case when n.visible then feed_data.author_projection(n.actor_id)-'avatarPath' end) order by n.created_at desc,n.id desc)
    from (
      select n.*,feed_data.notification_visible(n) as visible from (
        select x.* from feed_data.notifications x where x.recipient_id=auth.uid() and x.created_at>=now()-interval '30 days'
          and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
        order by x.created_at desc,x.id desc limit p_limit+1
      ) n
    ) n),'[]');
end;
$$;

create function public.notification_count_for_client()
returns integer language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return (select count(*)::integer from feed_data.notifications n where n.recipient_id=auth.uid() and n.read_at is null
    and n.created_at>=now()-interval '30 days' and feed_data.notification_visible(n));
end;
$$;

create function public.mark_notifications_for_client(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'notification_write',40);
  if p_id is not null then
    update feed_data.notifications set read_at=coalesce(read_at,clock_timestamp())
      where id=p_id and recipient_id=auth.uid() and created_at>=now()-interval '30 days';
    if not found then raise exception 'notification unavailable' using errcode='PFR04'; end if;
  else
    update feed_data.notifications set read_at=clock_timestamp()
      where recipient_id=auth.uid() and read_at is null and created_at>=now()-interval '30 days';
  end if;
end;
$$;

create function public.notification_preferences_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_build_object('reactions',reactions,'comments',comments,'replies',replies,'followers',followers)
    from feed_data.notification_preferences where user_id=auth.uid()),
    '{"reactions":true,"comments":true,"replies":true,"followers":true}'::jsonb);
end;
$$;

create function public.save_notification_preferences_for_client(p_reactions boolean,p_comments boolean,p_replies boolean,p_followers boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_reactions is null or p_comments is null or p_replies is null or p_followers is null
  then raise exception 'invalid preferences' using errcode='22023'; end if;
  perform feed_data.consume_limit(auth.uid(),'notification_write',40);
  insert into feed_data.notification_preferences(user_id,reactions,comments,replies,followers)
    values(auth.uid(),p_reactions,p_comments,p_replies,p_followers)
    on conflict(user_id) do update set reactions=excluded.reactions,comments=excluded.comments,replies=excluded.replies,
      followers=excluded.followers,updated_at=clock_timestamp();
  return public.notification_preferences_for_client();
end;
$$;

create function public.post_comment_target_for_client(p_post uuid,p_comment uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'body',c.body,'language',c.language,'createdAt',c.created_at)
  from feed_data.comments c join feed_data.posts p on p.id=c.post_id where p.id=p_post and c.id=p_comment
    and feed_data.discussion_visible(p) and feed_data.comment_visible(c)
    and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
      and feed_data.comment_visible(parent)));
$$;

revoke all on function feed_data.emit_notification(uuid,uuid,text,uuid,uuid),feed_data.capture_notification(),
  feed_data.notification_visible(feed_data.notifications),public.notifications_for_client(integer,timestamptz,uuid),
  public.notification_count_for_client(),public.mark_notifications_for_client(uuid),public.notification_preferences_for_client(),
  public.save_notification_preferences_for_client(boolean,boolean,boolean,boolean),public.post_comment_target_for_client(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.notifications_for_client(integer,timestamptz,uuid),public.notification_count_for_client(),
  public.mark_notifications_for_client(uuid),public.notification_preferences_for_client(),
  public.save_notification_preferences_for_client(boolean,boolean,boolean,boolean)
  to authenticated;
grant execute on function public.post_comment_target_for_client(uuid,uuid) to anon,authenticated;
