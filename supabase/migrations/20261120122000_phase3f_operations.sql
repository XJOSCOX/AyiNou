create table feed_data.read_limits (
  subject text not null check(subject ~ '^(member:[0-9a-f-]{36}|guest:[0-9]{1,4})$'),
  category text not null check(category in ('feed','media','discovery','profile','notifications')),
  window_started timestamptz not null,
  total integer not null check(total between 1 and 240),
  primary key(subject,category)
);
create index read_limits_expiry on feed_data.read_limits(window_started);
create index write_limits_expiry on feed_data.write_limits(window_started);
alter table feed_data.read_limits enable row level security;
revoke all on feed_data.read_limits from public,anon,authenticated,service_role;

create function public.consume_safety_read_for_api(p_actor uuid,p_bucket integer,p_category text)
returns boolean language plpgsql security definer set search_path='' as $$
declare slot timestamptz:=date_trunc('minute',clock_timestamp()); ceiling integer; subject_key text;
begin
  if ((p_actor is null)=(p_bucket is null)) or (p_bucket is not null and p_bucket not between 0 and 4095)
  then raise exception 'invalid rate key' using errcode='22023'; end if;
  ceiling:=case p_category
    when 'feed' then case when p_actor is null then 90 else 120 end
    when 'media' then case when p_actor is null then 120 else 240 end
    when 'discovery' then case when p_actor is null then 30 else 60 end
    when 'profile' then case when p_actor is null then 60 else 120 end
    when 'notifications' then 90 end;
  if ceiling is null then raise exception 'invalid rate category' using errcode='22023'; end if;
  subject_key:=coalesce('member:'||p_actor::text,'guest:'||p_bucket::text);
  insert into feed_data.read_limits(subject,category,window_started,total) values(subject_key,p_category,slot,1)
  on conflict(subject,category) do update set window_started=excluded.window_started,
    total=case when read_limits.window_started=slot then read_limits.total+1 else 1 end
  where read_limits.window_started<slot or (read_limits.window_started=slot and read_limits.total<ceiling);
  return found;
end;
$$;

alter table feed_data.post_attachments
  add column retention_post_id uuid references feed_data.posts(id) on delete set null;
create index attachments_retention_post on feed_data.post_attachments(retention_post_id) where retention_post_id is not null;
create function feed_data.remember_media_evidence()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.state='discarded' and old.post_id is not null then
    new.retention_post_id:=old.post_id;
    new.expires_at:=clock_timestamp()+interval '24 hours';
  end if;
  return new;
end;
$$;
create trigger remember_media_evidence before update of state on feed_data.post_attachments
  for each row execute function feed_data.remember_media_evidence();

create function feed_data.media_cleanup_allowed(m feed_data.post_attachments)
returns boolean language sql stable set search_path='' as $$
  select ((m.state='discarded' or m.author_id is null or (m.state='attached' and m.post_id is null))
     or (m.state in ('uploading','ready') and m.expires_at<=now()))
    and (m.upload_until is null or m.upload_until<=now())
    and (m.retention_post_id is null or (
      m.expires_at<=now()
      and not exists(select 1 from feed_data.content_reports r where r.post_id=m.retention_post_id and r.status='pending')
      and not exists(select 1 from feed_data.comment_reports r join feed_data.comments c on c.id=r.comment_id
        where c.post_id=m.retention_post_id and r.status='pending')
      and not exists(select 1 from feed_data.moderation_appeals s join feed_data.appealable_actions a
        on (a.kind='post' and a.id=s.post_action_id or a.kind='comment' and a.id=s.comment_action_id)
        where s.outcome='pending' and a.post_id=m.retention_post_id)));
$$;

create or replace function public.claim_post_media_cleanup_for_api()
returns uuid[] language sql security definer set search_path='' as $$
  with picked as (
    select m.id from feed_data.post_attachments m where feed_data.media_cleanup_allowed(m)
    order by m.expires_at,m.id limit 16 for update skip locked
  ), marked as (
    update feed_data.post_attachments set post_id=null,position=null,state='discarded',lease=null,
      upload_until=clock_timestamp()+interval '2 minutes' where id in(select id from picked) returning id
  ) select coalesce(array_agg(id),'{}') from marked;
$$;

create function public.safety_cleanup_for_api(p_category text,p_apply boolean,p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare touched integer;
begin
  if p_category is null or p_category not in ('read_limits','write_limits','snapshots','notifications','post_media')
    or p_apply is null or p_limit is null or p_limit not between 1 and 1000 or (p_category='post_media' and p_apply)
  then raise exception 'invalid maintenance request' using errcode='22023'; end if;
  if p_category='post_media' then
    return (select count(*) from (select 1 from feed_data.post_attachments m where feed_data.media_cleanup_allowed(m) limit p_limit) q);
  elsif p_category='read_limits' then
    if not p_apply then return (select count(*) from (select 1 from feed_data.read_limits where window_started<now()-interval '1 day' limit p_limit) q); end if;
    delete from feed_data.read_limits where (subject,category) in (
      select subject,category from feed_data.read_limits where window_started<now()-interval '1 day'
      order by window_started,subject,category limit p_limit for update skip locked);
  elsif p_category='write_limits' then
    if not p_apply then return (select count(*) from (select 1 from feed_data.write_limits where window_started<now()-interval '1 day' limit p_limit) q); end if;
    delete from feed_data.write_limits where (actor_id,action) in (
      select actor_id,action from feed_data.write_limits where window_started<now()-interval '1 day'
      order by window_started,actor_id,action limit p_limit for update skip locked);
  elsif p_category='snapshots' then
    if not p_apply then return (select count(*) from (select 1 from feed_data.recommendation_snapshots where expires_at<=now() limit p_limit) q); end if;
    delete from feed_data.recommendation_snapshots where id in (
      select id from feed_data.recommendation_snapshots where expires_at<=now() order by expires_at,id limit p_limit for update skip locked);
  else
    if not p_apply then return (select count(*) from (select 1 from feed_data.notifications where created_at<now()-interval '30 days' limit p_limit) q); end if;
    delete from feed_data.notifications where id in (
      select id from feed_data.notifications where created_at<now()-interval '30 days' order by created_at,id limit p_limit for update skip locked);
  end if;
  get diagnostics touched=row_count;
  return touched;
end;
$$;

create function public.safety_overview_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'pendingPostReports',(select count(*) from feed_data.content_reports where status='pending'),
    'pendingCommentReports',(select count(*) from feed_data.comment_reports where status='pending'),
    'pendingAppeals',(select count(*) from feed_data.moderation_appeals where outcome='pending'),
    'restrictedAccounts',(select count(*) from private.account_restrictions where status in ('suspended','banned')),
    'moderationActions30Days',(select count(*) from feed_data.post_moderation_actions where created_at>=now()-interval '30 days')
      +(select count(*) from feed_data.comment_moderation_actions where created_at>=now()-interval '30 days'),
    'cleanupBacklog',(select count(*) from feed_data.post_attachments m where feed_data.media_cleanup_allowed(m)));
end;
$$;

revoke all on function feed_data.remember_media_evidence(),feed_data.media_cleanup_allowed(feed_data.post_attachments),
  public.consume_safety_read_for_api(uuid,integer,text),public.safety_cleanup_for_api(text,boolean,integer),
  public.safety_overview_for_api(uuid) from public,anon,authenticated,service_role;
grant execute on function public.consume_safety_read_for_api(uuid,integer,text),public.safety_cleanup_for_api(text,boolean,integer),
  public.safety_overview_for_api(uuid) to service_role;
