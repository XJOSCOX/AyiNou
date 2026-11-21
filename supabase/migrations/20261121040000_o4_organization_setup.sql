-- Legacy organizations have no registration declaration. Declarations are private.
alter table private.organizations
  add column claimed_registration_status text not null default 'unknown'
    check (claimed_registration_status in ('unknown','informal_unregistered','pursuing_registration','registered')),
  add column registration_version integer not null default 0 check (registration_version>=0);

alter table private.organization_onboarding_intents
  add column setup_draft jsonb check (setup_draft is null or (jsonb_typeof(setup_draft)='object' and pg_column_size(setup_draft)<=4096)),
  add column completed_at timestamptz,
  add column setup_result jsonb,
  add constraint organization_intent_result check (
    (completed_at is null)=(setup_result is null) and
    (completed_at is null or (pathway='organization' and setup_draft is null and jsonb_typeof(setup_result)='object'))
  );
drop index private.organization_intent_one_open;
create unique index organization_intent_one_open on private.organization_onboarding_intents(subject_id)
  where stage<>'cancelled' and completed_at is null;

alter table private.institution_audit
  add column request_id uuid,
  add column case_version integer,
  add column declaration_version integer,
  add column registration_status text check (registration_status in ('unknown','informal_unregistered','pursuing_registration','registered'));
create unique index institution_registration_command on private.institution_audit(actor_id,request_id)
  where event='registration_corrected';
create unique index institution_setup_claim_declaration on private.institution_audit(subject_id)
  where event='setup_claim_submitted';

create function private.organization_setup_government(p_kind text)
returns boolean language sql immutable set search_path='' as $$
  select p_kind in ('municipality','ministry','embassy','government_agency')
$$;

