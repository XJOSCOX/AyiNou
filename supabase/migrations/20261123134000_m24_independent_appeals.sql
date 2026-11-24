-- Keep old event audit rows intact. Only decisions with proven report linkage are appealable.
alter table feed_data.event_audit add column report_id uuid references feed_data.event_reports(id) on delete restrict;
alter table feed_data.events add column moderation_decision_id uuid references feed_data.event_audit(id) on delete restrict;
create index m24_event_audit_report on feed_data.event_audit(report_id) where report_id is not null;

create function private.m24_org_conflict(p_actor uuid,p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select from private.organizations where id=p_org and created_by=p_actor)
    or exists(select from private.organization_memberships where organization_id=p_org and user_id=p_actor)
    or exists(select from private.organization_affiliations where organization_id=p_org and user_id=p_actor and joined_at is not null)
$$;

create function private.m24_event_conflict(p_actor uuid,p_event uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select from feed_data.events e where e.id=p_event and (
    e.creator_id=p_actor or private.m24_org_conflict(p_actor,e.organization_id)
    or private.project_community_manager(e.community_id,p_actor)
    or exists(select from private.community_projects p where p.id=e.project_id and private.project_conflicted(p,p_actor))))
    or exists(select from feed_data.event_reports where event_id=p_event and actor_id=p_actor)
$$;

create table private.m24_cases (
  id uuid primary key default gen_random_uuid(),
  domain text not null check(domain in ('account','legacy','feature','event')),
  decision_id uuid not null, subject_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  deadline timestamptz not null,
  status text not null default 'submitted' check(status in ('submitted','assigned','correction','upheld','overturned',
    'protected_pending','release_declined','withdrawn','closed')),
  protected boolean not null,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null, updated_at timestamptz not null,
  unique(domain,decision_id)
);
create index m24_cases_subject on private.m24_cases(subject_id,updated_at desc,id);
create index m24_cases_reviewer on private.m24_cases(reviewer_id,updated_at desc,id);
create index m24_cases_queue on private.m24_cases(status,updated_at desc,id);

create table private.m24_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references private.m24_cases on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid,
  action text not null, revision integer,
  details jsonb not null, narrative text,
  workspace_id uuid, occurred_at timestamptz not null default clock_timestamp(),
  unique(actor_id,request_id)
);
create index m24_events_case on private.m24_events(case_id,occurred_at desc,id);
create table private.m24_notices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references private.m24_cases on delete restrict,
  event_id uuid references feed_data.events(id) on delete cascade,
  action text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(case_id,event_id)=1)
);
create index m24_notices_member on private.m24_notices(member_id,occurred_at desc,id);

alter table private.m24_cases enable row level security;
alter table private.m24_events enable row level security;
alter table private.m24_notices enable row level security;
revoke all on private.m24_cases,private.m24_events,private.m24_notices from public,anon,authenticated,service_role;

create function private.m24_event_notice(p_event feed_data.events,p_action text)
returns void language sql set search_path='' as $$
  insert into private.m24_notices(member_id,event_id,action)
  select u.id,p_event.id,p_action
  from auth.users u left join feed_data.notification_preferences n on n.user_id=u.id
  where u.deleted_at is null and not u.is_anonymous and coalesce(n.events,true) and (
    (p_event.organization_id is null and u.id=p_event.creator_id)
    or (p_event.organization_id is not null and exists(select from private.organization_memberships m
      where m.user_id=u.id and m.organization_id=p_event.organization_id and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>statement_timestamp()) and m.role in ('owner','administrator','editor'))))
$$;

create or replace function public.event_reports_for_client(p_before_at timestamptz,p_before_id uuid,p_limit int)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.mod_allowed() then raise exception 'moderation required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q."createdAt" desc,q.id desc) from (
    select r.id,r.created_at as "createdAt",r.category,r.note,e.id as "eventId",e.title,e.status,
      e.moderated_at is not null as restricted
    from feed_data.event_reports r join feed_data.events e on e.id=r.event_id
    where r.resolved_at is null and not private.m24_event_conflict(auth.uid(),e.id)
      and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
    order by r.created_at desc,r.id desc limit (least(greatest(p_limit,1),20)+1)
  ) q),'[]'::jsonb);
