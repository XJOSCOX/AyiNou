-- R2.2 registration and referral policy. One revision keeps interdependent settings atomic.
create table private.registration_policy (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  mode text not null default 'public' check(mode in ('public','invitation_only','closed')),
  individual_enabled boolean not null default true,
  organization_enabled boolean not null default true,
  referrals_enabled boolean not null default true,
  rewards_enabled boolean not null default false check(not rewards_enabled),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.registration_policy default values;

create table private.registration_policy_events (
  revision integer primary key check(revision>1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  request_id uuid not null,
  occurred_at timestamptz not null,
  unique(actor_id,request_id)
);

create table private.registration_invitations (
  id uuid primary key,
  digest bytea not null unique check(octet_length(digest)=32),
  email_digest bytea not null check(octet_length(email_digest)=32),
  pathway text not null check(pathway in ('individual','organization')),
  issued_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  issued_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>issued_at),
  consumed_at timestamptz
);

alter table private.registration_policy enable row level security;
alter table private.registration_policy_events enable row level security;
alter table private.registration_invitations enable row level security;
revoke all on private.registration_policy,private.registration_policy_events,private.registration_invitations
  from public,anon,authenticated,service_role;

create function private.registration_policy_value(p private.registration_policy)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('enabled',p.enabled,'mode',p.mode,'individualEnabled',p.individual_enabled,
    'organizationEnabled',p.organization_enabled,'referralsEnabled',p.referrals_enabled,'rewardsEnabled',p.rewards_enabled)
$$;

create function public.registration_policy_for_api()
returns jsonb language sql stable security definer set search_path='' as $$
  select private.registration_policy_value(p) - 'rewardsEnabled'
  from private.registration_policy p where singleton
$$;

create function public.founder_registration_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.registration_policy; old_value jsonb; e private.registration_policy_events;
  invite private.registration_invitations; v_request uuid; v_reason text; v_expected int;
  v_value jsonb; v_email text; v_digest bytea; v_email_digest bytea;
begin
  if p_command is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;

  if p_command is null then
    select * into p from private.registration_policy where singleton;
    if not found then return null; end if;
  else
    v_request:=(p_command->>'requestId')::uuid;
    v_reason:=btrim(p_command->>'reason');
    v_expected:=(p_command->>'expectedRevision')::integer;
    if v_request is null or v_expected is null or v_expected<1
      or not coalesce(length(v_reason) between 10 and 500 and v_reason !~ '[[:cntrl:]]',false)
      then raise exception 'Invalid policy command' using errcode='23514'; end if;
    select * into p from private.registration_policy where singleton for update;
    if not found then return null; end if;
    if p_command->>'action'='invite' then
      v_email:=lower(btrim(p_command->>'email'));
      if not coalesce(length(v_email)<=254 and v_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$',false)
        or not coalesce(p_command->>'code' ~ '^[0-9a-f]{64}$',false)
        or not coalesce(p_command->>'pathway' in ('individual','organization'),false)
        then raise exception 'Invalid invitation' using errcode='23514'; end if;
      v_digest:=extensions.digest(p_command->>'code','sha256');
      v_email_digest:=extensions.hmac(convert_to(v_email,'UTF8'),v_digest,'sha256');
      select * into invite from private.registration_invitations where id=v_request;
      if found then
        if invite.issued_by<>p_actor or invite.digest<>v_digest or invite.email_digest<>v_email_digest
          or invite.pathway<>p_command->>'pathway' or invite.reason<>v_reason
          then raise exception 'Invitation request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('id',invite.id,'expiresAt',invite.expires_at);
      end if;
      if p.revision<>v_expected then raise exception 'Stale registration revision' using errcode='O2004'; end if;
      if not p.enabled or p.mode<>'invitation_only'
        or (p_command->>'pathway'='individual' and not p.individual_enabled)
        or (p_command->>'pathway'='organization' and not p.organization_enabled)
        then raise exception 'Invitation unavailable' using errcode='55000'; end if;
      insert into private.registration_invitations(id,digest,email_digest,pathway,issued_by,reason,issued_at,expires_at)
        values(v_request,v_digest,v_email_digest,p_command->>'pathway',p_actor,v_reason,statement_timestamp(),statement_timestamp()+interval '7 days')
        returning * into invite;
      return jsonb_build_object('id',invite.id,'expiresAt',invite.expires_at);
    elsif p_command->>'action'='update' then
      v_value:=p_command->'value';
      if jsonb_typeof(v_value) is distinct from 'object'
        or not coalesce(v_value->>'mode' in ('public','invitation_only','closed'),false)
        or exists(select 1 from unnest(array['enabled','individualEnabled','organizationEnabled','referralsEnabled']) k
          where jsonb_typeof(v_value->k) is distinct from 'boolean')
        or (v_value - array['mode','enabled','individualEnabled','organizationEnabled','referralsEnabled']) <> '{}'::jsonb
        then raise exception 'Invalid policy update' using errcode='23514'; end if;
      v_value:=v_value || '{"rewardsEnabled":false}'::jsonb;
      select * into e from private.registration_policy_events where actor_id=p_actor and request_id=v_request;
      if found then
        if e.revision-1<>v_expected or e.reason<>v_reason or e.new_value<>v_value
          then raise exception 'Request conflict' using errcode='O2002'; end if;
        return e.new_value || jsonb_build_object('revision',e.revision,'updatedAt',e.occurred_at);
      end if;
      if p.revision<>v_expected then raise exception 'Stale registration revision' using errcode='O2004'; end if;
      old_value:=private.registration_policy_value(p);
      if old_value=v_value then raise exception 'Policy already saved' using errcode='55000'; end if;
      update private.registration_policy set
        enabled=(v_value->>'enabled')::boolean,mode=v_value->>'mode',
        individual_enabled=(v_value->>'individualEnabled')::boolean,
        organization_enabled=(v_value->>'organizationEnabled')::boolean,
        referrals_enabled=(v_value->>'referralsEnabled')::boolean,revision=revision+1,updated_at=clock_timestamp()
        where singleton returning * into p;
      insert into private.registration_policy_events(revision,actor_id,previous_value,new_value,reason,request_id,occurred_at)
        values(p.revision,p_actor,old_value,v_value,v_reason,v_request,p.updated_at);
    else raise exception 'Invalid registration command' using errcode='23514';
    end if;
  end if;
  return private.registration_policy_value(p) || jsonb_build_object('revision',p.revision,'updatedAt',p.updated_at);
end;
$$;

-- Separate public signup reads from discovery, so crowding one cannot disable the other.
alter table feed_data.read_limits drop constraint read_limits_category_check;
alter table feed_data.read_limits add constraint read_limits_category_check
  check(category in ('feed','media','discovery','profile','notifications','username','audit','registration'));

create or replace function public.consume_safety_read_for_api(p_actor uuid,p_bucket integer,p_category text)
returns boolean language plpgsql security definer set search_path='' as $$
declare slot timestamptz:=date_trunc('minute',clock_timestamp()); ceiling integer; subject_key text;
begin
  if ((p_actor is null)=(p_bucket is null)) or (p_bucket is not null and p_bucket not between 0 and 4095)
  then raise exception 'invalid rate key' using errcode='22023'; end if;
  ceiling:=case p_category
    when 'feed' then case when p_actor is null then 90 else 120 end
    when 'media' then case when p_actor is null then 120 else 240 end
    when 'discovery' then case when p_actor is null then 30 else 60 end
    when 'profile' then case when p_actor is null then 60 else 120 end
    when 'notifications' then 90
    when 'username' then 30
    when 'audit' then case when p_actor is null then 15 else 30 end
    when 'registration' then 90 end;
  if ceiling is null then raise exception 'invalid rate category' using errcode='22023'; end if;
  subject_key:=coalesce('member:'||p_actor::text,'guest:'||p_bucket::text);
  insert into feed_data.read_limits(subject,category,window_started,total) values(subject_key,p_category,slot,1)
  on conflict(subject,category) do update set window_started=excluded.window_started,
    total=case when read_limits.window_started=slot then read_limits.total+1 else 1 end
  where read_limits.window_started<slot or (read_limits.window_started=slot and read_limits.total<ceiling);
  return found;
end;
$$;

-- All new Auth accounts go through this lock, including direct Auth traffic.
create function private.enforce_registration_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare p private.registration_policy;
  pathway text:=coalesce(new.raw_user_meta_data->>'signup_path','individual');
  founder_ticket text:=new.raw_user_meta_data->>'founder_signup_proof';
  invitation text:=new.raw_user_meta_data->>'registration_invitation';
  invitation_digest bytea;
begin
  new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb) - array['founder_signup_proof','registration_invitation'];
  select * into p from private.registration_policy where singleton for share;
  if not found then raise exception 'Registration unavailable' using errcode='R2201'; end if;

  if not new.is_anonymous and new.email is not null
    and founder_ticket ~ '^[0-9a-f]{64}$' and exists(
    select 1 from private.f1_founder_flow f cross join private.founder_registration r
    where r.configured_email=lower(btrim(new.email)) and f.signup_name=new.raw_user_meta_data->>'public_username'
      and r.claimed_at is null and r.expires_at>clock_timestamp() and r.failed_attempts<5
      and not exists(select 1 from private.platform_bootstrap)
      and founder_ticket=encode(extensions.digest('r22-founder:'||encode(f.authorization_hash,'hex'),'sha256'),'hex')
  ) then
    new.raw_user_meta_data:=new.raw_user_meta_data - array['referral_code','signup_path'];
    return new;
  end if;

  if not p.enabled or new.is_anonymous or new.email is null or p.mode='closed'
    or pathway not in ('individual','organization')
    or (pathway='individual' and not p.individual_enabled)
    or (pathway='organization' and not p.organization_enabled)
    then raise exception 'Registration unavailable' using errcode='R2201'; end if;
  if p.mode='invitation_only' then
    if not coalesce(invitation ~ '^[0-9a-f]{64}$',false)
      then raise exception 'Registration unavailable' using errcode='R2201'; end if;
    invitation_digest:=extensions.digest(invitation,'sha256');
    update private.registration_invitations set consumed_at=clock_timestamp()
      where digest=invitation_digest
        and email_digest=extensions.hmac(convert_to(lower(btrim(new.email)),'UTF8'),invitation_digest,'sha256')
        and registration_invitations.pathway=coalesce(new.raw_user_meta_data->>'signup_path','individual')
        and expires_at>clock_timestamp() and consumed_at is null;
    if not found then raise exception 'Registration unavailable' using errcode='R2201'; end if;
  end if;
  if not p.referrals_enabled then new.raw_user_meta_data:=new.raw_user_meta_data-'referral_code'; end if;
  return new;
end;
$$;
create trigger ayinou_registration_policy before insert on auth.users
  for each row execute function private.enforce_registration_policy();

-- Auth can rewrite user metadata after insertion when attaching an identity.
create function private.scrub_signup_credentials()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.raw_user_meta_data:=new.raw_user_meta_data - array['founder_signup_proof','registration_invitation'];
  return new;
end;
$$;
create trigger ayinou_scrub_signup_credentials before update of raw_user_meta_data on auth.users
  for each row execute function private.scrub_signup_credentials();

create function private.scrub_signup_identity_credentials()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.identity_data:=new.identity_data - array['founder_signup_proof','registration_invitation'];
  return new;
end;
$$;
create trigger ayinou_scrub_signup_identity_credentials before insert or update of identity_data on auth.identities
  for each row execute function private.scrub_signup_identity_credentials();

create or replace function public.validate_referral_for_api(p_code text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.registration_policy where singleton and referrals_enabled)
    and exists(select 1 from private.referral_codes r where r.code=upper(btrim(p_code))
      and r.retired_at is null and private.institution_actor(r.user_id))
$$;

create or replace function private.capture_signup_referral()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text:=upper(btrim(new.raw_user_meta_data->>'referral_code'));
begin
  if candidate is null or candidate !~ '^R1-[0-9A-F]{16}$' or new.is_anonymous
    or not exists(select 1 from private.registration_policy where singleton and referrals_enabled)
    then return new; end if;
  insert into private.referrals(referred_user_id,referring_user_id,referral_code)
    select new.id,r.user_id,r.code from private.referral_codes r join auth.users u on u.id=r.user_id
    where r.code=candidate and r.retired_at is null and r.user_id<>new.id
      and lower(u.email)<>lower(new.email) and private.institution_actor(r.user_id)
    for share of r
    on conflict(referred_user_id) do nothing;
  return new;
end;
$$;

create or replace function private.confirm_signup_referral(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from private.referrals where referred_user_id=p_user_id) then return false; end if;
  if private.institution_actor(p_user_id) and private.founder_registration_email_proved(p_user_id)
    and exists(select 1 from private.registration_policy where singleton and referrals_enabled for share) then
    update private.referrals set confirmed_at=now()
      where referred_user_id=p_user_id and confirmed_at is null and private.institution_actor(referring_user_id);
  end if;
  return exists(select 1 from private.referrals where referred_user_id=p_user_id and confirmed_at is not null);
end;
$$;

revoke all on function private.registration_policy_value(private.registration_policy),private.enforce_registration_policy(),
  private.scrub_signup_credentials(),private.scrub_signup_identity_credentials(),
  public.registration_policy_for_api(),public.founder_registration_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.registration_policy_for_api(),
  public.founder_registration_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb) to service_role;
