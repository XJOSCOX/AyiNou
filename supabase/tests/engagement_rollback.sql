do $$
declare
  author uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); moderator uuid:=gen_random_uuid();
  asid uuid:=gen_random_uuid(); rsid uuid:=gen_random_uuid(); msid uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid(); nonce uuid:=gen_random_uuid();
  post uuid; members uuid; root uuid; reply uuid; second uuid; member_root uuid; reader_comment uuid;
  result jsonb; items jsonb;
  author_jwt text:=jsonb_build_object('sub',author,'session_id',asid,'aal','aal1')::text;
  reader_jwt text:=jsonb_build_object('sub',reader,'session_id',rsid,'aal','aal1')::text;
  moderator_jwt text:=jsonb_build_object('sub',moderator,'session_id',msid,'aal','aal2','amr',
    jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['anon','authenticated','service_role']) r(role)
      where n.nspname='feed_data' and c.relname in ('comments','comment_submissions','post_reactions','comment_reactions','comment_reports','comment_moderation_actions')
      and (not c.relrowsecurity or has_table_privilege(r.role,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.write_engagement_for_client(text,uuid,uuid,text,text,uuid,integer,text,text,text)','execute')
  then raise exception 'unsafe engagement privileges'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@engagement.invalid',now(),now(),now() from unnest(array[author,reader,moderator]) f(id);
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(factor,moderator,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(asid,author,'aal1',null),(rsid,reader,'aal1',null),(msid,moderator,'aal2',factor);
  insert into public.role_assignments(user_id,role) values(moderator,'moderator');

  perform set_config('request.jwt.claims',author_jwt,true);
  execute 'set local role authenticated';
  post:=public.create_post_for_client('Public.','ht','public',gen_random_uuid());
  members:=public.create_post_for_client('Members-only.','ht','members_only',gen_random_uuid());
  result:=public.write_engagement_for_client('create',post,p_body=>'  Original root.  ',p_language=>'fr',p_submission=>nonce);
  root:=(result->>'id')::uuid;
  if root is null or public.write_engagement_for_client('create',post,p_body=>'  Original root.  ',p_language=>'fr',p_submission=>nonce)<>result
  then raise exception 'create/replay: %',result; end if;
  if public.write_engagement_for_client('create',post,p_body=>'different',p_language=>'fr',p_submission=>nonce)->>'error' is distinct from 'PFR09'
  then raise exception 'nonce reuse accepted'; end if;
  reply:=(public.write_engagement_for_client('create',post,root,'Reply.','es',gen_random_uuid())->>'id')::uuid;
  second:=(public.write_engagement_for_client('create',post,p_body=>'Second root.',p_language=>'en',p_submission=>gen_random_uuid())->>'id')::uuid;
  if reply is null or second is null then raise exception 'reply or second root missing'; end if;
  if public.write_engagement_for_client('create',post,reply,'Too deep.','fr',gen_random_uuid())->>'error' is distinct from '22023'
    or public.write_engagement_for_client('create',members,root,'Cross post.','fr',gen_random_uuid())->>'error' is distinct from '22023'
  then raise exception 'invalid reply relationship accepted'; end if;
  items:=public.list_comments_for_client(post,null,1,null,null);
  if items#>>'{0,id}' is distinct from root::text or items#>>'{0,body}' is distinct from '  Original root.  '
    or items#>>'{1,id}' is distinct from second::text
    or public.list_comments_for_client(post,null,1,(items#>>'{0,createdAt}')::timestamptz,root)#>>'{0,id}' is distinct from second::text
  then raise exception 'page or original text invalid: %',items; end if;
  execute 'reset role';
  begin
    insert into feed_data.comments(post_id,author_id,parent_id,body,language) values(members,author,root,'Invalid.','en');
    raise exception 'cross-post FK failed open';
  exception when foreign_key_violation then null; end;
  begin
    insert into feed_data.comments(post_id,author_id,parent_id,body,language) values(post,author,reply,'Invalid.','en');
    raise exception 'depth FK failed open';
  exception when foreign_key_violation then null; end;

  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  if public.write_engagement_for_client('edit',root,p_version=>1,p_body=>'Stolen.',p_language=>'en')->>'error' is distinct from '42501'
    or public.write_engagement_for_client('delete',root,p_version=>1)->>'error' is distinct from '42501'
  then raise exception 'cross-user mutation allowed'; end if;
  result:=public.write_engagement_for_client('post_reaction',post,p_kind=>'like');
  if result#>>'{reactions,mine}' is distinct from 'like' or result#>>'{reactions,counts,like}' is distinct from '1' then raise exception 'reaction result invalid: %',result; end if;
  result:=public.write_engagement_for_client('post_reaction',post,p_kind=>'love');
  if result#>>'{reactions,counts,love}' is distinct from '1' or result#>>'{reactions,counts,like}' is distinct from '0' then raise exception 'replace invalid: %',result; end if;
  result:=public.write_engagement_for_client('comment_reaction',root,p_kind=>'celebrate');
  if result#>>'{reactions,counts,celebrate}' is distinct from '1' then raise exception 'comment reaction missing'; end if;
  result:=public.write_engagement_for_client('comment_reaction',root);
  if result#>>'{reactions,counts,celebrate}' is distinct from '0' or result#>>'{reactions,mine}' is not null then raise exception 'remove invalid'; end if;
  perform public.write_engagement_for_client('report',root,p_category=>'other',p_note=>'Private synthetic note.');
  if public.write_engagement_for_client('report',root,p_category=>'spam')->>'error' is distinct from '23505' then raise exception 'duplicate report'; end if;
  begin
    perform public.list_comment_reports_for_client('reports',null,null);
    raise exception 'report privacy failed';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_set(moderator_jwt::jsonb,'{aal}','"aal1"')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.moderate_comment_for_client(root,1,'hide','Synthetic review without MFA.');
    raise exception 'MFA failed open';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',moderator_jwt,true);
  items:=public.list_comment_reports_for_client('reports',null,null);
  if not exists(select 1 from jsonb_array_elements(items) i where i->>'commentId'=root::text and i->>'note'='Private synthetic note.'
    and not i ? 'reporterId') then raise exception 'review projection invalid'; end if;
  perform public.moderate_comment_for_client(root,1,'hide','Synthetic review hides comment.');
  if public.write_engagement_for_client('comment_reaction',root,p_kind=>'like')->>'error' is distinct from 'PFR04'
  then raise exception 'hidden reaction accepted'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  items:=public.list_comments_for_client(post,null,25,null,null);
  if items#>>'{0,available}' is distinct from 'false' or items#>>'{0,body}' is not null or items#>>'{0,author}' is not null
    or items#>>'{0,reactions}' is not null or items#>>'{0,version}' is not null
  then raise exception 'unsafe tombstone: %',items; end if;
  if public.list_comments_for_client(post,root,25,null,null)#>>'{0,id}' is distinct from reply::text
  then raise exception 'visible reply disappeared'; end if;
  begin
    perform public.list_comments_for_client(members,null,25,null,null);
    raise exception 'members-only comments leaked';
  exception when sqlstate 'PFR04' then null; end;
  if public.post_reactions_for_client(array[post,members])->post::text->>'mine' is not null
    or public.post_reactions_for_client(array[post,members]) ? members::text
  then raise exception 'private reaction data leaked'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims',moderator_jwt,true);
  execute 'set local role authenticated';
  perform public.moderate_comment_for_client(root,2,'restore','Synthetic review restores comment.');
  perform set_config('request.jwt.claims',author_jwt,true);
  result:=public.write_engagement_for_client('edit',root,p_version=>3,p_body=>'Edited.',p_language=>'ht');
  if result<>'{}'::jsonb or public.write_engagement_for_client('edit',root,p_version=>3,p_body=>'Stale.',p_language=>'fr')->>'error' is distinct from 'PFR09'
  then raise exception 'version handling invalid: %',result; end if;
  result:=public.write_engagement_for_client('delete',root,p_version=>4);
  if result<>'{}'::jsonb or public.list_comments_for_client(post,null,25,null,null)#>>'{0,available}' is distinct from 'false'
  then raise exception 'deleted root did not become tombstone'; end if;
  perform public.mutate_post_for_client(post,1,true,null,null,null);
  if public.write_engagement_for_client('create',post,p_body=>'Unavailable post.',p_language=>'en',p_submission=>gen_random_uuid())->>'error' is distinct from 'PFR04'
  then raise exception 'deleted post allowed comments'; end if;
  member_root:=(public.write_engagement_for_client('create',members,p_body=>'Eligible root.',p_language=>'en',p_submission=>gen_random_uuid())->>'id')::uuid;
  execute 'reset role';

  if (select count(*) from feed_data.comment_moderation_actions where comment_id=root)<>2
    or (select status from feed_data.comment_reports where comment_id=root and reporter_id=reader)<>'closed'
    or (select total from feed_data.write_limits where actor_id=reader and action='engagement_attempt')<>8
  then raise exception 'audit or failed attempt counter mismatch'; end if;
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  reader_comment:=(public.write_engagement_for_client('create',members,p_body=>'Eligible edit.',p_language=>'en',p_submission=>gen_random_uuid())->>'id')::uuid;
  if reader_comment is null or member_root is null then raise exception 'eligible members-only writes failed'; end if;
  execute 'reset role';
  insert into feed_data.write_limits(actor_id,action,total,window_started)
    select reader,action,total,date_trunc('minute',clock_timestamp())
    from (values('comment_create',12),('comment_edit',24),('reaction',40),('comment_report',5)) q(action,total)
    on conflict(actor_id,action) do update set total=excluded.total,window_started=excluded.window_started;
  execute 'set local role authenticated';
  if public.write_engagement_for_client('create',members,p_body=>'Limited.',p_language=>'en',p_submission=>gen_random_uuid())->>'error' is distinct from 'PFR29'
    or public.write_engagement_for_client('edit',reader_comment,p_version=>1,p_body=>'Limited.',p_language=>'en')->>'error' is distinct from 'PFR29'
    or public.write_engagement_for_client('post_reaction',members,p_kind=>'like')->>'error' is distinct from 'PFR29'
    or public.write_engagement_for_client('report',member_root,p_category=>'spam')->>'error' is distinct from 'PFR29'
  then raise exception 'per-operation limit not enforced'; end if;
  execute 'reset role';
  update feed_data.write_limits set total=100,window_started=date_trunc('minute',clock_timestamp()) where actor_id=reader and action='engagement_attempt';
  execute 'set local role authenticated';
  begin
    perform public.write_engagement_for_client('invalid_operation',members);
    raise exception 'combined attempt limit not enforced';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';
end $$;
