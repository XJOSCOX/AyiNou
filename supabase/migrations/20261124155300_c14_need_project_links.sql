-- Association review is independent of project review, with a closed disposable gate.
create table private.c14_fixture (enabled boolean primary key check(enabled));
create table private.c14_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  publication_id uuid not null references private.c13_publications(id),
  publication_snapshot uuid not null references private.c13_events(id),
  project_revision integer not null,
  initiated_version integer not null,
  organizer uuid references auth.users(id) on delete set null,
  author uuid references auth.users(id) on delete set null,
  organizer_authority text not null check(organizer_authority in ('individual','organization','community')),
  purpose text not null,
  reviewer uuid references auth.users(id) on delete set null,
  state text not null default 'awaiting_consent' check(state in
    ('awaiting_consent','awaiting_review','approved','rejected','declined','withdrawn','revoked')),
  revision integer not null default 1,
  activated_at timestamptz
);
create unique index c14_active_pair on private.c14_links(project_id,publication_id)
  where state in ('awaiting_consent','awaiting_review','approved');
create index c14_author_queue on private.c14_links(author,id);
create index c14_organizer_queue on private.c14_links(organizer,id);
create index c14_reviewer_queue on private.c14_links(reviewer,id);
create index c14_publication_links on private.c14_links(publication_id,id);
create table private.c14_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references private.c14_links(id),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid,
  request_id uuid,
  request_hash bytea,
  action text not null,
  revision integer not null,
  state text not null,
  project_version integer,
  reason text,
  subject uuid references auth.users(id) on delete set null,
  happened_at timestamptz not null default clock_timestamp(),
  unique(actor,request_id)
);
create index c14_event_history on private.c14_events(link_id,revision desc,happened_at desc);
alter table private.c14_fixture enable row level security;
alter table private.c14_links enable row level security;
alter table private.c14_events enable row level security;
revoke all on private.c14_fixture,private.c14_links,private.c14_events from public,anon,authenticated,service_role;

create function private.c14_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c13_enabled() and exists(select from private.c14_fixture where enabled)
$$;

create function private.c14_organizer(p private.community_projects, who uuid)
returns boolean language sql stable set search_path='' as $$
  select p.id is not null and who is not null and
    (private.project_owner_access(p,who,'submit') or private.project_owner_access(p,who,'propose'))
$$;

create function private.c14_project_read(p private.community_projects, who uuid)
returns boolean language sql stable set search_path='' as $$
  -- The native directory check runs under the service caller. Recheck the actual viewer's blocking rules.
  select coalesce(p.id is not null and (private.project_operator(p,who) or
    (private.project_visible(p) and not feed_data.blocked_pair(who,p.submitted_by)
      and not feed_data.blocked_pair(who,p.owner_user_id))),false)
$$;

create function private.c14_need_read(pub private.c13_publications,n private.c11_needs,who uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(who is not null and pub.live_proposal is not null and feed_data.community_member(n.community_id,who)
    and exists(select from private.c13_events s join private.c12_cases r on r.need_id=n.id
      where s.id=pub.live_proposal and private.c13_current(n,r,s.finding,s.evidence_revision)),false)
$$;

create function private.c14_current(l private.c14_links,p private.community_projects,pub private.c13_publications,n private.c11_needs)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.id is not null and p.restricted_at is null and p.status<>'rejected'
    and p.pending_status is distinct from 'rejected'
    and coalesce(p.pending_revision,p.revision)=l.project_revision
    and exists(select from private.project_revisions v where v.project_id=p.id and v.revision=l.project_revision
      and char_length(btrim(v.proposal->>'objectives'))>=3)
    and pub.live_proposal=l.publication_snapshot and n.author_id=l.author
    and private.c14_need_read(pub,n,l.organizer) and private.institution_actor(l.author)
    and feed_data.community_member(n.community_id,l.author)
    and private.c14_organizer(p,l.organizer)
    and private.project_proposal_identity_state(l.organizer,p.owner_user_id)='verified'
    and not feed_data.blocked_pair(l.organizer,l.author),false)
$$;

create function private.c14_independent(l private.c14_links,p private.community_projects,pub private.c13_publications,
  n private.c11_needs,r private.c12_cases,candidate uuid)
