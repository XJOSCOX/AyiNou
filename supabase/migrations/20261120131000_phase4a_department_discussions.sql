create function feed_data.create_scoped_post(p_room uuid,p_body text,p_language text,p_visibility text,p_submission uuid)
returns uuid language plpgsql set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; request_hash bytea; prior_hash bytea;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_submission is null or p_body is null or p_language is null or p_visibility is null
    or (p_room is not null and p_visibility<>'members_only')
  then raise exception 'invalid post fields' using errcode='22023'; end if;
  request_hash:=extensions.digest(case when p_room is null then jsonb_build_array(p_body,p_language,p_visibility)::text
    else jsonb_build_array(p_room,p_body,p_language,p_visibility)::text end,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  perform feed_data.require_community_membership(p_room);
  select post_id,request_digest into result,prior_hash from feed_data.post_submissions
    where author_id=actor and submission_id=p_submission;
  if found then
    if request_hash<>prior_hash then raise exception 'submission reused' using errcode='PFR09'; end if;
    return result;
  end if;
  perform feed_data.consume_limit(actor,'create',8);
  insert into feed_data.posts(author_id,body,language,visibility,status,community_id)
  values(actor,p_body,p_language,p_visibility,case when p_visibility='private' then 'draft' else 'published' end,p_room)
  returning id into result;
  insert into feed_data.post_submissions(author_id,submission_id,post_id,request_digest)
    values(actor,p_submission,result,request_hash);
  return result;
end;
$$;

create or replace function public.create_post_for_client(p_body text,p_language text,p_visibility text,p_submission uuid)
returns uuid language sql security definer set search_path='' as $$
  select feed_data.create_scoped_post(null,p_body,p_language,p_visibility,p_submission);
$$;

create function feed_data.create_scoped_media_post(p_room uuid,p_body text,p_language text,p_visibility text,p_submission uuid,
  p_topics text[],p_items jsonb)
returns uuid language plpgsql set search_path='' as $$
declare
  actor uuid:=auth.uid(); previous feed_data.post_submissions; known boolean;
  normalized jsonb; topics text[]; topic_hash bytea; media_hash bytea; result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  normalized:=feed_data.normalize_attachments(p_items);
  topics:=feed_data.normalize_topics(p_topics,3);
  topic_hash:=extensions.digest(to_jsonb(topics)::text,'sha256');
  media_hash:=extensions.digest(normalized::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  select * into previous from feed_data.post_submissions where author_id=actor and submission_id=p_submission;
  known:=found;
  if known and (topic_hash<>coalesce(previous.topic_digest,extensions.digest('[]','sha256'))
    or media_hash<>coalesce(previous.media_digest,extensions.digest('[]','sha256')))
  then raise exception 'submission reused' using errcode='PFR09'; end if;
  result:=feed_data.create_scoped_post(p_room,p_body,p_language,p_visibility,p_submission);
  if not known then
    perform feed_data.set_post_topics(result,topics);
    perform feed_data.replace_attachments(result,normalized);
    update feed_data.post_submissions set topic_digest=topic_hash,media_digest=media_hash
      where author_id=actor and submission_id=p_submission;
  end if;
  return result;
end;
$$;

create or replace function public.create_post_with_media_for_client(p_body text,p_language text,p_visibility text,p_submission uuid,
  p_topics text[],p_items jsonb)
returns uuid language sql security definer set search_path='' as $$
  select feed_data.create_scoped_media_post(null,p_body,p_language,p_visibility,p_submission,p_topics,p_items);
$$;
create function public.create_department_post_for_client(p_key text,p_body text,p_language text,p_submission uuid,p_topics text[],p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
  return feed_data.create_scoped_media_post(room,p_body,p_language,'members_only',p_submission,p_topics,p_items);
end;
$$;

create function feed_data.community_post_reference(p_room uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'slug',slug) from feed_data.communities
    where id=p_room and feed_data.can_read_community(id);
$$;
create function public.read_department_posts_for_client(p_key text,p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if not feed_data.can_read_community(room) then raise exception 'membership required' using errcode='PCM03'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',p.author_id=auth.uid(),'author',feed_data.author_projection(p.author_id),
    'community',feed_data.community_post_reference(room)
  ) order by p.created_at desc,p.id desc) from (
    select x.* from feed_data.posts x where x.community_id=room and x.status='published' and x.deleted_at is null
      and feed_data.author_active(x.author_id) and feed_data.viewer_can_interact(x.author_id) and feed_data.viewer_unmuted(x.author_id)
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]');
end;
$$;

create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id) and feed_data.can_read_community(p.community_id)
    and case when auth.uid() is null then p.visibility='public'
      else p.visibility in ('public','members_only') and feed_data.member_allowed() end,false);
