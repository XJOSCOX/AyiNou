alter table public.verification_records add column publication_held_at timestamptz;

create function private.reviewed_personal_claims(p_user uuid)
returns text[] language sql stable security definer set search_path='' as $$
  select array(select v.verification_type from public.verification_records v
    where v.user_id=p_user and v.source='review' and v.status='verified' and v.publication_held_at is null
      and v.verification_type in ('identity','notable_person') and private.institution_actor(p_user)
    order by v.verification_type);
$$;
revoke all on function private.reviewed_personal_claims(uuid) from public,anon,authenticated,service_role;

create function public.personal_verification_for_api(p_user uuid)
returns text[] language sql stable security definer set search_path='' as $$
  select private.reviewed_personal_claims(p_user);
$$;
revoke all on function public.personal_verification_for_api(uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_verification_for_api(uuid) to service_role;

create or replace function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_action='grant' and p_value='administrator' then
    perform pg_advisory_xact_lock(20261120,300);
    if not private.platform_admin(p_actor) or p_subject is null or p_actor=p_subject
      then raise exception 'access denied' using errcode='42501'; end if;
    perform 1 from public.verification_records where user_id=p_subject and verification_type in ('identity','notable_person')
      and status='verified' and source='review' and publication_held_at is null for share;
    if not found then raise exception 'active personal verification required' using errcode='PVE01'; end if;
  end if;
  perform private.admin_account_action_for_api(p_actor,p_subject,p_action,p_value,p_reason);
end;
$$;

create or replace function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(row.account || jsonb_build_object(
    'verified',cardinality(private.reviewed_personal_claims((row.account->>'id')::uuid))>0,
    'bootstrapTrust',exists(select 1 from private.platform_bootstrap b where b.user_id=(row.account->>'id')::uuid))
    order by row.position),'[]'::jsonb)
  from jsonb_array_elements(private.admin_accounts_for_api(p_actor,p_query,p_offset)) with ordinality as row(account,position);
$$;

create function public.assign_verification_reviewer_for_client(p_application uuid,p_handle text,p_assign boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item private.verification_applications; reviewer uuid; actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_assign is null or not feed_data.group_reason(p_reason) then raise exception 'invalid assignment' using errcode='22023'; end if;
  select * into item from private.verification_applications where id=p_application and status in ('pending','approved') for update;
  select user_id into reviewer from public.profiles where username=p_handle;
  if item.id is null or private.institution_conflicted(actor,item)
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

create table private.verification_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.verification_applications(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  assigned boolean not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index verification_assignment_audit_application on private.verification_assignment_audit(application_id,created_at,id);
alter table private.verification_assignment_audit enable row level security;
revoke all on private.verification_assignment_audit from public,anon,authenticated,service_role;
revoke all on function public.assign_verification_reviewer_for_client(uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.assign_verification_reviewer_for_client(uuid,text,boolean,text) to authenticated;

create or replace function feed_data.author_projection(p_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName',p.display_name,'username',p.username,
    'avatarPath',case when p.avatar_asset is not null then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'personalClaims',private.reviewed_personal_claims(p.user_id),
    'verified',exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id
      and v.status='verified' and v.verification_type in ('identity','notable_person'))
  ) from public.profiles p
  where p.user_id=p_author and p.is_visible and p.display_name is not null
    and private.member_discoverable(p.user_id) and private.institution_actor(p_user=>p_author);
$$;

create or replace function feed_data.member_card(p public.profiles)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id','member:'||p.username,'kind','member','handle',p.username,'name',p.display_name,
    'personalClaims',private.reviewed_personal_claims(p.user_id),
    'verified',exists(select 1 from public.verification_records v where v.source='review' and v.publication_held_at is null and v.user_id=p.user_id and v.status='verified'
      and v.verification_type in ('identity','notable_person')),
    'following',exists(select 1 from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id),
    'self',coalesce(auth.uid()=p.user_id,false));
$$;

create or replace function public.search_discovery_for_client(p_kind text,p_search text,p_verified boolean,p_category text,
  p_country text,p_department text,p_after text,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  search text:=lower(btrim(coalesce(p_search,'')));
  pattern text;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'discovery_search',90);
  if p_kind is null or p_kind not in ('people','institutions') or p_limit is null or p_limit not between 1 and 20
    or search ~ '[[:cntrl:]]' or char_length(search)>80 or char_length(search)=1
    or char_length(coalesce(p_after,''))>40
    or (p_kind='people' and (p_category is not null or p_country is not null or p_department is not null))
  then raise exception 'invalid search' using errcode='22023'; end if;
  pattern:=replace(replace(replace(search,'!','!!'),'%','!%'),'_','!_')||'%';
  if p_kind='people' then
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from public.profiles x where x.is_visible and x.display_name is not null and x.username is not null
        and x.username>coalesce(p_after,'') and (search='' or x.username like pattern escape '!'
          or lower(x.display_name) like pattern escape '!')
        and feed_data.followable_member(x)
        and (not coalesce(p_verified,false) or exists(select 1 from public.verification_records v
          where v.user_id=x.user_id and v.source='review' and v.publication_held_at is null and v.status='verified' and v.verification_type in ('identity','notable_person')))
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(feed_data.institution_card(o) order by o.handle) from (
    select x.* from private.organizations x where x.status='active' and x.verification_status<>'revoked'
      and x.handle>coalesce(p_after,'') and (search='' or x.handle like pattern escape '!' or lower(x.name) like pattern escape '!')
      and (not coalesce(p_verified,false) or x.verification_status='verified')
      and (p_category is null or x.kind=p_category) and (p_country is null or x.country_code=p_country)
      and (p_department is null or x.department_code=p_department)
    order by x.handle limit p_limit+1
  ) o),'[]'::jsonb);
