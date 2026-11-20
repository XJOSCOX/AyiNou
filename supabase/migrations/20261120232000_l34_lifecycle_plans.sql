-- This phase can inspect synthetic accounts and write lifecycle records only.
create table private.lifecycle_fixtures (
  subject_id uuid primary key references auth.users(id) on delete cascade
);

create table private.lifecycle_policy (
  version integer primary key check(version=1),
  designation text not null check(designation='synthetic_unapproved'),
  jurisdiction text not null check(jurisdiction='fixture'),
  categories text[] not null,
  trigger_event text not null check(trigger_event='confirmed_simulation'),
  retention_period interval check(retention_period is null),
  approval_record uuid check(approval_record is null),
  approved_for_destruction boolean not null check(not approved_for_destruction)
);
insert into private.lifecycle_policy values
  (1,'synthetic_unapproved','fixture',array['account','organization','community','discussion','project','media','audit','voting'],
    'confirmed_simulation',null,null,false);

create table private.lifecycle_plans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  case_id uuid not null references private.privacy_cases(id) on delete restrict,
  version integer not null check(version>0),
  case_version integer not null check(case_version=1),
  policy_version integer not null default 1 references private.lifecycle_policy(version),
  request_key uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  confirmation_key uuid,
  approved_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  unique(case_id,version),
  unique(case_id,request_key),
  check(approved_by is null or confirmed_at is not null),
  check((confirmation_key is null)=(confirmed_at is null))
);

create table private.lifecycle_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null references private.lifecycle_plans(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check(kind in ('planned','confirmed','approved','hold_placed','hold_released',
    'claimed','simulated_effect','reconciled','retryable','simulated','restore_reapplied','restore_released')),
  resource uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index lifecycle_event_plan on private.lifecycle_events(plan_id,id);

alter table private.lifecycle_fixtures enable row level security;
alter table private.lifecycle_policy enable row level security;
alter table private.lifecycle_plans enable row level security;
alter table private.lifecycle_events enable row level security;
revoke all on private.lifecycle_fixtures,private.lifecycle_policy,private.lifecycle_plans,private.lifecycle_events
  from public,anon,authenticated,service_role;

-- Live catalog gap inventory. Only qualified identifiers from PostgreSQL's catalog are interpolated.
-- No input chooses a relation, and the checked subject is always a bound value.
-- A capped count records relationship impact, without reading arbitrary payloads or credentials.
create function private.lifecycle_direct_edges(p_subject uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  edge record;
  hits integer;
  edges jsonb:='[]'::jsonb;
begin
  for edge in
    select n.nspname schema_name,t.relname relation,a.attname column_name,k.confdeltype delete_rule
    from pg_catalog.pg_constraint k join pg_catalog.pg_class t on t.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and cardinality(k.conkey)=1
      and n.nspname in ('public','private','feed_data') and t.relname not like 'lifecycle_%'
      and t.relname not in ('poll_ballots','poll_electorate','poll_options','poll_events','polls','poll_decisions')
    order by n.nspname,t.relname,a.attname,k.conname
  loop
    execute pg_catalog.format('select count(*) from (select 1 from %I.%I where %I=$1 limit 129) rows',
      edge.schema_name,edge.relation,edge.column_name) into hits using p_subject;
    if hits>0 then
      edges:=edges || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'source',edge.schema_name||'.'||edge.relation,'binding',edge.column_name,
        'deleteRule',edge.delete_rule::text,'countCapped',hits,
        'disposition',case edge.delete_rule when 'n' then 'detach_identity_review' when 'c' then 'block_pending_review' else 'preserve_review' end));
    end if;
  end loop;
  return edges;
end;
$$;

