-- Engagement tables stay outside the Data API. Only narrow RPCs make projections.
create table feed_data.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  is_root boolean generated always as (parent_id is null) stored,
  parent_is_root boolean generated always as (true) stored,
  body text not null check (char_length(body) between 1 and 1000 and body ~ '[^[:space:]]'
    and translate(body,E'\t\r\n','') !~ '[[:cntrl:]]'),
  language text not null check (language in ('ht','fr','en','es')),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1 check (version>=1),
  unique (id,post_id,is_root),
  foreign key (parent_id,post_id,parent_is_root) references feed_data.comments(id,post_id,is_root) on delete cascade,
  check (parent_id<>id)
);
create index comments_thread_page on feed_data.comments(post_id,parent_id,created_at,id);
create index comments_author on feed_data.comments(author_id);
create index comments_hidden on feed_data.comments(updated_at desc,id desc) where status='hidden' and deleted_at is null;

create table feed_data.comment_submissions (
  author_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  comment_id uuid not null unique references feed_data.comments(id) on delete cascade,
  request_digest bytea not null check (octet_length(request_digest)=32),
  primary key (author_id,submission_id)
);
create table feed_data.post_reactions (
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('like','love','support','celebrate')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (post_id,user_id)
);
create index post_reactions_user on feed_data.post_reactions(user_id);
create table feed_data.comment_reactions (
  comment_id uuid not null references feed_data.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('like','love','support','celebrate')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (comment_id,user_id)
);
create index comment_reactions_user on feed_data.comment_reactions(user_id);
create table feed_data.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references feed_data.comments(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('harassment','hate','spam','privacy','other')),
  note text check (char_length(note) between 1 and 500 and translate(note,E'\t\r\n','') !~ '[[:cntrl:]]'),
  status text not null default 'pending' check (status in ('pending','closed')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  check ((status='closed')=(closed_at is not null)),
  unique (comment_id,reporter_id)
);
create index comment_reports_queue on feed_data.comment_reports(created_at desc,id desc) where status='pending';
create index comment_reports_reporter on feed_data.comment_reports(reporter_id);
create table feed_data.comment_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references feed_data.comments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('hide','restore','remove','dismiss')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp()
);
create index comment_decisions_history on feed_data.comment_moderation_actions(comment_id,created_at desc,id desc);
create index comment_decisions_actor on feed_data.comment_moderation_actions(actor_id);

alter table feed_data.comments enable row level security;
alter table feed_data.comment_submissions enable row level security;
alter table feed_data.post_reactions enable row level security;
alter table feed_data.comment_reactions enable row level security;
alter table feed_data.comment_reports enable row level security;
alter table feed_data.comment_moderation_actions enable row level security;
revoke all on feed_data.comments,feed_data.comment_submissions,feed_data.post_reactions,feed_data.comment_reactions,
  feed_data.comment_reports,feed_data.comment_moderation_actions from public,anon,authenticated,service_role;

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check (action in ('create','edit','report','comment_create','comment_edit','reaction','comment_report','engagement_attempt'));

create function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and case when auth.uid() is null then p.visibility='public'
      else p.visibility in ('public','members_only') and feed_data.member_allowed() end,false);
$$;

create function feed_data.comment_visible(c feed_data.comments)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(c.status='published' and c.deleted_at is null and feed_data.author_active(c.author_id),false);
$$;

