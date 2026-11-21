-- No production policy, authority or evidence is provisioned by this migration.
create table private.founder_identity_authorities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope='founder_identity'),
  approval_ref uuid not null,
  active_from timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at>active_from),
  revoked_at timestamptz,
  unique (id,actor_id)
);
create unique index founder_identity_authority_unrevoked
  on private.founder_identity_authorities(actor_id) where revoked_at is null;

create table private.founder_identity_cases (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users(id) on delete restrict,
  reviewer_id uuid not null,
  authority_id uuid not null,
  policy_version integer not null default 1 check (policy_version>0),
  version integer not null default 1 check (version>0),
  state text not null default 'consent_pending' check (state in
    ('consent_pending','proof_pending','ready_for_review','granted','held','revoked','denied','withdrawn')),
  consent_version integer,
  consent_at timestamptz,
  disclose boolean not null default false,
  conflicted boolean not null default false,
  decision text check (decision in ('confirmed','insufficient_proof','conflict','account_risk','member_request','corrected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (authority_id,reviewer_id) references private.founder_identity_authorities(id,actor_id) on delete restrict,
  unique (id,subject_id,reviewer_id,policy_version),
  check (subject_id<>reviewer_id),
  check ((consent_version is null)=(consent_at is null)),
  check (not disclose or consent_version is not null)
);
create unique index founder_identity_one_open on private.founder_identity_cases(subject_id)
  where state not in ('revoked','denied','withdrawn');
create index founder_identity_subject_history on private.founder_identity_cases(subject_id,created_at desc,id);
create index founder_identity_reviewer_cases on private.founder_identity_cases(authority_id,updated_at desc,id);

create table private.founder_identity_proofs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  subject_id uuid not null,
  reviewer_id uuid not null,
  policy_version integer not null,
  bound_version integer not null check (bound_version>0),
  method text not null check (method='synthetic_identity_and_control'),
  confirmed_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>confirmed_at and expires_at<=confirmed_at+interval '30 minutes'),
  consumed_at timestamptz,
  unique (case_id,bound_version),
  unique (id,case_id),
  foreign key (case_id,subject_id,reviewer_id,policy_version)
    references private.founder_identity_cases(id,subject_id,reviewer_id,policy_version) on delete restrict
);
create table private.founder_identity_grants (
  case_id uuid primary key,
  subject_id uuid not null,
  issuer_id uuid not null,
  policy_version integer not null,
  proof_id uuid not null unique,
  issued_at timestamptz not null default now(),
  foreign key (case_id,subject_id,issuer_id,policy_version)
    references private.founder_identity_cases(id,subject_id,reviewer_id,policy_version) on delete restrict,
  foreign key (proof_id,case_id) references private.founder_identity_proofs(id,case_id) on delete restrict
);
-- The case state is the live hold/revocation source. The grant records immutable issuance provenance.
create index founder_identity_grant_subject on private.founder_identity_grants(subject_id);

-- Restricted domain ledger. Command receipts live here so a successful change has one canonical event.
create table private.founder_identity_events (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 1 check (schema_version=1),
  actor_id uuid references auth.users(id) on delete restrict,
  case_id uuid references private.founder_identity_cases(id) on delete restrict,
  authority_id uuid references private.founder_identity_authorities(id) on delete restrict,
  action text not null check (action in ('authority_assigned','authority_revoked','open','consent','visibility',
    'withdraw','proof_recorded','grant','hold','release','revoke','deny','conflict','correction')),
  reason text,
  previous_state text,
  next_state text,
  case_version integer,
  policy_version integer,
  request_id uuid,
  command jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (actor_id,request_id),
  check ((case_id is null)=(case_version is null)),
  check ((actor_id is null)=(action in ('authority_assigned','authority_revoked','proof_recorded'))),
  check ((request_id is null)=(command is null))
);
create index founder_identity_event_case on private.founder_identity_events(case_id,occurred_at desc,id);
create index founder_identity_event_actor on private.founder_identity_events(actor_id,occurred_at desc);