$$;
create or replace function feed_data.lock_discussion(p_id uuid)
returns void language plpgsql set search_path='' as $$
declare room uuid;
begin
  select p.community_id into room from feed_data.posts p where p.id=p_id and feed_data.discussion_visible(p) for share;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  perform feed_data.require_community_membership(room);
end;
$$;

revoke all on function feed_data.create_scoped_post(uuid,text,text,text,uuid),
  feed_data.create_scoped_media_post(uuid,text,text,text,uuid,text[],jsonb),feed_data.community_post_reference(uuid),
  public.create_department_post_for_client(text,text,text,uuid,text[],jsonb),public.read_department_posts_for_client(text,integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function feed_data.community_post_reference(uuid) to anon,authenticated;
grant execute on function public.create_department_post_for_client(text,text,text,uuid,text[],jsonb),
  public.read_department_posts_for_client(text,integer,timestamptz,uuid) to authenticated;

-- Keep global timelines and ranking pools explicitly unscoped.
create or replace function public.mutate_post_for_client(p_id uuid,p_version integer,p_delete boolean,p_body text,p_language text,p_visibility text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  post feed_data.posts;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into post from feed_data.posts where id=p_id and author_id=actor for update;
  if not found or post.status='removed' then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if p_delete and post.deleted_at is not null then return; end if;
  if post.deleted_at is not null then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if post.status='hidden' then raise exception 'post is moderated' using errcode='42501'; end if;
  if post.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_delete then
    update feed_data.posts set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_id;
  else
    if p_body is null or p_language is null or p_visibility is null then raise exception 'missing post fields' using errcode='22023'; end if;
    perform feed_data.require_community_membership(post.community_id);
    if post.community_id is not null and p_visibility<>'members_only' then raise exception 'invalid audience' using errcode='22023'; end if;
    perform feed_data.consume_limit(actor,'edit',20);
    update feed_data.posts set body=p_body,language=p_language,visibility=p_visibility,
      status=case when p_visibility='private' then 'draft' else 'published' end,
      updated_at=clock_timestamp(),edited_at=clock_timestamp(),version=version+1 where id=p_id;
  end if;
end;
$$;

create or replace function public.report_post_for_client(p_id uuid,p_category text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid; room uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select p.author_id,p.community_id into target,room from feed_data.posts p
    where p.id=p_id and feed_data.discussion_visible(p) for share;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  perform feed_data.require_community_membership(room);
  if target=actor then raise exception 'own post' using errcode='42501'; end if;
  perform feed_data.consume_limit(actor,'report',5);
  insert into feed_data.content_reports(post_id,reporter_id,category,note) values(p_id,actor,p_category,nullif(btrim(p_note),''));
end;
$$;

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
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id),'community',feed_data.community_post_reference(p.community_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null and x.community_id is null or x.id=p_id)
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
        select candidate.* from feed_data.posts candidate where candidate.author_id=f.target_id and candidate.community_id is null
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
    where p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
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
      where r.position>p_after and p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
        and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;

create or replace function public.post_topics_for_client(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ids is null or cardinality(p_ids)>41 then raise exception 'invalid targets' using errcode='22023'; end if;
  return coalesce((select jsonb_object_agg(t.post_id,t.topics) from (
    select p.id as post_id,jsonb_agg(x.topic_code order by x.slot) as topics
      from feed_data.posts p join feed_data.post_topics x on x.post_id=p.id where p.id=any(p_ids)
        and (feed_data.discussion_visible(p) or (auth.uid()=p.author_id and feed_data.member_allowed()
          and feed_data.can_read_community(p.community_id) and p.deleted_at is null and p.status in ('draft','hidden','published')))
      group by p.id
  ) t),'{}'::jsonb);
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

  if p_post is not null and not exists(select 1 from feed_data.posts p where p.id=p_post
    and feed_data.community_member(p.community_id,p_recipient)) then return; end if;
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
