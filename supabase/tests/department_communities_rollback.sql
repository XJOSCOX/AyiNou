do $$
declare
  alice uuid:=gen_random_uuid(); bob uuid:=gen_random_uuid(); moderator uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid();
  asid uuid:=gen_random_uuid(); bsid uuid:=gen_random_uuid(); msid uuid:=gen_random_uuid(); psid uuid:=gen_random_uuid();
  mf uuid:=gen_random_uuid(); pf uuid:=gen_random_uuid();
  aj text:=jsonb_build_object('sub',alice,'session_id',asid,'aal','aal1')::text;
  bj text:=jsonb_build_object('sub',bob,'session_id',bsid,'aal','aal1')::text;
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  mj text:=jsonb_build_object('sub',moderator,'session_id',msid,'aal','aal2','amr',amr)::text;
  pj text:=jsonb_build_object('sub',administrator,'session_id',psid,'aal','aal2','amr',amr)::text;
  nord uuid; room_post uuid; west_post uuid; room_comment uuid; room_reply uuid;
  image uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); key uuid:=gen_random_uuid();
  acts jsonb; report jsonb; decision uuid; appeal uuid; page jsonb; boundary uuid;
  bob_handle text:='dept_'||left(replace(bob::text,'-',''),12);
  mod_handle text:='dept_'||left(replace(moderator::text,'-',''),12);
