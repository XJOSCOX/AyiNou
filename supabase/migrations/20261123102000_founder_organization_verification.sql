-- Direct organization decisions carry distinct provenance and never count as reviewer votes.
alter table private.institution_audit drop constraint institution_audit_check,
  add constraint institution_audit_decision_reason_check check (
    decision_reason is null or (event in ('founder_identity_approved','founder_identity_rejected',
      'founder_organization_approved','founder_organization_rejected')
      and char_length(btrim(decision_reason)) between 10 and 1000));
create unique index institution_founder_organization_once on private.institution_audit(subject_id)
  where event in ('founder_organization_approved','founder_organization_rejected');
create unique index institution_founder_organization_request on private.institution_audit(actor_id,request_id)
  where event in ('founder_organization_approved','founder_organization_rejected');

create function private.founder_ordinary_organization_application(a private.verification_applications)
returns boolean language sql stable set search_path='' as $$
  select a.kind='organization' and exists (
    select 1 from private.organizations o where o.id=a.organization_id
      and o.status='active' and not private.organization_setup_government(o.kind)
  )
$$;
revoke all on function private.founder_ordinary_organization_application(private.verification_applications)
  from public,anon,authenticated,service_role;

create or replace function public.verification_assignment_queue_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',item.id,'kind',item.kind,'status',item.status,
    'canRelease',not private.institution_conflicted(actor,item),'applicantUsername',p.username,'organizationName',o.name,'createdAt',item.created_at,
    'assigned',coalesce((select jsonb_agg(jsonb_build_object('handle',u.username,'eligible',
      private.institution_reviewer(w.reviewer_id) and not private.institution_conflicted(w.reviewer_id,item))
      order by w.assigned_at) from private.verification_review_work w join public.profiles u on u.user_id=w.reviewer_id
      where w.application_id=item.id),'[]'),
    'eligibleReviewers',(select count(*) from private.verification_reviewers r
      where private.institution_reviewer(r.user_id) and not private.institution_conflicted(r.user_id,item)
    )) order by item.created_at,item.id) from private.verification_applications item join (
      select a.id from private.verification_applications a where a.status='pending' and (not private.institution_conflicted(actor,a) or (private.platform_founder(actor) and private.founder_ordinary_organization_application(a)))
      order by a.created_at,a.id limit 40
    ) candidate on item.id=candidate.id left join public.profiles p on p.user_id=item.applicant_id
    left join private.organizations o on o.id=item.organization_id),'[]');
end;
$$;

