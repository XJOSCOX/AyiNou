create table feed_data.member_blocks (
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,target_id),
  check(actor_id<>target_id)
);
create index member_blocks_target on feed_data.member_blocks(target_id,actor_id);
create table feed_data.member_mutes (like feed_data.member_blocks including defaults including constraints including indexes);
alter table feed_data.member_mutes
  add foreign key(actor_id) references auth.users(id) on delete cascade,
  add foreign key(target_id) references public.profiles(user_id) on delete cascade;
create index member_mutes_target on feed_data.member_mutes(target_id);
alter table feed_data.member_blocks enable row level security;
alter table feed_data.member_mutes enable row level security;
revoke all on feed_data.member_blocks,feed_data.member_mutes from public,anon,authenticated,service_role;

create function feed_data.blocked_pair(p_actor uuid,p_target uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from feed_data.member_blocks where actor_id=p_actor and target_id=p_target)
      or exists(select 1 from feed_data.member_blocks where actor_id=p_target and target_id=p_actor);
$$;
create function feed_data.viewer_can_interact(p_target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not feed_data.blocked_pair(auth.uid(),p_target);
$$;
create function feed_data.viewer_unmuted(p_target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from feed_data.member_mutes where actor_id=auth.uid() and target_id=p_target);
$$;
create function feed_data.lock_member_pair(p_actor uuid,p_target uuid)
returns void language plpgsql set search_path='' as $$
begin
  if p_actor is not null and p_target is not null and p_actor<>p_target then
    perform pg_advisory_xact_lock(hashtextextended('member-safety:'||least(p_actor,p_target)::text||':'||greatest(p_actor,p_target)::text,0));
  end if;
end;
$$;
revoke all on function feed_data.blocked_pair(uuid,uuid),feed_data.viewer_can_interact(uuid),
  feed_data.viewer_unmuted(uuid),feed_data.lock_member_pair(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function feed_data.viewer_can_interact(uuid),feed_data.viewer_unmuted(uuid) to authenticated,anon;

create policy feed_block_boundary on feed_data.posts as restrictive for select to authenticated
  using (feed_data.viewer_can_interact(author_id));
create policy profile_block_boundary on public.profiles as restrictive for select to authenticated
  using (feed_data.viewer_can_interact(user_id));

create or replace function feed_data.followable_member(p public.profiles)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.is_visible and p.username is not null and p.display_name is not null
    and private.member_discoverable(p.user_id) and feed_data.author_active(p.user_id)
    and feed_data.viewer_can_interact(p.user_id),false);
$$;

create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id)
    and case when auth.uid() is null then p.visibility='public'
      else p.visibility in ('public','members_only') and feed_data.member_allowed() end,false);
$$;

create or replace function feed_data.comment_visible(c feed_data.comments)
returns boolean language sql stable set search_path='' as $$
  select coalesce(c.status='published' and c.deleted_at is null and feed_data.author_active(c.author_id)
    and feed_data.viewer_can_interact(c.author_id),false);
$$;

-- Use the same pair lock for relationship changes and new interactions.
create function feed_data.guard_blocked_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; post_author uuid; comment_author uuid; root_author uuid; target uuid;
begin
  if tg_table_name='member_follows' then
    actor:=new.follower_id;
    post_author:=new.target_id;
  elsif tg_table_name='comments' then
    actor:=new.author_id;
    select author_id into post_author from feed_data.posts where id=new.post_id;
    select author_id into root_author from feed_data.comments where id=new.parent_id;
  elsif tg_table_name='post_reactions' then
    actor:=new.user_id;
    select author_id into post_author from feed_data.posts where id=new.post_id;
  else
    actor:=new.user_id;
    select p.author_id,c.author_id,r.author_id into post_author,comment_author,root_author
      from feed_data.comments c join feed_data.posts p on p.id=c.post_id
      left join feed_data.comments r on r.id=c.parent_id where c.id=new.comment_id;
  end if;
  for target in select distinct id from unnest(array[post_author,comment_author,root_author]) ids(id)
    where id is not null and id<>actor order by id
  loop
    perform feed_data.lock_member_pair(actor,target);
    if feed_data.blocked_pair(actor,target) then raise exception 'interaction unavailable' using errcode='PFR04'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function feed_data.guard_blocked_write() from public,anon,authenticated,service_role;
create trigger safety_follow before insert on feed_data.member_follows for each row execute function feed_data.guard_blocked_write();
create trigger safety_comment before insert on feed_data.comments for each row execute function feed_data.guard_blocked_write();
create trigger safety_post_reaction before insert or update on feed_data.post_reactions for each row execute function feed_data.guard_blocked_write();
create trigger safety_comment_reaction before insert or update on feed_data.comment_reactions for each row execute function feed_data.guard_blocked_write();

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review'));

