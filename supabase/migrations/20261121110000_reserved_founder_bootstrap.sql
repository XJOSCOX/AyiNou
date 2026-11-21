-- One installation reservation. A consumed legacy bootstrap remains authoritative.
create table private.founder_registration (
  singleton boolean primary key default true check (singleton),
  reserved_username text not null check (reserved_username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  configured_email text check (configured_email=lower(trim(configured_email)) and length(configured_email) between 3 and 254),
  credential_hash bytea check (octet_length(credential_hash)=32),
  expires_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  claimed_at timestamptz,
  subject_id uuid references auth.users(id) on delete set null,
  check ((claimed_at is null and configured_email is not null and credential_hash is not null and expires_at is not null and subject_id is null)
    or (claimed_at is not null and configured_email is null and credential_hash is null and expires_at is null))
);
alter table private.founder_registration enable row level security;
revoke all on private.founder_registration from public,anon,authenticated,service_role;

create table private.founder_registration_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check(event in ('reservation_prepared','credential_rotated','credential_rejected')),
  occurred_at timestamptz not null default clock_timestamp()
);
alter table private.founder_registration_audit enable row level security;
revoke all on private.founder_registration_audit from public,anon,authenticated,service_role;

-- Existing founding history is recognized as-is. Reserve its current handle if present.
insert into private.founder_registration(reserved_username,claimed_at,subject_id)
select p.username,b.completed_at,b.user_id from private.platform_bootstrap b
join public.profiles p on p.user_id=b.user_id
where private.platform_founder(b.user_id) and p.username ~ '^[a-z0-9][a-z0-9_]{2,23}$';

-- The former service startup path must not compete with the credential-based bootstrap.
revoke all on function public.bootstrap_first_platform_admin_for_api(uuid) from public,anon,authenticated,service_role;

create function private.reserve_founder_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare r private.founder_registration;
begin
  if new.username is null or (tg_op='UPDATE' and new.username is not distinct from old.username
    and new.user_id is not distinct from old.user_id) then return new; end if;
  perform pg_advisory_xact_lock(20261120,300);
  select * into r from private.founder_registration where reserved_username=lower(trim(new.username));
  if found and ((r.claimed_at is not null and r.subject_id is distinct from new.user_id)
    or (r.claimed_at is null and not exists(select 1 from auth.users where id=new.user_id
       and email_confirmed_at is not null and not is_anonymous and deleted_at is null
       and lower(trim(email))=r.configured_email)))
  then raise exception 'username unavailable' using errcode='23505'; end if;
  return new;
end;
$$;
revoke all on function private.reserve_founder_username() from public,anon,authenticated,service_role;
create trigger reserve_founder_username before insert or update of username,user_id on public.profiles
  for each row execute function private.reserve_founder_username();

create function public.prepare_founder_registration_for_api(p_email text,p_username text,p_credential_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.founder_registration;
begin
  perform pg_advisory_xact_lock(20261120,300);
  if exists(select 1 from private.platform_bootstrap) then return false; end if;
  if p_email is null or p_email<>lower(trim(p_email)) or length(p_email) not between 3 and 254
    or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or p_username is null or p_username !~ '^[a-z0-9][a-z0-9_]{2,23}$'
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid registration configuration' using errcode='23514'; end if;
  select * into r from private.founder_registration where singleton for update;
  if found and (r.configured_email<>p_email or r.reserved_username<>p_username or
    (r.expires_at>clock_timestamp() and r.failed_attempts<5)) then return false; end if;
  if exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id where lower(trim(p.username))=p_username
    and (lower(trim(u.email)) is distinct from p_email or u.email_confirmed_at is null or u.deleted_at is not null))
  then raise exception 'username unavailable' using errcode='23505'; end if;
  insert into private.founder_registration(reserved_username,configured_email,credential_hash,expires_at)
    values(p_username,p_email,decode(p_credential_hash,'hex'),clock_timestamp()+interval '30 minutes')
    on conflict(singleton) do update set credential_hash=excluded.credential_hash,expires_at=excluded.expires_at,failed_attempts=0;
  insert into private.founder_registration_audit(event)
    values(case when r.singleton then 'credential_rotated' else 'reservation_prepared' end);
  return true;