end;
$$;

create or replace function private.build_community_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  with eligible as (
    select u.id, m.residence_country_code, m.residence_department_code
    from auth.users u
    left join public.member_private m on m.user_id = u.id
    left join public.member_metric_exclusions x on x.user_id = u.id
    where u.deleted_at is null
      and not u.is_anonymous
      and (u.banned_until is null or u.banned_until <= now())
      and x.user_id is null
  ),
  totals as (
    select count(*)::bigint as registered,
      count(*) filter (where residence_country_code = 'HT')::bigint as haiti,
      count(*) filter (where residence_country_code is not null and residence_country_code <> 'HT')::bigint as diaspora,
      count(*) filter (where residence_country_code is null)::bigint as unknown,
      count(*) filter (where residence_country_code = 'HT' and residence_department_code is null)::bigint as haiti_unassigned,
      count(*) filter (where exists (
        select 1 from public.user_activity_daily a
        where a.user_id = eligible.id and a.activity_day >= (now() at time zone 'utc')::date - 29
      ))::bigint as active,
      count(*) filter (where exists (
        select 1 from public.verification_records v
        where v.user_id = eligible.id and v.status = 'verified' and v.source='review' and v.publication_held_at is null
          and private.institution_actor(eligible.id)
          and v.verification_type in ('identity', 'notable_person')
      ))::bigint as verified
    from eligible
  ),
  department_counts as (
    select d.code, d.name, count(e.id)::bigint as members
    from public.departments d
    left join eligible e on e.residence_country_code = 'HT' and e.residence_department_code = d.code
    group by d.code, d.name
  ),
  country_counts as (
    select residence_country_code as code, count(*)::bigint as members
    from eligible
    where residence_country_code is not null and residence_country_code <> 'HT'
    group by residence_country_code
  ),
  atomic_counts as (
    select unknown as members from totals
    union all select haiti_unassigned from totals
    union all select members from department_counts
    union all select members from country_counts
  ),
  privacy as (
    select not exists(select 1 from atomic_counts where members between 1 and 9) as geographic_safe
  )
  select jsonb_build_object(
    'updatedAt', now(),
    'minimumCohort', 10,
    'registered', case when t.registered = 0 or t.registered >= 10 then t.registered else null end,
    'active', case when t.active = 0 or t.active >= 10 then t.active else null end,
    'verified', case when t.verified = 0 or t.verified >= 10 then t.verified else null end,
    'geographyAvailable', p.geographic_safe,
    'haiti', case when p.geographic_safe then t.haiti else null end,
    'diaspora', case when p.geographic_safe then t.diaspora else null end,
    'unknown', case when p.geographic_safe then t.unknown else null end,
    'representedDepartments', case when p.geographic_safe then
      (select count(*) from department_counts where members > 0) else null end,
    'departments', case when p.geographic_safe then
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'members', members) order by code), '[]'::jsonb) from department_counts)
      else null end,
    'diasporaCountries', case when p.geographic_safe then
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'members', members) order by code), '[]'::jsonb) from country_counts)
      else null end
  ) into result
  from totals t cross join privacy p;

  return result;
