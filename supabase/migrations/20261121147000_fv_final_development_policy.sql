-- No policy or approved cohort is inserted by this migration.
create table private.fv_development_policies (
  id uuid primary key default gen_random_uuid(),
  approval_ref uuid not null unique,
  approved_by uuid not null references auth.users(id) on delete restrict,
  case_policy integer not null check(case_policy=1),
  methods text[] not null check(cardinality(methods)>0 and array_position(methods,null) is null
    and methods <@ array['in_person_identity_check','live_video_identity_check']),
  proof_enabled boolean not null,
  issuance_enabled boolean not null check(not issuance_enabled or proof_enabled),
  recorded_at timestamptz not null default clock_timestamp(),
  starts_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>starts_at and expires_at<=starts_at+interval '30 days'),
  stopped_at timestamptz,
  stop_approval_ref uuid,
  check((stopped_at is null)=(stop_approval_ref is null)),
  exclude using gist (tstzrange(starts_at,expires_at,'[)') with &&)
);
create table private.fv_development_members (
  policy_id uuid not null references private.fv_development_policies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(policy_id,user_id)
);
alter table private.fv_development_policies enable row level security;
alter table private.fv_development_members enable row level security;
revoke all on private.fv_development_policies,private.fv_development_members from public,anon,authenticated,service_role;

create function private.fv_active_policy()
returns private.fv_development_policies language sql stable set search_path='' as $$
  select p.* from private.fv_development_policies p where p.stopped_at is null
    and p.starts_at<=clock_timestamp() and p.expires_at>clock_timestamp()
    and private.platform_founder(p.approved_by) and private.institution_actor(p.approved_by)
$$;
create or replace function private.founder_identity_live_proof_enabled()
returns boolean language sql stable set search_path='' as $$
  select coalesce((private.fv_active_policy()).proof_enabled,false)
$$;
create or replace function private.founder_identity_policy_open()
returns boolean language sql stable set search_path='' as $$
  select coalesce((private.fv_active_policy()).issuance_enabled,false)
$$;

create function private.fv_policy_for_member(p_user uuid,p_case_policy integer,p_method text default null)
returns uuid language sql stable set search_path='' as $$
  select p.id from private.fv_active_policy() p join private.fv_development_members m on m.policy_id=p.id
  where m.user_id=p_user and p.case_policy=p_case_policy and p.proof_enabled and p.issuance_enabled
    and (p_method is null or p_method=any(p.methods)) and private.institution_actor(m.user_id)
$$;

alter table private.founder_identity_controls add column deployment_policy_id uuid
  references private.fv_development_policies(id) on delete restrict;
alter table private.founder_identity_proofs add column deployment_policy_id uuid
  references private.fv_development_policies(id) on delete restrict;

create function private.fv_bind_development_proof()
returns trigger language plpgsql set search_path='' as $$
declare c private.founder_identity_cases; approved uuid;
begin
  select * into strict c from private.founder_identity_cases where id=new.case_id;
  if tg_table_name='founder_identity_proofs' then
    -- Historical synthetic tests switch the old gate only in an isolated disposable database.
    if new.method='synthetic_identity_and_control' and not private.founder_identity_live_proof_enabled() then
      if new.deployment_policy_id is not null then raise exception 'invalid proof' using errcode='23514'; end if;
      return new;
    end if;
    approved:=private.fv_policy_for_member(c.subject_id,c.policy_version,new.method);
    if approved is null or not exists(
      select from private.founder_identity_controls r where r.case_id=c.id and r.case_version=new.bound_version
        and r.deployment_policy_id=approved and r.expires_at>clock_timestamp()
    ) then raise exception 'approved live proof required' using errcode='55000'; end if;
  else
    approved:=private.fv_policy_for_member(c.subject_id,c.policy_version);
    if approved is null then raise exception 'member outside the approved development policy' using errcode='55000'; end if;
  end if;
  new.deployment_policy_id:=approved;
  return new;
