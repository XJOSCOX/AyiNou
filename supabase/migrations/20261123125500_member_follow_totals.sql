-- Count eligible relationships independently of which follower identities can appear in lists.
create or replace function feed_data.f24_member_follow_status(p public.profiles) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'self',p.user_id=auth.uid(),
    'following',p.user_id is distinct from auth.uid() and feed_data.f24_audience_follower(p.user_id,auth.uid()),
    'requestPending',exists(select from feed_data.follow_requests r where r.requester_id=auth.uid() and r.target_id=p.user_id),
    'requiresApproval',feed_data.f24_follow_policy(p.user_id)='approval',
    'canFollow',auth.uid() is not null and auth.uid()<>p.user_id and (feed_data.f24_follow_policy(p.user_id)<>'no_one'
      or exists(select from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id)),
    'mutual',feed_data.f24_details(p.user_id,auth.uid()) and feed_data.f24_audience_follower(p.user_id,auth.uid()) and exists(select from feed_data.member_follows f join feed_data.member_follows r
      on r.follower_id=f.target_id and r.target_id=f.follower_id where f.follower_id=auth.uid() and f.target_id=p.user_id),
    'verified',feed_data.f24_details(p.user_id,auth.uid()) and cardinality(private.reviewed_personal_claims(p.user_id))>0,
    'personalClaims',case when feed_data.f24_details(p.user_id,auth.uid()) then private.reviewed_personal_claims(p.user_id) end,
    'followerCount',case when v.followers then (select count(*) from feed_data.member_follows f
      where f.target_id=p.user_id and feed_data.author_active(f.follower_id)
        and feed_data.viewer_can_interact(f.follower_id)
        and (f.explicitly_approved_at is not null or eligibility.immediate)) else 0 end,
    'followingCount',case when v.following then
      (select count(*) from feed_data.member_follows f where f.follower_id=p.user_id and feed_data.author_active(f.target_id)
        and feed_data.viewer_can_interact(f.target_id)
        and (f.explicitly_approved_at is not null or (feed_data.f24_mode(f.target_id)<>'private'
          and feed_data.f24_follow_policy(f.target_id)<>'approval')))
      +(select count(*) from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
        where f.follower_id=p.user_id and feed_data.followable_institution(o)) end,
    'showFollowers',v.followers,'showFollowing',v.following)
  from (select 1) seed left join feed_data.profile_privacy s on s.user_id=p.user_id
  cross join lateral (select feed_data.f24_mode(p.user_id)<>'private'
    and feed_data.f24_follow_policy(p.user_id)<>'approval' as immediate) eligibility
  cross join lateral (select feed_data.f24_details(p.user_id,auth.uid()) and (p.user_id is not distinct from auth.uid()
      or coalesce(s.show_followers,true)) as followers,
    feed_data.f24_details(p.user_id,auth.uid()) and (p.user_id is not distinct from auth.uid() or coalesce(s.show_following,true)) as following) v
$$;
