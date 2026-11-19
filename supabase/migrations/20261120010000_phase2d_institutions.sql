-- Institutional resources are separate from personal Auth and profile records.
create table private.organizations (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{2,39}$'
    and handle not in ('admin','ayinou','support','settings','new','me','api')),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 120 and name !~ '[[:cntrl:]]'),
  kind text not null check (kind in ('haitian_organization','international_organization','ngo','nonprofit','foundation',
    'business','education','media','municipality','ministry','embassy','government_agency')),
  description text check (char_length(description) <= 600),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  department_code text references public.departments(code),
  website text check (char_length(website) <= 300 and website ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(/[^[:space:]?#]*)?$'
    and position(chr(92) in website) = 0),
  contact_email text check (char_length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  logo_asset uuid,
  status text not null default 'active' check (status in ('active','archived')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (department_code is null or country_code = 'HT')
);
create index organizations_creator on private.organizations(created_by, created_at desc);
create index organizations_department on private.organizations(department_code) where department_code is not null;

create table private.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','administrator','editor','viewer')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  verified_at timestamptz,
  check (expires_at is null or (role <> 'owner' and expires_at > created_at)),
  check (revoked_at is null or revoked_at >= created_at)
);
create unique index organization_one_owner on private.organization_memberships(organization_id) where role = 'owner' and revoked_at is null;
create unique index organization_one_role on private.organization_memberships(organization_id,user_id) where revoked_at is null;
create index organization_memberships_user on private.organization_memberships(user_id, organization_id);

create table private.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  role text not null check (role in ('administrator','editor','viewer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  term_days integer check (term_days between 1 and 730),
  state text not null default 'pending' check (state in ('pending','accepted','revoked')),
  closed_at timestamptz,
  check (invited_by is distinct from recipient_id and expires_at > created_at),
  check ((state = 'pending') = (closed_at is null))
);
create unique index organization_pending_invitation on private.organization_invitations(organization_id,recipient_id) where state = 'pending';
create index organization_invitations_inbox on private.organization_invitations(recipient_id,created_at desc);

create table private.verification_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.verification_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references private.organizations(id) on delete cascade,
  membership_id uuid references private.organization_memberships(id) on delete cascade,
  organization_subject jsonb,
  kind text not null check (kind in ('identity','notable_person','organization','government','representative','claim')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((kind in ('identity','notable_person')) = (organization_id is null)),
  check ((kind = 'representative') = (membership_id is not null)),
  check ((kind = 'claim') = (organization_subject is not null)),
  check ((status = 'pending') = (decided_at is null))
);
create unique index verification_person_open on private.verification_applications(applicant_id,kind)
  where organization_id is null and status in ('pending','approved');
create unique index verification_organization_open on private.verification_applications(organization_id)
  where kind in ('organization','government') and status in ('pending','approved');
create unique index verification_claim_open on private.verification_applications(organization_id,applicant_id)
  where kind = 'claim' and status = 'pending';
create unique index verification_claim_approved on private.verification_applications(organization_id)
  where kind = 'claim' and status = 'approved';
create unique index verification_representative_open on private.verification_applications(membership_id)
  where kind = 'representative' and status in ('pending','approved');
create index verification_applications_applicant on private.verification_applications(applicant_id,created_at desc);
create index verification_applications_org on private.verification_applications(organization_id,created_at desc);
create index verification_applications_membership on private.verification_applications(membership_id) where membership_id is not null;
create index verification_review_queue on private.verification_applications(status,created_at,id);

create table private.verification_evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.verification_applications(id) on delete cascade,
  url text not null check (char_length(url) <= 300 and url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(/[^[:space:]?#]*)?$'
    and position(chr(92) in url) = 0),
  created_at timestamptz not null default now(),
  unique (application_id,url)
);

create table private.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.verification_applications(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approve','reject','revoke')),
  rationale text not null check (char_length(btrim(rationale)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create unique index verification_one_approval_per_reviewer on private.verification_reviews(application_id,reviewer_id) where decision = 'approve';
create index verification_reviews_history on private.verification_reviews(application_id,created_at);

create table private.institution_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  organization_id uuid,
  subject_id uuid,
  event text not null,
  occurred_at timestamptz not null default now()
);
create index institution_audit_org on private.institution_audit(organization_id,occurred_at desc);
create index institution_audit_subject on private.institution_audit(subject_id,occurred_at desc);

alter table private.organizations enable row level security;
alter table private.organization_memberships enable row level security;
alter table private.organization_invitations enable row level security;
alter table private.verification_reviewers enable row level security;
alter table private.verification_applications enable row level security;
alter table private.verification_evidence enable row level security;
alter table private.verification_reviews enable row level security;
alter table private.institution_audit enable row level security;
revoke all on private.organizations, private.organization_memberships, private.organization_invitations,
  private.verification_reviewers, private.verification_applications, private.verification_evidence,
  private.verification_reviews, private.institution_audit from public, anon, authenticated, service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('institution-logos','institution-logos',false,524288,array['image/webp']);
create policy institution_logo_client_boundary on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'institution-logos') with check (bucket_id <> 'institution-logos');

create function private.institution_actor(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from auth.users where id = p_user and not is_anonymous and email_confirmed_at is not null
    and deleted_at is null and (banned_until is null or banned_until <= now()));
$$;

create function private.institution_role(p_actor uuid, p_org uuid)
returns text language sql stable set search_path = '' as $$
  select m.role from private.organization_memberships m
  join private.organizations o on o.id = m.organization_id
  where m.user_id = p_actor and m.organization_id = p_org and m.revoked_at is null
    and o.status = 'active' and (m.expires_at is null or m.expires_at > now());
$$;

create function private.institution_reviewer(p_actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.institution_actor(p_actor)
    and exists (select 1 from private.verification_reviewers r join public.role_assignments a using (user_id)
      where r.user_id = p_actor and a.role = 'administrator')
    and exists (select 1 from auth.mfa_factors where user_id = p_actor and status = 'verified');
$$;

create function private.institution_conflicted(p_actor uuid, p_app private.verification_applications)
returns boolean language sql stable set search_path = '' as $$
  select p_actor = p_app.applicant_id or exists (
    select 1 from private.organization_memberships where organization_id = p_app.organization_id and user_id = p_actor
  ) or exists (
    select 1 from private.organizations where id = p_app.organization_id and created_by = p_actor
  );
$$;

create function private.institution_view(o private.organizations)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',o.id,'handle',o.handle,'name',o.name,'kind',o.kind,'description',o.description,
    'countryCode',o.country_code,'departmentCode',o.department_code,
    'departmentName',(select d.name from public.departments d where d.code=o.department_code),'website',o.website,
    'logoAsset',o.logo_asset,'verificationStatus',o.verification_status,'status',o.status);
$$;

create function public.institution_public_for_api(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.institution_view(o) from private.organizations o where o.handle = p_handle and o.status = 'active';
$$;

create function public.institution_accounts_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'organizations', coalesce((select jsonb_agg((private.institution_view(o) - 'logoAsset') || jsonb_build_object('role',m.role,'expiresAt',m.expires_at) order by o.name)
      from private.organization_memberships m join private.organizations o on o.id = m.organization_id
      where m.user_id = p_actor and m.revoked_at is null and (m.expires_at is null or m.expires_at > now()) and o.status = 'active'), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'organizationName',o.name,'role',i.role,
      'expiresAt',i.expires_at,'termDays',i.term_days) order by i.created_at desc)
      from private.organization_invitations i join private.organizations o on o.id = i.organization_id
      where i.recipient_id = p_actor and i.state = 'pending' and i.expires_at > now() and o.status = 'active'), '[]'::jsonb),
    'canReview', private.institution_reviewer(p_actor)
  );
end;
$$;

create function public.institution_manage_for_api(p_actor uuid, p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text := private.institution_role(p_actor,p_org);
begin
  if not private.institution_actor(p_actor) or actor_role is null then raise exception 'access denied' using errcode = '42501'; end if;
  select * into strict o from private.organizations where id = p_org;
  return jsonb_build_object('organization',private.institution_view(o), 'role',actor_role,
    'contactEmail',case when actor_role in ('owner','administrator') then o.contact_email end,
    'identityLocked', o.verification_status = 'verified' or exists (
      select 1 from private.verification_applications where organization_id=p_org
        and kind in ('organization','government') and status='pending'),
    'representatives', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'expiresAt',m.expires_at,
      'displayName',p.display_name,'username',p.username,'verified',m.verified_at is not null,'isSelf',m.user_id = p_actor) order by m.created_at)
      from private.organization_memberships m left join public.profiles p on p.user_id = m.user_id
      where m.organization_id = p_org and m.revoked_at is null and (m.expires_at is null or m.expires_at > now())), '[]'::jsonb),
    'invitations', case when actor_role in ('owner','administrator') then
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expiresAt',i.expires_at,'username',p.username) order by i.created_at desc)
        from private.organization_invitations i left join public.profiles p on p.user_id = i.recipient_id
        where i.organization_id = p_org and i.state = 'pending' and i.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end,
    'activity', case when actor_role in ('owner','administrator') then
      coalesce((select jsonb_agg(jsonb_build_object('event',a.event,'occurredAt',a.occurred_at) order by a.occurred_at desc)
        from (select event,occurred_at from private.institution_audit where organization_id = p_org order by occurred_at desc limit 15) a), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

create function public.institution_save_for_api(p_actor uuid, p_org uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o private.organizations;
  actor_role text;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or p_input = '{}'::jsonb or pg_column_size(p_input) > 4096
    or (p_input - array['handle','name','kind','description','countryCode','departmentCode','website','contactEmail']) <> '{}'::jsonb
  then raise exception 'invalid organization fields' using errcode = '23514'; end if;
  if p_org is null then
    perform 1 from auth.users where id = p_actor for no key update;
    if (select count(*) from private.organizations where created_by = p_actor) >= 10 then
      raise exception 'creation limit' using errcode = '54000';
    end if;
    insert into private.organizations(handle,name,kind,description,country_code,department_code,website,contact_email,created_by)
      values (p_input->>'handle',p_input->>'name',p_input->>'kind',p_input->>'description',
        p_input->>'countryCode',p_input->>'departmentCode',p_input->>'website',p_input->>'contactEmail',p_actor)
      returning * into o;
    insert into private.organization_memberships(organization_id,user_id,role,granted_by) values (o.id,p_actor,'owner',p_actor);
    insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,o.id,o.id,'organization_created');
  else
    select * into o from private.organizations where id = p_org for no key update;
    actor_role := private.institution_role(p_actor,p_org);
    if actor_role is null or actor_role = 'viewer'
      or (actor_role = 'editor' and (p_input - 'description') <> '{}'::jsonb)
      or (actor_role = 'administrator' and p_input ?| array['handle','name','kind','countryCode','departmentCode','website'])
    then raise exception 'access denied' using errcode = '42501'; end if;
    if (o.verification_status = 'verified' or exists (
      select 1 from private.verification_applications where organization_id = p_org
        and kind in ('organization','government') and status = 'pending'
    )) and p_input ?| array['handle','name','kind','countryCode','departmentCode','website']
    then raise exception 'identity fields locked' using errcode = '55000'; end if;
    update private.organizations set
      handle = coalesce(p_input->>'handle',o.handle), name = coalesce(p_input->>'name',o.name),
      kind = coalesce(p_input->>'kind',o.kind), country_code = coalesce(p_input->>'countryCode',o.country_code),
      department_code = case when p_input ? 'departmentCode' then p_input->>'departmentCode' else o.department_code end,
      description = case when p_input ? 'description' then p_input->>'description' else o.description end,
      website = case when p_input ? 'website' then p_input->>'website' else o.website end,
      contact_email = case when p_input ? 'contactEmail' then p_input->>'contactEmail' else o.contact_email end,
      updated_at = now() where id = p_org;
    insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,p_org,'organization_updated');
  end if;
  return o.id;
