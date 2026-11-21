-- Scoped operations build on Auth, platform roles, O2 intents and the O4 claim review boundary.
create table private.onboarding_corrections (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references private.organization_onboarding_intents(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  intent_version integer not null check (intent_version>0),
  kind text not null check (kind in ('cancel','restart','registration','details','claim_triage')),
  requested jsonb not null check (jsonb_typeof(requested)='object' and pg_column_size(requested)<=4096),
  assignee_id uuid references auth.users(id) on delete set null,
  state text not null default 'requested' check (state in ('requested','assigned','applied','protected','withdrawn')),
  version integer not null default 1 check (version>0),
  blockers text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '7 days',
  check (assignee_id is distinct from subject_id)
);
create unique index onboarding_correction_one_current on private.onboarding_corrections(intent_id)
  where state in ('requested','assigned');
create index onboarding_correction_subject on private.onboarding_corrections(subject_id,created_at desc,id);
create index onboarding_correction_queue on private.onboarding_corrections(state,created_at desc,id);

create table private.platform_governance (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'bootstrap' check (mode in ('bootstrap','distributed','recovery')),
  version integer not null default 1 check (version>0),
  recovery_until timestamptz,
  check ((mode='recovery')=(recovery_until is not null))
);
insert into private.platform_governance default values;

-- Scope entries are a future governed delegation. This migration seeds no authority.
create table private.platform_governance_authorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in ('governance_transition','administrator_continuity','recovery_coordination')),
  approval_ref uuid not null,
  starts_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at>starts_at),
  revoked_at timestamptz
);
create unique index platform_governance_authority_current on private.platform_governance_authorities(user_id,scope)
  where revoked_at is null;

create table private.platform_governance_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete restrict,
  kind text not null check (kind in ('appoint','revoke','suspend','succession','distributed','recovery')),
  governance_version integer not null check (governance_version>0),
  version integer not null default 1 check (version>0),
  approver_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '7 days',
  check (proposer_id is null or proposer_id is distinct from target_id),
  check (approver_id is null or (approver_id is distinct from target_id and approver_id is distinct from proposer_id)),
  check ((target_id is null)=(kind in ('distributed','recovery')))
);
create index platform_governance_proposals_recent on private.platform_governance_proposals(created_at desc,id);
create index platform_governance_proposals_target on private.platform_governance_proposals(target_id,created_at desc,id);

create table private.platform_claim_approval_holds (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.verification_applications(id) on delete restrict,
  organization_id uuid not null references private.organizations(id) on delete restrict,
  report_id uuid not null unique references private.impersonation_reports(id) on delete restrict,
  placed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  lifted_by uuid references auth.users(id) on delete restrict,
  lifted_at timestamptz,
  version integer not null default 1,
  check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
  check((lifted_at is null)=(lifted_by is null)),
  check(lifted_by is distinct from placed_by),
  check(version=case when lifted_at is null then 1 else 2 end)
);
create index platform_claim_hold_active on private.platform_claim_approval_holds(application_id,expires_at)
  where lifted_at is null;

