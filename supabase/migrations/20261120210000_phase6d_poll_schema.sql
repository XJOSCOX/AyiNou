create table private.polls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  request_key uuid not null,
  request_digest bytea not null,
  scope text not null check(scope in ('individual','community','organization','project')),
  community_id uuid references feed_data.communities(id) on delete cascade,
  organization_id uuid references private.organizations(id) on delete cascade,
  project_id uuid references private.community_projects(id) on delete cascade,
  task_id uuid,
  proposal_revision integer,
  kind text not null check(kind in ('community','priority','decision','person')),
  policy text not null check(policy in ('advisory','governance')),
  audience text not null check(audience in ('members','scope')),
  eligibility text not null check(eligibility in ('active','verified')),
  result_policy text not null check(result_policy in ('after_vote','after_close')),
  title text not null,
  description text not null,
  language text not null check(language in ('ht','fr','en','es')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  quorum integer check(quorum between 1 and 5000),
  threshold integer check(threshold between 50 and 100),
  status text not null default 'draft' check(status in ('draft','published','closed','cancelled')),
  published_at timestamptz,
  electorate_size integer check(electorate_size between 1 and 5000),
  finalized_at timestamptz,
  final_result jsonb,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(opens_at<closes_at and closes_at-opens_at<=interval '30 days'),
  check((scope='individual' and num_nonnulls(community_id,organization_id,project_id)=0)
    or (num_nonnulls(community_id,organization_id,project_id)=1 and
      ((scope='community' and community_id is not null) or (scope='organization' and organization_id is not null)
        or (scope='project' and project_id is not null)))),
  check((scope='project')=(proposal_revision is not null)),
  check(task_id is null or (kind='decision' and project_id is not null)),
  check((status='closed')=(finalized_at is not null and final_result is not null)),
  unique(creator_id,request_key),
  foreign key(project_id,task_id) references private.project_tasks(project_id,id) on delete cascade,
  foreign key(project_id,proposal_revision) references private.project_revisions(project_id,revision) on delete cascade
);
create index polls_directory on private.polls(created_at desc,id desc);
create index polls_creator on private.polls(creator_id,created_at desc);
create index polls_community on private.polls(community_id,created_at desc) where community_id is not null;
create index polls_organization on private.polls(organization_id,created_at desc) where organization_id is not null;
create index polls_project on private.polls(project_id,created_at desc) where project_id is not null;

create table private.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references private.polls(id) on delete cascade,
  position smallint not null check(position between 1 and 10),
  label text,
  nominee_id uuid references auth.users(id) on delete set null,
  consent text check(consent in ('pending','accepted','withdrawn','declined')),
  consented_name text,
  consented_handle text,
  decided_at timestamptz,
  unique(poll_id,id),
  unique(poll_id,position),
  unique(poll_id,nominee_id),
  check((consent is null)=(label is not null))
);
create index poll_options_nominee on private.poll_options(nominee_id,poll_id) where nominee_id is not null;

create table private.poll_electorate (
  poll_id uuid not null references private.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(poll_id,user_id)
);
create index poll_electorate_member on private.poll_electorate(user_id,poll_id);

create table private.poll_ballots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references private.polls(id) on delete cascade,
  voter_id uuid references auth.users(id) on delete set null,
  option_id uuid not null,
  cast_at timestamptz not null default clock_timestamp(),
  unique(poll_id,voter_id),
  foreign key(poll_id,option_id) references private.poll_options(poll_id,id)
);
create index poll_ballot_count on private.poll_ballots(poll_id,option_id);

