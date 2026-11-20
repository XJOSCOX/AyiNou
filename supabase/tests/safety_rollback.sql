do $$
declare
  alice uuid:=gen_random_uuid(); bob uuid:=gen_random_uuid(); mod1 uuid:=gen_random_uuid(); mod2 uuid:=gen_random_uuid();
  asid uuid:=gen_random_uuid(); bsid uuid:=gen_random_uuid(); msid uuid:=gen_random_uuid(); nsid uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid(); factor2 uuid:=gen_random_uuid(); img uuid:=gen_random_uuid();
  alice_name text:='safe_'||left(replace(alice::text,'-',''),14);
  bob_name text:='safe_'||left(replace(bob::text,'-',''),14);
  aj text:=jsonb_build_object('sub',alice,'session_id',asid,'aal','aal1')::text;
  bj text:=jsonb_build_object('sub',bob,'session_id',bsid,'aal','aal1')::text;
  mj text:=jsonb_build_object('sub',mod1,'session_id',msid,'aal','aal2','amr',
    jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
  nj text:=jsonb_build_object('sub',mod2,'session_id',nsid,'aal','aal2','amr',
    jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
  a_post uuid; b_post uuid; b_comment uuid; decision_id uuid; comment_decision uuid; appeal uuid; comment_appeal uuid;
  draft_nonce uuid:=gen_random_uuid(); snapshot uuid; tx jsonb; review jsonb; notice jsonb;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,unnest(array['anon','authenticated','service_role']) role(name)
      where n.nspname='feed_data' and c.relname in ('member_blocks','member_mutes','moderation_appeals','read_limits')
      and (not c.relrowsecurity or has_table_privilege(role.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.list_member_safety_for_client(text,uuid,integer)','execute')
    or has_function_privilege('authenticated','public.consume_safety_read_for_api(uuid,integer,text)','execute')
    or has_function_privilege('authenticated','public.safety_cleanup_for_api(text,boolean,integer)','execute')
  then raise exception 'unsafe safety grants'; end if;
  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@safety-rollback.invalid',now(),now(),now() from unnest(array[alice,bob,mod1,mod2]) f(id);
  perform public.initialize_member_for_api(id) from unnest(array[alice,bob,mod1,mod2]) f(id);
  update public.profiles set is_visible=true,display_name='Safety fixture',username='safe_'||left(replace(user_id::text,'-',''),14)
    where user_id=any(array[alice,bob,mod1,mod2]);
  insert into public.user_settings(user_id,discoverable) values(alice,true),(bob,true)
    on conflict(user_id) do update set discoverable=true;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(factor,mod1,'totp','verified','rollback-only',now(),now()),(factor2,mod2,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(asid,alice,'aal1',null),(bsid,bob,'aal1',null),(msid,mod1,'aal2',factor),(nsid,mod2,'aal2',factor2);
  insert into public.role_assignments(user_id,role) values(mod1,'moderator'),(mod2,'moderator');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',aj,true);
  a_post:=public.create_post_with_media_for_client('Protected author post.','ht','public',draft_nonce,array['culture'],'[]');
  perform public.write_follow_for_client('member',bob_name,true);
  perform set_config('request.jwt.claims',bj,true);
  b_post:=public.create_post_with_media_for_client('Independent member post.','es','public',gen_random_uuid(),array['culture'],'[]');
  b_comment:=(public.write_engagement_for_client('create',a_post,p_body=>'Independent member comment.',p_language=>'fr',p_submission=>gen_random_uuid())->>'id')::uuid;
  perform public.write_follow_for_client('member',alice_name,true);
  perform public.write_engagement_for_client('post_reaction',a_post,p_kind=>'like');
  perform set_config('request.jwt.claims',aj,true);
  tx:=public.read_for_you_for_client(null,0,40);
  snapshot:=(tx->>'snapshotId')::uuid;
  if not exists(select 1 from jsonb_array_elements(tx->'rows') j where j->>'id'=b_post::text)
  then raise exception 'recommendation fixture missing'; end if;
  perform public.save_member_safety_for_client('mute',true,bob_name,null);
  if public.read_feed_for_client('feed',1,null,null,b_post)='[]'
    or public.notification_count_for_client()<>3
    or exists(select 1 from jsonb_array_elements(public.read_feed_for_client('feed',40,null,null,null)) j where j->>'id'=b_post::text)
    or exists(select 1 from jsonb_array_elements(public.read_following_feed_for_client(40,null,null)) j where j->>'id'=b_post::text)
    or exists(select 1 from jsonb_array_elements(public.read_for_you_for_client(snapshot,0,40)->'rows') j where j->>'id'=b_post::text)
    or public.follow_status_for_client('member',bob_name)->>'following' is distinct from 'true'
  then raise exception 'mute visibility incorrect'; end if;
  perform public.save_member_safety_for_client('mute',false,null,bob);
  if public.member_mute_status_for_client(bob_name) then raise exception 'mute was not removed'; end if;
  begin
    perform public.save_member_safety_for_client('block',true,alice_name,null);
    raise exception 'self block accepted';
  exception when sqlstate 'PSF01' then null; end;
  perform public.save_member_safety_for_client('block',true,bob_name,null);
  perform public.save_member_safety_for_client('block',true,bob_name,null);
  if jsonb_array_length(public.list_member_safety_for_client('block',null,20))<>1
    or public.search_discovery_for_client('people',bob_name,false,null,null,null,null,10)<>'[]'
    or public.read_feed_for_client('feed',1,null,null,b_post)<>'[]'
    or public.list_comments_for_client(a_post,null,10,null,null)<>'[]'
    or public.notification_count_for_client()<>0
    or exists(select 1 from public.find_member_profile_for_client(bob_name))
    or exists(select 1 from public.profiles where user_id=bob)
  then raise exception 'block did not filter protected surfaces'; end if;
  perform set_config('request.jwt.claims',bj,true);
  if public.list_member_safety_for_client('block',null,20)<>'[]'
    or public.write_follow_for_client('member',alice_name,true)->>'error' is distinct from 'PFR04'
    or public.write_engagement_for_client('create',a_post,p_body=>'Prevented.',p_language=>'en',p_submission=>gen_random_uuid())->>'error' is distinct from 'PFR04'
    or public.write_engagement_for_client('post_reaction',a_post,p_kind=>'love')->>'error' is distinct from 'PFR04'
  then raise exception 'blocked member can see blocker or interact'; end if;
  execute 'reset role';
  if exists(select 1 from feed_data.member_follows where (follower_id=alice and target_id=bob) or (follower_id=bob and target_id=alice))
  then raise exception 'follows survived block'; end if;
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.read_feed_for_client('feed',1,null,null,a_post)='[]' then raise exception 'public view unexpectedly suppressed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',aj,true);
  execute 'set local role authenticated';
  perform public.save_member_safety_for_client('block',false,null,bob);
  if public.follow_status_for_client('member',bob_name)->>'following' is distinct from 'false'
  then raise exception 'unblock restored follow'; end if;
  perform set_config('request.jwt.claims',mj,true);
  perform public.moderate_post_for_client(b_post,1,'hide','Private moderator decision for the fixture.');
  perform public.moderate_comment_for_client(b_comment,1,'hide','Private comment moderation for the fixture.');
  execute 'reset role';
  select id into decision_id from feed_data.post_moderation_actions where post_id=b_post;
  select id into comment_decision from feed_data.comment_moderation_actions where comment_id=b_comment;
  update feed_data.comment_moderation_actions set created_at=now()-interval '15 days' where id=comment_decision;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',aj,true);
  begin
    perform public.submit_moderation_appeal_for_client('post',decision_id,'Another member cannot submit this.');
    raise exception 'cross owner appeal allowed';
  exception when sqlstate 'PSF04' then null; end;
  perform set_config('request.jwt.claims',bj,true);
  begin
    perform public.submit_moderation_appeal_for_client('comment',comment_decision,'The appeal is beyond its deadline.');
    raise exception 'late appeal accepted';
  exception when sqlstate 'PSF14' then null; end;
  appeal:=public.submit_moderation_appeal_for_client('post',decision_id,'Please review the decision.');
  if appeal is distinct from public.submit_moderation_appeal_for_client('post',decision_id,'Please review the decision.')
    or public.member_appeals_for_client(null,null,20)::text like '%Private moderator decision%'
    or public.read_feed_for_client('feed',1,null,null,b_post)#>>'{0,status}' is distinct from 'hidden'
  then raise exception 'submission replay, privacy or moderation drift'; end if;
  begin
    perform public.submit_moderation_appeal_for_client('post',decision_id,'Different rationale for duplicate check.');
    raise exception 'duplicate appeal accepted';
  exception when sqlstate 'PSF09' then null; end;
  perform set_config('request.jwt.claims',mj,true);
  begin
    perform public.decide_moderation_appeal_for_client(appeal,'overturned','Original reviewer must not decide.');
    raise exception 'conflicted reviewer decided appeal';
  exception when sqlstate 'PSF03' then null; end;
  perform set_config('request.jwt.claims',jsonb_set(nj::jsonb,'{aal}','"aal1"')::text,true);
  begin
    perform public.decide_moderation_appeal_for_client(appeal,'overturned','The reviewer lacks recent MFA.');
    raise exception 'review without MFA';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',nj,true);
  review:=public.review_appeals_for_client('pending',null,null,30);
  if not exists(select 1 from jsonb_array_elements(review) j where j->>'id'=appeal::text and j->>'canRestore'='true')
  then raise exception 'appeal missing from review'; end if;
  begin
    perform public.moderate_post_for_client(b_post,2,'remove','Pending appeal must protect evidence.');
    raise exception 'active appeal did not hold evidence';
  exception when sqlstate 'PFR09' then null; end;
  perform public.decide_moderation_appeal_for_client(appeal,'overturned','The context supports restoration.');
  begin
    perform public.decide_moderation_appeal_for_client(appeal,'closed','Late retries cannot change outcomes.');
    raise exception 'completed appeal changed';
  exception when sqlstate 'PFR09' then null; end;
  perform set_config('request.jwt.claims',bj,true);
  select j into notice from jsonb_array_elements(public.notifications_for_client(30,null,null)) j where j->>'kind'='appeal_decided';
  if notice->>'appealId' is distinct from appeal::text or notice->>'actor' is not null
    or public.read_feed_for_client('feed',1,null,null,b_post)#>>'{0,status}' is distinct from 'published'
    or not exists(select 1 from jsonb_array_elements(public.member_appeals_for_client(null,null,20)) j
      where j#>>'{appeal,outcome}'='overturned' and j#>>'{appeal,explanation}'='The context supports restoration.')
  then raise exception 'restore or notification validation failed: %',notice; end if;
  execute 'reset role';
  if (select count(*) from feed_data.post_moderation_actions where post_id=b_post)<>2
  then raise exception 'original moderation history not preserved'; end if;
  update feed_data.comment_moderation_actions set created_at=now() where id=comment_decision;
  execute 'set local role authenticated';
  comment_appeal:=public.submit_moderation_appeal_for_client('comment',comment_decision,'Please allow the original comment.');
  perform set_config('request.jwt.claims',nj,true);
  perform public.decide_moderation_appeal_for_client(comment_appeal,'upheld','The comment hide remains appropriate.');
  execute 'reset role';
  if (select status from feed_data.comments where id=b_comment)<>'hidden' then raise exception 'upheld comment was restored'; end if;
  insert into feed_data.content_reports(post_id,reporter_id,category) values(b_post,alice,'other') on conflict do nothing;
  insert into feed_data.post_attachments(id,author_id,state,retention_post_id,width,height,thumbnail_bytes,display_bytes,digest,expires_at)
    values(img,bob,'discarded',b_post,50,50,1024,1024,decode(repeat('ab',32),'hex'),now()-interval '1 hour');
  if exists(select 1 from feed_data.post_attachments m where m.id=img and feed_data.media_cleanup_allowed(m))
  then raise exception 'pending report evidence eligible for cleanup'; end if;
  update feed_data.content_reports set status='closed',closed_at=now() where post_id=b_post;
  if not exists(select 1 from feed_data.post_attachments m where m.id=img and feed_data.media_cleanup_allowed(m))
  then raise exception 'closed report evidence never becomes eligible'; end if;
  execute 'set local role service_role';
  for i in 1..60 loop
    if not public.consume_safety_read_for_api(alice,null,'discovery') then raise exception 'read budget rejected early'; end if;
  end loop;
  if public.consume_safety_read_for_api(alice,null,'discovery') or not public.consume_safety_read_for_api(bob,null,'discovery')
  then raise exception 'shared actor read quota incorrect'; end if;
  if public.safety_cleanup_for_api('read_limits',false,20)<0 then raise exception 'preview failed'; end if;
  execute 'reset role';
  if (select total from feed_data.read_limits where subject='member:'||alice::text and category='discovery')<>60
  then raise exception 'preview changed counters'; end if;
  update feed_data.read_limits set window_started=now()-interval '100 years'
    where subject='member:'||alice::text and category='discovery';
  execute 'set local role service_role';
  if public.safety_cleanup_for_api('read_limits',false,1)<>1 or public.safety_cleanup_for_api('read_limits',true,1)<>1
  then raise exception 'cleanup preview or apply count mismatch'; end if;
  execute 'reset role';
  if exists(select 1 from feed_data.read_limits where subject='member:'||alice::text and category='discovery')
    or not exists(select 1 from feed_data.read_limits where subject='member:'||bob::text and category='discovery')
  then raise exception 'cleanup did not preserve the current counter'; end if;
end;
$$;