-- O5's domain ledger doubles as the command receipt store. No general-purpose audit access is added.
create table private.platform_governance_events (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 1 check (schema_version=1),
  scope text not null check (scope in ('correction','proposal','authority','claim_hold')),
  resource_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  action text not null,
  version integer not null check (version>0),
  reason text,
  request_id uuid,
  fingerprint bytea,
  outcome jsonb not null,
  occurred_at timestamptz not null default clock_timestamp(),
  unique(actor_id,request_id),
  check ((request_id is null)=(fingerprint is null)),
  check (reason is null or (length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'))
);
create index platform_governance_resource_events on private.platform_governance_events(scope,resource_id,occurred_at desc);
create index platform_governance_actor_events on private.platform_governance_events(actor_id,occurred_at desc);

alter table private.onboarding_corrections enable row level security;
alter table private.platform_governance enable row level security;
alter table private.platform_governance_authorities enable row level security;
alter table private.platform_governance_proposals enable row level security;
alter table private.platform_claim_approval_holds enable row level security;
alter table private.platform_governance_events enable row level security;
revoke all on private.onboarding_corrections,private.platform_governance,private.platform_governance_authorities,
  private.platform_governance_proposals,private.platform_claim_approval_holds,private.platform_governance_events
  from public,anon,authenticated,service_role;

create function private.o5_session(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_admin boolean,p_recent boolean)
returns void language plpgsql stable set search_path='' as $$
begin
  if not public.account_session_for_api(p_actor,p_session,p_aal2,false)
    then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_admin and not private.platform_admin(p_actor)
    then raise exception 'access denied' using errcode='42501'; end if;
  if (p_admin or p_recent) and (not public.account_session_for_api(p_actor,p_session,p_aal2,true)
      or not coalesce(p_totp between extract(epoch from clock_timestamp())::bigint-900
        and extract(epoch from clock_timestamp())::bigint+30,false))
    then raise exception 'recent MFA required' using errcode='O5001'; end if;
end
$$;

create function private.o5_lock_actor(p_actor uuid,p_session uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121050000));
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
end
$$;

create function private.o5_digest(p_scope text,p_resource uuid,p_action text,p_version integer,p_input jsonb)
returns bytea language sql immutable set search_path='' as $$
  select sha256(convert_to(jsonb_build_array(p_scope,p_resource,p_action,p_version,p_input)::text,'UTF8'))
$$;

create function private.o5_replay(p_actor uuid,p_request uuid,p_digest bytea)
returns jsonb language plpgsql stable set search_path='' as $$
declare e private.platform_governance_events;
begin
  if p_request is null then raise exception 'request required' using errcode='23514'; end if;
  select * into e from private.platform_governance_events x where x.actor_id=p_actor and x.request_id=p_request;
  if found then
    if e.fingerprint is distinct from p_digest then raise exception 'request conflict' using errcode='O2002'; end if;
    return e.outcome;
  end if;
  if (select count(*) from private.platform_governance_events x where x.actor_id=p_actor
      and x.request_id is not null and x.occurred_at>now()-interval '1 day')>=40
    then raise exception 'command limit' using errcode='54000'; end if;
  return null;
end
$$;

create function private.o5_correction_blockers(i private.organization_onboarding_intents)
returns text[] language sql stable set search_path='' as $$
  select array_remove(array[
    case when i.completed_at is not null or i.stage='cancelled' then 'completed' end,
    case when exists(select 1 from private.organization_memberships m where m.user_id=i.subject_id and m.role='owner' and m.revoked_at is null) then 'ownership' end,
    case when exists(select 1 from private.verification_applications a where a.applicant_id=i.subject_id and a.kind='claim') then 'claims' end,
    case when exists(select 1 from private.organization_memberships m where m.user_id=i.subject_id and m.role<>'owner'
            and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()))
      or exists(select 1 from private.organization_affiliations f where f.user_id=i.subject_id and f.affiliation_type='staff' and f.status in ('pending','active','suspended'))
      or exists(select 1 from private.organization_custom_assignments c where c.user_id=i.subject_id and private.organization_grant_current(c)) then 'relationships' end,
    case when exists(select 1 from private.organization_invitations o where o.recipient_id=i.subject_id and o.state='pending' and o.expires_at>now())
      or exists(select 1 from private.organization_affiliation_invitations f where f.recipient_id=i.subject_id and f.status='pending' and f.expires_at>now())
      or exists(select 1 from private.project_invitations p where p.recipient_id=i.subject_id and p.status='pending' and p.expires_at>now()) then 'invitations' end,
    case when exists(select 1 from private.community_projects p where p.creator_id=i.subject_id and p.organization_id is not null)
      or exists(select 1 from private.project_team t where t.user_id=i.subject_id and t.revoked_at is null)
      or exists(select 1 from private.project_tasks t where t.assignee_id=i.subject_id and t.status not in ('cancelled','completed'))
      or exists(select 1 from private.project_applications a where a.applicant_id=i.subject_id and a.status in ('pending','offered','accepted')) then 'projects' end,
    case when exists(select 1 from private.polls p where p.creator_id=i.subject_id and p.status in ('draft','published')) then 'polls' end,
    case when exists(select 1 from private.verification_applications a where a.applicant_id=i.subject_id and a.status='pending')
      or exists(select 1 from private.founder_identity_cases c where c.subject_id=i.subject_id and c.state in ('consent_pending','proof_pending','ready_for_review','held'))
      then 'verification' end,
    case when exists(select 1 from private.verification_appeals a where a.appellant_id=i.subject_id and a.outcome='pending')
      or exists(select 1 from feed_data.moderation_appeals a where a.appellant_id=i.subject_id and a.outcome='pending') then 'appeals' end,
    case when exists(select 1 from private.lifecycle_holds h where h.subject_id=i.subject_id and h.released_at is null)
      or exists(select 1 from private.privacy_cases p where p.subject_id=i.subject_id and p.state='received'
        and p.kind in ('deletion','closure','restriction','appeal')) then 'holds' end
  ]::text[],null)
$$;