returns boolean language sql stable set search_path='' as $$
  select candidate is not null and candidate is distinct from l.organizer and candidate is distinct from l.author
    and private.c12_granted(candidate,n.community_id,'review')
    and not private.c12_conflicted(candidate,n,r,false) and candidate is distinct from r.reviewer
    and not exists(select from private.c12_events e where e.need_id=n.id
      and ((e.id=r.finding_id and e.actor_id=candidate) or (e.action='assign_triage' and e.subject_id=candidate)))
    and not private.project_conflicted(p,candidate)
    and candidate is distinct from p.reviewer_id and candidate is distinct from p.pending_reviewer_id
    and not exists(select from private.project_team t where t.project_id=p.id and t.user_id=candidate and t.revoked_at is null)
    and not exists(select from private.c13_events e where e.publication_id=pub.id and e.proposal=l.publication_snapshot
      and e.actor=candidate and e.action='approve')
$$;

create function private.c14_manage_view(l private.c14_links,p private.community_projects,pub private.c13_publications,
  n private.c11_needs,who uuid,lane text) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'state',l.state,'revision',l.revision,'purpose',l.purpose,
    'project',case when private.c14_project_read(p,who) then jsonb_build_object('id',p.id,'title',
      (select x.proposal->>'title' from private.project_revisions x where x.project_id=p.id
        and x.revision=case when private.project_operator(p,who) then l.project_revision else p.revision end)) end,
    'need',case when pub.live_proposal=l.publication_snapshot and private.c14_need_read(pub,n,who) then
      (select jsonb_build_object('id',pub.id,'title',e.content->>'title','slug',c.slug)
       from private.c13_events e join feed_data.communities c on c.id=n.community_id where e.id=l.publication_snapshot) end,
    'objective',case when lane='review' then (select x.proposal->>'objectives' from private.project_revisions x
      where x.project_id=p.id and x.revision=l.project_revision) end,
    'needSummary',case when lane='review' then (select e.content->>'description' from private.c13_events e
      where e.id=l.publication_snapshot) end,
    'asAuthor',l.author=who,'asOrganizer',l.organizer=who and private.c14_organizer(p,who),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'at',e.happened_at,
      'reason',case when lane='review' then e.reason end) order by e.happened_at desc),'[]'::jsonb)
      from (select x.* from private.c14_events x where x.link_id=l.id order by happened_at desc limit 40) e))
$$;

-- Native lifecycle updates revoke associations without modifying the native decision or its audit.
create function private.c14_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid; affected private.c14_links; current_project private.community_projects; revoke_link boolean; activate_link boolean;
begin
  if tg_table_name='community_projects' then
    target_id:=old.id;
    if tg_op='DELETE' then revoke_link:=true;
    else
      current_project:=new;
      revoke_link:=new.restricted_at is not null or new.status='rejected' or coalesce(new.pending_status='rejected',false)
        or coalesce(new.pending_revision,new.revision)<>coalesce(old.pending_revision,old.revision)
        or (old.directory_published_at is not null and new.directory_published_at is null);
      activate_link:=not revoke_link and old.directory_published_at is null and new.directory_published_at is not null;
    end if;
    if not (coalesce(revoke_link,false) or coalesce(activate_link,false)) then return null; end if;
  else
    target_id:=new.id;
    revoke_link:=new.live_proposal is distinct from old.live_proposal and old.live_proposal is not null;
    if not revoke_link then return null; end if;
  end if;
  for affected in
    update private.c14_links l
    set state=case when revoke_link then 'revoked' else l.state end,
        reviewer=case when revoke_link then null else l.reviewer end,
        activated_at=case when activate_link then clock_timestamp() else l.activated_at end,revision=l.revision+1
    where (case when tg_table_name='community_projects' then l.project_id=target_id else l.publication_id=target_id end)
      and ((revoke_link and l.state in ('awaiting_consent','awaiting_review','approved'))
        or (activate_link and l.state='approved' and l.activated_at is null
          and exists(select from private.c13_publications b join private.c11_needs n on n.id=b.need_id
            where b.id=l.publication_id and private.c14_current(l,current_project,b,n))))
    returning l.*
  loop
    insert into private.c14_events(link_id,action,revision,state) values(affected.id,
      case when revoke_link then 'invalidate' else 'activate' end,affected.revision,affected.state);
  end loop;
  return null;
