alter table private.platform_boolean_policies drop constraint platform_boolean_policies_policy_key_check,
  add constraint platform_boolean_policies_policy_key_check check(policy_key in (
    'homepage.community_statistics.enabled','events.enabled','events.individual','events.organization',
    'events.discovery','events.rsvp','events.notifications'));
insert into private.platform_boolean_policies(policy_key,enabled) values
  ('events.enabled',true),('events.individual',true),('events.organization',true),
  ('events.discovery',true),('events.rsvp',true),('events.notifications',true);

create function feed_data.f25_policy(p_key text) returns boolean language sql stable set search_path='' as $$
  select coalesce((select enabled from private.platform_boolean_policies where policy_key=p_key),false)
$$;

create table feed_data.events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  organization_id uuid references private.organizations(id) on delete restrict,
  community_id uuid references feed_data.communities(id) on delete restrict,
  project_id uuid references private.community_projects(id) on delete set null,
  request_id uuid not null, request_hash bytea not null,
  title text not null check(length(btrim(title)) between 3 and 120 and title !~ '[[:cntrl:]]'),
  description text not null check(length(btrim(description)) between 3 and 3000),
  category text not null check(category in ('community','culture','education','volunteer','other')),
  format text not null check(format in ('in_person','online','hybrid')),
  visibility text not null check(visibility in ('public','members','community')),
  status text not null default 'draft' check(status in ('draft','published','canceled','completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at and ends_at-starts_at<=interval '31 days'),
  time_zone text not null check(length(time_zone) between 1 and 80),
  country text check(country ~ '^[A-Z]{2}$'),
  department text references public.departments(code),
  locality text check(length(btrim(locality)) between 1 and 100 and locality !~ '[[:cntrl:]]'),
  venue text check(length(btrim(venue)) between 1 and 240 and venue !~ '[[:cntrl:]]'),
  meeting_url text check(length(meeting_url)<=1000 and meeting_url ~ '^https://[^/@[:space:]]+(/[^[:cntrl:][:space:]]*)?$'),
  cover_url text check(length(cover_url)<=1000 and cover_url ~ '^https://[^/@[:space:]]+(/[^[:cntrl:][:space:]]*)?$'),
  language text not null check(language in ('ht','fr','en','es')),
  capacity int check(capacity between 1 and 5000),
  version integer not null default 1, created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(), moderated_at timestamptz,
  unique(creator_id,request_id),
  check((visibility='community')=(community_id is not null)),
  check(department is null or (country is not null and country='HT')),
  check(format<>'in_person' or meeting_url is null),
  check(format='online' or country is not null)
);
create index f25_event_schedule on feed_data.events(starts_at,id) where status in ('published','completed');
create index f25_event_member on feed_data.events(creator_id,starts_at,id);
create index f25_event_org on feed_data.events(organization_id,starts_at,id);
create index f25_event_community on feed_data.events(community_id,starts_at,id);
create index f25_event_title on feed_data.events using gin(lower(title) extensions.gin_trgm_ops);

create table feed_data.event_rsvps (
  event_id uuid references feed_data.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  response text not null check(response in ('going','interested','not_going')),
  list_me boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(event_id,user_id)
);
create index f25_event_going on feed_data.event_rsvps(event_id) where response='going';
create index f25_event_rsvp_member on feed_data.event_rsvps(user_id,event_id);
create table feed_data.event_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references feed_data.events(id) on delete restrict,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check(length(btrim(body)) between 2 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index f25_event_updates_page on feed_data.event_updates(event_id,created_at desc,id desc);
create table feed_data.event_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references feed_data.events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('created','edited','published','canceled','completed','announced','restricted','restored')),
  version integer not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create table feed_data.event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references feed_data.events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  category text not null check(category in ('harassment','hate','spam','privacy','other')),
  note text check(length(note)<=500),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique(event_id,actor_id)
);
alter table feed_data.events enable row level security;
alter table feed_data.event_rsvps enable row level security;
alter table feed_data.event_updates enable row level security;
alter table feed_data.event_audit enable row level security;
alter table feed_data.event_reports enable row level security;
revoke all on feed_data.events,feed_data.event_rsvps,feed_data.event_updates,feed_data.event_audit,feed_data.event_reports
  from public,anon,authenticated,service_role;


alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit','reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build','recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review','community_membership','community_staff','group_manage','group_response','community_rec_build','community_rec_write','project_create','project_write','project_review','project_report','project_image','project_invite','project_apply','project_task_create','project_operations','poll_create','poll_manage','poll_vote','event_write','event_rsvp','event_report','translation'));

create function feed_data.f25_event_manage(e feed_data.events) returns boolean
language sql stable set search_path='' as $$
  select coalesce(auth.uid() is not null and feed_data.member_allowed()
    and case when e.organization_id is null then e.creator_id=auth.uid()
      else feed_data.f23_can_publish(e.organization_id) end,false)
$$;

create function feed_data.f25_event_scope(e feed_data.events) returns boolean
language sql stable set search_path='' as $$
  select e.moderated_at is null and feed_data.f25_policy('events.enabled')
    and (auth.uid() is null or feed_data.member_allowed())
    and case when e.organization_id is null then exists (
      select 1 from public.profiles p where p.user_id=e.creator_id and feed_data.f24_identity(p,auth.uid()) and feed_data.f24_details(p.user_id,auth.uid())
    ) else feed_data.f21_org_visible(e.organization_id) end
    and case e.visibility when 'public' then true
      when 'members' then auth.uid() is not null
      when 'community' then auth.uid() is not null and e.community_id is not null
        and feed_data.community_member(e.community_id,auth.uid())
      else false end
$$;

create function feed_data.f25_event_visible(e feed_data.events) returns boolean
language sql stable set search_path='' as $$
  select coalesce(feed_data.f25_event_manage(e) or
    (e.status in ('published','canceled','completed') and feed_data.f25_event_scope(e)),false)
$$;

create function feed_data.f25_event_organizer(e feed_data.events) returns jsonb
language sql stable set search_path='' as $$
  select case when e.organization_id is null then jsonb_build_object('kind','member','name',p.display_name,'handle',p.username)
    else jsonb_build_object('kind','organization','name',o.name,'handle',o.handle) end
  from (select 1) anchor
  left join public.profiles p on p.user_id=e.creator_id
  left join private.organizations o on o.id=e.organization_id
$$;

create function feed_data.f25_event_public_share(e feed_data.events) returns boolean
language sql stable set search_path='' as $$
  select e.visibility='public' and e.status in ('published','canceled','completed') and feed_data.f25_event_scope(e)
    and (e.organization_id is not null or exists (
      select 1 from public.profiles p where p.user_id=e.creator_id and feed_data.f24_identity(p,null)
    ))
$$;

create function feed_data.f25_event_json(e feed_data.events,p_detail boolean) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',e.id,'createdAt',e.created_at,'version',e.version,'title',e.title,'description',e.description,
    'category',e.category,'format',e.format,'visibility',e.visibility,'status',e.status,
    'startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',e.time_zone,'country',e.country,
    'department',e.department,'locality',e.locality,'coverUrl',e.cover_url,'capacity',e.capacity,'language',e.language,
    'organizationId',e.organization_id,'communityId',e.community_id,
    'projectId',case when manager or exists (select 1 from private.community_projects p where p.id=e.project_id
      and private.project_visible(p)) then e.project_id end,
    'organizer',feed_data.f25_event_organizer(e),'canManage',manager,
    'canShare',coalesce(manager and e.status='published' and feed_data.f25_event_public_share(e),false),
    'canRsvp',auth.uid() is not null and coalesce(e.status='published' and e.ends_at>now()
      and feed_data.f25_event_scope(e) and feed_data.f25_policy('events.rsvp'),false),
    'canComplete',manager and e.status='published' and e.ends_at<=now(),'response',r.response,'listMe',coalesce(r.list_me,false),
    'venue',case when access_venue then e.venue end,'meetingUrl',case when access_venue then e.meeting_url end,
    'counts',case when p_detail and manager then (select jsonb_build_object(
      'going',count(*) filter(where response='going'),'interested',count(*) filter(where response='interested'),
      'not_going',count(*) filter(where response='not_going')) from feed_data.event_rsvps where event_id=e.id) end
  )
  from (select coalesce(feed_data.f25_event_manage(e),false) manager) m
  left join feed_data.event_rsvps r on r.event_id=e.id and r.user_id=auth.uid()
  cross join lateral (select p_detail and (manager or (r.response='going' and e.status='published' and e.ends_at>now()
    and feed_data.f25_event_scope(e))) access_venue) details