end;
$$;

create function public.founder_registration_status_for_api(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.institution_actor(p_actor) and not exists(select 1 from private.platform_bootstrap) and exists(
    select 1 from private.founder_registration r join auth.users u on lower(trim(u.email))=r.configured_email
    where u.id=p_actor and u.email_confirmed_at is not null and r.claimed_at is null
  );
$$;

create function public.claim_founder_registration_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare r private.founder_registration; supplied bytea;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  perform 1 from auth.users where id=p_actor for share;
  perform 1 from auth.mfa_factors where user_id=p_actor and status='verified' and factor_type='totp' for share;
  if not public.account_session_for_api(p_actor,p_session,p_aal2,true)
    or not private.institution_actor(p_actor) or not private.verified_totp(p_actor)
    or not coalesce(p_totp_at between extract(epoch from clock_timestamp())::bigint-900
      and extract(epoch from clock_timestamp())::bigint+30,false)
  then raise exception 'access denied' using errcode='42501'; end if;
  select * into r from private.founder_registration where singleton for update;
  if not found or r.claimed_at is not null or exists(select 1 from private.platform_bootstrap)
    or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
      and lower(trim(email))=r.configured_email)
    or exists(select 1 from auth.users where id<>p_actor and is_anonymous is false and deleted_at is null
      and email_confirmed_at is not null and lower(trim(email))=r.configured_email)
  then return 'unavailable'; end if;
  if r.expires_at<=clock_timestamp() or r.failed_attempts>=5 then return 'unavailable'; end if;
  if exists(select 1 from public.profiles where lower(trim(username))=r.reserved_username and user_id<>p_actor)
  then return 'unavailable'; end if;
  supplied := case when p_hash ~ '^[0-9a-f]{64}$' then decode(p_hash,'hex') end;
  if supplied is null or (select bit_or(get_byte(supplied,i) # get_byte(r.credential_hash,i)) from generate_series(0,31) i)<>0 then
    update private.founder_registration set failed_attempts=failed_attempts+1 where singleton;
    insert into private.founder_registration_audit(actor_id,event) values(p_actor,'credential_rejected');
    return 'invalid';
  end if;
  insert into private.platform_bootstrap(user_id) values(p_actor);
  insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
    values(p_actor,p_actor,'first_account_bootstrapped','Reserved founder enrollment with confirmed email, recent MFA and a single-use credential.');
  update private.founder_registration set subject_id=p_actor,claimed_at=clock_timestamp(),credential_hash=null,
    expires_at=null,configured_email=null where singleton;
  return 'claimed';
end;
$$;

create function public.platform_leadership_for_api(p_subject uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when private.platform_admin(p_subject)
      then case when private.platform_founder(p_subject) then 'founder' else 'administrator' end end;
$$;

create or replace function public.platform_access_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'founder',private.platform_founder(p_actor),
    'administrator',private.institution_actor(p_actor) and (
      private.platform_founder(p_actor) or exists(select 1 from public.role_assignments where user_id=p_actor and role='administrator')
    ),
    'reviewer',private.institution_actor(p_actor) and exists(select 1 from private.verification_reviewers where user_id=p_actor),
    'totp',private.verified_totp(p_actor),
    'founderVerified',public.founder_identity_public_for_api(p_actor)
  );
$$;

revoke all on function public.prepare_founder_registration_for_api(text,text,text),public.founder_registration_status_for_api(uuid),
  public.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text),public.platform_leadership_for_api(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_founder_registration_for_api(text,text,text),public.founder_registration_status_for_api(uuid),
  public.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text),public.platform_leadership_for_api(uuid)
  to service_role;
