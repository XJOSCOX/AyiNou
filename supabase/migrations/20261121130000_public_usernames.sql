-- The existing unique profile column remains the only source of active ownership.
create table private.username_signup_leases (
  username text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

-- Historical handles cannot become another member's identity. The nullable reference
-- keeps the tombstone after deletion while preventing it from resolving to an account.
create table private.username_retirements (
  username text primary key,
  former_owner uuid references public.profiles(user_id) on delete set null,
  public_alias boolean not null default true
);

create table private.username_events (
  id bigint generated always as identity primary key,
  subject_id uuid references auth.users(id) on delete set null,
  event text not null check (event in ('reserved','assigned','changed','retired','expired',
    'safety_hold','safety_release','administrative_correction','appeal_reviewed')),
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid unique,
  reason_code text check (reason_code in ('impersonation','abuse','false_positive','safety')),
  command_hash bytea check (octet_length(command_hash)=32),
  old_username text,
  new_username text,
  source text not null check (source in ('signup','member','operator','expiry')),
  policy_version smallint not null default 1,
  occurred_at timestamptz not null default clock_timestamp()
);
create table private.username_safety_holds (
  username text primary key,
  held_at timestamptz not null default clock_timestamp()
);
alter table private.username_safety_holds enable row level security;
revoke all on private.username_safety_holds from public,anon,authenticated,service_role;

create index username_events_member_changes on private.username_events(subject_id,occurred_at desc) where event='changed';
create index username_signup_leases_expiry on private.username_signup_leases(expires_at);
alter table private.username_signup_leases enable row level security;
alter table private.username_retirements enable row level security;
alter table private.username_events enable row level security;
revoke all on private.username_signup_leases,private.username_retirements,private.username_events
  from public,anon,authenticated,service_role;

create function private.normalize_public_username(p_input text)
returns text language sql immutable strict set search_path='' as $$
  select translate(btrim(p_input,E' \t\r\n'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');
$$;

-- Version 1 uses exact normalized tokens and explicitly enumerated official variants.
-- Ordinary words that merely contain one of these terms do not match.
create function private.username_policy_v1(p_username text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_username is null or p_username collate "C" !~ '^[a-z][a-z0-9_]{2,23}$' then 'invalid'
    when translate(regexp_replace(p_username,'_','','g'),'013457','oieast') ~
      '^(ayinou|admin|administrat(or|eur|rice)|administrador(a)?|administrasyon|founder|fondat(eur|rice)|fundador(a)?|support|security|securite|seguridad|sekirite|official|officiel|ofisyel|oficial|system|sistem|sistema|root|moderat(or|eur|rice)|moderador(a)?|verification|verificacion|verifikasyon|help|aide|ayuda|ed|contact|kontak|contacto|privacy|confidentialite|privacidad|ay(i|1)nou(admin|support|security|officiel|official|oficial|ofisyel|help|staff|team|verification)?|admin(ayinou|[0-9]+)|support(ayinou|[0-9]+)|founder(ayinou|[0-9]+)|staffayinou)$'
      or regexp_replace(p_username,'_','','g') ~ '^(ayinou|admin|support|founder|official)[0-9]+$'
      then 'reserved'
    when exists (
      select 1 from unnest(string_to_array(p_username,'_') || array[replace(p_username,'_','')]) as segment(value)
      where regexp_replace(translate(segment.value,'013457','oieast'),'[0-9]+$','') = any(array[
        'nigger','nigga','kike','chink','faggot','siegheil','whitepower',
        'rapeher','rapist','killall','killthem','killhaitians',
        'enculeta','tuertous','violertoi','tuerleshaitiens',
        'maricon','sudaca','violarte','matartodos','matarhaitianos',
        'krazemoun','touyemoun','vyolew','konyenmanmanw'
      ])
    ) then 'blocked'
    else 'available'
  end;
$$;

create function private.username_status(p_username text,p_actor uuid,p_founder_signup boolean default false)
returns text language plpgsql stable set search_path='' as $$
declare policy text:=private.username_policy_v1(p_username);
begin
  if policy<>'available' then return policy; end if;
  if exists(select 1 from private.username_safety_holds where username=p_username)
    or exists(select 1 from private.founder_registration r where r.reserved_username=p_username
    and (p_founder_signup or p_actor is null or
      (r.claimed_at is not null and r.subject_id is distinct from p_actor)
      or (r.claimed_at is null and not exists(
        select 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null
          and not u.is_anonymous and u.deleted_at is null and lower(trim(u.email))=r.configured_email))))
    or exists(select 1 from private.username_retirements r where r.username=p_username
      and (p_actor is null or r.former_owner is distinct from p_actor))
  then return 'unavailable'; end if;
  if exists(select 1 from public.profiles p where p.username=p_username and p.user_id is distinct from p_actor
    and feed_data.followable_member(p)) then return 'taken'; end if;
  if exists(select 1 from public.profiles p where p.username=p_username and p.user_id is distinct from p_actor)
    or exists(select 1 from private.username_signup_leases l where l.username=p_username and l.user_id is distinct from p_actor
      and l.expires_at>statement_timestamp())
  then return 'unavailable'; end if;
  return 'available';
end;
$$;

create function public.username_availability_for_api(p_username text)
returns text language sql stable security definer set search_path='' as $$
  select private.username_status(private.normalize_public_username(p_username),null,true);
$$;

create function private.expire_username_leases()
returns void language sql set search_path='' as $$
  with expired as (
    delete from private.username_signup_leases l where l.username in (
      select b.username from private.username_signup_leases b
      where b.expires_at<=statement_timestamp() order by b.expires_at limit 50
    ) returning l.user_id,l.username
  )
  insert into private.username_events(subject_id,event,old_username,source)
    select user_id,'expired',username,'expiry' from expired;
$$;

create function private.guard_public_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate_status text; actor uuid:=auth.uid();
begin
  if tg_op='UPDATE' and new.username is not distinct from old.username and new.user_id=old.user_id then return new; end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or (old.username is not null and new.username is null)) then
    raise exception 'username ownership cannot be removed by a profile edit' using errcode='23514';
  end if;
  if new.username is null then return new; end if;

  -- The Founder reservation also uses this lock. Follow the existing lock order.
  perform pg_advisory_xact_lock(20261120,300);
  candidate_status:=private.username_status(new.username,new.user_id);
  if candidate_status in ('taken','unavailable') then raise exception 'username unavailable' using errcode='23505'; end if;
  if candidate_status<>'available' then raise exception 'username not permitted' using errcode='U1001'; end if;
  if actor is not null and (actor<>new.user_id or not private.member_session_allowed()) then
    raise exception 'profile update unavailable' using errcode='42501';
  end if;
  -- A bounded write budget protects the history without implementing a product cooldown.
  if actor is not null and tg_op='UPDATE' and old.username is not null
    and (select count(*) from private.username_events e where e.subject_id=actor and e.event='changed'
      and e.occurred_at>statement_timestamp()-interval '1 day')>=5
  then raise exception 'username change budget exceeded' using errcode='U1002'; end if;
  return new;
end;
$$;

create function private.record_public_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous text; origin text;
begin
  if tg_op='UPDATE' then
    if new.username is not distinct from old.username then return new; end if;
    previous:=old.username;
  end if;
  if tg_op='DELETE' then
    if old.username is not null then
      perform pg_advisory_xact_lock(20261120,300);
      insert into private.username_retirements(username) values(old.username)
        on conflict(username) do update set former_owner=null;
      insert into private.username_events(event,old_username,source) values('retired',old.username,'operator');
    end if;
    return old;
  end if;
  if new.username is null then return new; end if;
  origin:=case when auth.uid()=new.user_id then 'member'
    when exists(select 1 from private.username_signup_leases l where l.user_id=new.user_id and l.username=new.username)
      then 'signup' else 'operator' end;
  if previous is not null then
    insert into private.username_retirements(username,former_owner) values(previous,new.user_id)
      on conflict(username) do nothing;
  end if;
  insert into private.username_events(subject_id,actor_id,event,old_username,new_username,source)
    values(new.user_id,auth.uid(),case when previous is null then 'assigned' else 'changed' end,previous,new.username,origin);
  return new;
end;
$$;

create trigger u1_username_guard before insert or update of username,user_id on public.profiles
  for each row execute function private.guard_public_username();
create trigger u1_username_event after insert or delete or update of username on public.profiles
  for each row execute function private.record_public_username();

create function private.capture_signup_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text;
begin
  if new.is_anonymous then return new; end if;
  if tg_op='INSERT' then
    -- GoTrue may confirm privileged provisioning after its initial INSERT.
    if not coalesce(new.raw_user_meta_data ? 'public_username',false) then return new; end if;
    candidate:=private.normalize_public_username(new.raw_user_meta_data->>'public_username');
    if private.username_policy_v1(candidate)<>'available' then
      raise exception 'username unavailable' using errcode='U1001';
    end if;
    perform pg_advisory_xact_lock(20261120,300);
    perform private.expire_username_leases();
    if private.username_status(candidate,new.id,true)<>'available' then
      raise exception 'username unavailable' using errcode='U1001';
    end if;
    -- An expired row may remain after the bounded cleanup of a large backlog.
    with expired as (
      delete from private.username_signup_leases where username=candidate and expires_at<=statement_timestamp()
        returning username,user_id
    )
    insert into private.username_events(subject_id,event,old_username,source)
      select user_id,'expired',username,'expiry' from expired;
    insert into private.username_signup_leases(username,user_id,expires_at)
      values(candidate,new.id,statement_timestamp()+interval '24 hours');
    insert into private.username_events(subject_id,event,new_username,source)
      values(new.id,'reserved',candidate,'signup');
  elsif old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;
  if new.email_confirmed_at is null then return new; end if;

  perform pg_advisory_xact_lock(20261120,300);
  perform private.expire_username_leases();
  select username into candidate from private.username_signup_leases
    where user_id=new.id and expires_at>statement_timestamp();
  if found then
    if private.username_status(candidate,new.id,true)='available' then
      perform private.initialize_member(new.id);
      update public.profiles set username=candidate,display_name=coalesce(display_name,candidate),
        preferred_locale=case when new.raw_user_meta_data->>'preferred_locale' in ('ht','fr','en','es')
          then new.raw_user_meta_data->>'preferred_locale' else preferred_locale end
        where user_id=new.id and username is null;
    end if;
    delete from private.username_signup_leases where user_id=new.id;
  end if;
  return new;
end;
$$;
create trigger u1_signup_username after insert or update of email_confirmed_at on auth.users
  for each row execute function private.capture_signup_username();

-- Check the completed Auth transaction, so admin-confirmed provisioning and invitations
-- retain their existing entry point while ordinary unconfirmed signups require a lease.
create function private.require_signup_username()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from auth.users u where u.id=new.id
    and u.email is not null and u.email_confirmed_at is null and u.invited_at is null and not u.is_anonymous)
    and not exists(select 1 from private.username_signup_leases where user_id=new.id)
  then raise exception 'username is required' using errcode='U1001'; end if;
  return new;
end;
$$;
create constraint trigger u1_signup_username_required after insert on auth.users
  deferrable initially deferred for each row execute function private.require_signup_username();
revoke all on function private.require_signup_username() from public,anon,authenticated,service_role;

-- Resolve old profile URLs with the same visibility, block, and session predicates.
-- Other handle-based commands continue to require the current handle.
create or replace function public.find_public_profile_for_api(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.display_name,p.username,p.biography,p.avatar_asset,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where (p.username=p_username or p.user_id=(select r.former_owner from private.username_retirements r where r.username=p_username and r.public_alias))
    and feed_data.followable_member(p);
$$;
create or replace function public.find_member_profile_for_client(p_username text)
returns table(user_id uuid,display_name text,username text,biography text,avatar_asset uuid,membership_category text)
language sql stable security definer set search_path='' as $$
  select p.user_id,p.display_name,p.username,p.biography,p.avatar_asset,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using(user_id) join public.member_private m using(user_id)
  where (p.username=p_username or p.user_id=(select r.former_owner from private.username_retirements r where r.username=p_username and r.public_alias))
    and feed_data.member_allowed() and feed_data.followable_member(p);
$$;

revoke all on function private.normalize_public_username(text),private.username_policy_v1(text),
  private.username_status(text,uuid,boolean),private.expire_username_leases(),private.guard_public_username(),
  private.record_public_username(),private.capture_signup_username(),public.username_availability_for_api(text)
  from public,anon,authenticated,service_role;
grant execute on function public.username_availability_for_api(text) to service_role;

-- Keep the authenticated write contract and preserve same-value legacy handles.
create or replace function public.save_member_profile_v2(p_changes jsonb)
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

  if p_changes ? 'username' then
    -- Normalize before the historical helper can apply locale-sensitive Unicode lowercasing.
    p_changes:=jsonb_set(p_changes,'{username}',to_jsonb(private.normalize_public_username(p_changes->>'username')));
    if (p_changes->>'username') collate "C" !~ '^[a-z0-9][a-z0-9_]{2,23}$' then
      raise exception 'username not permitted' using errcode='U1001';
    end if;
  end if;

  -- The underlying operation locks the member row before updating profile and settings.
  perform private.save_member_profile_v2(p_changes);
  if exists (
    select 1 from public.user_settings s join public.profiles p using (user_id)
    where s.user_id = uid and s.discoverable and (p.username is null or p.display_name is null)
  ) then raise exception 'discoverability requires a public name and username' using errcode = '23514'; end if;
end;
$$;


-- Operators record categorical decisions. Private correspondence stays out of this ledger.
create function public.review_username_for_api(p_actor uuid,p_session uuid,p_totp bigint,p_request uuid,
  p_action text,p_username text,p_new_username text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  candidate text:=private.normalize_public_username(p_username);
  replacement text:=private.normalize_public_username(p_new_username);
  prior private.username_events;
  target uuid;
  action_event text;
  receipt bigint;
  fingerprint bytea;
begin
  if p_totp is null or p_totp < extract(epoch from now())-900 or p_totp > extract(epoch from now())+30
    or not public.account_session_for_api(p_actor,p_session,true,true) or not private.platform_admin(p_actor)
  then raise exception 'review unavailable' using errcode='42501'; end if;
  if p_request is null or candidate is null or candidate collate "C" !~ '^[a-z0-9][a-z0-9_]{2,23}$'
    or p_reason is null or p_reason not in ('impersonation','abuse','false_positive','safety')
    or p_action is null or p_action not in ('hold','release','correct','appeal_reviewed')
    or ((p_action='correct') is distinct from (replacement is not null))
  then raise exception 'invalid review' using errcode='23514'; end if;

  fingerprint:=sha256(convert_to(jsonb_build_array(p_action,candidate,replacement,p_reason)::text,'UTF8'));
  -- Correction follows the profile write lock order. Serialize other operations on the
  -- same reservation lock before checking the command receipt or changing the hold.
  if p_action='correct' then
    select user_id into target from public.profiles where username=candidate for update;
  end if;
  perform pg_advisory_xact_lock(20261120,300);
  if not public.account_session_for_api(p_actor,p_session,true,true) or not private.platform_admin(p_actor)
  then raise exception 'review unavailable' using errcode='42501'; end if;
  select * into prior from private.username_events where request_id=p_request;
  if found then
    if prior.actor_id is distinct from p_actor or prior.command_hash is distinct from fingerprint
    then raise exception 'review conflict' using errcode='U1003'; end if;
    return jsonb_build_object('receiptId',prior.id::text,'event',prior.event);
  end if;

  case p_action
    when 'hold' then
      if exists(select 1 from public.profiles where username=candidate)
        or exists(select 1 from private.username_signup_leases where username=candidate and expires_at>statement_timestamp())
        or exists(select 1 from private.founder_registration where reserved_username=candidate)
      then raise exception 'review conflict' using errcode='U1003'; end if;
      insert into private.username_safety_holds(username) values(candidate) on conflict do nothing;
      if not found then raise exception 'review conflict' using errcode='U1003'; end if;
      action_event:='safety_hold';
    when 'release' then
      delete from private.username_safety_holds where username=candidate;
      if not found then raise exception 'review conflict' using errcode='U1003'; end if;
      action_event:='safety_release';
    when 'correct' then
      if target is null or target=p_actor or candidate=replacement or private.platform_founder(target)
        or exists(select 1 from public.role_assignments where user_id=target and role='administrator')
        or exists(select 1 from private.founder_registration where reserved_username=candidate)
      then raise exception 'review conflict' using errcode='U1003'; end if;
      update public.profiles set username=replacement where user_id=target and username=candidate;
      if not found then raise exception 'review conflict' using errcode='U1003'; end if;
      update private.username_retirements set public_alias=false where username=candidate;
      action_event:='administrative_correction';
    else action_event:='appeal_reviewed';
  end case;

  insert into private.username_events(subject_id,actor_id,event,old_username,new_username,source,request_id,reason_code,command_hash)
    values(target,p_actor,action_event,candidate,replacement,'operator',p_request,p_reason,fingerprint)
    returning id into receipt;
  return jsonb_build_object('receiptId',receipt::text,'event',action_event);
end;
$$;
revoke all on function public.review_username_for_api(uuid,uuid,bigint,uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.review_username_for_api(uuid,uuid,bigint,uuid,text,text,text,text) to service_role;

-- Separate anonymous availability checks from the public discovery budget.
alter table feed_data.read_limits drop constraint read_limits_category_check;
alter table feed_data.read_limits add constraint read_limits_category_check
  check(category in ('feed','media','discovery','profile','notifications','username'));

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
    when 'username' then 30 end;
  if ceiling is null then raise exception 'invalid rate category' using errcode='22023'; end if;
  subject_key:=coalesce('member:'||p_actor::text,'guest:'||p_bucket::text);
  insert into feed_data.read_limits(subject,category,window_started,total) values(subject_key,p_category,slot,1)
  on conflict(subject,category) do update set window_started=excluded.window_started,
    total=case when read_limits.window_started=slot then read_limits.total+1 else 1 end
  where read_limits.window_started<slot or (read_limits.window_started=slot and read_limits.total<ceiling);
  return found;
end;
$$;
