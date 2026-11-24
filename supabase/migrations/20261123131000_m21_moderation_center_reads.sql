-- Redacted read projections. Native moderation writers and existing A1A scopes remain unchanged.
create view private.m21_report_source as
select 'post_report'::text as source, case when p.community_id is null then 'feed' else 'communities' end as domain,
  r.id, 'post'::text as target, p.id as target_id, c.slug as scope_key,
  r.status, r.category as action, r.created_at as occurred_at,
  null::uuid as excluded_reporter, null::uuid as excluded_subject, null::uuid as organization_id
from feed_data.content_reports r join feed_data.posts p on p.id=r.post_id
left join feed_data.communities c on c.id=p.community_id
union all
select 'comment_report',case when p.community_id is null then 'feed' else 'communities' end,
  r.id,'comment',m.id,c.slug,r.status,r.category,r.created_at,null,null,null
from feed_data.comment_reports r join feed_data.comments m on m.id=r.comment_id
join feed_data.posts p on p.id=m.post_id left join feed_data.communities c on c.id=p.community_id
union all
select 'event_report','events',r.id,'event',r.event_id,c.slug,
  case when r.resolved_at is null then 'pending' else 'resolved' end,r.category,r.created_at,null,null,null
from feed_data.event_reports r join feed_data.events e on e.id=r.event_id
left join feed_data.communities c on c.id=e.community_id
union all
select 'project_report','projects',r.id,'project',r.project_id,c.slug,r.outcome,r.category,r.created_at,r.reporter_id,null,null
from private.project_reports r join private.community_projects p on p.id=r.project_id
left join feed_data.communities c on c.id=p.community_id
union all
select 'impersonation_report','trust',r.id,case when r.subject_id is null then 'organization' else 'account' end,
  coalesce(r.subject_id,r.organization_id),null,r.outcome,r.kind,r.created_at,r.reporter_id,r.subject_id,r.organization_id
from private.impersonation_reports r where r.subject_id is not null or r.organization_id is not null;

create view private.m21_history_source as
select a.source,
  case when a.source='platform_admin' then 'accounts' else 'feed' end as domain,
  a.uuid_id as id,a.resource_type as target,a.resource_ref as target_id,
  null::text as scope_key,a.outcome as status,a.event_type as action,a.occurred_at,a.actor_ref
from private.a1a_audit_source a
where a.source in ('platform_admin','post_moderation','comment_moderation')
  and a.event_type in ('account_suspended','account_banned','account_reinstated','hide','restore','remove','dismiss')
union all
select 'post_moderation','communities',a.id,'post',a.post_id,c.slug,'recorded',a.action,a.created_at,null
from feed_data.post_moderation_actions a join feed_data.posts p on p.id=a.post_id
join feed_data.communities c on c.id=p.community_id
union all
select 'comment_moderation','communities',a.id,'comment',a.comment_id,c.slug,'recorded',a.action,a.created_at,null
from feed_data.comment_moderation_actions a join feed_data.comments m on m.id=a.comment_id
join feed_data.posts p on p.id=m.post_id join feed_data.communities c on c.id=p.community_id
union all
select 'event_moderation','events',a.id,'event',a.event_id,c.slug,a.action,a.action,a.occurred_at,a.actor_id
from feed_data.event_audit a join feed_data.events e on e.id=a.event_id
left join feed_data.communities c on c.id=e.community_id
where a.action in ('restricted','restored','dismissed')
union all
select 'project_report','projects',r.id,'project',r.project_id,c.slug,r.outcome,r.outcome,r.decided_at,r.reviewer_id
from private.project_reports r join private.community_projects p on p.id=r.project_id
left join feed_data.communities c on c.id=p.community_id where r.decided_at is not null
union all
select 'organization_restriction','trust',a.id,'organization',a.organization_id,null,'restricted',a.event,a.occurred_at,a.actor_id
from private.institution_audit a where a.event='institution_restricted';

create view private.m21_content_source as
select 'post_state'::text as source,case when p.community_id is null then 'feed' else 'communities' end as domain,
  p.id,'post'::text as target,p.id as target_id,c.slug as scope_key,p.status,p.updated_at as occurred_at
from feed_data.posts p left join feed_data.communities c on c.id=p.community_id
where p.status in ('hidden','removed') and p.deleted_at is null
union all
select 'comment_state',case when p.community_id is null then 'feed' else 'communities' end,
  m.id,'comment',m.id,c.slug,m.status,m.updated_at
