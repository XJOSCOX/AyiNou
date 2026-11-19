-- Keep legacy account/profile callers working while Phase 2B clients save each stage.
alter table public.member_private
  add column first_name text check (first_name = btrim(first_name) and char_length(first_name) between 1 and 80 and first_name !~ '[[:cntrl:]]'),
  add column last_name text check (last_name = btrim(last_name) and char_length(last_name) between 1 and 80 and last_name !~ '[[:cntrl:]]'),
  add column membership_category text check (membership_category in ('haitian', 'international_supporter')),
  add column onboarding_step integer not null default 0 check (onboarding_step between 0 and 4),
  add constraint member_onboarding_requirements check (
    onboarding_step = 0 or (first_name is not null and last_name is not null and membership_category is not null)
  );

alter table public.profiles
  add column username text constraint profiles_username_key unique
    check (username ~ '^[a-z0-9][a-z0-9_]{2,23}$' and username not in ('admin','support','ayinou','system','root','moderator','administrator')),
  add column biography text check (biography = btrim(biography) and char_length(biography) <= 320),
  add column avatar_asset uuid;

create table public.user_settings (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  discoverable boolean not null default false,
  show_membership_category boolean not null default false
);

create table public.interest_catalog (
  code text primary key
);
insert into public.interest_catalog(code) values
  ('education'), ('peace'), ('healthcare'), ('agriculture'), ('technology'),
  ('entrepreneurship'), ('employment'), ('environment'), ('infrastructure'), ('culture');

create table public.member_interests (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  interest_code text not null references public.interest_catalog(code),
  primary key (user_id, interest_code)
);

alter table public.user_settings enable row level security;
alter table public.interest_catalog enable row level security;
alter table public.member_interests enable row level security;
revoke all on public.user_settings, public.interest_catalog, public.member_interests from public, anon, authenticated, service_role;
grant select on public.interest_catalog to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, delete on public.member_interests to authenticated;
grant all on public.user_settings, public.interest_catalog, public.member_interests to service_role;
grant update (first_name, last_name, membership_category, onboarding_step) on public.member_private to authenticated;
grant update (username, biography) on public.profiles to authenticated;

create policy settings_owner on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interest_catalog_read on public.interest_catalog for select to authenticated using (true);
create policy interests_owner on public.member_interests for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- A private bucket stores only server-reencoded WebP derivatives. No browser writes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('member-avatars', 'member-avatars', false, 524288, array['image/webp']);

create policy member_avatar_client_boundary on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'member-avatars') with check (bucket_id <> 'member-avatars');

create function public.save_member_profile_v2(p_changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_step integer;
  target_step integer;
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select onboarding_step into strict current_step from public.member_private where user_id = uid for update;
  target_step := coalesce((p_changes->>'onboardingStep')::integer, current_step);
  if target_step > current_step + 1 then
    raise exception 'onboarding stages must be saved in order' using errcode = '23514';
  end if;

  update public.profiles as p set
    display_name = case when p_changes ? 'displayName' then p_changes->>'displayName' else p.display_name end,
    preferred_locale = case when p_changes ? 'preferredLocale' then p_changes->>'preferredLocale' else p.preferred_locale end,
    username = case when p_changes ? 'username' then nullif(lower(btrim(p_changes->>'username')), '') else p.username end,
    biography = case when p_changes ? 'biography' then nullif(btrim(p_changes->>'biography'), '') else p.biography end
  where p.user_id = uid;

  update public.member_private as m set
    first_name = case when p_changes ? 'firstName' then btrim(p_changes->>'firstName') else m.first_name end,
    last_name = case when p_changes ? 'lastName' then btrim(p_changes->>'lastName') else m.last_name end,
    membership_category = case when p_changes ? 'membershipCategory' then p_changes->>'membershipCategory' else m.membership_category end,
    residence_country_code = case when p_changes ? 'residenceCountryCode' then p_changes->>'residenceCountryCode' else m.residence_country_code end,
    residence_department_code = case when p_changes ? 'residenceDepartmentCode' then p_changes->>'residenceDepartmentCode' else m.residence_department_code end,
    diaspora_department_code = case when p_changes ? 'diasporaDepartmentCode' then p_changes->>'diasporaDepartmentCode' else m.diaspora_department_code end,
    onboarding_step = greatest(current_step, target_step)
  where m.user_id = uid;

  if greatest(current_step, target_step) >= 3 and not exists (
    select 1 from public.profiles where user_id = uid and username is not null and display_name is not null
  ) then raise exception 'username and display name required' using errcode = '23514'; end if;

  if p_changes ? 'discoverable' or p_changes ? 'showMembershipCategory' then
    insert into public.user_settings(user_id, discoverable, show_membership_category)
    values (uid, coalesce((p_changes->>'discoverable')::boolean, false), coalesce((p_changes->>'showMembershipCategory')::boolean, false))
    on conflict (user_id) do update set
      discoverable = coalesce((p_changes->>'discoverable')::boolean, user_settings.discoverable),
      show_membership_category = coalesce((p_changes->>'showMembershipCategory')::boolean, user_settings.show_membership_category);
  end if;

  if p_changes ? 'interests' then
    delete from public.member_interests where user_id = uid;
    insert into public.member_interests(user_id, interest_code)
      select uid, code from jsonb_array_elements_text(p_changes->'interests') as i(code);
  end if;
end;
$$;
revoke all on function public.save_member_profile_v2(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_member_profile_v2(jsonb) to authenticated;

-- Preserve the original aggregate and its geography suppression in the same statement.
create function public.community_stats_v2_for_api()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with counts as (
    select count(*) filter (where m.membership_category = 'haitian') as haitian,
      count(*) filter (where m.membership_category = 'international_supporter') as supporter,
      count(*) filter (where m.membership_category is null) as unspecified
    from auth.users u
    left join public.member_private m on m.user_id = u.id
    left join public.member_metric_exclusions x on x.user_id = u.id
    where u.deleted_at is null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until <= now()) and x.user_id is null
  )
  select private.build_community_stats() || jsonb_build_object('membership',
    case when haitian between 1 and 9 or supporter between 1 and 9 or unspecified between 1 and 9
      then null else jsonb_build_object('haitian', haitian, 'internationalSupporter', supporter, 'unspecified', unspecified)
    end)
  from counts;
$$;
revoke all on function public.community_stats_v2_for_api() from public, anon, authenticated, service_role;
grant execute on function public.community_stats_v2_for_api() to service_role;

create function private.member_discoverable(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_settings where user_id = p_user_id and discoverable);
$$;
revoke all on function private.member_discoverable(uuid) from public, anon, authenticated;
grant execute on function private.member_discoverable(uuid) to anon, authenticated;

create policy profile_discoverability on public.profiles as restrictive for select to anon, authenticated
  using ((select auth.uid()) = user_id
    or (username is null and biography is null and avatar_asset is null)
    or private.member_discoverable(user_id));

create function public.find_public_profile_for_api(p_username text)
returns table (user_id uuid, display_name text, username text, biography text, avatar_asset uuid, membership_category text)
language sql stable security invoker set search_path = '' as $$
  select p.user_id, p.display_name, p.username, p.biography, p.avatar_asset,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p
  join public.user_settings s using (user_id)
  join public.member_private m using (user_id)
  where p.username = p_username and p.is_visible and s.discoverable;
$$;
revoke all on function public.find_public_profile_for_api(text) from public, anon, authenticated;
grant execute on function public.find_public_profile_for_api(text) to service_role;
