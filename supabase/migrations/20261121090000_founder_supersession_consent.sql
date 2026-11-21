-- The existing singleton bootstrap receipt is the committed founding provenance.
-- Neither stored administrator assignments nor public profile attributes can create it.
create function private.platform_founder(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from private.platform_bootstrap b
    where b.singleton and b.user_id=p_user
      and exists(select 1 from private.platform_admin_audit a where a.subject_id=b.user_id
        and a.event='first_account_bootstrapped' and a.occurred_at>=b.completed_at)
  );
$$;
revoke all on function private.platform_founder(uuid) from public,anon,authenticated,service_role;

-- Require affirmative, application-specific consent before a Founder grant can supersede ordinary work.
drop trigger close_identity_application_on_founder_grant on private.founder_identity_events;
drop function private.close_identity_application_on_founder_grant();

alter table private.verification_applications add column revision integer not null default 1 check (revision>0);

create table private.founder_supersession_events (
  founder_event_id uuid not null references private.founder_identity_events(id) on delete restrict,
  event text not null check (event in ('member_consented','grant_initiated','grant_committed','application_resolved')),
  application_id uuid references private.verification_applications(id) on delete set null,
  application_revision integer check (application_revision>0),
  application_status text check (application_status in ('pending','approved','rejected','revoked','closed')),
  reason text not null check (reason in ('member_opted_in','founder_confirmed','no_consent','superseded_by_founder_verification',
    'application_completed','stale_application','application_held')),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key(founder_event_id,event)
);
create index founder_supersession_application on private.founder_supersession_events(application_id)
  where application_id is not null;
alter table private.founder_supersession_events enable row level security;
revoke all on private.founder_supersession_events from public,anon,authenticated,service_role;

create function private.advance_verification_application_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='verification_reviews' then
    update private.verification_applications set revision=revision+1 where id=new.application_id;
  elsif new.status is distinct from old.status then
    new.revision := old.revision+1;
  end if;
  return new;
end;
$$;
create trigger advance_verification_application_status_revision before update of status on private.verification_applications
  for each row execute function private.advance_verification_application_revision();
create trigger advance_verification_application_review_revision after insert on private.verification_reviews
  for each row execute function private.advance_verification_application_revision();

create function private.founder_supersession_attempt(c private.founder_identity_cases)
returns private.founder_supersession_events language sql stable set search_path='' as $$
  select s.* from private.founder_supersession_events s
  join private.founder_identity_events e on e.id=s.founder_event_id
  where e.case_id=c.id and e.actor_id=c.subject_id and e.action in ('consent','supersede')
    and e.policy_version=c.consent_version and c.consent_at is not null and s.event='member_consented'
  order by e.occurred_at desc,e.id limit 1
$$;

create function private.founder_supersession_reason(
  a private.verification_applications,s private.founder_supersession_events,p_subject uuid
) returns text language plpgsql stable set search_path='' as $$
begin
  if s.founder_event_id is null then return 'no_consent'; end if;
  if a.id is null then return 'stale_application'; end if;
  if a.status<>'pending' then return 'application_completed'; end if;
  if not private.institution_actor(p_subject) or exists (
    select 1 from private.platform_claim_approval_holds h
    where h.application_id=a.id and h.lifted_at is null and h.expires_at>statement_timestamp()
  ) or exists(select 1 from public.verification_records v where v.user_id=p_subject and v.verification_type='identity'
    and v.source='review' and v.status='verified' and v.publication_held_at is not null)
  then return 'application_held'; end if;
  if a.revision<>s.application_revision then return 'stale_application'; end if;
  if 'identity'=any(private.reviewed_personal_claims(p_subject)) then return 'application_completed'; end if;
  return 'superseded_by_founder_verification';
end;
$$;

-- Acquire the regular review/hold/restriction lock before the original Founder case lock.
-- The original command retains its session, authority, version, proof and idempotency checks.
alter function public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean) set schema private;
revoke all on function private.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;

