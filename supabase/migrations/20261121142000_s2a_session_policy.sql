-- Supabase Auth owns the session ID and original start. This layer governs Ayinou access.
create table private.s2a_session_policy (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  audit_ref uuid not null unique default gen_random_uuid(),
  privileged_at_sign_in boolean not null,
  remembered boolean not null default false,
  choice_recorded boolean not null default false
);
create table private.s2a_privilege_transition (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reauthenticate_after timestamptz not null
);
create table private.s2a_session_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  policy_ref uuid,
  event text not null check (event in ('issued','remembered','expired','privileged_mfa','promotion','revocation')),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (policy_ref,event)
);
alter table private.s2a_session_policy enable row level security;
alter table private.s2a_privilege_transition enable row level security;
alter table private.s2a_session_events enable row level security;
revoke all on private.s2a_session_policy,private.s2a_privilege_transition,private.s2a_session_events
  from public,anon,authenticated,service_role;

create function private.s2a_leadership(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select private.platform_founder(p_user) or exists (
    select 1 from public.role_assignments where user_id=p_user and role='administrator'
  );
$$;

create function private.s2a_deadline(p_started timestamptz,p_privileged boolean,p_remembered boolean)
returns timestamptz language sql immutable set search_path='' as $$
  select p_started + case when p_privileged then interval '6 hours'
    when p_remembered then interval '720 hours' else interval '12 hours' end;
$$;

create function private.s2a_session_within_policy(p_user uuid,p_session uuid,p_now timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from auth.sessions s
    left join private.s2a_session_policy p on p.session_id=s.id
    left join private.s2a_privilege_transition t on t.user_id=s.user_id
    where s.id=p_session and s.user_id=p_user and s.created_at<=p_now
      and (s.not_after is null or s.not_after>p_now)
      and (t.reauthenticate_after is null or s.created_at>t.reauthenticate_after)
      and private.s2a_deadline(s.created_at,
        coalesce(p.privileged_at_sign_in,false) or private.s2a_leadership(p_user),
        coalesce(p.remembered,false))>p_now
  );
$$;

create or replace function private.live_account_session(p_user uuid,p_session uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_user)
    and private.s2a_session_within_policy(p_user,p_session,clock_timestamp());
$$;

-- Direct table writes must use the same predicate as private reads and RPCs.
create policy member_private_live_session on public.member_private as restrictive for all to authenticated
  using ((select private.member_session_allowed())) with check ((select private.member_session_allowed()));
create policy user_settings_live_session on public.user_settings as restrictive for all to authenticated
  using ((select private.member_session_allowed())) with check ((select private.member_session_allowed()));
create policy member_interests_live_session on public.member_interests as restrictive for all to authenticated
  using ((select private.member_session_allowed())) with check ((select private.member_session_allowed()));

create function private.s2a_issue_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare ref uuid;
begin
  insert into private.s2a_session_policy(session_id,privileged_at_sign_in)
    values(new.id,private.s2a_leadership(new.user_id)) returning audit_ref into ref;
  insert into private.s2a_session_events(user_id,policy_ref,event) values(new.user_id,ref,'issued');
  return new;
end;
$$;
create trigger ayinou_s2a_issue_session_policy after insert on auth.sessions
for each row execute function private.s2a_issue_policy();

-- Installing the trigger locks out concurrent Auth writes until backfill commits.
-- Existing sessions retain their real start and default to nonremembered.
insert into private.s2a_session_policy(session_id,privileged_at_sign_in,choice_recorded)
select id,private.s2a_leadership(user_id),true from auth.sessions where created_at is not null;

-- Only the holder of a fresh password session may record its one-time browser preference.
create function public.s2a_set_session_preference(p_remember boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  s auth.sessions;
  p private.s2a_session_policy;
  privileged boolean;
  deadline timestamptz;
begin
  if p_remember is null or not private.live_account_session(actor,sid) then return null; end if;
  select * into s from auth.sessions where id=sid and user_id=actor for share;
  select * into p from private.s2a_session_policy where session_id=sid for update;
  if not found then return null; end if;
  privileged:=p.privileged_at_sign_in or private.s2a_leadership(actor);
  if not p.choice_recorded then
    if s.created_at<=clock_timestamp()-interval '2 minutes'
      or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) m
        where m->>'method'='password')
      or not private.live_account_session(actor,sid)
      then return null; end if;
    update private.s2a_session_policy set remembered=p_remember and not privileged,choice_recorded=true
      where session_id=sid returning * into p;
    if p.remembered then
      insert into private.s2a_session_events(user_id,policy_ref,event) values(actor,p.audit_ref,'remembered');
    end if;
  end if;
  deadline:=least(s.not_after,private.s2a_deadline(s.created_at,privileged,p.remembered));
  return jsonb_build_object('remembered',p.remembered and not privileged,'expiresAt',deadline);
