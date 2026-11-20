create table private.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  creator_id uuid references auth.users(id) on delete set null,
  responsible_id uuid,
  submitter_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  request_key uuid not null,
  request_digest bytea not null,
  title text not null,
  description text not null,
  starts_on date,
  target_on date,
  target numeric(12,2) check(target between 0 and 100000000),
  unit text,
  display_order integer not null check(display_order between 0 and 10000),
  public_requested boolean not null,
  status text not null default 'planned' check(status in ('planned','in_progress','submitted','completed','blocked','cancelled')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(starts_on is null or target_on is null or starts_on<=target_on),
  check((target is null)=(unit is null)),
  unique(project_id,id),
  unique(project_id,creator_id,request_key),
  foreign key(project_id,responsible_id) references private.project_team(project_id,user_id) on delete set null (responsible_id)
);
create index project_milestones_order on private.project_milestones(project_id,display_order,id);
alter table private.project_tasks add column milestone_id uuid,
  add constraint project_task_milestone_scope foreign key(project_id,milestone_id)
  references private.project_milestones(project_id,id) on delete set null (milestone_id);
create index project_tasks_milestone on private.project_tasks(project_id,milestone_id) where milestone_id is not null;

create table private.project_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  creator_id uuid references auth.users(id) on delete set null,
  name text not null,
  unit text not null,
  target numeric(12,2) not null check(target between 0 and 100000000),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  unique(project_id,id)
);
create unique index project_metrics_name on private.project_metrics(project_id,lower(name));

create table private.project_metric_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  metric_id uuid not null,
  reporter_id uuid references auth.users(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  actual numeric(12,2) not null check(actual between 0 and 100000000),
  explanation text not null,
  reference text,
  created_at timestamptz not null default now(),
  check(starts_on<=ends_on and ends_on-starts_on<=366),
  foreign key(project_id,metric_id) references private.project_metrics(project_id,id) on delete cascade,
  unique(metric_id,starts_on,ends_on)
);

create table private.project_progress_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.project_execution(project_id) on delete cascade,
  milestone_id uuid,
  author_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  supersedes_id uuid,
  kind text not null check(kind in ('update','evidence','report')),
  visibility text not null check(visibility in ('team','public')),
  state text not null default 'draft' check(state in ('draft','submitted','returned','approved','withdrawn','rejected')),
  request_key uuid not null,
  request_digest bytea not null,
  content jsonb not null check(jsonb_typeof(content)='object'),
  snapshot jsonb,
  image_digest text,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique(project_id,id),
  unique(project_id,author_id,request_key),
  foreign key(project_id,milestone_id) references private.project_milestones(project_id,id) on delete set null (milestone_id),
  foreign key(project_id,supersedes_id) references private.project_progress_entries(project_id,id) on delete cascade,
  foreign key(project_id,image_digest) references private.project_images(project_id,digest),
  check(kind<>'evidence' or visibility='team'),
  check(kind<>'report' or milestone_id is null)
);
create index project_progress_list on private.project_progress_entries(project_id,created_at desc,id);
create index project_progress_image on private.project_progress_entries(project_id,image_digest) where image_digest is not null;
create unique index project_progress_successor on private.project_progress_entries(supersedes_id)
  where supersedes_id is not null and state not in ('withdrawn','rejected');

alter table private.project_operations_events add column progress_subject uuid, add column progress_snapshot jsonb;
create index project_progress_history on private.project_operations_events(project_id,progress_subject,created_at desc)
  where progress_subject is not null;

alter table private.project_milestones enable row level security;
alter table private.project_metrics enable row level security;
alter table private.project_metric_observations enable row level security;
alter table private.project_progress_entries enable row level security;
revoke all on private.project_milestones,private.project_metrics,private.project_metric_observations,private.project_progress_entries
  from public,anon,authenticated,service_role;

create function private.project_progress_manager(p_role text) returns boolean
language sql immutable set search_path='' as $$ select coalesce(p_role in ('owner','manager'),false); $$;

create function private.project_progress_lock(p_id uuid)
returns private.community_projects language plpgsql set search_path='' as $$
declare p private.community_projects;
begin
  select * into p from private.community_projects where id=p_id for update;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  perform private.project_lock_scope(p);
  if not private.project_executable(p) then raise exception 'project unavailable' using errcode='PJP04'; end if;
  return p;
end;
$$;

create function private.project_progress_review(p_role text,p_actor uuid,p_submitter uuid)
returns void language plpgsql set search_path='' as $$
begin
  if not private.project_progress_manager(p_role) then raise exception 'access denied' using errcode='42501'; end if;
  if p_submitter is null or p_submitter=p_actor or feed_data.blocked_pair(p_actor,p_submitter)
    then raise exception 'reviewer conflict' using errcode='PJC03'; end if;
  perform private.project_require_identity(p_actor);
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
end;
$$;

create function private.project_progress_limit(p_actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  -- Reuse the existing project operations budget across tasks and progress.
  perform feed_data.consume_limit(p_actor,'project_operations',30);
end;
$$;

create function private.project_completion_on(p_id uuid)
returns date language sql stable set search_path='' as $$
  select (e.created_at at time zone 'UTC')::date from private.project_operations_events e
  where e.project_id=p_id and e.action='execution_status' and e.detail='completed'
  order by e.created_at desc limit 1;
$$;

create function private.project_progress_event(p_project uuid,p_subject uuid,p_actor uuid,p_target uuid,p_action text,
  p_detail text default null,p_snapshot jsonb default null,p_task uuid default null)
returns void language sql set search_path='' as $$
  insert into private.project_operations_events(project_id,actor_id,recipient_id,action,detail,task_id,progress_subject,progress_snapshot)
    values(p_project,p_actor,case when p_target is distinct from p_actor then p_target end,p_action,p_detail,p_task,p_subject,p_snapshot);
$$;

create function private.project_remove_unreferenced_progress_image(p_project uuid,p_digest text)
returns void language sql set search_path='' as $$
  delete from private.project_images i where i.project_id=p_project and i.digest=p_digest
    and not exists(select 1 from private.project_progress_entries x where x.project_id=i.project_id and x.image_digest=i.digest)
    and not exists(select 1 from private.project_revisions r where r.project_id=i.project_id and r.image_digest=i.digest);
$$;

revoke all on function private.project_progress_manager(text),private.project_progress_lock(uuid),
  private.project_progress_review(text,uuid,uuid),private.project_progress_limit(uuid),private.project_completion_on(uuid),
  private.project_progress_event(uuid,uuid,uuid,uuid,text,text,jsonb,uuid),private.project_remove_unreferenced_progress_image(uuid,text)
  from public,anon,authenticated,service_role;
