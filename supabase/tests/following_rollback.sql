do $$
declare
  actor uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); hidden uuid:=gen_random_uuid();
  session uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); archived uuid:=gen_random_uuid();
  stamp text:=left(replace(gen_random_uuid()::text,'-',''),9);
  actor_name text:='a_'||stamp; member_name text:='b_'||stamp; hidden_name text:='h_'||stamp;
  org_handle text:='institution-'||stamp;
  actor_token text:=jsonb_build_object('sub',actor,'session_id',session,'aal','aal1')::text;
  shared uuid; member_only uuid; removed uuid;
  rows jsonb; state jsonb;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['anon','authenticated','service_role']) r(role)
    where n.nspname='feed_data' and c.relname in ('member_follows','institution_follows')
    and (not c.relrowsecurity or has_table_privilege(r.role,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.write_follow_for_client(text,text,boolean)','execute')
    or has_function_privilege('anon','public.follow_list_for_client(text,text,text,integer)','execute')
  then raise exception 'unsafe following grants'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@discovery-rollback.invalid',now(),now(),now() from unnest(array[actor,member,hidden]) f(id);
  perform public.initialize_member_for_api(actor);
  perform public.initialize_member_for_api(member);
  perform public.initialize_member_for_api(hidden);
  update public.profiles set is_visible=true,display_name='Synthetic '||stamp,username=actor_name where user_id=actor;
  update public.profiles set is_visible=true,display_name='Synthetic '||stamp,username=member_name where user_id=member;
  update public.profiles set is_visible=true,display_name='Synthetic '||stamp,username=hidden_name where user_id=hidden;
  insert into public.user_settings(user_id,discoverable) values(actor,true),(member,true)
    on conflict(user_id) do update set discoverable=excluded.discoverable;
  insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at)
    values(member,'identity','verified',actor,now());
  insert into private.organizations(id,name,handle,kind,country_code,department_code,status,verification_status) values
    (org,'Synthetic institution '||stamp,org_handle,'education','HT','HT-OU','active','verified'),
    (archived,'Archived institution '||stamp,'archived-'||stamp,'media','HT',null,'archived','unverified');
  insert into auth.sessions(id,user_id,aal) values(session,actor,'aal1');
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(member,'Synthetic public post.','ht','public','published') returning id into shared;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(member,'Synthetic member post.','es','members_only','published') returning id into member_only;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(member,'Synthetic removed post.','fr','public','removed') returning id into removed;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(member,'Synthetic private draft.','fr','private','draft'),(hidden,'Synthetic unknown post.','fr','public','published');

  perform set_config('request.jwt.claims',actor_token,true);
  execute 'set local role authenticated';
  if public.read_following_feed_for_client(20,null,null)<>'[]'::jsonb then raise exception 'empty following feed has posts'; end if;
  rows:=public.search_discovery_for_client('people','Synthetic '||stamp,false,null,null,null,null,1);
  if jsonb_array_length(rows)<>2 or rows#>>'{0,handle}' is distinct from actor_name or rows#>>'{1,handle}' is distinct from member_name
  then raise exception 'unexpected search projection: %',rows; end if;
  rows:=public.search_discovery_for_client('people','Synthetic '||stamp,true,null,null,null,actor_name,1);
  if jsonb_array_length(rows)<>1 or rows#>>'{0,verified}' is distinct from 'true'
    or rows#>>'{0,handle}' is distinct from member_name
    or jsonb_path_exists(rows,'$[*].user_id') then raise exception 'verified search or profile privacy failed'; end if;
  if public.search_discovery_for_client('people',hidden_name,false,null,null,null,null,20)<>'[]'::jsonb
    or public.search_discovery_for_client('people','%_',false,null,null,null,null,20)<>'[]'::jsonb
  then raise exception 'hidden member or wildcard search leaked'; end if;
  rows:=public.search_discovery_for_client('institutions',org_handle,true,'education','HT','HT-OU',null,20);
  if rows#>>'{0,targetId}' is distinct from org::text or rows#>>'{0,verificationStatus}' is distinct from 'verified'
    or jsonb_path_exists(rows,'$[*].contactEmail') then raise exception 'institution filter or projection failed'; end if;
  if public.write_follow_for_client('member',actor_name,true)->>'error' is distinct from '42501'
    or public.write_follow_for_client('member',hidden_name,true)->>'error' is distinct from 'PFR04'
    or public.write_follow_for_client('institution',archived::text,true)->>'error' is distinct from 'PFR04'
  then raise exception 'ineligible write allowed'; end if;
  state:=public.write_follow_for_client('member',member_name,true);
  if state->>'following' is distinct from 'true' or state->>'followerCount' is distinct from '1'
    or public.write_follow_for_client('member',member_name,true)->>'followerCount' is distinct from '1'
  then raise exception 'idempotent member follow/count failed: %',state; end if;
  state:=public.write_follow_for_client('institution',org::text,true);
  if state->>'following' is distinct from 'true' or state->>'followerCount' is distinct from '1'
  then raise exception 'institution follow failed'; end if;
  rows:=public.follow_list_for_client('mine',null,null,1);
  if rows#>>'{0,id}' is distinct from 'institution:'||org_handle
    or public.follow_list_for_client('mine',null,rows#>>'{0,id}',1)#>>'{0,handle}' is distinct from member_name
    or public.follow_list_for_client('followers',member_name,null,20)#>>'{0,handle}' is distinct from actor_name
    or public.follow_list_for_client('institution_followers',org::text,null,20)#>>'{0,handle}' is distinct from actor_name
  then raise exception 'list paging or ownership failed'; end if;
  if public.follow_status_for_client('member',actor_name)->>'followingCount' is distinct from '2'
    or exists(select 1 from jsonb_array_elements(public.discovery_suggestions_for_client()) card where card->>'handle' in (member_name,hidden_name,actor_name,org_handle))
  then raise exception 'following counts or suggestion eligibility failed'; end if;
  rows:=public.read_following_feed_for_client(1,null,null);
  if jsonb_array_length(rows)<>2 or rows#>>'{0,id}' is distinct from member_only::text or rows#>>'{1,id}' is distinct from shared::text
    or public.read_following_feed_for_client(1,(rows#>>'{0,createdAt}')::timestamptz,member_only)#>>'{0,id}' is distinct from shared::text
  then raise exception 'following chronology and visibility failed: %',rows; end if;

  execute 'reset role';
  if exists(select 1 from private.organization_memberships where organization_id=org and user_id=actor)
    or exists(select 1 from private.organization_affiliations where organization_id=org and user_id=actor)
  then raise exception 'follow gave institution access'; end if;
  update public.user_settings set discoverable=false where user_id=actor;
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.follow_status_for_client('member',member_name)->>'followerCount' is distinct from '0'
    or public.follow_status_for_client('institution',org::text)->>'followerCount' is distinct from '0'
  then raise exception 'hidden follower leaked through counts'; end if;
  execute 'reset role';
  update public.user_settings set discoverable=false where user_id=member;
  perform set_config('request.jwt.claims',actor_token,true);
  execute 'set local role authenticated';
  if public.read_following_feed_for_client(20,null,null)<>'[]'::jsonb
    or jsonb_array_length(public.follow_list_for_client('mine',null,null,20))<>1
  then raise exception 'hidden target leaked'; end if;
  execute 'reset role';
  update public.user_settings set discoverable=true where user_id=member;
  update private.organizations set verification_status='revoked' where id=org;
  execute 'set local role authenticated';
  if jsonb_array_length(public.follow_list_for_client('mine',null,null,20))<>1
    or public.read_following_feed_for_client(1,null,null)#>>'{0,id}' is distinct from member_only::text
  then raise exception 'dormant follow did not reappear or an ineligible institution leaked'; end if;
  state:=public.write_follow_for_client('member',member_name,false);
  if state->>'following' is distinct from 'false' then raise exception 'unfollow failed: %',state; end if;
  state:=public.write_follow_for_client('member',member_name,false);
  rows:=public.read_following_feed_for_client(1,null,null);
  if state->>'following' is distinct from 'false' or rows<>'[]'::jsonb
  then raise exception 'idempotent unfollow failed: %, %',state,rows; end if;
  execute 'reset role';
  update feed_data.write_limits set total=20,window_started=date_trunc('minute',clock_timestamp()) where actor_id=actor and action='follow_write';
  execute 'set local role authenticated';
  begin
    perform public.write_follow_for_client('member',member_name,true);
    raise exception 'follow limit failed open';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';
  insert into private.account_restrictions(user_id,status,reason) values(member,'suspended','Synthetic discovery target check.');
  execute 'set local role service_role';
  if exists(select 1 from public.find_public_profile_for_api(member_name))
  then raise exception 'suspended account leaked from the public profile endpoint'; end if;
  execute 'reset role';
  update feed_data.write_limits set total=90,window_started=date_trunc('minute',clock_timestamp()) where actor_id=actor and action='discovery_search';
  execute 'set local role authenticated';
  begin
    perform public.search_discovery_for_client('people',member_name,false,null,null,null,null,20);
    raise exception 'SQL search limit failed open';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';
  insert into private.account_restrictions(user_id,status,reason) values(actor,'suspended','Synthetic rollback-only check.');
  execute 'set local role authenticated';
  begin
    perform public.read_following_feed_for_client(1,null,null);
    raise exception 'suspended viewer admitted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
