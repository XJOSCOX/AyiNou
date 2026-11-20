create table feed_data.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  appellant_id uuid references auth.users(id) on delete set null,
  post_action_id uuid unique references feed_data.post_moderation_actions(id) on delete restrict,
  comment_action_id uuid unique references feed_data.comment_moderation_actions(id) on delete restrict,
  reason text not null check(char_length(btrim(reason)) between 10 and 1000 and translate(reason,E'\t\r\n','') !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp(),
  outcome text not null default 'pending' check(outcome in ('pending','upheld','overturned','closed')),
  reviewer_id uuid references auth.users(id) on delete set null,
  explanation text check(char_length(btrim(explanation)) between 10 and 500 and explanation !~ '[[:cntrl:]]'),
  decided_at timestamptz,
  check(num_nonnulls(post_action_id,comment_action_id)=1),
  check((outcome='pending')=(decided_at is null and explanation is null)),
  check((decided_at is null)=(explanation is null)),
  check(reviewer_id is null or reviewer_id<>appellant_id)
);
create index appeals_member on feed_data.moderation_appeals(appellant_id,created_at desc,id desc);
create index appeals_queue on feed_data.moderation_appeals(created_at desc,id desc) where outcome='pending';
create index appeals_history on feed_data.moderation_appeals(decided_at desc,id desc) where decided_at is not null;
create index appeals_reviewer on feed_data.moderation_appeals(reviewer_id);
alter table feed_data.moderation_appeals enable row level security;
revoke all on feed_data.moderation_appeals from public,anon,authenticated,service_role;

-- Decisions already used to remove content may have discarded its media. Active hides preserve it.
create view feed_data.appealable_actions as
  select a.id,'post'::text kind,p.id post_id,null::uuid comment_id,p.author_id,p.status,p.deleted_at,p.version,
     p.body,p.language,a.actor_id,a.reason,a.created_at,
     not exists(select 1 from feed_data.post_moderation_actions n where n.post_id=p.id
       and n.action in ('hide','restore','remove') and (n.created_at,n.id)>(a.created_at,a.id)) as current
  from feed_data.post_moderation_actions a join feed_data.posts p on p.id=a.post_id where a.action='hide'
  union all
  select a.id,'comment',c.post_id,c.id,c.author_id,c.status,c.deleted_at,c.version,
     c.body,c.language,a.actor_id,a.reason,a.created_at,
     not exists(select 1 from feed_data.comment_moderation_actions n where n.comment_id=c.id
       and n.action in ('hide','restore','remove') and (n.created_at,n.id)>(a.created_at,a.id))
  from feed_data.comment_moderation_actions a join feed_data.comments c on c.id=a.comment_id where a.action='hide';
revoke all on feed_data.appealable_actions from public,anon,authenticated,service_role;

create function feed_data.appeal_projection(a feed_data.moderation_appeals)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',a.id,'reason',a.reason,'outcome',a.outcome,'explanation',a.explanation,
    'createdAt',a.created_at,'decidedAt',a.decided_at);
$$;

create function public.member_appeals_for_client(p_before_at timestamptz,p_before_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 30 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(item order by created_at desc,id desc) from (
    select a.id,a.created_at,jsonb_build_object('id',a.id,'kind',a.kind,'createdAt',a.created_at,
      'deadline',a.created_at+interval '14 days',
      'eligible',s.id is null and a.current and a.status='hidden' and a.deleted_at is null
        and a.created_at>=now()-interval '14 days',
      'appeal',case when s.id is not null then feed_data.appeal_projection(s) end) item
    from feed_data.appealable_actions a
    left join feed_data.moderation_appeals s
      on (a.kind='post' and s.post_action_id=a.id or a.kind='comment' and s.comment_action_id=a.id)
      and s.appellant_id=auth.uid()
    where a.author_id=auth.uid()
      and (s.id is not null or (a.current and a.status='hidden' and a.deleted_at is null and a.created_at>=now()-interval '14 days'))
      and (p_before_at is null or (a.created_at,a.id)<(p_before_at,p_before_id))
    order by a.created_at desc,a.id desc limit p_limit+1
  ) q),'[]'::jsonb);
end;
$$;