-- Specific ownership, obligations, discussion chains and media references. The private snapshot
-- contains keys needed for planning, never evidence, credentials, raw text, ballot identifiers or selections.
create function private.lifecycle_inventory(p_subject uuid)
returns jsonb language sql stable set search_path='' as $$
  with direct_edges as (
    select private.lifecycle_direct_edges(p_subject) edges
  ), memberships as (
    select m.id,m.organization_id,m.role,m.verified_at,o.logo_asset
    from private.organization_memberships m join private.organizations o on o.id=m.organization_id
    where m.user_id=p_subject and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
    order by m.id limit 129
  ), owned_groups as (
    select id from feed_data.communities where owner_id=p_subject order by id limit 129
  ), posts as (
    select id,version,status from feed_data.posts where author_id=p_subject order by id limit 129
  ), comments as (
    select id,version,status,post_id,is_root from feed_data.comments where author_id=p_subject order by id limit 129
  ), affected_comments as (
    select c.id,c.author_id=p_subject own
    from feed_data.comments c
    where c.post_id in (select id from posts) or c.parent_id in(select id from comments where is_root)
    order by c.id limit 129
  ), projects as (
    select p.id,p.version,p.status,p.owner_user_id=p_subject personal
    from private.community_projects p where p.owner_user_id=p_subject
      or p.organization_id in(select organization_id from memberships)
      or p.association_id in(select id from owned_groups)
      or p.community_id in(select id from owned_groups)
      or exists(select 1 from private.project_team t where t.project_id=p.id and t.user_id=p_subject and t.revoked_at is null)
    order by p.id limit 129
  ), media as (
    select a.id,a.state,a.post_id,a.retention_post_id,a.lease is not null leased,
      (a.author_id is distinct from p_subject or exists(
        select 1 from feed_data.posts p where p.id=a.post_id and p.author_id<>p_subject)) shared
    from feed_data.post_attachments a
    where a.author_id=p_subject or a.post_id in(select id from posts) or a.retention_post_id in(select id from posts)
    order by a.id limit 129
  ), project_bytes as (
    select i.project_id,i.digest,
      exists(select 1 from private.project_revisions r where r.project_id=i.project_id and r.image_digest=i.digest) revision_ref,
      exists(select 1 from private.project_progress_entries e where e.project_id=i.project_id and e.image_digest=i.digest) progress_ref
    from private.project_images i where i.project_id in(select id from projects)
    order by i.project_id,i.digest limit 129
  ), project_children as (
    select category,ref,revision,state from (
      select 'volunteer_application' category,a.id::text ref,0 revision,a.status state from private.project_applications a
        where a.applicant_id=p_subject or a.project_id in(select id from projects where personal)
      union all select 'task',t.id::text,t.version,t.status from private.project_tasks t
        where t.assignee_id=p_subject or t.project_id in(select id from projects where personal)
      union all select 'milestone',m.id::text,m.version,m.status from private.project_milestones m
        where m.responsible_id=p_subject or m.project_id in(select id from projects where personal)
      union all select 'progress',e.id::text,e.version,e.state from private.project_progress_entries e
        where e.author_id=p_subject or e.reviewer_id=p_subject or e.project_id in(select id from projects where personal)
      union all select 'proposal_revision',r.project_id::text||'/'||r.revision::text,r.revision,'recorded' from private.project_revisions r
        where r.author_id=p_subject or r.project_id in(select id from projects where personal)
      union all select 'project_report',r.id::text,0,r.outcome from private.project_reports r
        where r.reporter_id=p_subject or r.reviewer_id=p_subject or r.project_id in(select id from projects where personal)
    ) x order by category,ref limit 129
  ), dependencies as (
    select 'last_administrator' kind,null::text ref,'block' disposition
      where private.platform_admin(p_subject) and not exists(
        select 1 from public.role_assignments r where r.user_id<>p_subject and r.role='administrator' and private.platform_admin(r.user_id))
    union all select 'privileged_role',null,'block' where exists(
      select 1 from public.role_assignments where user_id=p_subject and role in ('administrator','moderator','verification_reviewer'))
      or exists(select 1 from private.verification_reviewers where user_id=p_subject)
    union all select 'institution_owner',organization_id::text,'transfer' from memberships where role='owner'
    union all select 'institution_authority',organization_id::text,'block' from memberships where role='administrator' or verified_at is not null
    union all select 'institution_authority',null,'block' where exists(
      select 1 from private.organization_custom_assignments where user_id=p_subject and revoked_at is null)
    union all select 'group_owner',id::text,'transfer' from owned_groups
    union all select 'group_staff',null,'block' where exists(select 1 from feed_data.community_staff where user_id=p_subject)
    union all select 'third_party_discussion',id::text,'redact' from affected_comments where not own
    union all select 'personal_project',id::text,'block' from projects where personal
    union all select 'project_commitment',null,'block' where exists(
      select 1 from private.project_applications where applicant_id=p_subject and status in ('offered','accepted'))
      or exists(select 1 from private.project_tasks where assignee_id=p_subject and status not in ('completed','cancelled'))
    union all select 'protected_evidence',null,'preserve' where exists(
      select 1 from private.project_progress_entries e where (e.author_id=p_subject or e.reviewer_id=p_subject
        or e.project_id in(select id from projects where personal)) and e.kind='evidence' and e.state<>'withdrawn')
    union all select 'protected_evidence',null,'preserve' where exists(
      select 1 from private.verification_applications a where a.applicant_id=p_subject and a.status='pending')
      or exists(select 1 from private.verification_appeals a where a.outcome='pending'
        and (a.appellant_id=p_subject or a.assigned_reviewer_id=p_subject))
      or exists(select 1 from feed_data.content_reports r where r.status='pending'
        and (r.reporter_id=p_subject or r.post_id in(select id from posts)))
      or exists(select 1 from feed_data.comment_reports r where r.status='pending'
        and (r.reporter_id=p_subject or r.comment_id in(select id from comments) or r.comment_id in(select id from affected_comments)))
      or exists(select 1 from feed_data.moderation_appeals a
        left join feed_data.post_moderation_actions pm on pm.id=a.post_action_id
        left join feed_data.comment_moderation_actions cm on cm.id=a.comment_action_id
        where a.outcome='pending' and (a.appellant_id=p_subject or a.reviewer_id=p_subject
          or pm.post_id in(select id from posts) or cm.comment_id in(select id from comments)
          or cm.comment_id in(select id from affected_comments)))
    union all select 'shared_media',id::text,'preserve' from media where shared or leased or retention_post_id is not null
    union all select 'shared_media',null,'preserve' where exists(
      select 1 from project_bytes where progress_ref or revision_ref)
    -- One coarse protected domain, even internally. Do not read option_id, choices, counts or results.
    union all select 'voting_integrity',null,'preserve' where exists(select 1 from private.poll_ballots where voter_id=p_subject)
      or exists(select 1 from private.poll_electorate where user_id=p_subject)
      or exists(select 1 from private.poll_options where nominee_id=p_subject)
      or exists(select 1 from private.polls where creator_id=p_subject or project_id in(select id from projects where personal)
        or community_id in(select id from owned_groups))
    union all select 'inventory_limit',null,'block' where greatest(
      (select count(*) from memberships),(select count(*) from owned_groups),(select count(*) from posts),
      (select count(*) from comments),(select count(*) from affected_comments),(select count(*) from projects),
      (select count(*) from media),(select count(*) from project_bytes),(select count(*) from project_children))>=129
      or exists(select 1 from direct_edges cross join lateral pg_catalog.jsonb_array_elements(edges) e
        where (e->>'countCapped')::int>=129)
  ), resources as (
    select 'subject' category,p_subject::text ref,0 version,'review' disposition,null::text bucket,null::text object_key,
      pg_catalog.jsonb_build_object('relation','subject','authorization','pending_legal_review') context
    union all select 'post',id::text,version,'redact',null,null,pg_catalog.jsonb_build_object('state',status,'relation','authored') from posts
    union all select 'comment',id::text,version,'redact',null,null,pg_catalog.jsonb_build_object('state',status,'relation','authored') from comments
    union all select 'project',id::text,version,case when personal then 'block' else 'preserve' end,null,null,
      pg_catalog.jsonb_build_object('state',status,'relation',case when personal then 'owned' else 'shared' end) from projects
    union all select category,ref,revision,'preserve',null,null,pg_catalog.jsonb_build_object('state',state,'relation','project_dependency')
      from project_children
    union all select 'avatar',p.avatar_asset::text,0,'review','member-avatars',p.user_id::text||'/'||p.avatar_asset::text||'.webp',
      pg_catalog.jsonb_build_object('relation','profile_pointer')
      from public.profiles p where p.user_id=p_subject and p.avatar_asset is not null
    union all select 'logo',organization_id::text,0,'preserve','institution-logos',organization_id::text||'/'||logo_asset::text||'.webp',
      pg_catalog.jsonb_build_object('relation','institution_owned','role',role)
      from memberships where logo_asset is not null
    union all select 'attachment',m.id::text,0,'preserve','post-media',m.id::text||'/'||v.file,
      pg_catalog.jsonb_build_object('state',m.state,'post',m.post_id,'retentionPost',m.retention_post_id,'leased',m.leased,'shared',m.shared)
      from media m cross join (values('thumbnail.webp'),('display.webp')) v(file)
    union all select 'project_image',project_id::text||'/'||digest,0,'preserve',null,null,
      pg_catalog.jsonb_build_object('revisionReference',revision_ref,'progressReference',progress_ref) from project_bytes
  )
  select pg_catalog.jsonb_build_object(
    'dependencies',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind',d.kind,'ref',d.ref,
      'disposition',d.disposition) order by d.kind,d.ref) from dependencies d),'[]'::jsonb),
    'resources', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('category',r.category,'ref',r.ref,
      'version',r.version,'disposition',r.disposition,'bucket',r.bucket,'key',r.object_key,'context',r.context,
      'objectExists',case when r.bucket is null then null else exists(
        select 1 from storage.objects o where o.bucket_id=r.bucket and o.name=r.object_key) end)
      order by r.category,r.ref,r.object_key) from resources r),
    'relationships',(select edges from direct_edges),
    'profileUpdatedAt',(select updated_at from public.profiles where user_id=p_subject),
    'verificationPending',true
  )
$$;

create function private.require_lifecycle_session(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_sensitive boolean)
returns void language plpgsql stable set search_path='' as $$
begin
  perform private.require_privacy_intake(p_actor,p_session,p_aal2);
  if not exists(select 1 from private.lifecycle_fixtures where subject_id=p_actor) then
    raise exception using errcode='PT404',message='LIFECYCLE_DISABLED';
  end if;
  if p_sensitive and (not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,true),false)
    or p_totp is null or p_totp < extract(epoch from clock_timestamp())-900
    or p_totp > extract(epoch from clock_timestamp())+30) then
    raise exception using errcode='PT403',message='MFA_REQUIRED';
  end if;
end;
$$;

revoke all on function private.lifecycle_direct_edges(uuid),private.lifecycle_inventory(uuid),
  private.require_lifecycle_session(uuid,uuid,boolean,bigint,boolean) from public,anon,authenticated,service_role;
