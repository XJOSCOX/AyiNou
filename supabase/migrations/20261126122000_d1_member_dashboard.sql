-- D1: private member dashboard preferences and Founder-managed official notices.
create table private.d1_dashboard_settings (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 1 check (revision > 0),
  available text[] not null default array['events','projects','communities','opportunities','impact','statistics'],
  default_order text[] not null default array['events','projects','communities','opportunities','impact','statistics'],
  default_hidden text[] not null default array['opportunities','impact'],
  item_limit integer not null default 3 check (item_limit between 2 and 6),
  announcements_enabled boolean not null default true,
  statistics_enabled boolean not null default false,
  featured_policy text not null default 'latest' check (featured_policy = 'latest'),
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.d1_dashboard_settings(singleton) values (true);

create table private.d1_dashboard_preferences (
  actor uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  section_order text[] not null,
  hidden text[] not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table private.d1_dashboard_announcements (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('platform','feature','notice','initiative','maintenance')),
  title jsonb not null,
  body jsonb not null,
  published_at timestamptz not null,
  expires_at timestamptz not null,
  withdrawn_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  check (expires_at > published_at and expires_at <= published_at + interval '90 days')
);
create index d1_active_announcements on private.d1_dashboard_announcements(published_at desc,id desc)
  where withdrawn_at is null;

create table private.d1_dashboard_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  request_digest bytea not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor,request_id)
);
create table private.d1_dashboard_audit (
  id bigint generated always as identity primary key,
  actor uuid not null references auth.users(id) on delete restrict,
  workspace uuid not null,
  action text not null,
  target uuid,
  reason text not null,
  request_id uuid not null unique,
  before_value jsonb,
  after_value jsonb,
  recorded_at timestamptz not null default clock_timestamp()
);
create index d1_audit_recent on private.d1_dashboard_audit(recorded_at desc,id desc);

alter table private.d1_dashboard_settings enable row level security;
alter table private.d1_dashboard_preferences enable row level security;
alter table private.d1_dashboard_announcements enable row level security;
alter table private.d1_dashboard_receipts enable row level security;
alter table private.d1_dashboard_audit enable row level security;
revoke all on private.d1_dashboard_settings,private.d1_dashboard_preferences,
  private.d1_dashboard_announcements,private.d1_dashboard_receipts,private.d1_dashboard_audit
  from public,anon,authenticated,service_role;