create table private.poll_events (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references private.polls(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  nomination_id uuid references private.poll_options(id) on delete set null,
  action text not null,
  reason text,
  version integer not null,
  created_at timestamptz not null default clock_timestamp()
);
create index poll_events_history on private.poll_events(poll_id,created_at desc,id);
create index poll_events_actor_nomination on private.poll_events(actor_id,created_at desc) where action='nomination_requested';

create table private.poll_decisions (
  poll_id uuid primary key references private.polls(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  disposition text not null check(disposition in ('recommend','defer','decline')),
  recommended_option uuid,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  check((disposition='recommend')=(recommended_option is not null)),
  foreign key(poll_id,recommended_option) references private.poll_options(poll_id,id)
);

alter table private.polls enable row level security;
alter table private.poll_options enable row level security;
alter table private.poll_electorate enable row level security;
alter table private.poll_ballots enable row level security;
alter table private.poll_events enable row level security;
alter table private.poll_decisions enable row level security;
revoke all on private.polls,private.poll_options,private.poll_electorate,private.poll_ballots,private.poll_events,private.poll_decisions
  from public,anon,authenticated,service_role;

create function private.poll_high_trust(p private.polls)
returns boolean language sql immutable set search_path='' as $$
  select p.policy='governance' or p.kind<>'community' or p.scope='organization';
$$;

create function private.poll_community_active(p_id uuid,p_public boolean,p_at timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from feed_data.communities c where c.id=p_id and
    (c.kind='department' or (feed_data.author_active(c.owner_id)
      and (not p_public or (c.policy='public' and c.public_since<=p_at)))));
$$;

create function private.poll_scope_live(p private.polls)
returns boolean language sql stable set search_path='' as $$
  select coalesce(case p.scope
    when 'individual' then feed_data.author_active(p.creator_id)
    when 'community' then private.poll_community_active(p.community_id,p.audience='members',coalesce(p.published_at,now()))
    when 'organization' then private.project_organization_verified(p.organization_id)
    when 'project' then exists(select 1 from private.community_projects q join private.project_execution e on e.project_id=q.id
      where q.id=p.project_id and e.approved_revision=p.proposal_revision and private.project_executable(q))
    else false end,false);
$$;

create function private.poll_can_organize(p private.polls,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor)
    and (case when p.scope='community' then private.poll_community_active(p.community_id,false,now()) else private.poll_scope_live(p) end)
    and not feed_data.blocked_pair(p_actor,p.creator_id)
    and coalesce(case p.scope
      when 'individual' then p.creator_id=p_actor
      when 'community' then private.project_community_manager(p.community_id,p_actor)
      when 'organization' then private.organization_has_permission(p_actor,p.organization_id,'polls.manage')
      when 'project' then exists(select 1 from private.community_projects q where q.id=p.project_id and
        private.project_execution_role(q,p_actor) in ('owner','manager') and
        (p.task_id is null or exists(select 1 from private.project_tasks t where t.project_id=q.id and t.id=p.task_id
          and private.project_task_visible(q,t,p_actor,private.project_execution_role(q,p_actor)))))
      else false end,false);
$$;

create function private.poll_can_manage(p private.polls,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select private.poll_can_organize(p,p_actor)
    and (not private.poll_high_trust(p) or private.project_identity_state(p_actor)='verified');
$$;

create function private.poll_scope_member(p private.polls,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(case p.scope
    when 'individual' then true
    when 'community' then feed_data.community_member(p.community_id,p_actor)
    when 'organization' then private.institution_role(p_actor,p.organization_id) is not null
      or exists(select 1 from private.organization_affiliations a
        where a.organization_id=p.organization_id and a.user_id=p_actor and a.status='active')
    when 'project' then exists(select 1 from private.community_projects q where q.id=p.project_id
      and private.project_execution_role(q,p_actor) in ('owner','manager','supervisor','contributor','volunteer')
      and (p.task_id is null or exists(select 1 from private.project_tasks t
        where t.project_id=q.id and t.id=p.task_id and (t.created_by=p_actor or t.assignee_id=p_actor or t.reviewer_id=p_actor)
          and private.project_task_visible(q,t,p_actor,private.project_execution_role(q,p_actor)))))
    else false end,false);
$$;

create function private.poll_live_eligible(p private.polls,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and private.poll_scope_live(p)
    and not feed_data.blocked_pair(p_actor,p.creator_id)
    and private.poll_scope_member(p,p_actor)
    and (p.eligibility='active' or private.project_identity_state(p_actor)='verified');
$$;

create function private.poll_can_read(p private.polls,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and not feed_data.blocked_pair(p_actor,p.creator_id)
    and (private.poll_can_manage(p,p_actor) or (p.published_at is not null and private.poll_scope_live(p)
      and (p.audience='members' or private.poll_scope_member(p,p_actor))));
$$;

create function private.poll_status(p private.polls)
returns text language sql stable set search_path='' as $$
  select case when p.status<>'published' then p.status when statement_timestamp()<p.opens_at then 'scheduled'
    when statement_timestamp()<p.closes_at then 'open' else 'awaiting_close' end;
$$;

revoke all on function private.poll_high_trust(private.polls),private.poll_community_active(uuid,boolean,timestamptz),
  private.poll_scope_live(private.polls),private.poll_can_manage(private.polls,uuid),private.poll_can_organize(private.polls,uuid),
  private.poll_scope_member(private.polls,uuid),
  private.poll_live_eligible(private.polls,uuid),private.poll_can_read(private.polls,uuid),private.poll_status(private.polls)
  from public,anon,authenticated,service_role;
