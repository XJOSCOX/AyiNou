create table private.f1_founder_flow (
  singleton boolean primary key default true check(singleton),
  id uuid not null unique,
  prepared_at timestamptz not null default clock_timestamp(),
  signup_name text not null default ('setup_'||left(replace(gen_random_uuid()::text,'-',''),18)),
  authorization_hash bytea check(octet_length(authorization_hash)=32)
);
create table private.f1_appointment (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references private.platform_governance_proposals(id),
  target_id uuid not null references auth.users(id) on delete cascade,
  founder_id uuid not null references auth.users(id) on delete cascade,
  code_hash bytea check(octet_length(code_hash)=32),
  expires_at timestamptz not null,
  attempts integer not null default 0 check(attempts between 0 and 5),
  closed_at timestamptz
);
create table private.f1_events (
  id bigint generated always as identity primary key,
  workflow uuid not null,
  actor uuid references auth.users(id) on delete set null,
  event text not null check(event in ('prepared','unlocked','rejected','claimed','issued','revoked','expired','accepted','activated')),
  occurred_at timestamptz not null default clock_timestamp()
);
alter table private.f1_founder_flow enable row level security;
alter table private.f1_appointment enable row level security;
alter table private.f1_events enable row level security;
revoke all on private.f1_founder_flow,private.f1_appointment,private.f1_events from public,anon,authenticated,service_role;

create function public.f1_prepare_for_api(p_flow uuid,p_email text,p_username text,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if p_flow is null or (private.username_status(p_username,null,true)<>'available'
    and not exists(select 1 from private.f1_founder_flow f cross join private.founder_registration r where r.reserved_username=p_username))
  then return false; end if;
  if not public.prepare_founder_registration_for_api(p_email,p_username,p_hash) then return false; end if;
  insert into private.f1_founder_flow(id) values(p_flow)
    on conflict(singleton) do update set id=excluded.id,authorization_hash=null;
  insert into private.f1_events(workflow,event) values(p_flow,'prepared');
  return true;
end;
$$;

alter function public.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text) set schema private;
revoke all on function private.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text)
  from public,anon,authenticated,service_role;
create function public.claim_founder_registration_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_hash text)
returns text language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if exists(select 1 from private.f1_founder_flow) then return 'unavailable'; end if;
  return private.claim_founder_registration_for_api(p_actor,p_session,p_aal2,p_totp_at,p_hash);
end;
$$;