end;
$$;

create function public.institution_logo_for_api(p_actor uuid, p_org uuid, p_asset uuid, p_expected uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old_asset uuid;
begin
  select logo_asset into old_asset from private.organizations where id = p_org for no key update;
  if not private.institution_actor(p_actor) or coalesce(private.institution_role(p_actor,p_org),'viewer') = 'viewer'
  then raise exception 'access denied' using errcode = '42501'; end if;
  if p_asset is null or old_asset is distinct from p_expected then raise exception 'logo conflict' using errcode = '55000'; end if;
  update private.organizations set logo_asset=p_asset,updated_at=now() where id=p_org;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,p_org,'logo_updated');
  return p_asset;
end;
$$;

create function public.institution_invite_for_api(p_actor uuid,p_org uuid,p_username text,p_role text,p_term_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_role text;
  recipient uuid;
  invitation uuid;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  actor_role := private.institution_role(p_actor,p_org);
  if not private.institution_actor(p_actor) or actor_role is null or actor_role not in ('owner','administrator')
    or p_role is null or p_role not in ('administrator','editor','viewer')
    or (actor_role='administrator' and p_role='administrator')
  then raise exception 'access denied' using errcode = '42501'; end if;
  select user_id into recipient from public.profiles where username=p_username;
  if recipient is null or recipient=p_actor or not private.institution_actor(recipient)
    or private.institution_role(recipient,p_org) is not null
  then raise exception 'recipient unavailable' using errcode = '55000'; end if;
  if (select count(*) from private.organization_invitations where organization_id=p_org and created_at > now()-interval '1 day') >= 25
    or (select count(*) from private.organization_memberships where organization_id=p_org and revoked_at is null
      and (expires_at is null or expires_at > now())) >= 50
  then raise exception 'invitation limit' using errcode = '54000'; end if;
  update private.organization_invitations set state='revoked',closed_at=now()
    where organization_id=p_org and recipient_id=recipient and state='pending' and expires_at<=now();
  insert into private.organization_invitations(organization_id,recipient_id,invited_by,role,term_days)
    values (p_org,recipient,p_actor,p_role,p_term_days) returning id into invitation;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,invitation,'invitation_created');
  return invitation;
