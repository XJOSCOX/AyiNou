-- Serialize the ready transition with account and feature enforcement decisions.
-- Lease cleanup itself must remain available after expiration or suspension.
create or replace function public.finish_post_upload_for_api(p_id uuid,p_lease uuid,p_ready boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_ready then
    perform pg_advisory_xact_lock(20261120,300);
  end if;
  update feed_data.post_attachments a
    set state=case when p_ready then 'ready' else a.state end,lease=null,upload_until=null
    where a.id=p_id and a.lease=p_lease and a.state='uploading'
      and (not coalesce(p_ready,false) or
        (a.upload_until>clock_timestamp() and a.expires_at>clock_timestamp() and feed_data.author_active(a.author_id)));
  return found;
end
$$;

-- Account decision revisions above 1 are actual policy change references. Revision 1
-- also labels pre-policy rows by default, so preserve that historical ambiguity.
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
  e.id, e.occurred_at, case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'founder_direct_regular_approval' else 'founder_direct_regular_rejection' end,
  e.actor_id, 'verification_case'::text, e.subject_id, e.organization_id, null::uuid, e.decision_policy_version,
  e.request_id, case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'approved' else 'rejected' end, 'founder'::text,
  jsonb_build_object('status','pending'),
  jsonb_build_object('status',case when e.event in ('founder_identity_approved','founder_organization_approved','founder_representative_approved') then 'approved' else 'rejected' end)
from private.institution_audit e where e.event in ('founder_identity_approved','founder_identity_rejected',
  'founder_organization_approved','founder_organization_rejected',
  'founder_representative_approved','founder_representative_rejected')
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
  where c.id=a.comment_id and p.community_id is null)
union all
select 'platform_admin'::text collate "C",'platform',h.id::text collate "C",h.id,h.occurred_at,h.action,
  h.actor_id,'account',h.subject_id,null,null,decision.policy_revision,h.request_id,'recorded',
  case when h.authority='founder' then h.authority end,
  h.before_state,h.after_state-'legacy' || jsonb_build_object('caseReference',h.case_id)
from private.m22_account_history h
left join private.m22_account_events decision on decision.id=h.id and decision.policy_revision>1
union all
select 'platform_admin'::text collate "C",'moderation',h.id::text collate "C",h.id,h.happened_at,h.event,
  h.actor_id,'account',h.subject_id,null,null,h.policy_version,h.request_id,'recorded',
  case when h.authority='founder' then 'founder' end,null::jsonb,
  jsonb_build_object('caseReference',h.case_id,'capability',h.capability,'scope',h.scope_kind,'scopeId',h.scope_id)
from private.m23_history h
union all
select 'event_moderation' collate "C",'moderation',a.id::text collate "C",a.id,a.occurred_at,a.action,
  a.actor_id,'event',a.event_id,null,null,a.version,null,'recorded',null,null,
  jsonb_build_object('reportReference',a.report_id)
from feed_data.event_audit a where a.report_id is not null
union all
select 'enforcement_appeal' collate "C",'moderation',h.id::text collate "C",h.id,h.occurred_at,'appeal_'||h.action,
  h.actor_id,'appeal',h.case_id,null,null,h.revision,h.request_id,'recorded',null,null,
  jsonb_build_object('caseReference',h.case_id,'domain',c.domain,'decisionReference',c.decision_id,'enforcementChanged',h.details->'reversed')
from private.m24_events h join private.m24_cases c on c.id=h.case_id
union all
select 'event_moderation' collate "C",'moderation',h.id::text collate "C",h.id,h.occurred_at,h.action,
  h.actor_id,'event',(h.details->>'eventReference')::uuid,null,null,null,null,'recorded',null,null,
  jsonb_build_object('reportReference',h.details->>'reportReference')
from private.m24_events h where h.action='event_conflict_denied';
