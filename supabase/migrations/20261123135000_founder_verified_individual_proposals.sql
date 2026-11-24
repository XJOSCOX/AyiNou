-- Trusted Founder provenance and current gold qualify for the member's own proposal only.
-- Project execution, sensitive assignments and polls continue to call project_identity_state.
create function private.project_proposal_identity_state(p_actor uuid,p_owner uuid)
returns text language sql stable set search_path='' as $$
  select case
    when state in ('required','pending') and p_actor=p_owner
      and (
        'founder'=any(private.personal_identity_provenance(p_actor))
        or (private.platform_founder(p_actor) and private.platform_admin(p_actor))
      )
      and not exists (
        select 1 from public.verification_records v
        where v.user_id=p_actor and v.verification_type='identity' and v.source='review'
          and (v.status='revoked' or v.publication_held_at is not null)
      ) then 'verified'
    else state
  end
  from (select private.project_identity_state(p_actor) as state) evaluated;
$$;

revoke all on function private.project_proposal_identity_state(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.project_visible(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.status='approved' and p.restricted_at is null and (auth.uid() is null or feed_data.member_allowed())
    and private.project_proposal_identity_state(p.submitted_by,p.owner_user_id)='verified'
    and private.project_owner_access(p,p.submitted_by,'submit') and feed_data.viewer_can_interact(p.submitted_by)
    and exists(select 1 from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
      and r.proposal->>'publishRequested'='true')
    and case
      when p.owner_user_id is not null then exists(select 1 from public.profiles m
        where m.user_id=p.owner_user_id and feed_data.followable_member(m))
      when p.organization_id is not null then private.project_organization_verified(p.organization_id)
      else private.project_community_public(p.community_id,p.submitted_at) end
    and private.project_community_public(p.association_id,p.submitted_at);
$$;

create or replace function public.project_submit_for_client(p_id uuid,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; proposal jsonb;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  -- Take the trust lock before the proposal and its owner scope, as identity can change during submission.
  perform pg_advisory_xact_lock(20261120,300);
  select * into item from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(item);
  if not private.project_owner_access(item,actor,'submit') then
    -- Only disclose a former owner-scope failure to a known participant or someone with current read access.
    if actor is not distinct from item.creator_id or actor is not distinct from item.submitted_by
      or private.project_owner_access(item,actor,'view_private') or private.project_owner_access(item,actor,'edit')
      or private.project_owner_access(item,actor,'propose') then
      if item.organization_id is not null then raise exception 'institutional authority unavailable' using errcode='PJP23';
      elsif item.community_id is not null or item.association_id is not null
        then raise exception 'community authority unavailable' using errcode='PJP24';
      else raise exception 'project owner unavailable' using errcode='PJP13'; end if;
    end if;
    raise exception 'project unavailable' using errcode='PJP04';
  end if;
  perform 1 from public.verification_records where user_id=actor and verification_type='identity' for share;
  if private.project_proposal_identity_state(actor,item.owner_user_id)<>'verified'
    then perform private.project_require_identity(actor); end if;
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('draft','changes_requested')
    then raise exception 'project changed or already submitted' using errcode='PJP09'; end if;
  select r.proposal into proposal from private.project_revisions r where r.project_id=p_id and r.revision=item.revision;
  if not private.project_content_valid(proposal,true) then raise exception 'incomplete proposal' using errcode='PJP03'; end if;
  if not feed_data.community_member(item.association_id,actor) then raise exception 'association unavailable' using errcode='PJP13'; end if;
  perform feed_data.consume_limit(actor,'project_write',20);
  update private.community_projects set version=version+1,status='submitted',submitted_by=actor,
    submitted_at=clock_timestamp(),reviewer_id=null,updated_at=clock_timestamp() where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action)
    values(p_id,item.version+1,item.revision,actor,actor,'submit');
  return item.version+1;
end;
$$;

create or replace function public.project_review_for_client(p_id uuid,p_version integer,p_action text,p_reason text,p_reviewer text)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.community_projects; target uuid; recipient uuid; next_status text;
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_action='approve' then perform pg_advisory_xact_lock(20261120,300); end if;
  select * into item from private.community_projects where id=p_id for update;
  if not found or not private.project_reviewer(item,actor) then raise exception 'review unavailable' using errcode='PJP14'; end if;
  perform private.project_lock_scope(item);
  if not private.project_reviewer(item,actor) then raise exception 'review unavailable' using errcode='PJP14'; end if;
  if item.restricted_at is not null or item.version is distinct from p_version or item.status not in ('submitted','under_review')
    then raise exception 'project changed' using errcode='PJP09'; end if;
  if not private.valid_trust_text(p_reason,10,1000) then raise exception 'written reason required' using errcode='PJP03'; end if;
  if p_action='assign' then
    target:=actor;
    if p_reviewer is not null then
      if not private.platform_admin(actor) then raise exception 'assignment outside authority' using errcode='42501'; end if;
      select user_id into target from public.profiles where username=p_reviewer;
    end if;
    if target is null or not private.project_reviewer(item,target) or not private.verified_totp(target)
      or (item.status='under_review' and private.project_reviewer(item,item.reviewer_id) and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if item.status='under_review' and target=item.reviewer_id then return item.version; end if;
    next_status:='under_review'; recipient:=target;
  elsif p_action='release' then
    if item.status<>'under_review' or (item.reviewer_id is distinct from actor and not private.platform_admin(actor))
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    next_status:='submitted';
  elsif p_action in ('approve','reject','request_changes') then
    if item.status<>'under_review' or item.reviewer_id is distinct from actor
      then raise exception 'review unavailable' using errcode='PJP14'; end if;
    if p_action='approve' and (not private.project_owner_access(item,item.submitted_by,'submit')
      or not feed_data.community_member(item.association_id,item.submitted_by))
      then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    if p_action='approve' then
      -- An independent reviewer sees only a generic accountability failure.
      perform 1 from public.verification_records where user_id=item.submitted_by and verification_type='identity' for share;
      if private.project_proposal_identity_state(item.submitted_by,item.owner_user_id)<>'verified'
        then raise exception 'submitting authority has ended' using errcode='PJP13'; end if;
    end if;
    next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
    recipient:=item.submitted_by;
  else raise exception 'invalid action' using errcode='22023';
  end if;
  perform feed_data.consume_limit(actor,'project_review',20);
  update private.community_projects set version=version+1,status=next_status,
    reviewer_id=target,approved_at=case when next_status='approved' then clock_timestamp() end,
    updated_at=clock_timestamp() where id=p_id;
  insert into private.project_events(project_id,version,revision,actor_id,recipient_id,action,reason)
    values(p_id,item.version+1,item.revision,actor,recipient,p_action,btrim(p_reason));
  return item.version+1;
end;
$$;

create or replace function public.project_detail_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.community_projects; actor uuid:=auth.uid(); operator boolean; assigned boolean; identity_state text;
begin
  select * into p from private.community_projects where id=p_id;
  if not found or not private.project_has_read_access(p) then raise exception 'project unavailable' using errcode='PJP04'; end if;
  operator:=feed_data.member_allowed() and (private.project_owner_access(p,actor,'view_private') or private.project_owner_access(p,actor,'edit')
    or private.project_owner_access(p,actor,'submit') or private.project_owner_access(p,actor,'propose'));
  assigned:=p.status='under_review' and p.reviewer_id=actor and private.project_reviewer(p,actor) and feed_data.recent_feed_totp();
  if operator and p.restricted_at is null and p.status in ('draft','changes_requested')
    and private.project_owner_access(p,actor,'submit') then
    identity_state:=private.project_proposal_identity_state(actor,p.owner_user_id);
  end if;
  return private.project_card(p)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=p.id and r.revision=p.revision),
    'version',case when operator or assigned then p.version end,
    'restricted',p.restricted_at is not null, 'canEdit',operator and p.restricted_at is null
      and p.status in ('draft','changes_requested') and private.project_owner_access(p,actor,'edit'),
    'canSubmit',coalesce(identity_state='verified',false),
    'submissionIdentity',identity_state,
    'publicationEligibility',case when operator and p.status='approved' and p.restricted_at is null then
      case when private.project_visible(p) then 'published'
        when not exists(select 1 from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
          and r.proposal->>'publishRequested'='true') then 'private'
        when p.organization_id is not null and exists(select 1 from private.organizations o
          where o.id=p.organization_id and o.status='active' and o.verification_status='unverified')
          then 'pending_institution_verification'
        else 'unavailable' end
      end,
    'canOpenWork',feed_data.member_allowed() and private.project_executable(p)
      and private.project_execution_actor(p,actor) and (
        private.project_execution_role(p,actor) is not null or (private.project_visible(p) and exists(
          select 1 from private.project_execution where project_id=p.id and status='active'))),
    'canDecide',coalesce(assigned,false),
    'canReport',private.project_visible(p) and feed_data.member_allowed() and p.creator_id is distinct from actor and p.submitted_by is distinct from actor,
    'history',case when operator or assigned then coalesce((select jsonb_agg(jsonb_build_object(
      'action',e.action,'revision',e.revision,'reason',e.reason,'createdAt',e.created_at) order by e.version desc)
      from private.project_events e where e.project_id=p.id and e.action in ('submit','request_changes','approve','reject','restrict')),'[]') else '[]'::jsonb end
  );
end;
$$;

create or replace function public.project_options_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'submissionIdentity',private.project_identity_state(actor),
    'individualSubmissionIdentity',private.project_proposal_identity_state(actor,actor),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'handle',o.handle) order by o.name,o.id)
      from private.organizations o where o.status='active' and private.organization_has_permission(actor,o.id,'projects.propose')),'[]'),
    'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',coalesce(c.name,d.name),'handle',c.slug,
      'canOwn',private.project_community_manager(c.id,actor)) order by coalesce(c.name,d.name),c.id)
      from feed_data.communities c left join public.departments d on d.code=c.department_code
      join feed_data.community_memberships m on m.community_id=c.id and m.user_id=actor),'[]'),
    'canReview',feed_data.moderation_role() or exists(select 1 from feed_data.community_staff s
      where s.user_id=actor and s.role='moderator' and feed_data.community_member(s.community_id,actor)),
    'canModerate',feed_data.moderation_role(),'canAssignOthers',private.platform_admin(actor));
