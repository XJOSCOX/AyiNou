-- Operational grants are anchored to a concrete relationship. Foundational roles stay in their original table.
alter table private.organization_memberships add constraint organization_membership_scope_key unique(id,organization_id,user_id);

create function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign'];
$$;

create table private.organization_custom_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  name text not null check(private.valid_trust_text(name,2,64) and name !~ '[[:cntrl:]]'),
  description text check(description is null or private.valid_trust_text(description,1,300)),
  permissions text[] not null check(cardinality(permissions) between 1 and 7
    and array_position(permissions,null) is null and permissions <@ private.organization_permission_catalog()),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deactivated_at timestamptz,
  unique(id,organization_id)
);
create unique index organization_custom_role_name on private.organization_custom_roles(organization_id,lower(name))
  where deactivated_at is null;

create table private.organization_custom_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  role_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  representative_id uuid,
  affiliation_id uuid,
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  foreign key(role_id,organization_id) references private.organization_custom_roles(id,organization_id) on delete cascade,
  foreign key(representative_id,organization_id,user_id) references private.organization_memberships(id,organization_id,user_id) on delete cascade,
  foreign key(affiliation_id,organization_id,user_id) references private.organization_affiliations(id,organization_id,user_id) on delete cascade,
  check(num_nonnulls(representative_id,affiliation_id)=1)
);
create unique index organization_custom_assignment_open on private.organization_custom_assignments(organization_id,role_id,user_id)
  where revoked_at is null;
create index organization_custom_assignment_actor on private.organization_custom_assignments(user_id,organization_id) where revoked_at is null;
create index organization_custom_assignment_role on private.organization_custom_assignments(role_id,organization_id);
create index organization_custom_assignment_rep on private.organization_custom_assignments(representative_id) where representative_id is not null;
create index organization_custom_assignment_affiliation on private.organization_custom_assignments(affiliation_id) where affiliation_id is not null;

create table private.organization_role_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  role_id uuid,
  assignment_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  event text not null check(event in ('role_created','role_edited','role_deactivated','assigned','revoked','relationship_ended','ownership_ended')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index organization_role_audit_activity on private.organization_role_audit(organization_id,created_at desc,id);
create index organization_role_audit_actor on private.organization_role_audit(actor_id,created_at desc) where actor_id is not null;

alter table private.organization_custom_roles enable row level security;
alter table private.organization_custom_assignments enable row level security;
alter table private.organization_role_audit enable row level security;
revoke all on private.organization_custom_roles,private.organization_custom_assignments,private.organization_role_audit
  from public,anon,authenticated,service_role;

create function private.organization_grant_current(a private.organization_custom_assignments)
returns boolean language sql stable set search_path='' as $$
  select a.revoked_at is null and (
    exists(select 1 from private.organization_memberships m where m.id=a.representative_id
      and m.revoked_at is null and (m.expires_at is null or m.expires_at>statement_timestamp()))
    or exists(select 1 from private.organization_affiliations f where f.id=a.affiliation_id and f.status='active'));
$$;

create function private.organization_effective_permissions(p_actor uuid,p_org uuid)
returns text[] language plpgsql stable set search_path='' as $$
declare foundational text; base text[]:='{}';
begin
  if not private.institution_actor(p_actor)
    or not exists(select 1 from private.organizations where id=p_org and status='active') then return base; end if;
  foundational:=private.institution_role(p_actor,p_org);
  if foundational in ('owner','administrator') then return private.organization_permission_catalog(); end if;
  if foundational='editor' then base:=array['organization.view','content.edit'];
  elsif foundational='viewer' then base:=array['organization.view']; end if;
  return array(select distinct capability
    from unnest(base || array(select unnest(r.permissions) from private.organization_custom_assignments a
      join private.organization_custom_roles r on r.id=a.role_id and r.organization_id=a.organization_id and r.deactivated_at is null
      where a.organization_id=p_org and a.user_id=p_actor and private.organization_grant_current(a))) capability
    order by capability);
end;
$$;

create function private.organization_has_permission(p_actor uuid,p_org uuid,p_permission text)
returns boolean language sql stable set search_path='' as $$
  select p_permission=any(private.organization_effective_permissions(p_actor,p_org));
$$;

create function private.organization_role_card(r private.organization_custom_roles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'permissions',r.permissions,
    'version',r.version,'deactivatedAt',r.deactivated_at);
$$;

create function private.organization_role_budget(actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('organization-role:'||actor::text,0));
  if (select count(*) from private.organization_role_audit where actor_id=actor and created_at>now()-interval '1 day')>=100
  then raise exception 'role change limit' using errcode='PFR29'; end if;
end;
$$;

create function private.organization_role_actor(p_org uuid)
returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() or not private.organization_has_permission(actor,p_org,'roles.assign')
  then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return actor;
end;
$$;

create function private.organization_can_delegate(p_permissions text[],p_foundation text,p_role_permissions text[])
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_foundation in ('owner','administrator'),false) or
    ('roles.assign'=any(p_permissions) and not 'roles.assign'=any(p_role_permissions) and p_role_permissions <@ p_permissions);
