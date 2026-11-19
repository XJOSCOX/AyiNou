create table private.platform_bootstrap (
  singleton boolean primary key default true check (singleton),
  user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now()
);
alter table private.platform_bootstrap enable row level security;
revoke all on private.platform_bootstrap from public,anon,authenticated,service_role;

alter table public.verification_records add column source text not null default 'review';
alter table public.verification_records drop constraint verification_records_review;
alter table public.verification_records add constraint verification_records_review check (
  (source='review' and (
    (status='pending' and reviewed_by is null and verified_at is null)
    or (status='verified' and reviewed_by is not null and verified_at is not null)
    or (status='revoked' and reviewed_by is not null and verified_at is null)
  )) or (source='first_account_bootstrap' and verification_type='identity'
    and status='verified' and reviewed_by is null and verified_at is not null)
);

-- A later review adopts the ordinary review provenance if it updates the same record.
create function private.record_verification_review_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reviewed_by is not null then new.source:='review'; end if;
  return new;
end;
$$;
revoke all on function private.record_verification_review_source() from public,anon,authenticated,service_role;
create trigger verification_record_review_source before update of reviewed_by on public.verification_records
  for each row execute function private.record_verification_review_source();

alter table private.platform_admin_audit drop constraint platform_admin_audit_event_check;
alter table private.platform_admin_audit add constraint platform_admin_audit_event_check check (
  event in ('role_granted','role_revoked','account_suspended','account_banned','account_reinstated','first_account_bootstrapped')
);

create function public.bootstrap_first_platform_admin_for_api(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  previous_user uuid;
  first_user uuid;
begin
  perform pg_advisory_xact_lock(20261120,300);
  select user_id into previous_user from private.platform_bootstrap where singleton;
  if found then
    if previous_user is not distinct from p_user and p_user is not null then return false; end if;
    raise exception 'bootstrap already consumed' using errcode='55000';
  end if;
  select u.id into first_user from auth.users u
    where not u.is_anonymous and u.deleted_at is null and not exists (
      select 1 from public.member_metric_exclusions x where x.user_id=u.id and x.reason='synthetic_test'
    ) order by u.created_at,u.id limit 1;
  if p_user is null or p_user is distinct from first_user or not private.institution_actor(p_user)
    or not private.verified_totp(p_user)
    or exists (select 1 from public.role_assignments where role='administrator' and user_id<>p_user)
  then raise exception 'first-account bootstrap criteria not met' using errcode='42501'; end if;
  if exists (select 1 from public.verification_records where user_id=p_user and verification_type='identity' and status='revoked')
  then raise exception 'revoked identity cannot be bootstrapped' using errcode='55000'; end if;

  insert into public.verification_records(user_id,verification_type,status,verified_at,source)
    values(p_user,'identity','verified',now(),'first_account_bootstrap')
    on conflict(user_id,verification_type) do update set status=excluded.status,verified_at=excluded.verified_at,source=excluded.source
      where verification_records.status='pending';
  insert into public.role_assignments(user_id,role)
    values(p_user,'administrator') on conflict(user_id,role) do nothing;
  if found then
    insert into private.platform_admin_audit(subject_id,event,role,reason)
      values(p_user,'role_granted','administrator','First-account administrator bootstrap.');
  end if;
  insert into private.platform_bootstrap(user_id) values(p_user);
  insert into private.platform_admin_audit(subject_id,event,reason)
    values(p_user,'first_account_bootstrapped','First-account administrator bootstrap with verified authenticator.');
  return true;
end;
$$;
revoke all on function public.bootstrap_first_platform_admin_for_api(uuid) from public,anon,authenticated,service_role;
grant execute on function public.bootstrap_first_platform_admin_for_api(uuid) to service_role;
