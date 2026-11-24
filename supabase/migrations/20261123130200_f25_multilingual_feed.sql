
alter table private.platform_boolean_policies drop constraint platform_boolean_policies_policy_key_check,
  add constraint platform_boolean_policies_policy_key_check check(policy_key in (
    'homepage.community_statistics.enabled','events.enabled','events.individual','events.organization',
    'events.discovery','events.rsvp','events.notifications','feed.language_filter','feed.translation'
  ));
insert into private.platform_boolean_policies(policy_key,enabled) values ('feed.language_filter',true),('feed.translation',false);

create table feed_data.feed_language_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  languages text[] not null check(cardinality(languages)<=4 and array_position(languages,null) is null
    and languages <@ array['ht','fr','en','es']::text[]),
  updated_at timestamptz not null default clock_timestamp()
);
alter table feed_data.feed_language_preferences enable row level security;
revoke all on feed_data.feed_language_preferences from public,anon,authenticated,service_role;

create function feed_data.f25_selected_languages() returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce((select languages from feed_data.feed_language_preferences
    where user_id=auth.uid() and feed_data.f25_policy('feed.language_filter')),'{}'::text[])
$$;
revoke all on function feed_data.f25_selected_languages() from public,anon,authenticated,service_role;
grant execute on function feed_data.f25_selected_languages() to anon,authenticated;

create function public.feed_languages_for_client(p_languages text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare changed int;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_languages is not null then
    if not feed_data.f25_policy('feed.language_filter') then raise exception 'filter unavailable' using errcode='PEV03'; end if;
    if cardinality(p_languages)>4 or array_position(p_languages,null) is not null
      or not p_languages<@array['ht','fr','en','es']::text[] then raise exception 'invalid languages' using errcode='22023'; end if;
    select array(select distinct value from unnest(p_languages) value order by value) into p_languages;
    if cardinality(p_languages)=4 then p_languages:='{}'; end if;
    perform feed_data.consume_limit(auth.uid(),'notification_write',12);
    insert into feed_data.feed_language_preferences(user_id,languages) values(auth.uid(),p_languages)
      on conflict(user_id) do update set languages=excluded.languages,updated_at=clock_timestamp()
      where feed_language_preferences.languages is distinct from excluded.languages;
    get diagnostics changed=row_count;
    if changed>0 then delete from feed_data.recommendation_snapshots where user_id=auth.uid(); end if;
  end if;
  return jsonb_build_object('languages',feed_data.f25_selected_languages(),'enabled',feed_data.f25_policy('feed.language_filter'),
    'translationEnabled',feed_data.f25_policy('feed.translation'));
end;
$$;
revoke all on function public.feed_languages_for_client(text[]) from public,anon,authenticated,service_role;
grant execute on function public.feed_languages_for_client(text[]) to authenticated;

-- The only permissible external source is independently public and live-visible to this caller.
create function public.translation_source_for_client(p_kind text,p_id uuid,p_target text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare post feed_data.posts; comment feed_data.comments; content text; original text;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_target is null or p_target not in ('ht','fr','en','es') then raise exception 'invalid language' using errcode='22023'; end if;
  perform feed_data.consume_limit(auth.uid(),'translation',8);
  if p_kind='post' then
    select * into post from feed_data.posts where id=p_id;
    content:=post.body; original:=post.language;
  elsif p_kind='comment' then
    select * into comment from feed_data.comments where id=p_id and feed_data.comment_visible(comments);
    select * into post from feed_data.posts where id=comment.post_id;
    if comment.parent_id is not null and not exists(
      select 1 from feed_data.comments parent where parent.id=comment.parent_id and feed_data.comment_visible(parent)
    ) then raise exception 'comment unavailable' using errcode='PFR04'; end if;
    content:=comment.body; original:=comment.language;
  end if;
  if content is null or post.id is null or not feed_data.discussion_visible(post) then
    raise exception 'source unavailable' using errcode='PFR04';
  end if;
  if not feed_data.f25_policy('feed.translation') or p_target=original or post.visibility<>'public'
    or post.community_id is not null or post.linked_event_id is not null or not feed_data.f21_shareable(post)
    or (post.organization_id is null and not exists (
      select 1 from public.profiles p where p.user_id=post.author_id and feed_data.f24_identity(p,null)
    )) or (p_kind='comment' and not exists (
      select 1 from public.profiles p where p.user_id=comment.author_id and feed_data.f24_identity(p,null)
    )) then return jsonb_build_object('eligible',false); end if;
  return jsonb_build_object('eligible',true,'body',content,'language',original);
end;
$$;
revoke all on function public.translation_source_for_client(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.translation_source_for_client(text,uuid,text) to authenticated;

alter table feed_data.recommendation_snapshots add column feed_languages text[] not null default '{}';
create or replace function public.read_feed_for_client(p_scope text,p_limit integer,p_before_at timestamptz,p_before_id uuid,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('feed','mine') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='mine' and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',case when feed_data.public_group_post(p.community_id,p.created_at) then 'public' else p.visibility end,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,'community',feed_data.community_post_reference(p.community_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null and x.community_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_id is not null or p_scope<>'feed' or feed_data.viewer_unmuted(x.author_id))
      and (p_id is not null or p_scope<>'feed' or cardinality(feed_data.f25_selected_languages())=0 or x.language=any(feed_data.f25_selected_languages()))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;
create or replace function public.read_following_feed_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare langs text[]:=feed_data.f25_selected_languages();
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
          and feed_data.discussion_visible(v) and (cardinality(langs)=0 or v.language=any(langs)) and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() and feed_data.f24_identity(a,auth.uid()) and feed_data.f24_audience_follower(a.user_id,auth.uid()) and feed_data.viewer_unmuted(a.user_id)
        order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select x.id,x.created_at,x.id,null::uuid from feed_data.institution_follows f
        join private.organizations o on o.id=f.organization_id and feed_data.followable_institution(o)
        cross join lateral (select v.id,v.created_at from feed_data.posts v where v.organization_id=o.id
          and v.community_id is null and v.status='published' and v.deleted_at is null and v.visibility='public'
          and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id) and (cardinality(langs)=0 or v.language=any(langs))
          and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select r.id,r.created_at,r.post_id,r.actor_id from feed_data.member_follows f join public.profiles a on a.user_id=f.target_id
        cross join lateral (select r1.* from feed_data.reposts r1 join feed_data.posts v on v.id=r1.post_id
          where r1.actor_id=f.target_id and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id) and (cardinality(langs)=0 or v.language=any(langs))
          and (v.organization_id is null or not exists(select from feed_data.institution_follows o
            where o.follower_id=auth.uid() and o.organization_id=v.organization_id and not o.show_reposts))
          and (p_before_at is null or (r1.created_at,r1.id)<(p_before_at,p_before_id))
          order by r1.created_at desc,r1.id desc limit p_limit+1) r
        where f.follower_id=auth.uid() and f.show_reposts and feed_data.f24_identity(a,auth.uid()) and feed_data.f24_audience_follower(a.user_id,auth.uid()) and feed_data.viewer_unmuted(a.user_id)
        order by r.created_at desc,r.id desc limit p_limit+1)
      order by at desc,id desc limit p_limit+1
    ) e join feed_data.posts p on p.id=e.post_id
  ),'[]');
