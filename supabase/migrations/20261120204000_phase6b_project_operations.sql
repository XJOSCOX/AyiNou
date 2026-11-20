create table private.project_execution (
  project_id uuid primary key references private.community_projects(id) on delete cascade,
  approved_revision integer not null,
  operator_id uuid references auth.users(id) on delete set null,
  status text not null check(status in ('active','paused','completed','archived')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,approved_revision) references private.project_revisions(project_id,revision) on delete cascade
);

create table private.project_team (
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('manager','supervisor','contributor','volunteer')),
  membership_source text not null check(membership_source in ('invitation','opportunity')),
  sponsor_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(project_id,user_id)
);
create index project_team_user on private.project_team(user_id,project_id) where revoked_at is null;

create table private.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  inviter_id uuid references auth.users(id) on delete set null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('manager','supervisor','contributor','volunteer')),
  request_key uuid not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  created_at timestamptz not null default now(),
  unique(project_id,inviter_id,request_key)
);
create unique index project_invitation_current on private.project_invitations(project_id,recipient_id) where status='pending';
create index project_invitation_recipient on private.project_invitations(recipient_id,expires_at) where status='pending';

create table private.project_opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  manager_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null,
  skills text not null,
  commitment text not null,
  remote boolean not null,
  capacity smallint not null check(capacity between 1 and 100),
  closes_on date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,id)
);
create index project_opportunities_project on private.project_opportunities(project_id,created_at desc,id);

create table private.project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  opportunity_id uuid not null,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','offered','accepted','rejected','withdrawn')),
  reviewer_id uuid references auth.users(id) on delete set null,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,opportunity_id) references private.project_opportunities(project_id,id) on delete cascade,
  unique(opportunity_id,applicant_id)
);
create index project_applications_queue on private.project_applications(project_id,created_at desc,id);
create index project_applications_subject on private.project_applications(applicant_id,project_id);

create table private.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  title text not null,
  description text not null,
  status text not null default 'todo' check(status in ('todo','in_progress','blocked','submitted','completed','cancelled')),
  priority text not null check(priority in ('low','normal','high')),
  sensitive boolean not null,
  assignee_id uuid,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  due_on date,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,id),
  foreign key(project_id,assignee_id) references private.project_team(project_id,user_id) on delete set null (assignee_id)
);
create index project_tasks_project on private.project_tasks(project_id,created_at desc,id);
create index project_tasks_assignee on private.project_tasks(project_id,assignee_id);

create table private.project_operations_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  task_id uuid,
  invitation_id uuid references private.project_invitations(id) on delete set null,
  application_id uuid references private.project_applications(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now(),
  foreign key(project_id,task_id) references private.project_tasks(project_id,id) on delete cascade
);
create index project_operations_activity on private.project_operations_events(project_id,created_at desc,id);
create index project_operations_task_history on private.project_operations_events(project_id,task_id,created_at desc) where task_id is not null;

alter table private.project_execution enable row level security;
alter table private.project_team enable row level security;
alter table private.project_invitations enable row level security;
alter table private.project_opportunities enable row level security;
alter table private.project_applications enable row level security;
alter table private.project_tasks enable row level security;
alter table private.project_operations_events enable row level security;
revoke all on private.project_execution,private.project_team,private.project_invitations,private.project_opportunities,
  private.project_applications,private.project_tasks,private.project_operations_events from public,anon,authenticated,service_role;

create function private.project_executable(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.status='approved' and p.restricted_at is null
    and private.project_identity_state(p.submitted_by)='verified'
    and private.project_owner_access(p,p.submitted_by,'submit')
    and (p.organization_id is null or private.project_organization_verified(p.organization_id));
$$;

create function private.project_execution_actor(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and not feed_data.blocked_pair(p_actor,p.submitted_by)
    and feed_data.community_member(p.association_id,p_actor);
$$;

create function private.project_execution_owner(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.project_executable(p) and private.project_execution_actor(p,p_actor)
    and private.project_identity_state(p_actor)='verified' and case
    when p.owner_user_id is not null then p.owner_user_id=p_actor
    when p.organization_id is not null then private.organization_has_permission(p_actor,p.organization_id,'projects.operate')
    else private.project_community_manager(p.community_id,p_actor) end;
$$;

create function private.project_execution_role(p private.community_projects,p_actor uuid)
returns text language sql stable set search_path='' as $$
  select coalesce(case when private.project_execution_owner(p,p_actor) and
    (p.organization_id is null or exists(select 1 from private.project_execution
      where project_id=p.id and operator_id=p_actor)) then 'owner' end,
    (select t.role from private.project_team t where t.project_id=p.id and t.user_id=p_actor and t.revoked_at is null
      and private.project_executable(p) and private.project_execution_actor(p,p_actor)
      and feed_data.community_member(p.community_id,p_actor)
      and case when t.role in ('manager','supervisor') then
        private.project_identity_state(p_actor)='verified' and private.project_execution_owner(p,t.sponsor_id)
        and not feed_data.blocked_pair(p_actor,t.sponsor_id)
      else true end),
    case when private.project_execution_owner(p,p_actor) then 'delegate' end);
$$;

create function private.project_permission(p_role text,p_permission text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_permission=any(case p_role
    when 'owner' then array['project.status_manage','team.invite','team.manage','tasks.create','tasks.edit','tasks.assign','tasks.review','tasks.update_own','volunteers.review']
    when 'delegate' then array['project.status_manage','team.invite','team.manage']
    when 'manager' then array['team.invite','team.manage','tasks.create','tasks.edit','tasks.assign','tasks.review','tasks.update_own','volunteers.review']
    when 'supervisor' then array['tasks.create','tasks.edit','tasks.assign','tasks.review','tasks.update_own']
    when 'contributor' then array['tasks.update_own']
    when 'volunteer' then array['tasks.update_own']
    else '{}'::text[] end),false);
$$;

create function private.project_can_invite(p_role text,p_target_role text)
returns boolean language sql immutable set search_path='' as $$
  select private.project_permission(p_role,'team.invite')
    and (p_role in ('owner','delegate') or p_target_role in ('contributor','volunteer'));
$$;

create function private.project_task_visible(p private.community_projects,t private.project_tasks,p_actor uuid,p_role text)
returns boolean language sql stable set search_path='' as $$
  select p_role is not null and t.project_id=p.id
    and not feed_data.blocked_pair(p_actor,t.assignee_id) and not feed_data.blocked_pair(p_actor,t.created_by)
    and case
    when p_role in ('owner','manager') then true
    when t.sensitive and private.project_identity_state(p_actor)<>'verified' then false
    else t.assignee_id=p_actor or (p_role='supervisor' and t.created_by=p_actor) end;
$$;

create function private.project_operational_text(value text,min_chars integer,max_chars integer)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(private.valid_trust_text(value,min_chars,max_chars)
    and value !~ '[+-]?[0-9]{1,3}[.][0-9]{4,}[ ,;/]+[+-]?[0-9]{1,3}[.][0-9]{4,}'
    and value !~* '[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}',false);
$$;

revoke all on function private.project_executable(private.community_projects),
  private.project_execution_actor(private.community_projects,uuid),private.project_execution_owner(private.community_projects,uuid),
  private.project_execution_role(private.community_projects,uuid),private.project_permission(text,text),private.project_can_invite(text,text),
  private.project_task_visible(private.community_projects,private.project_tasks,uuid,text),private.project_operational_text(text,integer,integer)
  from public,anon,authenticated,service_role;
