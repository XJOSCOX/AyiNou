create table private.account_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active','suspended','banned')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  changed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index account_restrictions_by_status on private.account_restrictions(status,updated_at desc);

create table private.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  event text not null check (event in ('role_granted','role_revoked','account_suspended','account_banned','account_reinstated')),
  role text check (role in ('administrator','moderator','verification_reviewer')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  occurred_at timestamptz not null default now(),
  check ((role is not null) = (event in ('role_granted','role_revoked')))
);
create index platform_admin_audit_recent on private.platform_admin_audit(occurred_at desc,id);

create table private.verification_review_work (
  application_id uuid not null references private.verification_applications(id) on delete cascade,
  reviewer_id uuid not null references private.verification_reviewers(user_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (application_id,reviewer_id)
);
create index verification_review_work_reviewer on private.verification_review_work(reviewer_id,assigned_at desc);

alter table private.account_restrictions enable row level security;
alter table private.platform_admin_audit enable row level security;
alter table private.verification_review_work enable row level security;
revoke all on private.account_restrictions,private.platform_admin_audit,private.verification_review_work from public,anon,authenticated,service_role;
revoke insert,update,delete,truncate on public.role_assignments from service_role;

create or replace function private.institution_actor(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from auth.users where id=p_user and not is_anonymous and email_confirmed_at is not null
    and deleted_at is null and (banned_until is null or banned_until<=now()))
    and not exists (select 1 from private.account_restrictions where user_id=p_user and status<>'active');
$$;

create function private.verified_totp(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from auth.mfa_factors where user_id=p_user and status='verified' and factor_type='totp');
$$;

create function private.live_account_session(p_user uuid,p_session uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.institution_actor(p_user) and exists (
    select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now())
  );
$$;

create function public.account_session_for_api(p_user uuid,p_session uuid,p_aal2 boolean,p_privileged boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.live_account_session(p_user,p_session)
    and (coalesce(p_aal2,false) or not exists (
      select 1 from auth.mfa_factors where user_id=p_user and status='verified'
    )) and (not coalesce(p_privileged,true) or exists (
      select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
      where s.id=p_session and s.aal='aal2' and f.status='verified' and f.factor_type='totp'
    ));
$$;

create function public.account_session_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.live_account_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;

create or replace function private.member_session_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.account_session_active() and (coalesce(auth.jwt()->>'aal'='aal2',false) or not exists (
    select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'
  ));
$$;

create policy profile_active_session on public.profiles as restrictive for all to authenticated
  using ((select public.account_session_active())) with check ((select public.account_session_active()));
create policy interests_active_session on public.interest_catalog as restrictive for select to authenticated
  using ((select public.account_session_active()));
create policy protected_storage_active_session on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('institution-logos','member-avatars') or (select public.account_session_active()))
  with check (bucket_id not in ('institution-logos','member-avatars') or (select public.account_session_active()));

create function private.platform_admin(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.institution_actor(p_user) and private.verified_totp(p_user)
    and exists (select 1 from public.role_assignments where user_id=p_user and role='administrator');
$$;

create function private.protect_admin_authenticator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.user_id=old.user_id and new.factor_type=old.factor_type and new.status=old.status then
    return new;
  end if;
  if old.factor_type='totp' and old.status='verified' and exists (
    select 1 from public.role_assignments where user_id=old.user_id and role='administrator'
  ) then
    perform pg_advisory_xact_lock(20261120,300);
    if private.platform_admin(old.user_id) and not exists (
      select 1 from auth.mfa_factors where user_id=old.user_id and status='verified' and factor_type='totp' and id<>old.id
    ) and not exists (
      select 1 from public.role_assignments where role='administrator' and user_id<>old.user_id and private.platform_admin(user_id)
    ) then raise exception 'last eligible administrator' using errcode='55000'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger ayinou_preserve_admin_authenticator before delete or update of status,user_id,factor_type on auth.mfa_factors
  for each row execute function private.protect_admin_authenticator();

create or replace function private.institution_reviewer(p_actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.institution_actor(p_actor) and private.verified_totp(p_actor)
    and exists (select 1 from private.verification_reviewers where user_id=p_actor);
$$;

create or replace function private.institution_conflicted(p_actor uuid,p_app private.verification_applications)
returns boolean language sql stable set search_path = '' as $$
  select p_actor=p_app.applicant_id or exists (
    select 1 from private.organization_memberships where organization_id=p_app.organization_id and user_id=p_actor
  ) or exists (
    select 1 from private.organizations where id=p_app.organization_id and created_by=p_actor
  ) or exists (
    select 1 from private.organization_affiliations where organization_id=p_app.organization_id and user_id=p_actor
      and joined_at is not null
  );
$$;

create function public.platform_access_for_api(p_actor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'administrator',private.institution_actor(p_actor) and exists (
      select 1 from public.role_assignments where user_id=p_actor and role='administrator'
    ),
    'reviewer',private.institution_actor(p_actor) and exists (
      select 1 from private.verification_reviewers where user_id=p_actor
    ),
    'totp',private.verified_totp(p_actor)
  );
$$;

create function public.admin_overview_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'members',(select count(*) from auth.users u where not u.is_anonymous and u.deleted_at is null and u.email_confirmed_at is not null
      and not exists (select 1 from public.member_metric_exclusions where user_id=u.id)),
    'organizations',(select count(*) from private.organizations where status='active'),
    'recentMembershipEvents',(select count(*) from private.organization_affiliation_events where occurred_at>=now()-interval '30 days'),
    'pendingVerifications',(select count(*) from private.verification_applications where status='pending'),
    'restrictedAccounts',(select count(*) from auth.users u left join private.account_restrictions r on r.user_id=u.id
      where u.deleted_at is null and (r.status<>'active' or u.banned_until>now())),
    'recentAdminActions',(select count(*) from private.platform_admin_audit where occurred_at>=now()-interval '30 days')
  );
end;
$$;

create function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_offset is null or p_offset not between 0 and 10000 or p_query is null or char_length(p_query)>100
  then raise exception 'invalid search' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',u.id,'username',p.username,'displayName',p.display_name,'createdAt',u.created_at,
    'confirmed',u.email_confirmed_at is not null,'authBanned',coalesce(u.banned_until>now(),false),
    'status',coalesce(r.status,'active'),'reason',r.reason,'restrictionUpdatedAt',r.updated_at,
    'totp',private.verified_totp(u.id),
    'roles',coalesce((select jsonb_agg(x.role order by x.role) from (
      select role from public.role_assignments where user_id=u.id
      union all select 'verification_reviewer' from private.verification_reviewers where user_id=u.id
    ) x),'[]'::jsonb)
  ) order by u.created_at desc,u.id) from (
    select a.id,a.created_at,a.email_confirmed_at,a.banned_until from auth.users a
    left join public.profiles pr on pr.user_id=a.id
    where not a.is_anonymous and a.deleted_at is null and (p_query='' or a.id::text=lower(p_query)
      or strpos(lower(coalesce(pr.username,'')), lower(p_query))>0
      or strpos(lower(coalesce(pr.display_name,'')),lower(p_query))>0)
    order by a.created_at desc,a.id limit 25 offset p_offset
  ) u left join public.profiles p on p.user_id=u.id
    left join private.account_restrictions r on r.user_id=u.id),'[]'::jsonb);
