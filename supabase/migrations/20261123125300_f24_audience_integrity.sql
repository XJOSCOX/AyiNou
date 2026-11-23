-- Once an existing Followers post requires approval, a profile-setting change cannot widen its audience.
alter table feed_data.posts add column followers_require_approval boolean not null default false;
alter table feed_data.profile_privacy add column followers_approval_epoch timestamptz;

create function feed_data.f24_set_approval_epoch() returns trigger
language plpgsql set search_path='' as $$
begin
  if (new.mode='private' or new.follow_policy='approval') and (tg_op='INSERT'
      or (old.mode<>'private' and old.follow_policy<>'approval')) then
    new.followers_approval_epoch:=clock_timestamp();
  end if;
  return new;
end
$$;
create trigger f24_set_approval_epoch before insert or update of mode,follow_policy on feed_data.profile_privacy
  for each row execute function feed_data.f24_set_approval_epoch();
update feed_data.profile_privacy set followers_approval_epoch=clock_timestamp()
  where mode='private' or follow_policy='approval';
revoke all on function feed_data.f24_set_approval_epoch() from public,anon,authenticated,service_role;

create function feed_data.f24_audience_follower(p_author uuid,p_viewer uuid,p_requires_approval boolean,p_created_at timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select p_viewer is not null and (p_author=p_viewer or exists (
    select from feed_data.member_follows f where f.target_id=p_author and f.follower_id=p_viewer
      and (f.explicitly_approved_at is not null or (not p_requires_approval and feed_data.f24_mode(p_author)<>'private' and feed_data.f24_follow_policy(p_author)<>'approval'
        and not exists(select from feed_data.profile_privacy s where s.user_id=p_author and s.followers_approval_epoch>=p_created_at)))))
    and not feed_data.blocked_pair(p_author,p_viewer)
$$;

create function feed_data.f24_viewer_is_follower(p_author uuid,p_requires_approval boolean,p_created_at timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select feed_data.member_allowed() and feed_data.f24_audience_follower(p_author,auth.uid(),p_requires_approval,p_created_at)
$$;

create function feed_data.f24_post_approval_floor() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.visibility='followers' then
    -- Serialize with privacy settings before reading the effective audience. The profile update
    -- path never locks posts, so it cannot deadlock with a concurrent audience edit.
    perform 1 from public.profiles where user_id=new.author_id for share;
    new.followers_require_approval:=new.followers_require_approval
      or feed_data.f24_mode(new.author_id)='private' or feed_data.f24_follow_policy(new.author_id)='approval';
  else
    new.followers_require_approval:=false;
  end if;
  return new;
end
$$;
create trigger f24_post_approval_floor before insert or update of visibility on feed_data.posts
  for each row execute function feed_data.f24_post_approval_floor();

-- Preserve an approval-only publication even if its author subsequently opens their profile.
update feed_data.posts p set followers_require_approval=true where p.visibility='followers'
  and (feed_data.f24_mode(p.author_id)='private' or feed_data.f24_follow_policy(p.author_id)='approval');

revoke all on function feed_data.f24_audience_follower(uuid,uuid,boolean,timestamptz),
  feed_data.f24_viewer_is_follower(uuid,boolean,timestamptz),feed_data.f24_post_approval_floor()
  from public,anon,authenticated,service_role;
grant execute on function feed_data.f24_viewer_is_follower(uuid,boolean,timestamptz) to authenticated;

alter policy feed_members on feed_data.posts using (
  (select feed_data.member_allowed()) and deleted_at is null and
  ((author_id=(select auth.uid()) and status in ('draft','published','hidden'))
   or (status='published' and feed_data.author_active(author_id) and
     (visibility in ('public','members_only') or (visibility='followers'
       and feed_data.f24_viewer_is_follower(author_id,followers_require_approval,created_at)))))
);


create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id) and feed_data.f21_org_visible(p.organization_id)
    and (case when auth.uid() is null then p.visibility='public' or feed_data.public_group_post(p.community_id,p.created_at)
      else (p.visibility in ('public','members_only') or (p.visibility='followers' and feed_data.f24_viewer_is_follower(p.author_id,p.followers_require_approval,p.created_at))) and feed_data.member_allowed()
        and (feed_data.can_read_community(p.community_id) or feed_data.public_group_post(p.community_id,p.created_at)) end),false)