$$;

create function public.events_for_client(p_scope text,p_search text,p_format text,p_category text,p_country text,
  p_department text,p_from timestamptz,p_until timestamptz,p_after_at timestamptz,p_after_id uuid,p_limit int) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(feed_data.f25_event_json(q.e,false) order by (q.e).starts_at,(q.e).id),'[]'::jsonb)
  from (
    select e from feed_data.events e where feed_data.member_allowed()
      and case p_scope
        when 'organizing' then feed_data.f25_event_manage(e)
        when 'mine' then feed_data.f25_event_visible(e) and exists (
          select 1 from feed_data.event_rsvps r where r.event_id=e.id and r.user_id=auth.uid() and r.response<>'not_going')
        else feed_data.f25_policy('events.discovery') and feed_data.f25_event_scope(e)
          and ((p_scope='past' and e.status in ('published','completed') and e.ends_at<=now())
            or (p_scope in ('upcoming','following','communities') and e.status='published' and e.ends_at>now()))
          and (p_scope<>'communities' or (e.community_id is not null and feed_data.community_member(e.community_id,auth.uid())))
          and (p_scope<>'following' or (e.organization_id is null and feed_data.f24_audience_follower(e.creator_id,auth.uid()))
            or exists (select 1 from feed_data.institution_follows f where f.organization_id=e.organization_id and f.follower_id=auth.uid()))
      end
      and (p_search is null or strpos(lower(e.title),lower(p_search))>0)
      and (p_format is null or e.format=p_format) and (p_category is null or e.category=p_category)
      and (p_country is null or e.country=p_country) and (p_department is null or e.department=p_department)
      and (p_from is null or e.ends_at>=p_from) and (p_until is null or e.starts_at<p_until)
      and (p_after_at is null or (e.starts_at,e.id)>(p_after_at,p_after_id))
    order by e.starts_at,e.id limit (least(greatest(p_limit,1),20)+1)
  ) q
$$;

