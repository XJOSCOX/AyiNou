-- Non-exposed schema. Read RPCs use the caller's RLS policies.
create schema feed_data;
revoke all on schema feed_data from public,anon,authenticated,service_role;
grant usage on schema feed_data to anon,authenticated;

create table feed_data.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'
    and translate(body,E'\t\r\n','') !~ '[[:cntrl:]]'),
  language text not null check (language in ('ht','fr','en','es')),
  visibility text not null check (visibility in ('public','members_only','private')),
  status text not null check (status in ('draft','published','hidden','removed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1 check (version>=1),
  check ((visibility='private')=(status='draft'))
);
create index posts_published_page on feed_data.posts(created_at desc,id desc) where status='published' and deleted_at is null;
create index posts_public_page on feed_data.posts(created_at desc,id desc) where visibility='public' and status='published' and deleted_at is null;
create index posts_author_page on feed_data.posts(author_id,created_at desc,id desc);
create index posts_hidden_page on feed_data.posts(updated_at desc,id desc) where status='hidden' and deleted_at is null;

create table feed_data.post_submissions (
  author_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  request_digest bytea not null check (octet_length(request_digest)=32),
  primary key(author_id,submission_id),
  unique(post_id)
);

create table feed_data.content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('harassment','hate','spam','privacy','other')),
  note text check (char_length(note) between 1 and 500 and translate(note,E'\t\r\n','') !~ '[[:cntrl:]]'),
  status text not null default 'pending' check (status in ('pending','closed')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  check ((status='closed')=(closed_at is not null)),
  unique(post_id,reporter_id)
);
create index content_reports_open on feed_data.content_reports(created_at desc,id desc) where status='pending';
create index content_reports_reporter on feed_data.content_reports(reporter_id,created_at desc);

create table feed_data.post_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_data.posts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('hide','restore','remove','dismiss')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp()
);
create index post_moderation_history on feed_data.post_moderation_actions(post_id,created_at desc,id desc);

create table feed_data.write_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('create','edit','report')),
  window_started timestamptz not null,
  total integer not null check (total>0),
  primary key(actor_id,action)
);

alter table feed_data.posts enable row level security;
alter table feed_data.post_submissions enable row level security;
alter table feed_data.content_reports enable row level security;
alter table feed_data.post_moderation_actions enable row level security;
alter table feed_data.write_limits enable row level security;
revoke all on all tables in schema feed_data from public,anon,authenticated,service_role;
grant select on feed_data.posts to anon,authenticated;