end;
$$;

create function public.institution_resolve_invite_for_api(p_actor uuid,p_invitation uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i private.organization_invitations;
  actor_role text;
  inviter_role text;
  org uuid;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode = '42501'; end if;
  select organization_id into org from private.organization_invitations where id=p_invitation;
  perform 1 from private.organizations where id=org for no key update;
  select * into i from private.organization_invitations where id=p_invitation;
  actor_role := private.institution_role(p_actor,org);
  if i.id is null or (p_accept and i.recipient_id<>p_actor) or
    (not p_accept and i.recipient_id<>p_actor and not coalesce(actor_role='owner'
      or (actor_role='administrator' and i.role<>'administrator'),false))
  then raise exception 'access denied' using errcode = '42501'; end if;
  if i.state<>'pending' or i.expires_at<=now() then raise exception 'invitation unavailable' using errcode='55000'; end if;
  if p_accept then
    inviter_role := private.institution_role(i.invited_by,org);
    if not private.institution_actor(i.invited_by) or not coalesce(inviter_role='owner'
      or (inviter_role='administrator' and i.role<>'administrator'),false) or actor_role is not null
    then raise exception 'invitation unavailable' using errcode='55000'; end if;
    if (select count(*) from private.organization_memberships where organization_id=org and revoked_at is null
      and (expires_at is null or expires_at>now())) >= 50 then raise exception 'organization limit' using errcode='54000'; end if;
    update private.organization_memberships set revoked_at=now() where organization_id=org and user_id=p_actor and revoked_at is null;
    insert into private.organization_memberships(organization_id,user_id,role,granted_by,expires_at)
      values (org,p_actor,i.role,i.invited_by,now()+make_interval(days=>i.term_days));
  end if;
  update private.organization_invitations set state=case when p_accept then 'accepted' else 'revoked' end,closed_at=now()
    where id=p_invitation;
  insert into private.institution_audit(actor_id,organization_id,subject_id,event)
    values (p_actor,org,p_invitation,case when p_accept then 'invitation_accepted' else 'invitation_revoked' end);
end;
$$;

create function public.institution_revoke_member_for_api(p_actor uuid,p_org uuid,p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_role text;
  target private.organization_memberships;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  actor_role := private.institution_role(p_actor,p_org);
  select * into target from private.organization_memberships where id=p_member and organization_id=p_org and revoked_at is null;
  if not private.institution_actor(p_actor) or target.id is null or target.role='owner'
    or not coalesce(actor_role='owner' or (actor_role='administrator' and target.role in ('editor','viewer')),false)
  then raise exception 'access denied' using errcode = '42501'; end if;
  update private.organization_memberships set revoked_at=now(),verified_at=null where id=p_member;
  update private.organization_invitations set state='revoked',closed_at=now()
    where organization_id=p_org and invited_by=target.user_id and state='pending';
  insert into private.institution_audit(actor_id,organization_id,subject_id,event) values (p_actor,p_org,p_member,'representative_revoked');
end;
$$;

create function private.institution_subject(o private.organizations)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('handle',o.handle,'name',o.name,'kind',o.kind,'countryCode',o.country_code,
    'departmentCode',o.department_code,'website',o.website);
$$;

create function public.verification_submit_for_api(p_actor uuid,p_org uuid,p_kind text,p_evidence text[])
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
  then raise exception 'invalid application' using errcode='23514'; end if;
  perform 1 from auth.users where id=p_actor for no key update;
  if (select count(*) from private.verification_applications where applicant_id=p_actor and created_at>now()-interval '1 day')>=5
  then raise exception 'application limit' using errcode='54000'; end if;
  if p_kind in ('identity','notable_person') then
    if p_org is not null then raise exception 'invalid subject' using errcode='23514'; end if;
    if exists (select 1 from public.verification_records where user_id=p_actor and verification_type=p_kind and status='verified')
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

create function public.verification_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,
    'organizationName',o.name,'decidedAt',a.decided_at,'rationale',(select r.rationale from private.verification_reviews r
      where r.application_id=a.id and a.decided_at is not null and r.created_at=a.decided_at order by r.id limit 1)) order by a.created_at desc)
    from (select * from private.verification_applications where applicant_id=p_actor order by created_at desc limit 50) a
    left join private.organizations o on o.id=a.organization_id),'[]'::jsonb);
