-- Preserve existing profiles, disclosure settings, and follows.
create table feed_data.profile_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'public' check(mode in ('public','limited','private')),
  follow_policy text not null default 'everyone' check(follow_policy in ('everyone','approval','no_one')),
  show_followers boolean not null default true,
  show_following boolean not null default true,
  show_biography boolean not null default true,
  show_activity boolean not null default false,
  share_language boolean not null default false,
  mentions text not null default 'everyone' check(mentions in ('everyone','following','no_one')),
  follow_notices boolean not null default false
);
alter table feed_data.profile_privacy enable row level security;
revoke all on feed_data.profile_privacy from public,anon,authenticated,service_role;

alter table feed_data.member_follows add column explicitly_approved_at timestamptz;
create table feed_data.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  unique(requester_id,target_id),
  check(requester_id<>target_id)
);
create index f24_follow_requests_incoming on feed_data.follow_requests(target_id,created_at desc,id);
alter table feed_data.follow_requests enable row level security;
revoke all on feed_data.follow_requests from public,anon,authenticated,service_role;

create function feed_data.f24_mode(p_user uuid) returns text language sql stable set search_path='' as $$
  select coalesce((select mode from feed_data.profile_privacy where user_id=p_user),'public')
$$;

create function feed_data.f24_identity(p public.profiles,p_viewer uuid) returns boolean language sql stable set search_path='' as $$
  select coalesce(p.username is not null and p.display_name is not null and feed_data.author_active(p.user_id)
    and private.member_experience_flag('profilesEnabled') and not feed_data.blocked_pair(p_viewer,p.user_id)
    and (p_viewer=p.user_id or (
      p.is_visible and private.member_discoverable(p.user_id)
      and (p_viewer is not null or feed_data.f24_mode(p.user_id)='public')
    )),false)
$$;

create function feed_data.f24_details(p_user uuid,p_viewer uuid) returns boolean language sql stable set search_path='' as $$
  select coalesce(p_user=p_viewer or case feed_data.f24_mode(p_user)
    when 'public' then true
    when 'limited' then p_viewer is not null
    else exists(select 1 from feed_data.member_follows f
      where f.follower_id=p_viewer and f.target_id=p_user and f.explicitly_approved_at is not null)
    end,false) and not feed_data.blocked_pair(p_viewer,p_user)
$$;

create or replace function feed_data.followable_member(p public.profiles)
returns boolean language sql stable set search_path='' as $$
  select feed_data.f24_identity(p,auth.uid()) and p.is_visible and private.member_discoverable(p.user_id)
    and feed_data.f24_mode(p.user_id)<>'private'
$$;

-- Public fields are served through the redacting projections. Raw columns are self-only.
alter policy profile_discoverability on public.profiles using ((select auth.uid())=user_id);