end;
$$;

create function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  event_name text;
  audit_role text;
  current_status text;
  has_role boolean;
begin
  -- Serialize administrative role and account status writes across administrators.
  perform pg_advisory_xact_lock(20261120,300);
  if not private.platform_admin(p_actor) or p_subject is null or p_actor=p_subject then
    raise exception 'access denied' using errcode='42501';
  end if;
  if coalesce(char_length(btrim(p_reason)),0) not between 10 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid reason' using errcode='23514';
  end if;
  if not exists (select 1 from auth.users where id=p_subject and not is_anonymous and deleted_at is null) then
    raise exception 'access denied' using errcode='42501';
  end if;
  if ((p_action='status' and p_value in ('suspended','banned')) or (p_action='revoke' and p_value='administrator'))
    and private.platform_admin(p_subject) and not exists (
      select 1 from public.role_assignments where role='administrator' and user_id<>p_subject and private.platform_admin(user_id)
    ) then raise exception 'last eligible administrator' using errcode='55000'; end if;

  if p_action='status' and p_value in ('active','suspended','banned') then
    select status into current_status from private.account_restrictions where user_id=p_subject;
    if coalesce(current_status,'active')=p_value then raise exception 'no change' using errcode='55000'; end if;
    insert into private.account_restrictions(user_id,status,reason,changed_by,updated_at)
    values(p_subject,p_value,btrim(p_reason),p_actor,now())
    on conflict(user_id) do update set status=excluded.status,reason=excluded.reason,changed_by=excluded.changed_by,updated_at=excluded.updated_at;
    event_name:=case p_value when 'active' then 'account_reinstated' when 'suspended' then 'account_suspended' else 'account_banned' end;
  elsif p_action in ('grant','revoke') and p_value in ('administrator','moderator','verification_reviewer') then
    audit_role:=p_value;
    if p_value='verification_reviewer' then
      select exists (select 1 from private.verification_reviewers where user_id=p_subject) into has_role;
    else
      select exists (select 1 from public.role_assignments where user_id=p_subject and role=p_value) into has_role;
    end if;
    if (p_action='grant')=has_role then raise exception 'no change' using errcode='55000'; end if;
    if p_action='grant' and not (private.institution_actor(p_subject) and private.verified_totp(p_subject))
    then raise exception 'eligible MFA account required' using errcode='55000'; end if;
    if p_value='verification_reviewer' then
      if p_action='grant' then insert into private.verification_reviewers(user_id) values(p_subject);
      else delete from private.verification_reviewers where user_id=p_subject; end if;
    elsif p_action='grant' then
      insert into public.role_assignments(user_id,role,granted_by) values(p_subject,p_value,p_actor);
    else delete from public.role_assignments where user_id=p_subject and role=p_value; end if;
    event_name:=case p_action when 'grant' then 'role_granted' else 'role_revoked' end;
  else raise exception 'invalid action' using errcode='23514'; end if;
  insert into private.platform_admin_audit(actor_id,subject_id,event,role,reason)
  values(p_actor,p_subject,event_name,audit_role,btrim(p_reason));