create or replace function public.assign_verification_reviewer_for_client(p_application uuid,p_handle text,p_assign boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item private.verification_applications; reviewer uuid; actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_assign is null or not feed_data.group_reason(p_reason) then raise exception 'invalid assignment' using errcode='22023'; end if;
  select * into item from private.verification_applications where id=p_application and status in ('pending','approved') for update;
  select user_id into reviewer from public.profiles where username=p_handle;
  if item.id is null or (private.institution_conflicted(actor,item) and not (p_assign and item.status='pending'
      and private.platform_founder(actor) and private.founder_ordinary_organization_application(item)))
    or reviewer is null or not private.institution_reviewer(reviewer) or private.institution_conflicted(reviewer,item)
    then raise exception 'review assignment unavailable' using errcode='PVT04'; end if;
  perform feed_data.consume_limit(actor,'appeal_review',30);
  if p_assign then
    insert into private.verification_review_work(application_id,reviewer_id) values(item.id,reviewer) on conflict do nothing;
  else
    delete from private.verification_review_work where application_id=item.id and reviewer_id=reviewer;
  end if;
  if found then
    insert into private.verification_assignment_audit(application_id,actor_id,reviewer_id,assigned,reason)
      values(item.id,actor,reviewer,p_assign,btrim(p_reason));
  end if;
end;
$$;

create or replace function public.founder_blue_verification_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_workspace uuid,p_id uuid,p_expected integer,p_request uuid,p_reason text,p_no_conflict boolean,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.verification_applications;
  prior private.institution_audit;
  org private.organizations;
  org_id uuid;
  organization_case boolean;
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
    if not found or not private.institution_actor(a.applicant_id) or not (
      (a.kind='identity' and a.organization_id is null and not private.institution_conflicted(p_actor,a))
      or private.founder_ordinary_organization_application(a))
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
  organization_case:=private.founder_ordinary_organization_application(a);
  if not organization_case and not (a.kind='identity' and a.organization_id is null
      and not private.institution_conflicted(p_actor,a)) then return null; end if;
  audit_event:=case when organization_case then 'founder_organization_' else 'founder_identity_' end || outcome;
  select * into prior from private.institution_audit where actor_id=p_actor and request_id=p_request
    and event in ('founder_identity_approved','founder_identity_rejected',
      'founder_organization_approved','founder_organization_rejected');
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
    or (not organization_case and exists (select from public.verification_records v
      where v.user_id=a.applicant_id and v.verification_type='identity'
        and (v.publication_held_at is not null or v.status='verified')))
    then raise exception 'identity decision unavailable' using errcode='O5003'; end if;

  if organization_case then
    if not private.verification_policy_flag('founderBlue') then
      raise exception 'Founder verification paused' using errcode='RV250';
    end if;
    if org.id is distinct from a.organization_id or org.status<>'active' or org.verification_status='verified'
      or a.reviewed_institution_snapshot is distinct from private.institution_review_snapshot(org)
      or private.institution_role(a.applicant_id,org.id) is distinct from 'owner'
      then raise exception 'organization changed' using errcode='55000'; end if;
    if private.institution_reference_count(array(select e.url from private.verification_evidence e where e.application_id=a.id))<2
      then raise exception 'insufficient evidence' using errcode='PVT11'; end if;
    marked_at:=clock_timestamp();
    if p_decision='approve' then
      update private.organizations set verification_status='verified',updated_at=marked_at where id=org.id;
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
  update private.verification_applications set status=outcome,decided_at=marked_at where id=a.id;
  insert into private.institution_audit(actor_id,subject_id,event,occurred_at,request_id,case_version,decision_reason,decision_policy_version)
    values(p_actor,a.id,audit_event,marked_at,p_request,p_expected,btrim(p_reason),1) returning * into prior;
  return jsonb_build_object('id',a.id,'status',outcome,'auditId',prior.id);
end;
$$;

create or replace function private.project_organization_verified(p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.organizations o where o.id=p_org
    and o.status='active' and o.verification_status='verified'
    and exists(select 1 from private.verification_applications a
      where a.organization_id=o.id and a.kind in ('organization','government') and a.status='approved'
      and not exists(select 1 from private.institution_audit e
        where e.subject_id=a.id and e.event='founder_organization_approved'))
    and exists(select 1 from private.organization_memberships m
      where m.organization_id=o.id and m.role='owner' and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>now()) and feed_data.author_active(m.user_id)));
$$;

create or replace view private.a1a_audit_source as
select 'platform_admin'::text collate "C" as source, 'platform'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'account'::text as resource_type, subject_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case when event='role_revoked' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.platform_admin_audit
union all
select 'governance'::text collate "C" as source, 'governance'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, action as event_type,
  actor_id as actor_ref, 'proposal'::text as resource_type, resource_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, schema_version as source_version,
  request_id as request_ref, (case action when 'approve' then 'approved' when 'withdraw' then 'cancelled' else 'recorded' end)::text as outcome, (case when action='propose' and outcome->>'authorizationMode'='founder_direct' then 'founder' end)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.platform_governance_events where scope='proposal' and action in ('propose','approve','withdraw','accept','activate','execute')