end;
$$;

create function public.verification_queue_for_api(p_actor uuid,p_status text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.institution_reviewer(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_status not in ('pending','approved') then raise exception 'invalid status' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'status',a.status,'createdAt',a.created_at,'organizationName',o.name,'organizationHandle',o.handle,
    'applicantName',p.display_name,'applicantUsername',p.username,'applicantId',a.applicant_id,
    'evidence',coalesce((select jsonb_agg(e.url order by e.created_at,e.id) from private.verification_evidence e where e.application_id=a.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('decision',r.decision,'rationale',r.rationale,'createdAt',r.created_at,
      'isSelf',r.reviewer_id=p_actor) order by r.created_at) from private.verification_reviews r where r.application_id=a.id),'[]'::jsonb)
  ) order by a.created_at)
    from (select x.* from private.verification_applications x where x.status=p_status and not private.institution_conflicted(p_actor,x)
      order by x.created_at,x.id limit 50) a
    left join private.organizations o on o.id=a.organization_id
    left join public.profiles p on p.user_id=a.applicant_id),'[]'::jsonb);
end;
$$;

create function public.verification_decide_for_api(p_actor uuid,p_application uuid,p_decision text,p_rationale text,p_conflict_free boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a private.verification_applications;
  o private.organizations;
  org uuid;
  member uuid;
  next_status text;
begin
  if not private.institution_reviewer(p_actor) or p_conflict_free is distinct from true
  then raise exception 'access denied' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approve','reject','revoke') or coalesce(char_length(btrim(p_rationale)),0) not between 10 and 1000
  then raise exception 'invalid decision' using errcode='23514'; end if;
  select organization_id,applicant_id into org,member from private.verification_applications where id=p_application;
  if coalesce(org,member) is null then raise exception 'access denied' using errcode='42501'; end if;
  if org is not null then select * into o from private.organizations where id=org for no key update; end if;
  select * into a from private.verification_applications where id=p_application for no key update;
  if a.id is null or private.institution_conflicted(p_actor,a) then raise exception 'access denied' using errcode='42501'; end if;
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
  insert into private.verification_reviews(application_id,reviewer_id,decision,rationale)
    values(p_application,p_actor,p_decision,btrim(p_rationale));
  insert into private.institution_audit(actor_id,organization_id,subject_id,event)
    values(p_actor,org,p_application,case p_decision when 'approve' then 'approval_recorded'
      when 'reject' then 'application_rejected' else 'verification_revoked' end);
  if p_decision='approve' and not exists (
    select 1 from private.verification_reviews r where r.application_id=a.id and r.decision='approve' and r.reviewer_id<>p_actor
      and private.institution_reviewer(r.reviewer_id) and not private.institution_conflicted(r.reviewer_id,a)
  ) then return 'pending'; end if;
  next_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end;
  if p_decision<>'reject' then
    if a.kind in ('identity','notable_person') then
      insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at)
        values(a.applicant_id,a.kind,case when p_decision='approve' then 'verified' else 'revoked' end,
          p_actor,case when p_decision='approve' then now() end)
        on conflict(user_id,verification_type) do update
          set status=excluded.status,reviewed_by=excluded.reviewed_by,verified_at=excluded.verified_at;
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