end
$$;

create or replace function public.moderate_event_for_client(p_report uuid,p_action text,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare e feed_data.events; report feed_data.event_reports; moment timestamptz; decision uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(20261120,300);
  if not feed_data.mod_allowed() then raise exception 'moderation required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('restricted','restored','dismissed') or p_reason is null
    or char_length(btrim(p_reason)) not between 10 and 500 or p_reason ~ '[[:cntrl:]]'
    then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into report from feed_data.event_reports where id=p_report;
  if not found then raise exception 'report unavailable' using errcode='PFR04'; end if;
  select * into e from feed_data.events where id=report.event_id for update;
  select * into report from feed_data.event_reports where id=p_report and event_id=e.id for update;
  if not found or report.resolved_at is not null then raise exception 'report unavailable' using errcode='PFR04'; end if;
  if private.m24_event_conflict(auth.uid(),e.id) then
    insert into private.m24_events(actor_id,action,details)
      values(auth.uid(),'event_conflict_denied',jsonb_build_object('eventReference',e.id,'reportReference',report.id,'attempt',p_action));
    return false;
  end if;
  if (p_action='restricted' and e.moderated_at is not null) or (p_action='restored' and e.moderated_at is null)
    or (p_action='dismissed' and e.moderated_at is not null) then raise exception 'invalid event decision' using errcode='PFR09'; end if;
  moment:=clock_timestamp();
  insert into feed_data.event_audit(id,event_id,actor_id,action,version,reason,report_id,occurred_at)
    values(decision,e.id,auth.uid(),p_action,e.version+case when p_action='dismissed' then 0 else 1 end,btrim(p_reason),report.id,moment);
  if p_action<>'dismissed' then
    update feed_data.events set moderated_at=case when p_action='restricted' then moment end,
      moderation_decision_id=case when p_action='restricted' then decision end,
      version=e.version+1,updated_at=moment where id=e.id returning * into e;
  end if;
  if p_action<>'restricted' then
    update feed_data.event_reports set resolved_at=moment where id=report.id;
  end if;
  perform private.m24_event_notice(e,'event_'||p_action);
  return true;
end
$$;

-- The appeal key is the actual decision reference. Legacy rows require a matching original audit event.
create view private.m24_decisions as
select 'account'::text as domain,s.id as id,s.subject_id as member_id,s.kind as kind,s.category,
  s.started_at as issued_at,s.expires_at,s.revoked_at,s.kind='banned' as protected,
  a.actor_id as issuer,'platform'::text as scope,null::uuid as scope_id,null::uuid as report_id,s.id as resource_id
from private.m22_account_sanctions s join private.m22_account_events a
  on a.case_id=s.id and a.action in ('suspension_created','ban_issued')
union all
select 'legacy',a.id,l.user_id,l.status,'other',a.occurred_at,null,null,true,a.actor_id,'platform',null,null,l.user_id
from private.account_restrictions l join private.platform_admin_audit a on a.subject_id=l.user_id
  and a.actor_id=l.changed_by and a.occurred_at=l.updated_at
  and a.event=case l.status when 'suspended' then 'account_suspended' when 'banned' then 'account_banned' end
union all
select 'feature',r.id,r.subject_id,r.capability,r.category,r.starts_at,r.expires_at,r.revoked_at,
  c.high_impact or r.expires_at is null,r.issuer_id,r.scope_kind,r.scope_id,null,r.id
from private.m23_restrictions r join private.m23_capabilities c using(capability)
union all
select 'event',a.id,e.creator_id,'event_restriction',r.category,a.occurred_at,null,
  case when e.moderation_decision_id is distinct from a.id then e.updated_at end,
  false,a.actor_id,'event',e.id,r.id,e.id
from feed_data.event_audit a join feed_data.events e on e.id=a.event_id
join feed_data.event_reports r on r.id=a.report_id and r.event_id=e.id
where a.action='restricted';

revoke all on private.m24_decisions from public,anon,authenticated,service_role;
create function private.m24_organizer(p_actor uuid,p_event uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and exists(select from feed_data.events e where e.id=p_event
    and case when e.organization_id is null then e.creator_id=p_actor
      else private.institution_role(p_actor,e.organization_id) in ('owner','administrator','editor') end)
$$;

create function private.m24_conflict(p_actor uuid,d private.m24_decisions)
returns boolean language sql stable set search_path='' as $$
  select p_actor is null or d.member_id is not distinct from p_actor or case d.scope
    when 'event' then private.m24_event_conflict(p_actor,d.scope_id)
    when 'organization' then private.m24_org_conflict(p_actor,d.scope_id)
    when 'community' then private.project_community_manager(d.scope_id,p_actor)
    when 'project' then exists(select from private.community_projects p where p.id=d.scope_id and private.project_conflicted(p,p_actor))
    when 'poll' then exists(select from private.polls p where p.id=d.scope_id and (p.creator_id=p_actor
      or private.m24_org_conflict(p_actor,p.organization_id) or private.project_community_manager(p.community_id,p_actor)
      or exists(select from private.community_projects x where x.id=p.project_id and private.project_conflicted(x,p_actor))))
    else false end
$$;

create function private.m24_independent(p_actor uuid,d private.m24_decisions,p_subject uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_reviewer(p_actor) and p_actor is distinct from p_subject
    and p_actor is distinct from d.issuer and not coalesce(private.m24_conflict(p_actor,d),true)
$$;

create function private.m24_case_json(c private.m24_cases)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'domain',c.domain,'decision',c.decision_id,'deadline',c.deadline,'status',c.status,
    'protected',c.protected,'revision',c.revision,'createdAt',c.created_at,'updatedAt',c.updated_at)
$$;

create function private.m24_decision_json(d private.m24_decisions,p_now timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('domain',d.domain,'id',d.id,'kind',d.kind,'category',d.category,'issuedAt',d.issued_at,
    'deadline',d.issued_at+interval '336 hours','expiresAt',d.expires_at,'scope',d.scope,'scopeId',d.scope_id,'protected',d.protected,
    'state',case when d.revoked_at is not null then 'revoked' when d.expires_at<=p_now then 'expired' else 'active' end)
$$;

create function public.m24_my_appeals(p_event uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='4s' as $$
declare actor uuid:=auth.uid(); now_at timestamptz:=statement_timestamp();
begin
  if not private.m22_notice_session(actor,nullif(auth.jwt()->>'session_id','')::uuid) then return null; end if;
  if p_event is not null and not private.m24_organizer(actor,p_event) then return null; end if;
  return jsonb_build_object('decisions',coalesce((
    select jsonb_agg(entry order by issued_at desc,id desc) from (
      select d.issued_at,d.id,private.m24_decision_json(d,now_at)||jsonb_build_object('canAppeal',
        c.id is null and d.revoked_at is null and now_at<d.issued_at+interval '336 hours',
        'appeal',case when c.subject_id=actor then private.m24_case_json(c) end) entry
      from private.m24_decisions d left join private.m24_cases c on c.domain=d.domain and c.decision_id=d.id
      where (case when p_event is null then d.domain<>'event' and d.member_id=actor
        else d.domain='event' and d.resource_id=p_event end)
        and (c.id is not null or d.revoked_at is null)
      order by (d.revoked_at is null and now_at<d.issued_at+interval '336 hours') desc,d.issued_at desc,d.id desc limit 50
    ) x),'[]'::jsonb),
    'appeals',coalesce((select jsonb_agg(x.entry order by x.updated_at desc,x.id desc) from (
      select c.updated_at,c.id,private.m24_case_json(c)||jsonb_build_object('kind',coalesce(d.kind,c.domain)) as entry
      from private.m24_cases c left join private.m24_decisions d on d.domain=c.domain and d.id=c.decision_id
      where c.subject_id=actor and (p_event is null or (c.domain='event' and d.resource_id=p_event))
      order by c.updated_at desc,c.id desc limit 50) x),'[]'::jsonb),
    'notices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'caseId',n.case_id,'eventId',n.event_id,
      'action',n.action,'occurredAt',n.occurred_at) order by n.occurred_at desc,n.id desc)
      from (select n.* from private.m24_notices n where n.member_id=actor and (p_event is null or n.event_id=p_event
        or exists(select from private.m24_cases c join private.m24_decisions d on d.domain=c.domain and d.id=c.decision_id
          where n.case_id=c.id and d.domain='event' and d.resource_id=p_event))
        order by n.occurred_at desc,n.id desc limit 50) n),'[]'::jsonb));