end;
$$;

-- An independent request may coexist with a prior Founder-direct approval.
-- Retain the historical decision, and keep one open request or independent approval per kind.
alter table private.verification_applications
  add column identity_review_route text check (
    identity_review_route is null or (
      kind='identity' and organization_id is null and identity_review_route in ('founder_direct','independent')
    )
  );

update private.verification_applications a
  set identity_review_route='founder_direct'
  where a.kind='identity' and a.organization_id is null and exists (
    select 1 from private.institution_audit e
    where e.subject_id=a.id and e.event='founder_identity_approved'
  );

drop index private.verification_person_open;
create unique index verification_person_open on private.verification_applications(applicant_id,kind)
  where organization_id is null and (
    status='pending' or (status='approved' and identity_review_route is distinct from 'founder_direct')
  );
create unique index verification_person_founder_direct_approved on private.verification_applications(applicant_id,kind)
  where organization_id is null and status='approved' and identity_review_route='founder_direct';

-- Only an active Founder-direct blue record may be replaced by a separate review.
-- Active independent records, historic ordinary approvals and held credentials retain their existing request rules.
create function private.can_upgrade_founder_identity(p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select 'founder'=any(private.personal_identity_provenance(p_actor))
    and exists (
      select 1 from public.verification_records v
      join private.verification_applications a on a.id=v.review_application_id
      where v.user_id=p_actor and v.verification_type='identity' and v.status='verified'
        and v.source='review' and v.publication_held_at is null
        and a.applicant_id=p_actor and a.kind='identity' and a.organization_id is null
        and a.status='approved' and a.identity_review_route='founder_direct'
    )
    and not exists (
      select 1 from private.verification_applications a where a.applicant_id=p_actor
        and a.kind='identity' and a.organization_id is null and a.status='approved'
        and a.identity_review_route is distinct from 'founder_direct'
    );
$$;
revoke all on function private.can_upgrade_founder_identity(uuid) from public,anon,authenticated,service_role;

create or replace function private.personal_verification_request_state(p_actor uuid,p_kind text)
returns text language sql stable set search_path='' as $$
  select case
    when (
      p_kind=any(private.reviewed_personal_claims(p_actor))
      or exists (
        select 1 from private.verification_applications a
        where a.applicant_id=p_actor and a.organization_id is null and a.kind=p_kind and a.status='approved'
      )
    ) and not (
      p_kind='identity' and private.can_upgrade_founder_identity(p_actor)
    ) then 'already_verified'
    when exists (
      select 1 from private.verification_applications a
      where a.applicant_id=p_actor and a.organization_id is null and a.status='pending'
    ) then 'pending'
    else 'available'
  end
$$;

create or replace function private.verification_submit_for_api(p_actor uuid,p_org uuid,p_kind text,p_evidence text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text;
  membership uuid;
  application uuid;
  identity_route text;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('identity','notable_person','organization','government','representative','claim')
    or coalesce(cardinality(p_evidence),0) not between 1 and 3
    or (p_kind='notable_person' and (select count(distinct reference) from unnest(p_evidence) reference)<2)
  then raise exception 'invalid application' using errcode='23514'; end if;
  perform 1 from auth.users where id=p_actor for no key update;
  if (select count(*) from private.verification_applications where applicant_id=p_actor and created_at>now()-interval '1 day')>=5
  then raise exception 'application limit' using errcode='54000'; end if;
  if p_kind in ('identity','notable_person') then
    if p_org is not null then raise exception 'invalid subject' using errcode='23514'; end if;
    if exists (select 1 from public.verification_records where user_id=p_actor and verification_type=p_kind and status='verified' and source='review' and publication_held_at is null)
      and not (p_kind='identity' and private.can_upgrade_founder_identity(p_actor))
    then raise exception 'already verified' using errcode='55000'; end if;
    if p_kind='identity' and 'founder'=any(private.personal_identity_provenance(p_actor)) then
      identity_route:='independent';
    end if;
  else
    select * into o from private.organizations where id=p_org and status='active' for no key update;
    actor_role := private.institution_role(p_actor,p_org);
    if o.id is null then raise exception 'access denied' using errcode='42501'; end if;
    if p_kind='claim' then
      if actor_role is not null or o.verification_status='verified'
      then raise exception 'claim unavailable' using errcode='55000'; end if;
      if (select count(*) from private.verification_applications where organization_id=p_org and kind='claim' and status='pending')>=10
      then raise exception 'claim limit' using errcode='54000'; end if;
    elsif p_kind='representative' then
      if actor_role is null then raise exception 'access denied' using errcode='42501'; end if;
      select id into membership from private.organization_memberships where organization_id=p_org and user_id=p_actor and revoked_at is null;
    else
      if actor_role is distinct from 'owner' then raise exception 'access denied' using errcode='42501'; end if;
      if (p_kind='government') <> (o.kind in ('municipality','ministry','embassy','government_agency'))
      then raise exception 'invalid subject' using errcode='23514'; end if;
    end if;
  end if;
  if p_org is not null and (not private.valid_public_references(p_evidence) or private.institution_reference_count(p_evidence)<2)
  then raise exception 'insufficient evidence' using errcode='PVT11'; end if;
  insert into private.verification_applications(applicant_id,organization_id,membership_id,organization_subject,kind,
    reviewed_institution_snapshot,identity_review_route)
    values(p_actor,p_org,membership,case when p_kind='claim' then private.institution_subject(o) end,p_kind,
      case when p_org is not null then private.institution_review_snapshot(o) end,identity_route)
    returning id into application;
  insert into private.verification_evidence(application_id,url) select application,url from unnest(p_evidence) as evidence(url);
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values(p_actor,p_org,application,'application_submitted');
  return application;
end;
$$;

create or replace function private.founder_direct_verification_kind(p_actor uuid,a private.verification_applications)
returns text language sql stable set search_path='' as $$
  select case
    when a.kind='identity' and a.organization_id is null and a.identity_review_route is distinct from 'independent'
      and not private.institution_conflicted(p_actor,a)
      then 'identity'
    when private.founder_ordinary_organization_application(a) then 'organization'
    when a.kind='representative' and exists (
      select 1 from private.organizations o join private.organization_memberships m on m.organization_id=o.id
      where o.id=a.organization_id and o.status='active' and not private.organization_setup_government(o.kind)
        and m.id=a.membership_id and m.user_id=a.applicant_id and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>now())
    ) then 'representative'
  end
$$;

create or replace function public.founder_blue_verification_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_workspace uuid,p_id uuid,p_expected integer,p_request uuid,p_reason text,p_no_conflict boolean,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.verification_applications;
  prior private.institution_audit;
  org private.organizations;
  org_id uuid;
  direct_kind text;
  marked_at timestamptz;
  deciding boolean := p_request is not null;
  outcome text := case when p_decision='approve' then 'approved' else 'rejected' end;
  audit_event text;
begin
  if deciding then
    perform pg_advisory_xact_lock(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp_at,'read',null,p_workspace,'admin',null,null) is null
    then return null; end if;
  if not deciding then
    select * into a from private.verification_applications
      where id=p_id and status='pending';
    if not found or not private.institution_actor(a.applicant_id)
      or private.founder_direct_verification_kind(p_actor,a) is null
      then return null; end if;
    return jsonb_build_object('id',a.id,'revision',a.revision,'evidence',coalesce((
      select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id
    ),'[]'::jsonb));
  end if;
  if p_no_conflict is distinct from true or coalesce(char_length(btrim(p_reason)),0) not between 10 and 1000
    or p_expected is null or not coalesce(p_decision in ('approve','reject'),false) then raise exception 'invalid decision' using errcode='23514'; end if;

  select organization_id into org_id from private.verification_applications where id=p_id;
  if org_id is not null then select * into org from private.organizations where id=org_id for no key update; end if;
  select * into a from private.verification_applications where id=p_id for no key update;
  if not found then return null; end if;
  direct_kind:=private.founder_direct_verification_kind(p_actor,a);
  if direct_kind is null then return null; end if;
  audit_event:='founder_' || direct_kind || '_' || outcome;
  select * into prior from private.institution_audit where actor_id=p_actor and request_id=p_request
    and event in ('founder_identity_approved','founder_identity_rejected',
      'founder_organization_approved','founder_organization_rejected',
      'founder_representative_approved','founder_representative_rejected');
  if found then
    if prior.subject_id is distinct from p_id or prior.case_version is distinct from p_expected
      or prior.decision_reason is distinct from btrim(p_reason) or prior.event is distinct from audit_event
      then raise exception 'request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('id',p_id,'status',outcome,'auditId',prior.id);
  end if;
  if a.status<>'pending' or a.revision<>p_expected or not private.institution_actor(a.applicant_id)
    or not exists(select from private.verification_evidence where application_id=a.id)
    then raise exception 'application unavailable' using errcode='55000'; end if;
  if exists (select from private.platform_claim_approval_holds h
      where h.application_id=a.id and h.lifted_at is null and h.expires_at>clock_timestamp())
    or (direct_kind='identity' and exists (select from public.verification_records v
      where v.user_id=a.applicant_id and v.verification_type='identity'
        and (v.publication_held_at is not null or v.status='verified')))
    then raise exception 'identity decision unavailable' using errcode='O5003'; end if;

  if direct_kind in ('organization','representative') then
    if not private.verification_policy_flag('founderBlue') then
      raise exception 'Founder verification paused' using errcode='RV250';
    end if;
    if org.id is distinct from a.organization_id or org.status<>'active'
      or a.reviewed_institution_snapshot is distinct from private.institution_review_snapshot(org)
      or (direct_kind='organization' and (org.verification_status='verified'
        or private.institution_role(a.applicant_id,org.id) is distinct from 'owner'))
      then raise exception 'organization changed' using errcode='55000'; end if;
    if private.institution_reference_count(array(select e.url from private.verification_evidence e where e.application_id=a.id))<2
      then raise exception 'insufficient evidence' using errcode='PVT11'; end if;
    if direct_kind='representative' then
      perform 1 from private.organization_memberships m where m.id=a.membership_id
        and m.organization_id=org.id and m.user_id=a.applicant_id and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>clock_timestamp()) and m.verified_at is null
        for no key update;
      if not found then raise exception 'representative grant changed' using errcode='55000'; end if;
    end if;
    marked_at:=clock_timestamp();
    if p_decision='approve' then
      if direct_kind='representative' then
        update private.organization_memberships set verified_at=marked_at where id=a.membership_id;
      else
        update private.organizations set verification_status='verified',updated_at=marked_at where id=org.id;
      end if;
    end if;
    update private.verification_applications set status=outcome,decided_at=marked_at where id=a.id;
    insert into private.institution_audit(actor_id,organization_id,subject_id,event,occurred_at,
      request_id,case_version,decision_reason,decision_policy_version)
      values(p_actor,org.id,a.id,audit_event,marked_at,p_request,p_expected,btrim(p_reason),1)
      returning * into prior;
    return jsonb_build_object('id',a.id,'status',outcome,'auditId',prior.id);
  end if;

  marked_at:=clock_timestamp();
  insert into private.verification_reviews(application_id,reviewer_id,decision,rationale,created_at)
    values(a.id,p_actor,p_decision,btrim(p_reason),marked_at)
    on conflict(application_id,reviewer_id) where decision='approve' do nothing;
  if p_decision='approve' then
    insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at,review_application_id)
      values(a.applicant_id,'identity','verified',p_actor,marked_at,a.id)
      on conflict(user_id,verification_type) do update
        set status=excluded.status,reviewed_by=excluded.reviewed_by,verified_at=excluded.verified_at,
            review_application_id=excluded.review_application_id;
  end if;
  update private.verification_applications set status=outcome,decided_at=marked_at,
    identity_review_route=case when p_decision='approve' then 'founder_direct' else identity_review_route end
    where id=a.id;
  insert into private.institution_audit(actor_id,subject_id,event,occurred_at,request_id,case_version,decision_reason,decision_policy_version)
    values(p_actor,a.id,audit_event,marked_at,p_request,p_expected,btrim(p_reason),1) returning * into prior;
  return jsonb_build_object('id',a.id,'status',outcome,'auditId',prior.id);
