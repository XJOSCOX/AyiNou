insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('post-media','post-media',false,524288,array['image/webp']);
create policy post_media_client_boundary on storage.objects as restrictive for all to anon,authenticated
  using(bucket_id<>'post-media') with check(bucket_id<>'post-media');

create table feed_data.post_attachments (
  id uuid primary key,
  author_id uuid references auth.users(id) on delete set null,
  post_id uuid references feed_data.posts(id) on delete set null,
  position smallint check(position between 1 and 4),
  state text not null check(state in ('uploading','ready','attached','discarded')),
  width integer not null check(width between 1 and 1440),
  height integer not null check(height between 1 and 1440),
  thumbnail_bytes integer not null check(thumbnail_bytes between 1 and 131072),
  display_bytes integer not null check(display_bytes between 1 and 524288),
  digest bytea not null check(octet_length(digest)=32),
  alt text check(char_length(alt)<=240 and alt !~ '[[:cntrl:]]'),
  lease uuid,
  upload_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
  check ((state='attached' and position is not null) or (state<>'attached' and position is null and post_id is null)),
  unique(post_id,position) deferrable initially deferred
);
create index post_attachments_author on feed_data.post_attachments(author_id);
create index post_attachments_cleanup on feed_data.post_attachments(state,expires_at,id);
alter table feed_data.post_attachments enable row level security;
revoke all on feed_data.post_attachments from public,anon,authenticated,service_role;
alter table feed_data.post_submissions add column media_digest bytea check(octet_length(media_digest)=32);
alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload'));

create function public.post_upload_budget_for_client()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'media_upload',8);
end;
$$;

