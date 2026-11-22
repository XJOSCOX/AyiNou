-- Read projections only. Native workspaces and event writers remain unchanged.
create index a1a_platform_time on private.platform_admin_audit(occurred_at desc,(id::text) collate "C" desc);
create index a1a_platform_actor_time on private.platform_admin_audit(actor_id,occurred_at desc,(id::text) collate "C" desc);
create index a1a_platform_subject_time on private.platform_admin_audit(subject_id,occurred_at desc,(id::text) collate "C" desc);
create index a1a_governance_time on private.platform_governance_events(occurred_at desc,(id::text) collate "C" desc)
  where scope='proposal';
create index a1a_session_policy_owner_time on private.s2a_session_events(user_id,occurred_at desc,(id::text) collate "C" desc);
create index a1a_session_security_owner_time on private.s2b_security_events(actor_id,occurred_at desc,(id::text) collate "C" desc);
create index a1a_username_owner_time on private.username_events(subject_id,occurred_at desc,(id::text) collate "C" desc)
  where event in ('assigned','changed');
create index a1a_org_roles_time on private.organization_role_audit(organization_id,created_at desc,(id::text) collate "C" desc);
create index a1a_verification_time on private.verification_reviews(application_id,created_at desc,(id::text) collate "C" desc);
create index a1a_post_actions_time on feed_data.post_moderation_actions(created_at desc,(id::text) collate "C" desc);
create index a1a_comment_actions_time on feed_data.comment_moderation_actions(created_at desc,(id::text) collate "C" desc);

create view private.a1a_audit_source as
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
from private.verification_reviews
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
revoke all on private.a1a_audit_source from public,anon,authenticated,service_role;

create function public.a1a_audit_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_scope text,p_scope_id uuid,p_workspace uuid,p_scope_type text,
  p_category text,p_event_type text,p_resource_type text,p_resource uuid,p_filter_actor uuid,p_outcome text,
  p_from timestamptz,p_to timestamptz,p_high timestamptz,p_before_at timestamptz,p_before_source text,p_before_id text,
  p_take integer,p_reference text)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan'
