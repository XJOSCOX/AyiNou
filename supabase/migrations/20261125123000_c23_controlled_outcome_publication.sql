-- Closed disposable gate. Existing projects and private outcomes are never promoted by this migration.
create table private.c23_fixture (enabled boolean primary key check(enabled));

create table private.c23_grants (
  department text not null references public.departments(code),
  actor uuid not null references auth.users(id) on delete cascade,
  generation integer not null check(generation>0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key(department,actor)
);

create table private.c23_workspaces (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  lane text not null check(lane in ('admin','review')),
  expires_at timestamptz not null,
  unique(actor,session_id,lane)
);

create table private.c23_publications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references private.c22_cases(id) on delete cascade,
  project_id uuid not null references private.community_projects(id) on delete cascade,
  department text not null references public.departments(code),
  finding_id uuid not null references private.c22_findings(id) on delete cascade,
  project_revision integer not null,
  revision integer not null default 1 check(revision between 1 and 25),
  version integer not null default 1 check(version>0),
  state text not null default 'draft' check(state in ('draft','submitted','changes','rejected','appeal','approved','withdrawn','invalidated')),
  consent_hash bytea,
  approved_at timestamptz,
  rejected_at timestamptz,
  challenged_at timestamptz,
  first_rejector uuid references auth.users(id) on delete set null,
  reviewer uuid references auth.users(id) on delete set null,
  assignment_generation integer,
  assignment_deadline timestamptz,
  accepted_at timestamptz,
  inspected_version integer
);
create index c23_project_publications on private.c23_publications(project_id,id);
create index c23_department_queue on private.c23_publications(department,state,id);
create index c23_reviewer_queue on private.c23_publications(reviewer,department,id) where reviewer is not null;

create table private.c23_disclosures (
  publication_id uuid not null references private.c23_publications(id) on delete cascade,
  revision integer not null,
  finding_id uuid not null references private.c22_findings(id) on delete cascade,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  fingerprint bytea not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(publication_id,revision)
);

create table private.c23_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid references private.c23_publications(id) on delete cascade,
  department text not null references public.departments(code),
  actor uuid references auth.users(id) on delete set null,
  recipient uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid,
  command_hash bytea,
  action text not null,
  version integer,
  revision integer,
  finding_id uuid,
  disclosure_hash bytea,
  reason text,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);
create index c23_review_history on private.c23_events(publication_id,happened_at desc,id);
create index c23_grant_history on private.c23_events(department,happened_at desc,id) where publication_id is null;

create table private.c23_recusals (
  publication_id uuid not null references private.c23_publications(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  primary key(publication_id,actor)
);

alter table private.c23_fixture enable row level security;
alter table private.c23_grants enable row level security;
alter table private.c23_workspaces enable row level security;
alter table private.c23_publications enable row level security;
alter table private.c23_disclosures enable row level security;
alter table private.c23_events enable row level security;
alter table private.c23_recusals enable row level security;
revoke all on private.c23_fixture,private.c23_grants,private.c23_workspaces,private.c23_publications,
  private.c23_disclosures,private.c23_events,private.c23_recusals from public,anon,authenticated,service_role;

create function private.c23_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c22_enabled() and exists(select from private.c23_fixture where enabled)
$$;

create function private.c23_grant(p_actor uuid,p_department text) returns integer
language sql stable set search_path='' as $$
  select generation from private.c23_grants where actor=p_actor and department=p_department and revoked_at is null
    and expires_at>clock_timestamp() and private.c22_identity(p_actor)
$$;

create function private.c23_finding_current(p private.community_projects,r private.c21_outcome_requests,
  c private.c22_cases,f private.c22_findings)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.project_progress_public(p)
    and feed_data.author_active(r.requester_id) and private.member_onboarding_access(r.requester_id)
    and private.project_progress_manager(private.project_execution_role(p,r.requester_id))
    and not exists(select from private.m23_restrictions m where m.subject_id in(r.requester_id,p.owner_user_id,p.submitted_by)
      and m.capability in ('project_update','project_manage') and m.starts_at<=clock_timestamp()
      and m.revoked_at is null and (m.expires_at is null or m.expires_at>clock_timestamp())
      and (m.scope_kind='platform' or m.scope_kind='project' and m.scope_id=p.id
        or m.scope_kind='organization' and m.scope_id=p.organization_id
        or m.scope_kind='community' and m.scope_id in(p.community_id,p.association_id)))
    and private.c22_department(p)=c.department and c.id=r.id and c.state='decided'
    and r.status='submitted' and f.case_id=c.id and f.revision=c.revision and exists(
      select from private.c22_revisions v join private.c22_releases l using(case_id,revision)
      where v.case_id=c.id and v.revision=c.revision and v.submitted_revision=r.revision
        and v.result=r.result-'evidence'
        and l.generation=f.release_generation and l.revoked_at is null
        and private.c22_live_manifest(v.manifest,private.c22_source(p,r)))
    and case when f.lane='initial' then
      (f.classification='supported' or f.available_at+interval '14 days'<=clock_timestamp()
        or exists(select from private.c22_challenges q where q.finding_id=f.id and q.resolution='upheld'))
      and not exists(select from private.c22_challenges q where q.finding_id=f.id and q.resolution is distinct from 'upheld')
    else exists(select from private.c22_challenges q where q.new_finding=f.id and q.resolution in ('revised','reassessed')) end,false)