end
$$;
create trigger fv_bind_control before insert on private.founder_identity_controls
  for each row execute function private.fv_bind_development_proof();
create trigger fv_bind_proof before insert on private.founder_identity_proofs
  for each row execute function private.fv_bind_development_proof();

create or replace function private.founder_identity_live_control(c private.founder_identity_cases,p_version integer)
returns boolean language sql stable set search_path='' as $$
  select exists(select from private.founder_identity_controls r
    where r.case_id=c.id and r.case_version=p_version and r.expires_at>clock_timestamp()
      and r.confirmed_at>=c.consent_at
      and r.deployment_policy_id=private.fv_policy_for_member(c.subject_id,c.policy_version)
      and public.account_session_for_api(c.subject_id,r.subject_session,true,true))
$$;

create or replace function private.personal_identity_provenance(p_subject uuid)
returns text[] language sql stable set search_path='' as $$
  select case when private.institution_actor(p_subject) then array_remove(array[
    case when 'identity'=any(private.reviewed_personal_claims(p_subject)) then 'independent' end,
    case when exists(select from private.founder_identity_grants g
      join private.founder_identity_cases c on c.id=g.case_id
      join private.founder_identity_proofs p on p.id=g.proof_id and p.case_id=c.id
      join private.fv_development_policies approved on approved.id=p.deployment_policy_id
      join private.founder_identity_controls r on r.case_id=c.id and r.case_version=p.bound_version
      where g.subject_id=p_subject and private.platform_founder(g.issuer_id)
        and c.state='granted' and not c.conflicted and c.consent_at is not null and c.consent_version=c.policy_version
        and p.deployment_policy_id=private.fv_policy_for_member(p_subject,c.policy_version,p.method)
        and r.deployment_policy_id=approved.id and p.method=any(approved.methods) and p.consumed_at is not null)
    then 'founder' end],null) else array[]::text[] end
$$;

create function private.fv_ordinary_organization_identity(p_actor uuid,p_draft jsonb)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p_draft->>'mode'='new' and p_draft->>'kind' in (
    'haitian_organization','international_organization','ngo','nonprofit','foundation','business','education','media')
    and 'founder'=any(private.personal_identity_provenance(p_actor)),false)
$$;

revoke all on function private.fv_active_policy(),private.fv_policy_for_member(uuid,integer,text),
  private.fv_bind_development_proof(),private.fv_ordinary_organization_identity(uuid,jsonb)
  from public,anon,authenticated,service_role;

-- Preserve native correction and review history while restricting appeal assignment.
create table private.fv_founder_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references private.founder_identity_cases(id) on delete restrict,
  request_event uuid not null unique references private.founder_identity_events(id) on delete restrict,
  assigned_reviewer uuid references auth.users(id) on delete restrict,
  assignment_approval uuid,
  assigned_at timestamptz,
  outcome text not null default 'pending' check(outcome in ('pending','upheld','revoked')),
  decision_event uuid references private.founder_identity_events(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check ((assigned_reviewer is null)=(assignment_approval is null) and (assigned_reviewer is null)=(assigned_at is null)),
  check ((outcome='pending')=(decision_event is null))
);
create index fv_assigned_appeals on private.fv_founder_appeals(assigned_reviewer,created_at desc,id) where outcome='pending';
alter table private.fv_founder_appeals enable row level security;
revoke all on private.fv_founder_appeals from public,anon,authenticated,service_role;

alter table private.founder_identity_events drop constraint founder_identity_events_action_check,
  add constraint founder_identity_events_action_check check(action in (
    'authority_assigned','authority_revoked','open','consent','visibility','withdraw','proof_recorded','grant','hold',
    'release','revoke','deny','conflict','correction','supersede','account_control','attest','appeal_upheld','appeal_revoked'));

