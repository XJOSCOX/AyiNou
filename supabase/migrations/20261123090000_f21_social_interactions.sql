-- Keep original posts authoritative. These references never grant read access.
alter table feed_data.posts add column organization_id uuid references private.organizations(id) on delete cascade;
create index f21_organization_posts on feed_data.posts(organization_id,created_at desc,id desc)
  where status='published' and deleted_at is null and organization_id is not null;
alter table feed_data.member_follows add column show_reposts boolean not null default true;
alter table feed_data.institution_follows add column show_reposts boolean not null default true;

create table feed_data.reposts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(), unique(actor_id,post_id)
);
create index f21_reposts_post on feed_data.reposts(post_id);
create index f21_reposts_timeline on feed_data.reposts(actor_id,created_at desc,id desc);

create table feed_data.post_quotes (
  post_id uuid primary key references feed_data.posts(id) on delete cascade,
  source_id uuid references feed_data.posts(id) on delete set null,
  check(post_id<>source_id)
);
create index f21_quotes_source on feed_data.post_quotes(source_id);

create table feed_data.bookmarks (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(), unique(actor_id,post_id)
);
create index f21_bookmarks_page on feed_data.bookmarks(actor_id,created_at desc,id desc);
create index f21_bookmarks_post on feed_data.bookmarks(post_id);

create table feed_data.post_hashtags (
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  tag text not null,
  occurred_at timestamptz not null,
  primary key(post_id,tag)
);
create index f21_tag_page on feed_data.post_hashtags(tag,occurred_at desc,post_id desc);

create table feed_data.social_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  comment_id uuid references feed_data.comments(id) on delete cascade,
  token text not null,
  member_id uuid references public.profiles(user_id) on delete set null,
  organization_id uuid references private.organizations(id) on delete set null,
  check(num_nonnulls(member_id,organization_id)<=1)
);
create unique index f21_mentions_post_token on feed_data.social_mentions(post_id,token) where comment_id is null;
create unique index f21_mentions_comment_token on feed_data.social_mentions(comment_id,token) where comment_id is not null;
create index f21_mentions_member on feed_data.social_mentions(member_id);
create index f21_mentions_org on feed_data.social_mentions(organization_id);

alter table feed_data.reposts enable row level security;
alter table feed_data.post_quotes enable row level security;
alter table feed_data.bookmarks enable row level security;
alter table feed_data.post_hashtags enable row level security;
alter table feed_data.social_mentions enable row level security;
revoke all on feed_data.reposts,feed_data.post_quotes,feed_data.bookmarks,feed_data.post_hashtags,feed_data.social_mentions
  from public,anon,authenticated,service_role;

create function feed_data.f21_org_visible(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_id is null or exists(select 1 from private.organizations o where o.id=p_id and feed_data.followable_institution(o))
$$;
revoke all on function feed_data.f21_org_visible(uuid) from public,anon,authenticated,service_role;
grant execute on function feed_data.f21_org_visible(uuid) to anon,authenticated;
create policy f21_organization_boundary on feed_data.posts as restrictive for select to anon,authenticated
  using(feed_data.f21_org_visible(organization_id));

create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id) and feed_data.f21_org_visible(p.organization_id)
    and (case when auth.uid() is null then p.visibility='public' or feed_data.public_group_post(p.community_id,p.created_at)
      else p.visibility in ('public','members_only') and feed_data.member_allowed()
        and (feed_data.can_read_community(p.community_id) or feed_data.public_group_post(p.community_id,p.created_at)) end),false)
$$;

create function feed_data.f21_shareable(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.community_id is null and p.visibility='public' and feed_data.discussion_visible(p)
    and feed_data.f21_org_visible(p.organization_id),false)
$$;

create function feed_data.f21_card(p feed_data.posts)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',p.author_id=auth.uid(),'author',feed_data.author_projection(p.author_id),
    'community',feed_data.community_post_reference(p.community_id))
$$;