create function private.organization_setup_founder_candidate(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.founder_identity_policy_open() and private.institution_actor(p_actor) and exists (
    select 1 from private.founder_identity_grants g
    join private.founder_identity_cases c on c.id=g.case_id
    join private.founder_identity_proofs p on p.id=g.proof_id and p.case_id=c.id
    join private.founder_identity_authorities a on a.id=c.authority_id and a.actor_id=g.issuer_id
    where g.subject_id=p_actor and c.state='granted' and not c.conflicted
      and c.policy_version=1 and c.consent_version=c.policy_version and c.consent_at is not null
      and p.consumed_at is not null and p.confirmed_at>=c.consent_at
      and p.confirmed_at<=g.issued_at and p.expires_at>g.issued_at
      and a.scope='founder_identity' and a.active_from<=now() and a.expires_at>now() and a.revoked_at is null
      and private.platform_admin(a.actor_id)
  )
$$;

-- O3 approval and future O4 parity require separate reviewed policy changes.
create function private.organization_setup_founder_parity_enabled()
returns boolean language sql immutable set search_path='' as $$ select false $$;

create function private.organization_setup_identity_eligible(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and (
    'identity'=any(private.reviewed_personal_claims(p_actor))
    or (private.organization_setup_founder_parity_enabled() and private.organization_setup_founder_candidate(p_actor))
  )
$$;

create function private.organization_setup_assert_session(p_actor uuid,p_session uuid,p_aal2 boolean)
returns void language plpgsql stable set search_path='' as $$
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'session unavailable' using errcode='O2001'; end if;
end
$$;

create function private.organization_setup_profile_complete(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.member_private p where p.user_id=p_actor and p.onboarding_step=4)
$$;

-- No private registration evidence or status is added to institution_view or discovery.
alter function public.institution_manage_for_api(uuid,uuid) set schema private;
revoke all on function private.institution_manage_for_api(uuid,uuid) from public,anon,authenticated,service_role;
create function public.institution_manage_for_api(p_actor uuid,p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare view_data jsonb := private.institution_manage_for_api(p_actor,p_org); registration jsonb;
begin
  if view_data->>'role' in ('owner','administrator') then
    select jsonb_build_object('status',o.claimed_registration_status,'version',o.registration_version,
      'locked',not private.organization_setup_identity_eligible(p_actor) or o.verification_status='verified'
        or private.organization_setup_government(o.kind) or exists(
        select 1 from private.verification_applications a where a.organization_id=o.id
          and a.kind in ('claim','organization','government') and a.status='pending'))
    into registration from private.organizations o where o.id=p_org;
    return view_data || jsonb_build_object('registration',registration);
  end if;
  return view_data;
end
$$;

alter function public.verification_submit_for_api(uuid,uuid,text,text[]) set schema private;
revoke all on function private.verification_submit_for_api(uuid,uuid,text,text[]) from public,anon,authenticated,service_role;
create function public.verification_submit_for_api(p_actor uuid,p_org uuid,p_kind text,p_evidence text[])
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if p_kind='claim' then raise exception 'use organization setup' using errcode='O4001'; end if;
  return private.verification_submit_for_api(p_actor,p_org,p_kind,p_evidence);
end
$$;

-- The existing two-reviewer workflow remains authoritative. Check before recording either approval.
alter function public.verification_decide_for_api(uuid,uuid,text,text,boolean) set schema private;
revoke all on function private.verification_decide_for_api(uuid,uuid,text,text,boolean) from public,anon,authenticated,service_role;
create function public.verification_decide_for_api(p_actor uuid,p_application uuid,p_decision text,p_rationale text,p_conflict_free boolean)
returns text language plpgsql security definer set search_path='' as $$
declare a private.verification_applications;
begin
  perform pg_advisory_xact_lock(20261120,300);
  if p_decision='approve' then
    select * into a from private.verification_applications where id=p_application and kind='claim';
    if found then
      if not private.institution_reviewer(p_actor) or p_conflict_free is distinct from true
        or private.institution_conflicted(p_actor,a) then raise exception 'access denied' using errcode='42501'; end if;
      if not exists (select 1 from private.verification_review_work w
        where w.application_id=a.id and w.reviewer_id=p_actor)
      then raise exception 'assignment required' using errcode='PVT05'; end if;
      perform 1 from auth.users where id=a.applicant_id for no key update;
      perform 1 from public.verification_records v where v.user_id=a.applicant_id and v.verification_type='identity' for share;
      if not private.organization_setup_identity_eligible(a.applicant_id)
        then raise exception 'identity required' using errcode='O4002'; end if;
      if not exists(select 1 from private.institution_audit e where e.subject_id=a.id
        and e.actor_id=a.applicant_id and e.organization_id=a.organization_id and e.event='setup_claim_submitted' and e.declaration_version=1)
      then raise exception 'authority required' using errcode='O4003'; end if;
      if exists(select 1 from private.organizations o where o.id=a.organization_id and private.organization_setup_government(o.kind))
      then raise exception 'protected review required' using errcode='O4004'; end if;
    end if;
  end if;
  return private.verification_decide_for_api(p_actor,p_application,p_decision,p_rationale,p_conflict_free);
end
$$;

create function public.organization_setup_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean)
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
    'draft',current_intent.setup_draft,'eligible',private.organization_setup_identity_eligible(p_actor),
    'profileComplete',private.organization_setup_profile_complete(p_actor),'result',latest);
end
$$;

create function public.organization_setup_matches_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_query text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.organization_setup_assert_session(p_actor,p_session,p_aal2);
  if not coalesce(char_length(btrim(p_query)) between 2 and 80 and p_query !~ '[[:cntrl:]]',false)
    then raise exception 'invalid search' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('handle',o.handle,'name',o.name,'kind',o.kind,
      'verificationStatus',o.verification_status) order by (o.handle=lower(btrim(p_query))) desc,o.name,o.handle)
    from (select x.* from private.organizations x
      where x.status='active' and (strpos(x.handle,lower(btrim(p_query)))>0 or strpos(lower(x.name),lower(btrim(p_query)))>0)
      order by (x.handle=lower(btrim(p_query))) desc,x.name,x.handle limit 8) o),'[]'::jsonb);
