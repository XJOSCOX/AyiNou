-- Close direct client write paths while preserving the existing profile RPC contracts.
revoke update (display_name, preferred_locale, username, biography) on public.profiles from authenticated;
revoke update (residence_country_code, residence_department_code, diaspora_department_code,
  first_name, last_name, membership_category, onboarding_step) on public.member_private from authenticated;
revoke insert, update on public.user_settings from authenticated;
revoke insert, delete on public.member_interests from authenticated;

alter function public.save_member_profile_v2(jsonb) set schema private;
revoke all on function private.save_member_profile_v2(jsonb) from public, anon, authenticated, service_role;

create function public.save_member_profile_v2(p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.member_session_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb or pg_column_size(p_changes) > 8192 then
    raise exception 'invalid profile changes' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_each(p_changes) as e(key, value)
    where not (case
      when key in ('displayName', 'preferredLocale', 'username', 'firstName', 'lastName', 'membershipCategory')
        then jsonb_typeof(value) = 'string'
      when key in ('biography', 'residenceCountryCode', 'residenceDepartmentCode', 'diasporaDepartmentCode')
        then jsonb_typeof(value) in ('null', 'string')
      when key in ('discoverable', 'showMembershipCategory') then jsonb_typeof(value) = 'boolean'
      when key = 'onboardingStep' then jsonb_typeof(value) = 'number' and value::text ~ '^[1-4]$'
      when key = 'interests' then jsonb_typeof(value) = 'array'
      else false end)
  ) then raise exception 'invalid profile fields' using errcode = '23514'; end if;
  if p_changes ? 'interests' then
    if jsonb_array_length(p_changes->'interests') > 10 or exists (
      select 1 from jsonb_array_elements(p_changes->'interests') i(value) where jsonb_typeof(i.value) <> 'string'
    ) then raise exception 'invalid interests' using errcode = '23514'; end if;
    -- Accept repeated interests the same way as the Fastify contract.
    p_changes := jsonb_set(p_changes, '{interests}', (
      select coalesce(jsonb_agg(distinct i.value), '[]'::jsonb)
      from jsonb_array_elements(p_changes->'interests') i(value)
    ));
  end if;
  if (p_changes ? 'username' and btrim(p_changes->>'username') = '')
    or (p_changes ? 'displayName' and p_changes->>'displayName' ~ '[[:cntrl:]]')
  then raise exception 'invalid public name' using errcode = '23514'; end if;

  -- The underlying operation locks the member row before updating profile and settings.
  perform private.save_member_profile_v2(p_changes);
  if exists (
    select 1 from public.user_settings s join public.profiles p using (user_id)
    where s.user_id = uid and s.discoverable and (p.username is null or p.display_name is null)
  ) then raise exception 'discoverability requires a public name and username' using errcode = '23514'; end if;
end;
$$;
revoke all on function public.save_member_profile_v2(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_member_profile_v2(jsonb) to authenticated;

create or replace function public.update_my_profile(
  p_display_name text, p_preferred_locale text, p_residence_country_code text,
  p_residence_department_code text, p_diaspora_department_code text
)
returns table (
  user_id uuid, display_name text, preferred_locale text, is_visible boolean,
  residence_country_code text, residence_department_code text, diaspora_department_code text
)
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.save_member_profile_v2(jsonb_build_object(
    'displayName', p_display_name, 'preferredLocale', p_preferred_locale,
    'residenceCountryCode', p_residence_country_code, 'residenceDepartmentCode', p_residence_department_code,
    'diasporaDepartmentCode', p_diaspora_department_code
  ));
  return query
    select p.user_id, p.display_name, p.preferred_locale, p.is_visible,
      m.residence_country_code, m.residence_department_code, m.diaspora_department_code
    from public.profiles p join public.member_private m using (user_id) where p.user_id = auth.uid();
end;
$$;

alter policy profile_discoverability on public.profiles
  using ((select auth.uid()) = user_id or private.member_discoverable(user_id));

create function private.member_session_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal' = 'aal2', false) or not exists (
    select 1 from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'
  );
$$;
revoke all on function private.member_session_allowed() from public, anon, authenticated, service_role;
grant execute on function private.member_session_allowed() to authenticated;

create policy profile_mfa_reads on public.profiles as restrictive for select to authenticated
  using ((select private.member_session_allowed()) or (is_visible and display_name is not null and private.member_discoverable(user_id)));
create policy private_member_mfa_reads on public.member_private as restrictive for select to authenticated
  using ((select private.member_session_allowed()));
create policy member_settings_mfa_reads on public.user_settings as restrictive for select to authenticated
  using ((select private.member_session_allowed()));
create policy member_interests_mfa_reads on public.member_interests as restrictive for select to authenticated
  using ((select private.member_session_allowed()));

create extension if not exists pgcrypto with schema extensions;

create table private.member_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^M1-[0-9A-F]{32}$'),
  created_at timestamptz not null default now()
);