create function feed_data.f24_privacy_payload(p_user uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('mode',coalesce(s.mode,'public'),'followPolicy',coalesce(s.follow_policy,'everyone'),
    'showFollowers',coalesce(s.show_followers,true),'showFollowing',coalesce(s.show_following,true),
    'showBiography',coalesce(s.show_biography,true),'showActivity',coalesce(s.show_activity,false),
    'shareLanguage',coalesce(s.share_language,false),'mentions',coalesce(s.mentions,'everyone'),
    'followNotices',coalesce(s.follow_notices,false))
  from (select 1) seed left join feed_data.profile_privacy s on s.user_id=p_user
$$;

create function public.social_privacy_for_client(p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_settings is not null then
    if jsonb_typeof(p_settings)<>'object'
      or not (p_settings ?& array['mode','followPolicy','showFollowers','showFollowing','showBiography','showActivity','shareLanguage','mentions','followNotices'])
      or (p_settings - array['mode','followPolicy','showFollowers','showFollowing','showBiography','showActivity','shareLanguage','mentions','followNotices'])<>'{}'::jsonb
      or exists(select from unnest(array['showFollowers','showFollowing','showBiography','showActivity','shareLanguage','followNotices']) k
        where jsonb_typeof(p_settings->k) is distinct from 'boolean')
      then raise exception 'invalid settings' using errcode='22023'; end if;
    if (p_settings->>'mode'='private' and not private.member_experience_flag('privateProfiles'))
      or (p_settings->>'mode' in ('public','limited') and not private.member_experience_flag('publicProfiles'))
      then raise exception 'profile visibility unavailable' using errcode='42501'; end if;
    perform feed_data.consume_limit(actor,'notification_write',40);
    perform 1 from public.profiles where user_id=actor for no key update;
    insert into feed_data.profile_privacy(user_id,mode,follow_policy,show_followers,show_following,show_biography,show_activity,share_language,mentions,follow_notices)
      values(actor,p_settings->>'mode',p_settings->>'followPolicy',(p_settings->>'showFollowers')::boolean,
        (p_settings->>'showFollowing')::boolean,(p_settings->>'showBiography')::boolean,(p_settings->>'showActivity')::boolean,
        (p_settings->>'shareLanguage')::boolean,p_settings->>'mentions',(p_settings->>'followNotices')::boolean)
    on conflict(user_id) do update set mode=excluded.mode,follow_policy=excluded.follow_policy,
      show_followers=excluded.show_followers,show_following=excluded.show_following,show_biography=excluded.show_biography,
      show_activity=excluded.show_activity,share_language=excluded.share_language,mentions=excluded.mentions,follow_notices=excluded.follow_notices;
    if p_settings->>'followPolicy'='no_one' then delete from feed_data.follow_requests where target_id=actor; end if;
  end if;
  return feed_data.f24_privacy_payload(actor);
end
$$;

-- One viewer-bound projection ensures shell-only views never sign an avatar or return personal details.
create function feed_data.f24_profile(p_username text,p_viewer uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'userId',case when v.details then p.user_id end,
    'displayName',p.display_name,'username',p.username,'mode',feed_data.f24_mode(p.user_id),'detailsVisible',v.details,
    'biography',case when v.details and coalesce(social.show_biography,true) and private.member_experience_flag('profileBiographies') then p.biography end,
    'avatarAsset',case when v.details and private.member_experience_flag('profilePictures') then p.avatar_asset end,
    'membershipCategory',case when v.details and s.show_membership_category then m.membership_category end,
    'countryCode',case when v.details and s.show_country and private.member_experience_flag('displayCountry') then m.residence_country_code end,
    'departmentCode',case when v.details and s.show_department and private.member_experience_flag('displayDepartment')
      then coalesce(m.residence_department_code,m.diaspora_department_code) end,
    'departmentName',case when v.details and s.show_department and private.member_experience_flag('displayDepartment')
      then (select d.name from public.departments d where d.code=coalesce(m.residence_department_code,m.diaspora_department_code)) end,
    'interests',case when v.details and s.show_interests and private.member_experience_flag('displayInterests')
      then (select jsonb_agg(interest_code order by interest_code) from public.member_interests where user_id=p.user_id) end,
    'activityVisible',v.details and coalesce(social.show_activity,false)
  )
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  left join feed_data.profile_privacy social using(user_id)
  cross join lateral (select feed_data.f24_details(p.user_id,p_viewer) as details) v
  where (p.username=p_username or p.user_id=(select r.former_owner from private.username_retirements r where r.username=p_username and r.public_alias))
    and feed_data.f24_identity(p,p_viewer)
$$;

create function public.social_profile_for_client(p_username text) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when auth.uid() is null or feed_data.member_allowed()
    then feed_data.f24_profile(p_username,auth.uid()) end
$$;

-- Keep the legacy projections safe as well. They remain used by existing consumers.
create or replace function public.find_public_profile_for_api(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select (v->>'userId')::uuid,v->>'displayName',v->>'username',v->>'biography',(v->>'avatarAsset')::uuid,v->>'membershipCategory'
  from (select feed_data.f24_profile(p_username,null) v) z where v->>'userId' is not null
$$;

create or replace function public.find_member_profile_for_client(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select (v->>'userId')::uuid,v->>'displayName',v->>'username',v->>'biography',(v->>'avatarAsset')::uuid,v->>'membershipCategory'
  from (select public.social_profile_for_client(p_username) v) z where v->>'userId' is not null
$$;

create function feed_data.f24_follow_policy(p_user uuid) returns text language sql stable set search_path='' as $$
  select case when f.policy='no_one' then 'no_one'
    when f.policy='approval' or feed_data.f24_mode(p_user)='private' then 'approval' else 'everyone' end
  from (select coalesce((select follow_policy from feed_data.profile_privacy where user_id=p_user),'everyone') policy) f
$$;

create function feed_data.f24_requests_removed_on_block()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from feed_data.follow_requests where (requester_id=new.actor_id and target_id=new.target_id)
    or (requester_id=new.target_id and target_id=new.actor_id);
  return new;
end
$$;
create trigger f24_remove_requests_on_block after insert on feed_data.member_blocks
  for each row execute function feed_data.f24_requests_removed_on_block();

revoke all on function feed_data.f24_mode(uuid),feed_data.f24_identity(public.profiles,uuid),feed_data.f24_details(uuid,uuid),
  feed_data.f24_privacy_payload(uuid),feed_data.f24_profile(text,uuid),feed_data.f24_follow_policy(uuid),
  feed_data.f24_requests_removed_on_block(),public.social_profile_for_client(text),public.social_privacy_for_client(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.social_profile_for_client(text) to anon,authenticated;
grant execute on function public.social_privacy_for_client(jsonb) to authenticated;


create function feed_data.f24_member_follow_status(p public.profiles) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'following',exists(select from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id
      and (feed_data.f24_follow_policy(p.user_id)<>'approval' or f.explicitly_approved_at is not null)),
    'requestPending',exists(select from feed_data.follow_requests r where r.requester_id=auth.uid() and r.target_id=p.user_id),
    'requiresApproval',feed_data.f24_follow_policy(p.user_id)='approval',
    'canFollow',auth.uid() is not null and auth.uid()<>p.user_id and (feed_data.f24_follow_policy(p.user_id)<>'no_one'
      or exists(select from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id)),
    'mutual',exists(select from feed_data.member_follows f join feed_data.member_follows r
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

create function feed_data.f24_follow_notification(p_recipient uuid,p_actor uuid,p_kind text,p_event uuid)
returns void language plpgsql set search_path='' as $$
begin
  if exists(select from feed_data.profile_privacy where user_id=p_recipient and follow_notices)
    and feed_data.author_active(p_recipient) and feed_data.author_active(p_actor)
    and not feed_data.blocked_pair(p_recipient,p_actor)
    and not exists(select from feed_data.notification_preferences where user_id=p_recipient and not followers)
    and not exists(select from feed_data.member_mutes where actor_id=p_recipient and target_id=p_actor) then
    insert into feed_data.notifications(recipient_id,actor_id,kind,dedupe)
      values(p_recipient,p_actor,p_kind,p_kind||':'||p_event::text) on conflict(recipient_id,dedupe) do nothing;
  end if;
end
$$;

create function feed_data.f24_write_member_follow(p_key text,p_follow boolean)
returns jsonb language plpgsql set search_path='' as $$
declare viewer uuid:=auth.uid(); account public.profiles; policy text; event uuid;
begin
  select * into account from public.profiles where username=p_key;
  if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
  if viewer=account.user_id then raise exception 'self follow' using errcode='42501'; end if;
  perform feed_data.lock_member_pair(viewer,account.user_id);
  select p.* into account from public.profiles p where p.user_id=account.user_id for no key update;
  if not feed_data.f24_identity(account,viewer) then raise exception 'account unavailable' using errcode='PFR04'; end if;
  if not p_follow then
    delete from feed_data.follow_requests where requester_id=viewer and target_id=account.user_id returning id into event;
    if event is null then delete from feed_data.member_follows where follower_id=viewer and target_id=account.user_id; end if;
  else
    policy:=feed_data.f24_follow_policy(account.user_id);
    if policy='no_one' then raise exception 'follow unavailable' using errcode='42501'; end if;
    if not exists(select from feed_data.member_follows f where f.follower_id=viewer and f.target_id=account.user_id)
      and (select count(*) from feed_data.member_follows where follower_id=viewer)
      +(select count(*) from feed_data.institution_follows where follower_id=viewer)>=1000
      then raise exception 'following ceiling' using errcode='PFD12'; end if;
    if policy='approval' then
      if not exists(select from feed_data.member_follows where follower_id=viewer and target_id=account.user_id and explicitly_approved_at is not null) then
        if not exists(select from feed_data.follow_requests where requester_id=viewer and target_id=account.user_id)
          and (select count(*) from feed_data.follow_requests where requester_id=viewer)>=100
          then raise exception 'request ceiling' using errcode='PFD12'; end if;
        insert into feed_data.follow_requests(requester_id,target_id)
          values(viewer,account.user_id) on conflict do nothing returning id into event;
        if event is not null then perform feed_data.f24_follow_notification(account.user_id,viewer,'follow_requested',event); end if;
      end if;
    elsif not exists(select from feed_data.follow_requests where requester_id=viewer and target_id=account.user_id) then
      insert into feed_data.member_follows(follower_id,target_id) values(viewer,account.user_id) on conflict do nothing;
    end if;
  end if;
  return feed_data.f24_member_follow_status(account);
end
$$;

create function public.follow_requests_for_client(p_view text,p_before_at timestamptz,p_before_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_view is null or p_view not in ('incoming','outgoing') or p_limit is null or p_limit not between 1 and 20
    or ((p_before_at is null)<>(p_before_id is null)) then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'createdAt',x.created_at,'username',x.username,
    'displayName',x.display_name) order by x.created_at desc,x.id desc)
    from (select r.id,r.created_at,p.username,p.display_name from feed_data.follow_requests r
      join public.profiles p on p.user_id=case when p_view='incoming' then r.requester_id else r.target_id end
      where (case when p_view='incoming' then r.target_id else r.requester_id end)=viewer
        and feed_data.author_active(p.user_id) and not feed_data.blocked_pair(viewer,p.user_id)
        and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
      order by r.created_at desc,r.id desc limit p_limit+1) x),'[]'::jsonb);
end
$$;

create function public.resolve_follow_request_for_client(p_request uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); r feed_data.follow_requests;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_action is null or p_action not in ('approve','reject','cancel') then raise exception 'invalid action' using errcode='22023'; end if;
  perform feed_data.consume_limit(viewer,'follow_write',20);
  select * into r from feed_data.follow_requests where id=p_request;
  if not found or viewer is distinct from (case when p_action='cancel' then r.requester_id else r.target_id end)
    then raise exception 'request unavailable' using errcode='PFR04'; end if;
  -- Serialize the requester’s follow cap and use the same pair lock as blocking.
  perform pg_advisory_xact_lock(hashtextextended('f24-follows:'||r.requester_id::text,0));
  perform feed_data.lock_member_pair(r.requester_id,r.target_id);
  perform 1 from public.profiles where user_id=r.target_id for no key update;
  select * into r from feed_data.follow_requests where id=p_request for update;
  if not found then raise exception 'request unavailable' using errcode='PFR04'; end if;
  if p_action='approve' then
    if feed_data.blocked_pair(r.requester_id,r.target_id) or not feed_data.author_active(r.requester_id)
      or feed_data.f24_follow_policy(r.target_id)='no_one'
      then raise exception 'request unavailable' using errcode='PFR04'; end if;
    if not exists(select from feed_data.member_follows where follower_id=r.requester_id and target_id=r.target_id)
      and (select count(*) from feed_data.member_follows where follower_id=r.requester_id)
      +(select count(*) from feed_data.institution_follows where follower_id=r.requester_id)>=1000
      then raise exception 'following ceiling' using errcode='PFD12'; end if;
    insert into feed_data.member_follows(follower_id,target_id,explicitly_approved_at)
      values(r.requester_id,r.target_id,clock_timestamp())
      on conflict(follower_id,target_id) do update set explicitly_approved_at=excluded.explicitly_approved_at;
    perform feed_data.f24_follow_notification(r.requester_id,r.target_id,'follow_approved',r.id);
  end if;
  delete from feed_data.follow_requests where id=p_request;
end
$$;

create function public.remove_follower_for_client(p_username text)
returns void language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); peer uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  perform feed_data.consume_limit(viewer,'follow_write',20);
  select user_id into peer from public.profiles where username=p_username;
  if peer is null then return; end if;
  perform feed_data.lock_member_pair(viewer,peer);
  delete from feed_data.member_follows where target_id=viewer and follower_id=peer;
  delete from feed_data.follow_requests where target_id=viewer and requester_id=peer;
end
$$;


create or replace function public.follow_status_for_client(p_kind text,p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  member public.profiles;
  org private.organizations;
  actor uuid:=auth.uid();
begin
  if actor is not null and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind='member' then
    select p.* into member from public.profiles p where p.username=p_key and feed_data.f24_identity(p,actor);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return feed_data.f24_member_follow_status(member);
  elsif p_kind='institution' then
    if p_key is null or p_key !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid identifier' using errcode='22023'; end if;
    select o.* into org from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return jsonb_build_object(
      'following',exists(select 1 from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=org.id),
      'canFollow',actor is not null,
      'verified',org.verification_status='verified',
      'followerCount',(select count(*) from feed_data.institution_follows f where f.organization_id=org.id and feed_data.follower_visible(f.follower_id)),
      'followingCount',null
    );
  end if;
  raise exception 'invalid target' using errcode='22023';
end;
$$;
create or replace function public.write_follow_for_client(p_kind text,p_key text,p_follow boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid;
  already boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(actor,'follow_write',20);
  begin
    if p_follow is null or p_key is null then raise exception 'invalid follow' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('f24-follows:'||actor::text,0));
    if p_kind='member' then
      return feed_data.f24_write_member_follow(p_key,p_follow);
    elsif p_kind='institution' then
      select o.id into target from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o) for share;
      if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
      select exists(select 1 from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=target) into already;
    else raise exception 'invalid target' using errcode='22023';
    end if;
    if p_follow and not already and
      (select count(*) from feed_data.member_follows f where f.follower_id=actor)
      +(select count(*) from feed_data.institution_follows f where f.follower_id=actor)>=1000
    then raise exception 'following ceiling' using errcode='PFD12'; end if;

    if p_follow then
      insert into feed_data.institution_follows(follower_id,organization_id) values(actor,target) on conflict do nothing;
    else
      delete from feed_data.institution_follows where follower_id=actor and organization_id=target;
    end if;
    return public.follow_status_for_client(p_kind,p_key);
  exception when sqlstate 'PFR04' or sqlstate 'PFD12' or insufficient_privilege or invalid_parameter_value or invalid_text_representation
  then return jsonb_build_object('error',sqlstate);
  end;
end;
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
      where f.follower_id=subject and feed_data.followable_member(p) and 'member:'||p.username>coalesce(p_after,'')
    union all
    select 'institution:'||o.handle,feed_data.institution_card(o)
      from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
      where f.follower_id=subject and feed_data.followable_institution(o) and 'institution:'||o.handle>coalesce(p_after,'')
    order by key limit p_limit+1
  ) eligible),'[]'::jsonb);
end;
$$;


alter table feed_data.notifications drop constraint notifications_kind_check,
add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved','project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested','follow_approved'));

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


revoke all on function feed_data.f24_member_follow_status(public.profiles),feed_data.f24_follow_notification(uuid,uuid,text,uuid),
  feed_data.f24_write_member_follow(text,boolean),public.follow_requests_for_client(text,timestamptz,uuid,integer),
  public.resolve_follow_request_for_client(uuid,text),public.remove_follower_for_client(text) from public,anon,authenticated,service_role;
grant execute on function public.follow_requests_for_client(text,timestamptz,uuid,integer),
  public.resolve_follow_request_for_client(uuid,text),public.remove_follower_for_client(text) to authenticated;
