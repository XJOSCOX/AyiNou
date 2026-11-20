create table feed_data.community_recommendation_versions (
  version text primary key,
  interest_weight smallint not null check(interest_weight between 0 and 100),
  joined_topic_weight smallint not null check(joined_topic_weight between 0 and 100),
  activity_weight smallint not null check(activity_weight between 0 and 20),
  category_penalty smallint not null check(category_penalty between 1 and 100)
);
insert into feed_data.community_recommendation_versions values ('v1',30,12,4,10);

create table feed_data.community_recommendation_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  action text not null check(action in ('not_interested','hide')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,community_id)
);
create index community_recommendation_feedback_expiry on feed_data.community_recommendation_feedback(updated_at)
  where action='not_interested';
create index community_recommendation_feedback_group on feed_data.community_recommendation_feedback(community_id);

create table feed_data.community_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null references feed_data.community_recommendation_versions(version),
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>created_at),
  filters jsonb not null,
  community_ids uuid[] not null check(cardinality(community_ids)<=60),
  reasons text[] not null check(cardinality(reasons)=cardinality(community_ids))
);
create index community_recommendation_snapshots_user on feed_data.community_recommendation_snapshots(user_id,created_at desc,id desc);
create index community_recommendation_snapshots_expiry on feed_data.community_recommendation_snapshots(expires_at);

alter table feed_data.community_recommendation_versions enable row level security;
alter table feed_data.community_recommendation_feedback enable row level security;
alter table feed_data.community_recommendation_snapshots enable row level security;
revoke all on feed_data.community_recommendation_versions,feed_data.community_recommendation_feedback,
  feed_data.community_recommendation_snapshots from public,anon,authenticated,service_role;

create index communities_recommendation_kind on feed_data.communities(kind,created_at desc,id)
  where policy<>'private';
create index communities_recommendation_topic on feed_data.communities(topic,created_at desc,id)
  where kind='interest' and policy<>'private';
create index communities_recommendation_country on feed_data.communities(country_code,created_at desc,id)
  where kind='diaspora' and policy<>'private';
create index group_own_pending_requests on feed_data.group_requests(user_id,community_id) where status='pending';

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff','group_manage','group_response','community_rec_build','community_rec_write'));

create function feed_data.community_discoverable(c feed_data.communities,p_viewer uuid)
returns boolean language sql stable set search_path='' as $$
  select c.kind='department' or (c.policy<>'private' and c.owner_id is not null
    and feed_data.author_active(c.owner_id) and not feed_data.blocked_pair(p_viewer,c.owner_id));
$$;

create function feed_data.community_suggestion_eligible(c feed_data.communities,p_actor uuid,p_at timestamptz)
returns boolean language sql stable set search_path='' as $$
  select feed_data.community_discoverable(c,p_actor)
    and c.owner_id is distinct from p_actor and not feed_data.community_member(c.id,p_actor)
    and not exists(select 1 from feed_data.group_removals r where r.community_id=c.id and r.user_id=p_actor)
    and not exists(select 1 from feed_data.group_requests r where r.community_id=c.id and r.user_id=p_actor
      and r.status in ('pending','rejected') and c.policy='approval')
    and not exists(select 1 from feed_data.community_recommendation_feedback f where f.community_id=c.id
      and f.user_id=p_actor and (f.action='hide' or f.updated_at>p_at-interval '30 days'));
$$;

create function feed_data.community_has_public_activity(c feed_data.communities,p_at timestamptz)
returns boolean language sql stable set search_path='' as $$
  select c.kind<>'department' and c.policy='public' and c.public_since is not null and exists(
    select 1 from (
      select p.author_id from feed_data.posts p where p.community_id=c.id and p.status='published' and p.deleted_at is null
        and p.created_at>=greatest(c.public_since,p_at-interval '14 days') and p.created_at<=p_at
      order by p.created_at desc,p.id desc limit 8
    ) recent where feed_data.author_active(recent.author_id) and feed_data.viewer_can_interact(recent.author_id)
      and feed_data.viewer_unmuted(recent.author_id));
$$;

create function feed_data.rank_communities(p_actor uuid,p_at timestamptz,w feed_data.community_recommendation_versions,
  p_kind text,p_topic text,p_country text,p_search text)
