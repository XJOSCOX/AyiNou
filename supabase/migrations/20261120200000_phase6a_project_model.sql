create table private.community_projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references private.organizations(id) on delete cascade,
  community_id uuid references feed_data.communities(id) on delete cascade,
  association_id uuid references feed_data.communities(id) on delete restrict,
  submission_key uuid not null,
  request_digest bytea not null,
  status text not null default 'draft' check(status in ('draft','submitted','under_review','changes_requested','approved','rejected')),
  version integer not null default 1 check(version>0),
  revision integer not null default 1 check(revision between 1 and 25),
  reviewer_id uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  restricted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(creator_id,submission_key),
  check(num_nonnulls(owner_user_id,organization_id,community_id)=1),
  check((status='approved')=(approved_at is not null))
);
create index community_projects_owner on private.community_projects(owner_user_id,updated_at desc,id);
create index community_projects_creator on private.community_projects(creator_id,updated_at desc,id);
create index community_projects_organization on private.community_projects(organization_id,updated_at desc,id);
create index community_projects_community on private.community_projects(community_id,updated_at desc,id);
create index community_projects_association on private.community_projects(association_id) where association_id is not null;
create index community_projects_public on private.community_projects(approved_at desc,id desc)
  where status='approved' and restricted_at is null;
create index community_projects_queue on private.community_projects(submitted_at,id)
  where status in ('submitted','under_review');

create table private.project_images (
  project_id uuid not null references private.community_projects(id) on delete cascade,
  digest text not null check(digest ~ '^[0-9a-f]{64}$'),
  image bytea not null check(octet_length(image) between 16 and 524288),
  primary key(project_id,digest)
);
create table private.project_revisions (
  project_id uuid not null references private.community_projects(id) on delete cascade,
  revision integer not null check(revision between 1 and 25),
  author_id uuid references auth.users(id) on delete set null,
  proposal jsonb not null check(jsonb_typeof(proposal)='object'),
  category text generated always as (proposal->>'category') stored not null references public.interest_catalog(code),
  department text generated always as (proposal->>'department') stored references public.departments(code),
  image_digest text,
  created_at timestamptz not null default clock_timestamp(),
  primary key(project_id,revision),
  foreign key(project_id,image_digest) references private.project_images(project_id,digest) on delete cascade
);
create index project_revisions_category on private.project_revisions(category,project_id);
create index project_revisions_department on private.project_revisions(department,project_id) where department is not null;

create table private.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.community_projects(id) on delete cascade,
  version integer not null,
  revision integer not null,
  actor_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('create','edit','submit','assign','release','request_changes','approve','reject','restrict')),
  reason text check(reason is null or private.valid_trust_text(reason,10,1000)),
  created_at timestamptz not null default clock_timestamp(),
  unique(project_id,version),
  foreign key(project_id,revision) references private.project_revisions(project_id,revision) on delete cascade
);
create table private.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references private.community_projects(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  category text not null check(category in ('misleading','privacy','unsafe','fundraising')),
  explanation text not null check(private.valid_trust_text(explanation,10,500)),
  outcome text not null default 'pending' check(outcome in ('pending','dismissed','restricted')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reason text check(reason is null or private.valid_trust_text(reason,10,1000)),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  unique(project_id,reporter_id),
  check((outcome='pending')=(decided_at is null and reason is null))
);
create index project_reports_queue on private.project_reports(created_at,id) where outcome='pending';

alter table private.community_projects enable row level security;
alter table private.project_images enable row level security;
alter table private.project_revisions enable row level security;
alter table private.project_events enable row level security;
alter table private.project_reports enable row level security;
revoke all on private.community_projects,private.project_images,private.project_revisions,private.project_events,private.project_reports
  from public,anon,authenticated,service_role;

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff','group_manage','group_response','community_rec_build','community_rec_write',
    'project_create','project_write','project_review','project_report','project_image'));