create function public.d1_dashboard_for_api(
  p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,p_action text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  keys constant text[] := array['events','projects','communities','opportunities','impact','statistics'];
  settings private.d1_dashboard_settings;
  prefs private.d1_dashboard_preferences;
  existing private.d1_dashboard_receipts;
  notice private.d1_dashboard_announcements;
  before_value jsonb;
  result jsonb;
  submitted_id uuid;
  digest bytea;
  expected integer;
  reason text;
  proposed_order text[];
  proposed_hidden text[];
  proposed_available text[];
  proposed_limit integer;
  proposed_announcements boolean;
  proposed_statistics boolean;
  notice_id uuid;
  locale text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or
    not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false) or
    not coalesce(private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false)
    then raise exception 'member dashboard unavailable' using errcode='42501'; end if;

  select * into settings from private.d1_dashboard_settings where singleton;
  if not found then raise exception 'dashboard configuration missing' using errcode='55000'; end if;
  if p_action = 'read' then
    if p_input <> '{}'::jsonb then raise exception 'invalid read' using errcode='23514'; end if;
    select * into prefs from private.d1_dashboard_preferences where actor=p_actor;
    return jsonb_build_object(
      'settings',jsonb_build_object('revision',settings.revision,'available',settings.available,
        'defaultOrder',settings.default_order,'defaultHidden',settings.default_hidden,
        'itemLimit',settings.item_limit,'announcementsEnabled',settings.announcements_enabled,
        'statisticsEnabled',settings.statistics_enabled),
      'preferences',case when prefs.actor is null then null else jsonb_build_object('version',prefs.version,
        'order',prefs.section_order,'hidden',prefs.hidden) end,
      'counts',jsonb_build_object(
        'followers',(select count(*) from feed_data.member_follows where target_id=p_actor),
        'following',(select count(*) from feed_data.member_follows where follower_id=p_actor)
          + (select count(*) from feed_data.institution_follows where follower_id=p_actor),
        'communities',(select count(*) from feed_data.community_memberships m join feed_data.communities c on c.id=m.community_id
          where m.user_id=p_actor and c.kind='department'),
        'groups',(select count(*) from feed_data.community_memberships m join feed_data.communities c on c.id=m.community_id
          where m.user_id=p_actor and c.kind <> 'department'),
        'savedPosts',(select count(*) from feed_data.bookmarks b join feed_data.posts post on post.id=b.post_id
          where b.actor_id=p_actor and post.status='published' and post.deleted_at is null)),
      'joined',(select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'name',coalesce(c.name,d.name),
        'kind',c.kind) order by m.joined_at desc,c.id),'[]'::jsonb) from
        (select community_id,joined_at from feed_data.community_memberships where user_id=p_actor
          order by joined_at desc,community_id limit 6) m
        join feed_data.communities c on c.id=m.community_id
        left join public.departments d on d.code=c.department_code),
      'announcements',case when settings.announcements_enabled then
        (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'category',a.category,'title',a.title,
          'body',a.body,'publishedAt',a.published_at,'expiresAt',a.expires_at)
          order by a.published_at desc,a.id desc),'[]'::jsonb)
         from (select * from private.d1_dashboard_announcements where withdrawn_at is null
           and published_at <= clock_timestamp() and expires_at > clock_timestamp()
           order by published_at desc,id desc limit 5) a)
        else '[]'::jsonb end);
  end if;

  if p_action='settings_read' then
    if p_input <> '{}'::jsonb or p_workspace is null or not coalesce(private.platform_founder(p_actor)
      and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    return jsonb_build_object('revision',settings.revision,'available',settings.available,
      'defaultOrder',settings.default_order,'defaultHidden',settings.default_hidden,
      'itemLimit',settings.item_limit,'announcementsEnabled',settings.announcements_enabled,
      'statisticsEnabled',settings.statistics_enabled,'featuredPolicy',settings.featured_policy,
      'announcements',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'category',a.category,
        'title',a.title,'body',a.body,'publishedAt',a.published_at,'expiresAt',a.expires_at,
        'withdrawnAt',a.withdrawn_at,'version',a.version) order by a.published_at desc),'[]'::jsonb)
        from (select * from private.d1_dashboard_announcements order by published_at desc limit 20) a));
  end if;

  if p_action not in ('preferences','configure','publish','withdraw') then
    raise exception 'invalid dashboard action' using errcode='23514'; end if;
  submitted_id := nullif(p_input->>'requestId','')::uuid;
  expected := nullif(p_input->>'expectedVersion','')::integer;
  if submitted_id is null or expected is null or expected < 0 then
    raise exception 'invalid dashboard revision' using errcode='23514'; end if;
  perform private.s2b_lock_actor(p_actor,p_session);
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false) then
    raise exception 'session changed' using errcode='42501'; end if;
  digest := extensions.digest(convert_to(p_action || ':' || p_input::text,'UTF8'),'sha256');
  select * into existing from private.d1_dashboard_receipts where actor=p_actor and request_id=submitted_id;
  if found then
    if existing.request_digest <> digest or existing.action <> p_action then
      raise exception 'request conflict' using errcode='23505'; end if;
    return existing.result;
  end if;

  if p_action='preferences' then
    select * into prefs from private.d1_dashboard_preferences where actor=p_actor for update;
    if coalesce(prefs.version,0) <> expected then raise exception 'stale preferences' using errcode='40001'; end if;
    select array_agg(value order by ord) into proposed_order from jsonb_array_elements_text(p_input->'order') with ordinality e(value,ord);
    select coalesce(array_agg(value order by ord),array[]::text[]) into proposed_hidden
      from jsonb_array_elements_text(p_input->'hidden') with ordinality e(value,ord);
    if proposed_order is null or cardinality(proposed_order) <> cardinality(keys) or
      not proposed_order <@ keys or (select count(distinct x) from unnest(proposed_order) x) <> cardinality(keys) or
      not proposed_hidden <@ keys or (select count(distinct x) from unnest(proposed_hidden) x) <> cardinality(proposed_hidden)
      then raise exception 'invalid dashboard layout' using errcode='23514'; end if;
    insert into private.d1_dashboard_preferences(actor,version,section_order,hidden)
      values(p_actor,expected+1,proposed_order,proposed_hidden)
      on conflict(actor) do update set version=excluded.version,section_order=excluded.section_order,
        hidden=excluded.hidden,updated_at=clock_timestamp();
    result := jsonb_build_object('version',expected+1,'order',proposed_order,'hidden',proposed_hidden);
  else
    reason := btrim(p_input->>'reason');
    if not coalesce(length(reason) between 10 and 500 and reason !~ '[[:cntrl:]]',false) or
      p_workspace is null or not coalesce(private.platform_founder(p_actor)
        and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    if p_action='configure' then
      select * into settings from private.d1_dashboard_settings where singleton for update;
      if settings.revision <> expected then raise exception 'stale dashboard settings' using errcode='40001'; end if;
      before_value := to_jsonb(settings);
      select array_agg(value order by ord) into proposed_order from jsonb_array_elements_text(p_input->'defaultOrder') with ordinality e(value,ord);
      select coalesce(array_agg(value order by ord),array[]::text[]) into proposed_hidden
        from jsonb_array_elements_text(p_input->'defaultHidden') with ordinality e(value,ord);
      select array_agg(value order by ord) into proposed_available from jsonb_array_elements_text(p_input->'available') with ordinality e(value,ord);
      proposed_limit := (p_input->>'itemLimit')::integer;
      proposed_announcements := (p_input->>'announcementsEnabled')::boolean;
      proposed_statistics := (p_input->>'statisticsEnabled')::boolean;
      if proposed_order is null or cardinality(proposed_order) <> cardinality(keys) or
        not proposed_order <@ keys or (select count(distinct x) from unnest(proposed_order) x) <> cardinality(keys) or
        proposed_available is null or not proposed_available <@ keys or
        (select count(distinct x) from unnest(proposed_available) x) <> cardinality(proposed_available) or
        not proposed_hidden <@ proposed_available or proposed_limit not between 2 and 6 or
        proposed_announcements is null or proposed_statistics is null or
        p_input->>'featuredPolicy' <> 'latest'
        then raise exception 'invalid dashboard settings' using errcode='23514'; end if;
      update private.d1_dashboard_settings set revision=revision+1,available=proposed_available,
        default_order=proposed_order,default_hidden=proposed_hidden,item_limit=proposed_limit,
        announcements_enabled=proposed_announcements,statistics_enabled=proposed_statistics,
        updated_at=clock_timestamp() where singleton returning * into settings;
      result := jsonb_build_object('revision',settings.revision,'available',settings.available,
        'defaultOrder',settings.default_order,'defaultHidden',settings.default_hidden,
        'itemLimit',settings.item_limit,'announcementsEnabled',settings.announcements_enabled,
        'statisticsEnabled',settings.statistics_enabled,'featuredPolicy',settings.featured_policy);
    elsif p_action='publish' then
      if expected <> 0 then raise exception 'invalid announcement version' using errcode='23514'; end if;
      for locale in select unnest(array['en','ht','fr','es']) loop
        if not coalesce(length(btrim(p_input->'title'->>locale)) between 3 and 120
          and length(btrim(p_input->'body'->>locale)) between 10 and 2000
          and (p_input->'title'->>locale) !~ '[[:cntrl:]]'
          and (p_input->'body'->>locale) !~ '[[:cntrl:]]',false)
          then raise exception 'missing announcement translation' using errcode='23514'; end if;
      end loop;
      insert into private.d1_dashboard_announcements(category,title,body,published_at,expires_at,created_by)
        values(p_input->>'category',p_input->'title',p_input->'body',
          (p_input->>'publishedAt')::timestamptz,(p_input->>'expiresAt')::timestamptz,p_actor)
        returning * into notice;
      notice_id := notice.id;
      result := jsonb_build_object('id',notice.id,'version',notice.version);
    else
      notice_id := (p_input->>'id')::uuid;
      select * into notice from private.d1_dashboard_announcements where id=notice_id for update;
      if not found or notice.version <> expected or notice.withdrawn_at is not null then
        raise exception 'stale announcement' using errcode='40001'; end if;
      before_value := to_jsonb(notice);
      update private.d1_dashboard_announcements set withdrawn_at=clock_timestamp(),version=version+1
        where id=notice_id returning * into notice;
      result := jsonb_build_object('id',notice.id,'version',notice.version,'withdrawnAt',notice.withdrawn_at);
    end if;
    insert into private.d1_dashboard_audit(actor,workspace,action,target,reason,request_id,before_value,after_value)
      values(p_actor,p_workspace,p_action,notice_id,reason,submitted_id,before_value,result);
  end if;
  insert into private.d1_dashboard_receipts(actor,request_id,action,request_digest,result)
    values(p_actor,submitted_id,p_action,digest,result);
  return result;
end;
$$;
revoke all on function public.d1_dashboard_for_api(uuid,uuid,boolean,bigint,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.d1_dashboard_for_api(uuid,uuid,boolean,bigint,uuid,text,jsonb) to service_role;
