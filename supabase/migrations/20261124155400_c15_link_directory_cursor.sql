-- Use the project ID as the community-side cursor, matching the safe project projection.
-- Keep the original signature, grants, role checks, and all other lanes.
create or replace function public.c14_links_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
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
      select d.id,jsonb_build_object('id',d.id,'title',v.proposal->>'title') item
      from private.c14_links q join private.community_projects d on d.id=q.project_id
      join private.project_revisions v on v.project_id=d.id and v.revision=d.revision
      where q.publication_id=p_id and q.state='approved' and q.activated_at is not null and q.project_revision=d.revision
        and (p_after is null or d.id<p_after) and private.c14_current(q,d,pub,n)
        and private.project_visible(d) and private.c14_project_read(d,p_actor)
      order by d.id desc limit 21) x),'[]'::jsonb));
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
