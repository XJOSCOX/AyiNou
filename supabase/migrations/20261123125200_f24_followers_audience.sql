-- A personal Followers audience shares the same live predicate across Feed surfaces.
alter table feed_data.posts drop constraint posts_visibility_check,
  add constraint posts_visibility_check check(visibility in ('public','members_only','followers','private')),
  add constraint f24_followers_personal_audience check(visibility<>'followers' or (community_id is null and organization_id is null));
create index f24_followers_posts on feed_data.posts(author_id,created_at desc,id desc)
  where status='published' and deleted_at is null and visibility='followers';

create function feed_data.f24_audience_follower(p_author uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_viewer is not null and (p_author=p_viewer or exists (
    select from feed_data.member_follows f where f.target_id=p_author and f.follower_id=p_viewer
      and (feed_data.f24_follow_policy(p_author)='everyone' or f.explicitly_approved_at is not null)))
    and not feed_data.blocked_pair(p_author,p_viewer)
$$;
revoke all on function feed_data.f24_audience_follower(uuid,uuid) from public,anon,authenticated,service_role;

-- RLS wraps the relationship lookup with the current viewer. Callers cannot probe arbitrary pairs.
create function feed_data.f24_viewer_is_follower(p_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select feed_data.member_allowed() and feed_data.f24_audience_follower(p_author,auth.uid())
$$;
revoke all on function feed_data.f24_viewer_is_follower(uuid) from public,anon,authenticated,service_role;
grant execute on function feed_data.f24_viewer_is_follower(uuid) to authenticated;

alter policy feed_members on feed_data.posts using (
  (select feed_data.member_allowed()) and deleted_at is null and
  ((author_id=(select auth.uid()) and status in ('draft','published','hidden'))
   or (status='published' and feed_data.author_active(author_id) and
     (visibility in ('public','members_only') or (visibility='followers' and feed_data.f24_viewer_is_follower(author_id)))))
);


create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id) and feed_data.f21_org_visible(p.organization_id)
    and (case when auth.uid() is null then p.visibility='public' or feed_data.public_group_post(p.community_id,p.created_at)
      else (p.visibility in ('public','members_only') or (p.visibility='followers' and feed_data.f24_viewer_is_follower(p.author_id))) and feed_data.member_allowed()
        and (feed_data.can_read_community(p.community_id) or feed_data.public_group_post(p.community_id,p.created_at)) end),false)
$$;

create or replace function feed_data.f24_member_follow_status(p public.profiles) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'self',p.user_id=auth.uid(),
    'following',exists(select from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id
      and (feed_data.f24_follow_policy(p.user_id)<>'approval' or f.explicitly_approved_at is not null)),
    'requestPending',exists(select from feed_data.follow_requests r where r.requester_id=auth.uid() and r.target_id=p.user_id),
    'requiresApproval',feed_data.f24_follow_policy(p.user_id)='approval',
    'canFollow',auth.uid() is not null and auth.uid()<>p.user_id and (feed_data.f24_follow_policy(p.user_id)<>'no_one'
      or exists(select from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id)),
    'mutual',feed_data.f24_details(p.user_id,auth.uid()) and feed_data.f24_audience_follower(p.user_id,auth.uid()) and exists(select from feed_data.member_follows f join feed_data.member_follows r
      on r.follower_id=f.target_id and r.target_id=f.follower_id where f.follower_id=auth.uid() and f.target_id=p.user_id),
    'verified',feed_data.f24_details(p.user_id,auth.uid()) and cardinality(private.reviewed_personal_claims(p.user_id))>0,
    'personalClaims',case when feed_data.f24_details(p.user_id,auth.uid()) then private.reviewed_personal_claims(p.user_id) end,
    'followerCount',case when v.followers then (select count(*) from feed_data.member_follows f
      where f.target_id=p.user_id and feed_data.follower_visible(f.follower_id)) else 0 end,
    'followingCount',case when v.following then
      (select count(*) from feed_data.member_follows f where f.follower_id=p.user_id and feed_data.follower_visible(f.target_id))
      +(select count(*) from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
        where f.follower_id=p.user_id and feed_data.followable_institution(o)) end,
    'showFollowers',v.followers,'showFollowing',v.following)
  from (select 1) seed left join feed_data.profile_privacy s on s.user_id=p.user_id
  cross join lateral (select feed_data.f24_details(p.user_id,auth.uid()) and (p.user_id is not distinct from auth.uid()
      or coalesce(s.show_followers,true)) as followers,
    feed_data.f24_details(p.user_id,auth.uid()) and (p.user_id is not distinct from auth.uid() or coalesce(s.show_following,true)) as following) v
$$;