create function private.fv_open_appeal()
returns trigger language plpgsql set search_path='' as $$
begin
  insert into private.fv_founder_appeals(case_id,request_event,created_at)
    values(new.case_id,new.id,new.occurred_at);
  return new;
end
$$;
create trigger fv_open_appeal after insert on private.founder_identity_events for each row
  when (new.action='correction') execute function private.fv_open_appeal();

create function private.fv_appeal_reviewer_allowed(p_reviewer uuid,c private.founder_identity_cases)
returns boolean language sql stable set search_path='' as $$
  select private.institution_reviewer(p_reviewer) and not private.platform_founder(p_reviewer)
    and p_reviewer<>c.subject_id and p_reviewer<>c.reviewer_id
$$;

-- This operator-only routine has no application-role grant. The approval record
-- is mandatory and identifies the separately reviewed conflict/assignment decision.
create function private.fv_assign_appeal(p_id uuid,p_reviewer uuid,p_approval uuid)
returns void language plpgsql set search_path='' as $$
declare
  c private.founder_identity_cases;
begin
  perform pg_advisory_xact_lock(20261120,300);
  select i.* into c from private.fv_founder_appeals a join private.founder_identity_cases i on i.id=a.case_id where a.id=p_id;
  if not found or p_approval is null or not coalesce(private.fv_appeal_reviewer_allowed(p_reviewer,c),false)
    then raise exception 'independent assignment unavailable' using errcode='42501'; end if;
  update private.fv_founder_appeals set assigned_reviewer=p_reviewer,assignment_approval=p_approval,assigned_at=clock_timestamp()
    where id=p_id and outcome='pending' and assigned_reviewer is null;
  if not found then raise exception 'appeal already assigned or closed' using errcode='55000'; end if;
end
$$;

create function public.fv_founder_appeals_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_workspace uuid,p_id uuid,p_action text,p_request uuid,p_no_conflict boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.fv_founder_appeals;
  c private.founder_identity_cases;
  prior private.founder_identity_events;
  receipt uuid;
  event_action text;
  next_state text;
  written_at timestamptz;
  input jsonb:=jsonb_build_object('appeal',p_id,'action',p_action,'noConflict',p_no_conflict);
begin
  if p_id is not null then
    perform pg_advisory_xact_lock(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp_at,'read',null,p_workspace,'review',null,null) is null
    or not private.institution_reviewer(p_actor) or private.platform_founder(p_actor)
    then return null; end if;
  if p_id is null and p_action is null then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'createdAt',q.created_at,
      'status',q.state,'username',q.username) order by q.created_at desc,q.id),'[]')
      from (select a1.id,a1.created_at,c1.state,p.username from private.fv_founder_appeals a1
        join private.founder_identity_cases c1 on c1.id=a1.case_id join public.profiles p on p.user_id=c1.subject_id
        where a1.assigned_reviewer=p_actor and a1.outcome='pending' and private.fv_appeal_reviewer_allowed(p_actor,c1)
        order by a1.created_at desc,a1.id limit 25) q);
  end if;
  if p_request is null or p_no_conflict is distinct from true or p_action is null or p_action not in ('uphold','revoke')
    then raise exception 'invalid appeal outcome' using errcode='23514'; end if;
  select * into a from private.fv_founder_appeals where id=p_id and assigned_reviewer=p_actor for update;
  if not found then return null; end if;
  select * into c from private.founder_identity_cases where id=a.case_id for update;
  if not coalesce(private.fv_appeal_reviewer_allowed(p_actor,c),false) then return null; end if;
  select * into prior from private.founder_identity_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.command is distinct from input then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',prior.id,'caseId',prior.case_id,'version',prior.case_version);
  end if;
  if a.outcome<>'pending' or (p_action='revoke' and c.state not in ('held','granted','revoked'))
    then raise exception 'appeal decision unavailable' using errcode='55000'; end if;
  written_at:=clock_timestamp();
  event_action:=case p_action when 'revoke' then 'appeal_revoked' else 'appeal_upheld' end;
  next_state:=case p_action when 'revoke' then 'revoked' else c.state end;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
    values(p_actor,c.id,c.authority_id,event_action,c.state,next_state,c.version+1,c.policy_version,p_request,input,written_at)
    returning id into receipt;
  update private.founder_identity_cases x set state=next_state,version=x.version+1,updated_at=written_at,
    disclose=case when p_action='revoke' then false else x.disclose end,
    decision=case when p_action='revoke' then 'corrected' else x.decision end where x.id=c.id;
  update private.fv_founder_appeals set outcome=case p_action when 'revoke' then 'revoked' else 'upheld' end,
    decision_event=receipt where id=a.id;
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version+1);
end
$$;
revoke all on function private.fv_open_appeal(),
  private.fv_appeal_reviewer_allowed(uuid,private.founder_identity_cases),private.fv_assign_appeal(uuid,uuid,uuid),
  public.fv_founder_appeals_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.fv_founder_appeals_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,uuid,boolean) to service_role;