create function public.save_member_safety_for_client(p_kind text,p_enabled boolean,p_username text,p_target uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; existing boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('block','mute') or p_enabled is null
    or (p_enabled and (p_username is null or p_target is not null))
    or (not p_enabled and ((p_username is null)=(p_target is null)))
  then raise exception 'invalid target' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'safety_write',20);
  if p_enabled then
    select p.user_id into target from public.profiles p where p.username=p_username
      and (feed_data.followable_member(p)
        or (p_kind='block' and exists(select 1 from feed_data.member_blocks b where b.actor_id=actor and b.target_id=p.user_id))
        or (p_kind='mute' and exists(select 1 from feed_data.member_mutes m where m.actor_id=actor and m.target_id=p.user_id)));
    if target is null then raise exception 'account unavailable' using errcode='PFR04'; end if;
    if target=actor then raise exception 'own account' using errcode='PSF01'; end if;
  else
    select p.user_id into target from public.profiles p where p.user_id=p_target or p.username=p_username;
    if target is null then return false; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('member-safety-owner:'||actor::text,0));
  perform feed_data.lock_member_pair(actor,target);
  if p_kind='block' then
    if p_enabled then
      select exists(select 1 from feed_data.member_blocks where actor_id=actor and target_id=target) into existing;
      if not existing and feed_data.blocked_pair(actor,target) then raise exception 'account unavailable' using errcode='PFR04'; end if;
      if not existing and (select count(*) from feed_data.member_blocks where actor_id=actor)>=1000
      then raise exception 'relationship limit' using errcode='PSF12'; end if;
      insert into feed_data.member_blocks(actor_id,target_id) values(actor,target) on conflict do nothing;
      delete from feed_data.member_follows where (follower_id=actor and target_id=target) or (follower_id=target and target_id=actor);
    else delete from feed_data.member_blocks where actor_id=actor and target_id=target; end if;
  elsif p_enabled then
    if feed_data.blocked_pair(actor,target) then raise exception 'account unavailable' using errcode='PFR04'; end if;
    if not exists(select 1 from feed_data.member_mutes where actor_id=actor and target_id=target)
      and (select count(*) from feed_data.member_mutes where actor_id=actor)>=1000
    then raise exception 'relationship limit' using errcode='PSF12'; end if;
    insert into feed_data.member_mutes(actor_id,target_id) values(actor,target) on conflict do nothing;
  else delete from feed_data.member_mutes where actor_id=actor and target_id=target; end if;
  return p_enabled;
end;
$$;

create function public.list_member_safety_for_client(p_kind text,p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('block','mute') or p_limit is null or p_limit not between 1 and 30
  then raise exception 'invalid list' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.target_id,'createdAt',e.created_at,
    'name',case when p.is_visible and private.member_discoverable(p.user_id) and feed_data.author_active(p.user_id) then p.display_name end,
    'username',case when p.is_visible and private.member_discoverable(p.user_id) and feed_data.author_active(p.user_id) then p.username end)
    order by e.target_id) from (
      select target_id,created_at from feed_data.member_blocks where actor_id=auth.uid() and p_kind='block'
        and (p_after is null or target_id>p_after)
      union all
      select target_id,created_at from feed_data.member_mutes where actor_id=auth.uid() and p_kind='mute'
        and (p_after is null or target_id>p_after)
      order by target_id limit p_limit+1
    ) e join public.profiles p on p.user_id=e.target_id),'[]'::jsonb);
end;
$$;

