create function private.valid_trust_text(value text,minimum integer,maximum integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(char_length(btrim(value)) between minimum and maximum
    and translate(value,E'\r\n\t','') !~ '[[:cntrl:]]',false);
$$;

create function private.valid_public_references(refs text[])
returns boolean language sql immutable set search_path='' as $$
  select coalesce(cardinality(refs),-1) between 0 and 3
    and (select count(distinct x)=count(*) from unnest(refs) x)
    and not exists(select 1 from unnest(refs) x where x is null or char_length(x)>300 or
      x !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(/[^[:space:]?#\\]*)?$');
$$;

create table private.verification_appeals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.verification_applications(id) on delete cascade,
  decision_id uuid not null unique references private.verification_reviews(id) on delete cascade,
  appellant_id uuid references auth.users(id) on delete set null,
  assigned_reviewer_id uuid references auth.users(id) on delete set null,
  explanation text not null check(private.valid_trust_text(explanation,10,1000)),
  reference_urls text[] not null check(private.valid_public_references(reference_urls)),
  outcome text not null default 'pending' check(outcome in ('pending','upheld','reconsideration')),
  rationale text check(rationale is null or private.valid_trust_text(rationale,10,1000)),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  check((outcome='pending')=(decided_at is null and rationale is null)),
  check(assigned_reviewer_id is null or assigned_reviewer_id is distinct from appellant_id)
);
create unique index verification_appeal_pending on private.verification_appeals(application_id) where outcome='pending';
create index verification_appeal_member on private.verification_appeals(appellant_id,created_at desc,id);
create index verification_appeal_reviewer on private.verification_appeals(assigned_reviewer_id,created_at,id) where outcome='pending';

create table private.verification_appeal_assignments (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references private.verification_appeals(id) on delete cascade,
  administrator_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reason text not null check(private.valid_trust_text(reason,10,500)),
  created_at timestamptz not null default clock_timestamp()
);
create index verification_appeal_assignment_history on private.verification_appeal_assignments(appeal_id,created_at,id);

create table private.impersonation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  organization_id uuid references private.organizations(id) on delete set null,
  kind text not null check(kind in ('profile','public_figure','badge','affiliation')),
  explanation text not null check(private.valid_trust_text(explanation,10,1000)),
  reference_urls text[] not null check(private.valid_public_references(reference_urls)),
  outcome text not null default 'pending' check(outcome in ('pending','dismissed','substantiated')),
  rationale text check(rationale is null or private.valid_trust_text(rationale,10,1000)),
  reviewer_id uuid references auth.users(id) on delete set null,
  claim_held text check(claim_held in ('identity','notable_person')),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  check((outcome='pending')=(decided_at is null and rationale is null)),
  check(claim_held is null or (outcome='substantiated' and kind<>'affiliation'))
);
create unique index impersonation_one_open_per_reporter
  on private.impersonation_reports(reporter_id,subject_id,kind,organization_id) nulls not distinct
  where outcome='pending' and reporter_id is not null and subject_id is not null;
create index impersonation_queue on private.impersonation_reports(created_at,id) where outcome='pending';
create index impersonation_rate on private.impersonation_reports(reporter_id,created_at desc);

alter table private.verification_appeals enable row level security;
alter table private.verification_appeal_assignments enable row level security;
alter table private.impersonation_reports enable row level security;
revoke all on private.verification_appeals,private.verification_appeal_assignments,private.impersonation_reports
  from public,anon,authenticated,service_role;

create function private.verification_appeal_reviewer_allowed(p_actor uuid,p_application private.verification_applications)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.institution_reviewer(p_actor) and not private.institution_conflicted(p_actor,p_application)
    and not exists(select 1 from private.verification_reviews r where r.application_id=p_application.id and r.reviewer_id=p_actor),false);
$$;

create function private.verification_appeal_card(v private.verification_appeals)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',v.id,'applicationId',v.application_id,'outcome',v.outcome,
    'createdAt',v.created_at,'decidedAt',v.decided_at,'rationale',v.rationale);
$$;

create function public.my_verification_appeals_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.verification_appeal_card(v) order by v.created_at desc,v.id) from
    (select * from private.verification_appeals where appellant_id=auth.uid() order by created_at desc,id limit 50) v),'[]');
end;
$$;