-- Object paths are derived from immutable attachment IDs, never chosen by a client.
create function public.reserve_post_upload_for_api(p_actor uuid,p_id uuid,p_lease uuid,p_digest text,
  p_width integer,p_height integer,p_thumb integer,p_display integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare entry feed_data.post_attachments;
begin
  if p_id is null or p_lease is null or not feed_data.author_active(p_actor)
  then raise exception 'access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('media:'||p_actor::text,0));
  select * into entry from feed_data.post_attachments where id=p_id for update;
  if found then
    if entry.author_id is distinct from p_actor then raise exception 'upload unavailable' using errcode='PMD04'; end if;
    if entry.digest is distinct from decode(p_digest,'hex') then raise exception 'upload changed' using errcode='PFR09'; end if;
    if entry.state in ('ready','attached') and (entry.state='attached' or entry.expires_at>clock_timestamp()) then return false; end if;
    if entry.state<>'uploading' or entry.expires_at<=clock_timestamp()
    then raise exception 'upload unavailable' using errcode='PMD04'; end if;
    if entry.upload_until>clock_timestamp() then raise exception 'upload in progress' using errcode='PFR09'; end if;
    update feed_data.post_attachments set lease=p_lease,upload_until=clock_timestamp()+interval '2 minutes' where id=p_id;
    return true;
  end if;
  if (select coalesce(sum(thumbnail_bytes+display_bytes),0) from feed_data.post_attachments where author_id=p_actor)
      +p_thumb+p_display>12582912
    or (select count(*) from feed_data.post_attachments where author_id=p_actor and state in ('uploading','ready'))>=16
  then raise exception 'storage budget' using errcode='PMD12'; end if;
  insert into feed_data.post_attachments(id,author_id,state,width,height,thumbnail_bytes,display_bytes,digest,lease,upload_until)
    values(p_id,p_actor,'uploading',p_width,p_height,p_thumb,p_display,decode(p_digest,'hex'),p_lease,clock_timestamp()+interval '2 minutes');
  return true;
end;
$$;

create function public.finish_post_upload_for_api(p_id uuid,p_lease uuid,p_ready boolean)
returns boolean language sql security definer set search_path='' as $$
  with changed as (
    update feed_data.post_attachments set state=case when p_ready then 'ready' else state end,lease=null,upload_until=null
    where id=p_id and lease=p_lease and state='uploading' returning id
  ) select exists(select 1 from changed);
$$;

create function public.claim_post_media_cleanup_for_api()
returns uuid[] language sql security definer set search_path='' as $$
  with picked as (
    select id from feed_data.post_attachments
    where ((state='discarded' or author_id is null or (state='attached' and post_id is null))
      or (state in ('uploading','ready') and expires_at<=clock_timestamp()))
      and (upload_until is null or upload_until<=clock_timestamp())
    order by expires_at,id limit 16 for update skip locked
  ), marked as (
    update feed_data.post_attachments set post_id=null,position=null,state='discarded',lease=null,
      upload_until=clock_timestamp()+interval '2 minutes' where id in(select id from picked) returning id
  ) select coalesce(array_agg(id),'{}') from marked;
$$;

create function public.finish_post_media_cleanup_for_api(p_ids uuid[])
returns void language sql security definer set search_path='' as $$
  delete from feed_data.post_attachments where id=any(p_ids) and state='discarded';
$$;

create function feed_data.normalize_attachments(p_items jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare normalized jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array'
  then raise exception 'invalid attachments' using errcode='22023'; end if;
  if jsonb_array_length(p_items)>4 or exists(select 1 from jsonb_array_elements(p_items) q(item)
    where jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string'
      or (item - 'id' - 'alt')<>'{}'::jsonb
      or (item ? 'alt' and jsonb_typeof(item->'alt') not in ('null','string'))
      or char_length(coalesce(item->>'alt',''))>240 or coalesce(item->>'alt','') ~ '[[:cntrl:]]')
  then raise exception 'invalid attachments' using errcode='22023'; end if;
  if jsonb_array_length(p_items)<>(select count(distinct (item->>'id')::uuid) from jsonb_array_elements(p_items) q(item))
  then raise exception 'duplicate attachment' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',(item->>'id')::uuid,'alt',nullif(btrim(item->>'alt'),'')) order by n),'[]')
    into normalized from jsonb_array_elements(p_items) with ordinality q(item,n);
  return normalized;
exception when invalid_text_representation then raise exception 'invalid attachment' using errcode='22023';
end;
$$;

create function feed_data.replace_attachments(p_post uuid,p_items jsonb)
returns void language plpgsql set search_path='' as $$
declare wanted uuid[]:=array(select (j->>'id')::uuid from jsonb_array_elements(p_items) j);
begin
  perform 1 from feed_data.post_attachments where id=any(wanted) order by id for update;
  if (select count(*) from feed_data.post_attachments where id=any(wanted) and author_id=auth.uid()
    and ((state='ready' and post_id is null and expires_at>clock_timestamp()) or (state='attached' and post_id=p_post)))
    <>cardinality(wanted)
  then raise exception 'attachment unavailable' using errcode='PMD04'; end if;
  update feed_data.post_attachments set state='discarded',post_id=null,position=null
    where post_id=p_post and not(id=any(wanted));
  update feed_data.post_attachments m set post_id=p_post,state='attached',position=q.n::smallint,alt=q.item->>'alt'
    from jsonb_array_elements(p_items) with ordinality q(item,n) where m.id=(q.item->>'id')::uuid;
end;
$$;

create function public.create_post_with_media_for_client(p_body text,p_language text,p_visibility text,p_submission uuid,
  p_topics text[],p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  previous bytea; known boolean; normalized jsonb; current_digest bytea; result uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  normalized:=feed_data.normalize_attachments(p_items);
  current_digest:=extensions.digest(normalized::text,'sha256');
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  select media_digest into previous from feed_data.post_submissions where author_id=actor and submission_id=p_submission;
  known:=found;
  if known and current_digest<>coalesce(previous,extensions.digest('[]','sha256'))
  then raise exception 'submission reused' using errcode='PFR09'; end if;
  result:=public.create_post_with_topics_for_client(p_body,p_language,p_visibility,p_submission,p_topics);
  if not known then
    perform feed_data.replace_attachments(result,normalized);
    update feed_data.post_submissions set media_digest=current_digest where author_id=actor and submission_id=p_submission;
  end if;
  return result;
end;
$$;

create function public.edit_post_with_media_for_client(p_id uuid,p_version integer,p_body text,p_language text,p_visibility text,
  p_topics text[],p_items jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare normalized jsonb:=feed_data.normalize_attachments(p_items);
begin
  if p_topics is null then
    perform public.mutate_post_for_client(p_id,p_version,false,p_body,p_language,p_visibility);
  else
    perform public.edit_post_with_topics_for_client(p_id,p_version,p_body,p_language,p_visibility,p_topics);
  end if;
  perform feed_data.replace_attachments(p_id,normalized);
end;
$$;

create function feed_data.discard_post_attachments()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null or new.status='removed' then
    update feed_data.post_attachments set state='discarded',post_id=null,position=null where post_id=new.id;
  end if;
  return new;
end;
$$;
create trigger discard_post_attachments after update of deleted_at,status on feed_data.posts
  for each row execute function feed_data.discard_post_attachments();

create function feed_data.can_read_post_media(p feed_data.posts,p_review boolean)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.deleted_at is null and case when p_review then p.status in ('published','hidden') and feed_data.mod_allowed()
    else feed_data.discussion_visible(p) or (p.status='draft' and auth.uid()=p.author_id and feed_data.member_allowed()) end,false);
$$;

create function public.post_attachments_for_client(p_ids uuid[],p_review boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_ids is null or cardinality(p_ids)>41 then raise exception 'invalid request' using errcode='22023'; end if;
  return coalesce((select jsonb_object_agg(post_id,items) from (
    select m.post_id,jsonb_agg(jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',m.alt) order by m.position) items
    from feed_data.post_attachments m join feed_data.posts p on p.id=m.post_id
    where m.post_id=any(p_ids) and m.state='attached' and feed_data.can_read_post_media(p,p_review) group by m.post_id
  ) q),'{}');
end;
$$;

create function public.can_download_post_media_for_client(p_post uuid,p_id uuid,p_review boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from feed_data.post_attachments m join feed_data.posts p on p.id=m.post_id
    where m.id=p_id and p.id=p_post and m.state='attached' and feed_data.can_read_post_media(p,p_review));
$$;

revoke all on function feed_data.normalize_attachments(jsonb),feed_data.replace_attachments(uuid,jsonb),
  feed_data.discard_post_attachments(),feed_data.can_read_post_media(feed_data.posts,boolean),
  public.post_upload_budget_for_client(),public.reserve_post_upload_for_api(uuid,uuid,uuid,text,integer,integer,integer,integer),
  public.finish_post_upload_for_api(uuid,uuid,boolean),public.claim_post_media_cleanup_for_api(),public.finish_post_media_cleanup_for_api(uuid[]),
  public.create_post_with_media_for_client(text,text,text,uuid,text[],jsonb),public.edit_post_with_media_for_client(uuid,integer,text,text,text,text[],jsonb),
  public.post_attachments_for_client(uuid[],boolean),public.can_download_post_media_for_client(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.post_upload_budget_for_client(),public.create_post_with_media_for_client(text,text,text,uuid,text[],jsonb),
  public.edit_post_with_media_for_client(uuid,integer,text,text,text,text[],jsonb) to authenticated;
grant execute on function public.post_attachments_for_client(uuid[],boolean),
  public.can_download_post_media_for_client(uuid,uuid,boolean) to anon,authenticated;
grant execute on function public.reserve_post_upload_for_api(uuid,uuid,uuid,text,integer,integer,integer,integer),
  public.finish_post_upload_for_api(uuid,uuid,boolean),public.claim_post_media_cleanup_for_api(),
  public.finish_post_media_cleanup_for_api(uuid[]) to service_role;