end
$$;

create function private.organization_setup_validate_draft(p_draft jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare entry record;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' or pg_column_size(p_draft)>4096 then return false; end if;
  if p_draft->>'mode'='existing' then
    return (p_draft-array['mode','targetHandle'])='{}'::jsonb and coalesce(
      jsonb_typeof(p_draft->'targetHandle')='string' and p_draft->>'targetHandle' ~ '^[a-z0-9][a-z0-9-]{2,39}$',false);
  end if;
  if p_draft->>'mode' is distinct from 'new'
    or (p_draft-array['mode','handle','name','kind','description','countryCode','departmentCode','website','registrationStatus'])<>'{}'::jsonb
  then return false; end if;
  for entry in select key,value from jsonb_each(p_draft) loop
    if not coalesce(case entry.key
      when 'mode' then true
      when 'handle' then jsonb_typeof(entry.value)='string' and (entry.value #>> '{}') ~ '^[a-z0-9][a-z0-9-]{2,39}$'
      when 'name' then jsonb_typeof(entry.value)='string' and char_length(btrim(entry.value #>> '{}')) between 2 and 120 and (entry.value #>> '{}') !~ '[[:cntrl:]]'
      when 'kind' then entry.value #>> '{}' in ('haitian_organization','international_organization','ngo','nonprofit','foundation','business','education','media')
      when 'description' then entry.value='null'::jsonb or (jsonb_typeof(entry.value)='string' and char_length(entry.value #>> '{}')<=600)
      when 'countryCode' then jsonb_typeof(entry.value)='string' and (entry.value #>> '{}') ~ '^[A-Z]{2}$'
      when 'departmentCode' then entry.value='null'::jsonb or (p_draft->>'countryCode'='HT' and (entry.value #>> '{}') ~ '^HT-[A-Z]{2}$')
      when 'website' then entry.value='null'::jsonb or private.valid_public_references(array[entry.value #>> '{}'])
      when 'registrationStatus' then entry.value #>> '{}' in ('unknown','informal_unregistered','pursuing_registration','registered')
      else false end,false) then return false; end if;
  end loop;
  return true;
end
$$;

create function public.organization_setup_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
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
  if p_action='complete' then perform pg_advisory_xact_lock(20261120,300); end if;
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
    if not private.organization_setup_identity_eligible(p_actor)
      then raise exception 'identity required' using errcode='O4002'; end if;
    draft := i.setup_draft;
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

create function public.institution_registration_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_org uuid,
  p_expected integer,p_request uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.organizations; previous private.institution_audit; next_version integer;
begin
  if p_request is null or not coalesce(p_expected between 0 and 2147483646,false)
    or not coalesce(p_status in ('unknown','informal_unregistered','pursuing_registration','registered'),false)
  then raise exception 'invalid registration' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform 1 from auth.users where id=p_actor for no key update;
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for share;
  perform private.organization_setup_assert_session(p_actor,p_session,p_aal2);
  select * into o from private.organizations where id=p_org and status='active' for no key update;
  if not found or private.institution_role(p_actor,p_org) is distinct from 'owner'
    then raise exception 'access denied' using errcode='42501'; end if;
  next_version := p_expected+1;
  select * into previous from private.institution_audit e where e.actor_id=p_actor and e.request_id=p_request
    and e.event='registration_corrected';
  if found then
    if previous.organization_id<>p_org or previous.case_version<>next_version or previous.registration_status<>p_status
      then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('status',p_status,'version',next_version,'auditId',previous.id);
  end if;
  if private.organization_setup_government(o.kind) then raise exception 'protected review required' using errcode='O4004'; end if;
  if o.verification_status='verified' or exists(select 1 from private.verification_applications a
    where a.organization_id=o.id and a.kind in ('claim','organization','government') and a.status='pending')
    then raise exception 'identity fields locked' using errcode='55000'; end if;
  perform 1 from public.verification_records v where v.user_id=p_actor and v.verification_type='identity' for share;
  if not private.organization_setup_identity_eligible(p_actor)
    then raise exception 'identity required' using errcode='O4002'; end if;
  if o.registration_version<>p_expected then raise exception 'stale registration' using errcode='O2004'; end if;
  if o.claimed_registration_status=p_status then raise exception 'registration unchanged' using errcode='55000'; end if;
  update private.organizations set claimed_registration_status=p_status,registration_version=next_version,updated_at=clock_timestamp()
    where id=o.id;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event,request_id,case_version,registration_status)
    values(p_actor,o.id,o.id,'registration_corrected',p_request,next_version,p_status) returning * into previous;
  return jsonb_build_object('status',p_status,'version',next_version,'auditId',previous.id);
end
$$;

revoke all on function private.organization_setup_government(text),private.organization_setup_founder_candidate(uuid),
  private.organization_setup_founder_parity_enabled(),private.organization_setup_identity_eligible(uuid),
  private.organization_setup_assert_session(uuid,uuid,boolean),private.organization_setup_profile_complete(uuid),
  private.organization_setup_validate_draft(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.institution_manage_for_api(uuid,uuid),
  public.verification_submit_for_api(uuid,uuid,text,text[]),public.verification_decide_for_api(uuid,uuid,text,text,boolean),
  public.organization_setup_read_for_api(uuid,uuid,boolean),public.organization_setup_matches_for_api(uuid,uuid,boolean,text),
  public.organization_setup_command_for_api(uuid,uuid,boolean,uuid,text,integer,uuid,jsonb),
  public.institution_registration_for_api(uuid,uuid,boolean,uuid,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.institution_manage_for_api(uuid,uuid),
  public.verification_submit_for_api(uuid,uuid,text,text[]),public.verification_decide_for_api(uuid,uuid,text,text,boolean),
  public.organization_setup_read_for_api(uuid,uuid,boolean),public.organization_setup_matches_for_api(uuid,uuid,boolean,text),
  public.organization_setup_command_for_api(uuid,uuid,boolean,uuid,text,integer,uuid,jsonb),
  public.institution_registration_for_api(uuid,uuid,boolean,uuid,integer,uuid,text) to service_role;

-- Retire legacy creation while preserving the established management permissions.

create or replace function public.institution_save_for_api(p_actor uuid, p_org uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or p_input = '{}'::jsonb or pg_column_size(p_input) > 4096
  or (p_input - array['handle','name','kind','description','countryCode','departmentCode','website','contactEmail']) <> '{}'::jsonb
  then raise exception 'invalid organization fields' using errcode = '23514'; end if;
  if p_org is null then raise exception 'use organization setup' using errcode='O4001'; end if;
  select * into o from private.organizations where id = p_org for no key update;
  actor_role := private.institution_role(p_actor,p_org);
  if (actor_role is distinct from 'owner' and actor_role is distinct from 'administrator'
      and ((p_input-'description')<>'{}'::jsonb or not private.organization_has_permission(p_actor,p_org,'content.edit')))
    or (actor_role = 'administrator' and p_input ?| array['handle','name','kind','countryCode','departmentCode','website'])
  then raise exception 'access denied' using errcode = '42501'; end if;
  if p_input ? 'kind' and p_input->>'kind' is distinct from o.kind
    and (private.organization_setup_government(o.kind) or private.organization_setup_government(p_input->>'kind'))
  then raise exception 'protected review required' using errcode='O4004'; end if;
  if (o.verification_status = 'verified' or exists (
    select 1 from private.verification_applications where organization_id = p_org
      and kind in ('organization','government') and status = 'pending'
  )) and p_input ?| array['handle','name','kind','countryCode','departmentCode','website']
  then raise exception 'identity fields locked' using errcode = '55000'; end if;
  update private.organizations set
    handle = coalesce(p_input->>'handle',o.handle), name = coalesce(p_input->>'name',o.name),
    kind = coalesce(p_input->>'kind',o.kind), country_code = coalesce(p_input->>'countryCode',o.country_code),
    department_code = case when p_input ? 'departmentCode' then p_input->>'departmentCode' else o.department_code end,
    description = case when p_input ? 'description' then p_input->>'description' else o.description end,
    website = case when p_input ? 'website' then p_input->>'website' else o.website end,
    contact_email = case when p_input ? 'contactEmail' then p_input->>'contactEmail' else o.contact_email end,
    updated_at = now() where id = p_org;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,p_org,'organization_updated');
  return o.id;
end;
$$;

-- O2 callers keep their original envelopes and cannot reopen completed intents.

create or replace function public.organization_intent_for_api(p_actor uuid,p_session uuid,p_aal2 boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  return (select private.organization_intent_card(i) from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled' and i.completed_at is null);
end;
$$;

create or replace function public.organization_intent_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
  p_id uuid,p_action text,p_stage text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  intent private.organization_onboarding_intents;
  receipt private.organization_onboarding_receipts;
  command jsonb := jsonb_build_object('id',p_id,'action',p_action,'stage',p_stage,'expected',p_expected);
  result jsonb;
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_expected is null or p_expected<0 or p_request is null
    or (p_id is null)<>(p_expected=0)
    or not coalesce((p_action='save' and p_stage in ('drafting','awaiting_identity'))
      or (p_action='cancel' and p_stage is null and p_id is not null),false)
  then raise exception 'invalid command' using errcode='23514'; end if;

  -- Institution creation and claim submission also take this actor lock.
  perform 1 from auth.users where id=p_actor for no key update;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  select * into receipt from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.request_id=p_request;
  if found then
    if receipt.command<>command then raise exception 'request conflict' using errcode='O2002'; end if;
    return receipt.result;
  end if;
  if (select count(*) from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.created_at>now()-interval '1 day')>=60
  then raise exception 'command limit' using errcode='54000'; end if;

  if p_id is not null and not exists (select 1 from private.organization_onboarding_intents i
    where i.id=p_id and i.subject_id=p_actor)
  then raise exception 'intent unavailable' using errcode='O2003'; end if;
  select * into intent from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled' and i.completed_at is null for update;
  if intent.id is distinct from p_id or coalesce(intent.version,0)<>p_expected
  then raise exception 'stale intent' using errcode='O2004'; end if;

  if p_action='cancel' and (
    exists(select 1 from private.organization_memberships m
      where m.user_id=p_actor and m.role='owner' and m.revoked_at is null)
    or exists(select 1 from private.verification_applications a
      where a.applicant_id=p_actor and a.kind='claim' and a.status in ('pending','approved'))
  ) then raise exception 'protected dependency' using errcode='O2005'; end if;

  if intent.id is null then
    insert into private.organization_onboarding_intents(subject_id,pathway,stage)
      values(p_actor,'organization',p_stage) returning * into intent;
  else
    update private.organization_onboarding_intents i set
      pathway=case when p_action='cancel' then 'individual' else 'organization' end,
      stage=case when p_action='cancel' then 'cancelled' else p_stage end,
      setup_draft=case when p_action='cancel' then null else i.setup_draft end,
      version=i.version+1,updated_at=clock_timestamp() where i.id=intent.id returning * into intent;
  end if;
  result := jsonb_build_object('intent',private.organization_intent_card(intent),'requestId',p_request);
  insert into private.organization_onboarding_receipts(subject_id,request_id,intent_id,command,result)
    values(p_actor,p_request,intent.id,command,result);
  return result;
end;
$$;
