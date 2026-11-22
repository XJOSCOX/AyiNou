-- Resolve a redundant ordinary application in the same transaction as the gold grant.
alter table private.founder_supersession_events
  drop constraint founder_supersession_events_event_check,
  add constraint founder_supersession_events_event_check check
    (event in ('member_consented','grant_initiated','grant_committed','application_resolved','application_reconciled'));

create or replace function private.founder_application_resolution(
  a private.verification_applications,p_subject uuid
) returns text language sql stable set search_path='' as $$
  select case
    when a.id is null or a.status<>'pending' then 'application_completed'
    when not private.institution_actor(p_subject) or exists (
      select from private.platform_claim_approval_holds h
      where h.application_id=a.id and h.lifted_at is null and h.expires_at>statement_timestamp()
    ) or exists (
      select from public.verification_records v where v.user_id=p_subject and v.verification_type='identity'
        and v.source='review' and v.status='verified' and v.publication_held_at is not null
    ) then 'application_held'
    when 'identity'=any(private.reviewed_personal_claims(p_subject)) then 'application_completed'
    else 'superseded_by_founder_verification'
  end
$$;
revoke all on function private.founder_application_resolution(private.verification_applications,uuid)
  from public,anon,authenticated,service_role;

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

-- Reconcile eligible existing live grants. Append the outcome without rewriting earlier history.
do $$
declare
  at_time timestamptz;
begin
  perform pg_advisory_xact_lock(20261120,300);
  at_time := clock_timestamp();
  with candidates as (
    select a.id,a.revision,a.status,e.id as grant_event
    from private.verification_applications a
    join private.founder_identity_grants g on g.subject_id=a.applicant_id
    join private.founder_identity_cases c on c.id=g.case_id and c.state='granted'
    join private.founder_identity_events e on e.case_id=g.case_id and e.actor_id=g.issuer_id
      and e.action='grant' and e.next_state='granted'
    where a.organization_id is null and a.kind='identity' and a.status='pending'
      and 'founder'=any(private.personal_identity_provenance(a.applicant_id))
      and private.founder_application_resolution(a,a.applicant_id)='superseded_by_founder_verification'
    for no key update of a
  ), closed as (
    update private.verification_applications a set status='closed',decided_at=at_time,
      closed_by_founder_event_id=m.grant_event
    from candidates m where a.id=m.id returning m.*
  )
  insert into private.founder_supersession_events(founder_event_id,event,application_id,application_revision,application_status,reason,occurred_at)
    select grant_event,'application_reconciled',id,revision,status,'superseded_by_founder_verification',at_time from closed;
end;
$$;

create or replace function private.founder_supersession_card(c private.founder_identity_cases)
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
    where e.case_id=c.id and e.action in ('grant','supersede') and x.event in ('application_resolved','application_reconciled')
    order by x.occurred_at desc,e.id limit 1;
  if outcome='superseded_by_founder_verification' and a.status is distinct from 'closed' then
    select v.* into a from private.verification_applications v join private.founder_identity_events e on e.id=v.closed_by_founder_event_id
    where e.case_id=c.id and v.status='closed' order by v.decided_at desc,v.id limit 1;
  end if;
  if c.state='granted' and outcome is distinct from 'superseded_by_founder_verification' and a.status is distinct from 'pending' then
    select * into a from private.verification_applications where applicant_id=c.subject_id and kind='identity' and status='pending';
  end if;
  return jsonb_build_object('regularApplication',case when a.id is not null then
    jsonb_build_object('id',a.id,'revision',a.revision,'status',a.status) end,
    'supersessionConsented',s.founder_event_id is not null,
    'supersessionOutcome',coalesce(outcome,case when s.founder_event_id is not null then private.founder_supersession_reason(a,s,c.subject_id) end));
end;
$$;

create or replace function public.verification_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,
    'organizationName',o.name,'decidedAt',a.decided_at,'rationale',r.rationale,
    'closureReason',case when a.status='closed' and exists(
      select 1 from private.founder_supersession_events s where s.application_id=a.id
        and s.event in ('application_resolved','application_reconciled') and s.reason='superseded_by_founder_verification')
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
        and s.event in ('application_resolved','application_reconciled') and s.reason='superseded_by_founder_verification')
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
