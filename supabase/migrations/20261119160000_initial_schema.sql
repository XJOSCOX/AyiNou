-- Phase 1A: data model only. No authentication UI or account creation routes.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.departments (
  code text primary key,
  name text not null unique,
  constraint departments_code_format check (code ~ '^HT-[A-Z]{2}$')
);

insert into public.departments (code, name) values
  ('HT-AR', 'Artibonite'),
  ('HT-CE', 'Centre'),
  ('HT-GA', 'Grand''Anse'),
  ('HT-NI', 'Nippes'),
  ('HT-ND', 'Nord'),
  ('HT-NE', 'Nord-Est'),
  ('HT-NO', 'Nord-Ouest'),
  ('HT-OU', 'Ouest'),
  ('HT-SD', 'Sud'),
  ('HT-SE', 'Sud-Est');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_locale text not null default 'ht',
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or (char_length(trim(display_name)) between 2 and 80 and display_name = trim(display_name))
  ),
  constraint profiles_preferred_locale check (preferred_locale in ('ht', 'fr', 'en')),
  constraint profiles_visible_name check (not is_visible or display_name is not null)
);

create table public.member_private (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  residence_country_code text,
  residence_department_code text references public.departments(code),
  diaspora_department_code text references public.departments(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_private_country_code check (
    residence_country_code is null or residence_country_code ~ '^[A-Z]{2}$'
  ),
  constraint member_private_residence_department check (
    residence_department_code is null or residence_country_code is not distinct from 'HT'
  ),
  constraint member_private_diaspora_department check (
    diaspora_department_code is null or residence_country_code is distinct from 'HT'
  )
);

create index member_private_residence_idx
  on public.member_private (residence_country_code, residence_department_code)
  where residence_country_code is not null;
create index member_private_diaspora_idx
  on public.member_private (diaspora_department_code)
  where diaspora_department_code is not null;

create table public.role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint role_assignments_role check (role in ('administrator', 'moderator'))
);

create index role_assignments_role_idx on public.role_assignments (role, user_id);

create table public.verification_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  verification_type text not null,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, verification_type),
  constraint verification_records_type check (
    verification_type in ('identity', 'notable_person', 'organization')
  ),
  constraint verification_records_status check (status in ('pending', 'verified', 'revoked')),
  constraint verification_records_review check (
    (status = 'pending' and reviewed_by is null and verified_at is null)
    or (status = 'verified' and reviewed_by is not null and verified_at is not null)
    or (status = 'revoked' and reviewed_by is not null and verified_at is null)
  )
);

create index verification_records_user_idx on public.verification_records (user_id);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger member_private_updated_at before update on public.member_private
  for each row execute function private.touch_updated_at();
create trigger verification_records_updated_at before update on public.verification_records
  for each row execute function private.touch_updated_at();

-- Later, Fastify may call this only after it verifies a Supabase access token.
-- The function's transaction inserts both rows or neither, and retries do not overwrite data.
create function private.initialize_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;

  insert into public.profiles (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.member_private (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.initialize_member(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.initialize_member(uuid) to service_role;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.member_private enable row level security;
alter table public.role_assignments enable row level security;
alter table public.verification_records enable row level security;

-- Supabase can auto-grant public table privileges. Explicitly remove them first.
revoke all on public.departments, public.profiles, public.member_private,
  public.role_assignments, public.verification_records from public, anon, authenticated, service_role;

grant select on public.departments to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, preferred_locale) on public.profiles to authenticated;
grant select on public.member_private to authenticated;
grant update (residence_country_code, residence_department_code, diaspora_department_code)
  on public.member_private to authenticated;
grant all on public.departments, public.profiles, public.member_private,
  public.role_assignments, public.verification_records to service_role;

create policy "departments are readable" on public.departments
  for select to anon, authenticated using (true);

create policy "visible profiles or owner can read" on public.profiles
  for select to anon, authenticated
  using ((is_visible and display_name is not null) or (select auth.uid()) = user_id);
create policy "owner can edit public profile fields" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "owner can read private member data" on public.member_private
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner can edit private member data" on public.member_private
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No client policies or grants for role_assignments or verification_records.
-- Privileged writes must go through audited backend workflows in later phases.