create function feed_data.author_active(p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.institution_actor(p_author);
$$;
create function feed_data.member_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.member_session_allowed();
$$;
create function feed_data.author_projection(p_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName',p.display_name,'username',p.username,
    'avatarPath',case when p.avatar_asset is not null then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'verified',exists(select 1 from public.verification_records v where v.user_id=p.user_id
      and v.status='verified' and v.verification_type in ('identity','notable_person'))
  ) from public.profiles p
  where p.user_id=p_author and p.is_visible and p.display_name is not null
    and private.member_discoverable(p.user_id) and private.institution_actor(p_user=>p_author);
$$;
revoke all on function feed_data.author_active(uuid),feed_data.member_allowed(),feed_data.author_projection(uuid)
  from public,anon,authenticated,service_role;
grant execute on function feed_data.author_active(uuid),feed_data.member_allowed(),feed_data.author_projection(uuid)
  to anon,authenticated;

create policy feed_public on feed_data.posts for select to anon
  using (deleted_at is null and status='published' and visibility='public' and feed_data.author_active(author_id));
create policy feed_members on feed_data.posts for select to authenticated using (
  (select feed_data.member_allowed()) and deleted_at is null and
  ((author_id=(select auth.uid()) and status in ('draft','published','hidden'))
   or (status='published' and visibility in ('public','members_only') and feed_data.author_active(author_id)))
);

create function public.read_feed_for_client(p_scope text,p_limit integer,p_before_at timestamptz,p_before_id uuid,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('feed','mine') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='mine' and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;

create function feed_data.consume_limit(p_actor uuid,p_action text,p_limit integer)
returns void language plpgsql set search_path = '' as $$
declare
  slot timestamptz:=date_trunc('minute',clock_timestamp());
  affected integer;
begin
  insert into feed_data.write_limits(actor_id,action,window_started,total)
  values(p_actor,p_action,slot,1)
  on conflict(actor_id,action) do update set
    window_started=excluded.window_started,
    total=case when write_limits.window_started=excluded.window_started then write_limits.total+1 else 1 end
  where write_limits.window_started<excluded.window_started
    or (write_limits.window_started=excluded.window_started and write_limits.total<p_limit)
  returning total into affected;
  if affected is null then raise exception 'request limit' using errcode='PFR29'; end if;
end;
$$;

create function public.create_post_for_client(p_body text,p_language text,p_visibility text,p_submission uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  result uuid;
  request_hash bytea;
  prior_hash bytea;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_submission is null or p_body is null or p_language is null or p_visibility is null
  then raise exception 'missing post fields' using errcode='22023'; end if;
  request_hash:=extensions.digest(jsonb_build_array(p_body,p_language,p_visibility)::text,'sha256');
  -- Serialize retries before charging the quota or creating any post.
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  select post_id,request_digest into result,prior_hash from feed_data.post_submissions
    where author_id=actor and submission_id=p_submission;
  if found then
    if request_hash<>prior_hash then raise exception 'submission reused' using errcode='PFR09'; end if;
    return result;
  end if;
  perform feed_data.consume_limit(actor,'create',8);
  insert into feed_data.posts(author_id,body,language,visibility,status)
  values(actor,p_body,p_language,p_visibility,case when p_visibility='private' then 'draft' else 'published' end)
  returning id into result;
  insert into feed_data.post_submissions(author_id,submission_id,post_id,request_digest) values(actor,p_submission,result,request_hash);
  return result;
end;
$$;

create function public.mutate_post_for_client(p_id uuid,p_version integer,p_delete boolean,p_body text,p_language text,p_visibility text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  post feed_data.posts;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into post from feed_data.posts where id=p_id and author_id=actor for update;
  if not found or post.status='removed' then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if p_delete and post.deleted_at is not null then return; end if;
  if post.deleted_at is not null then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if post.status='hidden' then raise exception 'post is moderated' using errcode='42501'; end if;
  if post.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_delete then
    update feed_data.posts set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_id;
  else
    if p_body is null or p_language is null or p_visibility is null then raise exception 'missing post fields' using errcode='22023'; end if;
    perform feed_data.consume_limit(actor,'edit',20);
    update feed_data.posts set body=p_body,language=p_language,visibility=p_visibility,
      status=case when p_visibility='private' then 'draft' else 'published' end,
      updated_at=clock_timestamp(),edited_at=clock_timestamp(),version=version+1 where id=p_id;
  end if;
end;
$$;

create function public.report_post_for_client(p_id uuid,p_category text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select author_id into target from feed_data.posts
    where id=p_id and status='published' and visibility in ('public','members_only')
      and deleted_at is null and feed_data.author_active(author_id) for share;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if target=actor then raise exception 'own post' using errcode='42501'; end if;
  perform feed_data.consume_limit(actor,'report',5);
  insert into feed_data.content_reports(post_id,reporter_id,category,note) values(p_id,actor,p_category,nullif(btrim(p_note),''));
end;
$$;

create function feed_data.moderation_role()
returns boolean language sql stable security definer set search_path = '' as $$
  select feed_data.member_allowed() and exists(select 1 from public.role_assignments
    where user_id=auth.uid() and role in ('administrator','moderator'));
$$;

create function feed_data.mod_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select feed_data.moderation_role() and auth.jwt()->>'aal'='aal2'
    and public.account_session_for_api(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,true,true)
    and exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
    ) m where m->>'method' in ('totp','mfa/totp')
      and case when jsonb_typeof(m->'timestamp')='number'
        then (m->>'timestamp')::numeric between extract(epoch from now())-900 and extract(epoch from now())+30
        else false end);
$$;

create function public.feed_moderation_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select feed_data.moderation_role();
$$;

create function public.list_feed_reports_for_client(p_scope text,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('reports','hidden') or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'postId',p.id,'body',p.body,'language',p.language,'status',p.status,'deleted',p.deleted_at is not null,
    'own',p.author_id=auth.uid(),'version',p.version,'category',q.category,'note',q.note,'createdAt',q.date,
    'lastAction',(select jsonb_build_object('action',a.action,'reason',a.reason,'createdAt',a.created_at)
      from feed_data.post_moderation_actions a where a.post_id=p.id order by a.created_at desc,a.id desc limit 1)
  ) order by q.date desc,q.id desc) from (
      select r.id,r.post_id,r.category,r.note,r.created_at as date from feed_data.content_reports r
        where p_scope='reports' and r.status='pending' and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
      union all
      select x.id,x.id,null,null,x.updated_at from feed_data.posts x where p_scope='hidden' and x.status='hidden' and x.deleted_at is null
        and (p_before_at is null or (x.updated_at,x.id)<(p_before_at,p_before_id))
      order by date desc,id desc limit 26
    ) q join feed_data.posts p on p.id=q.post_id),'[]'::jsonb);