end
$$;

create function public.m24_member_appeal(p_action text,p_domain text,p_ref uuid,p_revision int,p_request uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  c private.m24_cases; d private.m24_decisions; prior private.m24_events; now_at timestamptz;
  args jsonb:=jsonb_build_array(p_action,p_domain,p_ref,p_revision,btrim(p_reason));
begin
  if not private.m22_notice_session(actor,sid) then raise exception 'access denied' using errcode='42501'; end if;
  if p_action is null or p_action not in ('submit','correct','withdraw') or p_request is null or p_ref is null
    or (p_action<>'withdraw' and (coalesce(char_length(btrim(p_reason)),0) not between 10 and 2000
      or translate(p_reason,E'\n\r\t','') ~ '[[:cntrl:]]'))
    then raise exception 'invalid appeal' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(20261120,300);
  perform private.s2b_lock_actor(actor,sid);
  if not private.m22_notice_session(actor,sid) then raise exception 'access denied' using errcode='42501'; end if;
  select * into prior from private.m24_events where actor_id=actor and request_id=p_request;
  if found then
    if prior.details->'input' is distinct from args then raise exception 'request changed' using errcode='O2002'; end if;
    return prior.details->'receipt';
  end if;
  now_at:=clock_timestamp();
  if p_action='submit' then
    select * into d from private.m24_decisions where domain=p_domain and id=p_ref;
    if not found or (case when d.domain='event' then not private.m24_organizer(actor,d.resource_id)
      else d.member_id is distinct from actor end) then raise exception 'decision unavailable' using errcode='PSF04'; end if;
    if exists(select from private.m24_cases where domain=p_domain and decision_id=p_ref)
      then raise exception 'appeal already submitted' using errcode='PSF09'; end if;
    if now_at>=d.issued_at+interval '336 hours' then raise exception 'appeal deadline passed' using errcode='PSF14'; end if;
    if d.revoked_at is not null then raise exception 'decision superseded' using errcode='O2004'; end if;
    if (select count(*) from private.m24_cases where subject_id=actor and created_at>now_at-interval '1 hour')>=10
      then raise exception 'appeal submission limit' using errcode='54000'; end if;
    insert into private.m24_cases(domain,decision_id,subject_id,deadline,protected,created_at,updated_at)
      values(d.domain,d.id,actor,d.issued_at+interval '336 hours',d.protected,now_at,now_at) returning * into c;
  else
    select * into c from private.m24_cases where id=p_ref and subject_id=actor for update;
    if not found then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
    if c.revision is distinct from p_revision or c.status not in ('submitted','assigned','correction')
      or (p_action='correct' and c.status<>'correction') then raise exception 'appeal changed' using errcode='O2004'; end if;
    update private.m24_cases set status=case when p_action='withdraw' then 'withdrawn' else 'assigned' end,
      revision=revision+1,updated_at=now_at where id=c.id returning * into c;
  end if;
  insert into private.m24_events(case_id,actor_id,request_id,action,revision,details,narrative,occurred_at)
    values(c.id,actor,p_request,p_action,c.revision,jsonb_build_object('input',args,'receipt',private.m24_case_json(c)),
      case when p_action<>'withdraw' then btrim(p_reason) end,now_at);
  insert into private.m24_notices(member_id,case_id,action) values(actor,c.id,c.status);
  return private.m24_case_json(c);
end
$$;

-- Record the grant of relief in both the appeal history and the original enforcement ledger.
alter table private.m22_account_events drop constraint m22_account_events_authority_check,
  add constraint m22_account_events_authority_check check(authority in ('founder','administrator','appeal_reviewer'));

create function private.m24_reverse(c private.m24_cases,d private.m24_decisions,p_actor uuid,p_workspace uuid,p_reason text,p_at timestamptz)
returns boolean language plpgsql set search_path='' as $$
declare s private.m22_account_sanctions; f private.m23_restrictions; legacy private.account_restrictions;
  e feed_data.events; changed boolean; prior jsonb; current_value jsonb; event_action text;
  power text:=case when c.protected then 'founder' else 'appeal_reviewer' end;
  trace jsonb:=jsonb_build_object('appealId',c.id);
begin
  if d.id is null then return false; end if;
  if c.domain in ('account','legacy') then
    if private.s2a_leadership(c.subject_id) then raise exception 'protected account' using errcode='42501'; end if;
    perform 1 from auth.users where id=c.subject_id for no key update;
    if c.domain='legacy' then
      select * into legacy from private.account_restrictions where user_id=c.subject_id and status=d.kind and updated_at=d.issued_at for update;
      if not found then return false; end if;
      prior:=jsonb_build_object('status',legacy.status,'legacy',true,'updatedAt',legacy.updated_at);
      update private.account_restrictions set status='active',updated_at=p_at where user_id=c.subject_id;
      current_value:=jsonb_build_object('status','revoked','legacy',true);
    else
      select * into s from private.m22_account_sanctions where id=c.decision_id and subject_id=c.subject_id for update;
      if not found or s.revoked_at is not null or s.expires_at<=p_at then return false; end if;
      prior:=private.m22_case_json(s,p_at);
      update private.m22_account_sanctions set revoked_at=p_at where id=s.id returning * into s;
      current_value:=private.m22_case_json(s,p_at);
    end if;
    insert into private.m22_reauthentication(subject_id,after_at) values(c.subject_id,p_at)
      on conflict(subject_id) do update set after_at=greatest(private.m22_reauthentication.after_at,excluded.after_at);
    event_action:=case when d.kind='banned' then 'ban_lifted' else 'restriction_revoked' end;
    insert into private.m22_account_events(case_id,subject_id,actor_id,authority,workspace_id,request_id,action,reason,
      occurred_at,before_state,after_state,command)
      values(case when c.domain='legacy' then c.subject_id else s.id end,c.subject_id,p_actor,power,p_workspace,
        gen_random_uuid(),event_action,left(p_reason,500),p_at,prior,current_value,trace);
    return true;
  elsif c.domain='feature' then
    perform pg_advisory_xact_lock(hashtextextended(c.subject_id::text,20261123133000));
    select * into f from private.m23_restrictions where id=c.decision_id and subject_id=c.subject_id for update;
    if not found or f.revoked_at is not null or f.expires_at<=p_at then return false; end if;
    prior:=private.m23_case_summary(f,p_at);
    update private.m23_restrictions set revoked_at=p_at,version=version+1 where id=f.id returning * into f;
    insert into private.m23_events(case_id,subject_id,actor_id,authority,workspace_id,request_id,command,
      capability,scope_kind,scope_id,action,reason,happened_at,previous,current)
      values(f.id,c.subject_id,p_actor,power,p_workspace,gen_random_uuid(),trace,f.capability,f.scope_kind,f.scope_id,
        'revoke',left(p_reason,500),p_at,prior,private.m23_case_summary(f,p_at));
    return true;
  end if;
  select * into e from feed_data.events where id=d.resource_id for update;
  if not found or e.moderation_decision_id is distinct from c.decision_id or e.moderated_at is null
    or e.status<>'published' or e.ends_at<=p_at then return false; end if;
  update feed_data.events set moderated_at=null,moderation_decision_id=null,version=version+1,updated_at=p_at
    where id=e.id returning * into e;
  insert into feed_data.event_audit(event_id,actor_id,action,version,reason,report_id,occurred_at)
    values(e.id,p_actor,'restored',e.version,left(p_reason,500),d.report_id,p_at);
  update feed_data.event_reports set resolved_at=coalesce(resolved_at,p_at) where id=d.report_id;
  perform private.m24_event_notice(e,'event_restored');
  return true;
end
$$;
create function private.m24_staff(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,p_lane text)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    and case p_lane
      when 'admin' then private.platform_admin(p_actor)
        and public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is not null
      when 'review' then private.institution_reviewer(p_actor)
        and public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'review',null,null) is not null
      else false end