$$;

create function private.c23_independent(p private.community_projects,r private.c21_outcome_requests,
  x private.c23_publications,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(not private.c22_conflicted(p,r,p_actor,'publication') and not exists(
    select from private.c22_findings f where f.case_id=r.id and f.reviewer=p_actor)
    and not exists(select from private.c23_recusals v where v.publication_id=x.id and v.actor=p_actor)
    and (x.state<>'appeal' or (x.first_rejector is distinct from p_actor and not exists(
      select from private.c23_events e where e.publication_id=x.id and e.actor=p_actor
        and e.action in ('inspect','approve','changes','reject') and e.happened_at<x.challenged_at))),false)
$$;

create function private.c23_assigned(p private.community_projects,r private.c21_outcome_requests,x private.c23_publications)
returns boolean language sql stable set search_path='' as $$
  select coalesce(x.reviewer is not null and x.assignment_deadline>clock_timestamp()
    and private.c23_grant(x.reviewer,x.department)=x.assignment_generation
    and private.c23_independent(p,r,x,x.reviewer),false)
$$;

create function private.c23_safe_text(s text,min_chars integer,max_chars integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(s=btrim(s) and private.project_operational_text(s,min_chars,max_chars)
    and s !~ '[<>[:cntrl:]]' and s !~* 'https?[:/]|www[.]|[@]|[[:digit:]][[:digit:] .+()-]{6,}[[:digit:]]',false)
$$;

create function private.c23_snapshot(r private.c21_outcome_requests,f private.c22_findings,content jsonb,p_corrected boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'title',content->>'title','summary',content->>'summary','limitations',content->>'limitations',
    'classification',r.classification,'finding',f.classification,
    'startsOn',r.result->>'startsOn','endsOn',r.result->>'endsOn',
    'reportedQuantity',case when f.measurement is not null or content->'includeReported'='true'::jsonb then r.result->'measurement' end,
    'supportedQuantity',f.measurement->'quantity',
    'unit',case when (f.measurement is not null or content->'includeReported'='true'::jsonb)
      and r.result->>'measurement' is not null then r.result->>'unit' end,
    'reviewedOn',(f.available_at at time zone 'UTC')::date,'corrected',p_corrected)
$$;

create function public.c23_public_results_for_client(p_project uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when not private.c23_enabled() then '[]'::jsonb else coalesce((
    select jsonb_agg(rows.snapshot||jsonb_build_object('publishedOn',(rows.approved_at at time zone 'UTC')::date)
      order by rows.approved_at desc,rows.id)
    from (select d.snapshot,x.approved_at,x.id from private.c23_publications x
      join private.c23_disclosures d on d.publication_id=x.id and d.revision=x.revision and d.fingerprint=x.consent_hash
        and d.finding_id=x.finding_id
      join private.community_projects p on p.id=x.project_id and p.revision=x.project_revision
      join private.c21_outcome_requests r on r.id=x.case_id
      join private.c22_cases c on c.id=x.case_id and c.department=x.department
      join private.c22_findings f on f.id=x.finding_id
      where x.project_id=p_project and x.state='approved' and x.approved_at is not null
        and private.c23_finding_current(p,r,c,f)
        and feed_data.viewer_can_interact(r.requester_id)
      order by x.approved_at desc,x.id limit 50) rows),'[]'::jsonb) end
$$;

-- Invalidation is permanent for that disclosure, even if eligibility is later restored.
create function private.c23_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; changed jsonb; resource uuid; owner_ref uuid;
  project_ref uuid; org_ref uuid; community_ref uuid; case_ref uuid; source_ref uuid; previous_source uuid;
  pair_a uuid; pair_b uuid;
begin
  if not exists(select from private.c23_publications where state in ('draft','submitted','changes','rejected','appeal','approved')) then return null; end if;
  if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
  if before_row is not distinct from after_row then return null; end if;
  changed:=coalesce(after_row,before_row);
  resource:=(changed->>'id')::uuid;
  case tg_table_name
    when 'community_projects' then project_ref:=resource;
    when 'project_execution','project_team' then project_ref:=(changed->>'project_id')::uuid;
    when 'c22_cases','c21_outcome_requests' then case_ref:=resource;
    when 'c22_releases' then
      if tg_op='INSERT' then return null; end if;
      case_ref:=(changed->>'case_id')::uuid;
    when 'project_progress_entries','project_milestones','project_metric_observations' then
      source_ref:=resource;
      if after_row->>'state'='approved' or before_row->>'state'='approved' then
        previous_source:=(changed->>'supersedes_id')::uuid;
      end if;
    when 'profiles','profile_privacy','user_settings','verification_records','account_restrictions' then
      owner_ref:=(changed->>'user_id')::uuid;
    when 'users' then owner_ref:=resource;
    when 'member_blocks' then
      pair_a:=(changed->>'actor_id')::uuid;
      pair_b:=(changed->>'target_id')::uuid;
    when 'm22_account_sanctions' then owner_ref:=(changed->>'subject_id')::uuid;
    when 'm23_restrictions' then
      if changed->>'capability' not in ('project_manage','project_update') then return null; end if;
      owner_ref:=(changed->>'subject_id')::uuid;
      if changed->>'scope_kind'='project' then project_ref:=(changed->>'scope_id')::uuid;
      elsif changed->>'scope_kind'='organization' then org_ref:=(changed->>'scope_id')::uuid;
      elsif changed->>'scope_kind'='community' then community_ref:=(changed->>'scope_id')::uuid;
      end if;
    when 'organizations' then org_ref:=resource;
    when 'organization_memberships','organization_affiliations','organization_custom_assignments','organization_custom_roles','verification_applications' then
      org_ref:=(changed->>'organization_id')::uuid;
    when 'communities' then community_ref:=resource;
    when 'community_memberships','community_staff' then community_ref:=(changed->>'community_id')::uuid;
      owner_ref:=(changed->>'user_id')::uuid;
    else return null;
  end case;

  with affected as (
    update private.c23_publications x set state='invalidated',version=x.version+1,consent_hash=null,
      reviewer=null,assignment_deadline=null,accepted_at=null,inspected_version=null
    from private.community_projects p,private.c21_outcome_requests r
    where x.state in ('draft','submitted','changes','rejected','appeal','approved') and p.id=x.project_id and r.id=x.case_id
      and (
        case_ref=x.case_id
        or (r.requester_id in(pair_a,pair_b) and (
          exists(select from private.project_milestones m where r.source_kind='milestone' and m.id=r.source_id and
            (case when r.requester_id=pair_a then pair_b else pair_a end) in(m.creator_id,m.responsible_id))
          or exists(select from private.project_progress_entries m where m.project_id=p.id
            and m.author_id=(case when r.requester_id=pair_a then pair_b else pair_a end)
            and (m.id=r.source_id or exists(select from private.c22_findings f
              join private.c22_revisions v using(case_id,revision) cross join lateral jsonb_array_elements(v.manifest) k
              where f.id=x.finding_id and k->>'sourceId'=m.id::text)))
          or exists(select from private.project_metric_observations m where r.source_kind='observation' and m.id=r.source_id
            and m.reporter_id=(case when r.requester_id=pair_a then pair_b else pair_a end))))
        or (source_ref is not null and (r.source_id in(source_ref,previous_source) or exists(
          select from private.c22_findings f join private.c22_revisions v using(case_id,revision)
          cross join lateral jsonb_array_elements(v.manifest) k where f.id=x.finding_id and
            (k->>'sourceId')::uuid in(source_ref,previous_source))))
        or ((project_ref is not null or org_ref is not null or community_ref is not null or owner_ref is not null)
          and (project_ref is null or p.id=project_ref)
          and (org_ref is null or p.organization_id=org_ref)
          and (community_ref is null or community_ref in(p.community_id,p.association_id))
          and (owner_ref is null or owner_ref in(p.owner_user_id,p.submitted_by,r.requester_id)
            or (p.organization_id is not null and exists(select from private.organization_memberships m
              where m.organization_id=p.organization_id and m.user_id=owner_ref and m.role='owner'))))
      )
    returning x.*
  )
  insert into private.c23_events(publication_id,department,action,version,revision,finding_id,disclosure_hash)
    select a.id,a.department,'invalidate',a.version,a.revision,a.finding_id,disclosed.fingerprint
    from affected a join private.c23_disclosures disclosed on disclosed.publication_id=a.id and disclosed.revision=a.revision;
  return null;
end
$$;

create trigger c23_project_visibility after update of status,revision,restricted_at,directory_published_at,owner_user_id,organization_id,community_id,association_id,submitted_by
  on private.community_projects for each row execute function private.c23_invalidate();
create trigger c23_execution_basis after update of approved_revision,operator_id on private.project_execution
  for each row execute function private.c23_invalidate();
create trigger c23_team_basis after insert or update or delete on private.project_team
  for each row execute function private.c23_invalidate();
create trigger c23_review_basis after update of revision,state on private.c22_cases
  for each row when (old.revision is distinct from new.revision or old.state is distinct from new.state)
  execute function private.c23_invalidate();
create trigger c23_request_basis after update of status,revision on private.c21_outcome_requests
  for each row execute function private.c23_invalidate();
create trigger c23_release_basis after update of revoked_at or delete on private.c22_releases
  for each row execute function private.c23_invalidate();
create trigger c23_entry_basis after insert or update of state,version,image_digest or delete on private.project_progress_entries
  for each row execute function private.c23_invalidate();
create trigger c23_milestone_basis after update of status,version or delete on private.project_milestones
  for each row execute function private.c23_invalidate();
create trigger c23_observation_basis after update or delete on private.project_metric_observations
  for each row execute function private.c23_invalidate();
create trigger c23_profile_basis after update of is_visible or delete on public.profiles
  for each row execute function private.c23_invalidate();
create trigger c23_privacy_basis after insert or update of mode or delete on feed_data.profile_privacy
  for each row execute function private.c23_invalidate();
create trigger c23_discovery_basis after insert or update of discoverable or delete on public.user_settings
  for each row execute function private.c23_invalidate();
create trigger c23_identity_basis after insert or update of status or delete on public.verification_records
  for each row execute function private.c23_invalidate();
create trigger c23_auth_basis after update of banned_until,deleted_at on auth.users
  for each row execute function private.c23_invalidate();
create trigger c23_block_basis after insert on feed_data.member_blocks
  for each row execute function private.c23_invalidate();
create trigger c23_account_basis after insert or update of status or delete on private.account_restrictions
  for each row execute function private.c23_invalidate();
create trigger c23_sanction_basis after insert or update or delete on private.m22_account_sanctions
  for each row execute function private.c23_invalidate();
create trigger c23_restriction_basis after insert or update or delete on private.m23_restrictions
  for each row execute function private.c23_invalidate();
create trigger c23_organization_basis after update of status,verification_status on private.organizations
  for each row execute function private.c23_invalidate();
create trigger c23_organization_member_basis after insert or update or delete on private.organization_memberships
  for each row execute function private.c23_invalidate();
create trigger c23_organization_affiliation_basis after insert or update or delete on private.organization_affiliations
  for each row execute function private.c23_invalidate();
create trigger c23_organization_grant_basis after insert or update or delete on private.organization_custom_assignments
  for each row execute function private.c23_invalidate();
create trigger c23_organization_role_basis after insert or update or delete on private.organization_custom_roles
  for each row execute function private.c23_invalidate();
create trigger c23_organization_verification_basis after update of status or delete on private.verification_applications
  for each row execute function private.c23_invalidate();
create trigger c23_community_policy_basis after update of policy,public_since,owner_id,department_code on feed_data.communities
  for each row execute function private.c23_invalidate();
create trigger c23_community_member_basis after insert or update or delete on feed_data.community_memberships
  for each row execute function private.c23_invalidate();
create trigger c23_community_staff_basis after insert or update or delete on feed_data.community_staff
  for each row execute function private.c23_invalidate();

create function private.c23_review_packet(x private.c23_publications,d private.c23_disclosures,f private.c22_findings)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('disclosure',d.snapshot,'findingExplanation',f.explanation,'findingLimitations',f.limitations,
    'rejectionReason',(select a.reason from private.c23_events a where a.publication_id=x.id and a.action='reject'
      order by a.happened_at desc,a.id desc limit 1),
    'appealReason',(select a.reason from private.c23_events a where a.publication_id=x.id and a.action='appeal'
      order by a.happened_at desc,a.id desc limit 1))
$$;
revoke all on function private.c23_review_packet(private.c23_publications,private.c23_disclosures,private.c22_findings)
  from public,anon,authenticated,service_role;

create function public.c23_publication_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.community_projects; r private.c21_outcome_requests; c private.c22_cases; f private.c22_findings;
  x private.c23_publications; d private.c23_disclosures; g private.c23_grants; w private.c23_workspaces; e private.c23_events;
  scope text; case_ref uuid; pub_ref uuid; finding_ref uuid; target_actor uuid; key_ref uuid; prior_hash bytea;
  safe_content jsonb; snapshot jsonb; reason_text text; expected integer; grant_version integer;
  moment timestamptz:=clock_timestamp(); deadline timestamptz; current_finding boolean; worker boolean; selected_status text;
begin
  if not private.c23_enabled() then raise exception 'publication disabled' using errcode='C2301'; end if;
  if p_lane is null or p_lane not in ('admin','review','member') or p_action is null
    or p_action not in ('availability','open','queue','roster','grant','revoke','read','draft','submit','withdraw','appeal',
      'assign','release','accept','recuse','inspect','approve','changes','reject','invalidate')
    or jsonb_typeof(p_input) is distinct from 'object'
  then raise exception 'invalid publication command' using errcode='23514'; end if;
  if p_action not in ('availability','queue','roster','read') then
    perform pg_advisory_xact_lock_shared(20261120,300);
    -- Same ordering as C2.2 decisions and the native C2.1 source mutation after the actor lock.
    perform pg_advisory_xact_lock(20261125,220);
    perform private.s2b_lock_actor(p_actor,p_session);
    moment:=clock_timestamp();
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false)
  then raise exception 'session unavailable' using errcode='42501'; end if;
  if p_action='availability' and p_lane='member' then return 'true'::jsonb; end if;
  if p_lane<>'member' then
    if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    then raise exception 'recent MFA required' using errcode='O5001'; end if;
    if (p_lane='review' and not exists(select from private.c23_grants z where z.actor=p_actor and private.c23_grant(p_actor,z.department) is not null))
      or (p_lane='admin' and not exists(select from public.departments z where private.c22_coordinator(p_actor,z.code)))
    then raise exception 'workspace unavailable' using errcode='42501'; end if;
    if p_action='open' then
      select least(moment+interval '5 minutes',to_timestamp(p_totp)+interval '15 minutes',s.not_after,
        private.s2a_deadline(s.created_at,coalesce(z.privileged_at_sign_in,false) or private.s2a_leadership(p_actor),
          coalesce(z.remembered,false)))
        into deadline from auth.sessions s left join private.s2a_session_policy z on z.session_id=s.id
        where s.id=p_session and s.user_id=p_actor;
      if deadline is null or deadline<=moment then raise exception 'workspace unavailable' using errcode='42501'; end if;
      select * into w from private.c23_workspaces where actor=p_actor and session_id=p_session and lane=p_lane;
      if not found or w.expires_at<=moment then
        insert into private.c23_workspaces(actor,session_id,lane,expires_at) values(p_actor,p_session,p_lane,deadline)
          on conflict(actor,session_id,lane) do update set id=gen_random_uuid(),expires_at=excluded.expires_at returning * into w;
        insert into private.s2b_security_events(actor_id,scope_ref,action,mfa_verified_at)
          values(p_actor,w.id,'workflow_created',to_timestamp(p_totp));
      end if;
      return jsonb_build_object('id',w.id,'expiresAt',w.expires_at);
    end if;
    if not exists(select from private.c23_workspaces where id=p_workspace and actor=p_actor
      and session_id=p_session and lane=p_lane and expires_at>moment)
    then raise exception 'workspace unavailable' using errcode='42501'; end if;
  elsif p_action='open' then raise exception 'workspace unavailable' using errcode='42501';
  end if;

  scope:=p_input->>'department'; case_ref:=(p_input->>'caseId')::uuid; pub_ref:=(p_input->>'id')::uuid;
  finding_ref:=(p_input->>'findingId')::uuid; target_actor:=(p_input->>'target')::uuid;
  expected:=(p_input->>'expectedVersion')::integer; key_ref:=(p_input->>'requestId')::uuid;
  reason_text:=btrim(p_input->>'note');
  if p_action in ('queue','roster','grant','revoke') then
    if p_lane='member' or scope is null or not exists(select from public.departments z where z.code=scope)
      or (p_lane='admin' and not private.c22_coordinator(p_actor,scope))
      or (p_lane='review' and private.c23_grant(p_actor,scope) is null)
    then raise exception 'department unavailable' using errcode='42501'; end if;
    if p_action='queue' then
      selected_status:=p_input->>'status';
      return coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'department',z.department,
        'status',z.state,'revision',z.revision,'version',z.version,'projectTitle',z.project_title,'title',z.result_title) order by z.id)
        from (select a.*, pr.proposal->>'title' project_title, disclosed.snapshot->>'title' result_title
          from private.c23_publications a join private.community_projects b on b.id=a.project_id
          join private.c23_disclosures disclosed on disclosed.publication_id=a.id and disclosed.revision=a.revision
          join private.project_revisions pr on pr.project_id=b.id and pr.revision=b.revision
          join private.c21_outcome_requests o on o.id=a.case_id
          where a.department=scope and a.state<>'draft' and (selected_status is null or a.state=selected_status)
            and (p_input->>'after' is null or a.id>(p_input->>'after')::uuid)
            and (p_lane='admin' or (a.reviewer=p_actor and a.state in ('submitted','appeal') and private.c23_assigned(b,o,a)))
          order by a.id limit 21) z),'[]'::jsonb);
    end if;
    if p_lane<>'admin' then raise exception 'coordination required' using errcode='42501'; end if;
    if p_action='roster' then
      return jsonb_build_object('canAppoint',private.platform_founder(p_actor),
        'grants',coalesce((select jsonb_agg(jsonb_build_object('actor',a.actor,'label',coalesce(m.display_name,m.username),
          'version',a.generation,'expiresAt',a.expires_at,'eligible',private.c23_grant(a.actor,scope) is not null,
          'state',case when a.revoked_at is null then 'active' else 'revoked' end) order by a.actor)
          from (select * from private.c23_grants where department=scope order by actor limit 100) a
          left join public.profiles m on m.user_id=a.actor),'[]'::jsonb),
        'candidates',case when private.platform_founder(p_actor) and char_length(p_input->>'search') between 2 and 60 then
          coalesce((select jsonb_agg(jsonb_build_object('actor',z.user_id,'label',coalesce(z.display_name,z.username)) order by z.username)
            from (select m.* from public.profiles m where m.user_id<>p_actor and private.c22_identity(m.user_id)
              and (strpos(lower(coalesce(m.username,'')),lower(p_input->>'search'))>0
                or strpos(lower(coalesce(m.display_name,'')),lower(p_input->>'search'))>0)
              order by m.username limit 15) z),'[]'::jsonb) else '[]'::jsonb end,
        'history',case when private.platform_founder(p_actor) then coalesce((select jsonb_agg(jsonb_build_object(
          'action',z.action,'actor',z.actor,'target',z.recipient,'at',z.happened_at,'note',z.reason)
          order by z.happened_at desc,z.id desc) from (select * from private.c23_events
            where publication_id is null and department=scope order by happened_at desc,id desc limit 30) z),'[]'::jsonb)
          else '[]'::jsonb end);
    end if;
    if not private.platform_founder(p_actor) or target_actor is null or target_actor=p_actor
    then raise exception 'Founder appointment required' using errcode='42501'; end if;
  else
    if p_lane<>'member' then
      select a.case_id into case_ref from private.c23_publications a where a.id=pub_ref and a.state<>'draft';
    end if;
    select * into r from private.c21_outcome_requests where id=case_ref;
    if not found then raise exception 'result unavailable' using errcode='O2003'; end if;
    if p_action='read' then select * into p from private.community_projects where id=r.project_id;
    else
      select * into p from private.community_projects where id=r.project_id for update;
      if found then perform private.project_lock_scope(p); end if;
      select * into r from private.c21_outcome_requests where id=case_ref for update;
    end if;
    select * into c from private.c22_cases where id=r.id;
    scope:=c.department;
    if scope is null or p.id is null or
      (p_lane='member' and (r.requester_id is distinct from p_actor or (p_input->>'project')::uuid is distinct from p.id
         or not private.project_progress_manager(private.project_execution_role(p,p_actor)))) or
      (p_lane='admin' and not private.c22_coordinator(p_actor,scope))
    then raise exception 'publication unavailable' using errcode='O2003'; end if;
    if p_action='read' then select * into x from private.c23_publications where case_id=r.id;
    else select * into x from private.c23_publications where case_id=r.id for update; end if;
    if p_lane<>'member' and (x.id is null or x.id is distinct from pub_ref) then raise exception 'publication unavailable' using errcode='O2003'; end if;
    if p_lane='review' and key_ref is not null and p_action<>'inspect' then
      select * into e from private.c23_events where actor=p_actor and request_id=key_ref and publication_id=x.id;
      if found then
        if e.command_hash<>extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256')
        then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('version',e.version,'revision',e.revision);
      end if;
    end if;
    worker:=x.reviewer is not distinct from p_actor and private.c23_assigned(p,r,x);
    if p_lane='review' and (x.reviewer is distinct from p_actor or (p_action<>'recuse' and not worker)
      or x.state not in ('submitted','appeal'))
    then raise exception 'assignment unavailable' using errcode='O2003'; end if;
    select * into f from private.c22_findings z where z.id=(case when p_action='draft' then finding_ref else x.finding_id end)
      and z.case_id=c.id;
    current_finding:=private.c23_finding_current(p,r,c,f);
    select * into d from private.c23_disclosures where publication_id=x.id and revision=x.revision;
    if p_action='read' then
      return jsonb_build_object('id',x.id,'department',scope,'status',x.state,'revision',x.revision,'version',coalesce(x.version,0),'projectTitle',(select v.proposal->>'title' from private.project_revisions v where v.project_id=p.id and v.revision=p.revision),
        'findingId',case when p_lane='member' then x.finding_id end,'available',current_finding and p.revision=x.project_revision,
        'reviewer',case when p_lane='admin' then x.reviewer end,'assigned',x.reviewer is not null,
        'accepted',x.accepted_at is not null,'assignmentLive',private.c23_assigned(p,r,x),'deadline',x.assignment_deadline,
        'appealUntil',case when p_lane='member' and x.state='rejected' and x.challenged_at is null
          and x.rejected_at+interval '14 days'>moment then x.rejected_at+interval '14 days' end,
        'draft',case when p_lane='member' then d.snapshot end,'fingerprint',case when p_lane='member' then encode(d.fingerprint,'hex') end,
        'options',case when p_lane='member' then coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'classification',z.classification,
          'measurement',z.measurement,'reviewedAt',z.available_at,'limitations',z.limitations) order by z.available_at desc)
          from private.c22_findings z where z.case_id=c.id and z.revision=c.revision and private.c23_finding_current(p,r,c,z)),'[]'::jsonb) end,
        'history',case when p_lane in ('member','admin') then coalesce((select jsonb_agg(jsonb_build_object(
          'action',z.action,'revision',z.revision,'at',z.happened_at,
          'note',case when p_lane='member' and z.action in ('changes','reject','approve') then z.reason
            when p_lane='admin' and z.action in ('assign','release','recuse','invalidate') then z.reason end)
          order by z.happened_at desc,z.id desc) from (select * from private.c23_events where publication_id=x.id
            order by happened_at desc,id desc limit 60) z),'[]'::jsonb) else '[]'::jsonb end);
    end if;
  end if;
  if expected is null or expected not between 0 and 2147483646
    or key_ref is null or p_input->'confirmed' is distinct from 'true'::jsonb
    or not coalesce(private.project_operational_text(reason_text,3,1200),false)
  then raise exception 'invalid command' using errcode='23514'; end if;
  prior_hash:=extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256');
  select * into e from private.c23_events where actor=p_actor and request_id=key_ref;
  if found then
    if e.command_hash<>prior_hash then raise exception 'request conflict' using errcode='O2002'; end if;
    if p_action='inspect' and worker and current_finding and p.revision=x.project_revision
      and d.fingerprint=x.consent_hash and x.inspected_version=e.version and x.version=e.version then
      return jsonb_build_object('version',e.version,'revision',e.revision,'snapshot',
        private.c23_review_packet(x,d,f));
    end if;
    return jsonb_build_object('version',e.version,'revision',e.revision);
  end if;

  if p_action in ('grant','revoke') then
    select * into g from private.c23_grants where actor=target_actor and department=scope;
    if coalesce(g.generation,0)<>expected then raise exception 'grant changed' using errcode='O2004'; end if;
    if p_action='grant' then
      deadline:=(p_input->>'expiresAt')::timestamptz;
      if deadline is null or deadline<=moment or deadline>moment+interval '180 days' or not private.c22_identity(target_actor)
      then raise exception 'reviewer ineligible' using errcode='42501'; end if;
      insert into private.c23_grants(department,actor,generation,expires_at) values(scope,target_actor,expected+1,deadline)
        on conflict(department,actor) do update set generation=excluded.generation,expires_at=excluded.expires_at,revoked_at=null;
    else
      if g.generation is null or g.revoked_at is not null then raise exception 'grant changed' using errcode='O2004'; end if;
      update private.c23_grants set generation=expected+1,revoked_at=moment where department=scope and actor=target_actor;
    end if;
    insert into private.c23_events(department,actor,recipient,workspace,request_id,command_hash,action,version,reason)
      values(scope,p_actor,target_actor,p_workspace,key_ref,prior_hash,p_action,expected+1,reason_text);
    return jsonb_build_object('version',expected+1);
  end if;

  if expected<>coalesce(x.version,0) then raise exception 'publication changed' using errcode='O2004'; end if;
  if p_action not in ('withdraw','release','recuse','invalidate') and
    (not current_finding or (p_action<>'draft' and p.revision is distinct from x.project_revision))
  then raise exception 'finding unavailable' using errcode='O2005'; end if;
  if p_action in ('draft','submit','appeal') then
    perform private.m23_resource_guard(p_actor,'project_update','project',p.id);
    perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
  end if;
  perform private.project_progress_limit(p_actor);

  case p_action
    when 'draft' then
      if p_lane<>'member' or (x.id is not null and x.state not in ('draft','changes','approved','withdrawn','invalidated'))
        or coalesce(x.revision,0)>=25 then raise exception 'draft unavailable' using errcode='42501'; end if;
      safe_content:=p_input->'content';
      if jsonb_typeof(safe_content) is distinct from 'object' or not private.c23_safe_text(safe_content->>'title',3,120)
        or not private.c23_safe_text(safe_content->>'summary',5,1000)
        or not private.c23_safe_text(safe_content->>'limitations',3,700)
        or jsonb_typeof(safe_content->'includeReported') is distinct from 'boolean'
      then raise exception 'invalid disclosure' using errcode='23514'; end if;
      snapshot:=private.c23_snapshot(r,f,safe_content,exists(select from private.c23_events where publication_id=x.id and action='approve'));
      if x.id is null then
        insert into private.c23_publications(case_id,project_id,department,finding_id,project_revision)
          values(r.id,p.id,scope,f.id,p.revision) returning * into x;
      else
        update private.c23_publications set state='draft',version=x.version+1,revision=x.revision+1,finding_id=f.id,
          project_revision=p.revision,consent_hash=null,approved_at=null,reviewer=null,accepted_at=null,inspected_version=null
          where id=x.id returning * into x;
      end if;
      insert into private.c23_disclosures values(x.id,x.revision,x.finding_id,snapshot,
        extensions.digest(jsonb_build_array(x.id,x.revision,x.finding_id,snapshot)::text,'sha256'),moment) returning * into d;
    when 'submit' then
      if p_lane<>'member' or x.state is distinct from 'draft' or d.fingerprint is null
        or p_input->>'fingerprint' is distinct from encode(d.fingerprint,'hex')
      then raise exception 'exact consent required' using errcode='O2004'; end if;
      x.consent_hash:=d.fingerprint; x.state:='submitted';
    when 'withdraw' then
      if p_lane<>'member' or x.state is null or x.state not in ('draft','submitted','changes','rejected','approved','appeal','invalidated')
      then raise exception 'withdrawal unavailable' using errcode='42501'; end if;
      x.consent_hash:=null; x.state:='withdrawn'; x.reviewer:=null;
    when 'appeal' then
      if p_lane<>'member' or x.state is distinct from 'rejected' or x.challenged_at is not null
        or moment>=x.rejected_at+interval '14 days' or x.consent_hash is distinct from d.fingerprint
      then raise exception 'challenge unavailable' using errcode='O2004'; end if;
      x.challenged_at:=moment; x.state:='appeal'; x.reviewer:=null;
    when 'assign' then
      if p_lane<>'admin' or x.state not in ('submitted','appeal') or target_actor is null or target_actor=p_actor
        or private.c23_assigned(p,r,x) then raise exception 'assignment unavailable' using errcode='O2004'; end if;
      grant_version:=private.c23_grant(target_actor,scope); deadline:=(p_input->>'expiresAt')::timestamptz;
      if grant_version is null or not private.c23_independent(p,r,x,target_actor)
        or deadline is null or deadline<=moment or deadline>moment+interval '14 days'
        or deadline>(select expires_at from private.c23_grants where actor=target_actor and department=scope)
      then raise exception 'reviewer ineligible' using errcode='42501'; end if;
      x.reviewer:=target_actor; x.assignment_generation:=grant_version; x.assignment_deadline:=deadline;
      x.accepted_at:=null; x.inspected_version:=null;
    when 'release','recuse' then
      if x.reviewer is null or (p_action='release' and p_lane<>'admin') or (p_action='recuse' and p_lane<>'review')
      then raise exception 'assignment unavailable' using errcode='42501'; end if;
      if p_action='recuse' then insert into private.c23_recusals values(x.id,p_actor) on conflict do nothing; end if;
      target_actor:=x.reviewer; x.reviewer:=null; x.accepted_at:=null; x.inspected_version:=null;
    when 'accept' then
      if p_lane<>'review' or x.accepted_at is not null or p_input->'conflictFree' is distinct from 'true'::jsonb
      then raise exception 'independent acceptance required' using errcode='42501'; end if;
      x.accepted_at:=moment;
    when 'inspect' then
      if p_lane<>'review' or x.accepted_at is null or x.consent_hash is distinct from d.fingerprint
      then raise exception 'inspection unavailable' using errcode='42501'; end if;
      x.inspected_version:=x.version+1;
    when 'approve','changes','reject' then
      if p_lane<>'review' or x.accepted_at is null or x.inspected_version is distinct from x.version
        or x.consent_hash is distinct from d.fingerprint
        or not exists(select from private.c23_events h where h.publication_id=x.id and h.actor=p_actor
          and h.workspace=p_workspace and h.action='inspect' and h.version=x.version)
        or (x.state='appeal' and p_action='changes')
        or (p_action='approve' and p_input->'faithful' is distinct from 'true'::jsonb)
      then raise exception 'independent inspection required' using errcode='42501'; end if;
      if p_action='approve' then x.state:='approved'; x.approved_at:=moment;
      elsif p_action='changes' then x.state:='changes'; x.consent_hash:=null;
      else
        if x.state<>'appeal' then x.first_rejector:=p_actor; end if;
        x.state:='rejected';
        x.rejected_at:=moment;
      end if;
      x.reviewer:=null; x.accepted_at:=null; x.inspected_version:=null;
    when 'invalidate' then
      if p_lane<>'admin' or x.state is distinct from 'approved'
      then raise exception 'suppression unavailable' using errcode='42501'; end if;
      x.state:='invalidated'; x.consent_hash:=null;
    else raise exception 'invalid publication command' using errcode='23514';
  end case;

  if p_action<>'draft' then
    update private.c23_publications set state=x.state,version=x.version+1,consent_hash=x.consent_hash,
      approved_at=x.approved_at,rejected_at=x.rejected_at,challenged_at=x.challenged_at,first_rejector=x.first_rejector,
      reviewer=x.reviewer,assignment_generation=x.assignment_generation,assignment_deadline=x.assignment_deadline,
      accepted_at=x.accepted_at,inspected_version=x.inspected_version where id=x.id returning * into x;
  end if;
  insert into private.c23_events(publication_id,department,actor,recipient,workspace,request_id,command_hash,action,
    version,revision,finding_id,disclosure_hash,reason)
    values(x.id,scope,p_actor,target_actor,p_workspace,key_ref,prior_hash,p_action,x.version,x.revision,
      x.finding_id,d.fingerprint,reason_text);
  if p_action='inspect' then
    return jsonb_build_object('version',x.version,'revision',x.revision,'snapshot',private.c23_review_packet(x,d,f));
  end if;
  return jsonb_build_object('version',x.version,'revision',x.revision);
end
$$;

revoke all on function private.c23_enabled(),private.c23_grant(uuid,text),
  private.c23_finding_current(private.community_projects,private.c21_outcome_requests,private.c22_cases,private.c22_findings),
  private.c23_independent(private.community_projects,private.c21_outcome_requests,private.c23_publications,uuid),
  private.c23_assigned(private.community_projects,private.c21_outcome_requests,private.c23_publications),
  private.c23_safe_text(text,integer,integer),
  private.c23_snapshot(private.c21_outcome_requests,private.c22_findings,jsonb,boolean),private.c23_invalidate(),
  public.c23_public_results_for_client(uuid),public.c23_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c23_publication_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb) to service_role;
grant execute on function public.c23_public_results_for_client(uuid) to anon,authenticated;