end;
$$;

create function public.moderate_post_for_client(p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p feed_data.posts;
begin
  if not coalesce(feed_data.mod_allowed(),false) then raise exception 'moderator required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('hide','restore','remove','dismiss') or p_reason is null
  then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into p from feed_data.posts where id=p_id and status<>'draft' for update;
  if not found then raise exception 'post unavailable' using errcode='PFR04'; end if;
  if p.author_id=auth.uid() then raise exception 'own post' using errcode='42501'; end if;
  if p.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_action='dismiss' then
    if not exists(select 1 from feed_data.content_reports where post_id=p_id and status='pending')
    then raise exception 'no pending report' using errcode='PFR09'; end if;
  else
    if p.deleted_at is not null or (p_action='hide' and p.status<>'published') or (p_action='restore' and p.status<>'hidden')
      or (p_action='remove' and p.status not in ('published','hidden'))
    then raise exception 'action unavailable' using errcode='PFR09'; end if;
  end if;
  update feed_data.posts set status=case p_action when 'hide' then 'hidden' when 'restore' then 'published'
    when 'remove' then 'removed' else status end,updated_at=clock_timestamp(),version=version+1 where id=p_id;
  update feed_data.content_reports set status='closed',closed_at=clock_timestamp() where post_id=p_id and status='pending';
  insert into feed_data.post_moderation_actions(post_id,actor_id,action,reason)
  values(p_id,auth.uid(),p_action,btrim(p_reason));
end;
$$;

revoke all on function feed_data.consume_limit(uuid,text,integer),feed_data.moderation_role(),feed_data.mod_allowed()
  from public,anon,authenticated,service_role;
revoke all on function public.read_feed_for_client(text,integer,timestamptz,uuid,uuid),
  public.create_post_for_client(text,text,text,uuid),public.mutate_post_for_client(uuid,integer,boolean,text,text,text),
  public.report_post_for_client(uuid,text,text),public.feed_moderation_access(),
  public.list_feed_reports_for_client(text,timestamptz,uuid),public.moderate_post_for_client(uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_feed_for_client(text,integer,timestamptz,uuid,uuid) to anon,authenticated;
grant execute on function public.create_post_for_client(text,text,text,uuid),
  public.mutate_post_for_client(uuid,integer,boolean,text,text,text),public.report_post_for_client(uuid,text,text),
  public.feed_moderation_access(),public.list_feed_reports_for_client(text,timestamptz,uuid),
  public.moderate_post_for_client(uuid,integer,text,text) to authenticated;