create function private.o5_claim_triage(i private.organization_onboarding_intents)
returns text[] language sql stable set search_path='' as $$
  select coalesce((select array_remove(array[
    case when a.status<>'pending' then 'decided' end,
    case when a.reviewed_institution_snapshot is distinct from private.institution_review_snapshot(o)
      or a.organization_subject is distinct from private.institution_subject(o) then 'stale_snapshot' end,
    case when (a.reviewed_institution_snapshot->>'ownerGrant') is distinct from
      (private.institution_review_snapshot(o)->>'ownerGrant') then 'owner_changed' end,
    case when exists(select 1 from private.verification_applications x where x.organization_id=o.id
      and x.id<>a.id and x.kind='claim' and x.status='pending') then 'conflicting_claims' end,
    case when exists(select 1 from private.impersonation_reports r where r.organization_id=o.id and r.outcome in ('pending','substantiated')) then 'impersonation' end,
    case when a.created_at<now()-interval '30 days' then 'review_evidence_age' end,
    case when not exists(select 1 from private.verification_review_work w where w.application_id=a.id
      and private.institution_reviewer(w.reviewer_id) and not private.institution_conflicted(w.reviewer_id,a)) then 'reviewer_needed' end
  ]::text[],null)
  from private.verification_applications a join private.organizations o on o.id=a.organization_id
  where a.id=(i.setup_result->>'applicationId')::uuid and a.applicant_id=i.subject_id and a.kind='claim'),
  array['claim_unavailable'])
$$;

create function private.o5_correction_card(c private.onboarding_corrections,p_admin boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'intentId',c.intent_id,'intentVersion',c.intent_version,'kind',c.kind,'version',c.version,
    'state',case when c.expires_at<=now() and c.state in ('requested','assigned') then 'expired' else c.state end,
    'blockers',c.blockers,'expiresAt',c.expires_at,'receiptId',(select e.id from private.platform_governance_events e
      where e.scope='correction' and e.resource_id=c.id and e.request_id is not null order by e.version desc,e.occurred_at desc limit 1))
    || case when p_admin then jsonb_build_object('assigned',c.assignee_id is not null)
       else jsonb_build_object('requested',c.requested) end
$$;

create function private.o5_correction_conflict(p_actor uuid,i private.organization_onboarding_intents)
returns boolean language sql stable set search_path='' as $$
  select p_actor=i.subject_id or private.institution_report_conflict(p_actor,coalesce(
    (i.setup_result->>'organizationId')::uuid,
    (select o.id from private.organizations o where o.handle=i.setup_draft->>'targetHandle')))
$$;

create function public.o5_corrections_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_admin boolean,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.onboarding_corrections; i private.organization_onboarding_intents;
begin
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_admin,false);
  if p_id is not null then
    if not p_admin then raise exception 'access denied' using errcode='42501'; end if;
    select * into c from private.onboarding_corrections where id=p_id;
    select * into i from private.organization_onboarding_intents where id=c.intent_id;
    if i.id is null or private.o5_correction_conflict(p_actor,i)
      or (c.assignee_id is not null and c.assignee_id<>p_actor and private.platform_admin(c.assignee_id))
      then raise exception 'correction unavailable' using errcode='O2003'; end if;
    return private.o5_correction_card(c,true) || jsonb_build_object(
      'currentIntentVersion',i.version,'blockers',private.o5_correction_blockers(i),
      'triage',case when c.kind='claim_triage' then private.o5_claim_triage(i) else '{}'::text[] end,
      'canApply',c.assignee_id=p_actor and c.state='assigned' and c.expires_at>now() and c.intent_version=i.version,
      'canAssign',c.state in ('requested','assigned') and c.expires_at>now()
        and (c.assignee_id is null or not private.platform_admin(c.assignee_id)));
  end if;

  return jsonb_build_object('cases',coalesce((select jsonb_agg(private.o5_correction_card(x.item,p_admin)
    order by (x.item).created_at desc,(x.item).id)
    from (select c0 as item from private.onboarding_corrections c0
      join private.organization_onboarding_intents i0 on i0.id=c0.intent_id
      where (not p_admin and c0.subject_id=p_actor) or
        (p_admin and not private.o5_correction_conflict(p_actor,i0)
          and (c0.assignee_id=p_actor or (c0.state in ('assigned','requested') and c0.expires_at>now()
            and (c0.assignee_id is null or not private.platform_admin(c0.assignee_id)))))
      order by c0.created_at desc,c0.id limit 30) x),'[]'::jsonb),
    'claimIntent',case when not p_admin then (select jsonb_build_object('id',i0.id,'version',i0.version)
      from private.organization_onboarding_intents i0 where i0.subject_id=p_actor and i0.setup_result->>'kind'='claim'
      order by i0.completed_at desc,i0.id limit 1) end,
    'holdUntil',case when not p_admin then (select max(h.expires_at) from private.platform_claim_approval_holds h
      join private.verification_applications a on a.id=h.application_id where a.applicant_id=p_actor and a.status='pending'
        and h.lifted_at is null and h.expires_at>now()) end);