$$;

create function public.m24_staff_appeals(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_search text,p_status text,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='4s' as $$
begin
  if not private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane)
    then raise exception 'appeals workspace required' using errcode='42501'; end if;
  return jsonb_build_object('founder',private.platform_founder(p_actor),
    'reviewers',case when p_lane='admin' and length(coalesce(p_search,'')) between 2 and 64 then coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select p.user_id as id,p.username from public.profiles p
        where p.user_id<>p_actor and private.institution_reviewer(p.user_id)
          and (p.user_id::text=p_search or starts_with(lower(p.username),lower(p_search)))
        order by p.username,p.user_id limit 20) r),'[]'::jsonb) else '[]'::jsonb end,
    'cases',coalesce((select jsonb_agg(x.item order by x.updated_at desc,x.id desc) from (
      select c.id,c.updated_at,private.m24_case_json(c)||jsonb_build_object(
        'decisionInfo',case when d.id is not null then private.m24_decision_json(d,statement_timestamp()) end,
        'reviewer',c.reviewer_id,'subject',c.subject_id,
        'canReview',p_lane='review' and c.reviewer_id=p_actor and private.m24_independent(p_actor,d,c.subject_id)
          and d.id is not null and c.status='assigned',
        'canRelease',p_lane='admin' and c.status='protected_pending' and private.platform_founder(p_actor)
          and d.id is not null and not coalesce(private.m24_conflict(p_actor,d),true) and c.subject_id is distinct from p_actor,
        'history',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'occurredAt',h.occurred_at,
          'narrative',case when (p_lane='review' and h.action in ('submit','correct','uphold','overturn','return'))
            or (p_lane='admin' and c.status='protected_pending' and h.action='overturn' and private.platform_founder(p_actor)
              and not coalesce(private.m24_conflict(p_actor,d),true)) then h.narrative end)
          order by h.occurred_at desc,h.id desc),'[]'::jsonb)
          from (select h.* from private.m24_events h where h.case_id=c.id order by h.occurred_at desc,h.id desc limit 20) h)
      ) as item
      from private.m24_cases c left join private.m24_decisions d on d.domain=c.domain and d.id=c.decision_id
      where (p_lane='admin' or (c.reviewer_id=p_actor and d.id is not null and private.m24_independent(p_actor,d,c.subject_id)))
        and (p_status is null or c.status=p_status)
        and (p_before is null or (c.updated_at,c.id)<(p_before,p_before_id))
      order by c.updated_at desc,c.id desc limit 26
    ) x),'[]'::jsonb));
