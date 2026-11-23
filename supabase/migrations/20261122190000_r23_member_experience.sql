-- R2.3 uses the same typed, versioned policy and atomic audit boundary as R2.1/R2.2.
create function private.member_experience_defaults()
returns jsonb language sql immutable set search_path='' as $$
  select '{"onboardingEnabled":true,"requireCompletion":false,"requireCountry":false,"requireDepartment":false,
    "requireInterests":false,"requireLanguage":true,"allowSkip":true,"showProgress":true,
    "profilesEnabled":true,"publicProfiles":true,"privateProfiles":true,"profileEdits":true,"profilePictures":true,
    "profileBiographies":true,"displayCountry":true,"displayDepartment":true,"displayInterests":true}'::jsonb
$$;

create table private.member_experience_policy (
  singleton boolean primary key default true check(singleton),
  value jsonb not null default private.member_experience_defaults(),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.member_experience_policy default values;
create table private.member_experience_events (
  revision integer primary key check(revision>1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  request_id uuid not null,
  occurred_at timestamptz not null,
  unique(actor_id,request_id)
);
create index member_experience_events_recent on private.member_experience_events(occurred_at desc,revision desc);
create table private.member_onboarding_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.member_experience_policy enable row level security;
alter table private.member_experience_events enable row level security;
alter table private.member_onboarding_cohort enable row level security;
revoke all on private.member_experience_policy,private.member_experience_events,private.member_onboarding_cohort
  from public,anon,authenticated,service_role;

alter table public.user_settings
  add column show_country boolean not null default false,
  add column show_department boolean not null default false,
  add column show_interests boolean not null default false;

-- Only new individual accounts enter the new lifecycle. Auth metadata is not consulted again.
create function private.capture_member_onboarding_cohort()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.is_anonymous and new.email is not null
    and coalesce(new.raw_user_meta_data->>'signup_path','individual')='individual'
    and not exists(select 1 from private.f1_founder_flow f cross join private.founder_registration r
      where f.signup_name=new.raw_user_meta_data->>'public_username' and r.configured_email=lower(btrim(new.email))
        and r.claimed_at is null and r.expires_at>clock_timestamp())
  then insert into private.member_onboarding_cohort(user_id) values(new.id); end if;
  return new;
end;
$$;
create trigger ayinou_member_onboarding_cohort after insert on auth.users
  for each row execute function private.capture_member_onboarding_cohort();

create function private.member_experience_flag(p_flag text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select value->p_flag='true'::jsonb from private.member_experience_policy where singleton),false)
$$;

create function private.member_onboarding_applies(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.member_onboarding_cohort where user_id=p_user)
$$;

create function private.member_onboarding_access(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (not private.member_onboarding_applies(p_user))
    or exists(select 1 from private.member_experience_policy p where p.singleton
      and (p.value->'onboardingEnabled'='false'::jsonb or p.value->'requireCompletion'='false'::jsonb
        or exists(select 1 from public.member_private m where m.user_id=p_user and m.onboarding_step=4)))
    or private.platform_founder(p_user) or private.platform_admin(p_user)
$$;

create function public.member_experience_for_member()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('policy',p.value,'applies',private.member_onboarding_applies(auth.uid()),
    'memberAccess',private.member_onboarding_access(auth.uid()))
  from private.member_experience_policy p
  where p.singleton and auth.uid() is not null and private.member_session_allowed()
$$;

create function public.founder_member_experience_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_value jsonb,p_expected integer,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.member_experience_policy; e private.member_experience_events; previous jsonb;
begin
  if p_request is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;
  if p_request is null then
    select * into p from private.member_experience_policy where singleton;
  else
    if p_expected is null or p_expected<1 or not coalesce(length(btrim(p_reason)) between 10 and 500 and p_reason !~ '[[:cntrl:]]',false)
      or jsonb_typeof(p_value) is distinct from 'object'
      or (p_value - array(select jsonb_object_keys(private.member_experience_defaults()))) <> '{}'::jsonb
      or exists(select 1 from jsonb_object_keys(private.member_experience_defaults()) k where jsonb_typeof(p_value->k) is distinct from 'boolean')
      then raise exception 'Invalid member policy update' using errcode='23514'; end if;
    select * into strict p from private.member_experience_policy where singleton for update;
    select * into e from private.member_experience_events where actor_id=p_actor and request_id=p_request;
    if found then
      if e.revision-1<>p_expected or e.new_value<>p_value or e.reason<>btrim(p_reason)
        then raise exception 'Request conflict' using errcode='O2002'; end if;
      return jsonb_build_object('value',e.new_value,'revision',e.revision,'updatedAt',e.occurred_at);
    end if;
    if p.revision<>p_expected then raise exception 'Stale revision' using errcode='O2004'; end if;
    if p.value=p_value then raise exception 'No changed value' using errcode='55000'; end if;
    previous:=p.value;
    update private.member_experience_policy set value=p_value,revision=revision+1,updated_at=clock_timestamp()
      where singleton returning * into p;
    insert into private.member_experience_events(revision,actor_id,previous_value,new_value,reason,request_id,occurred_at)
      values(p.revision,p_actor,previous,p_value,btrim(p_reason),p_request,p.updated_at);
  end if;
  if p.singleton is null then return null; end if;
  return jsonb_build_object('value',p.value,'revision',p.revision,'updatedAt',p.updated_at);
end;
$$;

create or replace function feed_data.member_allowed()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.member_session_allowed() and private.member_onboarding_access(auth.uid())
$$;

alter function public.save_member_profile_v2(jsonb) rename to save_member_profile_pre_r23;
alter function public.save_member_profile_pre_r23(jsonb) set schema private;
revoke all on function private.save_member_profile_pre_r23(jsonb) from public,anon,authenticated,service_role;

create function public.save_member_profile_v2(p_changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid();
  policy jsonb;
  m public.member_private;
  s public.user_settings;
  step_number integer;
  advancing boolean;
  governed boolean;
  profile_write boolean;
  explicit_skip boolean;
  details jsonb;
begin
  if uid is null or not private.member_session_allowed() then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}'::jsonb or pg_column_size(p_changes)>8192
    or exists(select 1 from unnest(array['skipOptional','showCountry','showDepartment','showInterests']) k
      where p_changes ? k and jsonb_typeof(p_changes->k)<>'boolean')
    then raise exception 'Invalid profile changes' using errcode='23514'; end if;
  select value into policy from private.member_experience_policy where singleton for share;
  if policy is null then raise exception 'Member policy unavailable' using errcode='R2302'; end if;
  select * into strict m from public.member_private where user_id=uid for update;
  select * into s from public.user_settings where user_id=uid;
  step_number:=coalesce((p_changes->>'onboardingStep')::integer,m.onboarding_step);
  governed:=private.member_onboarding_applies(uid);
  advancing:=m.onboarding_step<4 and p_changes ? 'onboardingStep';
  explicit_skip:=coalesce((p_changes->>'skipOptional')::boolean,false);
  details:=p_changes - array['skipOptional','showCountry','showDepartment','showInterests'];
  profile_write:=(details - array['discoverable','showMembershipCategory','preferredLocale'])<>'{}'::jsonb
    or coalesce((details->>'discoverable')::boolean,false) and not coalesce(s.discoverable,false)
    or coalesce((details->>'showMembershipCategory')::boolean,false) and not coalesce(s.show_membership_category,false)
    or coalesce((p_changes->>'showCountry')::boolean,false) and not coalesce(s.show_country,false)
    or coalesce((p_changes->>'showDepartment')::boolean,false) and not coalesce(s.show_department,false)
    or coalesce((p_changes->>'showInterests')::boolean,false) and not coalesce(s.show_interests,false);
  if profile_write and not advancing and (policy->'profilesEnabled'='false'::jsonb or policy->'profileEdits'='false'::jsonb)
    then raise exception 'Profile editing unavailable' using errcode='R2302'; end if;
  if advancing and governed and policy->'onboardingEnabled'='false'::jsonb
    then raise exception 'Onboarding unavailable' using errcode='R2302'; end if;
  if (details ? 'biography' and policy->'profileBiographies'='false'::jsonb)
    or (coalesce((details->>'discoverable')::boolean,false) and not coalesce(s.discoverable,false)
      and (policy->'profilesEnabled'='false'::jsonb or policy->'publicProfiles'='false'::jsonb))
    or (coalesce((p_changes->>'showCountry')::boolean,false) and not coalesce(s.show_country,false) and policy->'displayCountry'='false'::jsonb)
    or (coalesce((p_changes->>'showDepartment')::boolean,false) and not coalesce(s.show_department,false) and policy->'displayDepartment'='false'::jsonb)
    or (coalesce((p_changes->>'showInterests')::boolean,false) and not coalesce(s.show_interests,false) and policy->'displayInterests'='false'::jsonb)
    then raise exception 'Profile option unavailable' using errcode='R2302'; end if;
  if explicit_skip and (not advancing or step_number<>m.onboarding_step+1 or step_number not in (2,4)
    or (governed and policy->'allowSkip'='false'::jsonb))
    then raise exception 'This step cannot be skipped' using errcode='R2301'; end if;
  if advancing and governed and step_number>m.onboarding_step and step_number=1
    and policy->'requireLanguage'='true'::jsonb and not coalesce(details->>'preferredLocale' in ('ht','fr','en','es'),false)
    then raise exception 'Preferred language required' using errcode='R2301'; end if;
  if details<>'{}'::jsonb then perform private.save_member_profile_pre_r23(details); end if;
  -- Only the member’s explicit change can publish their profile; policy changes never do.
  if details ? 'discoverable' and (details->>'discoverable')::boolean is distinct from coalesce(s.discoverable,false) then
    update public.profiles set is_visible=(details->>'discoverable')::boolean where user_id=uid;
  end if;

  if advancing and governed and step_number>m.onboarding_step then
    select * into strict m from public.member_private where user_id=uid;
    if nullif(btrim(m.first_name),'') is null or nullif(btrim(m.last_name),'') is null or m.membership_category is null
      or (step_number>=2 and policy->'requireCountry'='true'::jsonb and m.residence_country_code is null)
      or (step_number>=2 and policy->'requireDepartment'='true'::jsonb and m.residence_country_code='HT' and m.residence_department_code is null)
      or (step_number=4 and policy->'requireInterests'='true'::jsonb
        and not exists(select 1 from public.member_interests where user_id=uid))
      then raise exception 'Required onboarding details are missing' using errcode='R2301'; end if;
  end if;

  if p_changes ?| array['showCountry','showDepartment','showInterests'] then
    insert into public.user_settings(user_id,show_country,show_department,show_interests)
      values(uid,coalesce((p_changes->>'showCountry')::boolean,false),
        coalesce((p_changes->>'showDepartment')::boolean,false),coalesce((p_changes->>'showInterests')::boolean,false))
    on conflict(user_id) do update set
      show_country=coalesce((p_changes->>'showCountry')::boolean,user_settings.show_country),
      show_department=coalesce((p_changes->>'showDepartment')::boolean,user_settings.show_department),
      show_interests=coalesce((p_changes->>'showInterests')::boolean,user_settings.show_interests);
  end if;
end;
$$;

create or replace function private.member_discoverable(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.member_experience_flag('profilesEnabled') and private.member_experience_flag('publicProfiles')
    and exists(select 1 from public.user_settings where user_id=p_user_id and discoverable)
$$;

-- Owner reads remain available. Restrict raw columns completely when the public projection applies redaction.
alter policy profile_discoverability on public.profiles
  using ((select auth.uid())=user_id or (private.member_discoverable(user_id)
    and private.member_experience_flag('profileBiographies') and private.member_experience_flag('profilePictures')));

create function public.member_profile_disclosure_for_api(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'countryCode',case when s.show_country and private.member_experience_flag('displayCountry') then m.residence_country_code end,
    'departmentCode',case when s.show_department and private.member_experience_flag('displayDepartment')
      then coalesce(m.residence_department_code,m.diaspora_department_code) end,
    'departmentName',case when s.show_department and private.member_experience_flag('displayDepartment') then
      (select d.name from public.departments d where d.code=coalesce(m.residence_department_code,m.diaspora_department_code)) end,
    'interests',case when s.show_interests and private.member_experience_flag('displayInterests') then
      (select jsonb_agg(interest_code order by interest_code) from public.member_interests where user_id=p.user_id) end)
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where p.user_id=p_user and feed_data.followable_member(p)
$$;

create function private.guard_member_avatar_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare policy jsonb;
begin
  if new.avatar_asset is distinct from old.avatar_asset and new.avatar_asset is not null then
    select value into policy from private.member_experience_policy where singleton for share;
    if not coalesce(policy->'profilesEnabled'='true'::jsonb and policy->'profilePictures'='true'::jsonb
      and (policy->'profileEdits'='true'::jsonb or exists(select 1 from public.member_private m where m.user_id=new.user_id and m.onboarding_step<4)),false)
    then raise exception 'Profile pictures unavailable' using errcode='R2302'; end if;
  end if;
  return new;
end;
$$;
create trigger ayinou_guard_member_avatar_policy before update of avatar_asset on public.profiles
  for each row execute function private.guard_member_avatar_policy();

revoke all on function private.member_experience_defaults(),private.capture_member_onboarding_cohort(),
  private.member_experience_flag(text),private.member_onboarding_applies(uuid),private.member_onboarding_access(uuid),
  private.guard_member_avatar_policy(),public.member_experience_for_member(),public.member_profile_disclosure_for_api(uuid),
  public.founder_member_experience_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,integer,text,uuid),public.save_member_profile_v2(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.member_experience_flag(text) to anon,authenticated;
grant execute on function public.member_experience_for_member(),public.save_member_profile_v2(jsonb) to authenticated;
grant execute on function public.member_profile_disclosure_for_api(uuid),
  public.founder_member_experience_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,integer,text,uuid) to service_role;

-- Guard existing profile and avatar projections without changing their contracts.
create or replace function public.find_public_profile_for_api(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.display_name,p.username,case when private.member_experience_flag('profileBiographies') then p.biography end,
    case when private.member_experience_flag('profilePictures') then p.avatar_asset end,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where (p.username=p_username or p.user_id=(select r.former_owner from private.username_retirements r where r.username=p_username and r.public_alias))
    and feed_data.followable_member(p);
$$;

create or replace function public.find_member_profile_for_client(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.display_name,p.username,case when private.member_experience_flag('profileBiographies') then p.biography end,
    case when private.member_experience_flag('profilePictures') then p.avatar_asset end,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where (p.username=p_username or p.user_id=(select r.former_owner from private.username_retirements r where r.username=p_username and r.public_alias))
    and feed_data.member_allowed() and feed_data.followable_member(p);
$$;

create or replace function feed_data.author_projection(p_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName',p.display_name,'username',p.username,
    'avatarPath',case when p.avatar_asset is not null and private.member_experience_flag('profilePictures') then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'personalClaims',private.reviewed_personal_claims(p.user_id),
    'verified',exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id
      and v.status='verified' and v.verification_type in ('identity','notable_person'))
  ) || case when feed_data.viewer_can_interact(p.user_id) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end from public.profiles p
  where p.user_id=p_author and p.is_visible and p.display_name is not null
    and private.member_discoverable(p.user_id) and private.institution_actor(p_user=>p_author);
$$;

create or replace function public.ambassador_directory_for_client(p_handle text,p_query text,p_category text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null and not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 20 or char_length(coalesce(p_query,''))>80
    or (p_category is not null and p_category not in ('community','education','culture','technology','service'))
    then raise exception 'invalid search' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('username',a.username,'displayName',a.display_name,
    'category',a.category,'statement',a.statement,
    'avatarPath',case when a.avatar_asset is not null and private.member_experience_flag('profilePictures') then a.user_id::text||'/'||a.avatar_asset::text||'.webp' end)
    order by a.username) from (
      select p.username,p.display_name,p.user_id,p.avatar_asset,c.category,c.statement
      from private.ambassador_cases c join public.profiles p on p.user_id=c.recipient_id
      where c.status='active' and c.public_opt_in and private.ambassador_public_eligible(c.recipient_id)
        and (p_handle is null or p.username=p_handle)
        and (p_category is null or c.category=p_category)
        and (p_after is null or p.username>p_after)
        and (coalesce(p_query,'')='' or strpos(lower(p.username),lower(p_query))>0 or strpos(lower(p.display_name),lower(p_query))>0)
      order by p.username limit p_limit+1) a),'[]');
end;
$$;

-- Read new revisions through the existing Founder-only audit projection.
create or replace function public.platform_policy_audit_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_high timestamptz,p_before_at timestamptz,p_before_source text,p_before_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare high timestamptz:=coalesce(p_high,statement_timestamp());
begin
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then return null; end if;
  if (p_high is null and num_nonnulls(p_before_at,p_before_source,p_before_revision)<>0)
    or (p_high is not null and (num_nonnulls(p_before_at,p_before_source,p_before_revision)<>3
      or p_before_at>high or p_before_source not in ('homepage','registration','member_experience') or p_before_revision<2))
    then raise exception 'Invalid policy history cursor' using errcode='22023'; end if;

  return (
    with homepage as (
      select 'homepage'::text collate "C" as source, revision,actor_id,reason,occurred_at,
        jsonb_build_object('homepageStatistics',previous_enabled) as previous_value,
        jsonb_build_object('homepageStatistics',enabled) as new_value
      from private.platform_boolean_policy_events
      where policy_key='homepage.community_statistics.enabled' and occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'homepage'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), registration as (
      select 'registration'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.registration_policy_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'registration'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), member_experience as (
      select 'member_experience'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.member_experience_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'member_experience'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), events as (
      select * from (select * from homepage union all select * from registration union all select * from member_experience) combined
      order by occurred_at desc,source desc,revision desc limit 21
    )
    select jsonb_build_object('high',high,'events',coalesce(jsonb_agg(jsonb_build_object(
      'source',e.source,'revision',e.revision,'actorId',e.actor_id,'actorUsername',p.username,
      'reason',e.reason,'occurredAt',e.occurred_at,'changes',coalesce((
        select jsonb_agg(jsonb_build_object('key',k.key,'before',e.previous_value->k.key,'after',e.new_value->k.key) order by k.position)
        from unnest(array['homepageStatistics','enabled','mode','individualEnabled','organizationEnabled','referralsEnabled','rewardsEnabled',
          'onboardingEnabled','requireCompletion','requireCountry','requireDepartment','requireInterests','requireLanguage','allowSkip','showProgress',
          'profilesEnabled','publicProfiles','privateProfiles','profileEdits','profilePictures','profileBiographies','displayCountry','displayDepartment','displayInterests'])
          with ordinality as k(key,position)
        where e.previous_value ? k.key and e.new_value ? k.key
          and e.previous_value->k.key is distinct from e.new_value->k.key
      ),'[]'::jsonb)
    ) order by e.occurred_at desc,e.source desc,e.revision desc),'[]'::jsonb))
    from events e left join public.profiles p on p.user_id=e.actor_id
  );
end;
$$;

create function public.member_feature_access_for_client()
returns boolean language sql stable security definer set search_path='' as $$
  select case when auth.uid() is not null and private.member_session_allowed()
    then private.member_onboarding_access(auth.uid()) else null end
$$;
revoke all on function public.member_feature_access_for_client() from public,anon,authenticated,service_role;
grant execute on function public.member_feature_access_for_client() to authenticated;