returns table(community_id uuid, reason text) language sql stable set search_path='' set jit=off as $$
  with selected_topics as materialized (
    select interest_code as code from public.member_interests where user_id=p_actor
  ), joined_topics as materialized (
    select distinct c.topic as code from feed_data.community_memberships m join feed_data.communities c on c.id=m.community_id
      where m.user_id=p_actor and c.topic is not null and feed_data.community_discoverable(c,p_actor)
  ), pools as (
    select c.id,c.kind,c.topic,c.created_at from (values('department'),('diaspora'),('interest')) k(kind)
    cross join lateral (
      select c.* from feed_data.communities c left join public.departments d on d.code=c.department_code
      where c.kind=k.kind and c.policy<>'private' and (p_kind is null or c.kind=p_kind)
        and (p_topic is null or c.topic=p_topic) and (p_country is null or c.country_code=p_country)
        and (p_search is null or strpos(lower(coalesce(c.name,d.name)),p_search)>0 or strpos(c.slug,p_search)>0
          or strpos(lower(coalesce(c.department_code,'')),p_search)>0)
        and feed_data.community_suggestion_eligible(c,p_actor,p_at)
      order by c.created_at desc,c.id limit 48
    ) c
    union
    select c.id,c.kind,c.topic,c.created_at from (
      select code from selected_topics union select code from joined_topics
    ) t cross join lateral (
      select c.* from feed_data.communities c
      where c.topic=t.code and c.kind='interest' and c.policy<>'private'
        and (p_kind is null or p_kind='interest') and (p_topic is null or c.topic=p_topic) and p_country is null
        and (p_search is null or strpos(lower(c.name),p_search)>0 or strpos(c.slug,p_search)>0)
        and feed_data.community_suggestion_eligible(c,p_actor,p_at)
      order by c.created_at desc,c.id limit 12
    ) c
  ), signals as materialized (
    select p.*,t.code is not null as interest,j.code is not null as joined,feed_data.community_has_public_activity(c,p_at) as active
      from pools p join feed_data.communities c on c.id=p.id
      left join selected_topics t on t.code=p.topic left join joined_topics j on j.code=p.topic
  ), scores as (
    select s.*,interest::integer*w.interest_weight+joined::integer*w.joined_topic_weight+active::integer*w.activity_weight as score,
      case when interest then 'interest' when joined then 'related_topic' when active then 'public_activity' else 'explore' end as why
      from signals s
  ), diversity as (
    select s.*,row_number() over (partition by kind order by score desc,created_at desc,id) as category_position from scores s
  )
  select id,why from diversity
  order by score-(category_position-1)*w.category_penalty desc,category_position,kind,created_at desc,id limit 60;
$$;

create function public.read_community_recommendations_for_client(p_snapshot uuid,p_after integer,p_limit integer,
  p_kind text,p_topic text,p_country text,p_search text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); at_time timestamptz:=clock_timestamp(); state feed_data.community_recommendation_snapshots;
  weights feed_data.community_recommendation_versions; ids uuid[]; reasons text[];
  needle text:=nullif(lower(btrim(p_search)),''); criteria jsonb:=jsonb_build_array(p_kind,p_topic,p_country,needle);
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 18 or p_after is null or p_after not between 0 and 60
    or (p_snapshot is null and p_after<>0) or (p_kind is not null and p_kind not in ('department','diaspora','interest'))
    or (p_topic is not null and not exists(select 1 from public.interest_catalog where code=p_topic))
    or (p_country is not null and p_country !~ '^[A-Z]{2}$') or char_length(needle)>80
  then raise exception 'invalid filter or cursor' using errcode='22023'; end if;

  if p_snapshot is null then
    perform feed_data.consume_limit(actor,'community_rec_build',15);
    perform pg_advisory_xact_lock(hashtextextended('community-rec:'||actor::text,0));
    select * into strict weights from feed_data.community_recommendation_versions where version='v1';
    select coalesce(array_agg(q.community_id order by q.position),'{}'),coalesce(array_agg(q.reason order by q.position),'{}')
      into ids,reasons from feed_data.rank_communities(actor,at_time,weights,p_kind,p_topic,p_country,needle)
      with ordinality q(community_id,reason,position);
    delete from feed_data.community_recommendation_snapshots where id in (
      select id from feed_data.community_recommendation_snapshots where expires_at<=at_time order by expires_at limit 80 for update skip locked);
    delete from feed_data.community_recommendation_snapshots where id in (
      select id from feed_data.community_recommendation_snapshots where user_id=actor order by created_at desc,id desc offset 3);
    delete from feed_data.community_recommendation_feedback where (user_id,community_id) in (
      select user_id,community_id from feed_data.community_recommendation_feedback where action='not_interested'
        and updated_at<=at_time-interval '30 days' order by updated_at limit 80 for update skip locked);
    insert into feed_data.community_recommendation_snapshots(user_id,version,created_at,expires_at,filters,community_ids,reasons)
      values(actor,weights.version,at_time,at_time+interval '10 minutes',criteria,ids,reasons) returning * into state;
  else
    select * into state from feed_data.community_recommendation_snapshots
      where id=p_snapshot and user_id=actor and expires_at>at_time and filters=criteria;
    if not found then raise exception 'recommendations expired' using errcode='PCR30'; end if;
  end if;

  return jsonb_build_object('snapshotId',state.id,'algorithmVersion',state.version,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('position',r.position,
      'community',case when c.kind='department' then feed_data.community_card(c) else feed_data.group_card(c) end,
      'recentPublicActivity',feed_data.community_has_public_activity(c,at_time),
      'reason',case when state.reasons[r.position::integer]='interest' and not exists(
        select 1 from public.member_interests i where i.user_id=actor and i.interest_code=c.topic) then 'explore'
        when state.reasons[r.position::integer]='related_topic' and not exists(
          select 1 from feed_data.community_memberships m join feed_data.communities j on j.id=m.community_id
            where m.user_id=actor and j.topic=c.topic and feed_data.community_discoverable(j,actor)) then 'explore'
        when state.reasons[r.position::integer]='public_activity' and not feed_data.community_has_public_activity(c,at_time) then 'explore'
        else state.reasons[r.position::integer] end
      ) order by r.position) from (
      select q.id,q.position from unnest(state.community_ids) with ordinality q(id,position)
        join feed_data.communities c on c.id=q.id left join public.departments d on d.code=c.department_code
      where q.position>p_after and feed_data.community_suggestion_eligible(c,actor,at_time)
        and (p_kind is null or c.kind=p_kind) and (p_topic is null or c.topic=p_topic) and (p_country is null or c.country_code=p_country)
        and (needle is null or strpos(lower(coalesce(c.name,d.name)),needle)>0 or strpos(c.slug,needle)>0
          or strpos(lower(coalesce(c.department_code,'')),needle)>0)
      order by q.position limit p_limit+1
    ) r join feed_data.communities c on c.id=r.id
  ),'[]'::jsonb));