-- Return only current identities. Keep the original token for rendering edits and renamed accounts.
create function feed_data.f21_mention_links(p_post uuid,p_comment uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(m.token,case when p.user_id is not null then '/members/'||p.username else '/organization/'||o.handle end),'{}')
  from feed_data.social_mentions m
  left join public.profiles p on p.user_id=m.member_id and feed_data.followable_member(p)
  left join private.organizations o on o.id=m.organization_id and feed_data.followable_institution(o)
  where m.post_id=p_post and m.comment_id is not distinct from p_comment and (p.user_id is not null or o.id is not null)
$$;

create function feed_data.f21_post_info(p feed_data.posts)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'shareable',feed_data.f21_shareable(p),
    'quotable',feed_data.f21_shareable(p) and q.post_id is null,
    'bookmarked',exists(select 1 from feed_data.bookmarks b where b.actor_id=auth.uid() and b.post_id=p.id),
    'reposted',exists(select 1 from feed_data.reposts r where r.actor_id=auth.uid() and r.post_id=p.id),
    'repostCount',case when feed_data.f21_shareable(p) then (
      select count(*) from feed_data.reposts r
      where r.post_id=p.id and feed_data.follower_visible(r.actor_id)
        and feed_data.viewer_can_interact(r.actor_id)) else 0 end,
    'quote',case when q.post_id is not null then coalesce((select jsonb_build_object(
      'id',o.id,'body',left(o.body,300),'language',o.language,'author',feed_data.author_projection(o.author_id)-'avatarPath',
      'organization',(select jsonb_build_object('handle',s.handle,'name',s.name) from private.organizations s where s.id=o.organization_id))
      from feed_data.posts o where o.id=q.source_id and feed_data.f21_shareable(o)
        and feed_data.viewer_unmuted(o.author_id)),'{"unavailable":true}'::jsonb) end,
    'organization',(select jsonb_build_object('handle',o.handle,'name',o.name) from private.organizations o where o.id=p.organization_id),
    'hashtags',coalesce((select jsonb_agg(tag order by tag) from feed_data.post_hashtags where post_id=p.id),'[]'),
    'mentions',feed_data.f21_mention_links(p.id,null))
  from (select 1) seed left join feed_data.post_quotes q on q.post_id=p.id
$$;

create function public.social_post_info_for_client(p_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id::text,feed_data.f21_post_info(p)),'{}')
  from feed_data.posts p where cardinality(p_ids) between 1 and 41 and p.id=any(p_ids)
    and (feed_data.discussion_visible(p) or (p.author_id=auth.uid() and feed_data.member_allowed() and p.deleted_at is null))
    and feed_data.f21_org_visible(p.organization_id)
$$;

create function public.social_interaction_for_client(p_id uuid,p_kind text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p feed_data.posts; changed boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_enabled is null or p_kind is null or p_kind not in ('bookmark','repost') then raise exception 'invalid action' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'engagement_attempt',60);
  if p_enabled then
    select * into p from feed_data.posts where id=p_id;
    if p.id is not null then perform feed_data.lock_member_pair(actor,p.author_id); end if;
    if p.id is null or not feed_data.discussion_visible(p) or not feed_data.f21_org_visible(p.organization_id)
      or (p_kind='repost' and not feed_data.f21_shareable(p))
      then raise exception 'post unavailable' using errcode='PFR04'; end if;

    if p_kind='bookmark' then
      insert into feed_data.bookmarks(actor_id,post_id) values(actor,p_id) on conflict(actor_id,post_id) do nothing;
    else
      insert into feed_data.reposts(actor_id,post_id) values(actor,p_id) on conflict(actor_id,post_id) do nothing;
      changed:=found;
      if changed then perform feed_data.f21_notice(p.author_id,actor,'post_repost',p_id,null); end if;
    end if;
  elsif p_kind='bookmark' then
    delete from feed_data.bookmarks where actor_id=actor and post_id=p_id;
  else
    delete from feed_data.reposts where actor_id=actor and post_id=p_id;
  end if;
  return jsonb_build_object('enabled',p_enabled);
end;
$$;