create function feed_data.reaction_summary(p_target uuid,p_comment boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('counts',jsonb_build_object('like',count(*) filter(where kind='like'),
    'love',count(*) filter(where kind='love'),'support',count(*) filter(where kind='support'),
    'celebrate',count(*) filter(where kind='celebrate')), 'mine',max(kind) filter(where user_id=auth.uid()))
  from (
    select kind,user_id from feed_data.comment_reactions where p_comment and comment_id=p_target
    union all
    select kind,user_id from feed_data.post_reactions where not p_comment and post_id=p_target
  ) r;
$$;

create function public.post_reactions_for_client(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ids is null or cardinality(p_ids)>41 then raise exception 'invalid targets' using errcode='22023'; end if;
  return coalesce((select jsonb_object_agg(p.id,feed_data.reaction_summary(p.id,false))
    from feed_data.posts p where p.id=any(p_ids) and feed_data.discussion_visible(p)),'{}'::jsonb);
end;
$$;

create function public.list_comments_for_client(p_post uuid,p_parent uuid,p_limit integer,p_after_at timestamptz,p_after_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit not between 1 and 25 or ((p_after_at is null)<>(p_after_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if not exists(select 1 from feed_data.posts p where p.id=p_post and feed_data.discussion_visible(p))
  then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if p_parent is not null and not exists(select 1 from feed_data.comments c where c.id=p_parent and c.post_id=p_post and c.is_root
      and (feed_data.comment_visible(c) or exists(select 1 from feed_data.comments r where r.post_id=p_post and r.parent_id=c.id and feed_data.comment_visible(r))))
  then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'parentId',c.parent_id,'createdAt',c.created_at,'available',c.visible,'hasReplies',c.has_replies,
    'body',case when c.visible then c.body end,'language',case when c.visible then c.language end,
    'editedAt',case when c.visible then c.edited_at end,'version',case when c.visible then c.version end,
    'own',coalesce(c.visible and c.author_id=auth.uid(),false),
    'author',case when c.visible then feed_data.author_projection(c.author_id)-'avatarPath' end,
    'reactions',case when c.visible then feed_data.reaction_summary(c.id,true) end
  ) order by c.created_at,c.id) from (
    select * from (select x.*,feed_data.comment_visible(x) as visible,
      x.is_root and exists(select 1 from feed_data.comments r where r.post_id=x.post_id and r.parent_id=x.id and feed_data.comment_visible(r)) as has_replies
    from feed_data.comments x where x.post_id=p_post
      and ((p_parent is null and x.parent_id is null) or x.parent_id=p_parent)
      and (p_after_at is null or (x.created_at,x.id)>(p_after_at,p_after_id))
  ) visible_rows where visible or has_replies order by created_at,id limit p_limit+1
  ) c),'[]'::jsonb);
end;
$$;

create function feed_data.lock_discussion(p_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from feed_data.posts p where p.id=p_id and feed_data.discussion_visible(p) for share;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
end;
$$;

create function feed_data.create_comment(p_post uuid,p_parent uuid,p_body text,p_language text,p_submission uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  result uuid;
  prior_hash bytea;
  request_hash bytea;
begin
  if p_post is null or p_body is null or p_language is null or p_submission is null
  then raise exception 'missing fields' using errcode='22023'; end if;
  request_hash:=extensions.digest(jsonb_build_array(p_post,p_parent,p_body,p_language)::text,'sha256');
  select comment_id,request_digest into result,prior_hash from feed_data.comment_submissions
    where author_id=actor and submission_id=p_submission;
  if found then
    if prior_hash<>request_hash then raise exception 'stale submission' using errcode='PFR09'; end if;
    return result;
  end if;
  perform feed_data.lock_discussion(p_post);
  if p_parent is not null then
    perform 1 from feed_data.comments c where c.id=p_parent and c.post_id=p_post and c.is_root
      and feed_data.comment_visible(c) for share;
    if not found then raise exception 'invalid parent' using errcode='22023'; end if;
  end if;
  perform feed_data.consume_limit(actor,'comment_create',12);
  insert into feed_data.comments(post_id,parent_id,author_id,body,language)
    values(p_post,p_parent,actor,p_body,p_language) returning id into result;
  insert into feed_data.comment_submissions(author_id,submission_id,comment_id,request_digest)
    values(actor,p_submission,result,request_hash);
  return result;
end;
$$;

create function feed_data.mutate_comment(p_id uuid,p_version integer,p_delete boolean,p_body text,p_language text)
returns void language plpgsql set search_path = '' as $$
declare c feed_data.comments;
begin
  select * into c from feed_data.comments where id=p_id;
  if not found then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  perform feed_data.lock_discussion(c.post_id);
  select * into c from feed_data.comments where id=p_id for update;
  if not found or c.deleted_at is not null or c.status='removed' then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  if c.author_id<>auth.uid() or c.status<>'published' then raise exception 'editing denied' using errcode='42501'; end if;
  if c.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  perform feed_data.consume_limit(auth.uid(),'comment_edit',24);
  if p_delete then
    update feed_data.comments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_id;
  else
    if p_body is null or p_language is null then raise exception 'missing fields' using errcode='22023'; end if;
    update feed_data.comments set body=p_body,language=p_language,edited_at=clock_timestamp(),
      updated_at=clock_timestamp(),version=version+1 where id=p_id;
  end if;
end;
$$;

create function feed_data.lock_comment_target(p_id uuid)
returns feed_data.comments language plpgsql set search_path = '' as $$
declare c feed_data.comments;
begin
  select * into c from feed_data.comments where id=p_id;
  if not found then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  perform feed_data.lock_discussion(c.post_id);
  select * into c from feed_data.comments where id=p_id for share;
  if not found or not feed_data.comment_visible(c) then raise exception 'comment unavailable' using errcode='PFR04'; end if;
  return c;
end;
$$;

create function feed_data.change_reaction(p_id uuid,p_comment boolean,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare actor uuid:=auth.uid();
begin
  if p_kind is not null and p_kind not in ('like','love','support','celebrate')
  then raise exception 'invalid reaction' using errcode='22023'; end if;
  if p_comment then perform feed_data.lock_comment_target(p_id);
  else perform feed_data.lock_discussion(p_id); end if;
  perform feed_data.consume_limit(actor,'reaction',40);
  if p_comment then
    if p_kind is null then
      delete from feed_data.comment_reactions where comment_id=p_id and user_id=actor;
    else
      insert into feed_data.comment_reactions(comment_id,user_id,kind) values(p_id,actor,p_kind)
        on conflict(comment_id,user_id) do update set kind=excluded.kind,updated_at=excluded.updated_at
        where comment_reactions.kind is distinct from excluded.kind;
    end if;
  else
    if p_kind is null then
      delete from feed_data.post_reactions where post_id=p_id and user_id=actor;
    else
      insert into feed_data.post_reactions(post_id,user_id,kind) values(p_id,actor,p_kind)
        on conflict(post_id,user_id) do update set kind=excluded.kind,updated_at=excluded.updated_at
        where post_reactions.kind is distinct from excluded.kind;
    end if;
  end if;
  return feed_data.reaction_summary(p_id,p_comment);
end;
$$;

create function public.read_reaction_for_client(p_id uuid,p_comment boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_comment is null then raise exception 'invalid target' using errcode='22023'; end if;
  if not (case when p_comment then exists(
    select 1 from feed_data.comments c join feed_data.posts p on p.id=c.post_id
    where c.id=p_id and feed_data.comment_visible(c) and feed_data.discussion_visible(p))
    else exists(select 1 from feed_data.posts p where p.id=p_id and feed_data.discussion_visible(p)) end)
  then raise exception 'target unavailable' using errcode='PFR04'; end if;
  return feed_data.reaction_summary(p_id,p_comment);
end;
$$;

create function feed_data.report_comment(p_id uuid,p_category text,p_note text)
returns void language plpgsql set search_path = '' as $$
declare c feed_data.comments;
begin
  c:=feed_data.lock_comment_target(p_id);
  if c.author_id=auth.uid() then raise exception 'own comment' using errcode='42501'; end if;
  if p_category is null then raise exception 'invalid category' using errcode='22023'; end if;
  perform feed_data.consume_limit(auth.uid(),'comment_report',5);
  insert into feed_data.comment_reports(comment_id,reporter_id,category,note)
    values(p_id,auth.uid(),p_category,nullif(btrim(p_note),''));
end;
$$;

-- A successful outer transaction retains the attempt charge even when a known
-- inner write error rolls back. The account's quota row serializes its writes.
create function public.write_engagement_for_client(p_operation text,p_id uuid,p_parent uuid default null,
  p_body text default null,p_language text default null,p_submission uuid default null,p_version integer default null,
  p_kind text default null,p_category text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'engagement_attempt',100);
  begin
    case p_operation
      when 'create' then return jsonb_build_object('id',feed_data.create_comment(p_id,p_parent,p_body,p_language,p_submission));
      when 'edit','delete' then perform feed_data.mutate_comment(p_id,p_version,p_operation='delete',p_body,p_language);
      when 'post_reaction','comment_reaction' then return jsonb_build_object('reactions',feed_data.change_reaction(p_id,p_operation='comment_reaction',p_kind));
      when 'report' then perform feed_data.report_comment(p_id,p_category,p_note);
      else raise exception 'invalid operation' using errcode='22023';
    end case;
    return '{}'::jsonb;
  exception
    when sqlstate 'PFR04' or sqlstate 'PFR09' or sqlstate 'PFR29' or insufficient_privilege
      or invalid_parameter_value or check_violation or unique_violation
    then return jsonb_build_object('error',sqlstate);
  end;
end;
$$;

create function public.list_comment_reports_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
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
      where p_scope='reports' and r.status='pending' and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
    union all
    select x.id,x.id,null,null,x.updated_at from feed_data.comments x where p_scope='hidden' and x.status='hidden'
      and x.deleted_at is null and (p_before_at is null or (x.updated_at,x.id)<(p_before_at,p_before_id))
    order by date desc,id desc limit 26
  ) q join feed_data.comments c on c.id=q.comment_id),'[]'::jsonb);
end;
$$;

create function public.moderate_comment_for_client(p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c feed_data.comments;
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('hide','restore','remove','dismiss') or p_reason is null
  then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into c from feed_data.comments where id=p_id for update;
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

revoke all on function feed_data.discussion_visible(feed_data.posts),feed_data.comment_visible(feed_data.comments),
  feed_data.reaction_summary(uuid,boolean),feed_data.lock_discussion(uuid),
  feed_data.create_comment(uuid,uuid,text,text,uuid),feed_data.mutate_comment(uuid,integer,boolean,text,text),
  feed_data.lock_comment_target(uuid),feed_data.change_reaction(uuid,boolean,text),feed_data.report_comment(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.post_reactions_for_client(uuid[]),public.list_comments_for_client(uuid,uuid,integer,timestamptz,uuid),
  public.read_reaction_for_client(uuid,boolean),public.write_engagement_for_client(text,uuid,uuid,text,text,uuid,integer,text,text,text),
  public.list_comment_reports_for_client(text,timestamptz,uuid),public.moderate_comment_for_client(uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.post_reactions_for_client(uuid[]),public.list_comments_for_client(uuid,uuid,integer,timestamptz,uuid),
  public.read_reaction_for_client(uuid,boolean) to anon,authenticated;
grant execute on function public.write_engagement_for_client(text,uuid,uuid,text,text,uuid,integer,text,text,text),
  public.list_comment_reports_for_client(text,timestamptz,uuid),public.moderate_comment_for_client(uuid,integer,text,text) to authenticated;
