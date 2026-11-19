-- Phase 2: server-managed exclusions and daily activity. No public row access.
create table public.member_metric_exclusions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('synthetic_test', 'disqualified')),
  created_at timestamptz not null default now()
);

create table public.user_activity_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_day date not null,
  primary key (user_id, activity_day)
);
create index user_activity_daily_day_idx on public.user_activity_daily (activity_day, user_id);

alter table public.member_metric_exclusions enable row level security;
alter table public.user_activity_daily enable row level security;
revoke all on public.member_metric_exclusions, public.user_activity_daily from public, anon, authenticated, service_role;
grant all on public.member_metric_exclusions, public.user_activity_daily to service_role;
-- No client policies. The service role is server-only and bypasses RLS.

-- One query snapshot keeps the public response internally consistent. Geographic
-- cohorts are the atomic partitions: unknown country, Haiti with no department,
-- each Haiti department, and each diaspora residence country. If ANY nonzero
-- partition is below 10, no geographic count or country list is returned.
create function private.build_community_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  with eligible as (
    select u.id, m.residence_country_code, m.residence_department_code
    from auth.users u
    left join public.member_private m on m.user_id = u.id
    left join public.member_metric_exclusions x on x.user_id = u.id
    where u.deleted_at is null
      and not u.is_anonymous
      and (u.banned_until is null or u.banned_until <= now())
      and x.user_id is null
  ),
  totals as (
    select count(*)::bigint as registered,
      count(*) filter (where residence_country_code = 'HT')::bigint as haiti,
      count(*) filter (where residence_country_code is not null and residence_country_code <> 'HT')::bigint as diaspora,
      count(*) filter (where residence_country_code is null)::bigint as unknown,
      count(*) filter (where residence_country_code = 'HT' and residence_department_code is null)::bigint as haiti_unassigned,
      count(*) filter (where exists (
        select 1 from public.user_activity_daily a
        where a.user_id = eligible.id and a.activity_day >= (now() at time zone 'utc')::date - 29
      ))::bigint as active,
      count(*) filter (where exists (
        select 1 from public.verification_records v
        where v.user_id = eligible.id and v.status = 'verified'
          and v.verification_type in ('identity', 'notable_person')
      ))::bigint as verified
    from eligible
  ),
  department_counts as (
    select d.code, d.name, count(e.id)::bigint as members
    from public.departments d
    left join eligible e on e.residence_country_code = 'HT' and e.residence_department_code = d.code
    group by d.code, d.name
  ),
  country_counts as (
    select residence_country_code as code, count(*)::bigint as members
    from eligible
    where residence_country_code is not null and residence_country_code <> 'HT'
    group by residence_country_code
  ),
  atomic_counts as (
    select unknown as members from totals
    union all select haiti_unassigned from totals
    union all select members from department_counts
    union all select members from country_counts
  ),
  privacy as (
    select not exists(select 1 from atomic_counts where members between 1 and 9) as geographic_safe
  )
  select jsonb_build_object(
    'updatedAt', now(),
    'minimumCohort', 10,
    'registered', case when t.registered = 0 or t.registered >= 10 then t.registered else null end,
    'active', case when t.active = 0 or t.active >= 10 then t.active else null end,
    'verified', case when t.verified = 0 or t.verified >= 10 then t.verified else null end,
    'geographyAvailable', p.geographic_safe,
    'haiti', case when p.geographic_safe then t.haiti else null end,
    'diaspora', case when p.geographic_safe then t.diaspora else null end,
    'unknown', case when p.geographic_safe then t.unknown else null end,
    'representedDepartments', case when p.geographic_safe then
      (select count(*) from department_counts where members > 0) else null end,
    'departments', case when p.geographic_safe then
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'members', members) order by code), '[]'::jsonb) from department_counts)
      else null end,
    'diasporaCountries', case when p.geographic_safe then
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'members', members) order by code), '[]'::jsonb) from country_counts)
      else null end
  ) into result
  from totals t cross join privacy p;

  return result;
end;
$$;

revoke all on function private.build_community_stats() from public, anon, authenticated;
grant execute on function private.build_community_stats() to service_role;

create function public.community_stats_for_api()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.build_community_stats();
$$;
revoke all on function public.community_stats_for_api() from public, anon, authenticated;
grant execute on function public.community_stats_for_api() to service_role;