end
$$;

create function public.o5_correction_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.onboarding_corrections;
  i private.organization_onboarding_intents;
  admin_action boolean := p_action in ('assign','apply');
  intended jsonb := p_input->'change';
  kind text := p_input->>'kind';
  reason text := p_input->>'reason';
  digest bytea := private.o5_digest('correction',p_id,p_action,p_version,p_input);
  result jsonb;
  conflict_codes text[];
  event_action text := p_action;
  subject uuid;
  event_id uuid := gen_random_uuid();
begin
  if p_id is null or not coalesce(p_version between 1 and 2147483646,false)
    or not coalesce(p_action in ('request','withdraw','assign','apply'),false)
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>4608
    or p_input->'confirm' is distinct from 'true'::jsonb
    or (p_input - case when p_action='request' then array['confirm','kind','change']
      when admin_action then array['confirm','reason'] else array['confirm'] end)<>'{}'::jsonb
    or (admin_action and not coalesce(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]',false))
  then raise exception 'invalid correction' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform private.o5_lock_actor(p_actor,p_session);
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,admin_action,false);
  if p_action='request' then
    select * into i from private.organization_onboarding_intents where id=p_id and subject_id=p_actor;
  else
    select * into c from private.onboarding_corrections where id=p_id;
    if not found then raise exception 'correction unavailable' using errcode='O2003'; end if;
    select * into i from private.organization_onboarding_intents where id=c.intent_id;
  end if;
  if i.id is null or (not admin_action and i.subject_id<>p_actor)
    or (admin_action and private.o5_correction_conflict(p_actor,i))
  then raise exception 'correction unavailable' using errcode='O2003'; end if;
  subject := i.subject_id;
  perform 1 from auth.users where id=subject for no key update;
  select * into i from private.organization_onboarding_intents where id=i.id for update;
  if not private.institution_actor(subject) then raise exception 'member unavailable' using errcode='42501'; end if;
  if p_action<>'request' then
    select * into c from private.onboarding_corrections where id=p_id for update;
    if admin_action and (private.o5_correction_conflict(p_actor,i)
      or (c.assignee_id is not null and c.assignee_id<>p_actor and private.platform_admin(c.assignee_id)))
    then raise exception 'correction unavailable' using errcode='O2003'; end if;
  end if;
  result := private.o5_replay(p_actor,p_request,digest);
  if result is not null then return result; end if;
  if p_action='request' then
    if i.version<>p_version then raise exception 'stale intent' using errcode='O2004'; end if;
    if not coalesce((kind='claim_triage' and i.setup_result->>'kind'='claim' and intended is null)
      or (i.pathway='organization' and i.completed_at is null and (
        (kind in ('cancel','restart') and intended is null)
        or (kind='registration' and i.setup_draft->>'mode'='new' and jsonb_typeof(intended)='string'
          and (intended #>> '{}') in ('unknown','informal_unregistered','pursuing_registration','registered'))
        or (kind='details' and intended->>'mode'='new' and private.organization_setup_validate_draft(intended))
      )),false)
    then raise exception 'invalid correction' using errcode='23514'; end if;
    with expired as (update private.onboarding_corrections set state='withdrawn',version=version+1
      where intent_id=i.id and state in ('requested','assigned') and expires_at<=clock_timestamp() returning id,version)
    insert into private.platform_governance_events(scope,resource_id,subject_id,action,version,outcome)
      select 'correction',id,subject,'consent_expired',version,'{"state":"expired"}' from expired;
    insert into private.onboarding_corrections(intent_id,subject_id,intent_version,kind,requested)
      values(i.id,subject,i.version,kind,coalesce(jsonb_build_object('change',intended),'{}')) returning * into c;
    insert into private.platform_governance_events(scope,resource_id,actor_id,subject_id,action,version,outcome)
      values('correction',c.id,p_actor,subject,'member_confirmed',c.version,jsonb_build_object('intentVersion',i.version,'kind',kind));
    event_action := 'requested';
  else
    if c.version<>p_version or c.state not in ('requested','assigned') or c.expires_at<=clock_timestamp()
      then raise exception 'stale correction' using errcode='O2004'; end if;
    if p_action='withdraw' then
      update private.onboarding_corrections set state='withdrawn',version=version+1 where id=c.id returning * into c;
    elsif p_action='assign' then
      if c.assignee_id=p_actor then raise exception 'already assigned' using errcode='55000'; end if;
      update private.onboarding_corrections set state='assigned',assignee_id=p_actor,version=version+1 where id=c.id returning * into c;
    else
      if c.state<>'assigned' or c.assignee_id is distinct from p_actor
        then raise exception 'assignment required' using errcode='42501'; end if;
      if i.version<>c.intent_version then raise exception 'stale intent' using errcode='O2004'; end if;
      conflict_codes := private.o5_correction_blockers(i);
      if c.kind='claim_triage' then
        conflict_codes := conflict_codes || private.o5_claim_triage(i);
      end if;
      if cardinality(conflict_codes)>0 then
        update private.onboarding_corrections set state='protected',blockers=conflict_codes,version=version+1
          where id=c.id returning * into c;
        event_action := 'protected';
      else
        update private.organization_onboarding_intents set
          pathway=case when c.kind='cancel' then 'individual' else pathway end,
          stage=case when c.kind='cancel' then 'cancelled' when c.kind='restart' then 'drafting' else stage end,
          setup_draft=case c.kind when 'cancel' then null when 'details' then c.requested->'change'
            when 'registration' then jsonb_set(setup_draft,'{registrationStatus}',c.requested->'change') else setup_draft end,
          version=version+1,updated_at=clock_timestamp() where id=i.id returning * into i;
        update private.onboarding_corrections set state='applied',version=version+1 where id=c.id returning * into c;
        event_action := 'applied';
      end if;
    end if;
  end if;
  result := jsonb_build_object('id',c.id,'version',c.version,'intentVersion',i.version,'kind',c.kind,
    'state',c.state,'blockers',c.blockers,'receiptId',event_id);
  insert into private.platform_governance_events(id,scope,resource_id,actor_id,subject_id,action,version,reason,request_id,fingerprint,outcome)
    values(event_id,'correction',c.id,p_actor,subject,event_action,c.version,reason,p_request,digest,result);
  return result;
end
$$;

create function private.o5_proposal_state(p private.platform_governance_proposals)
returns text language sql stable set search_path='' as $$
  select case when p.withdrawn_at is not null then 'withdrawn' when p.expires_at<=now() then 'expired'
    when p.approved_at is null then 'pending' when p.kind in ('appoint','succession') and p.accepted_at is null then 'awaiting_acceptance'
    else 'execution_closed' end
$$;

create function private.o5_proposal_card(p private.platform_governance_proposals)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'kind',p.kind,'version',p.version,'governanceVersion',p.governance_version,
    'state',private.o5_proposal_state(p),'expiresAt',p.expires_at,'accepted',p.accepted_at is not null)
$$;

create function private.audit_o5_authority()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null
    or (to_jsonb(old)-'revoked_at')<>(to_jsonb(new)-'revoked_at'))
    then raise exception 'authority may only be revoked' using errcode='23514'; end if;
  insert into private.platform_governance_events(scope,resource_id,subject_id,action,version,outcome)
    values('authority',new.id,new.user_id,case when tg_op='INSERT' then 'authority_recorded' else 'authority_revoked' end,
      case when tg_op='INSERT' then 1 else 2 end,jsonb_build_object('scope',new.scope,'approval',new.approval_ref));
  return new;
