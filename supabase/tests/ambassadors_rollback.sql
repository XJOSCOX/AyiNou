-- The guarded runner wraps these randomized fixtures and all writes in ROLLBACK.
do $$
declare
  candidate uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  operator uuid:=gen_random_uuid(); independent uuid:=gen_random_uuid();
  candidate_session uuid:=gen_random_uuid(); outsider_session uuid:=gen_random_uuid();
  operator_session uuid:=gen_random_uuid(); independent_session uuid:=gen_random_uuid();
  operator_factor uuid:=gen_random_uuid(); independent_factor uuid:=gen_random_uuid();
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  candidate_claims text:=jsonb_build_object('sub',candidate,'session_id',candidate_session,'aal','aal1')::text;
  outsider_claims text:=jsonb_build_object('sub',outsider,'session_id',outsider_session,'aal','aal1')::text;
  operator_claims text:=jsonb_build_object('sub',operator,'session_id',operator_session,'aal','aal2','amr',amr)::text;
  independent_claims text:=jsonb_build_object('sub',independent,'session_id',independent_session,'aal','aal2','amr',amr)::text;
  target_handle text:='amb_'||left(replace(candidate::text,'-',''),12);
  outsider_handle text:='amb_'||left(replace(outsider::text,'-',''),12);
  reason text:='Synthetic private administrator rationale.';
  item uuid; extra uuid; decline_case uuid; checked jsonb;
  sample_post uuid; rank_before uuid[]; rank_after uuid[]; rank_time timestamptz;