end
$$;
create trigger c14_project_change after update of status,revision,pending_revision,pending_status,restricted_at,directory_published_at
  on private.community_projects for each row execute function private.c14_invalidate();
create trigger c14_project_delete after delete on private.community_projects for each row execute function private.c14_invalidate();
create trigger c14_publication_change after update of live_proposal on private.c13_publications for each row execute function private.c14_invalidate();


create function public.c14_links_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_id uuid,p_after uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  l private.c14_links; p private.community_projects; pub private.c13_publications;
  n private.c11_needs; r private.c12_cases; prior private.c14_events;
  action text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; reason text:=btrim(p_command->>'reason'); digest bytea;
  act_at timestamptz; project_id uuid;
begin
  if not private.c14_enabled() then raise exception 'association disabled' using errcode='C1401'; end if;
  if p_lane in ('member','project','publication','options') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false) then
      raise exception 'live member required' using errcode='42501';
    end if;
  elsif p_lane not in ('admin','review') or not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false) then
    raise exception 'original workspace required' using errcode='42501';
  end if;

  if p_lane='options' and p_command is null then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,jsonb_build_object('id',q.id,'title',e.content->>'title','slug',c.slug,'community',c.department_code)
        as item
      from private.c13_publications q join private.c11_needs d on d.id=q.need_id
      join private.c13_events e on e.id=q.live_proposal join feed_data.communities c on c.id=d.community_id
      where (p_after is null or q.id<p_after) and private.c14_need_read(q,d,p_actor)
        and private.institution_actor(d.author_id) and feed_data.community_member(d.community_id,d.author_id)
        and d.author_id is distinct from p_actor and not feed_data.blocked_pair(p_actor,d.author_id)
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_lane='project' and p_command is null then
    select * into p from private.community_projects where id=p_id;
    if not private.c14_project_read(p,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    return jsonb_build_object('canRequest',private.c14_organizer(p,p_actor) and p.restricted_at is null
      and p.status<>'rejected' and p.pending_status is distinct from 'rejected'
      and private.project_proposal_identity_state(p_actor,p.owner_user_id)='verified',
      'items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,case when q.organizer=p_actor and private.c14_organizer(p,p_actor)
        then private.c14_manage_view(q,p,b,d,p_actor,'member')
        else jsonb_build_object('id',q.id,'state','approved','need',
          private.c14_manage_view(q,p,b,d,p_actor,'member')->'need') end item
      from private.c14_links q join private.c13_publications b on b.id=q.publication_id
      join private.c11_needs d on d.id=b.need_id where q.project_id=p_id
        and (p_after is null or q.id<p_after)
        and ((q.state='approved' and (q.activated_at is not null or private.project_operator(p,p_actor)) and private.c14_current(q,p,b,d) and private.c14_need_read(b,d,p_actor))
          or (q.organizer=p_actor and private.c14_organizer(p,p_actor)))
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_lane='publication' and p_command is null then
    select * into pub from private.c13_publications where id=p_id;
    select * into n from private.c11_needs where id=pub.need_id;
    if not private.c14_need_read(pub,n,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,jsonb_build_object('id',d.id,'title',v.proposal->>'title') item
      from private.c14_links q join private.community_projects d on d.id=q.project_id
      join private.project_revisions v on v.project_id=d.id and v.revision=d.revision
      where q.publication_id=p_id and q.state='approved' and q.activated_at is not null and q.project_revision=d.revision
        and (p_after is null or q.id<p_after) and private.c14_current(q,d,pub,n)
        and private.project_visible(d) and private.c14_project_read(d,p_actor)
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_command is null and p_id is null then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,private.c14_manage_view(q,d,b,need,p_actor,p_lane) item
      from private.c14_links q left join private.community_projects d on d.id=q.project_id
      join private.c13_publications b on b.id=q.publication_id join private.c11_needs need on need.id=b.need_id
      left join private.c12_cases ev on ev.need_id=need.id
      where (p_after is null or q.id<p_after) and (
        (p_lane='member' and (q.author=p_actor or q.organizer=p_actor))
        or (p_lane='admin' and q.state='awaiting_review' and private.c14_current(q,d,b,need))
        or (p_lane='review' and q.state='awaiting_review' and q.reviewer=p_actor
          and private.c14_current(q,d,b,need) and private.c14_independent(q,d,b,need,ev,p_actor)))
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_command is null or p_lane not in ('member','admin','review') or req is null or action is null
    or p_command->'confirmed' is distinct from 'true'::jsonb
    or (reason is not null and (char_length(reason) not between 5 and 1500 or reason ~ '[[:cntrl:]]'))
  then raise exception 'invalid command' using errcode='23514'; end if;
  perform pg_advisory_xact_lock_shared(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  perform pg_advisory_xact_lock(20261124,1551);
  if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
    or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
  then raise exception 'session required' using errcode='42501'; end if;
  digest:=extensions.digest(jsonb_build_array(p_lane,p_id,p_command)::text,'sha256');
  select * into prior from private.c14_events where actor=p_actor and request_id=req;
  if prior.id is not null then
    if prior.request_hash is distinct from digest then raise exception 'request changed' using errcode='C1403'; end if;
    return jsonb_build_object('id',prior.link_id,'state',prior.state,'revision',prior.revision);
  end if;

  if action='request' and p_lane='member' then
    project_id:=(p_command->>'project')::uuid;
    select * into p from private.community_projects where id=project_id for share;
    if not private.c14_organizer(p,p_actor) then raise exception 'organizer required' using errcode='42501'; end if;
    if p.version is distinct from (p_command->>'projectVersion')::int then raise exception 'proposal changed' using errcode='C1403'; end if;
    select * into pub from private.c13_publications where id=(p_command->>'publication')::uuid;
    select * into n from private.c11_needs where id=pub.need_id;
    if not private.c14_need_read(pub,n,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    if (p.association_id is not null and p.association_id<>n.community_id)
      or (p.community_id is not null and p.community_id<>n.community_id)
      or p_actor=n.author_id or reason is null or char_length(reason)>600
      or reason ~* '(https?://|www\.|@|([0-9][ .()+-]*){7,})'
    then raise exception 'invalid or conflicting association' using errcode='23514'; end if;
    perform private.m23_resource_guard(p_actor,'project_create','project',p.id);
    l.project_id:=p.id; l.publication_id:=pub.id; l.publication_snapshot:=pub.live_proposal;
    l.project_revision:=coalesce(p.pending_revision,p.revision); l.organizer:=p_actor; l.author:=n.author_id;
    if not private.c14_current(l,p,pub,n) then raise exception 'association unavailable' using errcode='42501'; end if;
    insert into private.c14_links(project_id,publication_id,publication_snapshot,project_revision,initiated_version,
      organizer,author,organizer_authority,purpose)
      values(l.project_id,l.publication_id,l.publication_snapshot,l.project_revision,p.version,l.organizer,l.author,
        case when p.organization_id is not null then 'organization' when p.community_id is not null then 'community' else 'individual' end,reason)
      returning * into l;
  else
    select q.project_id into project_id from private.c14_links q where q.id=p_id;
    select * into p from private.community_projects where id=project_id for share;
    select * into l from private.c14_links where id=p_id for update;
    if l.id is null or (p_lane='member' and l.author is distinct from p_actor and l.organizer is distinct from p_actor)
      or (p_lane='review' and l.reviewer is distinct from p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    if l.revision is distinct from (p_command->>'expectedRevision')::int then raise exception 'association changed' using errcode='C1403'; end if;
    select * into pub from private.c13_publications where id=l.publication_id;
    select * into n from private.c11_needs where id=pub.need_id;
    select * into r from private.c12_cases where need_id=n.id;
    if action in ('consent','assign','approve') and not private.c14_current(l,p,pub,n) then
      raise exception 'association changed' using errcode='C1403';
    end if;
    if action in ('consent','decline') and p_lane='member' and l.author=p_actor and l.state='awaiting_consent' then
      if action='consent' and not private.c14_need_read(pub,n,p_actor) then raise exception 'current membership required' using errcode='42501'; end if;
      l.state:=case when action='consent' then 'awaiting_review' else 'declined' end;
    elsif action='assign' and p_lane='admin' and l.state='awaiting_review' and target is distinct from p_actor and reason is not null then
      if not private.c14_independent(l,p,pub,n,r,target) then raise exception 'independent reviewer required' using errcode='42501'; end if;
      l.reviewer:=target;
    elsif action in ('approve','reject') and p_lane='review' and l.state='awaiting_review' and reason is not null
      and private.c14_independent(l,p,pub,n,r,p_actor) then
      if action='approve' then
        if p_command->'relationshipConfirmed' is distinct from 'true'::jsonb then raise exception 'confirm relationship' using errcode='23514'; end if;
        perform private.m23_resource_guard(l.organizer,'project_create','project',p.id);
        perform 1 from feed_data.community_memberships m where m.community_id=n.community_id
          and m.user_id in (l.author,l.organizer) order by m.user_id for key share;
        if not private.c14_current(l,p,pub,n) then raise exception 'association changed' using errcode='C1403'; end if;
        l.state:='approved';
        if private.project_visible(p) and p.revision=l.project_revision then l.activated_at:=clock_timestamp(); end if;
      else l.state:='rejected'; end if;
    elsif action='withdraw' and p_lane='member' and l.state in ('awaiting_consent','awaiting_review','approved')
      and (l.author=p_actor or (l.organizer=p_actor and private.c14_organizer(p,p_actor))) then
      l.state:=case when l.state='approved' then 'revoked' else 'withdrawn' end;
    else raise exception 'association action unavailable' using errcode='42501';
    end if;
    update private.c14_links set revision=l.revision+1,state=l.state,reviewer=l.reviewer,activated_at=l.activated_at
      where id=l.id returning * into l;
  end if;

  act_at:=clock_timestamp();
  insert into private.c14_events(link_id,actor,workspace,request_id,request_hash,action,revision,state,project_version,reason,subject,happened_at)
    values(l.id,p_actor,p_workspace,req,digest,action,l.revision,l.state,p.version,
      case when action in ('assign','approve','reject') then reason end,target,act_at);
  if action='approve' and l.activated_at is not null then
    insert into private.c14_events(link_id,actor,workspace,action,revision,state,project_version,happened_at)
      values(l.id,p_actor,p_workspace,'activate',l.revision,l.state,p.version,act_at);
  end if;
  return jsonb_build_object('id',l.id,'state',l.state,'revision',l.revision);
end
$$;


alter table feed_data.notifications add column need_project_event_id uuid references private.c14_events(id),
  add constraint c14_notice_shape check ((kind='need_project_notice')=(need_project_event_id is not null)
    and (need_project_event_id is null or (actor_id is null and post_id is null and comment_id is null))),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice','community_need_notice','need_project_notice'));
create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='need_project_notice' then private.c14_enabled() and private.institution_actor(n.recipient_id)
      and exists(select from private.c14_events e join private.c14_links l on l.id=e.link_id
        left join private.community_projects p on p.id=l.project_id
        where e.id=n.need_project_event_id and (l.author=n.recipient_id
          or (l.organizer=n.recipient_id and private.c14_organizer(p,n.recipient_id))))
    when n.kind='community_need_notice' then private.c12_enabled() and private.institution_actor(n.recipient_id)
      and exists(select from private.c12_events e join private.c11_needs c on c.id=e.need_id
        where e.id=n.community_need_event_id and c.author_id=n.recipient_id)
    when n.kind='event_notice' then exists (select 1 from feed_data.events e where e.id=n.community_event_id
        and feed_data.f25_event_visible(e) and (n.actor_id is null or (not feed_data.blocked_pair(n.recipient_id,n.actor_id)
          and not exists(select 1 from feed_data.member_mutes m where m.actor_id=n.recipient_id and m.target_id=n.actor_id))))
      when n.kind='poll_event' then private.poll_notice_visible(n.poll_event_id,n.recipient_id)
    when n.kind='project_operation' then private.project_operation_notice_visible(n.project_operation_event_id,n.recipient_id)
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
    when n.kind='organization_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_role_audit a where a.id=n.organization_role_event_id and a.subject_id=n.recipient_id)
    when n.kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected') then
      feed_data.author_active(n.recipient_id) and exists(select 1 from private.project_events e
        join private.community_projects p on p.id=e.project_id where e.id=n.project_event_id and e.recipient_id=n.recipient_id
          and (case when e.action='assign' then p.status='under_review' and p.reviewer_id=n.recipient_id
            and private.project_reviewer(p,n.recipient_id)
            else private.project_owner_access(p,n.recipient_id,'submit') or private.project_owner_access(p,n.recipient_id,'view_private') end))
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind in ('post_mention','post_repost','post_quote') then
      not exists(select from feed_data.member_mutes where actor_id=n.recipient_id and target_id=n.actor_id)
      and exists(select from feed_data.posts p where p.id=n.post_id
        and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        and case n.kind
          when 'post_mention' then feed_data.f24_allows_mention(n.recipient_id,n.actor_id) and exists(select from feed_data.social_mentions m
            where m.post_id=p.id and m.comment_id is not distinct from n.comment_id and m.member_id=n.recipient_id)
            and (n.comment_id is null or exists(select from feed_data.comments c where c.id=n.comment_id
              and feed_data.comment_visible(c) and (c.parent_id is null or exists(select from feed_data.comments parent
                where parent.id=c.parent_id and feed_data.comment_visible(parent)))))
          when 'post_repost' then feed_data.f21_shareable(p) and exists(select from feed_data.reposts r
            where r.post_id=p.id and r.actor_id=n.actor_id)
          else exists(select from feed_data.post_quotes q join feed_data.posts source on source.id=q.source_id
            where q.post_id=p.id and source.author_id=n.recipient_id and feed_data.f21_shareable(source))
        end)
    when n.kind='follow_requested' then exists(select from feed_data.follow_requests r
      where r.requester_id=n.actor_id and r.target_id=n.recipient_id and n.dedupe='follow_requested:'||r.id::text)
    when n.kind='follow_approved' then exists(select from feed_data.member_follows f
      where f.follower_id=n.recipient_id and f.target_id=n.actor_id and f.explicitly_approved_at is not null)
    when n.kind='new_follower' then feed_data.follower_visible(n.actor_id)
      and feed_data.follower_visible(n.recipient_id) and exists(
        select 1 from feed_data.member_follows where follower_id=n.actor_id and target_id=n.recipient_id)
    else exists(select 1 from feed_data.posts p where p.id=n.post_id and feed_data.discussion_visible(p))
      and case when n.kind='post_reaction' then exists(
        select 1 from feed_data.post_reactions r where r.post_id=n.post_id and r.user_id=n.actor_id)
      else exists(select 1 from feed_data.comments c where c.id=n.comment_id and c.post_id=n.post_id
        and feed_data.comment_visible(c)
        and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
          and feed_data.comment_visible(parent)))) end
    end;
$$;

create function private.c14_notify_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.c14_enabled() and new.action in ('request','consent','decline','approve','reject','activate','withdraw','invalidate') then
    insert into feed_data.notifications(recipient_id,kind,need_project_event_id,dedupe)
      select distinct receiver,'need_project_notice',new.id,'need-project:'||new.id::text
      from private.c14_links l cross join lateral (values(l.author),(l.organizer)) recipients(receiver)
      where l.id=new.link_id and receiver is not null
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end
$$;
create trigger c14_notify after insert on private.c14_events for each row execute function private.c14_notify_event();

revoke all on function private.c14_enabled(),private.c14_organizer(private.community_projects,uuid),
  private.c14_project_read(private.community_projects,uuid),private.c14_need_read(private.c13_publications,private.c11_needs,uuid),
  private.c14_current(private.c14_links,private.community_projects,private.c13_publications,private.c11_needs),
  private.c14_independent(private.c14_links,private.community_projects,private.c13_publications,private.c11_needs,private.c12_cases,uuid),
  private.c14_manage_view(private.c14_links,private.community_projects,private.c13_publications,private.c11_needs,uuid,text),
  private.c14_invalidate(),private.c14_notify_event(),
  public.c14_links_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c14_links_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,uuid,jsonb) to service_role;