create function public.submit_verification_appeal_for_client(p_application uuid,p_explanation text,p_refs text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare item private.verification_applications; original private.verification_reviews; result uuid; actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if not private.valid_trust_text(p_explanation,10,1000) or not private.valid_public_references(p_refs)
    then raise exception 'invalid appeal' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'appeal_submit',10);
  select * into item from private.verification_applications where id=p_application and applicant_id=actor for update;
  if not found or item.status not in ('rejected','revoked') then raise exception 'appeal unavailable' using errcode='PVT04'; end if;
  select * into original from private.verification_reviews where application_id=p_application
    and decision=case when item.status='rejected' then 'reject' else 'revoke' end
    order by created_at desc,id desc limit 1;
  if not found then raise exception 'appeal unavailable' using errcode='PVT04'; end if;
  if original.created_at<clock_timestamp()-interval '14 days' then raise exception 'appeal expired' using errcode='PVT14'; end if;
  insert into private.verification_appeals(application_id,decision_id,appellant_id,explanation,reference_urls)
    values(item.id,original.id,actor,btrim(p_explanation),p_refs) returning id into result;
  return result;
exception when unique_violation then raise exception 'appeal already exists' using errcode='PVT09';
end;
$$;

create function public.verification_appeals_queue_for_client(p_view text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_view='assign' then
    if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(private.verification_appeal_card(v)||jsonb_build_object(
      'assigned',v.assigned_reviewer_id is not null and private.verification_appeal_reviewer_allowed(v.assigned_reviewer_id,
        (select a from private.verification_applications a where a.id=v.application_id))) order by v.created_at,v.id)
      from (select a.* from private.verification_appeals a join private.verification_applications item on item.id=a.application_id
        where a.outcome='pending' and not private.institution_conflicted(actor,item)
          and not exists(select 1 from private.verification_reviews r where r.application_id=item.id and r.reviewer_id=actor)
        order by a.created_at,a.id limit 40) v),'[]');
  elsif p_view='assigned' then
    if not private.institution_reviewer(actor) then raise exception 'access denied' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(private.verification_appeal_card(r)||jsonb_build_object(
      'explanation',v.explanation,'references',v.reference_urls,'originalRationale',v.original_rationale)
      order by v.created_at,v.id) from (
      select s.*,r.rationale as original_rationale from private.verification_appeals s
        join private.verification_applications a on a.id=s.application_id join private.verification_reviews r on r.id=s.decision_id
      where s.outcome='pending' and s.assigned_reviewer_id=actor and private.verification_appeal_reviewer_allowed(actor,a)
      order by s.created_at,s.id limit 40
    ) v join private.verification_appeals r on r.id=v.id),'[]');
  end if;
  raise exception 'invalid queue' using errcode='22023';
end;
$$;

create function public.assign_verification_appeal_for_client(p_id uuid,p_handle text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); appeal private.verification_appeals; item private.verification_applications; assignee uuid;
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if not private.valid_trust_text(p_reason,10,500) then raise exception 'invalid reason' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'appeal_review',30);
  select * into appeal from private.verification_appeals where id=p_id and outcome='pending' for update;
  if not found then raise exception 'appeal unavailable' using errcode='PVT04'; end if;
  select * into item from private.verification_applications where id=appeal.application_id;
  if private.institution_conflicted(actor,item) or exists(
    select 1 from private.verification_reviews r where r.application_id=item.id and r.reviewer_id=actor
  ) then raise exception 'appeal unavailable' using errcode='PVT04'; end if;
  select user_id into assignee from public.profiles where username=p_handle;
  if assignee is null or not private.verification_appeal_reviewer_allowed(assignee,item)
    then raise exception 'reviewer unavailable' using errcode='PVT04'; end if;
  if appeal.assigned_reviewer_id is not distinct from assignee then return; end if;
  update private.verification_appeals set assigned_reviewer_id=assignee where id=appeal.id;
  insert into private.verification_appeal_assignments(appeal_id,administrator_id,reviewer_id,reason)
    values(appeal.id,actor,assignee,btrim(p_reason));
end;
$$;

create function public.decide_verification_appeal_for_client(p_id uuid,p_outcome text,p_rationale text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); appeal private.verification_appeals; item private.verification_applications;
begin
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_outcome is null or p_outcome not in ('upheld','reconsideration') or not private.valid_trust_text(p_rationale,10,1000)
    then raise exception 'invalid outcome' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'appeal_review',30);
  select * into appeal from private.verification_appeals where id=p_id and outcome='pending' and assigned_reviewer_id=actor for update;
  if not found then raise exception 'appeal unavailable' using errcode='PVT04'; end if;
  select * into item from private.verification_applications where id=appeal.application_id for share;
  if not private.verification_appeal_reviewer_allowed(actor,item) then raise exception 'access denied' using errcode='42501'; end if;
  update private.verification_appeals set outcome=p_outcome,rationale=btrim(p_rationale),decided_at=clock_timestamp() where id=appeal.id;
end;
$$;