create table private.referral_codes (
  code text primary key check (code ~ '^R1-[0-9A-F]{16}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  retired_at timestamptz check (retired_at >= created_at),
  unique (code, user_id)
);
create unique index referral_codes_one_active on private.referral_codes (user_id) where retired_at is null;
create index referral_codes_owner on private.referral_codes (user_id);

create table private.referrals (
  referred_user_id uuid primary key references auth.users(id) on delete cascade,
  referring_user_id uuid not null,
  referral_code text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (referring_user_id <> referred_user_id),
  check (confirmed_at >= created_at),
  foreign key (referral_code, referring_user_id) references private.referral_codes (code, user_id) on delete cascade
);
create index referrals_referrer_summary on private.referrals (referring_user_id, confirmed_at);
create index referrals_referral_code on private.referrals (referral_code, referring_user_id);

alter table private.member_codes enable row level security;
alter table private.referral_codes enable row level security;
alter table private.referrals enable row level security;
revoke all on private.member_codes, private.referral_codes, private.referrals from public, anon, authenticated, service_role;

create function private.initialize_account_codes(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  for attempt in 1..8 loop
    exit when exists (select 1 from private.member_codes where user_id = p_user_id);
    insert into private.member_codes (user_id, code)
    values (p_user_id, 'M1-' || upper(encode(extensions.gen_random_bytes(16), 'hex')))
    on conflict do nothing;
  end loop;
  for attempt in 1..8 loop
    exit when exists (select 1 from private.referral_codes where user_id = p_user_id and retired_at is null);
    insert into private.referral_codes (user_id, code)
    values (p_user_id, 'R1-' || upper(encode(extensions.gen_random_bytes(8), 'hex')))
    on conflict do nothing;
  end loop;
  if not exists (select 1 from private.member_codes where user_id = p_user_id)
    or not exists (select 1 from private.referral_codes where user_id = p_user_id and retired_at is null)
  then raise exception 'account code allocation unavailable'; end if;
end;
$$;
revoke all on function private.initialize_account_codes(uuid) from public, anon, authenticated, service_role;

-- The optional code is input only at Auth account insertion. Later metadata edits
-- cannot change the private snapshot. Invalid or inactive codes do not credit anyone.
create function private.capture_signup_referral()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate text := upper(btrim(new.raw_user_meta_data->>'referral_code'));
begin
  if candidate is null or candidate !~ '^R1-[0-9A-F]{16}$' or new.is_anonymous then return new; end if;
  insert into private.referrals (referred_user_id, referring_user_id, referral_code)
    select new.id, r.user_id, r.code
    from private.referral_codes r join auth.users u on u.id = r.user_id
    where r.code = candidate and r.retired_at is null and r.user_id <> new.id
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
    for share of r
    on conflict (referred_user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.capture_signup_referral() from public, anon, authenticated, service_role;
create trigger ayinou_referral_on_signup after insert on auth.users
  for each row when (new.raw_user_meta_data ? 'referral_code') execute function private.capture_signup_referral();

create function private.confirm_signup_referral(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from auth.users where id = p_user_id and email_confirmed_at is not null
      and deleted_at is null and not is_anonymous and (banned_until is null or banned_until <= now())
  ) then return false; end if;
  update private.referrals set confirmed_at = now()
    where referred_user_id = p_user_id and confirmed_at is null;
  return exists (select 1 from private.referrals where referred_user_id = p_user_id and confirmed_at is not null);
end;
$$;
revoke all on function private.confirm_signup_referral(uuid) from public, anon, authenticated, service_role;

create or replace function public.initialize_member_for_api(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.initialize_member(p_user_id);
  perform private.initialize_account_codes(p_user_id);
  perform private.confirm_signup_referral(p_user_id);
end;
$$;

-- Do not initialize or rewrite legacy profile rows during the code backfill.
do $$
declare
  member record;
begin
  for member in select id from auth.users where not is_anonymous and deleted_at is null loop
    perform private.initialize_account_codes(member.id);
  end loop;
end;
$$;

create function public.account_member_code_for_api(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.initialize_account_codes(p_user_id);
  return (select code from private.member_codes where user_id = p_user_id);
end;
$$;

create function public.account_referral_code_for_api(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.initialize_account_codes(p_user_id);
  return (select code from private.referral_codes where user_id = p_user_id and retired_at is null);
end;
$$;

create function public.validate_referral_for_api(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.referral_codes r join auth.users u on u.id = r.user_id
    where r.code = upper(btrim(p_code)) and r.retired_at is null
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;

create function public.record_signup_referral_for_api(p_user_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select private.confirm_signup_referral(p_user_id);
$$;

create function public.account_referral_summary_for_api(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from private.referrals where referring_user_id = p_user_id and confirmed_at is not null;
$$;

revoke all on function public.initialize_member_for_api(uuid), public.account_member_code_for_api(uuid),
  public.account_referral_code_for_api(uuid), public.validate_referral_for_api(text),
  public.record_signup_referral_for_api(uuid), public.account_referral_summary_for_api(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_member_for_api(uuid), public.account_member_code_for_api(uuid),
  public.account_referral_code_for_api(uuid), public.validate_referral_for_api(text),
  public.record_signup_referral_for_api(uuid), public.account_referral_summary_for_api(uuid) to service_role;