revoke all on function private.institution_actor(uuid),private.institution_role(uuid,uuid),
  private.institution_reviewer(uuid),private.institution_conflicted(uuid,private.verification_applications),
  private.institution_view(private.organizations),private.institution_subject(private.organizations)
  from public,anon,authenticated,service_role;
revoke all on function public.institution_public_for_api(text),public.institution_accounts_for_api(uuid),
  public.institution_manage_for_api(uuid,uuid),public.institution_save_for_api(uuid,uuid,jsonb),
  public.institution_logo_for_api(uuid,uuid,uuid,uuid),public.institution_invite_for_api(uuid,uuid,text,text,integer),
  public.institution_resolve_invite_for_api(uuid,uuid,boolean),public.institution_revoke_member_for_api(uuid,uuid,uuid),
  public.verification_submit_for_api(uuid,uuid,text,text[]),public.verification_own_for_api(uuid),
  public.verification_queue_for_api(uuid,text),public.verification_decide_for_api(uuid,uuid,text,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.institution_public_for_api(text),public.institution_accounts_for_api(uuid),
  public.institution_manage_for_api(uuid,uuid),public.institution_save_for_api(uuid,uuid,jsonb),
  public.institution_logo_for_api(uuid,uuid,uuid,uuid),public.institution_invite_for_api(uuid,uuid,text,text,integer),
  public.institution_resolve_invite_for_api(uuid,uuid,boolean),public.institution_revoke_member_for_api(uuid,uuid,uuid),
  public.verification_submit_for_api(uuid,uuid,text,text[]),public.verification_own_for_api(uuid),
  public.verification_queue_for_api(uuid,text),public.verification_decide_for_api(uuid,uuid,text,text,boolean)
  to service_role;