end;
$$;

create or replace function private.resolve_founder_supersession()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  a private.verification_applications;
  outcome text;
begin
  select x.* into strict c from private.founder_identity_cases x join private.founder_identity_grants g on g.case_id=x.id
    where x.id=new.case_id and g.issuer_id=new.actor_id and x.version=new.case_version and x.state='granted';
  select * into a from private.verification_applications
    where applicant_id=c.subject_id and kind='identity' and organization_id is null
      and identity_review_route is distinct from 'independent'
      and status in ('pending','approved','rejected','revoked')
    order by (status='pending') desc,created_at desc,id limit 1 for no key update;
  outcome := private.founder_application_resolution(a,c.subject_id);
  if outcome='superseded_by_founder_verification' then
    update private.verification_applications set status='closed',decided_at=new.occurred_at,
      closed_by_founder_event_id=new.id where id=a.id;
  end if;
  insert into private.founder_supersession_events(founder_event_id,event,application_id,application_revision,application_status,reason,occurred_at)
    values(new.id,'grant_initiated',null,null,null,'founder_confirmed',
       (select issued_at from private.founder_identity_grants where case_id=c.id)),
      (new.id,'grant_committed',null,null,null,'founder_confirmed',new.occurred_at),
      (new.id,'application_resolved',a.id,a.revision,a.status,outcome,new.occurred_at);
  return new;