create function public.member_mute_status_for_client(p_username text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return exists(select 1 from feed_data.member_mutes m join public.profiles p on p.user_id=m.target_id
    where m.actor_id=auth.uid() and p.username=p_username);
end;
$$;
create function public.find_member_profile_for_client(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.display_name,p.username,p.biography,p.avatar_asset,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where p.username=p_username and feed_data.member_allowed() and feed_data.followable_member(p);
$$;
revoke all on function public.save_member_safety_for_client(text,boolean,text,uuid),
  public.list_member_safety_for_client(text,uuid,integer),public.member_mute_status_for_client(text),
  public.find_member_profile_for_client(text) from public,anon,authenticated,service_role;
grant execute on function public.save_member_safety_for_client(text,boolean,text,uuid),
  public.list_member_safety_for_client(text,uuid,integer),public.member_mute_status_for_client(text),
  public.find_member_profile_for_client(text) to authenticated;

-- Filter before pagination and recheck existing recommendation snapshots at read time.
create or replace function public.read_feed_for_client(p_scope text,p_limit integer,p_before_at timestamptz,p_before_id uuid,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('feed','mine') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='mine' and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_id is not null or p_scope<>'feed' or feed_data.viewer_unmuted(x.author_id))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;

create or replace function public.read_following_feed_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',false,'author',feed_data.author_projection(p.author_id)
  ) order by p.created_at desc,p.id desc) from (
    select x.* from feed_data.member_follows f join public.profiles a on a.user_id=f.target_id
      cross join lateral (
        select candidate.* from feed_data.posts candidate where candidate.author_id=f.target_id
          and candidate.status='published' and candidate.deleted_at is null and candidate.visibility in ('public','members_only')
          and (p_before_at is null or (candidate.created_at,candidate.id)<(p_before_at,p_before_id))
        order by candidate.created_at desc,candidate.id desc limit p_limit+1
      ) x
    where f.follower_id=auth.uid() and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;

create or replace function feed_data.rank_recommendations(p_actor uuid,p_at timestamptz,p_weights feed_data.recommendation_versions)
returns table(post_id uuid,reason text)
language sql stable set search_path = '' set jit = off as $$
  with pool as materialized (
    select p.id,p.author_id,p.published_at,p.language
    from feed_data.posts p
    where p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
      and p.published_at between p_at-interval '30 days' and p_at and p.author_id<>p_actor
    order by p.published_at desc,p.id desc limit 420
  ), eligible_authors as materialized (
    select candidate.author_id
    from (select distinct author_id from pool) candidate join public.profiles author on author.user_id=candidate.author_id
    where feed_data.followable_member(author) and feed_data.viewer_unmuted(author.user_id)
  ), eligible as materialized (
    select p.*,coalesce(f.action='less_author',false) as less, mf.target_id is not null as followed
    from pool p join eligible_authors author on author.author_id=p.author_id
    left join feed_data.member_follows mf on mf.follower_id=p_actor and mf.target_id=p.author_id
    left join feed_data.recommendation_feedback f on f.user_id=p_actor and f.author_id=p.author_id
    where f.action is distinct from 'hide_author'
      and not exists(select 1 from feed_data.recommendation_feedback x where x.user_id=p_actor and x.post_id=p.id)
  ), signals as materialized (
    select p.*, topics.matches,topics.diversity_topic,
      p.language=(select preferred_locale from public.profiles where user_id=p_actor) as same_language,
      greatest(0,p_weights.freshness_max-floor(extract(epoch from p_at-p.published_at)/43200)::integer) as fresh
    from eligible p
    cross join lateral (
      select least(2,count(i.interest_code))::integer as matches,
        coalesce(min(t.topic_code) filter(where i.interest_code is not null),min(t.topic_code)) as diversity_topic
      from feed_data.post_topics t left join public.member_interests i on i.user_id=p_actor and i.interest_code=t.topic_code
      where t.post_id=p.id
    ) topics
  ), reaction_samples as materialized (
    select p.id as post_id,r.user_id
    from signals p cross join lateral (
      select x.user_id from feed_data.post_reactions x where x.post_id=p.id order by x.user_id limit 12
    ) r
    where (p.matches>0 or p.followed) and r.user_id not in (p_actor,p.author_id)
  ), eligible_reactors as materialized (
    select sampled.user_id from (select distinct user_id from reaction_samples) sampled
    join auth.users u on u.id=sampled.user_id join public.profiles p on p.user_id=sampled.user_id
    where u.created_at<=p_at-interval '7 days' and feed_data.followable_member(p)
  ), engagement as (
    select r.post_id,least(3,count(*))::integer as points from reaction_samples r
    join eligible_reactors e using(user_id) group by r.post_id
  ), scored as (
    select s.*, matches*p_weights.topic_weight + case when followed then p_weights.follow_weight else 0 end
      + case when same_language then p_weights.language_weight else 0 end + fresh
      + coalesce(e.points,0)*p_weights.reaction_weight
      - case when less then p_weights.less_penalty else 0 end as score,
      case when matches>0 and (not followed or matches*p_weights.topic_weight>=p_weights.follow_weight) then 'topic'
        when followed then 'follow' when same_language and fresh<p_weights.language_weight then 'language'
        else 'recent' end as explanation
    from signals s left join engagement e on e.post_id=s.id
  ), authors as (
    select s.*,row_number() over (partition by author_id order by score desc,published_at desc,id desc) as author_slot
    from scored s
  ), diversity as (
    select a.*,row_number() over (partition by diversity_topic order by score desc,published_at desc,id desc) as topic_slot
    from authors a where author_slot<=2
  )
  select id,explanation from diversity
  order by score-(author_slot-1)*p_weights.repeat_penalty
    - case when diversity_topic is not null then least(12,(topic_slot-1)*2) else 0 end desc,
    published_at desc,id desc
  limit 80;
$$;

create or replace function public.read_for_you_for_client(p_snapshot uuid,p_after integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  current_time_at timestamptz:=clock_timestamp();
  state feed_data.recommendation_snapshots;
  weights feed_data.recommendation_versions;
  posts uuid[];
  reasons text[];
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or p_after is null or p_after not between 0 and 80
    or (p_snapshot is null and p_after<>0)
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_snapshot is null then
    perform feed_data.consume_limit(actor,'recommendation_build',10);
    select * into strict weights from feed_data.recommendation_versions where version='v1';
    -- Ordinality fixes the exact ranked order in the stored snapshot.
    select coalesce(array_agg(r.post_id order by r.position),'{}'),coalesce(array_agg(r.reason order by r.position),'{}')
      into posts,reasons from feed_data.rank_recommendations(actor,current_time_at,weights) with ordinality r(post_id,reason,position);
    delete from feed_data.recommendation_snapshots where id in (
      select id from feed_data.recommendation_snapshots where expires_at<=current_time_at
      order by expires_at limit 80 for update skip locked
    );
    delete from feed_data.recommendation_snapshots where id in (
      select id from feed_data.recommendation_snapshots where user_id=actor order by created_at desc,id desc offset 2
    );
    insert into feed_data.recommendation_snapshots(user_id,version,created_at,expires_at,post_ids,reasons)
      values(actor,weights.version,current_time_at,current_time_at+interval '10 minutes',posts,reasons) returning * into state;
  else
    select * into state from feed_data.recommendation_snapshots where id=p_snapshot and user_id=actor and expires_at>current_time_at;
    if not found then raise exception 'ranking expired' using errcode='PFD30'; end if;
  end if;

  return jsonb_build_object('snapshotId',state.id,'algorithmVersion',state.version,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
      'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
      'author',feed_data.author_projection(p.author_id),'own',false,'recommendationReason',p.reason,'rankPosition',p.position)
      order by p.position)
    from (
      select p.*,r.position,state.reasons[r.position::integer] as reason
      from unnest(state.post_ids) with ordinality r(post_id,position)
      join feed_data.posts p on p.id=r.post_id join public.profiles a on a.user_id=p.author_id
      where r.position>p_after and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
        and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;

create or replace function public.discovery_suggestions_for_client()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
    select x.* from public.profiles x where x.username is not null and x.user_id<>auth.uid() and feed_data.followable_member(x) and feed_data.viewer_unmuted(x.user_id)
      and not exists(select 1 from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=x.user_id)
    order by x.username limit 3
  ) p),'[]'::jsonb) || coalesce((select jsonb_agg(feed_data.institution_card(o) order by o.handle) from (
    select candidate.* from unnest(array['haitian_organization','international_organization','ngo','nonprofit','foundation',
      'business','education','media','municipality','ministry','embassy','government_agency']) kind(name)
      cross join lateral (
        select x.* from private.organizations x where x.kind=kind.name and x.status='active' and x.verification_status<>'revoked'
          and not exists(select 1 from feed_data.institution_follows f where f.follower_id=auth.uid() and f.organization_id=x.id)
        order by x.handle limit 1
      ) candidate
    order by candidate.handle limit 3
  ) o),'[]'::jsonb);
