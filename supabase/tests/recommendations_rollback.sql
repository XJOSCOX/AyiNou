do $$
declare
  viewer uuid:=gen_random_uuid(); other_viewer uuid:=gen_random_uuid();
  topic_author uuid:=gen_random_uuid(); followed_author uuid:=gen_random_uuid();
  popular_author uuid:=gen_random_uuid(); private_author uuid:=gen_random_uuid(); banned_author uuid:=gen_random_uuid();
  viewer_sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid(); author_sid uuid:=gen_random_uuid();
  viewer_claims text:=jsonb_build_object('sub',viewer,'session_id',viewer_sid,'aal','aal1')::text;
  author_claims text:=jsonb_build_object('sub',topic_author,'session_id',author_sid,'aal','aal1')::text;
  other_claims text:=jsonb_build_object('sub',other_viewer,'session_id',other_sid,'aal','aal1')::text;
  top uuid; followed uuid; popular uuid; hidden uuid; banned uuid; draft uuid; removed uuid;
  r jsonb; page jsonb; state uuid; other_page jsonb;
  fixed timestamptz:=clock_timestamp();
  elapsed interval;
  inputs uuid[];
  nonce uuid:=gen_random_uuid();
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['anon','authenticated','service_role']) u(role)
    where n.nspname='feed_data' and c.relname in ('post_topics','recommendation_feedback','recommendation_versions','recommendation_snapshots')
    and (not c.relrowsecurity or has_table_privilege(u.role,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.read_for_you_for_client(uuid,integer,integer)','execute')
  then raise exception 'unsafe recommendation permissions'; end if;

  inputs:=array[viewer,other_viewer,topic_author,followed_author,popular_author,private_author,banned_author];
  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@recommendation-rollback.invalid',now(),now()-interval '20 days',now() from unnest(inputs) q(id);
  insert into auth.sessions(id,user_id,aal) values(viewer_sid,viewer,'aal1'),(other_sid,other_viewer,'aal1'),(author_sid,topic_author,'aal1');
  perform public.initialize_member_for_api(id) from unnest(inputs) q(id);
  update public.profiles set username='rv_'||left(replace(user_id::text,'-',''),16),
    display_name='Synthetic recommendation member',is_visible=true,preferred_locale='ht' where user_id=any(inputs);
  insert into public.user_settings(user_id,discoverable) select id,id<>private_author from unnest(inputs) q(id)
    on conflict(user_id) do update set discoverable=excluded.discoverable;
  insert into private.account_restrictions(user_id,status,reason) values(banned_author,'suspended','Synthetic recommendation check.');

  perform set_config('request.jwt.claims',author_claims,true);
  execute 'set local role authenticated';
  top:=public.create_post_with_topics_for_client('Synthetic topics match.','ht','members_only',nonce,array['education','culture']);
  if public.create_post_with_topics_for_client('Synthetic topics match.','ht','members_only',nonce,array['culture','education'])<>top
  then raise exception 'topic order changed idempotency'; end if;
  begin
    perform public.create_post_with_topics_for_client('Synthetic topics match.','ht','members_only',nonce,'{}');
    raise exception 'reused submission changed topics';
  exception when sqlstate 'PFR09' then null; end;
  draft:=public.create_post_with_topics_for_client('Synthetic private draft.','ht','private',gen_random_uuid(),array['culture']);
  if public.post_topics_for_client(array[draft])->draft::text is null then raise exception 'author cannot retrieve draft topics'; end if;
  begin
    perform public.edit_post_with_topics_for_client(top,1,'Synthetic invalid topics.','ht','members_only',array['culture','education','peace','employment']);
    raise exception 'too many topics allowed';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(followed_author,'Synthetic followed.','ht','public','published') returning id into followed;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(popular_author,'Synthetic untagged legacy post.','ht','public','published') returning id into popular;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(private_author,'Synthetic undiscoverable.','ht','public','published') returning id into hidden;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(banned_author,'Synthetic restricted.','ht','public','published') returning id into banned;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(topic_author,'Synthetic removed.','ht','public','removed') returning id into removed;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    select topic_author,'Synthetic repetitive post.','ht','public','published' from generate_series(1,4);
  insert into feed_data.member_follows values(viewer,followed_author,clock_timestamp());

  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.post_topics_for_client(array[top,draft])<>'{}'::jsonb then raise exception 'private topic data leaked'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',viewer_claims,true);
  execute 'set local role authenticated';
  r:=public.save_recommendation_topics_for_client(array['education','culture']);
  if r->'topics'<>'["culture","education"]'::jsonb then raise exception 'topics were not persisted: %',r; end if;
  begin
    perform public.edit_post_with_topics_for_client(top,1,'Unauthorized.','ht','members_only',array['peace']);
    raise exception 'cross-account topic edit allowed';
  exception when sqlstate 'PFR04' then null; end;
  page:=public.read_for_you_for_client(null,0,40);
  state:=(page->>'snapshotId')::uuid;
  if page->>'algorithmVersion' is distinct from 'v1'
    or not exists(select 1 from jsonb_array_elements(page->'rows') j where j->>'id'=top::text and j->>'recommendationReason'='topic')
    or not exists(select 1 from jsonb_array_elements(page->'rows') j where j->>'id'=followed::text and j->>'recommendationReason'='follow')
    or not exists(select 1 from jsonb_array_elements(page->'rows') j where j->>'id'=popular::text)
    or exists(select 1 from jsonb_array_elements(page->'rows') j where j->>'id'=any(array[hidden::text,banned::text,draft::text,removed::text]))
    or (select count(*) from jsonb_array_elements(page->'rows') j where j#>>'{author,username}'=
      (select username from public.profiles where user_id=topic_author))>2
  then raise exception 'recommendation eligibility, signals or diversity failed'; end if;
  r:=public.read_for_you_for_client(state,(page#>>'{rows,0,rankPosition}')::integer,40);
  if r#>>'{rows,0,id}' is distinct from page#>>'{rows,1,id}'
    or exists(select 1 from jsonb_array_elements(r->'rows') j where j->>'id'=page#>>'{rows,0,id}')
  then raise exception 'pagination duplicated or reordered an item'; end if;
  perform set_config('request.jwt.claims',other_claims,true);
  begin
    perform public.read_for_you_for_client(state,0,20);
    raise exception 'cross-viewer cursor allowed';
  exception when sqlstate 'PFD30' then null; end;
  other_page:=public.read_for_you_for_client(null,0,40);
  if jsonb_array_length(other_page->'rows')=0 or exists(select 1 from jsonb_array_elements(other_page->'rows') j
      where j->>'recommendationReason' in ('topic','follow'))
  then raise exception 'cold start erroneously personalized or returned no content'; end if;

  perform set_config('request.jwt.claims',viewer_claims,true);
  perform public.recommendation_feedback_for_client(top,'not_interested');
  perform public.recommendation_feedback_for_client(followed,'less_author');
  perform public.recommendation_feedback_for_client(popular,'hide_author');
  r:=public.read_for_you_for_client(state,0,40);
  if exists(select 1 from jsonb_array_elements(r->'rows') j where j->>'id'=any(array[top::text,followed::text,popular::text]))
  then raise exception 'feedback not respected on existing cursor'; end if;
  r:=public.read_for_you_for_client(null,0,40);
  if exists(select 1 from jsonb_array_elements(r->'rows') j where j->>'id'=any(array[top::text,popular::text]))
  then raise exception 'new recommendations ignored feedback'; end if;
  r:=public.clear_recommendation_feedback_for_client();
  if r->>'feedbackCount' is distinct from '0' then raise exception 'feedback clear failed'; end if;
  execute 'reset role';
  update feed_data.posts set status='hidden' where id=followed;
  update public.user_settings set discoverable=false where user_id=popular_author;
  execute 'set local role authenticated';
  r:=public.read_for_you_for_client(state,0,40);
  if exists(select 1 from jsonb_array_elements(r->'rows') j where j->>'id'=any(array[popular::text,followed::text]))
  then raise exception 'snapshot leaked newly ineligible account or post'; end if;
  execute 'reset role';
  update feed_data.recommendation_snapshots set created_at=clock_timestamp()-interval '20 minutes',
    expires_at=clock_timestamp()-interval '1 minute' where id=state;
  execute 'set local role authenticated';
  begin
    perform public.read_for_you_for_client(state,0,20);
    raise exception 'expired snapshot was accepted';
  exception when sqlstate 'PFD30' then null; end;
  execute 'reset role';

  -- Fixed-time rank is deterministic, and newly created reactors add no signal.
  fixed:=clock_timestamp();
  select to_jsonb(array(select p.post_id from feed_data.rank_recommendations(viewer,fixed,v) p)) into page
    from feed_data.recommendation_versions v where version='v1';
  with new_users as (
    insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
      select id,id::text||'@recommendation-reaction-rollback.invalid',now(),now(),now()
      from (select gen_random_uuid() id from generate_series(1,24)) q returning id
  )
  insert into feed_data.post_reactions(post_id,user_id,kind) select top,id,'like' from new_users;
  select to_jsonb(array(select p.post_id from feed_data.rank_recommendations(viewer,fixed,v) p)) into r
    from feed_data.recommendation_versions v where version='v1';
  if page<>r then raise exception 'new account reactions changed ranking'; end if;

  select to_jsonb(array(select p.post_id from feed_data.rank_recommendations(other_viewer,fixed,v) p)) into page
    from feed_data.recommendation_versions v where version='v1';
  insert into feed_data.post_reactions(post_id,user_id,kind) values(top,viewer,'support'),(top,followed_author,'support');
  select to_jsonb(array(select p.post_id from feed_data.rank_recommendations(other_viewer,fixed,v) p)) into r
    from feed_data.recommendation_versions v where version='v1';
  if page<>r then raise exception 'engagement alone changed an unmatched cold-start ranking'; end if;

  update feed_data.write_limits set total=10,window_started=date_trunc('minute',clock_timestamp())
    where actor_id=viewer and action='recommendation_build';
  execute 'set local role authenticated';
  begin
    perform public.read_for_you_for_client(null,0,20);
    raise exception 'snapshot creation quota failed open';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';

  update feed_data.write_limits set total=20,window_started=date_trunc('minute',clock_timestamp())
    where actor_id=viewer and action='recommendation_write';
  execute 'set local role authenticated';
  begin
    perform public.save_recommendation_topics_for_client(array['culture']);
    raise exception 'recommendation write quota failed open';
  exception when sqlstate 'PFR29' then null; end;
  execute 'reset role';

  -- Load fixture stays in the outer rollback and exercises the 420-row cap.
  with sample as (
    insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
      select id,id::text||'@recommendation-load-rollback.invalid',now(),now()-interval '20 days',now()
      from (select gen_random_uuid() id from generate_series(1,150)) q returning id
  )
  select array_agg(id) into inputs from sample;
  perform public.initialize_member_for_api(id) from unnest(inputs) q(id);
  update public.profiles set username='load_'||left(replace(user_id::text,'-',''),16),
    display_name='Synthetic load author',is_visible=true,preferred_locale='ht' where user_id=any(inputs);
  insert into public.user_settings(user_id,discoverable) select id,true from unnest(inputs) q(id)
    on conflict(user_id) do update set discoverable=excluded.discoverable;
  insert into feed_data.posts(author_id,body,language,visibility,status,created_at)
    select id,'Synthetic load post.','ht',case when n%2=0 then 'public' else 'members_only' end,'published',
      clock_timestamp()-make_interval(hours=>n) from unnest(inputs) q(id) cross join generate_series(1,8) n;
  insert into feed_data.post_topics(post_id,slot,topic_code)
    select p.id,1,'culture' from feed_data.posts p where p.author_id=any(inputs);
  insert into feed_data.post_reactions(post_id,user_id,kind)
    select p.id,inputs[n],'support' from feed_data.posts p cross join generate_series(1,6) n where p.author_id=any(inputs);
  insert into public.member_interests(user_id,interest_code) values(other_viewer,'culture');
  perform set_config('request.jwt.claims',other_claims,true);
  execute 'set local role authenticated';
  fixed:=clock_timestamp();
  r:=public.read_for_you_for_client(null,0,20);
  elapsed:=clock_timestamp()-fixed;
  if jsonb_array_length(r->'rows')<>21 or elapsed>interval '6 seconds'
  then raise exception 'bounded recommendation load failed within 6 seconds: %',elapsed; end if;
  execute 'reset role';
end $$;