create function public.event_for_client(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select feed_data.f25_event_json(e,true) from feed_data.events e
    where e.id=p_id and feed_data.f25_event_visible(e)
$$;


create function public.save_event_for_client(p_id uuid,p_expected int,p_request uuid,p_organization uuid,
  p_community uuid,p_event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old feed_data.events; item feed_data.events;
  fingerprint bytea:=extensions.digest(jsonb_build_array(p_organization,p_community,p_event)::text,'sha256');
begin
  if not feed_data.member_allowed() then raise exception 'event unavailable' using errcode='PFR04'; end if;
  select * into item from jsonb_populate_record(null::feed_data.events,p_event);
  if not exists(select 1 from pg_timezone_names where name=item.time_zone)
    or greatest(length(item.meeting_url),length(item.cover_url))>1000
    or strpos(concat(item.meeting_url,item.cover_url),chr(92))>0 then
    raise exception 'invalid event time zone or link' using errcode='22023';
  end if;
  if p_id is null then
    if p_request is null then raise exception 'missing request' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('event:'||actor::text,0));
    select e.* into old from feed_data.events e where e.creator_id=actor and e.request_id=p_request;
    if old.id is not null then
      if old.request_hash<>fingerprint or not feed_data.f25_event_manage(old) then
        raise exception 'request conflict' using errcode='PFR09';
      end if;
      return feed_data.f25_event_json(old,true);
    end if;
  else
    select e.* into old from feed_data.events e where e.id=p_id for update;
    if old.id is null or not feed_data.f25_event_manage(old) then raise exception 'event unavailable' using errcode='PFR04'; end if;
    if old.version is distinct from p_expected or old.status not in ('draft','published') or old.moderated_at is not null
      or (old.status='published' and (old.ends_at<=now() or old.visibility<>item.visibility or old.community_id is distinct from p_community)) then
      raise exception 'event changed or is closed' using errcode='PFR09';
    end if;
    p_organization:=old.organization_id;
  end if;
  if not feed_data.f25_policy('events.enabled') or (p_id is null and not feed_data.f25_policy(
    case when p_organization is null then 'events.individual' else 'events.organization' end
  )) then raise exception 'feature disabled' using errcode='PEV03'; end if;
  if p_organization is not null and not feed_data.f23_can_publish(p_organization) then
    raise exception 'organization unavailable' using errcode='PFR04';
  end if;
  if p_community is not null and not feed_data.community_member(p_community,actor) then
    raise exception 'community unavailable' using errcode='PFR04';
  end if;
  if item.project_id is not null and not exists(select 1 from private.community_projects p where p.id=item.project_id
    and private.project_visible(p) and private.project_owner_access(p,actor,'operate')) then
    raise exception 'project unavailable' using errcode='PFR04';
  end if;
  perform feed_data.consume_limit(actor,'event_write',12);
  if p_id is null then
    insert into feed_data.events(creator_id,organization_id,community_id,project_id,request_id,request_hash,title,
      description,category,format,visibility,starts_at,ends_at,time_zone,country,department,locality,venue,
      meeting_url,cover_url,language,capacity)
    values(actor,p_organization,p_community,item.project_id,p_request,fingerprint,item.title,item.description,item.category,
      item.format,item.visibility,item.starts_at,item.ends_at,item.time_zone,item.country,item.department,item.locality,item.venue,
      item.meeting_url,item.cover_url,item.language,item.capacity) returning * into item;
  else
    if item.capacity < (select count(*) from feed_data.event_rsvps r where r.event_id=p_id and r.response='going') then
      raise exception 'capacity reached' using errcode='PEV09';
    end if;
    update feed_data.events set community_id=p_community,project_id=item.project_id,title=item.title,description=item.description,
      category=item.category,format=item.format,visibility=item.visibility,starts_at=item.starts_at,ends_at=item.ends_at,
      time_zone=item.time_zone,country=item.country,department=item.department,locality=item.locality,venue=item.venue,
      meeting_url=item.meeting_url,cover_url=item.cover_url,language=item.language,capacity=item.capacity,
      version=old.version+1,updated_at=clock_timestamp() where id=p_id returning * into item;
  end if;
  insert into feed_data.event_audit(event_id,actor_id,action,version)
    values(item.id,actor,case when p_id is null then 'created' else 'edited' end,item.version);
  return feed_data.f25_event_json(item,true);
end;
$$;

create function public.transition_event_for_client(p_id uuid,p_expected int,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e feed_data.events; actor uuid:=auth.uid();
begin
  select * into e from feed_data.events where id=p_id for update;
  if e.id is null or not feed_data.f25_event_manage(e) then raise exception 'event unavailable' using errcode='PFR04'; end if;
  if e.status=p_status and e.version=p_expected+1 then return feed_data.f25_event_json(e,true); end if;
  if e.version is distinct from p_expected or not coalesce(case p_status
    when 'published' then e.status='draft' and e.ends_at>now() and feed_data.f25_event_scope(e)
      and feed_data.f25_policy(case when e.organization_id is null then 'events.individual' else 'events.organization' end)
    when 'canceled' then e.status in ('draft','published')
    when 'completed' then e.status='published' and e.ends_at<=now()
    else false end,false) then raise exception 'invalid event transition' using errcode='PFR09'; end if;
  perform feed_data.consume_limit(actor,'event_write',12);
  update feed_data.events set status=p_status,version=e.version+1,updated_at=clock_timestamp() where id=p_id returning * into e;
  insert into feed_data.event_audit(event_id,actor_id,action,version) values(p_id,actor,p_status,e.version);
  return feed_data.f25_event_json(e,true);
end;
$$;

create function public.event_capabilities_for_client() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',feed_data.f25_policy('events.enabled'),
    'discovery',feed_data.f25_policy('events.discovery'),
    'individual',feed_data.f25_policy('events.individual') and exists (
      select 1 from public.profiles p where p.user_id=auth.uid() and feed_data.f24_identity(p,auth.uid()) and feed_data.f24_details(p.user_id,auth.uid())),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name)
      from private.organization_memberships m join private.organizations o on o.id=m.organization_id
      where m.user_id=auth.uid() and feed_data.f25_policy('events.organization') and feed_data.f23_can_publish(o.id)),'[]'::jsonb),
    'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',coalesce(d.name,c.name,c.slug)) order by coalesce(d.name,c.name,c.slug))
      from feed_data.communities c left join public.departments d on d.code=c.department_code where feed_data.community_member(c.id,auth.uid())),'[]'::jsonb))
  where feed_data.member_allowed()