create function public.create_social_post_for_client(p_source uuid,p_organization text,p_body text,p_language text,p_submission uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); source feed_data.posts; org uuid; post uuid; prior uuid; old_source uuid; old_org uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if num_nonnulls(p_source,p_organization)<>1 then raise exception 'invalid social post' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  if p_source is not null then
    select * into source from feed_data.posts where id=p_source;
    if source.id is not null then perform feed_data.lock_member_pair(actor,source.author_id); end if;
    if source.id is null or not feed_data.f21_shareable(source)
      or exists(select from feed_data.post_quotes where post_id=p_source)
      then raise exception 'original unavailable' using errcode='PFR04'; end if;
  else
    select o.id into org from private.organizations o where o.handle=p_organization and feed_data.followable_institution(o);
    if org is null or coalesce(private.institution_role(actor,org),'') not in ('owner','administrator','editor')
      then raise exception 'organization unavailable' using errcode='PFR04'; end if;
  end if;
  select s.post_id,p.organization_id,q.source_id into prior,old_org,old_source
    from feed_data.post_submissions s join feed_data.posts p on p.id=s.post_id
    left join feed_data.post_quotes q on q.post_id=s.post_id
    where s.author_id=actor and s.submission_id=p_submission;
  if prior is not null and (old_source is distinct from p_source or old_org is distinct from org)
    then raise exception 'submission reused' using errcode='PFR09'; end if;
  post:=public.create_post_with_media_for_client(p_body,p_language,'public',p_submission,array[]::text[],'[]');
  if prior is null then
    if p_source is not null then
      insert into feed_data.post_quotes(post_id,source_id) values(post,p_source);
      perform feed_data.f21_notice(source.author_id,actor,'post_quote',post,null);
    else
      update feed_data.posts set organization_id=org where id=post;
    end if;
  end if;
  return post;
end;
$$;

