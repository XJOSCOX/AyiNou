do $$
declare
  author uuid:=gen_random_uuid();
  reader uuid:=gen_random_uuid();
  moderator uuid:=gen_random_uuid();
  author_session uuid:=gen_random_uuid();
  reader_session uuid:=gen_random_uuid();
  moderator_session uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid();
  unique_key uuid:=gen_random_uuid();
  shared_post uuid;
  member_post uuid;
  draft uuid;
  publish_later uuid;
  rows jsonb;
  author_jwt text:=jsonb_build_object('sub',author,'session_id',author_session,'aal','aal1')::text;
  reader_jwt text:=jsonb_build_object('sub',reader,'session_id',reader_session,'aal','aal1','app_metadata',jsonb_build_object('role','moderator'))::text;
  moderator_jwt text:=jsonb_build_object('sub',moderator,'session_id',moderator_session,'aal','aal2','amr',
    jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='feed_data' and c.relkind='r' and not c.relrowsecurity)
  or has_table_privilege('authenticated','feed_data.posts','insert,update,delete')
  or has_table_privilege('service_role','feed_data.posts','select,insert,update,delete')
  or has_table_privilege('authenticated','feed_data.content_reports','select')
  or has_table_privilege('authenticated','feed_data.post_moderation_actions','select')
  or has_function_privilege('anon','public.create_post_for_client(text,text,text,uuid)','execute')
  then raise exception 'unsafe feed privileges'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@feed-rollback.invalid',now(),now(),now() from unnest(array[author,reader,moderator]) f(id);
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(factor,moderator,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id) values
    (author_session,author,'aal1',null),(reader_session,reader,'aal1',null),(moderator_session,moderator,'aal2',factor);
  insert into public.role_assignments(user_id,role) values(moderator,'moderator');

  perform set_config('request.jwt.claims',author_jwt,true);
  execute 'set local role authenticated';
  shared_post:=public.create_post_for_client('  Test original text.  ','es','public',unique_key);
  if public.create_post_for_client('  Test original text.  ','es','public',unique_key)<>shared_post then
    raise exception 'idempotent retry changed the post';
  end if;
  begin
    perform public.create_post_for_client('Different text.','es','public',unique_key);
    raise exception 'different body reused the idempotency key';
  exception when sqlstate 'PFR09' then null; end;
  member_post:=public.create_post_for_client('Members only.','ht','members_only',gen_random_uuid());
  draft:=public.create_post_for_client('Private draft.','fr','private',gen_random_uuid());
  rows:=public.read_feed_for_client('mine',20,null,null,null);
  if jsonb_array_length(rows)<>3 or not exists(select 1 from jsonb_array_elements(rows) p where p->>'status'='draft') then
    raise exception 'author does not see own draft';
  end if;
  publish_later:=public.create_post_for_client('Publish after drafting.','es','private',gen_random_uuid());
  rows:=public.read_feed_for_client('mine',1,null,null,publish_later);
  if jsonb_typeof(rows#>'{0,publishedAt}') is distinct from 'null' then raise exception 'draft has a publication time'; end if;
  perform public.mutate_post_for_client(publish_later,1,false,'Publish after drafting.','es','public');
  rows:=public.read_feed_for_client('mine',1,null,null,publish_later);
  if (rows#>>'{0,publishedAt}')::timestamptz <= (rows#>>'{0,createdAt}')::timestamptz
    or rows#>>'{0,publishedAt}' is null then raise exception 'draft publication did not get its own timestamp'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  rows:=public.read_feed_for_client('feed',1,null,null,shared_post);
  if rows#>>'{0,body}' is distinct from '  Test original text.  ' or jsonb_typeof(rows#>'{0,author}')<>'null' then
    raise exception 'public content changed or private author data leaked';
  end if;
  if public.read_feed_for_client('feed',1,null,null,member_post)<>'[]'::jsonb then raise exception 'members-only post leaked'; end if;
  if public.read_feed_for_client('feed',1,null,null,draft)<>'[]'::jsonb then raise exception 'draft leaked'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  if public.read_feed_for_client('feed',1,null,null,member_post)='[]'::jsonb then raise exception 'members-only access missing'; end if;
  if public.read_feed_for_client('feed',1,null,null,draft)<>'[]'::jsonb then raise exception 'draft leaked to member'; end if;
  begin
    perform public.mutate_post_for_client(shared_post,1,true,null,null,null);
    raise exception 'another member deleted the post';
  exception when sqlstate 'PFR04' then null; end;
  perform public.report_post_for_client(shared_post,'spam','Synthetic private report.');
  begin
    perform public.report_post_for_client(shared_post,'spam',null);
    raise exception 'repeat report admitted';
  exception when unique_violation then null; end;
  begin
    perform public.list_feed_reports_for_client('reports',null,null);
    raise exception 'forged moderator role admitted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',author_jwt,true);
  execute 'set local role authenticated';
  perform public.mutate_post_for_client(shared_post,1,false,'Edited public text.','es','public');
  begin
    perform public.mutate_post_for_client(shared_post,1,false,'Stale edit.','es','public');
    raise exception 'stale edit admitted';
  exception when sqlstate 'PFR09' then null; end;
  perform public.mutate_post_for_client(draft,1,true,null,null,null);
  perform public.mutate_post_for_client(draft,1,true,null,null,null);
  if public.read_feed_for_client('mine',1,null,null,draft)<>'[]'::jsonb then raise exception 'deleted draft still visible'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',moderator_jwt,true);
  execute 'set local role authenticated';
  rows:=public.list_feed_reports_for_client('reports',null,null);
  if not exists(select 1 from jsonb_array_elements(rows) r where r->>'postId'=shared_post::text and r->>'note'='Synthetic private report.')
    then raise exception 'authorized review queue missing report'; end if;
  perform public.moderate_post_for_client(shared_post,2,'hide','Synthetic moderation decision.');
  execute 'reset role';
  perform set_config('request.jwt.claims',author_jwt,true);
  execute 'set local role authenticated';
  if public.read_feed_for_client('mine',1,null,null,shared_post)#>>'{0,status}' is distinct from 'hidden' then
    raise exception 'hidden post unavailable to author';
  end if;
  begin
    perform public.mutate_post_for_client(shared_post,3,false,'Override the hide.','es','public');
    raise exception 'moderation override admitted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  if public.read_feed_for_client('feed',1,null,null,shared_post)<>'[]'::jsonb then raise exception 'hidden post leaked'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',moderator_jwt,true);
  execute 'set local role authenticated';
  perform public.moderate_post_for_client(shared_post,3,'restore','Synthetic restoration decision.');
  perform public.moderate_post_for_client(shared_post,4,'remove','Synthetic removal decision.');
  execute 'reset role';
  if (select count(*) from feed_data.post_moderation_actions where post_id=shared_post)<>3 then raise exception 'audit changes lost'; end if;
  if exists(select 1 from feed_data.content_reports where post_id=shared_post and status='pending') then raise exception 'resolved report still pending'; end if;
  if not exists(select 1 from feed_data.posts where id=shared_post and status='removed' and deleted_at is null) then
    raise exception 'moderation removal confused with author deletion';
  end if;
  perform set_config('request.jwt.claims',reader_jwt,true);
  execute 'set local role authenticated';
  for i in 1..8 loop
    perform public.create_post_for_client('Rate check.','en','private',gen_random_uuid());
  end loop;
  begin
    perform public.create_post_for_client('Rate check.','en','private',gen_random_uuid());
    raise exception 'posting quota not enforced';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';
  insert into private.account_restrictions(user_id,status,reason) values(reader,'suspended','Synthetic test suspension.');
  execute 'set local role authenticated';
  begin
    perform public.create_post_for_client('Restricted actor.','en','public',gen_random_uuid());
    raise exception 'restricted account wrote a post';
  exception when insufficient_privilege then null; end;
  if public.read_feed_for_client('feed',1,null,null,member_post)<>'[]'::jsonb then raise exception 'restricted token read members-only data'; end if;
  execute 'reset role';
end;
$$;