$$;

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
      and (post.visibility<>'followers' or feed_data.f24_audience_follower(post.author_id,subject,post.followers_require_approval,post.created_at))
      and private.member_onboarding_access(subject)
      and (feed_data.community_member(post.community_id,subject) or feed_data.public_group_post(post.community_id,post.created_at)) then
      perform feed_data.f21_notice(subject,actor,'post_mention',post.id,comment_ref);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.public_recognition_badges(p_username text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(private.recognition_badge_card(b) order by a.awarded_at desc,a.id desc),'[]')
  from (
    select r.id,r.badge_id,r.awarded_at
    from (select (public.social_profile_for_client(lower(p_username))->>'userId')::uuid as user_id) p
    join private.recognition_awards r on r.user_id=p.user_id
    join private.recognition_badges rb on rb.id=r.badge_id
    where private.verification_policy_flag('recognitionEnabled') and private.verification_policy_flag('recognitionPublic')
      and r.show_public and r.revoked_at is null and not rb.archived and rb.public_enabled
      and (auth.uid() is null or feed_data.viewer_can_interact(p.user_id))
    order by r.awarded_at desc,r.id desc limit 24
  ) a join private.recognition_badges b on b.id=a.badge_id
$$;

-- Where a member may see a private identity, keep their approved relationship navigable.
create or replace function feed_data.f24_audience_follower(p_author uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_viewer is not null and (p_author=p_viewer or exists (
    select from feed_data.member_follows f where f.target_id=p_author and f.follower_id=p_viewer
      and (f.explicitly_approved_at is not null or (feed_data.f24_mode(p_author)<>'private'
        and feed_data.f24_follow_policy(p_author)<>'approval'))))
    and not feed_data.blocked_pair(p_author,p_viewer)
$$;

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


create or replace function public.follow_list_for_client(p_view text,p_key text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  subject uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_view is null or p_view not in ('mine','followers','following','institution_followers')
    or p_limit is null or p_limit not between 1 and 20 or char_length(coalesce(p_after,''))>52
  then raise exception 'invalid list' using errcode='22023'; end if;

  if p_view='institution_followers' then
    select o.id into subject from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o);
    if not found then raise exception 'institution unavailable' using errcode='PFR04'; end if;
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from feed_data.institution_follows f join public.profiles x on x.user_id=f.follower_id
      where f.organization_id=subject and x.username>coalesce(p_after,'') and feed_data.followable_member(x)
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;
  if p_view='mine' then subject:=auth.uid();
  else
    select p.user_id into subject from public.profiles p where p.username=p_key and feed_data.f24_identity(p,auth.uid());
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
  end if;

  if subject<>auth.uid() and (not feed_data.f24_details(subject,auth.uid()) or not coalesce((
    select case when p_view='followers' then show_followers else show_following end from feed_data.profile_privacy where user_id=subject
  ),true)) then raise exception 'list unavailable' using errcode='PFR04'; end if;
  if p_view='followers' then
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from feed_data.member_follows f join public.profiles x on x.user_id=f.follower_id
      where f.target_id=subject and x.username>coalesce(p_after,'') and (feed_data.followable_member(x)
        or (subject=auth.uid() and feed_data.author_active(x.user_id) and not feed_data.blocked_pair(subject,x.user_id)))
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;

  return coalesce((select jsonb_agg(card order by key) from (
    select 'member:'||p.username as key,feed_data.member_card(p) as card
      from feed_data.member_follows f join public.profiles p on p.user_id=f.target_id
      where f.follower_id=subject
        and (feed_data.followable_member(p) or (subject=auth.uid() and f.explicitly_approved_at is not null
          and feed_data.f24_identity(p,auth.uid())))
        and 'member:'||p.username>coalesce(p_after,'')
    union all
    select 'institution:'||o.handle,feed_data.institution_card(o)
      from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
      where f.follower_id=subject and feed_data.followable_institution(o) and 'institution:'||o.handle>coalesce(p_after,'')
    order by key limit p_limit+1
  ) eligible),'[]'::jsonb);
end;
$$;