create function public.follow_reposts_for_client(p_kind text,p_key text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; setting boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('member','institution') then raise exception 'invalid follow scope' using errcode='22023'; end if;
  if p_enabled is not null then perform feed_data.consume_limit(actor,'follow_write',60); end if;
  if p_kind='member' then
    select p.user_id into target from public.profiles p where p.username=p_key and feed_data.followable_member(p);
    if p_enabled is not null then
      perform feed_data.lock_member_pair(actor,target);
      update feed_data.member_follows set show_reposts=p_enabled where follower_id=actor and target_id=target;
    end if;
    select show_reposts into setting from feed_data.member_follows where follower_id=actor and target_id=target;
    return jsonb_build_object('showReposts',setting,'mutual',setting is not null and exists(
      select 1 from feed_data.member_follows where follower_id=target and target_id=actor));
  end if;
  select o.id into target from private.organizations o where (o.handle=p_key or o.id::text=p_key) and feed_data.followable_institution(o);
  if p_enabled is not null then
    update feed_data.institution_follows set show_reposts=p_enabled where follower_id=actor and organization_id=target;
  end if;
  select show_reposts into setting from feed_data.institution_follows where follower_id=actor and organization_id=target;
  return jsonb_build_object('showReposts',setting,'mutual',false);
end;
$$;

-- Use an event identity for the cursor without changing original interaction IDs.
create or replace function public.read_following_feed_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
    then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((
    select jsonb_agg(feed_data.f21_card(p) || jsonb_build_object('timelineId',e.id,'timelineAt',e.at)
      || case when e.actor is null then '{}'::jsonb else jsonb_build_object('repostBy',feed_data.author_projection(e.actor)-'avatarPath') end
      order by e.at desc,e.id desc)
    from (
      (select x.id,x.created_at as at,x.id as post_id,null::uuid as actor from feed_data.member_follows f
        join public.profiles a on a.user_id=f.target_id
        cross join lateral (select v.id,v.created_at from feed_data.posts v where v.author_id=f.target_id
          and v.organization_id is null and v.community_id is null and v.status='published' and v.deleted_at is null
          and v.visibility in ('public','members_only') and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select x.id,x.created_at,x.id,null::uuid from feed_data.institution_follows f
        join private.organizations o on o.id=f.organization_id and feed_data.followable_institution(o)
        cross join lateral (select v.id,v.created_at from feed_data.posts v where v.organization_id=o.id
          and v.community_id is null and v.status='published' and v.deleted_at is null and v.visibility='public'
          and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id)
          and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select r.id,r.created_at,r.post_id,r.actor_id from feed_data.member_follows f join public.profiles a on a.user_id=f.target_id
        cross join lateral (select r1.* from feed_data.reposts r1 join feed_data.posts v on v.id=r1.post_id
          where r1.actor_id=f.target_id and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id)
          and (v.organization_id is null or not exists(select from feed_data.institution_follows o
            where o.follower_id=auth.uid() and o.organization_id=v.organization_id and not o.show_reposts))
          and (p_before_at is null or (r1.created_at,r1.id)<(p_before_at,p_before_id))
          order by r1.created_at desc,r1.id desc limit p_limit+1) r
        where f.follower_id=auth.uid() and f.show_reposts and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        order by r.created_at desc,r.id desc limit p_limit+1)
      order by at desc,id desc limit p_limit+1
    ) e join feed_data.posts p on p.id=e.post_id
  ),'[]');
end;
$$;


create function public.read_social_feed_for_client(p_scope text,p_tag text,p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('saved','hashtag') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
    or (p_scope='hashtag' and not coalesce(p_tag ~ '^[[:alnum:]_]{1,48}$',false))
    then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='saved' then
    return coalesce((select jsonb_agg(
      (case when feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        then feed_data.f21_card(p) else jsonb_build_object('id',b.post_id,'unavailable',true,'createdAt',b.created_at,'body','','language','en',
          'visibility','private','status','removed','publishedAt',null,'editedAt',null,'version',1,'own',false,'author',null) end)
      || jsonb_build_object('timelineId',b.id,'timelineAt',b.created_at) order by b.created_at desc,b.id desc)
      from (select * from feed_data.bookmarks where actor_id=auth.uid()
        and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id))
        order by created_at desc,id desc limit p_limit+1) b join feed_data.posts p on p.id=b.post_id),'[]');
  end if;
  return coalesce((select jsonb_agg(feed_data.f21_card(p) order by page.occurred_at desc,page.post_id desc)
    from (select t.post_id,t.occurred_at from feed_data.post_hashtags t join feed_data.posts candidate on candidate.id=t.post_id
      where t.tag=normalize(lower(p_tag)) and feed_data.discussion_visible(candidate)
        and feed_data.f21_org_visible(candidate.organization_id) and feed_data.viewer_unmuted(candidate.author_id)
        and (p_before_at is null or (t.occurred_at,t.post_id)<(p_before_at,p_before_id))
      order by t.occurred_at desc,t.post_id desc limit p_limit+1) page join feed_data.posts p on p.id=page.post_id),'[]');
end;
$$;

create function public.search_hashtags_for_client(p_prefix text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(tag order by tag),'[]') from (
    select distinct tag from (select t.tag,p.id,p.author_id from feed_data.post_hashtags t
      join feed_data.posts p on p.id=t.post_id
      where feed_data.member_allowed() and p_prefix ~ '^[[:alnum:]_]{1,48}$'
        and t.tag like replace(normalize(lower(p_prefix)),'_','!_')||'%' escape '!'
        and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        and feed_data.viewer_unmuted(p.author_id)
      order by t.tag,t.occurred_at desc limit 120) sample
    order by tag limit 12
  ) result
$$;
create index f21_tag_prefix on feed_data.post_hashtags(tag text_pattern_ops);

alter table feed_data.notification_preferences
  add column mentions boolean not null default true,
  add column reposts boolean not null default true,
  add column quotes boolean not null default true;

create function feed_data.f21_notice(p_recipient uuid,p_actor uuid,p_kind text,p_post uuid,p_comment uuid)
returns void language plpgsql set search_path='' as $$
declare enabled boolean;
begin
  if p_recipient is null or p_recipient=p_actor or auth.uid() is distinct from p_actor
    or not feed_data.author_active(p_recipient) or not feed_data.author_active(p_actor)
    or feed_data.blocked_pair(p_recipient,p_actor)
    or exists(select from feed_data.member_mutes where actor_id=p_recipient and target_id=p_actor)
    then return; end if;
  select case p_kind when 'post_mention' then mentions when 'post_repost' then reposts when 'post_quote' then quotes else false end
    into enabled from feed_data.notification_preferences where user_id=p_recipient;
  if enabled is false then return; end if;
  insert into feed_data.notifications(recipient_id,actor_id,kind,post_id,comment_id,dedupe)
    values(p_recipient,p_actor,p_kind,p_post,p_comment,p_kind||':'||p_actor::text||':'||coalesce(p_comment,p_post)::text)
    on conflict(recipient_id,dedupe) do nothing;
  if found then
    delete from feed_data.notifications where id in (
      select id from feed_data.notifications where created_at<now()-interval '30 days'
      order by created_at,id limit 32 for update skip locked
    );
  end if;