end;
$$;

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
  insert into private.verification_applications(applicant_id,organization_id,membership_id,organization_subject,kind)
    values(p_actor,p_org,membership,case when p_kind='claim' then private.institution_subject(o) end,p_kind) returning id into application;
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
  if a.kind in ('identity','notable_person') and not exists(select 1 from private.verification_review_work
    where application_id=a.id and reviewer_id=p_actor) then raise exception 'assignment required' using errcode='PVT05'; end if;
  if (p_decision='revoke' and a.status<>'approved') or (p_decision<>'revoke' and a.status<>'pending')
  then raise exception 'decision unavailable' using errcode='55000'; end if;
  if p_decision='approve' then
    if not private.institution_actor(a.applicant_id) then raise exception 'applicant unavailable' using errcode='55000'; end if;
    if a.kind='claim' and (o.verification_status='verified' or o.status<>'active'
      or a.organization_subject is distinct from private.institution_subject(o)
      or private.institution_role(a.applicant_id,org) is not null)
    then raise exception 'claim unavailable' using errcode='55000'; end if;
    if a.kind in ('organization','government') and private.institution_role(a.applicant_id,org) is distinct from 'owner'
    then raise exception 'applicant no longer owner' using errcode='55000'; end if;
    if a.kind='representative' and not exists (
      select 1 from private.organization_memberships where id=a.membership_id and organization_id=org
        and user_id=a.applicant_id and revoked_at is null and (expires_at is null or expires_at>now())
    ) then raise exception 'representative unavailable' using errcode='55000'; end if;
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
      and (a.kind not in ('identity','notable_person') or exists(select 1 from private.verification_review_work w
        where w.application_id=a.id and w.reviewer_id=r.reviewer_id and w.assigned_at<=r.created_at))
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
      update private.organization_memberships set revoked_at=now(),verified_at=null where organization_id=org and revoked_at is null;
      update private.organization_invitations set state='revoked',closed_at=now() where organization_id=org and state='pending';
      update private.verification_applications set status='revoked',decided_at=now()
        where organization_id=org and kind in ('organization','government','representative') and status='pending';
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
  if (a.status<>'pending' and not(a.kind in ('identity','notable_person') and a.status='approved')) or p_claim is null then raise exception 'work unavailable' using errcode='55000'; end if;
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
    'evidence',case when a.kind in ('identity','notable_person') and not a.assigned then '[]'::jsonb else coalesce((select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id),'[]'::jsonb) end,
    'reviews',case when a.kind in ('identity','notable_person') and not a.assigned then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('decision',r.decision,'rationale',r.rationale,'createdAt',r.created_at,
      'isSelf',r.reviewer_id=p_actor) order by r.created_at) from private.verification_reviews r where r.application_id=a.id),'[]'::jsonb) end, 'assignmentRequired',a.kind in ('identity','notable_person'),
    'eligibleReviewers',case when a.kind in ('identity','notable_person') then (select count(*) from private.verification_reviewers vr
      where private.institution_reviewer(vr.user_id) and not private.institution_conflicted(vr.user_id,(select original from private.verification_applications original where original.id=a.id))) end
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
alter table public.verification_records add column review_application_id uuid
  references private.verification_applications(id) on delete set null;
update public.verification_records v set review_application_id=(
  select a.id from private.verification_applications a where a.applicant_id=v.user_id and a.kind=v.verification_type
    and a.status='approved' order by a.decided_at desc nulls last,a.id desc limit 1
) where v.source='review' and v.status='verified';

create function public.verification_assignment_queue_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',item.id,'kind',item.kind,'status',item.status,
    'applicantUsername',p.username,'organizationName',o.name,'createdAt',item.created_at,
    'assigned',coalesce((select jsonb_agg(jsonb_build_object('handle',u.username,'eligible',
      private.institution_reviewer(w.reviewer_id) and not private.institution_conflicted(w.reviewer_id,item))
      order by w.assigned_at) from private.verification_review_work w join public.profiles u on u.user_id=w.reviewer_id
      where w.application_id=item.id),'[]'),
    'eligibleReviewers',(select count(*) from private.verification_reviewers r
      where private.institution_reviewer(r.user_id) and not private.institution_conflicted(r.user_id,item)
    )) order by item.created_at,item.id) from private.verification_applications item join (
      select a.id from private.verification_applications a where a.status='pending' and not private.institution_conflicted(actor,a)
      order by a.created_at,a.id limit 40
    ) candidate on item.id=candidate.id left join public.profiles p on p.user_id=item.applicant_id
    left join private.organizations o on o.id=item.organization_id),'[]');
end;
$$;
revoke all on function public.verification_assignment_queue_for_client() from public,anon,authenticated,service_role;
grant execute on function public.verification_assignment_queue_for_client() to authenticated;

create or replace function public.follow_status_for_client(p_kind text,p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  member public.profiles;
  org private.organizations;
  actor uuid:=auth.uid();
begin
  if actor is not null and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind='member' then
    select p.* into member from public.profiles p where p.username=p_key and feed_data.followable_member(p);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return jsonb_build_object(
      'following', exists(select 1 from feed_data.member_follows f where f.follower_id=actor and f.target_id=member.user_id),
      'canFollow', actor is not null and actor<>member.user_id,
      'verified',feed_data.member_card(member)->'verified',
      'personalClaims',private.reviewed_personal_claims(member.user_id),
      'followerCount',(select count(*) from feed_data.member_follows f where f.target_id=member.user_id and feed_data.follower_visible(f.follower_id)),
      'followingCount',(select count(*) from feed_data.member_follows f where f.follower_id=member.user_id and feed_data.follower_visible(f.target_id))
        +(select count(*) from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
          where f.follower_id=member.user_id and feed_data.followable_institution(o))
    );
  elsif p_kind='institution' then
    if p_key is null or p_key !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid identifier' using errcode='22023'; end if;
    select o.* into org from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return jsonb_build_object(
      'following',exists(select 1 from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=org.id),
      'canFollow',actor is not null,
      'verified',org.verification_status='verified',
      'followerCount',(select count(*) from feed_data.institution_follows f where f.organization_id=org.id and feed_data.follower_visible(f.follower_id)),
      'followingCount',null
    );
  end if;
  raise exception 'invalid target' using errcode='22023';
end;
$$;