end;
$$;
create or replace function public.verification_workspace_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'applications',public.verification_own_for_api(p_actor),
    'independentIdentityReview','founder'=any(private.personal_identity_provenance(p_actor)),
    'personalRequests',jsonb_build_object(
      'identity',private.personal_verification_request_state(p_actor,'identity'),
      'notable_person',private.personal_verification_request_state(p_actor,'notable_person')
    ),
    'institutionRequests',coalesce((
      select jsonb_object_agg(o.id,jsonb_build_object(
        'institution',case
          when o.verification_status='verified' or a.status='approved' then 'already_verified'
          when a.status='pending' then 'pending'
          else 'available'
        end,
        'representative',case
          when r.status='approved' then 'already_verified'
          when r.status='pending' then 'pending'
          else 'available'
        end
      ))
      from private.organization_memberships m
      join private.organizations o on o.id=m.organization_id and o.status='active'
      left join private.verification_applications a on a.organization_id=o.id
        and a.kind in ('organization','government') and a.status in ('pending','approved')
      left join private.verification_applications r on r.membership_id=m.id
        and r.kind='representative' and r.status in ('pending','approved')
      where m.user_id=p_actor and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
    ),'{}'::jsonb)
  )
$$;
-- An independent upgrade must honor an existing identity hold as well as application holds.
create or replace function public.verification_decide_for_api(p_actor uuid,p_application uuid,p_decision text,p_rationale text,p_conflict_free boolean)
returns text language plpgsql security definer set search_path='' as $$
declare a private.verification_applications;
begin
  perform pg_advisory_xact_lock(20261120,300);
  if p_decision='approve' and (
    exists(select 1 from private.platform_claim_approval_holds h
      where h.application_id=p_application and h.lifted_at is null and h.expires_at>clock_timestamp())
    or exists (
      select 1 from private.verification_applications item
      join public.verification_records v on v.user_id=item.applicant_id and v.verification_type='identity'
      where item.id=p_application and item.identity_review_route='independent'
        and v.publication_held_at is not null
    )
  ) then
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