end;
$$;

-- Never turn failed attempts into an unbounded audit stream.
create function private.s2a_record_expiry(p_user uuid,p_session uuid)
returns void language sql security definer set search_path='' as $$
  insert into private.s2a_session_events(user_id,policy_ref,event)
  select s.user_id,p.audit_ref,'expired'
  from auth.sessions s join private.s2a_session_policy p on p.session_id=s.id
  where s.id=p_session and s.user_id=p_user
    and least(s.not_after,private.s2a_deadline(s.created_at,
      p.privileged_at_sign_in or private.s2a_leadership(s.user_id),p.remembered))<=clock_timestamp()
  on conflict(policy_ref,event) do nothing;
$$;

create function public.s2a_observe_expiry()
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.s2a_record_expiry(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
  return private.institution_actor(auth.uid());
end;
$$;

create function public.s2a_observe_expiry_for_api(p_user uuid,p_session uuid)
returns void language sql security definer set search_path='' as $$
  select private.s2a_record_expiry(p_user,p_session);
$$;

create function private.s2a_audit_privileged_mfa()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.s2a_leadership(new.user_id) and private.live_account_session(new.user_id,new.id) then
    insert into private.s2a_session_events(user_id,policy_ref,event)
      select new.user_id,p.audit_ref,'privileged_mfa' from private.s2a_session_policy p where p.session_id=new.id
      on conflict(policy_ref,event) do nothing;
  end if;
  return new;
end;
$$;
create trigger ayinou_s2a_privileged_mfa after update of aal,factor_id on auth.sessions
for each row when (new.aal='aal2' and (old.aal is distinct from new.aal or old.factor_id is distinct from new.factor_id))
execute function private.s2a_audit_privileged_mfa();

-- The successful F1 activation event is in the same transaction as the role assignment.
create function private.s2a_invalidate_pre_promotion_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.s2a_privilege_transition(user_id,reauthenticate_after)
    values(new.actor,clock_timestamp())
    on conflict(user_id) do update set reauthenticate_after=excluded.reauthenticate_after;
  insert into private.s2a_session_events(user_id,event) values(new.actor,'promotion');
  return new;
end;
$$;
create trigger ayinou_s2a_administrator_activation after insert on private.f1_events
for each row when (new.event='activated') execute function private.s2a_invalidate_pre_promotion_sessions();

create function private.s2a_audit_administrator_revocation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.s2a_session_events(user_id,event) values(old.user_id,'revocation');
  return old;
end;
$$;
create trigger ayinou_s2a_administrator_revocation after delete on public.role_assignments
for each row when (old.role='administrator') execute function private.s2a_audit_administrator_revocation();

revoke all on function private.s2a_leadership(uuid),private.s2a_deadline(timestamptz,boolean,boolean),
  private.s2a_session_within_policy(uuid,uuid,timestamptz),private.s2a_issue_policy(),private.s2a_audit_privileged_mfa(),
  private.s2a_invalidate_pre_promotion_sessions(),private.s2a_audit_administrator_revocation(),
  private.s2a_record_expiry(uuid,uuid),public.s2a_observe_expiry_for_api(uuid,uuid),
  public.s2a_set_session_preference(boolean),public.s2a_observe_expiry()
  from public,anon,authenticated,service_role;
grant execute on function public.s2a_set_session_preference(boolean),public.s2a_observe_expiry() to authenticated;
grant execute on function public.s2a_observe_expiry_for_api(uuid,uuid) to service_role;