create or replace function feed_data.author_projection(p_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName',p.display_name,'username',p.username,
    'avatarPath',case when feed_data.f24_details(p_author,auth.uid()) and p.avatar_asset is not null and private.member_experience_flag('profilePictures') then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'personalClaims',case when feed_data.f24_details(p_author,auth.uid()) then private.reviewed_personal_claims(p.user_id) end,
    'verified',feed_data.f24_details(p_author,auth.uid()) and exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id
      and v.status='verified' and v.verification_type in ('identity','notable_person'))
  ) || case when feed_data.f24_details(p_author,auth.uid()) and feed_data.viewer_can_interact(p.user_id) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end from public.profiles p
  where p.user_id=p_author and p.is_visible and p.display_name is not null
    and private.member_discoverable(p.user_id) and private.institution_actor(p_user=>p_author);
$$;

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
          and feed_data.discussion_visible(v) and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() and feed_data.f24_identity(a,auth.uid()) and feed_data.f24_audience_follower(a.user_id,auth.uid()) and feed_data.viewer_unmuted(a.user_id)
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
      and p.published_at between p_at-interval '30 days' and p_at and p.author_id<>p_actor
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
      'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,'own',false,'recommendationReason',p.reason,'rankPosition',p.position)
      order by p.position)
    from (
      select p.*,r.position,state.reasons[r.position::integer] as reason
      from unnest(state.post_ids) with ordinality r(post_id,position)
      join feed_data.posts p on p.id=r.post_id join public.profiles a on a.user_id=p.author_id
      where r.position>p_after and p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only','followers') and feed_data.discussion_visible(p)
        and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id) and feed_data.f21_org_visible(p.organization_id)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;

create function feed_data.f24_allows_mention(p_target uuid,p_author uuid)
returns boolean language sql stable set search_path='' as $$
  select not feed_data.blocked_pair(p_target,p_author) and coalesce((select case s.mentions
    when 'no_one' then false when 'following' then exists(select from feed_data.member_follows f
      where f.follower_id=p_target and f.target_id=p_author and feed_data.f24_audience_follower(p_author,p_target))
    else true end from feed_data.profile_privacy s where s.user_id=p_target),true)
$$;
revoke all on function feed_data.f24_allows_mention(uuid,uuid) from public,anon,authenticated,service_role;


create or replace function feed_data.f21_index_content()
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
      select p.user_id into subject from public.profiles p where p.username=entry.token and feed_data.f24_identity(p,actor) and feed_data.f24_allows_mention(p.user_id,actor);
    end if;
    if subject is null then
      select o.id into org from private.organizations o
        where o.handle=regexp_replace(entry.token,'^org:','') and feed_data.followable_institution(o);
    end if;
    insert into feed_data.social_mentions(post_id,comment_id,token,member_id,organization_id)
      values(post.id,comment_ref,entry.token,subject,org) on conflict do nothing;
    if found and subject is not null and feed_data.discussion_visible(post)
      and (post.visibility<>'followers' or feed_data.f24_audience_follower(post.author_id,subject))
      and private.member_onboarding_access(subject)
      and (feed_data.community_member(post.community_id,subject) or feed_data.public_group_post(post.community_id,post.created_at)) then
      perform feed_data.f21_notice(subject,actor,'post_mention',post.id,comment_ref);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function feed_data.f21_mention_links(p_post uuid,p_comment uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(m.token,case when p.user_id is not null then '/members/'||p.username else '/organization/'||o.handle end),'{}')
  from feed_data.social_mentions m
  left join public.profiles p on p.user_id=m.member_id and feed_data.f24_identity(p,auth.uid())
    and feed_data.f24_details(p.user_id,auth.uid())
    and feed_data.f24_allows_mention(p.user_id,coalesce(
      (select author_id from feed_data.comments where id=p_comment),
      (select author_id from feed_data.posts where id=p_post)))
  left join private.organizations o on o.id=m.organization_id and feed_data.followable_institution(o)
  where m.post_id=p_post and m.comment_id is not distinct from p_comment and (p.user_id is not null or o.id is not null)
$$;

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
          when 'post_mention' then feed_data.f24_allows_mention(n.recipient_id,n.actor_id) and exists(select from feed_data.social_mentions m
            where m.post_id=p.id and m.comment_id is not distinct from n.comment_id and m.member_id=n.recipient_id)
            and (n.comment_id is null or exists(select from feed_data.comments c where c.id=n.comment_id
              and feed_data.comment_visible(c) and (c.parent_id is null or exists(select from feed_data.comments parent
                where parent.id=c.parent_id and feed_data.comment_visible(parent)))))
          when 'post_repost' then feed_data.f21_shareable(p) and exists(select from feed_data.reposts r
            where r.post_id=p.id and r.actor_id=n.actor_id)
          else exists(select from feed_data.post_quotes q join feed_data.posts source on source.id=q.source_id
            where q.post_id=p.id and source.author_id=n.recipient_id and feed_data.f21_shareable(source))
        end)
    when n.kind='follow_requested' then exists(select from feed_data.follow_requests r
      where r.requester_id=n.actor_id and r.target_id=n.recipient_id and n.dedupe='follow_requested:'||r.id::text)
    when n.kind='follow_approved' then exists(select from feed_data.member_follows f
      where f.follower_id=n.recipient_id and f.target_id=n.actor_id and f.explicitly_approved_at is not null)
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