create function public.founder_identity_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_admin boolean,p_id uuid,p_username text,p_action text,p_expected integer,p_policy integer,p_request uuid,p_reason text,p_disclose boolean,p_no_conflict boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
  if p_action in ('grant','release') then
    perform pg_advisory_xact_lock(20261120,300);
    if not private.platform_founder(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  end if;
  receipt := private.founder_identity_command_for_api(p_actor,p_session,p_aal2,p_totp_at,p_admin,p_id,p_username,p_action,p_expected,
    p_policy,p_request,p_reason,p_disclose,p_no_conflict);
  if p_action='consent' and exists(select 1 from private.founder_supersession_events
    where founder_event_id=(receipt->>'auditId')::uuid and event='member_consented')
  then raise exception 'request conflict' using errcode='O2002'; end if;
  return receipt;
end;
$$;

-- The member opts in during the existing Founder consent action. The server validates the
-- submitted application and revision after the original consent command locks the case.
create function public.founder_supersession_consent_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp_at bigint,
  p_id uuid,p_expected integer,p_policy integer,p_request uuid,p_disclose boolean,p_application uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  receipt jsonb;
  prior private.founder_supersession_events;
  a private.verification_applications;
  audit_id uuid;
  replay boolean;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261121030000));
  select exists(select 1 from private.founder_identity_events where actor_id=p_actor and request_id=p_request) into replay;
  receipt := private.founder_identity_command_for_api(p_actor,p_session,p_aal2,p_totp_at,false,p_id,null,'consent',
    p_expected,p_policy,p_request,null,p_disclose,null);
  audit_id := (receipt->>'auditId')::uuid;
  if replay then
    select * into prior from private.founder_supersession_events where founder_event_id=audit_id and event='member_consented';
    if not found or prior.application_id is distinct from p_application or prior.application_revision is distinct from p_revision
    then raise exception 'request conflict' using errcode='O2002'; end if;
    return receipt;
  end if;
  select * into a from private.verification_applications where id=p_application and applicant_id=p_actor
    and kind='identity' and organization_id is null for no key update;
  if not found then raise exception 'application unavailable' using errcode='O2003'; end if;
  if a.status<>'pending' or a.revision is distinct from p_revision
  then raise exception 'application changed' using errcode='O2004'; end if;
  insert into private.founder_supersession_events(founder_event_id,event,application_id,application_revision,application_status,reason)
    values(audit_id,'member_consented',a.id,a.revision,a.status,'member_opted_in');
  return receipt;
end;
$$;

create function private.resolve_founder_supersession()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  c private.founder_identity_cases;
  a private.verification_applications;
  s private.founder_supersession_events;
  outcome text;
begin
  select x.* into strict c from private.founder_identity_cases x join private.founder_identity_grants g on g.case_id=x.id
    where x.id=new.case_id and g.issuer_id=new.actor_id and x.version=new.case_version and x.state='granted';
  s := private.founder_supersession_attempt(c);
  select * into a from private.verification_applications
    where applicant_id=c.subject_id and kind='identity' and organization_id is null
      and (id=s.application_id or (s.founder_event_id is null and status in ('pending','approved')))
    order by created_at desc,id limit 1 for no key update;
  outcome := private.founder_supersession_reason(a,s,c.subject_id);
  if outcome='superseded_by_founder_verification' then
    update private.verification_applications
      set status='closed',decided_at=new.occurred_at,closed_by_founder_event_id=new.id
      where id=a.id;
  end if;
  insert into private.founder_supersession_events(founder_event_id,event,application_id,application_revision,application_status,reason,occurred_at)
    values(new.id,'grant_initiated',null,null,null,'founder_confirmed',
       (select issued_at from private.founder_identity_grants where case_id=c.id)),
      (new.id,'grant_committed',null,null,null,'founder_confirmed',new.occurred_at),
      (new.id,'application_resolved',a.id,a.revision,a.status,outcome,new.occurred_at);
  return new;
end;
$$;
create trigger resolve_founder_supersession after insert on private.founder_identity_events for each row
  when (new.action='grant' and new.next_state='granted')
  execute function private.resolve_founder_supersession();

create function private.founder_supersession_card(c private.founder_identity_cases)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  a private.verification_applications;
  s private.founder_supersession_events;
  outcome text;
begin
  s := private.founder_supersession_attempt(c);
  select * into a from private.verification_applications
    where applicant_id=c.subject_id and kind='identity' and organization_id is null
      and (id=s.application_id or (s.founder_event_id is null and status in ('pending','approved')))
    order by created_at desc,id limit 1;
  select x.reason into outcome from private.founder_supersession_events x join private.founder_identity_events e on e.id=x.founder_event_id
    where e.case_id=c.id and e.action in ('grant','supersede') and x.event='application_resolved'
    order by e.occurred_at desc,e.id limit 1;
  if c.state='granted' and outcome is distinct from 'superseded_by_founder_verification' and a.status is distinct from 'pending' then
    select * into a from private.verification_applications where applicant_id=c.subject_id and kind='identity' and status='pending';
  end if;
  return jsonb_build_object('regularApplication',case when a.id is not null then
    jsonb_build_object('id',a.id,'revision',a.revision,'status',a.status) end,
    'supersessionConsented',s.founder_event_id is not null,
    'supersessionOutcome',coalesce(outcome,case when s.founder_event_id is not null then private.founder_supersession_reason(a,s,c.subject_id) end));
end;
$$;

revoke all on function private.advance_verification_application_revision(),private.resolve_founder_supersession(),
  private.founder_supersession_attempt(private.founder_identity_cases),
  private.founder_supersession_reason(private.verification_applications,private.founder_supersession_events,uuid),
  private.founder_supersession_card(private.founder_identity_cases)
  from public,anon,authenticated,service_role;
revoke all on function public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_supersession_consent_for_api(uuid,uuid,boolean,bigint,uuid,integer,integer,uuid,boolean,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.founder_identity_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,text,text,integer,integer,uuid,text,boolean,boolean),
  public.founder_supersession_consent_for_api(uuid,uuid,boolean,bigint,uuid,integer,integer,uuid,boolean,uuid,integer) to service_role;