end
$$;

create function public.m24_staff_decision(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_case uuid,p_revision int,p_action text,p_reviewer uuid,p_request uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.m24_cases; d private.m24_decisions; prior private.m24_events;
  now_at timestamptz; outcome text; changed boolean:=false; denied boolean:=false;
  args jsonb:=jsonb_build_array(p_case,p_revision,p_action,p_reviewer,btrim(p_reason),p_lane);
  result jsonb;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  if not private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane)
    then raise exception 'appeals workspace required' using errcode='42501'; end if;
  if p_request is null or p_case is null or coalesce(char_length(btrim(p_reason)),0) not between 10 and 500
    or p_reason ~ '[[:cntrl:]]' or p_action is null
    or (p_action='assign')<>(p_reviewer is not null)
    or not ((p_lane='admin' and p_action in ('assign','release','decline_release','close'))
      or (p_lane='review' and p_action in ('uphold','overturn','return')))
    then raise exception 'invalid appeal command' using errcode='22023'; end if;
  select * into prior from private.m24_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.details->'input' is distinct from (case when prior.action='conflict_denied' then jsonb_set(args,'{4}','null') else args end)
      then raise exception 'request changed' using errcode='O2002'; end if;
    return prior.details->'receipt';
  end if;
  select * into c from private.m24_cases where id=p_case and (p_lane='admin' or reviewer_id=p_actor) for update;
  if not found then raise exception 'appeal unavailable' using errcode='PSF04'; end if;
  if c.revision is distinct from p_revision then raise exception 'appeal changed' using errcode='O2004'; end if;
  select * into d from private.m24_decisions where domain=c.domain and id=c.decision_id;
  now_at:=clock_timestamp();
  if p_action='assign' then
    if c.status not in ('submitted','assigned','correction') then raise exception 'appeal changed' using errcode='O2004'; end if;
    denied:=p_actor=p_reviewer or d.id is null or not coalesce(private.m24_independent(p_reviewer,d,c.subject_id),false);
    outcome:=case when c.status='correction' then 'correction' else 'assigned' end;
  elsif p_action in ('release','decline_release') then
    if c.status<>'protected_pending' or not c.protected then raise exception 'appeal changed' using errcode='O2004'; end if;
    denied:=not private.platform_founder(p_actor) or d.id is null or coalesce(private.m24_conflict(p_actor,d),true)
      or p_actor is not distinct from c.subject_id;
    if not denied and p_action='release' then changed:=private.m24_reverse(c,d,p_actor,p_workspace,btrim(p_reason),now_at); end if;
    outcome:=case when p_action='decline_release' then 'release_declined' when changed then 'overturned' else 'closed' end;
  elsif p_action='close' then
    if c.status not in ('submitted','assigned','correction') or (d.id is not null and d.revoked_at is null and c.subject_id is not null)
      then raise exception 'appeal cannot close' using errcode='O2004'; end if;
    outcome:='closed';
  else
    if c.status<>'assigned' then raise exception 'appeal changed' using errcode='O2004'; end if;
    denied:=d.id is null or not coalesce(private.m24_independent(p_actor,d,c.subject_id),false);
    if not denied and p_action='overturn' and not c.protected
      then changed:=private.m24_reverse(c,d,p_actor,p_workspace,btrim(p_reason),now_at); end if;
    outcome:=case p_action when 'uphold' then 'upheld' when 'return' then 'correction'
      else case when c.protected then 'protected_pending' else 'overturned' end end;
  end if;
  if denied then
    result:=jsonb_build_object('denied',true);
    insert into private.m24_events(case_id,actor_id,request_id,action,revision,details,workspace_id,occurred_at)
      values(c.id,p_actor,p_request,'conflict_denied',c.revision,jsonb_build_object('input',jsonb_set(args,'{4}','null'),
        'receipt',result,'attempt',p_action,'reviewer',p_reviewer),p_workspace,now_at);
    return result;
  end if;
  update private.m24_cases set status=outcome,reviewer_id=case when p_action='assign' then p_reviewer else reviewer_id end,
    revision=revision+1,updated_at=now_at where id=c.id returning * into c;
  result:=private.m24_case_json(c)||jsonb_build_object('enforcementChanged',changed);
  insert into private.m24_events(case_id,actor_id,request_id,action,revision,details,narrative,workspace_id,occurred_at)
    values(c.id,p_actor,p_request,p_action,c.revision,jsonb_build_object('input',args,'receipt',result,'reversed',changed),
      btrim(p_reason),p_workspace,now_at);
  if c.subject_id is not null then
    insert into private.m24_notices(member_id,case_id,action) values(c.subject_id,c.id,c.status);
  end if;
  return result;