create function private.project_community_manager(p_community uuid,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and exists(select 1 from feed_data.communities c where c.id=p_community
    and feed_data.community_member(c.id,p_actor) and case when c.kind='department' then exists(
      select 1 from feed_data.community_staff s where s.community_id=c.id and s.user_id=p_actor and s.role='administrator'
    ) else coalesce(feed_data.group_role(c,p_actor) in ('owner','administrator'),false) end);
$$;

create function private.project_owner_access(p private.community_projects,p_actor uuid,p_action text)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and feed_data.community_member(p.association_id,p_actor) and case
    when p.owner_user_id is not null then p.owner_user_id=p_actor
    when p.organization_id is not null then private.organization_has_permission(p_actor,p.organization_id,'projects.'||p_action)
    else private.project_community_manager(p.community_id,p_actor) end;
$$;

create function private.project_community_public(p_community uuid,p_on timestamptz)
returns boolean language sql stable set search_path='' as $$
  select p_community is null or exists(select 1 from feed_data.communities c where c.id=p_community
    and (c.kind='department' or (c.policy='public' and c.public_since<=p_on and feed_data.author_active(c.owner_id))));
$$;

create function private.project_visible(p private.community_projects)
returns boolean language sql stable set search_path='' as $$
  select p.status='approved' and p.restricted_at is null and (auth.uid() is null or feed_data.member_allowed())
    and feed_data.author_active(p.submitted_by) and feed_data.viewer_can_interact(p.submitted_by)
    and exists(select 1 from private.project_revisions r where r.project_id=p.id and r.revision=p.revision
      and r.proposal->>'publishRequested'='true')
    and case
      when p.owner_user_id is not null then exists(select 1 from public.profiles m
        where m.user_id=p.owner_user_id and feed_data.followable_member(m))
      when p.organization_id is not null then exists(select 1 from private.organizations o
        where o.id=p.organization_id and o.status='active' and o.verification_status<>'revoked'
          and exists(select 1 from private.organization_memberships m where m.organization_id=o.id and m.role='owner'
            and m.revoked_at is null and feed_data.author_active(m.user_id)))
      else private.project_community_public(p.community_id,p.submitted_at) end
    and private.project_community_public(p.association_id,p.submitted_at);
$$;

create function private.project_conflicted(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select p_actor is not distinct from p.creator_id or p_actor is not distinct from p.submitted_by
    or p_actor is not distinct from p.owner_user_id
    or private.project_community_manager(p.community_id,p_actor)
    or private.project_community_manager(p.association_id,p_actor)
    or exists(select 1 from private.organization_memberships where organization_id=p.organization_id and user_id=p_actor)
    or exists(select 1 from private.organization_affiliations where organization_id=p.organization_id and user_id=p_actor and joined_at is not null)
    or exists(select 1 from private.organizations where id=p.organization_id and created_by=p_actor)
    or exists(select 1 from private.project_revisions r where r.project_id=p.id and r.author_id=p_actor);
$$;

create function private.project_reviewer(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and private.verified_totp(p_actor) and not private.project_conflicted(p,p_actor) and (
    exists(select 1 from public.role_assignments where user_id=p_actor and role in ('administrator','moderator'))
    or exists(select 1 from feed_data.community_staff s where s.user_id=p_actor and s.community_id=p.community_id
      and s.role='moderator' and feed_data.community_member(s.community_id,p_actor)));
$$;

create function private.project_card(p private.community_projects)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'status',p.status,'title',r.proposal->>'title','category',r.category,
    'department',r.department,'country',r.proposal->>'country','publishedAt',case when private.project_visible(p) then p.approved_at end,
    'hasImage',r.image_digest is not null,
    'owner',case
      when p.owner_user_id is not null then coalesce((select jsonb_build_object('kind','individual','name',m.display_name,'handle',m.username)
        from public.profiles m where m.user_id=p.owner_user_id),jsonb_build_object('kind','individual','name',null,'handle',null))
      when p.organization_id is not null then (select jsonb_build_object('kind','organization','name',o.name,'handle',o.handle)
        from private.organizations o where o.id=p.organization_id)
      else (select jsonb_build_object('kind','community','name',coalesce(c.name,d.name),'handle',c.slug)
        from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.community_id) end,
    'association',(select jsonb_build_object('name',coalesce(c.name,d.name),'handle',c.slug)
      from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.association_id))
  from private.project_revisions r where r.project_id=p.id and r.revision=p.revision;
$$;

create function private.project_content_valid(value jsonb,p_complete boolean)
returns boolean language plpgsql stable set search_path='' as $$
declare key text; minimum integer:=case when p_complete then 10 else 0 end; refs text[]; first_day date; last_day date;
begin
  if jsonb_typeof(value) is distinct from 'object' or pg_column_size(value)>24000
    or (value-array['title','description','problem','solution','objectives','beneficiaries','outcomes','category','country',
      'department','startDate','endDate','references','publishRequested'])<>'{}'::jsonb
    or not private.valid_trust_text(value->>'title',3,120)
    or not exists(select 1 from public.interest_catalog where code=value->>'category')
    or coalesce(value->>'country','') !~ '^[A-Z]{2}$'
    or (value->>'department' is not null and (value->>'country'<>'HT'
      or not exists(select 1 from public.departments where code=value->>'department')))
    or jsonb_typeof(value->'publishRequested') is distinct from 'boolean'
    or jsonb_typeof(value->'references') is distinct from 'array'
  then return false; end if;
  foreach key in array array['description','problem','solution','objectives','beneficiaries','outcomes'] loop
    if jsonb_typeof(value->key) is distinct from 'string'
      or not private.valid_trust_text(value->>key,minimum,case when key='description' then 2400 else 1000 end)
      or value->>key ~ '[+-]?[0-9]{1,3}[.][0-9]{4,}[ ,;/]+[+-]?[0-9]{1,3}[.][0-9]{4,}'
    then return false; end if;
  end loop;
  if jsonb_typeof(value->'title') is distinct from 'string'
    or exists(select 1 from jsonb_array_elements(value->'references') x where jsonb_typeof(x)<>'string')
  then return false; end if;
  refs:=array(select jsonb_array_elements_text(value->'references'));
  if not private.valid_public_references(refs) then return false; end if;
  foreach key in array array['startDate','endDate'] loop
    if value->>key is not null and value->>key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  end loop;
  first_day:=(value->>'startDate')::date;
  last_day:=(value->>'endDate')::date;
  return first_day is null or last_day is null or first_day<=last_day;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

revoke all on function private.project_community_manager(uuid,uuid),private.project_owner_access(private.community_projects,uuid,text),
  private.project_community_public(uuid,timestamptz),private.project_visible(private.community_projects),
  private.project_conflicted(private.community_projects,uuid),private.project_reviewer(private.community_projects,uuid),
  private.project_card(private.community_projects),private.project_content_valid(jsonb,boolean)
  from public,anon,authenticated,service_role;