end;
$$;

create or replace function feed_data.reaction_summary(p_target uuid,p_comment boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('counts',jsonb_build_object('like',count(*) filter(where kind='like'),
    'love',count(*) filter(where kind='love'),'support',count(*) filter(where kind='support'),
    'celebrate',count(*) filter(where kind='celebrate')), 'mine',max(kind) filter(where user_id=auth.uid()))
  from (
    select kind,user_id from feed_data.comment_reactions where p_comment and comment_id=p_target
    union all
    select kind,user_id from feed_data.post_reactions where not p_comment and post_id=p_target
  ) r where feed_data.viewer_can_interact(r.user_id);
$$;

create or replace function public.report_post_for_client(p_id uuid,p_category text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select author_id into target from feed_data.posts
    where id=p_id and status='published' and feed_data.viewer_can_interact(author_id) and visibility in ('public','members_only')
      and deleted_at is null and feed_data.author_active(author_id) for share;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if target=actor then raise exception 'own post' using errcode='42501'; end if;
  perform feed_data.consume_limit(actor,'report',5);
  insert into feed_data.content_reports(post_id,reporter_id,category,note) values(p_id,actor,p_category,nullif(btrim(p_note),''));
end;
$$;

create or replace function feed_data.emit_notification(p_recipient uuid,p_actor uuid,p_kind text,p_post uuid,p_comment uuid)
returns void language plpgsql set search_path='' as $$
declare enabled boolean;
begin
  if p_recipient is null or p_recipient=p_actor or auth.uid() is distinct from p_actor
    or feed_data.blocked_pair(p_recipient,p_actor)
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

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
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