end
$$;

revoke all on function private.m24_org_conflict(uuid,uuid),private.m24_event_conflict(uuid,uuid),
  private.m24_event_notice(feed_data.events,text),private.m24_organizer(uuid,uuid),
  private.m24_conflict(uuid,private.m24_decisions),private.m24_independent(uuid,private.m24_decisions,uuid),
  private.m24_case_json(private.m24_cases),private.m24_decision_json(private.m24_decisions,timestamptz),
  private.m24_reverse(private.m24_cases,private.m24_decisions,uuid,uuid,text,timestamptz),
  private.m24_staff(uuid,uuid,boolean,bigint,uuid,text),
  public.m24_my_appeals(uuid),public.m24_member_appeal(text,text,uuid,int,uuid,text),
  public.m24_staff_appeals(uuid,uuid,boolean,bigint,uuid,text,text,text,timestamptz,uuid),
  public.m24_staff_decision(uuid,uuid,boolean,bigint,uuid,text,uuid,int,text,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.m24_my_appeals(uuid),public.m24_member_appeal(text,text,uuid,int,uuid,text) to authenticated;
grant execute on function public.m24_staff_appeals(uuid,uuid,boolean,bigint,uuid,text,text,text,timestamptz,uuid),
  public.m24_staff_decision(uuid,uuid,boolean,bigint,uuid,text,uuid,int,text,uuid,uuid,text) to service_role;
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
  h.actor_id,'account',h.subject_id,null,null,null,h.request_id,'recorded',
  case when h.authority='founder' then h.authority end,
  h.before_state,h.after_state-'legacy' || jsonb_build_object('caseReference',h.case_id)
from private.m22_account_history h
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
create or replace view private.m21_history_source as
select case when a.event_type like 'feature_%' then 'feature_enforcement' when a.new_state ? 'caseReference' then 'account_enforcement' else a.source end collate "C" as source,
  case when a.event_type like 'feature_%' then 'features' when a.source='platform_admin' then 'accounts' else 'feed' end as domain,
  a.uuid_id as id,a.resource_type as target,a.resource_ref as target_id,
  null::text as scope_key,a.outcome as status,a.event_type as action,a.occurred_at,a.actor_ref
from private.a1a_audit_source a
where a.source in ('platform_admin','post_moderation','comment_moderation')
  and (a.event_type like 'feature_%' or a.event_type in ('account_suspended','account_banned','account_reinstated','suspension_created','suspension_extended','restriction_expired','restriction_revoked','ban_issued','ban_lifted','hide','restore','remove','dismiss'))
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
from private.institution_audit a where a.event='institution_restricted'
union all
select 'enforcement_appeal',case when c.domain='event' then 'events' when c.domain='feature' then 'features' else 'accounts' end,
  h.id,case when c.domain='event' then 'event' else 'account' end,
  case when c.domain='event' then a.event_id else c.subject_id end,null,'recorded','appeal_'||h.action,h.occurred_at,h.actor_id
from private.m24_events h join private.m24_cases c on c.id=h.case_id
left join feed_data.event_audit a on c.domain='event' and a.id=c.decision_id;
create or replace function private.m21_report_allowed(r private.m21_report_source,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select case r.domain
    when 'events' then not private.m24_event_conflict(p_actor,r.target_id)
    when 'projects' then r.excluded_reporter is distinct from p_actor and exists (
      select from private.community_projects p where p.id=r.target_id and not private.project_conflicted(p,p_actor))
    when 'trust' then r.excluded_reporter is distinct from p_actor and r.excluded_subject is distinct from p_actor
      and not private.institution_report_conflict(p_actor,r.organization_id)
    else true end
$$;
create or replace function public.m21_moderation_center_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
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
      'pendingAppeals',coalesce((safety->>'pendingAppeals')::bigint,0)+(select count(*) from private.m24_cases c
        where c.status in ('submitted','assigned','correction','protected_pending')),
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
      'status',status,'action',action,'occurredAt',occurred_at,'sortAt',sort_at,'expiresAt',expires_at,'actorRef',actor_ref,
      'caseReference',case when source='enforcement_appeal' then (select h.case_id from private.m24_events h where h.id=page.id)
        when source='event_moderation' then (select a.report_id from feed_data.event_audit a where a.id=page.id)
        when source='account_enforcement' then
        case when p_view='restrictions' then id else (select h.case_id from private.m22_account_history h where h.id=page.id) end
        when source='feature_enforcement' then case when p_view='restrictions' then id
          else (select h.case_id from private.m23_history h where h.id=page.id) end end,
      'capability',case when source='feature_enforcement' then case when p_view='restrictions'
        then (select r.capability from private.m23_restrictions r where r.id=page.id)
        else (select h.capability from private.m23_history h where h.id=page.id) end end
    ) order by sort_at desc,source collate "C" desc,id desc),'[]'::jsonb)) from page
  );
end
$$;
create or replace function public.a1a_audit_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
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
      sources:=array['platform_admin','post_moderation','comment_moderation','event_moderation','enforcement_appeal'];
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