end
$$;
create trigger o5_authority_audit after insert or update on private.platform_governance_authorities
  for each row execute function private.audit_o5_authority();

create function public.o5_governance_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g private.platform_governance; proposals jsonb;
begin
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_admin,false);
  select coalesce(jsonb_agg(private.o5_proposal_card(x.item) ||
    jsonb_build_object('own',p_admin and (x.item).proposer_id=p_actor,'targeted',coalesce((x.item).target_id=p_actor,false))
    || case when p_admin then jsonb_build_object('target',(x.item).target_id,'rationale',(
      select e.reason from private.platform_governance_events e
      where e.resource_id=(x.item).id and e.scope='proposal' and e.action='propose' and e.version=1
      order by e.occurred_at,e.id limit 1)) else '{}'::jsonb end
    order by (x.item).created_at desc,(x.item).id),'[]'::jsonb) into proposals
  from (select p as item from private.platform_governance_proposals p
    where p_admin or (p.target_id=p_actor and p.kind in ('appoint','succession'))
    order by p.created_at desc,p.id limit 30) x;
  if not p_admin then return jsonb_build_object('proposals',proposals); end if;
  select * into g from private.platform_governance where singleton;
  return jsonb_build_object('mode',g.mode,'version',g.version,'executionEnabled',false,'recoveryEnabled',false,'proposals',proposals,
    'administrators',coalesce((select jsonb_agg(jsonb_build_object('id',x.user_id,'username',x.username,
      'eligible',private.platform_admin(x.user_id),
      'founding',exists(select 1 from private.platform_bootstrap b where b.user_id=x.user_id)) order by x.user_id)
      from (select r.user_id,p.username from public.role_assignments r left join public.profiles p on p.user_id=r.user_id
        where r.role='administrator' order by r.user_id limit 50) x),'[]'::jsonb),
    'authorities',coalesce((select jsonb_agg(x.scope order by x.scope) from private.platform_governance_authorities x
      where x.user_id=p_actor and x.revoked_at is null and x.starts_at<=now() and x.expires_at>now()),'[]'::jsonb),
    'holds',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'version',x.version,'expiresAt',x.expires_at,
      'state',case when x.lifted_at is not null then 'released' when x.expires_at<=now() then 'expired' else 'active' end,
      'canRelease',x.placed_by<>p_actor and private.institution_reviewer(p_actor))
      order by x.created_at desc,x.id) from (select h.* from private.platform_claim_approval_holds h
        join private.verification_applications a on a.id=h.application_id
        where not private.institution_conflicted(p_actor,a) order by h.created_at desc,h.id limit 25) x),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'scope',x.scope,'action',x.action,
      'version',x.version,'occurredAt',x.occurred_at) order by x.occurred_at desc,x.id)
      from (select e.* from private.platform_governance_events e where e.scope in ('proposal','authority')
        order by e.occurred_at desc,e.id limit 30) x),'[]'::jsonb));