end;
$$;

create function public.community_recommendation_settings_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return (select jsonb_build_object('hidden',count(*) filter(where action='hide'),
    'notInterested',count(*) filter(where action='not_interested' and updated_at>now()-interval '30 days'))
    from feed_data.community_recommendation_feedback where user_id=auth.uid());
end;
$$;

create function public.save_community_recommendation_feedback_for_client(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room feed_data.communities;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('not_interested','hide','restore')
    then raise exception 'invalid preference' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'community_rec_write',30);
  perform pg_advisory_xact_lock(hashtextextended('community-rec:'||actor::text,0));
  if p_action='restore' then
    delete from feed_data.community_recommendation_feedback where user_id=actor and community_id=p_id;
    return;
  end if;
  select * into room from feed_data.communities where id=p_id;
  if not found or not feed_data.community_discoverable(room,actor)
    then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if not exists(select 1 from feed_data.community_recommendation_feedback where user_id=actor and community_id=p_id)
    and (select count(*) from feed_data.community_recommendation_feedback where user_id=actor)>=500
    then raise exception 'feedback limit' using errcode='PCR12'; end if;
  insert into feed_data.community_recommendation_feedback(user_id,community_id,action) values(actor,p_id,p_action)
    on conflict(user_id,community_id) do update set action=excluded.action,updated_at=clock_timestamp()
      where community_recommendation_feedback.action<>excluded.action or
        (excluded.action='not_interested' and community_recommendation_feedback.updated_at<=now()-interval '30 days');
end;
$$;

create function public.clear_community_recommendation_feedback_for_client()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'community_rec_write',30);
  perform pg_advisory_xact_lock(hashtextextended('community-rec:'||auth.uid()::text,0));
  delete from feed_data.community_recommendation_feedback where user_id=auth.uid();
  delete from feed_data.community_recommendation_snapshots where user_id=auth.uid();
end;
$$;

revoke all on function feed_data.community_discoverable(feed_data.communities,uuid),
  feed_data.community_suggestion_eligible(feed_data.communities,uuid,timestamptz),
  feed_data.community_has_public_activity(feed_data.communities,timestamptz),
  feed_data.rank_communities(uuid,timestamptz,feed_data.community_recommendation_versions,text,text,text,text),
  public.read_community_recommendations_for_client(uuid,integer,integer,text,text,text,text),
  public.community_recommendation_settings_for_client(),public.save_community_recommendation_feedback_for_client(uuid,text),
  public.clear_community_recommendation_feedback_for_client() from public,anon,authenticated,service_role;
grant execute on function public.read_community_recommendations_for_client(uuid,integer,integer,text,text,text,text),
  public.community_recommendation_settings_for_client(),public.save_community_recommendation_feedback_for_client(uuid,text),
  public.clear_community_recommendation_feedback_for_client() to authenticated;
