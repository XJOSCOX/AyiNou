-- Preserve routine parity and trusted identity presentation without changing any release gate.

create function private.platform_admin_roster()
returns table(user_id uuid) language sql stable set search_path='' as $$
  select r.user_id from public.role_assignments r where r.role='administrator'
  union
  select b.user_id from private.platform_bootstrap b where b.singleton and private.platform_founder(b.user_id);
$$;
revoke all on function private.platform_admin_roster() from public,anon,authenticated,service_role;

create or replace function private.project_reviewer(p private.community_projects,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.author_active(p_actor) and private.verified_totp(p_actor) and not private.project_conflicted(p,p_actor) and (
    private.platform_founder(p_actor)
    or exists(select 1 from public.role_assignments where user_id=p_actor and role in ('administrator','moderator'))
    or exists(select 1 from feed_data.community_staff s where s.user_id=p_actor and s.community_id=p.community_id
      and s.role='moderator' and feed_data.community_member(s.community_id,p_actor)));
$$;

create or replace function public.o5_governance_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g private.platform_governance; proposals jsonb;
begin
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_admin,false);
  select coalesce(jsonb_agg(private.o5_proposal_card(x.item) ||
    jsonb_build_object('own',p_admin and (x.item).proposer_id=p_actor,'targeted',coalesce((x.item).target_id=p_actor,false))
    || case when p_admin then jsonb_build_object('target',(x.item).target_id,'rationale',(
      select e.reason from private.platform_governance_events e
      where e.resource_id=(x.item).id and e.scope='proposal' and e.action='propose' and e.version=1
      order by e.occurred_at,e.id limit 1)) else '{}'::jsonb end
    order by (x.item).created_at desc,(x.item).id),'[]'::jsonb) into proposals
  from (select p as item from private.platform_governance_proposals p
    where p_admin or (p.target_id=p_actor and p.kind in ('appoint','succession'))
    order by p.created_at desc,p.id limit 30) x;
  if not p_admin then return jsonb_build_object('proposals',proposals); end if;
  select * into g from private.platform_governance where singleton;
  return jsonb_build_object('mode',g.mode,'version',g.version,'executionEnabled',false,'recoveryEnabled',false,'proposals',proposals,
    'administrators',coalesce((select jsonb_agg(jsonb_build_object('id',x.user_id,'username',x.username,
      'eligible',private.platform_admin(x.user_id),
      'founding',private.platform_founder(x.user_id)) order by x.user_id)
      from (select r.user_id,p.username from private.platform_admin_roster() r
        left join public.profiles p on p.user_id=r.user_id
        order by private.platform_founder(r.user_id) desc,r.user_id limit 50) x),'[]'::jsonb),
    'authorities',coalesce((select jsonb_agg(x.scope order by x.scope) from private.platform_governance_authorities x
      where x.user_id=p_actor and x.revoked_at is null and x.starts_at<=now() and x.expires_at>now()),'[]'::jsonb),
    'holds',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'version',x.version,'expiresAt',x.expires_at,
      'state',case when x.lifted_at is not null then 'released' when x.expires_at<=now() then 'expired' else 'active' end,
      'canRelease',x.placed_by<>p_actor and private.institution_reviewer(p_actor))
      order by x.created_at desc,x.id) from (select h.* from private.platform_claim_approval_holds h
        join private.verification_applications a on a.id=h.application_id
        where not private.institution_conflicted(p_actor,a) order by h.created_at desc,h.id limit 25) x),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'scope',x.scope,'action',x.action,
      'version',x.version,'occurredAt',x.occurred_at) order by x.occurred_at desc,x.id)
      from (select e.* from private.platform_governance_events e where e.scope in ('proposal','authority')
        order by e.occurred_at desc,e.id limit 30) x),'[]'::jsonb));
end
$$;

create or replace function private.lifecycle_inventory(p_subject uuid)
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
        select 1 from private.platform_admin_roster() r where r.user_id<>p_subject and private.platform_admin(r.user_id))
    union all select 'privileged_role',null,'block' where private.platform_founder(p_subject) or exists(
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

create or replace function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(row.account || jsonb_build_object(
    'verified',cardinality(private.reviewed_personal_claims((row.account->>'id')::uuid))>0,
    'personalClaims',private.reviewed_personal_claims((row.account->>'id')::uuid),
    'founder',private.platform_founder((row.account->>'id')::uuid),
    'bootstrapTrust',exists(select 1 from private.platform_bootstrap b where b.user_id=(row.account->>'id')::uuid))
    order by row.position),'[]'::jsonb)
  from jsonb_array_elements(private.admin_accounts_for_api(p_actor,p_query,p_offset)) with ordinality as row(account,position);
$$;

create or replace function public.founder_identity_public_for_api(p_subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.founder_identity_policy_open() and private.institution_actor(p_subject) and exists (
    select 1 from private.founder_identity_grants g
    join private.founder_identity_cases c on c.id=g.case_id
    where g.subject_id=p_subject and private.platform_founder(g.issuer_id) and c.state='granted' and not c.conflicted and c.disclose
      and c.consent_at is not null and c.consent_version=c.policy_version and c.policy_version=1
  )
$$;