-- Scope gold parity to ordinary new organizations, never claims or corrections.
create or replace function public.organization_setup_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare current_intent private.organization_onboarding_intents; latest jsonb;
begin
  perform private.organization_setup_assert_session(p_actor,p_session,p_aal2);
  select * into current_intent from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled' and i.completed_at is null;
  select case when i.setup_result->>'kind'='claim'
    then i.setup_result || jsonb_build_object('reviewStatus',coalesce(a.status,'unavailable'))
    else i.setup_result end into latest
  from private.organization_onboarding_intents i
  left join private.verification_applications a on a.id=(i.setup_result->>'applicationId')::uuid and a.applicant_id=p_actor
  where i.subject_id=p_actor and i.completed_at is not null order by i.completed_at desc,i.id limit 1;
  return jsonb_build_object('intentId',current_intent.id,'version',current_intent.version,
    'draft',current_intent.setup_draft,'eligible',private.organization_setup_identity_eligible(p_actor) or private.fv_ordinary_organization_identity(p_actor,current_intent.setup_draft),
    'profileComplete',private.organization_setup_profile_complete(p_actor),'result',latest);
end
$$;

create or replace function public.organization_setup_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
  p_id uuid,p_action text,p_expected integer,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i private.organization_onboarding_intents;
  o private.organizations;
  a private.verification_applications;
  receipt private.organization_onboarding_receipts;
  draft jsonb;
  result jsonb;
  claim_refs text[];
  command jsonb;
  next_version integer;
  registration text;