end
$$;

create function public.o5_proposal_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  g private.platform_governance;
  p private.platform_governance_proposals;
  target uuid;
  kind text := p_input->>'kind';
  reason text := p_input->>'reason';
  digest bytea := private.o5_digest('proposal',p_id,p_action,p_version,p_input);
  result jsonb;
  event_id uuid := gen_random_uuid();
begin
  if not coalesce(p_action in ('propose','approve','accept','withdraw','execute'),false)
    or not coalesce(p_version between 1 and 2147483646,false) or (p_id is null)<>(p_action='propose')
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>1536
    or p_input->'confirm' is distinct from 'true'::jsonb
    or (p_input - case p_action when 'propose' then array['confirm','reason','kind','target']
      when 'approve' then array['confirm','reason','noConflict'] when 'accept' then array['confirm']
      else array['confirm','reason'] end)<>'{}'::jsonb
    or (p_action<>'accept' and not coalesce(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]',false))
  then raise exception 'invalid proposal' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform private.o5_lock_actor(p_actor,p_session);
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_action<>'accept',true);
  select * into g from private.platform_governance where singleton for update;
  if p_action<>'propose' then
    select * into p from private.platform_governance_proposals where id=p_id for update;
    if not found or (p_action='accept' and p.target_id is distinct from p_actor)
      then raise exception 'proposal unavailable' using errcode='O2003'; end if;
  end if;
  result := private.o5_replay(p_actor,p_request,digest);
  if result is not null then return result; end if;

  if p_action='propose' then
    if not coalesce(kind in ('appoint','revoke','suspend','succession','distributed','recovery'),false)
      then raise exception 'invalid proposal' using errcode='23514'; end if;
    target := (p_input->>'target')::uuid;
    if (target is null)<>(kind in ('distributed','recovery')) or target=p_actor
      then raise exception 'access denied' using errcode='42501'; end if;
    if g.version<>p_version then raise exception 'stale governance' using errcode='O2004'; end if;
    if kind='distributed' and g.mode<>'bootstrap' then raise exception 'transition unavailable' using errcode='55000'; end if;
    if target is not null and not private.institution_actor(target) then raise exception 'target unavailable' using errcode='O2003'; end if;
    if kind in ('appoint','succession') and not ('identity'=any(private.reviewed_personal_claims(target))
      and private.verified_totp(target)) then raise exception 'reviewed MFA account required' using errcode='PVE01'; end if;
    if kind in ('revoke','suspend') and not private.platform_admin(target)
      then raise exception 'administrator unavailable' using errcode='O2003'; end if;
    if exists(select 1 from private.platform_governance_proposals x where x.kind=(p_input->>'kind')
      and x.target_id is not distinct from target and x.withdrawn_at is null and x.expires_at>now())
    then raise exception 'proposal already pending' using errcode='55000'; end if;
    insert into private.platform_governance_proposals(proposer_id,target_id,kind,governance_version)
      values(p_actor,target,kind,g.version) returning * into p;
  else
    if p.version<>p_version or p.governance_version<>g.version or p.withdrawn_at is not null or p.expires_at<=clock_timestamp()
      then raise exception 'stale proposal' using errcode='O2004'; end if;
    if p_action='approve' then
      if p_input->'noConflict' is distinct from 'true'::jsonb or p_actor=p.proposer_id or p_actor=p.target_id
        or not private.platform_admin(p.proposer_id)
        then raise exception 'independent administrator required' using errcode='42501'; end if;
      if p.approved_at is not null then raise exception 'decision exists' using errcode='55000'; end if;
      if (p.kind in ('appoint','succession') and not ('identity'=any(private.reviewed_personal_claims(p.target_id))
          and private.verified_totp(p.target_id))) or (p.kind in ('revoke','suspend') and not private.platform_admin(p.target_id))
        then raise exception 'target eligibility changed' using errcode='55000'; end if;
      update private.platform_governance_proposals set approver_id=p_actor,approved_at=clock_timestamp(),version=version+1
        where id=p.id returning * into p;
    elsif p_action='accept' then
      if p.kind not in ('appoint','succession') or p.approved_at is null
        or not private.platform_admin(p.proposer_id) or not private.platform_admin(p.approver_id)
        or not ('identity'=any(private.reviewed_personal_claims(p_actor)) and private.verified_totp(p_actor))
        then raise exception 'acceptance unavailable' using errcode='42501'; end if;
      if p.accepted_at is not null then raise exception 'acceptance exists' using errcode='55000'; end if;
      update private.platform_governance_proposals set accepted_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
    elsif p_action='withdraw' then
      if p.proposer_id is distinct from p_actor then raise exception 'access denied' using errcode='42501'; end if;
      update private.platform_governance_proposals set withdrawn_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
    else
      if not exists(select 1 from private.platform_governance_authorities x where x.user_id=p_actor and x.revoked_at is null
        and x.starts_at<=now() and x.expires_at>now() and x.scope=case p.kind
          when 'recovery' then 'recovery_coordination' when 'distributed' then 'governance_transition' else 'administrator_continuity' end)
        then raise exception 'delegated authority required' using errcode='42501'; end if;
      -- Even a scoped authority cannot execute until an independently reviewed policy and recovery rehearsal exist.
      raise exception 'governance execution unavailable' using errcode='O5002';
    end if;
  end if;
  result := private.o5_proposal_card(p) || jsonb_build_object('receiptId',event_id);
  insert into private.platform_governance_events(id,scope,resource_id,actor_id,subject_id,action,version,reason,request_id,fingerprint,outcome)
    values(event_id,'proposal',p.id,p_actor,p.target_id,p_action,p.version,reason,p_request,digest,result);
  return result;