$$;

create function public.organization_role_save_for_client(p_org uuid,p_id uuid,p_version integer,p_name text,p_description text,p_permissions text[],p_deactivate boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.organization_role_actor(p_org); r private.organization_custom_roles;
  previous jsonb; event_name text; removed record;
begin
  perform private.organization_role_budget(actor);
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.institution_actor(actor) or not coalesce(private.institution_role(actor,p_org) in ('owner','administrator'),false)
  then raise exception 'role definition reserved' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_deactivate is null or (p_id is null and (p_deactivate or p_version is not null))
  then raise exception 'invalid transition' using errcode='22023'; end if;
  if not p_deactivate then
    if not private.valid_trust_text(p_name,2,64) or p_name~'[[:cntrl:]]'
      or (p_description is not null and not private.valid_trust_text(p_description,1,300))
      or coalesce(cardinality(p_permissions),0) not between 1 and 7
    then raise exception 'invalid role' using errcode='22023'; end if;
    if not (p_permissions <@ private.organization_permission_catalog())
      or exists(select 1 from unnest(p_permissions) p where p is null)
    then raise exception 'permission unavailable' using errcode='POR11'; end if;
    p_permissions:=array(select distinct p from unnest(p_permissions) p order by p);
  end if;
  if p_id is null then
    if (select count(*) from private.organization_custom_roles where organization_id=p_org)>=100
      or (select count(*) from private.organization_custom_roles where organization_id=p_org and deactivated_at is null)>=20
    then raise exception 'role limit' using errcode='PFR29'; end if;
    insert into private.organization_custom_roles(organization_id,name,description,permissions)
      values(p_org,btrim(p_name),btrim(p_description),p_permissions) returning * into r;
    event_name:='role_created';
  else
    select * into r from private.organization_custom_roles where id=p_id and organization_id=p_org and deactivated_at is null;
    if not found then raise exception 'role unavailable' using errcode='POR04'; end if;
    if r.version is distinct from p_version then raise exception 'role changed' using errcode='POR09'; end if;
    if not p_deactivate and (r.name,r.description,r.permissions) is not distinct from (btrim(p_name),btrim(p_description),p_permissions)
      then return r.id; end if;
    previous:=private.organization_role_card(r);
    if p_deactivate then
      update private.organization_custom_roles set deactivated_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1
        where id=p_id returning * into r;
      for removed in update private.organization_custom_assignments set revoked_at=clock_timestamp()
        where role_id=p_id and revoked_at is null returning id,user_id
      loop
        insert into private.organization_role_audit(organization_id,role_id,assignment_id,actor_id,subject_id,event)
          values(p_org,p_id,removed.id,actor,removed.user_id,'revoked');
      end loop;
      event_name:='role_deactivated';
    else
      update private.organization_custom_roles set name=btrim(p_name),description=btrim(p_description),permissions=p_permissions,
        updated_at=clock_timestamp(),version=version+1 where id=p_id returning * into r;
      event_name:='role_edited';
    end if;
  end if;
  insert into private.organization_role_audit(organization_id,role_id,actor_id,event,before_state,after_state)
    values(p_org,r.id,actor,event_name,previous,private.organization_role_card(r));
  return r.id;
exception when unique_violation then raise exception 'role name already exists' using errcode='POR12';
end;
$$;

create function public.organization_role_assignment_for_client(p_org uuid,p_role uuid,p_version integer,p_user uuid,p_revoke uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.organization_role_actor(p_org); foundational text; subject_role text; permissions text[];
  r private.organization_custom_roles; a private.organization_custom_assignments; rep uuid; affiliation uuid; removed record;
begin
  perform private.organization_role_budget(actor);
  perform 1 from private.organizations where id=p_org for no key update;
  permissions:=private.organization_effective_permissions(actor,p_org);
  foundational:=private.institution_role(actor,p_org);
  if not 'roles.assign'=any(permissions) or not feed_data.recent_feed_totp()
  then raise exception 'access denied' using errcode='42501'; end if;
  if num_nonnulls(p_user,p_revoke)<>1 then raise exception 'invalid assignment' using errcode='22023'; end if;
  select * into r from private.organization_custom_roles where id=p_role and organization_id=p_org and deactivated_at is null;
  if not found then raise exception 'role unavailable' using errcode='POR04'; end if;
  if r.version is distinct from p_version then raise exception 'role changed' using errcode='POR09'; end if;
  if not private.organization_can_delegate(permissions,foundational,r.permissions)
  then raise exception 'grant outside authority' using errcode='POR13'; end if;
  if p_revoke is not null then
    select * into a from private.organization_custom_assignments where id=p_revoke and organization_id=p_org and role_id=p_role and revoked_at is null;
    if not found then raise exception 'assignment unavailable' using errcode='POR09'; end if;
    p_user:=a.user_id;
  end if;
  subject_role:=private.institution_role(p_user,p_org);
  if p_user=actor or subject_role='owner' or (subject_role='administrator' and foundational is distinct from 'owner')
  then raise exception 'protected assignment' using errcode='POR13'; end if;
  if p_revoke is not null then
    update private.organization_custom_assignments set revoked_at=clock_timestamp() where id=a.id;
  else
    if not private.institution_actor(p_user) then raise exception 'member unavailable' using errcode='POR14'; end if;
    select id into rep from private.organization_memberships where organization_id=p_org and user_id=p_user and revoked_at is null
      and (expires_at is null or expires_at>statement_timestamp());
    if rep is null then
      select id into affiliation from private.organization_affiliations where organization_id=p_org and user_id=p_user and status='active';
    end if;
    if rep is null and affiliation is null then raise exception 'member unavailable' using errcode='POR14'; end if;
    for removed in update private.organization_custom_assignments as stale set revoked_at=clock_timestamp()
      where stale.organization_id=p_org and stale.user_id=p_user and stale.revoked_at is null
        and not private.organization_grant_current(stale) returning id,role_id
    loop
      insert into private.organization_role_audit(organization_id,role_id,assignment_id,actor_id,subject_id,event)
        values(p_org,removed.role_id,removed.id,actor,p_user,'relationship_ended');
    end loop;
    if (select count(*) from private.organization_custom_assignments where organization_id=p_org and user_id=p_user and revoked_at is null)>=8
      or (select count(*) from private.organization_custom_assignments x
        where x.organization_id=p_org and x.revoked_at is null and private.organization_grant_current(x))>=500
    then raise exception 'assignment limit' using errcode='PFR29'; end if;
    insert into private.organization_custom_assignments(organization_id,role_id,user_id,representative_id,affiliation_id)
      values(p_org,p_role,p_user,rep,affiliation) returning * into a;
  end if;
  insert into private.organization_role_audit(organization_id,role_id,assignment_id,actor_id,subject_id,event)
    values(p_org,p_role,a.id,actor,p_user,case when p_revoke is null then 'assigned' else 'revoked' end);
  return a.id;
exception when unique_violation then raise exception 'assignment already exists' using errcode='POR09';
end;
$$;

create function private.organization_end_operational_grants()
returns trigger language plpgsql security definer set search_path='' as $$
declare closing_owner boolean:=false; closing_rep uuid; closing_affiliation uuid; removed record; org uuid; event_name text;
begin
  if tg_table_name='organization_memberships' then
    if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null) then return new; end if;
    closing_rep:=old.id;
    closing_owner:=old.role='owner';
  else
    if tg_op='UPDATE' and (old.status<>'active' or new.status='active') then return new; end if;
    closing_affiliation:=old.id;
  end if;
  org:=old.organization_id;
  if tg_op='DELETE' and (not closing_owner or not exists(select 1 from private.organizations where id=org)) then return old; end if;
  event_name:=case when closing_owner then 'ownership_ended' else 'relationship_ended' end;
  for removed in update private.organization_custom_assignments set revoked_at=clock_timestamp()
    where organization_id=org and revoked_at is null and (closing_owner or representative_id=closing_rep or affiliation_id=closing_affiliation)
    returning id,role_id,user_id
  loop
    insert into private.organization_role_audit(organization_id,role_id,assignment_id,actor_id,subject_id,event)
      values(org,removed.role_id,removed.id,auth.uid(),removed.user_id,event_name);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger organization_end_rep_grants before update of revoked_at or delete on private.organization_memberships
  for each row execute function private.organization_end_operational_grants();
create trigger organization_end_affiliation_grants before update of status or delete on private.organization_affiliations
  for each row execute function private.organization_end_operational_grants();

revoke all on function private.organization_permission_catalog(),private.organization_grant_current(private.organization_custom_assignments),
  private.organization_effective_permissions(uuid,uuid),private.organization_has_permission(uuid,uuid,text),
  private.organization_role_card(private.organization_custom_roles),private.organization_role_budget(uuid),
  private.organization_role_actor(uuid),private.organization_can_delegate(text[],text,text[]),private.organization_end_operational_grants(),
  public.organization_role_save_for_client(uuid,uuid,integer,text,text,text[],boolean),
  public.organization_role_assignment_for_client(uuid,uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.organization_role_save_for_client(uuid,uuid,integer,text,text,text[],boolean),
  public.organization_role_assignment_for_client(uuid,uuid,integer,uuid,uuid) to authenticated;