alter table private.founder_identity_authorities enable row level security;
alter table private.founder_identity_cases enable row level security;
alter table private.founder_identity_proofs enable row level security;
alter table private.founder_identity_grants enable row level security;
alter table private.founder_identity_events enable row level security;
revoke all on private.founder_identity_authorities,private.founder_identity_cases,private.founder_identity_proofs,
  private.founder_identity_grants,private.founder_identity_events from public,anon,authenticated,service_role;

-- Only the guarded disposable fixture replaces this function. Production activation needs reviewed SQL.
create function private.founder_identity_policy_open()
returns boolean language sql immutable set search_path='' as $$ select false $$;

create function private.founder_identity_authority(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint)
returns uuid language sql stable set search_path='' as $$
  select a.id from private.founder_identity_authorities a
  where a.actor_id=p_actor and a.scope='founder_identity' and a.revoked_at is null
    and a.active_from<=clock_timestamp() and a.expires_at>clock_timestamp()
    and p_totp_at between extract(epoch from statement_timestamp())::bigint-900
      and extract(epoch from statement_timestamp())::bigint+30
    and private.platform_admin(p_actor)
    and public.account_session_for_api(p_actor,p_session,p_aal2,true)
$$;

-- There is deliberately no RPC for assigning authority or writing evidence.
create function private.audit_founder_identity_authority()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' or (old.revoked_at is null and new.revoked_at is not null
    and (to_jsonb(new)-'revoked_at')=(to_jsonb(old)-'revoked_at')) then
    insert into private.founder_identity_events(authority_id,action)
      values(new.id,case when tg_op='INSERT' then 'authority_assigned' else 'authority_revoked' end);
  elsif new is distinct from old then
    raise exception 'replace authority with a new recorded assignment' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger founder_identity_authority_audit after insert or update on private.founder_identity_authorities
  for each row execute function private.audit_founder_identity_authority();

create function private.record_founder_identity_proof()
returns trigger language plpgsql set search_path='' as $$
declare
  c private.founder_identity_cases;
begin
  select * into c from private.founder_identity_cases where id=new.case_id for update;
  if not private.founder_identity_policy_open() or not coalesce(
    c.version=new.bound_version and c.policy_version=1 and c.consent_version=c.policy_version and not c.conflicted
    and c.state in ('proof_pending','ready_for_review','held') and new.consumed_at is null
    and new.confirmed_at>=c.consent_at and new.confirmed_at<=clock_timestamp()
    and new.expires_at>clock_timestamp(),false)
  then raise exception 'current proof unavailable' using errcode='55000'; end if;
  update private.founder_identity_cases
    set state=case when c.state='held' then 'held' else 'ready_for_review' end,
      version=c.version+1,updated_at=clock_timestamp() where id=c.id;
  insert into private.founder_identity_events(case_id,authority_id,action,
    previous_state,next_state,case_version,policy_version)
    values(c.id,c.authority_id,'proof_recorded',c.state,
      case when c.state='held' then 'held' else 'ready_for_review' end,c.version+1,c.policy_version);
  return new;
end
$$;
create trigger founder_identity_proof_receipt after insert on private.founder_identity_proofs
  for each row execute function private.record_founder_identity_proof();

create function private.founder_identity_card(c private.founder_identity_cases,p_admin boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'version',c.version,'policyVersion',c.policy_version,
    'state',c.state,'consented',c.consent_version=c.policy_version and c.consent_at is not null,
    'disclose',c.disclose,'decision',c.decision,'updatedAt',c.updated_at,
    'correctionPending',exists(select 1 from private.founder_identity_events e where e.case_id=c.id and e.action='correction'))
  || case when p_admin then jsonb_build_object(
    'username',(select p.username from public.profiles p where p.user_id=c.subject_id),
    'conflicted',c.conflicted,'proofReady',exists(select 1 from private.founder_identity_proofs p
      where p.case_id=c.id and p.bound_version=c.version-1 and p.expires_at>statement_timestamp() and p.consumed_at is null),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h."occurredAt" desc,h.id)
      from (select e.id,e.action,e.reason,e.occurred_at as "occurredAt",e.case_version as version
        from private.founder_identity_events e where e.case_id=c.id
        order by e.occurred_at desc,e.id limit 25) h),'[]'::jsonb)) else '{}'::jsonb end
$$;