end;
$$;

create function feed_data.f21_index_content()
returns trigger language plpgsql security definer set search_path='' as $$
declare post feed_data.posts; comment_ref uuid; actor uuid; entry record; subject uuid; org uuid;
begin
  if tg_table_name='posts' then
    post:=new;
    actor:=new.author_id;
    delete from feed_data.post_hashtags where post_id=post.id;
    if post.status='published' and post.deleted_at is null then
      insert into feed_data.post_hashtags(post_id,tag,occurred_at)
        select post.id,t.tag,post.created_at from (
          select distinct normalize(lower(m[2])) as tag
          from regexp_matches(normalize(new.body),'(^|[^[:alnum:]_#])#([[:alnum:]_]{1,48})(?![[:alnum:]_])','g') m
          order by tag limit 12) t on conflict do nothing;
    end if;
  else
    select * into post from feed_data.posts where id=new.post_id;
    comment_ref:=new.id;
    actor:=new.author_id;
  end if;

  -- Keep a token's immutable account binding until it is intentionally removed.
  delete from feed_data.social_mentions where post_id=post.id and comment_id is not distinct from comment_ref
    and token not in (select lower(m[2]) from regexp_matches(new.body,
      '(^|[^[:alnum:]_@.])@((?:org:)?[a-zA-Z][a-zA-Z0-9_-]{2,39})(?![[:alnum:]_-])','g') m);
  if actor is distinct from auth.uid() or new.status<>'published' or new.deleted_at is not null then return new; end if;
  for entry in select distinct lower(m[2]) as token from regexp_matches(new.body,
    '(^|[^[:alnum:]_@.])@((?:org:)?[a-zA-Z][a-zA-Z0-9_-]{2,39})(?![[:alnum:]_-])','g') m order by token limit 8 loop
    subject:=null; org:=null;
    if entry.token not like 'org:%' then
      select p.user_id into subject from public.profiles p where p.username=entry.token and feed_data.followable_member(p);
    end if;
    if subject is null then
      select o.id into org from private.organizations o
        where o.handle=regexp_replace(entry.token,'^org:','') and feed_data.followable_institution(o);
    end if;
    insert into feed_data.social_mentions(post_id,comment_id,token,member_id,organization_id)
      values(post.id,comment_ref,entry.token,subject,org) on conflict do nothing;
    if found and subject is not null and feed_data.discussion_visible(post)
      and private.member_onboarding_access(subject)
      and (feed_data.community_member(post.community_id,subject) or feed_data.public_group_post(post.community_id,post.created_at)) then
      perform feed_data.f21_notice(subject,actor,'post_mention',post.id,comment_ref);
    end if;
  end loop;
  return new;
end;
$$;
create trigger f21_index_post after insert or update of body,visibility,status,deleted_at on feed_data.posts
  for each row execute function feed_data.f21_index_content();
create trigger f21_index_comment after insert or update of body,status,deleted_at on feed_data.comments
  for each row execute function feed_data.f21_index_content();

create function public.social_comment_mentions_for_client(p_post uuid,p_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(c.id::text,feed_data.f21_mention_links(p_post,c.id)),'{}')
  from feed_data.comments c join feed_data.posts p on p.id=c.post_id
  where c.post_id=p_post and c.id=any(p_ids) and cardinality(p_ids) between 1 and 30
    and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
    and feed_data.comment_visible(c)
    and (c.parent_id is null or exists(select from feed_data.comments parent where parent.id=c.parent_id and feed_data.comment_visible(parent)))