begin
  if p_id is null or p_request is null or not coalesce(p_expected between 1 and 2147483646,false)
    or not coalesce(p_action in ('save_details','complete'),false)
    or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>4096
  then raise exception 'invalid command' using errcode='23514'; end if;
  command := jsonb_build_object('id',p_id,'action',p_action,'expected',p_expected,
    'fingerprint',encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'));
  -- Use the trust decision lock before the actor lock for decisive writes, then the target institution.
  if p_action='complete' then
    perform pg_advisory_xact_lock(20261120,300);
    perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  end if;
  perform 1 from auth.users where id=p_actor for no key update;
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  perform private.organization_setup_assert_session(p_actor,p_session,p_aal2);
  select * into receipt from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.request_id=p_request;
  if found then
    if receipt.command<>command then raise exception 'request conflict' using errcode='O2002'; end if;
    return receipt.result;
  end if;
  if (select count(*) from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.created_at>now()-interval '1 day')>=60
  then raise exception 'command limit' using errcode='54000'; end if;
  select * into i from private.organization_onboarding_intents where id=p_id and subject_id=p_actor for update;
  if not found then raise exception 'intent unavailable' using errcode='O2003'; end if;
  if i.stage='cancelled' or i.completed_at is not null or i.version<>p_expected
    then raise exception 'stale setup' using errcode='O2004'; end if;
  if not private.organization_setup_profile_complete(p_actor)
    then raise exception 'finish personal onboarding' using errcode='O4006'; end if;
  next_version := i.version+1;

  if p_action='save_details' then
    if p_payload->>'mode'='new' and private.organization_setup_government(p_payload->>'kind')
      then raise exception 'protected review required' using errcode='O4004'; end if;
    if not private.organization_setup_validate_draft(p_payload)
      then raise exception 'invalid draft' using errcode='23514'; end if;
    update private.organization_onboarding_intents set setup_draft=p_payload,stage='drafting',
      version=next_version,updated_at=clock_timestamp() where id=i.id;
  else
    if p_payload->'authorityConfirmed' is distinct from 'true'::jsonb
      or p_payload->'declarationVersion' is distinct from '1'::jsonb
      or (p_payload-array['authorityConfirmed','declarationVersion','evidence'])<>'{}'::jsonb
    then raise exception 'authority required' using errcode='O4003'; end if;
    perform 1 from public.verification_records v where v.user_id=p_actor and v.verification_type='identity' for share;
    draft := i.setup_draft;
    if not private.organization_setup_identity_eligible(p_actor)
      and not private.fv_ordinary_organization_identity(p_actor,draft)
      then raise exception 'identity required' using errcode='O4002'; end if;
    if not private.organization_setup_validate_draft(draft)
      then raise exception 'save draft first' using errcode='23514'; end if;
    if draft->>'mode'='new' then
      if p_payload ? 'evidence' or not (draft ?& array['name','handle','kind','countryCode','registrationStatus'])
        then raise exception 'incomplete organization' using errcode='23514'; end if;
      if (select count(*) from private.organizations where created_by=p_actor)>=10
        then raise exception 'creation limit' using errcode='54000'; end if;
      registration := draft->>'registrationStatus';
      insert into private.organizations(handle,name,kind,description,country_code,department_code,website,
        created_by,claimed_registration_status,registration_version)
        values(draft->>'handle',btrim(draft->>'name'),draft->>'kind',draft->>'description',draft->>'countryCode',
          draft->>'departmentCode',draft->>'website',p_actor,registration,1)
        on conflict (handle) do nothing returning * into o;
      if not found then raise exception 'handle unavailable' using errcode='O4005'; end if;
      insert into private.organization_memberships(organization_id,user_id,role,granted_by)
        values(o.id,p_actor,'owner',p_actor);
      insert into private.institution_audit(actor_id,organization_id,subject_id,event,request_id,case_version,
        declaration_version,registration_status) values
        (p_actor,o.id,o.id,'organization_created',p_request,next_version,null,null),
        (p_actor,o.id,p_actor,'setup_owner_granted',p_request,next_version,null,null),
        (p_actor,o.id,i.id,'setup_authority_declared',p_request,next_version,1,null),
        (p_actor,o.id,i.id,'setup_registration_declared',p_request,next_version,null,registration),
        (p_actor,o.id,i.id,'setup_completed',p_request,next_version,1,registration);
      result := jsonb_build_object('kind','created','organizationId',o.id,'handle',o.handle);
    else
      select * into o from private.organizations where handle=draft->>'targetHandle' and status='active' for no key update;
      if not found then raise exception 'organization unavailable' using errcode='O2003'; end if;
      if private.organization_setup_government(o.kind)
        then raise exception 'protected review required' using errcode='O4004'; end if;
      if o.verification_status='verified' or private.institution_role(p_actor,o.id) is not null
        then raise exception 'claim unavailable' using errcode='55000'; end if;
      if jsonb_typeof(p_payload->'evidence') is distinct from 'array'
        then raise exception 'invalid evidence' using errcode='23514'; end if;
      claim_refs := array(select value from jsonb_array_elements_text(p_payload->'evidence') value order by value);
      if cardinality(claim_refs) not between 2 and 3 or not private.valid_public_references(claim_refs)
        or private.institution_reference_count(claim_refs)<2
      then raise exception 'insufficient evidence' using errcode='PVT11'; end if;
      select * into a from private.verification_applications x where x.organization_id=o.id and x.applicant_id=p_actor
        and x.kind='claim' and x.status='pending' for no key update;
      if found then
        -- A legacy pending claim can be reaffirmed against the same references and institutional snapshot.
        if a.reviewed_institution_snapshot is distinct from private.institution_review_snapshot(o)
          or claim_refs is distinct from array(select e.url from private.verification_evidence e where e.application_id=a.id order by e.url)
          or exists(select 1 from private.institution_audit e where e.subject_id=a.id and e.event='setup_claim_submitted')
        then raise exception 'claim unavailable' using errcode='55000'; end if;
      else
        a.id := private.verification_submit_for_api(p_actor,o.id,'claim',claim_refs);
      end if;
      insert into private.institution_audit(actor_id,organization_id,subject_id,event,request_id,case_version,declaration_version)
        values(p_actor,o.id,a.id,'setup_claim_submitted',p_request,next_version,1);
      result := jsonb_build_object('kind','claim','organizationId',o.id,'handle',o.handle,'applicationId',a.id,'reviewStatus','pending');
    end if;
    update private.organization_onboarding_intents set setup_draft=null,completed_at=clock_timestamp(),setup_result=result,
      version=next_version,updated_at=clock_timestamp() where id=i.id;
  end if;
  result := jsonb_build_object('intentId',i.id,'version',next_version,'requestId',p_request,
    'draft',case when p_action='save_details' then p_payload end,'result',result);
  insert into private.organization_onboarding_receipts(subject_id,request_id,intent_id,command,result)
    values(p_actor,p_request,i.id,command,result);
  return result;
end
$$;

create or replace function private.founder_identity_live_command(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_expected integer,p_policy integer,p_request uuid,p_action text,p_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  prior private.founder_identity_events;
  receipt uuid;
  at_time timestamptz;
  deadline timestamptz;
  previous_state text;
  command jsonb:=jsonb_build_object('action',p_action,'case',p_id,'version',p_expected,'policy',p_policy,'basis',p_basis);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  perform private.s2b_lock_actor(p_actor,p_session);
  if not private.founder_identity_policy_open() or not private.founder_identity_live_proof_enabled()
    then raise exception 'proof workflow closed' using errcode='55000'; end if;
  if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp_at),false)
    then raise exception 'recent authenticator verification required' using errcode='O5001'; end if;
  if p_admin and not private.platform_founder(p_actor) then raise exception 'founder required' using errcode='42501'; end if;
  if p_request is null or p_expected is null or p_policy is null or not coalesce(
    (p_admin and p_action='attest' and p_basis in ('in_person_identity_check','live_video_identity_check')
      and private.platform_founder(p_actor)) or (not p_admin and p_action='account_control' and p_basis is null),false)
    then raise exception 'invalid proof command' using errcode='23514'; end if;
  select * into c from private.founder_identity_cases x where id=p_id
    and case when p_admin then x.reviewer_id=p_actor
      and x.authority_id=private.founder_identity_authority(p_actor,p_session,p_aal2,p_totp_at)
      else x.subject_id=p_actor end for update;
  if not found then raise exception 'case unavailable' using errcode='O2003'; end if;
  select * into prior from private.founder_identity_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.command is distinct from command then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('auditId',prior.id,'caseId',c.id,'version',prior.case_version);
  end if;
  if private.fv_policy_for_member(c.subject_id,c.policy_version,p_basis) is null
    then raise exception 'member outside the approved development policy' using errcode='55000'; end if;
  if c.version<>p_expected or c.policy_version<>p_policy then raise exception 'stale case' using errcode='O2004'; end if;
  if c.state not in ('proof_pending','ready_for_review','held') or c.conflicted
    or c.consent_at is null or c.consent_version is distinct from c.policy_version
    or not private.institution_actor(c.subject_id)
    then raise exception 'proof unavailable' using errcode='55000'; end if;
  if (select count(*) from private.founder_identity_events where actor_id=p_actor and request_id is not null
    and occurred_at>clock_timestamp()-interval '1 day')>=60
    then raise exception 'command limit' using errcode='54000'; end if;
  at_time:=clock_timestamp();
  previous_state:=c.state;
  if p_admin then
    select expires_at into deadline from private.founder_identity_controls where case_id=c.id and case_version=c.version;
    if not private.founder_identity_lock_control(c,c.version) or deadline<=at_time
      then raise exception 'current account-control receipt required' using errcode='55000'; end if;
    insert into private.founder_identity_proofs(case_id,subject_id,reviewer_id,policy_version,bound_version,method,confirmed_at,expires_at)
      values(c.id,c.subject_id,p_actor,c.policy_version,c.version,p_basis,at_time,deadline);
    select * into strict c from private.founder_identity_cases where id=c.id;
  else
    if p_totp_at<floor(extract(epoch from c.consent_at))::bigint
      then raise exception 'confirm after accepting' using errcode='O5001'; end if;
    update private.founder_identity_cases x set version=x.version+1,updated_at=at_time,
      state=case when x.state='held' then 'held' else 'proof_pending' end where x.id=c.id returning * into c;
  end if;
  insert into private.founder_identity_events(actor_id,case_id,authority_id,action,previous_state,next_state,
    case_version,policy_version,request_id,command,occurred_at)
    values(p_actor,c.id,c.authority_id,p_action,previous_state,c.state,c.version,c.policy_version,p_request,command,at_time)
    returning id into receipt;
  if not p_admin then
    insert into private.founder_identity_controls(case_id,case_version,subject_session,confirmed_at,expires_at,event_id)
      values(c.id,c.version,p_session,at_time,at_time+interval '10 minutes',receipt);
  end if;
  return jsonb_build_object('auditId',receipt,'caseId',c.id,'version',c.version);