end;
$$;

create function public.admin_audit_for_api(p_actor uuid,p_before timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',x.id,'actorId',x.actor_id,'subjectId',x.subject_id,'event',x.event,'role',x.role,'reason',x.reason,
    'organizationId',x.organization_id,'occurredAt',x.occurred_at) order by x.occurred_at desc,x.id)
    from (select * from (
      select id,actor_id,subject_id,event,role,reason,null::uuid organization_id,occurred_at
      from private.platform_admin_audit
      union all
      select id,actor_id,subject_id,event,null,null,organization_id,occurred_at from private.institution_audit
      where event in ('approval_recorded','application_rejected','verification_approved','verification_revoked',
        'ownership_transferred','ownership_revoked','review_work_claimed','review_work_released')
    ) events where p_before is null or events.occurred_at<p_before order by occurred_at desc,id limit 100) x),'[]'::jsonb);
end;
$$;

create function public.verification_work_for_api(p_actor uuid,p_application uuid,p_claim boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a private.verification_applications;
begin
  if not private.institution_reviewer(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select * into a from private.verification_applications where id=p_application for no key update;
  if a.id is null or private.institution_conflicted(p_actor,a) then raise exception 'access denied' using errcode='42501'; end if;
  if a.status<>'pending' or p_claim is null then raise exception 'work unavailable' using errcode='55000'; end if;
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
    'evidence',coalesce((select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('decision',r.decision,'rationale',r.rationale,'createdAt',r.created_at,
      'isSelf',r.reviewer_id=p_actor) order by r.created_at) from private.verification_reviews r where r.application_id=a.id),'[]'::jsonb)
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

revoke all on function private.verified_totp(uuid),private.live_account_session(uuid,uuid),private.platform_admin(uuid),
  private.protect_admin_authenticator()
  from public,anon,authenticated,service_role;
revoke all on function public.account_session_active() from public,anon,authenticated,service_role;
grant execute on function public.account_session_active() to authenticated;
revoke all on function public.account_session_for_api(uuid,uuid,boolean,boolean),public.platform_access_for_api(uuid),
  public.admin_overview_for_api(uuid),public.admin_accounts_for_api(uuid,text,integer),
  public.admin_account_action_for_api(uuid,uuid,text,text,text),public.admin_audit_for_api(uuid,timestamptz),
  public.verification_work_for_api(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.account_session_for_api(uuid,uuid,boolean,boolean),public.platform_access_for_api(uuid),
  public.admin_overview_for_api(uuid),public.admin_accounts_for_api(uuid,text,integer),
  public.admin_account_action_for_api(uuid,uuid,text,text,text),public.admin_audit_for_api(uuid,timestamptz),
  public.verification_work_for_api(uuid,uuid,boolean) to service_role;