union all
select 'session_policy'::text collate "C" as source, 'security'::text as category, id::text collate "C" as source_id,
  null::uuid as uuid_id, occurred_at as occurred_at, event as event_type,
  null::uuid as actor_ref, 'session_policy'::text as resource_type, null::uuid as resource_ref,
  null::uuid as organization_ref, user_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case event when 'expired' then 'expired' when 'revocation' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.s2a_session_events
union all
select 'session_security'::text collate "C" as source, 'security'::text as category, id::text collate "C" as source_id,
  id as uuid_id, occurred_at as occurred_at, action as event_type,
  actor_id as actor_ref, case when action in ('session_revoked','other_sessions_revoked') then 'session_policy' else 'private_workflow' end as resource_type, null::uuid as resource_ref,
  null::uuid as organization_ref, actor_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case action when 'workflow_cancelled' then 'cancelled' when 'session_revoked' then 'revoked' when 'other_sessions_revoked' then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.s2b_security_events
union all
select 'username'::text collate "C" as source, 'identity'::text as category, id::text collate "C" as source_id,
  null::uuid as uuid_id, occurred_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'username'::text as resource_type, subject_id as resource_ref,
  null::uuid as organization_ref, subject_id as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  case when old_username is not null then jsonb_build_object('username',old_username) end as previous_state, case when new_username is not null then jsonb_build_object('username',new_username) end as new_state
from private.username_events where event in ('assigned','changed')
union all
select 'organization_role'::text collate "C" as source, 'organization'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, event as event_type,
  actor_id as actor_ref, 'organization_role'::text as resource_type, role_id as resource_ref,
  organization_id as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case when event in ('revoked','role_deactivated','relationship_ended','ownership_ended') then 'revoked' else 'recorded' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.organization_role_audit
union all
select 'verification'::text collate "C" as source, 'verification'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, decision as event_type,
  reviewer_id as actor_ref, 'verification_case'::text as resource_type, application_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, (case decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end)::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from private.verification_reviews r
where not exists (select from private.institution_audit e
  where e.subject_id=r.application_id and e.actor_id=r.reviewer_id and e.occurred_at=r.created_at
    and e.event in ('founder_identity_approved','founder_identity_rejected'))
union all
select 'verification'::text collate "C", 'verification'::text, e.id::text collate "C",
  e.id, e.occurred_at, case when e.event in ('founder_identity_approved','founder_organization_approved') then 'founder_direct_regular_approval' else 'founder_direct_regular_rejection' end,
  e.actor_id, 'verification_case'::text, e.subject_id, e.organization_id, null::uuid, e.decision_policy_version,
  e.request_id, case when e.event in ('founder_identity_approved','founder_organization_approved') then 'approved' else 'rejected' end, 'founder'::text,
  jsonb_build_object('status','pending'),
  jsonb_build_object('status',case when e.event in ('founder_identity_approved','founder_organization_approved') then 'approved' else 'rejected' end)
from private.institution_audit e where e.event in ('founder_identity_approved','founder_identity_rejected',
  'founder_organization_approved','founder_organization_rejected')
union all
select 'post_moderation'::text collate "C" as source, 'moderation'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, action as event_type,
  null::uuid as actor_ref, 'post'::text as resource_type, post_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from feed_data.post_moderation_actions a
where exists(select from feed_data.posts p where p.id=a.post_id and p.community_id is null)
union all
select 'comment_moderation'::text collate "C" as source, 'moderation'::text as category, id::text collate "C" as source_id,
  id as uuid_id, created_at as occurred_at, action as event_type,
  null::uuid as actor_ref, 'comment'::text as resource_type, comment_id as resource_ref,
  null::uuid as organization_ref, null::uuid as owner_ref, null::integer as source_version,
  null::uuid as request_ref, ('recorded')::text as outcome, (null)::text as authority,
  null::jsonb as previous_state, null::jsonb as new_state
from feed_data.comment_moderation_actions a
where exists(select from feed_data.comments c join feed_data.posts p on p.id=c.post_id
  where c.id=a.comment_id and p.community_id is null);