$$;


create function public.rsvp_event_for_client(p_id uuid,p_response text,p_list_me boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e feed_data.events; prior feed_data.event_rsvps; actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'event unavailable' using errcode='PFR04'; end if;
  select * into e from feed_data.events where id=p_id for update;
  if e.id is null then raise exception 'event unavailable' using errcode='PFR04'; end if;
  select * into prior from feed_data.event_rsvps where event_id=p_id and user_id=actor;
  if p_response is null then
    delete from feed_data.event_rsvps where event_id=p_id and user_id=actor;
    return case when feed_data.f25_event_visible(e) then feed_data.f25_event_json(e,true) else null end;
  end if;
  if e.status<>'published' or e.ends_at<=now() or not feed_data.f25_event_scope(e)
    or not feed_data.f25_policy('events.rsvp') then raise exception 'RSVP unavailable' using errcode='PEV03'; end if;
  if p_response not in ('going','interested','not_going') or p_list_me is null then
    raise exception 'invalid response' using errcode='22023';
  end if;
  p_list_me:=p_list_me and p_response in ('going','interested');
  if prior.response=p_response and prior.list_me=p_list_me then return feed_data.f25_event_json(e,true); end if;
  if p_response='going' and prior.response is distinct from 'going' and e.capacity <= (
    select count(*) from feed_data.event_rsvps where event_id=p_id and response='going'
  ) then raise exception 'capacity reached' using errcode='PEV09'; end if;
  perform feed_data.consume_limit(actor,'event_rsvp',20);
  insert into feed_data.event_rsvps(event_id,user_id,response,list_me) values(p_id,actor,p_response,p_list_me)
    on conflict(event_id,user_id) do update set response=excluded.response,list_me=excluded.list_me,updated_at=clock_timestamp();
  return feed_data.f25_event_json(e,true);
end;
$$;

create function public.event_participants_for_client(p_id uuid,p_before_at timestamptz,p_before_id uuid,p_limit int)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc,q.id desc),'[]'::jsonb)
  from (
    select r.id,r.updated_at as "createdAt",p.username,p.display_name as name,r.response
    from feed_data.event_rsvps r join feed_data.events e on e.id=r.event_id join public.profiles p on p.user_id=r.user_id
    where e.id=p_id and feed_data.f25_event_manage(e) and r.list_me
      and feed_data.f24_identity(p,auth.uid()) and feed_data.f24_details(p.user_id,auth.uid())
      and (p_before_at is null or (r.updated_at,r.id)<(p_before_at,p_before_id))
    order by r.updated_at desc,r.id desc limit (least(greatest(p_limit,1),20)+1)
  ) q