end;
$$;

create or replace function private.founder_identity_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
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
        (select 1 from private.founder_identity_events e where e.case_id=c.id and e.action='correction')
        then case when c.state='granted' then 'held' else c.state end
      end;
    if next_state is null then raise exception 'action unavailable' using errcode='55000'; end if;
    if p_action in ('grant','release') then
      if exists(select from private.fv_founder_appeals a where a.case_id=c.id and a.outcome='pending')
        then raise exception 'independent appeal remains pending' using errcode='55000'; end if;
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

create or replace function private.founder_identity_live_queue(payload jsonb)
returns jsonb language sql stable set search_path='' as $$
  select payload||jsonb_build_object('liveProofEnabled',private.founder_identity_policy_open() and private.founder_identity_live_proof_enabled(),
    'cases',coalesce((select jsonb_agg(item||jsonb_build_object('controlReady',private.founder_identity_live_control(c,c.version),
      'liveEligible',private.fv_policy_for_member(c.subject_id,c.policy_version) is not null,
      'appealStatus',(select a.outcome from private.fv_founder_appeals a where a.case_id=c.id),
      'appealRef',(select a.id from private.fv_founder_appeals a where a.case_id=c.id),
      'memberHistory',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'occurredAt',e.occurred_at) order by e.occurred_at desc,e.id)
        from (select action,occurred_at,id from private.founder_identity_events where case_id=c.id order by occurred_at desc,id limit 25) e),'[]'),
      'proofReady',coalesce((item->>'proofReady')::boolean,exists(select from private.founder_identity_proofs p
        where p.case_id=c.id and p.bound_version=c.version-1 and p.expires_at>clock_timestamp() and p.consumed_at is null)))
      order by position)
      from jsonb_array_elements(payload->'cases') with ordinality as entry(item,position)
      join private.founder_identity_cases c on c.id=(item->>'id')::uuid),'[]'::jsonb))
$$;