$$;

alter table feed_data.notifications drop constraint notifications_kind_check,
add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved','project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote'));

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='poll_event' then private.poll_notice_visible(n.poll_event_id,n.recipient_id)
    when n.kind='project_operation' then private.project_operation_notice_visible(n.project_operation_event_id,n.recipient_id)
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
    when n.kind='organization_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_role_audit a where a.id=n.organization_role_event_id and a.subject_id=n.recipient_id)
    when n.kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected') then
      feed_data.author_active(n.recipient_id) and exists(select 1 from private.project_events e
        join private.community_projects p on p.id=e.project_id where e.id=n.project_event_id and e.recipient_id=n.recipient_id
          and (case when e.action='assign' then p.status='under_review' and p.reviewer_id=n.recipient_id
            and private.project_reviewer(p,n.recipient_id)
            else private.project_owner_access(p,n.recipient_id,'submit') or private.project_owner_access(p,n.recipient_id,'view_private') end))
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind in ('post_mention','post_repost','post_quote') then
      not exists(select from feed_data.member_mutes where actor_id=n.recipient_id and target_id=n.actor_id)
      and exists(select from feed_data.posts p where p.id=n.post_id
        and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        and case n.kind
          when 'post_mention' then exists(select from feed_data.social_mentions m
            where m.post_id=p.id and m.comment_id is not distinct from n.comment_id and m.member_id=n.recipient_id)
            and (n.comment_id is null or exists(select from feed_data.comments c where c.id=n.comment_id
              and feed_data.comment_visible(c) and (c.parent_id is null or exists(select from feed_data.comments parent
                where parent.id=c.parent_id and feed_data.comment_visible(parent)))))
          when 'post_repost' then feed_data.f21_shareable(p) and exists(select from feed_data.reposts r
            where r.post_id=p.id and r.actor_id=n.actor_id)
          else exists(select from feed_data.post_quotes q join feed_data.posts source on source.id=q.source_id
            where q.post_id=p.id and source.author_id=n.recipient_id and feed_data.f21_shareable(source))
        end)
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

