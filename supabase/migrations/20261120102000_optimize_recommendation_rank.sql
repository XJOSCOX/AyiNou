-- Check author and reactor eligibility once per distinct account in the bounded sample.
-- This small OLTP ranking query avoids JIT compilation overhead on hosted Free compute.
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
    where feed_data.followable_member(author)
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

alter function public.read_for_you_for_client(uuid,integer,integer) set jit to off;
