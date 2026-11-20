-- Institutional cases reuse the private Phase 5A queue and its per-member limit.
alter table private.organizations drop constraint organizations_status_check,
  add constraint organizations_status_check check(status in ('active','archived','restricted'));

alter table private.impersonation_reports drop constraint impersonation_reports_kind_check,
  add constraint impersonation_reports_kind_check check(kind in ('profile','public_figure','badge','affiliation','institution','representative'));

create unique index impersonation_one_open_institution on private.impersonation_reports(reporter_id,organization_id,kind)
  where outcome='pending' and reporter_id is not null and subject_id is null and organization_id is not null;

create function private.institution_report_conflict(p_actor uuid,p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.organizations where id=p_org and created_by=p_actor)
    or exists(select 1 from private.organization_memberships where organization_id=p_org and user_id=p_actor)
    or exists(select 1 from private.organization_affiliations where organization_id=p_org and user_id=p_actor);
$$;
revoke all on function private.institution_report_conflict(uuid,uuid) from public,anon,authenticated,service_role;

create function public.submit_institution_impersonation_for_client(p_org text,p_kind text,p_explanation text,p_refs text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); organization uuid; result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('institution','representative','affiliation')
    or not private.valid_trust_text(p_explanation,10,1000) or not private.valid_public_references(p_refs)
    then raise exception 'invalid report' using errcode='22023'; end if;
  perform 1 from auth.users where id=actor for no key update;
  if (select count(*) from private.impersonation_reports where reporter_id=actor and created_at>now()-interval '1 day')>=5
    then raise exception 'report limit' using errcode='PFR29'; end if;
  select id into organization from private.organizations where handle=p_org and status='active';
  if organization is null then raise exception 'institution unavailable' using errcode='PVT04'; end if;
  insert into private.impersonation_reports(reporter_id,organization_id,kind,explanation,reference_urls)
    values(actor,organization,p_kind,btrim(p_explanation),p_refs) returning id into result;
  return result;
exception when unique_violation then raise exception 'report already exists' using errcode='23505';
end;
$$;
revoke all on function public.submit_institution_impersonation_for_client(text,text,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.submit_institution_impersonation_for_client(text,text,text,text[]) to authenticated;


create or replace function public.impersonation_queue_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'subjectHandle',p.username,
    'organizationHandle',o.handle,'explanation',r.explanation,'references',r.reference_urls,'createdAt',r.created_at)
    order by r.created_at,r.id) from (
      select * from private.impersonation_reports where outcome='pending' and reporter_id is distinct from actor
        and subject_id is distinct from actor and (subject_id is not null or organization_id is not null)
        and not private.institution_report_conflict(actor,organization_id)
      order by created_at,id limit 50
    ) r left join public.profiles p on p.user_id=r.subject_id left join private.organizations o on o.id=r.organization_id),'[]');
end;
$$;

create or replace function public.decide_impersonation_report_for_client(p_id uuid,p_outcome text,p_rationale text,p_hold text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.impersonation_reports;
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_outcome is null or p_outcome not in ('dismissed','substantiated') or not private.valid_trust_text(p_rationale,10,1000)
    or (p_hold is not null and (p_hold not in ('identity','notable_person','restrict_institution') or p_outcome<>'substantiated'))
    then raise exception 'invalid outcome' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'appeal_review',30);
  select * into item from private.impersonation_reports where id=p_id and outcome='pending' for update;
  if not found or actor=item.reporter_id or actor=item.subject_id
    or (item.subject_id is null and item.organization_id is null) or private.institution_report_conflict(actor,item.organization_id)
    then raise exception 'report unavailable' using errcode='PVT04'; end if;
  if p_hold='restrict_institution' then
    if item.kind<>'institution' then raise exception 'invalid restriction scope' using errcode='22023'; end if;
    update private.organizations set status='restricted',updated_at=now() where id=item.organization_id and status='active';
    if not found then raise exception 'institution unavailable' using errcode='PVT04'; end if;
    update private.organization_invitations set state='revoked',closed_at=now()
      where organization_id=item.organization_id and state='pending';
    insert into private.institution_audit(actor_id,organization_id,subject_id,event)
      values(actor,item.organization_id,item.id,'institution_restricted');
  elsif p_hold is not null then
    if item.kind in ('affiliation','institution','representative') or (item.kind='public_figure' and p_hold<>'notable_person')
      or (item.kind='profile' and p_hold<>'identity') then raise exception 'invalid hold scope' using errcode='22023'; end if;
    update public.verification_records set publication_held_at=clock_timestamp()
      where user_id=item.subject_id and verification_type=p_hold and source='review' and status='verified' and publication_held_at is null;
    if not found then raise exception 'badge unavailable' using errcode='PVT04'; end if;
  end if;
  update private.impersonation_reports set outcome=p_outcome,rationale=btrim(p_rationale),reviewer_id=actor,
    claim_held=nullif(p_hold,'restrict_institution'),decided_at=clock_timestamp() where id=item.id;
end;
$$;
