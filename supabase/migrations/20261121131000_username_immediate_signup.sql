-- Match GoTrue's server-authored provisioning receipt, never caller-supplied user metadata.
create function private.auth_staff_provisioned_email(p_user uuid,p_email text,p_created timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists (select 1 from auth.audit_log_entries a
    where a.created_at between p_created-interval '1 minute' and p_created+interval '1 minute'
      and a.payload->>'action'='user_signedup'
      and a.payload->'traits'->>'user_id'=p_user::text
      and lower(a.payload->'traits'->>'user_email')=lower(p_email)
      and a.payload->>'actor_id' is not null and a.payload->>'actor_id'<>p_user::text);
$$;

create index username_events_signup_subject on private.username_events(subject_id) where event='reserved';

-- A valid reservation may already have been consumed when Auth confirms immediately.
create or replace function private.require_signup_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare account auth.users;
begin
  select * into account from auth.users where id=new.id;
  if not found or account.email is null or account.invited_at is not null or account.is_anonymous
    or exists(select 1 from private.username_events e where e.subject_id=new.id and e.event='reserved')
    or (account.email_confirmed_at is not null and private.auth_staff_provisioned_email(account.id,account.email,account.created_at))
  then return new; end if;
  raise exception 'username is required' using errcode='U1001';
end;
$$;

-- The automatic Auth timestamp is not proof of access to a Founder mailbox.
create function private.founder_registration_email_proved(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null
    and not u.is_anonymous and u.deleted_at is null and (
      (u.confirmation_sent_at between u.created_at and u.email_confirmed_at
        and (u.email_change_sent_at is null or u.email_change_sent_at<=u.confirmation_sent_at)
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='email'
          and i.identity_data->>'email_verified'='true' and lower(i.identity_data->>'email')=lower(u.email)))
      or private.auth_staff_provisioned_email(u.id,u.email,u.created_at)
    ));
$$;
revoke all on function private.auth_staff_provisioned_email(uuid,text,timestamptz),
  private.founder_registration_email_proved(uuid) from public,anon,authenticated,service_role;

create or replace function private.reserve_founder_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare r private.founder_registration;
begin
  if new.username is null or (tg_op='UPDATE' and new.username is not distinct from old.username
    and new.user_id is not distinct from old.user_id) then return new; end if;
  perform pg_advisory_xact_lock(20261120,300);
  select * into r from private.founder_registration where reserved_username=lower(trim(new.username));
  if found and ((r.claimed_at is not null and r.subject_id is distinct from new.user_id)
    or (r.claimed_at is null and not exists(select 1 from auth.users where id=new.user_id
       and private.founder_registration_email_proved(new.user_id)
       and lower(trim(email))=r.configured_email)))
  then raise exception 'username unavailable' using errcode='23505'; end if;
  return new;
end;
$$;

create or replace function public.founder_registration_status_for_api(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.institution_actor(p_actor) and not exists(select 1 from private.platform_bootstrap) and exists(
    select 1 from private.founder_registration r join auth.users u on lower(trim(u.email))=r.configured_email
    where u.id=p_actor and private.founder_registration_email_proved(p_actor) and r.claimed_at is null
  );
$$;

create or replace function public.claim_founder_registration_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_hash text)
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
    or not exists(select 1 from auth.users where id=p_actor and private.founder_registration_email_proved(p_actor)
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