create function public.submit_moderation_appeal_for_client(p_kind text,p_action uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare decision feed_data.appealable_actions; existing feed_data.moderation_appeals; result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('post','comment') or p_action is null or p_reason is null
    or char_length(btrim(p_reason)) not between 10 and 1000 or translate(p_reason,E'\t\r\n','') ~ '[[:cntrl:]]'
  then raise exception 'invalid appeal' using errcode='22023'; end if;
  perform feed_data.consume_limit(auth.uid(),'appeal_submit',5);
  select * into decision from feed_data.appealable_actions where kind=p_kind and id=p_action and author_id=auth.uid();
  if not found then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
  if p_kind='post' then perform 1 from feed_data.posts where id=decision.post_id for update;
  else perform 1 from feed_data.comments where id=decision.comment_id for update; end if;
  select * into existing from feed_data.moderation_appeals a
    where a.appellant_id=auth.uid() and (p_kind='post' and a.post_action_id=p_action or p_kind='comment' and a.comment_action_id=p_action);
  if found then
    if existing.reason=btrim(p_reason) then return existing.id; end if;
    raise exception 'appeal already exists' using errcode='PSF09';
  end if;
  select * into decision from feed_data.appealable_actions where kind=p_kind and id=p_action and author_id=auth.uid();
  if not found or not decision.current or decision.status<>'hidden' or decision.deleted_at is not null
  then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
  if decision.created_at<clock_timestamp()-interval '14 days' then raise exception 'appeal expired' using errcode='PSF14'; end if;
  insert into feed_data.moderation_appeals(appellant_id,post_action_id,comment_action_id,reason)
    values(auth.uid(),case when p_kind='post' then p_action end,case when p_kind='comment' then p_action end,btrim(p_reason))
    returning id into result;
  return result;
end;
$$;

create function public.review_appeals_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid,p_limit integer)
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
    where s.appellant_id is distinct from auth.uid() and ((p_scope='pending')=(s.outcome='pending'))
      and (p_before_at is null or (coalesce(s.decided_at,s.created_at),s.id)<(p_before_at,p_before_id))
    order by date desc,s.id desc limit p_limit+1
  ) q),'[]'::jsonb);
end;
$$;

alter table feed_data.notifications drop constraint notifications_kind_check,
  add column appeal_id uuid unique references feed_data.moderation_appeals(id) on delete restrict,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided')),
  add constraint notifications_appeal_scope check((kind='appeal_decided')=(appeal_id is not null)
    and (appeal_id is null or (actor_id is null and post_id is null and comment_id is null)));

create function public.decide_moderation_appeal_for_client(p_id uuid,p_outcome text,p_explanation text)
returns void language plpgsql security definer set search_path='' as $$
declare request feed_data.moderation_appeals; decision feed_data.appealable_actions;
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
    if decision.kind='post' then perform public.moderate_post_for_client(decision.post_id,decision.version,'restore',btrim(p_explanation));
    else perform public.moderate_comment_for_client(decision.comment_id,decision.version,'restore',btrim(p_explanation)); end if;
  end if;
  if request.appellant_id is not null and feed_data.author_active(request.appellant_id) then
    insert into feed_data.notifications(recipient_id,kind,appeal_id,dedupe)
    values(request.appellant_id,'appeal_decided',p_id,'appeal:'||p_id::text)
    on conflict(recipient_id,dedupe) do nothing;
  end if;
end;
$$;

-- Pending evidence stays hidden and intact until an independent reviewer closes the appeal.
create function feed_data.protect_appeal_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='DELETE' or new.deleted_at is distinct from old.deleted_at or new.status is distinct from old.status)
    and exists(select 1 from feed_data.moderation_appeals s join feed_data.appealable_actions a
      on (a.kind='post' and a.id=s.post_action_id or a.kind='comment' and a.id=s.comment_action_id)
      where s.outcome='pending' and (tg_table_name='posts' and a.post_id=old.id or tg_table_name='comments' and a.comment_id=old.id))
  then raise exception 'content has a pending appeal' using errcode='PFR09'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_post_appeal before delete or update of status,deleted_at on feed_data.posts
  for each row execute function feed_data.protect_appeal_evidence();
create trigger protect_comment_appeal before delete or update of status,deleted_at on feed_data.comments
  for each row execute function feed_data.protect_appeal_evidence();

revoke all on function feed_data.appeal_projection(feed_data.moderation_appeals),feed_data.protect_appeal_evidence(),
  public.member_appeals_for_client(timestamptz,uuid,integer),public.submit_moderation_appeal_for_client(text,uuid,text),
  public.review_appeals_for_client(text,timestamptz,uuid,integer),public.decide_moderation_appeal_for_client(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.member_appeals_for_client(timestamptz,uuid,integer),public.submit_moderation_appeal_for_client(text,uuid,text),
  public.review_appeals_for_client(text,timestamptz,uuid,integer),public.decide_moderation_appeal_for_client(uuid,text,text) to authenticated;

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
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