from feed_data.comments m join feed_data.posts p on p.id=m.post_id
left join feed_data.communities c on c.id=p.community_id where m.status in ('hidden','removed') and m.deleted_at is null;

create view private.m21_restriction_source as
select 'account_restriction'::text as source,'accounts'::text as domain,r.user_id as id,'account'::text as target,
  r.user_id as target_id,null::text as scope_key,r.status,r.status as action,r.updated_at as occurred_at,
  null::timestamptz as expires_at
from private.account_restrictions r join auth.users u on u.id=r.user_id
where r.status in ('suspended','banned') and u.deleted_at is null
union all
select 'provider_ban','accounts',u.id,'account',u.id,null,'provider_ban','provider_ban',null,u.banned_until
from auth.users u where u.deleted_at is null and not u.is_anonymous and u.banned_until>statement_timestamp()
union all
select 'event_restriction','events',e.id,'event',e.id,c.slug,'restricted','restricted',e.moderated_at,null
from feed_data.events e left join feed_data.communities c on c.id=e.community_id where e.moderated_at is not null
union all
select 'project_restriction','projects',p.id,'project',p.id,c.slug,'restricted','restricted',p.restricted_at,null
from private.community_projects p left join feed_data.communities c on c.id=p.community_id where p.restricted_at is not null
union all
select 'organization_restriction','trust',o.id,'organization',o.id,null,'restricted','restricted',a.occurred_at,null
from private.organizations o left join lateral (
  select s.occurred_at from private.institution_audit s where s.organization_id=o.id and s.event='institution_restricted'
  order by s.occurred_at desc,s.id desc limit 1
) a on true where o.status='restricted';

revoke all on private.m21_report_source,private.m21_history_source,private.m21_content_source,private.m21_restriction_source
  from public,anon,authenticated,service_role;

create function private.m21_report_allowed(r private.m21_report_source,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select case r.domain
    when 'projects' then r.excluded_reporter is distinct from p_actor and exists (
      select from private.community_projects p where p.id=r.target_id and not private.project_conflicted(p,p_actor))
    when 'trust' then r.excluded_reporter is distinct from p_actor and r.excluded_subject is distinct from p_actor
      and not private.institution_report_conflict(p_actor,r.organization_id)
    else true end
$$;
revoke all on function private.m21_report_allowed(private.m21_report_source,uuid) from public,anon,authenticated,service_role;
create index m21_post_reports_time on feed_data.content_reports(created_at desc,id desc);
create index m21_comment_reports_time on feed_data.comment_reports(created_at desc,id desc);
create index m21_event_reports_time on feed_data.event_reports(created_at desc,id desc);
create index m21_project_reports_time on private.project_reports(created_at desc,id desc);
create index m21_impersonation_reports_time on private.impersonation_reports(created_at desc,id desc);
create index m21_event_decisions_time on feed_data.event_audit(occurred_at desc,id desc)
  where action in ('restricted','restored','dismissed');
create index m21_project_decisions_time on private.project_reports(decided_at desc,id desc) where decided_at is not null;
create index m21_institution_restrictions_time on private.institution_audit(organization_id,occurred_at desc,id desc)
  where event='institution_restricted';

create function public.m21_moderation_center_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_view text,p_domain text,p_status text,p_action text,p_scope text,p_target uuid,
  p_from timestamptz,p_to timestamptz,p_high timestamptz,p_before_at timestamptz,p_before_source text,p_before_id uuid,p_take integer)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan'
set statement_timeout='4s' as $$
declare
  high_mark timestamptz:=coalesce(p_high,statement_timestamp());
  until_at timestamptz:=coalesce(p_to,high_mark);
  since_at timestamptz:=coalesce(p_from,until_at-interval '30 days');
  safety jsonb;