set statement_timeout='3s' as $$
declare
  sources text[];
  founder boolean;
  high_mark timestamptz:=coalesce(p_high,statement_timestamp());
  until_at timestamptz:=coalesce(p_to,high_mark);
  since_at timestamptz:=coalesce(p_from,until_at-interval '30 days');
  reference_source text;
  reference_id uuid;
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false) then return null; end if;
  case p_scope
    when 'platform' then
      if not private.platform_admin(p_actor)
        or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
        then return null; end if;
      founder:=private.platform_founder(p_actor);
      sources:=array['platform_admin','post_moderation','comment_moderation'];
      if founder then sources:=array_append(sources,'governance'); end if;
    when 'member' then
      sources:=array['session_policy','session_security','username'];
    when 'organization' then
      if not coalesce(private.institution_role(p_actor,p_scope_id) in ('owner','administrator'),false)
        or not exists(select from private.organizations where id=p_scope_id and status='active')
        then return null; end if;
      sources:=array['organization_role'];
    when 'verification' then
      if public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'review',null,null) is null
        or not exists(select from private.verification_applications as a where a.id=p_scope_id
          and not private.institution_conflicted(p_actor,a)
          and exists(select from private.verification_review_work w
            where w.application_id=a.id and w.reviewer_id=p_actor))
        then return null; end if;
      sources:=array['verification'];
    when 'moderation' then
      if not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
        or not (private.platform_admin(p_actor) or exists(select from public.role_assignments
          where user_id=p_actor and role='moderator'))
        or p_scope_id is null or p_scope_type is null or p_scope_type not in ('post','comment') then return null; end if;
      sources:=array[p_scope_type||'_moderation'];
    else return null;
  end case;

  if p_reference is not null then
    if p_scope<>'platform' or p_reference !~ '^[a-z_]{1,32}:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then return null; end if;
    reference_source:=split_part(p_reference,':',1);
    if not (reference_source=any(sources)) then return null; end if;
    reference_id:=split_part(p_reference,':',2)::uuid;
    sources:=array[reference_source];
  elsif p_take is null or p_take not between 1 and 50 or not isfinite(since_at) or not isfinite(until_at)
    or not isfinite(high_mark) or since_at>=until_at or until_at-since_at>interval '90 days'
    or (p_filter_actor is not null and p_scope<>'platform')
    or (p_before_at is not null and (p_high is null or p_before_id is null or p_before_source is null))
    then raise exception 'invalid audit filters' using errcode='22023';
  end if;

  return (
    select jsonb_build_object('high',high_mark,'events',coalesce(jsonb_agg(
      jsonb_build_object(
        'reference',e.source||':'||e.source_id,'source',e.source,'sourceEventId',e.source_id,
        'version',1,'sourceVersion',e.source_version,'category',e.category,'eventType',e.event_type,
        'occurredAt',e.occurred_at,
        'actorRef',case when p_scope='platform' or e.actor_ref=p_actor then e.actor_ref end,
        'resourceType',e.resource_type,'resourceRef',e.resource_ref,'organizationRef',e.organization_ref,
        'outcome',e.outcome,'reasonCode',null,'previousState',e.previous_state,'newState',e.new_state,
        'requestRef',e.request_ref,'authority',e.authority,
        'retention','source_policy','availability','summary_only'
      ) order by e.occurred_at desc,e.source desc,e.source_id desc),'[]'::jsonb))
    from (
      select row.* from unnest(sources) as allowed(source)
      cross join lateral (
        select a.* from private.a1a_audit_source a
        where a.source=allowed.source
          and case when reference_id is not null then a.uuid_id=reference_id
            else a.occurred_at>=since_at and a.occurred_at<=least(until_at,high_mark)
              and (p_before_at is null or (a.occurred_at,a.source,a.source_id)<
                (p_before_at,p_before_source collate "C",p_before_id collate "C")) end
          and case p_scope when 'member' then a.owner_ref=p_actor
            when 'organization' then a.organization_ref=p_scope_id
            when 'verification' then a.resource_ref=p_scope_id
            when 'moderation' then a.resource_ref=p_scope_id
            when 'platform' then founder or a.event_type<>'first_account_bootstrapped'
            else false end
          and (p_category is null or a.category=p_category)
          and (p_event_type is null or a.event_type=p_event_type)
          and (p_resource_type is null or a.resource_type=p_resource_type)
          and (p_resource is null or a.resource_ref=p_resource)
          and (p_filter_actor is null or a.actor_ref=p_filter_actor)
          and (p_outcome is null or a.outcome=p_outcome)
        order by a.occurred_at desc,a.source_id desc limit p_take+1
      ) as row
      order by row.occurred_at desc,row.source desc,row.source_id desc limit p_take+1
    ) e
  );
end;
$$;
revoke all on function public.a1a_audit_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid,text,text,text,text,uuid,uuid,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.a1a_audit_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid,text,text,text,text,uuid,uuid,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text,text,integer,text) to service_role;

-- Share the existing cross-instance read budget without collecting audit queries.
alter table feed_data.read_limits drop constraint read_limits_category_check;
alter table feed_data.read_limits add constraint read_limits_category_check
  check(category in ('feed','media','discovery','profile','notifications','username','audit'));

create or replace function public.consume_safety_read_for_api(p_actor uuid,p_bucket integer,p_category text)
returns boolean language plpgsql security definer set search_path='' as $$
declare slot timestamptz:=date_trunc('minute',clock_timestamp()); ceiling integer; subject_key text;
begin
  if ((p_actor is null)=(p_bucket is null)) or (p_bucket is not null and p_bucket not between 0 and 4095)
  then raise exception 'invalid rate key' using errcode='22023'; end if;
  ceiling:=case p_category
    when 'feed' then case when p_actor is null then 90 else 120 end
    when 'media' then case when p_actor is null then 120 else 240 end
    when 'discovery' then case when p_actor is null then 30 else 60 end
    when 'profile' then case when p_actor is null then 60 else 120 end
    when 'notifications' then 90
    when 'username' then 30
    when 'audit' then case when p_actor is null then 15 else 30 end end;
  if ceiling is null then raise exception 'invalid rate category' using errcode='22023'; end if;
  subject_key:=coalesce('member:'||p_actor::text,'guest:'||p_bucket::text);
  insert into feed_data.read_limits(subject,category,window_started,total) values(subject_key,p_category,slot,1)
  on conflict(subject,category) do update set window_started=excluded.window_started,
    total=case when read_limits.window_started=slot then read_limits.total+1 else 1 end
  where read_limits.window_started<slot or (read_limits.window_started=slot and read_limits.total<ceiling);
  return found;
end;
$$;
