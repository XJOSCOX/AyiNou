-- Optional, author-selected topics and explicit viewer controls.
create table feed_data.post_topics (
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  topic_code text not null references public.interest_catalog(code),
  primary key(post_id,slot),
  unique(post_id,topic_code)
);
create index post_topics_catalog on feed_data.post_topics(topic_code,post_id);
alter table feed_data.post_submissions add column topic_digest bytea check (octet_length(topic_digest)=32);

create table feed_data.recommendation_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references feed_data.posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete cascade,
  action text not null,
  updated_at timestamptz not null default clock_timestamp(),
  check ((action='not_interested' and post_id is not null and author_id is null)
    or (action in ('less_author','hide_author') and post_id is null and author_id is not null and author_id<>user_id)),
  unique(user_id,post_id),
  unique(user_id,author_id)
);
create index recommendation_feedback_post on feed_data.recommendation_feedback(post_id) where post_id is not null;
create index recommendation_feedback_author on feed_data.recommendation_feedback(author_id) where author_id is not null;

create table feed_data.recommendation_versions (
  version text primary key,
  topic_weight smallint not null check(topic_weight between 1 and 30),
  follow_weight smallint not null check(follow_weight between 1 and 40),
  language_weight smallint not null check(language_weight between 0 and 10),
  freshness_max smallint not null check(freshness_max between 1 and 30),
  reaction_weight smallint not null check(reaction_weight between 0 and 2),
  less_penalty smallint not null check(less_penalty between 1 and 100),
  repeat_penalty smallint not null check(repeat_penalty between 0 and 20)
);
insert into feed_data.recommendation_versions values ('v1',18,25,6,20,2,45,8);

create table feed_data.recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null references feed_data.recommendation_versions(version),
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>created_at),
  post_ids uuid[] not null check(cardinality(post_ids)<=80),
  reasons text[] not null check(cardinality(reasons)=cardinality(post_ids))
);
create index recommendation_snapshots_viewer on feed_data.recommendation_snapshots(user_id,created_at desc,id desc);
create index recommendation_snapshots_expiry on feed_data.recommendation_snapshots(expires_at);
create index posts_recommendation_recent on feed_data.posts(published_at desc,id desc)
  where status='published' and deleted_at is null and visibility in ('public','members_only');

alter table feed_data.post_topics enable row level security;
alter table feed_data.recommendation_feedback enable row level security;
alter table feed_data.recommendation_versions enable row level security;
alter table feed_data.recommendation_snapshots enable row level security;
revoke all on feed_data.post_topics,feed_data.recommendation_feedback,feed_data.recommendation_versions,
  feed_data.recommendation_snapshots from public,anon,authenticated,service_role;
alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check (action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build','recommendation_write'));

create function feed_data.normalize_topics(p_codes text[],p_limit integer)
returns text[] language plpgsql stable set search_path = '' as $$
begin
  if p_codes is null or cardinality(p_codes)>p_limit or exists(
    select 1 from unnest(p_codes) q(code) where not exists(select 1 from public.interest_catalog t where t.code=q.code)
  ) or cardinality(p_codes)<>(select count(distinct code) from unnest(p_codes) q(code))
  then raise exception 'invalid topics' using errcode='22023'; end if;
  return array(select code from unnest(p_codes) q(code) order by code);
end;
$$;

create function feed_data.set_post_topics(p_id uuid,p_topics text[])
returns void language plpgsql set search_path = '' as $$
begin
  delete from feed_data.post_topics where post_id=p_id;
  insert into feed_data.post_topics(post_id,slot,topic_code)
    select p_id,n::smallint,code from unnest(p_topics) with ordinality q(code,n);
end;
$$;

create function public.create_post_with_topics_for_client(p_body text,p_language text,p_visibility text,p_submission uuid,p_topics text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  topics text[];
  digest bytea;
  previous bytea;
  exists_before boolean;
  result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  topics:=feed_data.normalize_topics(p_topics,3);
  digest:=extensions.digest(to_jsonb(topics)::text,'sha256');
  -- Match the lock used by the original create RPC so old clients share the same submission identity.
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  select s.topic_digest into previous from feed_data.post_submissions s where s.author_id=actor and s.submission_id=p_submission;
  exists_before:=found;
  if exists_before and digest<>coalesce(previous,extensions.digest('[]','sha256'))
  then raise exception 'submission reused' using errcode='PFR09'; end if;
  result:=public.create_post_for_client(p_body,p_language,p_visibility,p_submission);
  if not exists_before then
    perform feed_data.set_post_topics(result,topics);
    update feed_data.post_submissions set topic_digest=digest where author_id=actor and submission_id=p_submission;
  end if;
  return result;
end;
$$;

create function public.edit_post_with_topics_for_client(p_id uuid,p_version integer,p_body text,p_language text,
  p_visibility text,p_topics text[])
returns void language plpgsql security definer set search_path = '' as $$
declare topics text[];
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  topics:=feed_data.normalize_topics(p_topics,3);
  perform public.mutate_post_for_client(p_id,p_version,false,p_body,p_language,p_visibility);
  perform feed_data.set_post_topics(p_id,topics);
end;
$$;

create function public.post_topics_for_client(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ids is null or cardinality(p_ids)>41 then raise exception 'invalid targets' using errcode='22023'; end if;
  return coalesce((select jsonb_object_agg(t.post_id,t.topics) from (
    select p.id as post_id,jsonb_agg(x.topic_code order by x.slot) as topics
      from feed_data.posts p join feed_data.post_topics x on x.post_id=p.id where p.id=any(p_ids)
        and (feed_data.discussion_visible(p) or (auth.uid()=p.author_id and feed_data.member_allowed()
          and p.deleted_at is null and p.status in ('draft','hidden','published')))
      group by p.id
  ) t),'{}'::jsonb);
end;
$$;

create function public.recommendation_settings_for_client()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return jsonb_build_object('topics',array(select interest_code from public.member_interests where user_id=auth.uid() order by interest_code),
    'feedbackCount',(select count(*) from feed_data.recommendation_feedback where user_id=auth.uid()));
end;
$$;

create function public.save_recommendation_topics_for_client(p_topics text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  topics text[];
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  topics:=feed_data.normalize_topics(p_topics,10);
  perform feed_data.consume_limit(actor,'recommendation_write',20);
  -- Use the same profile row as profile preference updates.
  perform 1 from public.profiles where user_id=actor for update;
  if not found then raise exception 'profile unavailable' using errcode='PFR04'; end if;
  delete from public.member_interests where user_id=actor and interest_code<>all(topics);
  insert into public.member_interests(user_id,interest_code) select actor,code from unnest(topics) q(code) on conflict do nothing;
  return public.recommendation_settings_for_client();
end;
$$;

create function public.recommendation_feedback_for_client(p_post uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('not_interested','less_author','hide_author')
  then raise exception 'invalid feedback' using errcode='22023'; end if;
  select p.author_id into target from feed_data.posts p join public.profiles a on a.user_id=p.author_id
    where p.id=p_post and p.author_id<>actor and feed_data.discussion_visible(p) and feed_data.followable_member(a) for share of p;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  perform feed_data.consume_limit(actor,'recommendation_write',20);
  if p_action='not_interested' then
    insert into feed_data.recommendation_feedback(user_id,post_id,action) values(actor,p_post,p_action)
      on conflict(user_id,post_id) do nothing;
  else
    insert into feed_data.recommendation_feedback(user_id,author_id,action) values(actor,target,p_action)
      on conflict(user_id,author_id) do update set action=excluded.action,updated_at=clock_timestamp()
      where recommendation_feedback.action<>'hide_author' and recommendation_feedback.action is distinct from excluded.action;
  end if;
end;
$$;

create function public.clear_recommendation_feedback_for_client()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'recommendation_write',20);
  delete from feed_data.recommendation_feedback where user_id=auth.uid();
  return public.recommendation_settings_for_client();
end;
$$;

create function feed_data.rank_recommendations(p_actor uuid,p_at timestamptz,p_weights feed_data.recommendation_versions)
returns table(post_id uuid,reason text)
language sql stable set search_path = '' as $$
  with pool as materialized (
    select p.id,p.author_id,p.published_at,p.language
    from feed_data.posts p
    where p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
      and p.published_at between p_at-interval '30 days' and p_at and p.author_id<>p_actor
    order by p.published_at desc,p.id desc limit 420
  ), eligible as materialized (
    select p.*,coalesce(f.action='less_author',false) as less, mf.target_id is not null as followed
    from pool p join public.profiles author on author.user_id=p.author_id
    left join feed_data.member_follows mf on mf.follower_id=p_actor and mf.target_id=p.author_id
    left join feed_data.recommendation_feedback f on f.user_id=p_actor and f.author_id=p.author_id
    where feed_data.followable_member(author) and f.action is distinct from 'hide_author'
      and not exists(select 1 from feed_data.recommendation_feedback x where x.user_id=p_actor and x.post_id=p.id)
  ), signals as (
    select p.*, topics.matches,topics.diversity_topic,
      p.language=(select preferred_locale from public.profiles where user_id=p_actor) as same_language,
      greatest(0,p_weights.freshness_max-floor(extract(epoch from p_at-p.published_at)/43200)::integer) as fresh,
      (select count(*)::integer from (
        select 1 from (
          select r.user_id from feed_data.post_reactions r where r.post_id=p.id order by r.user_id limit 12
        ) sample join auth.users u on u.id=sample.user_id
          join public.profiles profile on profile.user_id=sample.user_id
        where sample.user_id not in (p_actor,p.author_id) and u.created_at<=p_at-interval '7 days'
          and feed_data.followable_member(profile)
        limit 3
      ) mature) as engaged
    from eligible p
    cross join lateral (
      select least(2,count(i.interest_code))::integer as matches,
        coalesce(min(t.topic_code) filter(where i.interest_code is not null),min(t.topic_code)) as diversity_topic
      from feed_data.post_topics t left join public.member_interests i on i.user_id=p_actor and i.interest_code=t.topic_code
      where t.post_id=p.id
    ) topics
  ), scored as (
    select s.*, matches*p_weights.topic_weight + case when followed then p_weights.follow_weight else 0 end
      + case when same_language then p_weights.language_weight else 0 end + fresh + engaged*p_weights.reaction_weight
      - case when less then p_weights.less_penalty else 0 end as score,
      case when matches>0 and (not followed or matches*p_weights.topic_weight>=p_weights.follow_weight) then 'topic'
        when followed then 'follow' when same_language and fresh<p_weights.language_weight then 'language'
        else 'recent' end as explanation
    from signals s
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

create function public.read_for_you_for_client(p_snapshot uuid,p_after integer,p_limit integer)
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
        and feed_data.followable_member(a)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;

revoke all on function feed_data.normalize_topics(text[],integer),feed_data.set_post_topics(uuid,text[]),
  feed_data.rank_recommendations(uuid,timestamptz,feed_data.recommendation_versions) from public,anon,authenticated,service_role;
revoke all on function public.create_post_with_topics_for_client(text,text,text,uuid,text[]),
  public.edit_post_with_topics_for_client(uuid,integer,text,text,text,text[]),public.post_topics_for_client(uuid[]),
  public.recommendation_settings_for_client(),public.save_recommendation_topics_for_client(text[]),
  public.recommendation_feedback_for_client(uuid,text),public.clear_recommendation_feedback_for_client(),
  public.read_for_you_for_client(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.post_topics_for_client(uuid[]) to anon,authenticated;
grant execute on function public.create_post_with_topics_for_client(text,text,text,uuid,text[]),
  public.edit_post_with_topics_for_client(uuid,integer,text,text,text,text[]),
  public.recommendation_settings_for_client(),public.save_recommendation_topics_for_client(text[]),
  public.recommendation_feedback_for_client(uuid,text),public.clear_recommendation_feedback_for_client(),
  public.read_for_you_for_client(uuid,integer,integer) to authenticated;