create function public.founder_identity_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare authority uuid;
begin
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_admin then
    authority := private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at);
    if authority is null then raise exception 'access denied' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('issuanceEnabled',private.founder_identity_policy_open(),'cases',
    coalesce((select jsonb_agg(private.founder_identity_card(c.item,p_admin) order by (c.item).updated_at desc,(c.item).id)
      from (select x as item from private.founder_identity_cases x
        where case when p_admin then x.authority_id=authority else x.subject_id=p_actor end
        order by x.updated_at desc,x.id limit 30) c),'[]'::jsonb));
end
$$;

create function public.founder_identity_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_username text,p_action text,p_expected integer,p_policy integer,p_request uuid,p_reason text,p_disclose boolean,p_no_conflict boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  authority uuid;
  subject uuid;
  c private.founder_identity_cases;
  proof uuid;
  prior private.founder_identity_events;
  event_id uuid;
  next_state text;
  old_state text;
  command jsonb := jsonb_build_object('admin',p_admin,'id',p_id,'username',p_username,'action',p_action,
    'expected',p_expected,'policy',p_policy,'reason',p_reason,'disclose',p_disclose,'noConflict',p_no_conflict);
begin
  -- The same actor cannot race its receipt checks. Case locks serialize member and founder commands.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_admin then
    perform 1 from private.founder_identity_authorities where actor_id=p_actor and revoked_at is null for share;
    perform 1 from public.role_assignments where user_id=p_actor and role='administrator' for share;
    perform 1 from auth.mfa_factors f join auth.sessions s on s.factor_id=f.id where s.id=p_session for share of f;
    authority := private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at);
    if authority is null then raise exception 'access denied' using errcode='42501'; end if;
  end if;
  if p_policy is distinct from 1 or p_request is null or not coalesce(
    (p_admin and p_action in ('open','grant','hold','release','revoke','deny','conflict') and p_disclose is null
      and case when p_action in ('grant','release') then p_no_conflict is true else p_no_conflict is null end)
    or (not p_admin and p_no_conflict is null and p_action in ('consent','visibility','withdraw','correction') and p_reason is null
      and (p_disclose is not null)=(p_action in ('consent','visibility'))),false)
  then raise exception 'invalid command' using errcode='23514'; end if;

  if p_action='open' then
    if p_id is not null or p_expected is distinct from 0 or p_reason is distinct from 'member_request'
      or not coalesce(p_username ~ '^[a-z0-9][a-z0-9_]{2,23}$',false)
    then raise exception 'invalid request' using errcode='23514'; end if;
    select p.user_id into subject from public.profiles p where p.username=p_username;
    if subject=p_actor then raise exception 'access denied' using errcode='42501'; end if;
    if not private.institution_actor(subject) then raise exception 'account unavailable' using errcode='O2003'; end if;
  else
    if p_username is not null or p_id is null or not coalesce(p_expected>0,false)
    then raise exception 'invalid request' using errcode='23514'; end if;
    select * into c from private.founder_identity_cases x where x.id=p_id
      and (case when p_admin then x.authority_id=authority else x.subject_id=p_actor end) for update;
    if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
    subject := c.subject_id;
  end if;
  select * into prior from private.founder_identity_events e where e.actor_id=p_actor and e.request_id=p_request;
  if found then
    if prior.command<>command or (p_admin and prior.authority_id is distinct from authority)
    then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',prior.id,'caseId',prior.case_id,'version',prior.case_version);
  end if;
  if (select count(*) from private.founder_identity_events e where e.actor_id=p_actor and e.request_id is not null
    and e.occurred_at>now()-interval '1 day')>=60 then raise exception 'command limit' using errcode='54000'; end if;

  if p_action='open' then
    insert into private.founder_identity_cases(subject_id,reviewer_id,authority_id)
      values(subject,p_actor,authority) returning * into c;
  else
    if c.version<>p_expected or c.policy_version<>p_policy
    then raise exception 'stale case' using errcode='O2004'; end if;
    old_state := c.state;
    next_state := case
      when p_action='consent' and c.state='consent_pending' then 'proof_pending'
      when p_action='visibility' and c.disclose is distinct from p_disclose and c.consent_version=c.policy_version and c.state in ('proof_pending','ready_for_review','granted','held')
        then case when c.state='ready_for_review' then 'proof_pending' else c.state end
      when p_action='withdraw' and c.state in ('consent_pending','proof_pending','ready_for_review','granted','held') then 'withdrawn'
      when p_action='grant' and c.state='ready_for_review' and p_reason='confirmed' then 'granted'
      when p_action='hold' and c.state in ('proof_pending','ready_for_review','granted') and p_reason='account_risk' then 'held'
      when p_action='release' and c.state='held' and p_reason='confirmed' then
        case when exists(select 1 from private.founder_identity_grants g where g.case_id=c.id) then 'granted' else 'proof_pending' end
      when p_action='revoke' and c.state in ('ready_for_review','granted','held') and p_reason in ('account_risk','member_request','corrected') then 'revoked'
      when p_action='deny' and c.state in ('consent_pending','proof_pending','ready_for_review') and p_reason='insufficient_proof' then 'denied'
      when p_action='conflict' and not c.conflicted and p_reason='conflict' and c.state in ('granted','held') then 'held'
      when p_action='conflict' and not c.conflicted and p_reason='conflict' and c.state in ('consent_pending','proof_pending','ready_for_review') then 'denied'
      when p_action='correction' and c.state in ('granted','held','revoked','denied','withdrawn') and not exists
        (select 1 from private.founder_identity_events e where e.case_id=c.id and e.action='correction') then c.state
      end;
    if next_state is null then raise exception 'action unavailable' using errcode='55000'; end if;
    if p_action in ('grant','release') then
      if private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at) is distinct from authority
        or p_totp_at<extract(epoch from clock_timestamp())::bigint-900
        or not private.founder_identity_policy_open() or c.conflicted or c.consent_version is distinct from c.policy_version
        or not private.institution_actor(subject)
      then raise exception 'issuance unavailable' using errcode='55000'; end if;
      select p.id into proof from private.founder_identity_proofs p where p.case_id=c.id
        and p.bound_version=c.version-1 and p.confirmed_at>=c.consent_at and p.expires_at>clock_timestamp()
        and p.consumed_at is null for update;
      if not found then raise exception 'current proof unavailable' using errcode='55000'; end if;
      update private.founder_identity_proofs set consumed_at=clock_timestamp() where id=proof;
      if p_action='grant' then
        insert into private.founder_identity_grants(case_id,subject_id,issuer_id,policy_version,proof_id)
          values(c.id,subject,p_actor,c.policy_version,proof);
      end if;
    end if;
    update private.founder_identity_cases x set state=next_state,version=x.version+1,updated_at=clock_timestamp(),
      consent_at=case p_action when 'consent' then clock_timestamp() when 'withdraw' then null else x.consent_at end,
      consent_version=case p_action when 'consent' then x.policy_version when 'withdraw' then null else x.consent_version end,
      disclose=case when p_action in ('withdraw','revoke','deny') then false else coalesce(p_disclose,x.disclose) end,
      conflicted=x.conflicted or p_action='conflict',
      decision=coalesce(p_reason,x.decision)
      where x.id=c.id returning * into c;
  end if;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,reason,
    previous_state,next_state,case_version,policy_version,request_id,command)
    values(p_actor,c.id,c.authority_id,p_action,p_reason,old_state,c.state,c.version,c.policy_version,p_request,command)
    returning id into event_id;
  return jsonb_build_object('auditId',event_id,'caseId',c.id,'version',c.version);
end
$$;

-- The caller must first resolve a visible member using the existing profile privacy and block policy.
create function public.founder_identity_public_for_api(p_subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.founder_identity_policy_open() and private.institution_actor(p_subject) and exists (
    select 1 from private.founder_identity_grants g
    join private.founder_identity_cases c on c.id=g.case_id
    where g.subject_id=p_subject and c.state='granted' and not c.conflicted and c.disclose
      and c.consent_at is not null and c.consent_version=c.policy_version and c.policy_version=1
  )
$$;

revoke all on function private.founder_identity_policy_open(),
  private.founder_identity_authority(uuid,uuid,boolean,bigint),private.audit_founder_identity_authority(),
  private.record_founder_identity_proof(),private.founder_identity_card(private.founder_identity_cases,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_identity_public_for_api(uuid) from public,anon,authenticated,service_role;
grant execute on function public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_identity_public_for_api(uuid) to service_role;