end;
$$;
create or replace function feed_data.rank_recommendations(p_actor uuid,p_at timestamptz,p_weights feed_data.recommendation_versions)
returns table(post_id uuid,reason text)
language sql stable set search_path = '' set jit = off as $$
  with pool as materialized (
    select p.id,p.author_id,p.published_at,p.language,p.organization_id
    from feed_data.posts p
    where p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only','followers') and feed_data.discussion_visible(p)
      and p.published_at between p_at-interval '30 days' and p_at and p.author_id<>p_actor and (cardinality(feed_data.f25_selected_languages())=0 or p.language=any(feed_data.f25_selected_languages()))
    order by p.published_at desc,p.id desc limit 420
  ), eligible_authors as materialized (
    select candidate.author_id
    from (select distinct author_id from pool) candidate join public.profiles author on author.user_id=candidate.author_id
    where feed_data.followable_member(author) and feed_data.viewer_unmuted(author.user_id)
  ), eligible as materialized (
    select p.*,coalesce(f.action='less_author',false) as less, (case when p.organization_id is null then
      mf.target_id is not null and feed_data.f24_audience_follower(p.author_id,p_actor)
      else exists(select from feed_data.institution_follows f where f.organization_id=p.organization_id and f.follower_id=p_actor)
      end) as followed
    from pool p join eligible_authors author on author.author_id=p.author_id
    left join feed_data.member_follows mf on mf.follower_id=p_actor and mf.target_id=p.author_id
    left join feed_data.recommendation_feedback f on f.user_id=p_actor and f.author_id=p.author_id
    where f.action is distinct from 'hide_author'
      and not exists(select 1 from feed_data.recommendation_feedback x where x.user_id=p_actor and x.post_id=p.id)
  ), signals as materialized (
    select p.*, topics.matches,topics.diversity_topic,
      p.language=(select p.preferred_locale from public.profiles p join feed_data.profile_privacy s using(user_id) where p.user_id=p_actor and s.share_language) as same_language,
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
  langs text[]:=feed_data.f25_selected_languages();
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
    insert into feed_data.recommendation_snapshots(user_id,version,created_at,expires_at,post_ids,reasons,feed_languages)
      values(actor,weights.version,current_time_at,current_time_at+interval '10 minutes',posts,reasons,langs) returning * into state;
  else
    select * into state from feed_data.recommendation_snapshots where id=p_snapshot and user_id=actor and expires_at>current_time_at and feed_languages=langs;
    if not found then raise exception 'ranking expired' using errcode='PFD30'; end if;
  end if;

  return jsonb_build_object('snapshotId',state.id,'algorithmVersion',state.version,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
      'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
      'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,'own',false,'recommendationReason',p.reason,'rankPosition',p.position)
      order by p.position)
    from (
      select p.*,r.position,state.reasons[r.position::integer] as reason
      from unnest(state.post_ids) with ordinality r(post_id,position)
      join feed_data.posts p on p.id=r.post_id join public.profiles a on a.user_id=p.author_id
      where r.position>p_after and (cardinality(langs)=0 or p.language=any(langs)) and p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only','followers') and feed_data.discussion_visible(p)
        and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id) and feed_data.f21_org_visible(p.organization_id)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;
create function public.founder_feature_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_key text,p_enabled boolean,p_expected integer,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r private.platform_boolean_policies;
  prior private.platform_boolean_policy_events;
  k constant text := p_key;
begin
  if k is null or k not in ('events.enabled','events.individual','events.organization','events.discovery','events.rsvp','events.notifications','feed.language_filter','feed.translation') then raise exception 'invalid feature policy' using errcode='23514'; end if;
  if p_request is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;

  if p_request is null then
    if p_enabled is not null or p_expected is not null or p_reason is not null
      then raise exception 'invalid read' using errcode='23514'; end if;
    select * into r from private.platform_boolean_policies where policy_key=k;
  else
    if p_enabled is null or p_expected is null or p_expected<1 or not
      coalesce(length(btrim(p_reason)) between 10 and 500 and btrim(p_reason) !~ '[[:cntrl:]]',false)
      then raise exception 'invalid policy change' using errcode='23514'; end if;
    select * into r from private.platform_boolean_policies where policy_key=k for update;
    if found then
      select * into prior from private.platform_boolean_policy_events where actor_id=p_actor and request_id=p_request;
      if found then
        if prior.policy_key<>k or prior.enabled<>p_enabled or prior.revision-1<>p_expected or prior.reason<>btrim(p_reason)
          then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('key',k,'enabled',prior.enabled,'revision',prior.revision,'updatedAt',prior.occurred_at);
      end if;
      if r.revision<>p_expected then raise exception 'stale policy revision' using errcode='O2004'; end if;
      if r.enabled=p_enabled then raise exception 'value already saved' using errcode='55000'; end if;
      update private.platform_boolean_policies set enabled=p_enabled,revision=revision+1,updated_at=clock_timestamp()
        where policy_key=k returning * into r;
      insert into private.platform_boolean_policy_events(policy_key,revision,actor_id,previous_enabled,enabled,reason,request_id,occurred_at)
        values(k,r.revision,p_actor,not p_enabled,p_enabled,btrim(p_reason),p_request,r.updated_at);
    end if;
  end if;
  if r.policy_key is null then return null; end if;
  return jsonb_build_object('key',k,'enabled',r.enabled,'revision',r.revision,'updatedAt',r.updated_at);
end;
$$;
revoke all on function public.founder_feature_policy_for_api(uuid,uuid,boolean,bigint,uuid,text,boolean,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.founder_feature_policy_for_api(uuid,uuid,boolean,bigint,uuid,text,boolean,integer,text,uuid) to service_role;
