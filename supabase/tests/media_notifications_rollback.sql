do $$
declare
  author uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); third uuid:=gen_random_uuid();
  asid uuid:=gen_random_uuid(); rsid uuid:=gen_random_uuid(); tsid uuid:=gen_random_uuid();
  img uuid:=gen_random_uuid(); img2 uuid:=gen_random_uuid(); abandoned uuid:=gen_random_uuid();
  lease uuid:=gen_random_uuid(); nonce uuid:=gen_random_uuid();
  post uuid; root uuid; reply uuid; notification uuid; results jsonb; selected jsonb; reordered jsonb; claimed uuid[];
  author_name text:='media_'||left(replace(author::text,'-',''),14);
  author_jwt text:=jsonb_build_object('sub',author,'session_id',asid,'aal','aal1')::text;
  reader_jwt text:=jsonb_build_object('sub',reader,'session_id',rsid,'aal','aal1')::text;
  third_jwt text:=jsonb_build_object('sub',third,'session_id',tsid,'aal','aal1')::text;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      unnest(array['anon','authenticated','service_role']) role(name)
      where n.nspname='feed_data' and c.relname in ('post_attachments','notifications','notification_preferences')
      and (not c.relrowsecurity or has_table_privilege(role.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.notifications_for_client(integer,timestamptz,uuid)','execute')
    or has_function_privilege('authenticated','public.reserve_post_upload_for_api(uuid,uuid,uuid,text,integer,integer,integer,integer)','execute')
    or not exists(select 1 from storage.buckets where id='post-media' and not public and allowed_mime_types=array['image/webp'])
  then raise exception 'media or notification privileges invalid'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@phase3e.invalid',now(),now(),now() from unnest(array[author,reader,third]) f(id);
  insert into auth.sessions(id,user_id,aal) values(asid,author,'aal1'),(rsid,reader,'aal1'),(tsid,third,'aal1');
  perform public.initialize_member_for_api(id) from unnest(array[author,reader,third]) f(id);
  update public.profiles set is_visible=true,display_name='Synthetic fixture',username='media_'||left(replace(user_id::text,'-',''),14)
    where user_id=any(array[author,reader,third]);
  insert into public.user_settings(user_id,discoverable) values(author,true),(reader,true),(third,true)
    on conflict(user_id) do update set discoverable=true;

  execute 'set local role service_role';
  if not public.reserve_post_upload_for_api(author,img,lease,repeat('ab',32),100,80,1000,1500)
    or not public.finish_post_upload_for_api(img,lease,true)
    or public.reserve_post_upload_for_api(author,img,lease,repeat('ab',32),100,80,1000,1500)
    or not public.reserve_post_upload_for_api(author,img2,lease,repeat('cd',32),80,100,1000,2500)
    or not public.finish_post_upload_for_api(img2,lease,true)
    or not public.reserve_post_upload_for_api(author,abandoned,lease,repeat('ef',32),80,90,1000,2500)
  then raise exception 'stage reservations invalid'; end if;
  execute 'reset role';
  selected:=jsonb_build_array(jsonb_build_object('id',img,'alt',' Coast '),jsonb_build_object('id',img2));
  reordered:=jsonb_build_array(jsonb_build_object('id',img2),jsonb_build_object('id',img));
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  begin
    perform public.create_post_with_media_for_client('Invalid ownership.','ht','public',nonce,'{}',selected);
    raise exception 'Another member could attach reserved media';
  exception when sqlstate 'PMD04' then null; end;
  perform set_config('request.jwt.claims',author_jwt,true);
  post:=public.create_post_with_media_for_client('Media draft.','es','private',nonce,'{}',selected);
  if post is distinct from public.create_post_with_media_for_client('Media draft.','es','private',nonce,'{}',selected)
    or not public.can_download_post_media_for_client(post,img)
    or public.post_attachments_for_client(array[post])#>>array[post::text,'0','alt'] is distinct from 'Coast'
  then raise exception 'Idempotent private media creation failed'; end if;
  begin
    perform public.create_post_with_media_for_client('Media draft.','es','private',nonce,'{}',reordered);
    raise exception 'Changed media reused a submission ID';
  exception when sqlstate 'PFR09' then null; end;
  perform set_config('request.jwt.claims',reader_jwt,true);
  if public.can_download_post_media_for_client(post,img) or public.can_download_post_media_for_client(post,img,true)
    or public.post_attachments_for_client(array[post])<>'{}'
  then raise exception 'Draft media exposed'; end if;
  perform set_config('request.jwt.claims',author_jwt,true);
  perform public.edit_post_with_media_for_client(post,1,'Media post.','es','members_only',null,reordered);
  if public.post_attachments_for_client(array[post])#>>array[post::text,'0','id'] is distinct from img2::text
  then raise exception 'Attachment order not preserved'; end if;
  begin
    perform public.edit_post_with_media_for_client(post,1,'Stale.','es','public',null,'[]');
    raise exception 'Stale media update accepted';
  exception when sqlstate 'PFR09' then null; end;
  perform public.write_engagement_for_client('post_reaction',post,p_kind=>'like');
  if public.notification_count_for_client()<>0 then raise exception 'Self reaction notified'; end if;
  root:=(public.write_engagement_for_client('create',post,p_body=>'Own root.',p_language=>'es',p_submission=>gen_random_uuid())->>'id')::uuid;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.can_download_post_media_for_client(post,img) then raise exception 'Members-only media exposed anonymously'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  if not public.can_download_post_media_for_client(post,img) then raise exception 'Member media inaccessible'; end if;
  perform public.write_engagement_for_client('post_reaction',post,p_kind=>'like');
  perform public.write_engagement_for_client('post_reaction',post,p_kind=>'love');
  perform public.write_engagement_for_client('post_reaction',post);
  perform public.write_engagement_for_client('post_reaction',post,p_kind=>'celebrate');
  perform public.write_follow_for_client('member',author_name,true);
  perform public.write_follow_for_client('member',author_name,false);
  perform public.write_follow_for_client('member',author_name,true);
  reply:=(public.write_engagement_for_client('create',post,root,'Reply.','fr',gen_random_uuid())->>'id')::uuid;
  perform public.write_engagement_for_client('create',post,p_body=>'Root comment.',p_language=>'es',p_submission=>gen_random_uuid());
  if public.notification_count_for_client()<>0 then raise exception 'Unauthorized recipient got notifications'; end if;
  perform set_config('request.jwt.claims',author_jwt,true);
  results:=public.notifications_for_client(10,null,null);
  if public.notification_count_for_client()<>4 or jsonb_array_length(results)<>4
    or public.post_comment_target_for_client(post,reply)->>'body' is distinct from 'Reply.'
  then raise exception 'Incorrect notification count or target: %',results; end if;
  notification:=(results#>>'{0,id}')::uuid;
  perform set_config('request.jwt.claims',third_jwt,true);
  begin
    perform public.mark_notifications_for_client(notification);
    raise exception 'Another member changed read state';
  exception when sqlstate 'PFR04' then null; end;
  perform set_config('request.jwt.claims',author_jwt,true);
  perform public.mark_notifications_for_client(notification);
  if public.notification_count_for_client()<>3 then raise exception 'Read count not updated'; end if;
  perform public.mark_notifications_for_client(null);
  if public.notification_count_for_client()<>0 then raise exception 'Mark all failed'; end if;
  if public.save_notification_preferences_for_client(true,false,true,true)->>'comments'<>'false'
  then raise exception 'Preference save failed'; end if;
  perform set_config('request.jwt.claims',reader_jwt,true);
  perform public.write_engagement_for_client('create',post,p_body=>'Muted comment.',p_language=>'ht',p_submission=>gen_random_uuid());
  perform public.write_engagement_for_client('delete',reply,p_version=>1);
  perform public.write_follow_for_client('member',author_name,false);
  execute 'reset role';
  insert into private.account_restrictions(user_id,status,reason) values(reader,'suspended','Synthetic notification restriction.');
  perform set_config('request.jwt.claims',author_jwt,true);
  execute 'set local role authenticated';
  results:=public.notifications_for_client(10,null,null);
  if jsonb_array_length(results)<>4 or exists(select 1 from jsonb_array_elements(results) row
    where (row->>'available')::boolean or row->>'actor' is not null or row->>'postId' is not null or row->>'commentId' is not null)
    or public.post_comment_target_for_client(post,reply) is not null
  then raise exception 'Inaccessible notification leaked activity: %',results; end if;
  execute 'reset role';
  update feed_data.posts set status='hidden' where id=post;
  execute 'set local role authenticated';
  if public.can_download_post_media_for_client(post,img) then raise exception 'Hidden media exposed to author'; end if;
  execute 'reset role';
  update feed_data.posts set status='published',visibility='public' where id=post;
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if not public.can_download_post_media_for_client(post,img) then raise exception 'Public image inaccessible'; end if;
  execute 'reset role';
  update feed_data.posts set deleted_at=now() where id=post;
  if public.can_download_post_media_for_client(post,img) then raise exception 'Deleted media exposed'; end if;
  update feed_data.post_attachments set expires_at=now()-interval '1 hour',upload_until=null where id=abandoned;
  if (select count(*) from feed_data.post_attachments where id=any(array[img,img2]) and state='discarded')<>2
    or not exists(select 1 from feed_data.post_attachments where id=abandoned and state='uploading')
  then raise exception 'Media lifecycle drift'; end if;
  update feed_data.post_attachments set expires_at=now()-interval '100 years' where id=any(array[img,img2,abandoned]);
  execute 'set local role service_role';
  claimed:=public.claim_post_media_cleanup_for_api();
  if not claimed @> array[img,img2,abandoned] then raise exception 'Cleanup did not claim expired and discarded fixtures'; end if;
  perform public.finish_post_media_cleanup_for_api(array[img,img2,abandoned]);
  execute 'reset role';
  if exists(select 1 from feed_data.post_attachments where id=any(array[img,img2,abandoned]))
  then raise exception 'Cleanup did not finalize fixtures'; end if;
end;
$$;
