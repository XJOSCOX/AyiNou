-- Keep the original application and its review/evidence rows when a Founder grant resolves it.
alter table private.verification_applications
  add column closed_by_founder_event_id uuid references private.founder_identity_events(id) on delete restrict,
  drop constraint verification_applications_status_check,
  add constraint verification_applications_status_check
    check (status in ('pending','approved','rejected','revoked','closed')),
  add constraint verification_applications_founder_closure_check
    check ((status='closed')=(closed_by_founder_event_id is not null)
      and (closed_by_founder_event_id is null or (kind='identity' and organization_id is null)));

create index verification_applications_founder_closure
  on private.verification_applications(closed_by_founder_event_id)
  where closed_by_founder_event_id is not null;

create function private.close_identity_application_on_founder_grant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update private.verification_applications a
    set status='closed',decided_at=new.occurred_at,closed_by_founder_event_id=new.id
    from private.founder_identity_grants g
    where g.case_id=new.case_id and g.issuer_id=new.actor_id
      and a.applicant_id=g.subject_id and a.kind='identity' and a.organization_id is null
      and a.status='pending' and a.created_at<=new.occurred_at;
  return new;
end;
$$;
revoke all on function private.close_identity_application_on_founder_grant()
  from public,anon,authenticated,service_role;

create trigger close_identity_application_on_founder_grant
  after insert on private.founder_identity_events for each row
  when (new.action='grant' and new.next_state='granted')
  execute function private.close_identity_application_on_founder_grant();

-- Reconcile pending applications that were already open at a currently effective grant.
update private.verification_applications a
  set status='closed',decided_at=e.occurred_at,closed_by_founder_event_id=e.id
  from private.founder_identity_grants g
  join private.founder_identity_cases c on c.id=g.case_id and c.state='granted'
  join private.founder_identity_events e on e.case_id=g.case_id and e.actor_id=g.issuer_id
    and e.action='grant' and e.next_state='granted'
  where a.applicant_id=g.subject_id and a.kind='identity' and a.organization_id is null
    and a.status='pending' and a.created_at<=e.occurred_at;

-- Preserve the reviewer's scope, conflict checks and evidence access in history.
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
