do $$
declare
  applicant uuid:=gen_random_uuid(); first_reviewer uuid:=gen_random_uuid(); second_reviewer uuid:=gen_random_uuid();
  independent uuid:=gen_random_uuid(); operator uuid:=gen_random_uuid(); reporter uuid:=gen_random_uuid(); bootstrap_user uuid:=gen_random_uuid();
  applicant_session uuid:=gen_random_uuid(); first_session uuid:=gen_random_uuid(); independent_session uuid:=gen_random_uuid();
  operator_session uuid:=gen_random_uuid(); reporter_session uuid:=gen_random_uuid();
  first_factor uuid:=gen_random_uuid(); second_factor uuid:=gen_random_uuid(); independent_factor uuid:=gen_random_uuid(); operator_factor uuid:=gen_random_uuid();
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  applicant_claims text:=jsonb_build_object('sub',applicant,'session_id',applicant_session,'aal','aal1')::text;
  first_claims text:=jsonb_build_object('sub',first_reviewer,'session_id',first_session,'aal','aal2','amr',amr)::text;
  independent_claims text:=jsonb_build_object('sub',independent,'session_id',independent_session,'aal','aal2','amr',amr)::text;
  operator_claims text:=jsonb_build_object('sub',operator,'session_id',operator_session,'aal','aal2','amr',amr)::text;
  reporter_claims text:=jsonb_build_object('sub',reporter,'session_id',reporter_session,'aal','aal1')::text;
  applicant_handle text:='trust_'||left(replace(applicant::text,'-',''),12);
  bootstrap_handle text:='trust_'||left(replace(bootstrap_user::text,'-',''),12);
  reviewer_handle text:='trust_'||left(replace(first_reviewer::text,'-',''),12);
  independent_handle text:='trust_'||left(replace(independent::text,'-',''),12);
  item uuid; rejected uuid; appeal uuid; report_id uuid; visible jsonb; decision_status text;
  reason text:='Written private test reasoning.';
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,unnest(array['anon','authenticated','service_role']) role(name)
    where n.nspname='private' and c.relname in ('verification_assignment_audit','verification_appeals','verification_appeal_assignments','impersonation_reports')
    and (not c.relrowsecurity or has_table_privilege(role.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('authenticated','public.personal_verification_for_api(uuid)','execute')
    or has_function_privilege('authenticated','public.verification_decide_for_api(uuid,uuid,text,text,boolean)','execute')
  then raise exception 'trust grants too broad'; end if;
  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@trust-rollback.invalid',now(),now(),now()
    from unnest(array[applicant,first_reviewer,second_reviewer,independent,operator,reporter,bootstrap_user]) u(id);
  perform public.initialize_member_for_api(id)
    from unnest(array[applicant,first_reviewer,second_reviewer,independent,operator,reporter,bootstrap_user]) u(id);
  update public.profiles set is_visible=true,display_name='Trust fixture',username='trust_'||left(replace(user_id::text,'-',''),12)
    where user_id=any(array[applicant,first_reviewer,second_reviewer,independent,operator,reporter,bootstrap_user]);
  insert into public.user_settings(user_id,discoverable) values(applicant,true),(reporter,true),(bootstrap_user,true)
    on conflict(user_id) do update set discoverable=true;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(first_factor,first_reviewer,'totp','verified','synthetic',now(),now()),
    (second_factor,second_reviewer,'totp','verified','synthetic',now(),now()),
    (independent_factor,independent,'totp','verified','synthetic',now(),now()),(operator_factor,operator,'totp','verified','synthetic',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(applicant_session,applicant,'aal1',null),(reporter_session,reporter,'aal1',null),
    (first_session,first_reviewer,'aal2',first_factor),(independent_session,independent,'aal2',independent_factor),
    (operator_session,operator,'aal2',operator_factor);
  insert into private.verification_reviewers(user_id) values(first_reviewer),(second_reviewer),(independent);
  insert into public.role_assignments(user_id,role) values(operator,'administrator');
  insert into public.verification_records(user_id,verification_type,status,source,verified_at)
    values(bootstrap_user,'identity','verified','first_account_bootstrap',now());
  if private.reviewed_personal_claims(bootstrap_user)<>'{}' then raise exception 'bootstrap is a public badge'; end if;

  execute 'set local role anon';
  if public.follow_status_for_client('member',bootstrap_handle)->>'verified' is distinct from 'false'
  then raise exception 'bootstrap reached public profile'; end if;
  execute 'reset role';

  execute 'set local role service_role';
  perform public.verification_submit_for_api(bootstrap_user,null,'identity',array['https://example.invalid/bootstrap-evidence']);
  begin
    perform public.admin_account_action_for_api(operator,bootstrap_user,'grant','administrator',reason);
    raise exception 'bootstrap record qualified for ordinary administrator promotion';
  exception when sqlstate 'PVE01' then null; end;
  item:=public.verification_submit_for_api(applicant,null,'identity',array['https://example.invalid/trust-fixture']);
  begin
    perform public.verification_submit_for_api(applicant,null,'identity',array['https://example.invalid/trust-fixture']);
    raise exception 'duplicate pending application accepted';
  exception when unique_violation then null; end;
  visible:=public.verification_queue_for_api(first_reviewer,'pending');
  if visible::text like '%trust-fixture%' then raise exception 'unassigned reviewer obtained evidence'; end if;
  begin
    perform public.verification_decide_for_api(first_reviewer,item,'approve',reason,true);
    raise exception 'unassigned approval accepted';
  exception when sqlstate 'PVT05' then null; end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',operator_claims,true);
  perform public.assign_verification_reviewer_for_client(item,reviewer_handle,true,reason);
  if public.verification_assignment_queue_for_client()::text like '%trust-fixture%'
    then raise exception 'administrator assignment queue disclosed evidence'; end if;
  execute 'reset role';

  execute 'set local role service_role';
  decision_status:=public.verification_decide_for_api(first_reviewer,item,'approve',reason,true);
  if decision_status is distinct from 'pending'
    or public.personal_verification_for_api(applicant)<>'{}'
  then raise exception 'first review granted a badge'; end if;
  perform public.verification_work_for_api(second_reviewer,item,true);
  decision_status:=public.verification_decide_for_api(second_reviewer,item,'approve',reason,true);
  if decision_status is distinct from 'approved'
    or public.personal_verification_for_api(applicant) is distinct from array['identity']
  then raise exception 'two reviewers did not grant the correct category'; end if;
  rejected:=public.verification_submit_for_api(applicant,null,'notable_person',array['https://example.invalid/public-figure-fixture','https://publisher.invalid/independent-fixture']);
  perform public.verification_work_for_api(first_reviewer,rejected,true);
  perform public.verification_decide_for_api(first_reviewer,rejected,'reject',reason,true);
  if public.verification_own_for_api(applicant)::text not like '%"canAppeal": true%'
  then raise exception 'owner eligibility missing'; end if;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',applicant_claims,true);
  appeal:=public.submit_verification_appeal_for_client(rejected,'Applicant filed written clarification.',array['https://example.invalid/clarification']);
  begin
    perform public.submit_verification_appeal_for_client(rejected,'Applicant filed written clarification.',array['https://example.invalid/clarification']);
    raise exception 'duplicate appeal accepted';
  exception when sqlstate 'PVT09' then null; end;
  begin
    perform public.verification_appeals_queue_for_client('assigned');
    raise exception 'AAL1 reached review queue';
  exception when sqlstate 'PCG05' then null; end;

  perform set_config('request.jwt.claims',operator_claims,true);
  begin
    perform public.assign_verification_appeal_for_client(appeal,reviewer_handle,reason);
    raise exception 'original decision maker assigned appeal';
  exception when sqlstate 'PVT04' then null; end;
  perform public.assign_verification_appeal_for_client(appeal,independent_handle,reason);
  if public.verification_appeals_queue_for_client('assign')::text like '%clarification%'
    then raise exception 'appeal assignment queue disclosed evidence'; end if;
  perform set_config('request.jwt.claims',first_claims,true);
  if public.verification_appeals_queue_for_client('assigned')<>'[]' then raise exception 'original reviewer read appeal'; end if;
  perform set_config('request.jwt.claims',independent_claims,true);
  if public.verification_appeals_queue_for_client('assigned')::text not like '%clarification%'
    then raise exception 'independently assigned appeal missing'; end if;
  perform public.decide_verification_appeal_for_client(appeal,'reconsideration',reason);
  perform set_config('request.jwt.claims',applicant_claims,true);
  if public.my_verification_appeals_for_client()#>>'{0,outcome}' is distinct from 'reconsideration'
    or public.notifications_for_client(20,null,null)::text not like '%verification_appeal_decided%'
    or public.notifications_for_client(20,null,null)::text like '%Written private test reasoning.%'
  then raise exception 'appeal status or notification privacy failed'; end if;

  perform set_config('request.jwt.claims',reporter_claims,true);
  report_id:=public.submit_impersonation_report_for_client(applicant_handle,'profile',null,reason,array['https://example.invalid/report']);
  begin
    perform public.submit_impersonation_report_for_client(applicant_handle,'profile',null,reason,array['https://example.invalid/report']);
    raise exception 'duplicate open report accepted';
  exception when unique_violation then null; end;
  if public.my_verification_appeals_for_client()<>'[]'
    or public.notifications_for_client(20,null,null)::text like '%verification_appeal_decided%'
  then raise exception 'another member accessed appeals'; end if;
  perform set_config('request.jwt.claims',operator_claims,true);
  visible:=public.impersonation_queue_for_client();
  if visible::text not like '%'||report_id::text||'%' or visible::text like '%'||reporter::text||'%' or visible::text like '%reporterId%'
    then raise exception 'reporter privacy failed'; end if;
  perform public.decide_impersonation_report_for_client(report_id,'substantiated',reason,'identity');
  execute 'reset role';
  if private.reviewed_personal_claims(applicant)<>'{}' or not private.institution_actor(applicant)
    or not exists(select 1 from private.verification_applications where id=rejected and status='rejected')
  then raise exception 'dispute suspension or appeal automatically restored a badge'; end if;
  execute 'set local role anon';
  if public.follow_status_for_client('member',applicant_handle)->>'verified' is distinct from 'false'
    then raise exception 'disputed public badge still visible'; end if;
  execute 'reset role';
end;
$$;