create function public.submit_impersonation_report_for_client(p_handle text,p_kind text,p_org text,p_explanation text,p_refs text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); subject uuid; organization uuid; result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('profile','public_figure','badge','affiliation') or (p_kind='affiliation')<>(p_org is not null)
    or not private.valid_trust_text(p_explanation,10,1000) or not private.valid_public_references(p_refs)
    then raise exception 'invalid report' using errcode='22023'; end if;
  perform 1 from auth.users where id=actor for no key update;
  if (select count(*) from private.impersonation_reports where reporter_id=actor and created_at>now()-interval '1 day')>=5
    then raise exception 'report limit' using errcode='PFR29'; end if;
  select p.user_id into subject from public.profiles p where p.username=p_handle and feed_data.followable_member(p);
  if subject is null or actor=subject then raise exception 'profile unavailable' using errcode='PVT04'; end if;
  if p_org is not null then
    select o.id into organization from private.organizations o where o.handle=p_org and o.status='active';
    if organization is null then raise exception 'institution unavailable' using errcode='PVT04'; end if;
  end if;
  insert into private.impersonation_reports(reporter_id,subject_id,organization_id,kind,explanation,reference_urls)
    values(actor,subject,organization,p_kind,btrim(p_explanation),p_refs) returning id into result;
  return result;
exception when unique_violation then raise exception 'report already exists' using errcode='23505';
end;
$$;

create function public.impersonation_queue_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'subjectHandle',p.username,
    'organizationHandle',o.handle,'explanation',r.explanation,'references',r.reference_urls,'createdAt',r.created_at)
    order by r.created_at,r.id) from (
      select * from private.impersonation_reports where outcome='pending' and reporter_id is distinct from actor
        and subject_id is distinct from actor and (organization_id is null or private.institution_role(actor,organization_id) is null)
      order by created_at,id limit 50
    ) r left join public.profiles p on p.user_id=r.subject_id left join private.organizations o on o.id=r.organization_id),'[]');
end;
$$;

create function public.decide_impersonation_report_for_client(p_id uuid,p_outcome text,p_rationale text,p_hold text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.impersonation_reports;
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_outcome is null or p_outcome not in ('dismissed','substantiated') or not private.valid_trust_text(p_rationale,10,1000)
    or (p_hold is not null and (p_hold not in ('identity','notable_person') or p_outcome<>'substantiated'))
    then raise exception 'invalid outcome' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'appeal_review',30);
  select * into item from private.impersonation_reports where id=p_id and outcome='pending' for update;
  if not found or actor=item.reporter_id or actor=item.subject_id
    or (item.organization_id is not null and private.institution_role(actor,item.organization_id) is not null)
    then raise exception 'report unavailable' using errcode='PVT04'; end if;
  if p_hold is not null then
    if item.kind='affiliation' or (item.kind='public_figure' and p_hold<>'notable_person')
      or (item.kind='profile' and p_hold<>'identity') then raise exception 'invalid hold scope' using errcode='22023'; end if;
    update public.verification_records set publication_held_at=clock_timestamp()
      where user_id=item.subject_id and verification_type=p_hold and source='review' and status='verified' and publication_held_at is null;
    if not found then raise exception 'badge unavailable' using errcode='PVT04'; end if;
  end if;
  update private.impersonation_reports set outcome=p_outcome,rationale=btrim(p_rationale),reviewer_id=actor,
    claim_held=p_hold,decided_at=clock_timestamp() where id=item.id;
end;
$$;

revoke all on function private.valid_trust_text(text,integer,integer),private.valid_public_references(text[]),
  private.verification_appeal_reviewer_allowed(uuid,private.verification_applications),private.verification_appeal_card(private.verification_appeals),
  public.my_verification_appeals_for_client(),public.submit_verification_appeal_for_client(uuid,text,text[]),
  public.verification_appeals_queue_for_client(text),public.assign_verification_appeal_for_client(uuid,text,text),
  public.decide_verification_appeal_for_client(uuid,text,text),public.submit_impersonation_report_for_client(text,text,text,text,text[]),
  public.impersonation_queue_for_client(),public.decide_impersonation_report_for_client(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.my_verification_appeals_for_client(),public.submit_verification_appeal_for_client(uuid,text,text[]),
  public.verification_appeals_queue_for_client(text),public.assign_verification_appeal_for_client(uuid,text,text),
  public.decide_verification_appeal_for_client(uuid,text,text),public.submit_impersonation_report_for_client(text,text,text,text,text[]),
  public.impersonation_queue_for_client(),public.decide_impersonation_report_for_client(uuid,text,text,text) to authenticated;

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
        and (a.kind not in ('identity','notable_person') or exists(select 1 from private.verification_review_work w
          where w.application_id=a.id and w.reviewer_id=vote.reviewer_id and w.assigned_at<=vote.created_at))) end,
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
