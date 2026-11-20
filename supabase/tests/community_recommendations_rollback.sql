do $$
declare
  actor uuid:=gen_random_uuid(); host uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); suspended uuid:=gen_random_uuid();
  a_session uuid:=gen_random_uuid(); o_session uuid:=gen_random_uuid(); s_session uuid:=gen_random_uuid();
  a_jwt text:=jsonb_build_object('sub',actor,'session_id',a_session,'aal','aal1')::text;
  o_jwt text:=jsonb_build_object('sub',other,'session_id',o_session,'aal','aal1')::text;
  s_jwt text:=jsonb_build_object('sub',suspended,'session_id',s_session,'aal','aal1')::text;
  stamp text:=left(replace(actor::text,'-',''),10);
  host_handle text:='rec_'||left(replace(host::text,'-',''),12);
  edu uuid:=gen_random_uuid(); arts uuid:=gen_random_uuid(); diaspora uuid:=gen_random_uuid(); locked uuid:=gen_random_uuid();
  pending uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid(); joined uuid:=gen_random_uuid(); owned uuid:=gen_random_uuid();
  hidden_source uuid:=gen_random_uuid(); hidden_topic uuid:=gen_random_uuid();
  card jsonb; result jsonb; snapshot uuid; before_page jsonb; after_page jsonb; terminal_count integer;
  benchmark_started timestamptz; elapsed interval;