begin
  if (select count(*) from feed_data.communities where kind='department')<>10
    or (select array_agg(department_code order by department_code) from feed_data.communities)
      <>array['HT-AR','HT-CE','HT-GA','HT-ND','HT-NE','HT-NI','HT-NO','HT-OU','HT-SD','HT-SE']
  then raise exception 'incorrect official department seed'; end if;
  select id into nord from feed_data.communities where slug='nord';
  insert into feed_data.communities(slug,kind,department_code) values('nord','department','HT-ND') on conflict(department_code) do nothing;
  if (select id from feed_data.communities where slug='nord') is distinct from nord then raise exception 'seed changed ID'; end if;
  begin
    insert into feed_data.communities(slug,kind,department_code) values('imposter','department','HT-ND');
    raise exception 'duplicate official community accepted';
  exception when unique_violation then null; end;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,unnest(array['anon','authenticated','service_role']) r(role)
    where n.nspname='feed_data' and c.relname in ('communities','community_memberships','community_staff','community_staff_audit')
      and (not c.relrowsecurity or has_table_privilege(r.role,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.change_department_membership_for_client(text,text,boolean)','execute')
    or has_function_privilege('authenticated','feed_data.moderate_scoped_post(uuid,uuid,integer,text,text)','execute')
  then raise exception 'department grants are too broad'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@department-rollback.invalid',now(),now(),now() from unnest(array[alice,bob,moderator,administrator]) f(id);
  perform public.initialize_member_for_api(id) from unnest(array[alice,bob,moderator,administrator]) f(id);
  update public.profiles set is_visible=true,display_name='Department fixture',username='dept_'||left(replace(user_id::text,'-',''),12)
    where user_id=any(array[alice,bob,moderator,administrator]);
  insert into public.user_settings(user_id,discoverable) values(alice,true),(bob,true)
    on conflict(user_id) do update set discoverable=true;
  update public.member_private set residence_country_code='HT',residence_department_code='HT-SD',diaspora_department_code=null
    where user_id=alice;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(mf,moderator,'totp','verified','rollback-only',now(),now()),(pf,administrator,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(asid,alice,'aal1',null),(bsid,bob,'aal1',null),(msid,moderator,'aal2',mf),(psid,administrator,'aal2',pf);
  insert into public.role_assignments(user_id,role) values(administrator,'administrator');
  execute 'set local role service_role';
  perform public.reserve_post_upload_for_api(alice,image,lease,repeat('aa',32),80,80,1024,1024);
  perform public.finish_post_upload_for_api(image,lease,true);
  execute 'reset role';
  execute 'set local role anon';
  if jsonb_array_length(public.department_communities_for_client(false))<>10
    or public.department_community_for_client('nord')->>'joined'<>'false'
    or public.department_community_for_client('nord')->>'memberCount' is not null
  then raise exception 'public room directory failed'; end if;
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',aj,true);
  if public.department_communities_for_client(true)<>'[]' then raise exception 'automatic membership detected'; end if;
  begin
    perform public.create_department_post_for_client('nord','Nonmember post.','ht',key,'{}','[]');
    raise exception 'nonmember posting accepted';
  exception when sqlstate 'PCM03' then null; end;
  perform public.change_department_membership_for_client('nord','join',null);
  perform public.change_department_membership_for_client('nord','join',null);
  perform public.change_department_membership_for_client('ouest','join',null);
  if jsonb_array_length(public.department_communities_for_client(true))<>2
    or public.department_community_for_client('nord')->>'directoryVisible'<>'false'
    or public.department_members_for_client('nord',null,15)<>'[]'
  then raise exception 'membership count or privacy drift'; end if;
  begin
    perform public.change_department_staff_for_client('nord',mod_handle,'moderator','Unauthorized self-serve assignment.');
    raise exception 'member granted moderator';
  exception when insufficient_privilege then null; end;
  room_post:=public.create_department_post_for_client('nord','Nord post with fixture media.','ht',key,array['culture'],
    jsonb_build_array(jsonb_build_object('id',image)));
  if room_post is distinct from public.create_department_post_for_client('nord','Nord post with fixture media.','ht',key,array['culture'],
    jsonb_build_array(jsonb_build_object('id',image))) then raise exception 'idempotency failed'; end if;
  begin
    perform public.create_department_post_for_client('ouest','Nord post with fixture media.','ht',key,array['culture'],
      jsonb_build_array(jsonb_build_object('id',image)));
    raise exception 'cross-community nonce reused';
  exception when sqlstate 'PFR09' then null; end;
  begin
    perform public.create_post_with_media_for_client('Nord post with fixture media.','ht','members_only',key,array['culture'],
      jsonb_build_array(jsonb_build_object('id',image)));
    raise exception 'global replay reused scoped nonce';
  exception when sqlstate 'PFR09' then null; end;
  begin
    perform public.mutate_post_for_client(room_post,1,false,'Publish outside the room.','en','public');
    raise exception 'community audience escaped';
  exception when invalid_parameter_value then null; end;
  west_post:=public.create_department_post_for_client('ouest','Ouest private discussion.','es',gen_random_uuid(),'{}','[]');
  perform public.create_department_post_for_client('nord','Second Nord post.','fr',gen_random_uuid(),'{}','[]');
  page:=public.read_department_posts_for_client('nord',1,null,null);
  boundary:=(page#>>'{0,id}')::uuid;
  if jsonb_array_length(page)<>2 or (public.read_department_posts_for_client('nord',1,(page#>>'{0,createdAt}')::timestamptz,boundary)#>>'{0,id}')::uuid<>room_post
    or public.read_feed_for_client('mine',40,null,null,null)<>'[]'
  then raise exception 'room pagination or My Posts boundary failed'; end if;
  perform set_config('request.jwt.claims',bj,true);
  perform public.change_department_membership_for_client('ouest','join',null);
  if public.read_feed_for_client('feed',1,null,null,room_post)<>'[]'
    or public.can_download_post_media_for_client(room_post,image)
    or public.write_engagement_for_client('post_reaction',room_post,p_kind=>'like')->>'error' is distinct from 'PFR04'
  then raise exception 'member of another department observed private data'; end if;
  perform public.change_department_membership_for_client('nord','join',null);
  perform public.change_department_membership_for_client('nord','privacy',true);
  if not public.can_download_post_media_for_client(room_post,image) then raise exception 'member cannot read media'; end if;
  room_comment:=(public.write_engagement_for_client('create',room_post,p_body=>'Community comment.',p_language=>'es',
    p_submission=>gen_random_uuid())->>'id')::uuid;
  if room_comment is null or public.write_engagement_for_client('post_reaction',room_post,p_kind=>'love')#>>'{reactions,mine}'<>'love'
  then raise exception 'community engagement failed'; end if;
  perform public.report_post_for_client(room_post,'other','Fixture post report.');
  perform public.write_engagement_for_client('report',room_comment,p_category=>'other',p_note=>'No self reports allowed.');
  perform set_config('request.jwt.claims',aj,true);
  room_reply:=(public.write_engagement_for_client('create',room_post,room_comment,'Community reply.','ht',gen_random_uuid())->>'id')::uuid;
  if room_reply is null or not exists(select 1 from jsonb_array_elements(public.department_members_for_client('nord',null,20)) j
    where j->>'handle'=bob_handle) then raise exception 'reply or directory opt-in failed'; end if;
  if public.notification_count_for_client()<>2 then raise exception 'expected scoped event notifications missing'; end if;
  perform public.write_engagement_for_client('report',room_comment,p_category=>'other',p_note=>'Scoped comment report.');
  perform public.save_member_safety_for_client('block',true,bob_handle,null);
  if public.department_members_for_client('nord',null,20)<>'[]' or public.notification_count_for_client()<>0
  then raise exception 'scope leaked blocked identities or events'; end if;
  perform public.save_member_safety_for_client('block',false,null,bob);
  perform public.save_member_safety_for_client('mute',true,bob_handle,null);
  if public.list_comments_for_client(room_post,null,20,null,null)='[]'
  then raise exception 'mute removed discussion interactions'; end if;
  perform public.save_member_safety_for_client('mute',false,null,bob);
  perform set_config('request.jwt.claims',pj,true);
  perform public.change_department_staff_for_client('nord',mod_handle,'moderator','Approve scoped moderator fixture.');
  perform set_config('request.jwt.claims',jsonb_set(mj::jsonb,'{aal}','"aal1"')::text,true);
  begin
    perform public.department_reports_for_client('nord','posts','reports',null,null);
    raise exception 'queue without MFA';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',mj,true);
  report:=public.department_reports_for_client('nord','posts','reports',null,null);
  if not exists(select 1 from jsonb_array_elements(report) j where j->>'postId'=room_post::text)
    or not exists(select 1 from jsonb_array_elements(public.department_reports_for_client('nord','comments','reports',null,null)) j
      where j->>'commentId'=room_comment::text)
    or not public.can_download_post_media_for_client(room_post,image,true)
  then raise exception 'scoped moderation queue or media inaccessible'; end if;
  begin
    perform public.moderate_department_content_for_client('ouest','posts',west_post,1,'hide','Denied cross-community action.');
    raise exception 'moderator accessed another community';
  exception when insufficient_privilege then null; end;
  begin
    perform public.moderate_department_content_for_client('nord','posts',west_post,1,'hide','Wrong target for assigned community.');
    raise exception 'moderator changed out-of-scope target';
  exception when sqlstate 'PFR04' then null; end;
  perform public.moderate_department_content_for_client('nord','posts',room_post,1,'hide','Scoped written moderation decision.');
  execute 'reset role';
  select id into decision from feed_data.post_moderation_actions where post_id=room_post and action='hide';
  if (select count(*) from feed_data.community_staff_audit where community_id=nord and target_id=moderator)<>1
    or exists(select 1 from public.role_assignments where user_id=moderator)
    or not exists(select 1 from public.member_private where user_id=alice and residence_department_code='HT-SD' and diaspora_department_code is null)
  then raise exception 'staff audit, global role, or profile privacy drift'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',aj,true);
  appeal:=public.submit_moderation_appeal_for_client('post',decision,'Please reconsider the local context.');
  perform set_config('request.jwt.claims',pj,true);
  acts:=public.review_appeals_for_client('pending',null,null,30);
  if not exists(select 1 from jsonb_array_elements(acts) j where j->>'id'=appeal::text) then raise exception 'admin cannot review community appeal'; end if;
  perform public.decide_moderation_appeal_for_client(appeal,'overturned','The original context supports restoration.');
  perform set_config('request.jwt.claims',bj,true);
  if not public.can_download_post_media_for_client(room_post,image) then raise exception 'restore did not restore membership-scoped media'; end if;
  perform public.change_department_membership_for_client('nord','leave',null);
  if public.can_download_post_media_for_client(room_post,image) or public.read_feed_for_client('feed',1,null,null,room_post)<>'[]'
    or public.notification_count_for_client()<>0
  then raise exception 'departed member retained room access'; end if;
  execute 'reset role';
end;
$$;