$$;

create function public.event_updates_for_client(p_id uuid,p_before_at timestamptz,p_before_id uuid,p_limit int)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc,q.id desc),'[]'::jsonb)
  from (
    select u.id,u.created_at as "createdAt",u.body from feed_data.event_updates u join feed_data.events e on e.id=u.event_id
    where e.id=p_id and feed_data.f25_event_visible(e)
      and (p_before_at is null or (u.created_at,u.id)<(p_before_at,p_before_id))
    order by u.created_at desc,u.id desc limit (least(greatest(p_limit,1),20)+1)
  ) q
$$;

create function public.announce_event_for_client(p_id uuid,p_request uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e feed_data.events; u feed_data.event_updates;
begin
  select * into e from feed_data.events where id=p_id for update;
  if e.id is null or not feed_data.f25_event_manage(e) or e.status<>'published' or not feed_data.f25_event_scope(e) then
    raise exception 'event unavailable' using errcode='PFR04';
  end if;
  select * into u from feed_data.event_updates where id=p_request;
  if u.id is not null then
    if u.event_id<>p_id or u.body<>p_body or u.author_id is distinct from auth.uid() then
      raise exception 'request conflict' using errcode='PFR09';
    end if;
  else
    perform feed_data.consume_limit(auth.uid(),'event_write',4);
    insert into feed_data.event_updates(id,event_id,author_id,body) values(p_request,p_id,auth.uid(),p_body) returning * into u;
    insert into feed_data.event_audit(event_id,actor_id,action,version) values(p_id,auth.uid(),'announced',e.version);
  end if;
  return jsonb_build_object('id',u.id,'createdAt',u.created_at,'body',u.body);
end;
$$;

create function public.report_event_for_client(p_id uuid,p_category text,p_note text) returns boolean
language plpgsql security definer set search_path='' as $$
declare e feed_data.events;
begin
  select * into e from feed_data.events where id=p_id;
  if not feed_data.member_allowed() or e.id is null or not feed_data.f25_event_visible(e) or e.status='draft' then
    raise exception 'event unavailable' using errcode='PFR04';
  end if;
  perform feed_data.consume_limit(auth.uid(),'event_report',6);
  insert into feed_data.event_reports(event_id,actor_id,category,note) values(p_id,auth.uid(),p_category,p_note)
    on conflict(event_id,actor_id) do nothing;
  return true;
end;
$$;

revoke all on function feed_data.f25_policy(text),feed_data.f25_event_manage(feed_data.events),
  feed_data.f25_event_scope(feed_data.events),feed_data.f25_event_visible(feed_data.events),
  feed_data.f25_event_organizer(feed_data.events),feed_data.f25_event_public_share(feed_data.events),
  feed_data.f25_event_json(feed_data.events,boolean) from public,anon,authenticated,service_role;

revoke all on function public.events_for_client(text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,int),public.event_for_client(uuid),
  public.save_event_for_client(uuid,int,uuid,uuid,uuid,jsonb),public.transition_event_for_client(uuid,int,text),
  public.event_capabilities_for_client(),public.rsvp_event_for_client(uuid,text,boolean),
  public.event_participants_for_client(uuid,timestamptz,uuid,int),public.event_updates_for_client(uuid,timestamptz,uuid,int),
  public.announce_event_for_client(uuid,uuid,text),public.report_event_for_client(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.event_for_client(uuid),public.event_updates_for_client(uuid,timestamptz,uuid,int) to anon,authenticated;
grant execute on function public.events_for_client(text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,int),
  public.save_event_for_client(uuid,int,uuid,uuid,uuid,jsonb),public.transition_event_for_client(uuid,int,text),
  public.event_capabilities_for_client(),public.rsvp_event_for_client(uuid,text,boolean),
  public.event_participants_for_client(uuid,timestamptz,uuid,int),public.announce_event_for_client(uuid,uuid,text),
  public.report_event_for_client(uuid,text,text) to authenticated;