end
$$;

-- The old service RPC cannot grant or remove administrators or change their account status.
create or replace function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20261120,300);
  if not private.platform_admin(p_actor) or p_subject is null or p_subject=p_actor
    then raise exception 'access denied' using errcode='42501'; end if;
  if (p_action in ('grant','revoke') and p_value='administrator') or (p_action='status' and exists(
    select 1 from public.role_assignments where user_id=p_subject and role='administrator'))
  then raise exception 'protected governance action' using errcode='O5002'; end if;
  perform private.admin_account_action_for_api(p_actor,p_subject,p_action,p_value,p_reason);
end
$$;

create function public.o5_claim_hold_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.verification_applications;
  h private.platform_claim_approval_holds;
  r private.impersonation_reports;
  reason text := p_input->>'reason';
  report uuid := (p_input->>'reportId')::uuid;
  digest bytea := private.o5_digest('claim_hold',p_id,p_action,p_version,p_input);
  result jsonb;
  event_id uuid := gen_random_uuid();
  opened timestamptz := clock_timestamp();
begin
  if p_id is null or not coalesce((p_action='place' and p_version=0 and report is not null)
    or (p_action='release' and p_version=1 and report is null),false)
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>1536
    or (p_input-array['confirm','reason','reportId','noConflict'])<>'{}'::jsonb
    or p_input->'confirm' is distinct from 'true'::jsonb or p_input->'noConflict' is distinct from 'true'::jsonb
    or not coalesce(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]',false)
    then raise exception 'invalid containment action' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform private.o5_lock_actor(p_actor,p_session);
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,true,true);
  if p_action='place' then
    select * into a from private.verification_applications where id=p_id and kind='claim' for update;
  else
    select * into h from private.platform_claim_approval_holds where id=p_id for update;
    select * into a from private.verification_applications where id=h.application_id and kind='claim' for update;
    report := h.report_id;
  end if;
  if a.id is null or private.institution_conflicted(p_actor,a)
    then raise exception 'claim unavailable' using errcode='O2003'; end if;
  select * into r from private.impersonation_reports where id=report and organization_id=a.organization_id
    and outcome='substantiated' and kind='institution' for share;
  if r.id is null or r.reporter_id=p_actor then raise exception 'report unavailable' using errcode='O2003'; end if;
  if p_action='release' and (h.placed_by=p_actor or not private.institution_reviewer(p_actor))
    then raise exception 'independent reviewer required' using errcode='42501'; end if;
  result := private.o5_replay(p_actor,p_request,digest);
  if result is not null then return result; end if;
  if a.status<>'pending' then raise exception 'claim already decided' using errcode='55000'; end if;
  if p_action='place' then
    if exists(select 1 from private.platform_claim_approval_holds x
      where x.application_id=a.id and (x.lifted_at is null and x.expires_at>clock_timestamp()))
      then raise exception 'claim hold already active' using errcode='55000'; end if;
    insert into private.platform_claim_approval_holds(application_id,organization_id,report_id,placed_by,created_at,expires_at)
      values(a.id,a.organization_id,report,p_actor,opened,opened+interval '24 hours') returning * into h;
  else
    if h.version<>p_version or h.lifted_at is not null or h.expires_at<=clock_timestamp()
      then raise exception 'hold no longer active' using errcode='O2004'; end if;
    update private.platform_claim_approval_holds set lifted_by=p_actor,lifted_at=clock_timestamp(),version=version+1
      where id=h.id returning * into h;
  end if;
  result := jsonb_build_object('id',h.id,'version',h.version,'state',case p_action when 'place' then 'active' else 'released' end,
    'expiresAt',h.expires_at,'receiptId',event_id);
  insert into private.platform_governance_events(id,scope,resource_id,actor_id,subject_id,action,version,reason,request_id,fingerprint,outcome)
    values(event_id,'claim_hold',h.id,p_actor,a.applicant_id,p_action,h.version,reason,p_request,digest,result);
  return result;