begin
  if (select count(*) from feed_data.communities where kind='department')<>10 then raise exception 'official catalog changed'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,unnest(array['anon','authenticated','service_role']) r(role)
    where n.nspname='feed_data' and c.relkind='r' and c.relname like 'community_recommendation_%'
      and (not c.relrowsecurity or has_table_privilege(r.role,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.read_community_recommendations_for_client(uuid,integer,integer,text,text,text,text)','execute')
  then raise exception 'recommendation grants too broad'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@community-rec-rollback.invalid',now(),now(),now() from unnest(array[actor,host,other,suspended]) u(id);
  perform public.initialize_member_for_api(id) from unnest(array[actor,host,other,suspended]) u(id);
  update public.profiles set display_name='Community recommendation fixture',is_visible=true,
    username='rec_'||left(replace(user_id::text,'-',''),12) where user_id=any(array[actor,host,other,suspended]);
  insert into public.user_settings(user_id,discoverable) values(actor,true),(host,true),(other,true),(suspended,true)
    on conflict(user_id) do update set discoverable=true;
  insert into auth.sessions(id,user_id,aal) values(a_session,actor,'aal1'),(o_session,other,'aal1'),(s_session,suspended,'aal1');
  insert into private.account_restrictions(user_id,status,reason,changed_by) values(suspended,'suspended','Rollback fixture restriction.',host);
  insert into feed_data.communities(id,slug,kind,name,description,rules,policy,public_since,country_code,topic,owner_id)
  values
    (edu,'test-edu-'||stamp,'interest','Education '||stamp,'Visible description.','Fixture rules.','public',null,null,'education',host),
    (arts,'test-arts-'||stamp,'interest','Culture '||stamp,'Visible description.','Fixture rules.','approval',null,null,'culture',host),
    (diaspora,'test-diaspora-'||stamp,'diaspora','Diaspora '||stamp,'Visible description.','Fixture rules.','public',now()-interval '1 day','CA',null,host),
    (locked,'test-private-'||stamp,'interest','Private identifier '||stamp,'Private description.','Fixture rules.','private',null,null,'education',host),
    (pending,'test-pending-'||stamp,'interest','Pending '||stamp,'Visible description.','Fixture rules.','approval',null,null,'healthcare',host),
    (inactive,'test-inactive-'||stamp,'interest','Inactive '||stamp,'Visible description.','Fixture rules.','public',null,null,'education',suspended),
    (joined,'test-joined-'||stamp,'interest','Already joined '||stamp,'Visible description.','Fixture rules.','public',null,null,'culture',host),
    (owned,'test-owned-'||stamp,'interest','Owned '||stamp,'Visible description.','Fixture rules.','public',null,null,'education',actor),
    (hidden_source,'test-private-source-'||stamp,'interest','Private source '||stamp,'Private description.','Fixture rules.','private',null,null,'technology',host),
    (hidden_topic,'test-public-tech-'||stamp,'interest','Technology '||stamp,'Visible description.','Fixture rules.','public',null,null,'technology',host);
  insert into feed_data.community_memberships(community_id,user_id) values(joined,actor),(owned,actor),(hidden_source,actor);
  insert into feed_data.group_requests(community_id,user_id,status) values(pending,actor,'pending');
  insert into public.member_interests(user_id,interest_code) values(actor,'education');
  insert into feed_data.posts(author_id,body,visibility,status,language,community_id)
  values(host,'Public activity fixture.','members_only','published','en',diaspora),
    (host,'Approval-only activity fixture.','members_only','published','ht',arts),
    (host,'Private activity fixture.','members_only','published','es',locked);

  execute 'set local role anon';
  result:=public.member_groups_for_client(null,false,stamp,null,null,null,24);
  if result::text like '%'||locked::text||'%' or result::text like '%'||inactive::text||'%'
    or result::text not like '%'||diaspora::text||'%'
  then raise exception 'public discovery boundary failed'; end if;
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',a_jwt,true);
  result:=public.read_community_recommendations_for_client(null,0,18,null,null,null,stamp);
  snapshot:=(result->>'snapshotId')::uuid;
  if result#>>'{rows,0,community,id}' is distinct from edu::text or result#>>'{rows,0,reason}' is distinct from 'interest'
    or result->>'algorithmVersion'<>'v1' or result::text like '%'||locked::text||'%' or result::text like '%'||inactive::text||'%'
    or result::text like '%'||joined::text||'%' or result::text like '%'||owned::text||'%' or result::text like '%'||pending::text||'%'
  then raise exception 'personalized eligibility or score failed'; end if;
  select x into card from jsonb_array_elements(result->'rows') x where x#>>'{community,id}'=arts::text;
  if card->>'reason' is distinct from 'related_topic' or card->>'recentPublicActivity' is distinct from 'false'
    or card::text like '%Approval-only activity fixture.%'
  then raise exception 'joined-topic signal leaked restricted activity'; end if;
  select x into card from jsonb_array_elements(result->'rows') x where x#>>'{community,id}'=diaspora::text;
  if card->>'recentPublicActivity' is distinct from 'true' then raise exception 'public activity was missed'; end if;
  select x into card from jsonb_array_elements(result->'rows') x where x#>>'{community,id}'=hidden_topic::text;
  if card->>'reason' is distinct from 'explore' then raise exception 'private membership was used as ranking data'; end if;
  if (public.my_group_activity_for_client('pending',stamp,null,20)#>>'{0,id}') is distinct from pending::text
    or (public.my_group_activity_for_client('managed',stamp,null,20)#>>'{0,id}') is distinct from owned::text
    or jsonb_array_length(public.my_group_activity_for_client('joined',stamp,null,20))<>3
  then raise exception 'My Communities used the wrong authority or state'; end if;

  before_page:=public.read_community_recommendations_for_client(snapshot,1,1,null,null,null,stamp);
  after_page:=public.read_community_recommendations_for_client(snapshot,1,1,null,null,null,stamp);
  if before_page is distinct from after_page or before_page#>>'{rows,0,community,id}'=edu::text
  then raise exception 'snapshot order is unstable'; end if;
  perform public.save_community_recommendation_feedback_for_client(diaspora,'hide');
  perform public.save_community_recommendation_feedback_for_client(edu,'not_interested');
  perform public.save_community_recommendation_feedback_for_client(edu,'not_interested');
  result:=public.read_community_recommendations_for_client(snapshot,0,18,null,null,null,stamp);
  if result::text like '%'||edu::text||'%' or result::text like '%'||diaspora::text||'%'
    or public.community_recommendation_settings_for_client()<>jsonb_build_object('hidden',1,'notInterested',1)
  then raise exception 'feedback failed to suppress on a live snapshot'; end if;
  perform public.save_community_recommendation_feedback_for_client(diaspora,'restore');
  perform public.change_department_membership_for_client('test-diaspora-'||stamp,'join',null);
  if public.read_community_recommendations_for_client(snapshot,0,18,null,null,null,stamp)::text like '%'||diaspora::text||'%'
  then raise exception 'joined group still suggested'; end if;
  perform set_config('request.jwt.claims',o_jwt,true);
  begin
    perform public.read_community_recommendations_for_client(snapshot,0,18,null,null,null,stamp);
    raise exception 'another user read a snapshot';
  exception when sqlstate 'PCR30' then null; end;
  if public.community_recommendation_settings_for_client()<>jsonb_build_object('hidden',0,'notInterested',0)
  then raise exception 'another user read feedback'; end if;
  result:=public.read_community_recommendations_for_client(null,0,18,null,null,null,null);
  select count(distinct x#>>'{community,kind}') into terminal_count from jsonb_array_elements(result->'rows') x;
  if terminal_count<>3 then raise exception 'cold start lost category coverage'; end if;
  perform public.save_member_safety_for_client('block',true,host_handle,null);
  result:=public.read_community_recommendations_for_client((result->>'snapshotId')::uuid,0,18,null,null,null,null);
  if result::text like '%'||edu::text||'%' or result::text like '%'||diaspora::text||'%'
  then raise exception 'blocked owner survived snapshot hydration'; end if;
  perform set_config('request.jwt.claims',a_jwt,true);
  perform public.clear_community_recommendation_feedback_for_client();
  if public.community_recommendation_settings_for_client()<>jsonb_build_object('hidden',0,'notInterested',0)
  then raise exception 'reset did not clear only caller feedback'; end if;
  begin
    perform public.read_community_recommendations_for_client(snapshot,0,18,null,null,null,stamp);
    raise exception 'reset left the old snapshot valid';
  exception when sqlstate 'PCR30' then null; end;
  result:=public.read_community_recommendations_for_client(null,0,18,'interest','education',null,stamp);
  if jsonb_array_length(result->'rows')<>1 or result#>>'{rows,0,community,id}' is distinct from edu::text
  then raise exception 'fresh recommendations were not restored or filter failed'; end if;
  snapshot:=(result->>'snapshotId')::uuid;
  execute 'reset role';
  update feed_data.communities set policy='private' where id=edu;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',a_jwt,true);
  result:=public.read_community_recommendations_for_client(snapshot,0,18,'interest','education',null,stamp);
  if result->'rows'<>'[]' then raise exception 'private policy change remained visible in snapshot'; end if;
  begin
    perform public.save_community_recommendation_feedback_for_client(edu,'hide');
    raise exception 'feedback revealed a now-private group';
  exception when sqlstate 'PCM04' then null; end;
  begin
    perform public.read_community_recommendations_for_client(snapshot,1,18,'diaspora',null,'CA',stamp);
    raise exception 'snapshot accepted changed filters';
  exception when sqlstate 'PCR30' then null; end;
  execute 'reset role';
  update feed_data.community_recommendation_snapshots set created_at=now()-interval '12 minutes',expires_at=now()-interval '2 minutes'
    where id=snapshot;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',a_jwt,true);
  begin
    perform public.read_community_recommendations_for_client(snapshot,0,18,'interest','education',null,stamp);
    raise exception 'expired snapshot was accepted';
  exception when sqlstate 'PCR30' then null; end;
  perform set_config('request.jwt.claims',s_jwt,true);
  begin
    perform public.read_community_recommendations_for_client(null,0,18,null,null,null,null);
    raise exception 'suspended account received recommendations';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  insert into feed_data.communities(slug,kind,name,description,rules,policy,topic,owner_id)
    select 'benchmark-'||stamp||'-'||n,'interest','Benchmark '||stamp||' '||n,'Fixture group description.',
      'Fixture group rules.','approval',case when n%2=0 then 'education' else 'culture' end,host
    from generate_series(1,1200) n;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',a_jwt,true);
  benchmark_started:=clock_timestamp();
  result:=public.read_community_recommendations_for_client(null,0,18,null,null,null,null);
  elapsed:=clock_timestamp()-benchmark_started;
  if jsonb_array_length(result->'rows')<>19 or elapsed>interval '3 seconds'
    then raise exception 'bounded 1,200-group benchmark failed: %', elapsed; end if;
  perform set_config('ayinou.test.community_benchmark_ms',round(extract(epoch from elapsed)*1000)::text,true);
end;
$$;
select current_setting('ayinou.test.community_benchmark_ms') as benchmark_ms;