create or replace function public.founder_registration_status_for_api(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.institution_actor(p_actor)
    and not exists(select 1 from private.platform_bootstrap)
    and not exists(select 1 from private.f1_founder_flow)
    and exists(
      select 1 from private.founder_registration r join auth.users u on lower(trim(u.email))=r.configured_email
      where u.id=p_actor and private.founder_registration_email_proved(p_actor) and r.claimed_at is null
    );
$$;

create function public.f1_founder_for_api(p_flow uuid,p_action text,p_hash text,p_authorization text,
  p_actor uuid,p_session uuid,p_totp bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.founder_registration; f private.f1_founder_flow; temporary_name text;
begin
  if p_action='claim' then perform 1 from public.profiles where user_id=p_actor for update; end if;
  perform pg_advisory_xact_lock(20261120,300);
  select * into f from private.f1_founder_flow where id=p_flow;
  select * into r from private.founder_registration where singleton;
  if f.id is null or r.singleton is null or r.claimed_at is not null or r.expires_at<=clock_timestamp()
    or r.failed_attempts>=5 or exists(select 1 from private.platform_bootstrap)
  then return null; end if;
  if p_action='status' then
    return case when f.authorization_hash is null then jsonb_build_object('open',true) end;
  elsif p_action='unlock' then
    if f.authorization_hash is not null then return null; end if;
    if p_hash is distinct from encode(r.credential_hash,'hex') then
      update private.founder_registration set failed_attempts=failed_attempts+1 where singleton;
      insert into private.f1_events(workflow,event) values(p_flow,'rejected');
      return null;
    end if;
    update private.f1_founder_flow set authorization_hash=decode(p_authorization,'hex') where singleton;
    insert into private.f1_events(workflow,event) values(p_flow,'unlocked');
    return jsonb_build_object('open',true);
  end if;
  if f.authorization_hash is null or p_authorization is distinct from encode(f.authorization_hash,'hex') then return null; end if;
  temporary_name:=f.signup_name;
  if p_action='form' then
    return jsonb_build_object('email',r.configured_email,'username',r.reserved_username,'signupUsername',temporary_name);
  end if;
  if p_action is distinct from 'claim' or not exists(
    select 1 from auth.users u join public.profiles p on p.user_id=u.id
    where u.id=p_actor and u.created_at>=f.prepared_at and p.username=temporary_name
      and lower(trim(u.email))=r.configured_email and private.founder_registration_email_proved(u.id)
      and not private.auth_staff_provisioned_email(u.id,u.email,u.created_at)
  ) then return null; end if;
  if private.claim_founder_registration_for_api(p_actor,p_session,true,p_totp,encode(r.credential_hash,'hex'))<>'claimed'
  then return null; end if;
  update public.profiles set username=r.reserved_username,
    display_name=case when display_name=temporary_name then r.reserved_username else display_name end where user_id=p_actor;
  update private.username_retirements set public_alias=false where username=temporary_name;
  update private.f1_founder_flow set authorization_hash=null where singleton;
  insert into private.f1_events(workflow,actor,event) values(p_flow,p_actor,'claimed');
  return jsonb_build_object('claimed',true);
end;
$$;

create function public.f1_appointment_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_id uuid,p_action text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.f1_appointment; p private.platform_governance_proposals; written_reason text;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,false,p_action<>'status');
  if p_action='issue' then
    if not private.platform_founder(p_actor) or not private.platform_admin(p_actor) or p_hash is null then return null; end if;
    select * into p from private.platform_governance_proposals where id=p_id for update;
  else
    if p_action='revoke' then
      select * into i from private.f1_appointment where proposal_id=p_id and founder_id=p_actor for update;
    else
      select * into i from private.f1_appointment where id=p_id for update;
    end if;
    if not found or i.closed_at is not null or
      (case when p_action='revoke' then i.founder_id else i.target_id end) is distinct from p_actor then return null; end if;
    if p_action='revoke' then
      if not private.platform_founder(p_actor) or not private.platform_admin(p_actor) then return null; end if;
      update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id;
      insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'revoked');
      return jsonb_build_object('revoked',true);
    end if;
    if i.expires_at<=clock_timestamp() then
      update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id;
      insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'expired');
      return null;
    end if;
    select * into p from private.platform_governance_proposals where id=i.proposal_id for update;
  end if;
  if p.id is null or p.kind<>'appoint' or not private.platform_founder(p.proposer_id)
    or not private.platform_admin(p.proposer_id) or p.withdrawn_at is not null or p.expires_at<=clock_timestamp()
    or p.governance_version<>(select version from private.platform_governance where singleton)
    or not private.institution_actor(p.target_id) or not private.verified_totp(p.target_id)
    or not ('identity'=any(private.reviewed_personal_claims(p.target_id)))
    or exists(select 1 from public.role_assignments where user_id=p.target_id and role='administrator')
  then return null; end if;
  if p_action='issue' then
    if p.proposer_id is distinct from p_actor then return null; end if;
    insert into private.f1_appointment(proposal_id,target_id,founder_id,code_hash,expires_at)
      values(p.id,p.target_id,p_actor,decode(p_hash,'hex'),least(p.expires_at,clock_timestamp()+interval '24 hours'))
      on conflict(proposal_id) do nothing returning * into i;
    if not found then return null; end if;
    insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'issued');
    return jsonb_build_object('flowId',i.id,'expiresAt',i.expires_at);
  end if;
  if p_action='status' then return jsonb_build_object('ready',p.approved_at is not null and private.platform_admin(p.approver_id)); end if;
  if p_action is distinct from 'activate' or p.approved_at is null or p.approver_id in (p_actor,p.proposer_id)
    or not coalesce(private.platform_admin(p.approver_id),false) then return null; end if;
  if p_hash is distinct from encode(i.code_hash,'hex') then
    update private.f1_appointment set attempts=attempts+1,
      closed_at=case when attempts=4 then clock_timestamp() end,code_hash=case when attempts<4 then code_hash end where id=i.id;
    insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'rejected');
    return null;
  end if;
  select reason into written_reason from private.platform_governance_events where resource_id=p.id and action='propose' and version=1;
  if written_reason is null then return null; end if;
  insert into public.role_assignments(user_id,role,granted_by) values(p_actor,'administrator',p.proposer_id);
  insert into private.platform_admin_audit(actor_id,subject_id,event,role,reason) values(p.proposer_id,p_actor,'role_granted','administrator',written_reason);
  update private.platform_governance_proposals set accepted_at=coalesce(accepted_at,clock_timestamp()),version=version+1 where id=p.id;
  update private.f1_appointment set closed_at=clock_timestamp(),code_hash=null where id=i.id;
  insert into private.f1_events(workflow,actor,event) values(i.id,p_actor,'accepted'),(i.id,p_actor,'activated');
  return jsonb_build_object('activated',true);
end;
$$;

revoke all on function public.f1_prepare_for_api(uuid,text,text,text),
  public.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text),
  public.f1_founder_for_api(uuid,text,text,text,uuid,uuid,bigint),
  public.f1_appointment_for_api(uuid,uuid,boolean,bigint,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.f1_prepare_for_api(uuid,text,text,text),
  public.claim_founder_registration_for_api(uuid,uuid,boolean,bigint,text),
  public.f1_founder_for_api(uuid,text,text,text,uuid,uuid,bigint),
  public.f1_appointment_for_api(uuid,uuid,boolean,bigint,uuid,text,text) to service_role;

-- Appointment initiation is Founder-only. O5 still owns approvals and all other proposal types.
alter function public.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb) set schema private;
revoke all on function private.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated,service_role;
create function public.o5_proposal_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if p_action='propose' and p_input->>'kind'='appoint' and not private.platform_founder(p_actor)
  then raise exception 'Founder authorization required' using errcode='42501'; end if;
  return private.o5_proposal_command_for_api(p_actor,p_session,p_aal2,p_totp,p_id,p_action,p_version,p_request,p_input);
end;
$$;
revoke all on function public.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb) to service_role;