end
$$;

-- Block only approval of the specific claim. Ordinary institution operations and review rejections continue.
alter function public.verification_decide_for_api(uuid,uuid,text,text,boolean) rename to o5_prior_verification_decide;
alter function public.o5_prior_verification_decide(uuid,uuid,text,text,boolean) set schema private;
revoke all on function private.o5_prior_verification_decide(uuid,uuid,text,text,boolean) from public,anon,authenticated,service_role;
create function public.verification_decide_for_api(p_actor uuid,p_application uuid,p_decision text,p_rationale text,p_conflict_free boolean)
returns text language plpgsql security definer set search_path='' as $$
declare a private.verification_applications;
begin
  perform pg_advisory_xact_lock(20261120,300);
  if p_decision='approve' and exists(select 1 from private.platform_claim_approval_holds h
    where h.application_id=p_application and h.lifted_at is null and h.expires_at>clock_timestamp()) then
    select * into a from private.verification_applications where id=p_application and status='pending';
    if found then
      if not private.institution_reviewer(p_actor) or p_conflict_free is distinct from true or private.institution_conflicted(p_actor,a)
        then raise exception 'access denied' using errcode='42501'; end if;
      if not exists(select 1 from private.verification_review_work w where w.application_id=a.id and w.reviewer_id=p_actor)
        then raise exception 'assignment required' using errcode='PVT05'; end if;
      raise exception 'claim temporarily held' using errcode='O5003';
    end if;
  end if;
  return private.o5_prior_verification_decide(p_actor,p_application,p_decision,p_rationale,p_conflict_free);
end
$$;

revoke all on function private.o5_session(uuid,uuid,boolean,bigint,boolean,boolean),private.o5_lock_actor(uuid,uuid),
  private.o5_digest(text,uuid,text,integer,jsonb),private.o5_replay(uuid,uuid,bytea),
  private.o5_correction_blockers(private.organization_onboarding_intents),private.o5_claim_triage(private.organization_onboarding_intents),
  private.o5_correction_conflict(uuid,private.organization_onboarding_intents),private.o5_correction_card(private.onboarding_corrections,boolean),
  private.o5_proposal_state(private.platform_governance_proposals),private.o5_proposal_card(private.platform_governance_proposals),
  private.audit_o5_authority() from public,anon,authenticated,service_role;
revoke all on function public.o5_corrections_read_for_api(uuid,uuid,boolean,bigint,boolean,uuid),
  public.o5_correction_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.o5_governance_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.o5_claim_hold_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.verification_decide_for_api(uuid,uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.o5_corrections_read_for_api(uuid,uuid,boolean,bigint,boolean,uuid),
  public.o5_correction_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.o5_governance_read_for_api(uuid,uuid,boolean,bigint,boolean),
  public.o5_proposal_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.o5_claim_hold_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb),
  public.verification_decide_for_api(uuid,uuid,text,text,boolean) to service_role;