begin
  if not private.platform_admin(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
  then return null; end if;
  if p_view is null or p_view not in ('overview','reports','content','restrictions','history')
    or p_take is null or p_take not between 1 and 50 or not isfinite(high_mark)
    or not isfinite(since_at) or not isfinite(until_at)
    or ((p_before_at is not null or p_before_source is not null or p_before_id is not null)
      and (p_high is null or p_before_at is null or p_before_source is null or p_before_id is null))
    or (p_view in ('reports','history') and (since_at>=until_at or until_at-since_at>interval '90 days'))
  then raise exception 'invalid moderation filters' using errcode='22023'; end if;

  if p_view='overview' then
    safety:=public.safety_overview_for_api(p_actor);
    return (select jsonb_build_object('high',high_mark,'rows','[]'::jsonb,'metrics',jsonb_build_object(
      'pendingReports',count(*),
      'eventReports',count(*) filter (where r.domain='events'),
      'projectReports',count(*) filter (where r.domain='projects'),
      'pendingAppeals',safety->'pendingAppeals',
      'restrictedAccounts',(select count(distinct h.target_id) from private.m21_restriction_source h where h.domain='accounts'),
      'recentDecisions',(
        select count(*) from private.m21_history_source h where h.occurred_at>=high_mark-interval '30 days'
          and h.occurred_at<=high_mark and (h.domain<>'trust' or not private.institution_report_conflict(p_actor,h.target_id))
          and (h.domain<>'projects' or exists (select from private.community_projects p
            where p.id=h.target_id and not private.project_conflicted(p,p_actor)))),
      'hiddenContent',(
        (select count(*) from feed_data.posts where status='hidden' and deleted_at is null) +
        (select count(*) from feed_data.comments where status='hidden' and deleted_at is null)),
      'removedContent',(
        (select count(*) from feed_data.posts where status='removed' and deleted_at is null) +
        (select count(*) from feed_data.comments where status='removed' and deleted_at is null))))
      from private.m21_report_source r where r.status='pending' and private.m21_report_allowed(r,p_actor));
  end if;

  return (
    with source as (
      select r.source,r.domain,r.id,r.target,r.target_id,r.scope_key,r.status,r.action,r.occurred_at,
        null::timestamptz as expires_at,null::uuid as actor_ref
      from private.m21_report_source r where p_view='reports' and private.m21_report_allowed(r,p_actor)
      union all
      select c.source,c.domain,c.id,c.target,c.target_id,c.scope_key,c.status,c.status,c.occurred_at,null,null
      from private.m21_content_source c where p_view='content'
      union all
      select h.source,h.domain,h.id,h.target,h.target_id,h.scope_key,h.status,h.action,h.occurred_at,null,h.actor_ref
      from private.m21_history_source h where p_view='history'
        and (h.domain<>'trust' or not private.institution_report_conflict(p_actor,h.target_id))
        and (h.domain<>'projects' or exists (
          select from private.community_projects p where p.id=h.target_id and not private.project_conflicted(p,p_actor)))
      union all
      select r.source,r.domain,r.id,r.target,r.target_id,r.scope_key,r.status,r.action,r.occurred_at,r.expires_at,null
      from private.m21_restriction_source r where p_view='restrictions'
        and (r.domain<>'trust' or not private.institution_report_conflict(p_actor,r.target_id))
        and (r.domain<>'projects' or exists (
          select from private.community_projects p where p.id=r.target_id and not private.project_conflicted(p,p_actor)))
    ), page as (
      select s.*, coalesce(s.occurred_at,s.expires_at,'0001-01-01'::timestamptz) as sort_at
      from source s
      where (p_domain is null or p_domain=s.domain) and (p_status is null or p_status=s.status)
        and (p_action is null or p_action=s.action) and (p_scope is null or p_scope=s.scope_key)
        and (p_target is null or p_target=s.target_id)
        and (p_view in ('restrictions','content') or (s.occurred_at>=since_at and s.occurred_at<=least(until_at,high_mark)))
        and (p_before_at is null or (coalesce(s.occurred_at,s.expires_at,'0001-01-01'::timestamptz),s.source collate "C",s.id)
          < (p_before_at,p_before_source collate "C",p_before_id))
      order by sort_at desc,s.source collate "C" desc,s.id desc limit p_take+1
    )
    select jsonb_build_object('high',high_mark,'metrics',null,'rows',coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'source',source,'domain',domain,'target',target,'targetId',target_id,'scopeKey',scope_key,
      'status',status,'action',action,'occurredAt',occurred_at,'sortAt',sort_at,'expiresAt',expires_at,'actorRef',actor_ref
    ) order by sort_at desc,source collate "C" desc,id desc),'[]'::jsonb)) from page
  );
end
$$;

revoke all on function public.m21_moderation_center_for_api(uuid,uuid,boolean,bigint,uuid,text,text,text,text,text,uuid,
  timestamptz,timestamptz,timestamptz,timestamptz,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.m21_moderation_center_for_api(uuid,uuid,boolean,bigint,uuid,text,text,text,text,text,uuid,
  timestamptz,timestamptz,timestamptz,timestamptz,text,uuid,integer) to service_role;
