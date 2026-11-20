-- Recheck institutional evidence and reviewer assignments at decision time.
alter table private.verification_applications add column reviewed_institution_snapshot jsonb;

create function private.institution_reference_count(p_urls text[])
returns bigint language sql immutable set search_path='' as $$
  select count(distinct regexp_replace(lower(split_part(substring(url from 9),'/',1)),'^www[.]',''))
    from unnest(p_urls) url;
$$;
revoke all on function private.institution_reference_count(text[]) from public,anon,authenticated,service_role;

create function private.institution_review_snapshot(o private.organizations)
returns jsonb language sql stable set search_path='' as $$
  select private.institution_subject(o) || jsonb_build_object('ownerGrant',(
    select m.id from private.organization_memberships m
    where m.organization_id=o.id and m.role='owner' and m.revoked_at is null));
$$;
revoke all on function private.institution_review_snapshot(private.organizations) from public,anon,authenticated,service_role;


create or replace function public.verification_submit_for_api(p_actor uuid,p_org uuid,p_kind text,p_evidence text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text;
  membership uuid;
  application uuid;
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
    then raise exception 'already verified' using errcode='55000'; end if;
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
  insert into private.verification_applications(applicant_id,organization_id,membership_id,organization_subject,kind,reviewed_institution_snapshot)
    values(p_actor,p_org,membership,case when p_kind='claim' then private.institution_subject(o) end,p_kind,case when p_org is not null then private.institution_review_snapshot(o) end) returning id into application;
  insert into private.verification_evidence(application_id,url) select application,url from unnest(p_evidence) as evidence(url);
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values(p_actor,p_org,application,'application_submitted');
  return application;
end;
$$;

create or replace function public.verification_decide_for_api(p_actor uuid,p_application uuid,p_decision text,p_rationale text,p_conflict_free boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a private.verification_applications;
  o private.organizations;
  org uuid;
  member uuid;
  next_status text;
begin
  perform pg_advisory_xact_lock(20261120,300);
  if not private.institution_reviewer(p_actor) or p_conflict_free is distinct from true
  then raise exception 'access denied' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approve','reject','revoke') or coalesce(char_length(btrim(p_rationale)),0) not between 10 and 1000
  then raise exception 'invalid decision' using errcode='23514'; end if;
  select organization_id,applicant_id into org,member from private.verification_applications where id=p_application;
  if coalesce(org,member) is null then raise exception 'access denied' using errcode='42501'; end if;
  if org is not null then select * into o from private.organizations where id=org for no key update; end if;
  select * into a from private.verification_applications where id=p_application for no key update;
  if a.id is null or not private.institution_reviewer(p_actor) or private.institution_conflicted(p_actor,a) then raise exception 'access denied' using errcode='42501'; end if;
  if not exists(select 1 from private.verification_review_work
    where application_id=a.id and reviewer_id=p_actor) then raise exception 'assignment required' using errcode='PVT05'; end if;
  if (p_decision='revoke' and a.status<>'approved') or (p_decision<>'revoke' and a.status<>'pending')
  then raise exception 'decision unavailable' using errcode='55000'; end if;
  if p_decision='approve' then
    if not private.institution_actor(a.applicant_id) then raise exception 'applicant unavailable' using errcode='55000'; end if;
    if org is not null then
      if o.status<>'active' or a.reviewed_institution_snapshot is distinct from private.institution_review_snapshot(o)
      then raise exception 'institution details changed' using errcode='55000'; end if;
      if private.institution_reference_count(array(select e.url from private.verification_evidence e where e.application_id=a.id))<2
      then raise exception 'insufficient evidence' using errcode='PVT11'; end if;
    end if;
    if a.kind='claim' and (o.verification_status='verified' or o.status<>'active'
      or a.organization_subject is distinct from private.institution_subject(o)
      or private.institution_role(a.applicant_id,org) is not null)
    then raise exception 'claim unavailable' using errcode='55000'; end if;
    if a.kind in ('organization','government') and private.institution_role(a.applicant_id,org) is distinct from 'owner'
    then raise exception 'applicant no longer owner' using errcode='55000'; end if;
    if a.kind='representative' and (private.institution_role(a.applicant_id,org) is null or not exists (
      select 1 from private.organization_memberships where id=a.membership_id and organization_id=org
        and user_id=a.applicant_id and revoked_at is null and (expires_at is null or expires_at>now())
    )) then raise exception 'representative unavailable' using errcode='55000'; end if;
  end if;
  if p_decision='revoke' and a.kind in ('identity','notable_person') and exists (
    select 1 from public.verification_records v where v.user_id=a.applicant_id and v.verification_type=a.kind
      and v.review_application_id is not null and v.review_application_id<>a.id
  ) then raise exception 'decision superseded' using errcode='55000'; end if;
  insert into private.verification_reviews(application_id,reviewer_id,decision,rationale)
    values(p_application,p_actor,p_decision,btrim(p_rationale));
  insert into private.institution_audit(actor_id,organization_id,subject_id,event)
    values(p_actor,org,p_application,case p_decision when 'approve' then 'approval_recorded'
      when 'reject' then 'application_rejected' else 'verification_revoked' end);
  if p_decision='approve' and not exists (
    select 1 from private.verification_reviews r where r.application_id=a.id and r.decision='approve' and r.reviewer_id<>p_actor
      and private.institution_reviewer(r.reviewer_id) and not private.institution_conflicted(r.reviewer_id,a)
      and exists(select 1 from private.verification_review_work w
        where w.application_id=a.id and w.reviewer_id=r.reviewer_id and w.assigned_at<=r.created_at)
  ) then return 'pending'; end if;
  next_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end;
  if p_decision<>'reject' then
    if a.kind in ('identity','notable_person') then
      insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at,review_application_id)
        values(a.applicant_id,a.kind,case when p_decision='approve' then 'verified' else 'revoked' end,
          p_actor,case when p_decision='approve' then now() end,a.id)
        on conflict(user_id,verification_type) do update
          set status=excluded.status,reviewed_by=excluded.reviewed_by,verified_at=excluded.verified_at,publication_held_at=null,review_application_id=excluded.review_application_id;
    elsif a.kind='representative' then
      update private.organization_memberships set verified_at=case when p_decision='approve' then now() end where id=a.membership_id;
    elsif a.kind='claim' then
      if o.verification_status='verified' then raise exception 'revoke institutional verification first' using errcode='55000'; end if;
      if p_decision='revoke' and not exists (
        select 1 from private.organization_memberships m where m.organization_id=org and m.role='owner'
          and m.user_id=a.applicant_id and m.revoked_at is null
      ) then raise exception 'ownership changed' using errcode='55000'; end if;
      update private.organization_memberships set revoked_at=now(),verified_at=null where organization_id=org and revoked_at is null;
      update private.organization_invitations set state='revoked',closed_at=now() where organization_id=org and state='pending';
      update private.verification_applications set status='revoked',decided_at=now()
        where organization_id=org and ((kind in ('organization','government') and status='pending')
          or (kind='representative' and status in ('pending','approved'))) and id<>a.id;
      if p_decision='approve' then
        insert into private.organization_memberships(organization_id,user_id,role,granted_by) values(org,a.applicant_id,'owner',p_actor);
      end if;
      insert into private.institution_audit(actor_id,organization_id,subject_id,event)
        values(p_actor,org,p_application,case when p_decision='approve' then 'ownership_transferred' else 'ownership_revoked' end);
    else
      update private.organizations set verification_status=case when p_decision='approve' then 'verified' else 'revoked' end,updated_at=now()
        where id=org;
    end if;
  end if;
  update private.verification_applications set status=next_status,decided_at=now() where id=a.id;
  if next_status='approved' then
    insert into private.institution_audit(actor_id,organization_id,subject_id,event)
      values(p_actor,org,a.id,'verification_approved');
  end if;
  return next_status;
end;
$$;

create or replace function public.verification_work_for_api(p_actor uuid,p_application uuid,p_claim boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a private.verification_applications;
begin
  if not private.institution_reviewer(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select * into a from private.verification_applications where id=p_application for no key update;
  if a.id is null or private.institution_conflicted(p_actor,a) then raise exception 'access denied' using errcode='42501'; end if;
  if a.status not in ('pending','approved') or p_claim is null then raise exception 'work unavailable' using errcode='55000'; end if;
  if p_claim then
    insert into private.verification_review_work(application_id,reviewer_id) values(p_application,p_actor) on conflict do nothing;
  else
    delete from private.verification_review_work where application_id=p_application and reviewer_id=p_actor;
  end if;
  if found then
    insert into private.institution_audit(actor_id,organization_id,subject_id,event)
    values(p_actor,a.organization_id,p_application,case when p_claim then 'review_work_claimed' else 'review_work_released' end);
  end if;
end;
$$;

create or replace function public.verification_queue_for_api(p_actor uuid,p_status text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_reviewer(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_status is null or p_status not in ('pending','assigned','approved','rejected','revoked')
  then raise exception 'invalid status' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,'organizationName',o.name,'organizationHandle',o.handle,
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

create or replace function public.verification_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,
    'organizationName',o.name,'decidedAt',a.decided_at,'rationale',r.rationale,
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