create function public.social_notification_preferences_for_client(p_mentions boolean,p_reposts boolean,p_quotes boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefs feed_data.notification_preferences;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if num_nonnulls(p_mentions,p_reposts,p_quotes) not in (0,3) then raise exception 'invalid preferences' using errcode='22023'; end if;
  if p_mentions is not null then
    perform feed_data.consume_limit(auth.uid(),'notification_write',40);
    insert into feed_data.notification_preferences(user_id,mentions,reposts,quotes) values(auth.uid(),p_mentions,p_reposts,p_quotes)
      on conflict(user_id) do update set mentions=excluded.mentions,reposts=excluded.reposts,quotes=excluded.quotes,
        updated_at=clock_timestamp();
  end if;
  select * into prefs from feed_data.notification_preferences where user_id=auth.uid();
  return jsonb_build_object('mentions',coalesce(prefs.mentions,true),'reposts',coalesce(prefs.reposts,true),'quotes',coalesce(prefs.quotes,true));
end;
$$;

insert into feed_data.post_hashtags(post_id,tag,occurred_at)
select p.id,t.tag,p.created_at from feed_data.posts p
cross join lateral (select distinct normalize(lower(m[2])) as tag
  from regexp_matches(normalize(p.body),'(^|[^[:alnum:]_#])#([[:alnum:]_]{1,48})(?![[:alnum:]_])','g') m order by tag limit 12) t
where p.status='published' and p.deleted_at is null on conflict do nothing;

revoke all on function feed_data.f21_shareable(feed_data.posts),feed_data.f21_card(feed_data.posts),
  feed_data.f21_post_info(feed_data.posts),feed_data.f21_mention_links(uuid,uuid),feed_data.f21_notice(uuid,uuid,text,uuid,uuid),
  feed_data.f21_index_content(),public.social_post_info_for_client(uuid[]),public.social_interaction_for_client(uuid,text,boolean),
  public.create_social_post_for_client(uuid,text,text,text,uuid),public.follow_reposts_for_client(text,text,boolean),
  public.read_social_feed_for_client(text,text,integer,timestamptz,uuid),public.search_hashtags_for_client(text),
  public.social_comment_mentions_for_client(uuid,uuid[]),public.social_notification_preferences_for_client(boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.social_post_info_for_client(uuid[]),public.social_comment_mentions_for_client(uuid,uuid[]) to anon,authenticated;
grant execute on function public.social_interaction_for_client(uuid,text,boolean),public.create_social_post_for_client(uuid,text,text,text,uuid),
  public.follow_reposts_for_client(text,text,boolean),public.read_social_feed_for_client(text,text,integer,timestamptz,uuid),
  public.search_hashtags_for_client(text),public.social_notification_preferences_for_client(boolean,boolean,boolean) to authenticated;


create function feed_data.f21_organization_edit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.organization_id is not null and new.body is distinct from old.body and (
    auth.uid() is distinct from old.author_id or coalesce(private.institution_role(auth.uid(),old.organization_id),'')
      not in ('owner','administrator','editor'))
    then raise exception 'organization publishing authority required' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger f21_organization_edit before update of body on feed_data.posts
  for each row execute function feed_data.f21_organization_edit();
revoke all on function feed_data.f21_organization_edit() from public,anon,authenticated,service_role;

-- Rank bounded candidates using public graph signals and the viewer's own preferences.
create or replace function public.discovery_suggestions_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((
    with neighbors as materialized (
      select f.target_id from feed_data.member_follows f join public.profiles p on p.user_id=f.target_id
        where f.follower_id=actor and feed_data.followable_member(p) and feed_data.viewer_unmuted(p.user_id)
        order by f.created_at desc limit 20
    ), candidates as materialized (
      (select p.user_id from public.profiles p where p.username is not null and p.user_id<>actor
        and feed_data.followable_member(p) order by p.username limit 160)
      union
      (select c.target_id from neighbors n cross join lateral (
        select f.target_id from feed_data.member_follows f where f.follower_id=n.target_id order by f.target_id limit 12
      ) c)
      union
      (select candidate.user_id from (select community_id from feed_data.community_memberships
        where user_id=actor order by joined_at desc limit 12) mine
        cross join lateral (select m.user_id from feed_data.community_memberships m
          where m.community_id=mine.community_id and m.directory_visible order by m.user_id limit 12) candidate)
    ), ranked as (
      select p as member,p.username,
        case when exists(select from feed_data.member_follows f where f.target_id=actor and f.follower_id=p.user_id) then 3 else 0 end
      + case when exists(select from neighbors n join feed_data.member_follows f on f.follower_id=n.target_id
        where f.target_id=p.user_id) then 3 else 0 end
      + case when exists(select from feed_data.community_memberships mine join feed_data.community_memberships their
          using(community_id) where mine.user_id=actor and their.user_id=p.user_id and their.directory_visible) then 2 else 0 end
      + case when exists(select from public.member_interests mine join public.member_interests their using(interest_code)
          join public.user_settings preferences on preferences.user_id=their.user_id
          where mine.user_id=actor and their.user_id=p.user_id and preferences.show_interests
            and private.member_experience_flag('displayInterests')) then 1 else 0 end as score
      from candidates c join public.profiles p using(user_id)
      where p.user_id<>actor and feed_data.followable_member(p) and feed_data.viewer_unmuted(p.user_id)
        and not exists(select from feed_data.member_follows f where f.follower_id=actor and f.target_id=p.user_id)
      order by score desc,p.username limit 3
    ) select jsonb_agg(feed_data.member_card(r.member) order by r.score desc,r.username) from ranked r
  ),'[]') || coalesce((select jsonb_agg(feed_data.institution_card(o) order by o.handle) from (
    select candidate.* from unnest(array['haitian_organization','international_organization','ngo','nonprofit','foundation',
      'business','education','media','municipality','ministry','embassy','government_agency']) kind(name)
      cross join lateral (
        select x.* from private.organizations x where x.kind=kind.name and feed_data.followable_institution(x)
          and not exists(select from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=x.id)
        order by x.handle limit 1
      ) candidate
    order by candidate.handle limit 3
  ) o),'[]');
end;
$$;