create or replace function private.founder_identity_card(c private.founder_identity_cases,p_admin boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'version',c.version,'policyVersion',c.policy_version,
    'state',c.state,'consented',c.consent_version=c.policy_version and c.consent_at is not null,
    'disclose',c.disclose,'decision',c.decision,'updatedAt',c.updated_at,
    'correctionPending',exists(select 1 from private.founder_identity_events e where e.case_id=c.id and e.action='correction'))
  || private.founder_supersession_card(c)
  || case when p_admin then jsonb_build_object(
    'username',(select p.username from public.profiles p where p.user_id=c.subject_id),
    'conflicted',c.conflicted,'proofReady',exists(select 1 from private.founder_identity_proofs p
      where p.case_id=c.id and p.bound_version=c.version-1 and p.expires_at>statement_timestamp() and p.consumed_at is null),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h."occurredAt" desc,h.id)
      from (select e.id,e.action,e.reason,e.occurred_at as "occurredAt",e.case_version as version
        from private.founder_identity_events e where e.case_id=c.id
        order by e.occurred_at desc,e.id limit 25) h),'[]'::jsonb)) else '{}'::jsonb end
$$;

create or replace function public.verification_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,
    'organizationName',o.name,'decidedAt',a.decided_at,'rationale',r.rationale,
    'closureReason',case when a.status='closed' and exists(
      select 1 from private.founder_supersession_events s where s.application_id=a.id
        and s.event='application_resolved' and s.reason='superseded_by_founder_verification')
      then 'superseded_by_founder_verification' end,
    'eligibleApprovals',case when a.status='pending' then (select count(distinct vote.reviewer_id)
      from private.verification_reviews vote where vote.application_id=a.id and vote.decision='approve'
        and private.institution_reviewer(vote.reviewer_id)
        and not private.institution_conflicted(vote.reviewer_id,(select app from private.verification_applications app where app.id=a.id))
        and exists(select 1 from private.verification_review_work w
          where w.application_id=a.id and w.reviewer_id=vote.reviewer_id and w.assigned_at<=vote.created_at)) end,
    'canAppeal',coalesce(a.status in ('rejected','revoked') and r.id is not null and r.created_at>now()-interval '14 days'
      and not exists(select 1 from private.verification_appeals v where v.decision_id=r.id
        or (v.application_id=a.id and v.outcome='pending')),false)) order by a.created_at desc,a.id)
    from (select * from private.verification_applications where applicant_id=p_actor order by created_at desc,id limit 50) a
    left join private.organizations o on o.id=a.organization_id
    left join lateral (select r.id,r.rationale,r.created_at from private.verification_reviews r where r.application_id=a.id
      and r.decision=case a.status when 'rejected' then 'reject' when 'revoked' then 'revoke' when 'approved' then 'approve' end
      order by r.created_at desc,r.id desc limit 1) r on true),'[]');
end;
$$;

create or replace function public.verification_queue_for_api(p_actor uuid,p_status text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_reviewer(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_status is null or p_status not in ('pending','assigned','approved','rejected','revoked','closed')
  then raise exception 'invalid status' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,'decidedAt',a.decided_at,'organizationName',o.name,'organizationHandle',o.handle,
    'applicantName',p.display_name,'applicantUsername',p.username,'applicantId',a.applicant_id,
    'assignedToMe',a.assigned,
    'closureReason',case when a.status='closed' and exists(
      select 1 from private.founder_supersession_events s where s.application_id=a.id
        and s.event='application_resolved' and s.reason='superseded_by_founder_verification')
      then 'superseded_by_founder_verification' end,
    'founderVerified',a.organization_id is null and public.founder_identity_public_for_api(a.applicant_id),
    'evidence',case when not a.assigned then '[]'::jsonb else coalesce((select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id),'[]'::jsonb) end,
    'reviews',case when not a.assigned then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('decision',r.decision,'rationale',r.rationale,'createdAt',r.created_at,
      'isSelf',r.reviewer_id=p_actor) order by r.created_at) from private.verification_reviews r where r.application_id=a.id),'[]'::jsonb) end, 'assignmentRequired',true,
    'eligibleReviewers',(select count(*) from private.verification_reviewers vr
      where private.institution_reviewer(vr.user_id) and not private.institution_conflicted(vr.user_id,(select original from private.verification_applications original where original.id=a.id)))
  ) order by a.created_at,a.id)
    from (select x.*,w.application_id is not null as assigned from private.verification_applications x
      left join private.verification_review_work w on w.application_id=x.id and w.reviewer_id=p_actor
      where x.status=case when p_status='assigned' then 'pending' else p_status end
        and (p_status<>'assigned' or w.application_id is not null) and not private.institution_conflicted(p_actor,x)
      order by x.created_at,x.id limit 50) a
    left join private.organizations o on o.id=a.organization_id
    left join public.profiles p on p.user_id=a.applicant_id),'[]'::jsonb);
end;
$$;