begin
  if exists(select 1 from pg_class c,unnest(array['anon','authenticated','service_role']) as role(name)
    where c.oid in ('private.ambassador_cases'::regclass,'private.ambassador_audit'::regclass)
      and (not c.relrowsecurity or has_table_privilege(role.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.ambassador_own_for_client()','execute')
    or has_function_privilege('service_role','public.ambassador_propose_for_client(text,text,text)','execute')
  then raise exception 'ambassador grants too broad'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@ambassador-rollback.invalid',now(),now(),now()
    from unnest(array[candidate,outsider,operator,independent]) u(id);
  perform public.initialize_member_for_api(id) from unnest(array[candidate,outsider,operator,independent]) u(id);
  update public.profiles set is_visible=true,display_name='Ambassador fixture',username='amb_'||left(replace(user_id::text,'-',''),12)
    where user_id=any(array[candidate,outsider,operator,independent]);
  insert into public.user_settings(user_id,discoverable) values(candidate,true),(outsider,true)
    on conflict(user_id) do update set discoverable=true;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(operator_factor,operator,'totp','verified','rollback-only',now(),now()),
      (independent_factor,independent,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(candidate_session,candidate,'aal1',null),(outsider_session,outsider,'aal1',null),
    (operator_session,operator,'aal2',operator_factor),(independent_session,independent,'aal2',independent_factor);
  insert into public.role_assignments(user_id,role) values(operator,'administrator'),(independent,'administrator');
  insert into public.verification_records(user_id,verification_type,status,source,verified_at)
    values(candidate,'identity','verified','first_account_bootstrap',now());

  perform set_config('request.jwt.claims',outsider_claims,true);
  begin
    perform public.ambassador_propose_for_client(target_handle,'community',reason);
    raise exception 'ordinary member proposed an invitation';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',(operator_claims::jsonb-'amr')::text,true);
  begin
    perform public.ambassador_propose_for_client(target_handle,'community',reason);
    raise exception 'administrator bypassed TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',operator_claims,true);
  begin
    perform public.ambassador_propose_for_client('amb_'||left(replace(operator::text,'-',''),12),'community',reason);
    raise exception 'administrator nominated self';
  exception when sqlstate 'PAB04' then null; end;
  item:=public.ambassador_propose_for_client(target_handle,'community',reason);
  checked:=public.ambassador_admin_list_for_client(target_handle,null,null);
  if checked->'candidate'->>'publicEligible' is distinct from 'false' or checked->'cases'->0->'history'->0->>'reason' is distinct from reason
  then raise exception 'candidate or private proposal history incorrect'; end if;
  begin
    perform public.ambassador_propose_for_client(target_handle,'education',reason);
    raise exception 'duplicate open case';
  exception when sqlstate 'PAB09' then null; end;
  perform set_config('request.jwt.claims',candidate_claims,true);
  if public.ambassador_own_for_client()<>'[]'::jsonb then raise exception 'private proposal exposed'; end if;
  perform set_config('request.jwt.claims',operator_claims,true);
  perform public.ambassador_admin_action_for_client(item,1,'invite',reason);
  begin
    perform public.ambassador_admin_action_for_client(item,2,'accept',reason);
    raise exception 'administrator accepted on behalf of recipient';
  exception when sqlstate 'PAB09' then null; end;

  perform set_config('request.jwt.claims',outsider_claims,true);
  if public.ambassador_own_for_client()<>'[]'::jsonb then raise exception 'someone else saw the invitation'; end if;
  begin
    perform public.ambassador_member_action_for_client(item,2,'accept',null,null,null);
    raise exception 'wrong account accepted';
  exception when sqlstate 'PAB04' then null; end;
  if exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n where n->>'kind'='ambassador_invited')
  then raise exception 'cross-account invite notice'; end if;
  perform set_config('request.jwt.claims',candidate_claims,true);
  checked:=public.ambassador_own_for_client();
  if checked->0->>'status' is distinct from 'invited' or checked::text like '%'||reason||'%'
  then raise exception 'private invitation projection incorrect'; end if;
  if (select count(*) from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
      where n->>'kind'='ambassador_invited' and n->'actor'='null'::jsonb)<>1
  then raise exception 'invitation alert leaked an actor or was not sent'; end if;
  insert into private.account_restrictions(user_id,status,reason) values(candidate,'suspended',reason);
  begin
    perform public.ambassador_member_action_for_client(item,2,'accept',null,null,null);
    raise exception 'restricted account accepted invitation';
  exception when insufficient_privilege then null; end;
  delete from private.account_restrictions where user_id=candidate;
  perform public.ambassador_member_action_for_client(item,2,'accept',null,null,null);
  begin
    perform public.ambassador_member_action_for_client(item,2,'accept',null,null,null);
    raise exception 'acceptance replay succeeded';
  exception when sqlstate 'PAB09' then null; end;
  begin
    perform public.ambassador_member_action_for_client(item,3,'publish',true,'Synthetic statement.',null);
    raise exception 'bootstrap trust passed identity requirement';
  exception when sqlstate 'PAB11' then null; end;
  if exists(select 1 from public.role_assignments where user_id=candidate)
    or exists(select 1 from private.verification_reviewers where user_id=candidate)
    or public.feed_moderation_access()
  then raise exception 'ambassador granted extra authority'; end if;

  -- Verification is synthetic input only, inside this rollback. Its decision workflow has separate regression coverage.
  update public.verification_records set source='review',reviewed_by=operator where user_id=candidate and verification_type='identity';
  if public.ambassador_directory_for_client(target_handle,'',null,null,1)<>'[]'::jsonb
  then raise exception 'no explicit public consent'; end if;
  insert into feed_data.posts(author_id,body,language,visibility,status)
    values(candidate,'Synthetic ambassador ranking comparison.','ht','public','published') returning id into sample_post;
  insert into feed_data.member_follows values(outsider,candidate,clock_timestamp());
  rank_time:=clock_timestamp();
  perform set_config('request.jwt.claims',outsider_claims,true);
  select array(select p.post_id from feed_data.rank_recommendations(outsider,rank_time,v) p) into rank_before
    from feed_data.recommendation_versions v where version='v1';
  if not coalesce(sample_post=any(rank_before),false) then raise exception 'ranking fixture missing'; end if;
  perform set_config('request.jwt.claims',candidate_claims,true);
  perform public.ambassador_member_action_for_client(item,3,'publish',true,'Synthetic statement.',null);
  perform public.ambassador_member_action_for_client(item,4,'publish',true,'Synthetic statement.',null);
  perform set_config('request.jwt.claims',outsider_claims,true);
  select array(select p.post_id from feed_data.rank_recommendations(outsider,rank_time,v) p) into rank_after
    from feed_data.recommendation_versions v where version='v1';
  if rank_after is distinct from rank_before then raise exception 'ambassador publication changed recommendation ordering'; end if;
  perform set_config('request.jwt.claims',candidate_claims,true);
  if (select version from private.ambassador_cases where id=item)<>4 then raise exception 'unchanged publication appended an event'; end if;
  checked:=public.ambassador_directory_for_client(target_handle,'ambassador','community',null,1);
  if checked->0->>'statement' is distinct from 'Synthetic statement.' or checked->0 ? 'recipientId' or checked::text like '%'||reason||'%'
  then raise exception 'public projection not consented or leaked private data'; end if;
  insert into feed_data.member_blocks(actor_id,target_id) values(candidate,outsider);
  perform set_config('request.jwt.claims',outsider_claims,true);
  if public.ambassador_directory_for_client(target_handle,'',null,null,1)<>'[]'::jsonb then raise exception 'block ignored'; end if;
  delete from feed_data.member_blocks where actor_id=candidate and target_id=outsider;
  perform set_config('request.jwt.claims','{}',true);
  insert into private.account_restrictions(user_id,status,reason) values(candidate,'suspended',reason);
  if public.ambassador_directory_for_client(target_handle,'',null,null,1)<>'[]'::jsonb then raise exception 'restricted account published'; end if;
  delete from private.account_restrictions where user_id=candidate;
  update public.verification_records set publication_held_at=now() where user_id=candidate;
  if public.ambassador_directory_for_client(target_handle,'',null,null,1)<>'[]'::jsonb then raise exception 'held identity published'; end if;
  update public.verification_records set publication_held_at=null where user_id=candidate;
  perform set_config('request.jwt.claims',candidate_claims,true);
  perform public.ambassador_member_action_for_client(item,4,'publish',false,null,null);
  if public.ambassador_directory_for_client(target_handle,'',null,null,1)<>'[]'::jsonb
  then raise exception 'withdrawn publicity leaked'; end if;

  perform set_config('request.jwt.claims',operator_claims,true);
  perform public.ambassador_admin_action_for_client(item,5,'suspend',reason);
  perform public.ambassador_admin_action_for_client(item,6,'resume',reason);
  if (select public_opt_in from private.ambassador_cases where id=item) then raise exception 'resume restored consent'; end if;
  perform public.ambassador_admin_action_for_client(item,7,'revoke',reason);
  perform set_config('request.jwt.claims',candidate_claims,true);
  perform public.ambassador_member_action_for_client(item,8,'request_review',null,null,'Synthetic reconsideration request.');
  perform set_config('request.jwt.claims',operator_claims,true);
  begin
    perform public.ambassador_admin_action_for_client(item,9,'allow_new_invitation',reason);
    raise exception 'original decision maker reconsidered case';
  exception when sqlstate 'PAB09' then null; end;
  perform set_config('request.jwt.claims',independent_claims,true);
  perform public.ambassador_admin_action_for_client(item,9,'allow_new_invitation',reason);
  if (select status from private.ambassador_cases where id=item)<>'revoked'
    or (select count(*) from private.ambassador_audit where case_id=item)<>10
  then raise exception 'reconsideration changed original state or lost audit'; end if;

  extra:=public.ambassador_propose_for_client(target_handle,'culture',reason);
  perform public.ambassador_admin_action_for_client(extra,1,'invite',reason);
  update private.ambassador_cases set invite_expires_at=clock_timestamp()-interval '1 second' where id=extra;
  perform set_config('request.jwt.claims',candidate_claims,true);
  begin
    perform public.ambassador_member_action_for_client(extra,2,'accept',null,null,null);
    raise exception 'expired invitation accepted';
  exception when sqlstate 'PAB04' then null; end;
  perform set_config('request.jwt.claims',independent_claims,true);
  extra:=public.ambassador_propose_for_client(target_handle,'education',reason);
  perform public.ambassador_admin_action_for_client(extra,1,'invite',reason);
  perform set_config('request.jwt.claims',candidate_claims,true);
  perform public.ambassador_member_action_for_client(extra,2,'accept',null,null,null);
  perform public.ambassador_member_action_for_client(extra,3,'withdraw',null,null,null);
  if (select status from private.ambassador_cases where id=extra)<>'withdrawn' then raise exception 'withdrawal failed'; end if;

  perform set_config('request.jwt.claims',operator_claims,true);
  decline_case:=public.ambassador_propose_for_client(outsider_handle,'service',reason);
  perform public.ambassador_admin_action_for_client(decline_case,1,'invite',reason);
  perform set_config('request.jwt.claims',outsider_claims,true);
  perform public.ambassador_member_action_for_client(decline_case,2,'decline',null,null,null);
  perform set_config('request.jwt.claims',operator_claims,true);
  begin
    perform public.ambassador_propose_for_client(outsider_handle,'community',reason);
    raise exception 'declined member immediately re-invited';
  exception when sqlstate 'PAB09' then null; end;
end;
$$;
