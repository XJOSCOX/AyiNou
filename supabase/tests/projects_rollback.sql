do $$
declare
  author_id uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); delegate uuid:=gen_random_uuid();
  author_factor uuid:=gen_random_uuid(); reviewer_factor uuid:=gen_random_uuid();
  author_sid uuid:=gen_random_uuid(); reviewer_sid uuid:=gen_random_uuid(); stranger_sid uuid:=gen_random_uuid(); delegate_sid uuid:=gen_random_uuid();
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  author_jwt text:=jsonb_build_object('sub',author_id,'session_id',author_sid,'aal','aal2','amr',amr)::text;
  review_jwt text:=jsonb_build_object('sub',reviewer,'session_id',reviewer_sid,'aal','aal2','amr',amr)::text;
  stranger_jwt text:=jsonb_build_object('sub',stranger,'session_id',stranger_sid,'aal','aal1')::text;
  delegate_jwt text:=jsonb_build_object('sub',delegate,'session_id',delegate_sid,'aal','aal1')::text;
  proposal jsonb:='{"title":"Synthetic project proposal","description":"A synthetic proposal description.","problem":"A synthetic problem statement.","solution":"A synthetic proposed solution.","objectives":"Synthetic objectives stated plainly.","beneficiaries":"Members of the synthetic public community.","outcomes":"A synthetic expected outcome.","category":"education","country":"HT","department":"HT-OU","startDate":null,"endDate":null,"references":["https://example.invalid/public-reference"],"publishRequested":true}';
  note text:='Synthetic written review decision.';
  key uuid:=gen_random_uuid(); project uuid; org_project uuid; group_project uuid; department_project uuid;
  org uuid; group_id uuid; department_id uuid; role_id uuid; affiliation uuid; report uuid; payload jsonb;
  suffix text:=left(replace(author_id::text,'-',''),10);
begin
  if exists(select 1 from pg_class c,unnest(array['anon','authenticated','service_role']) r(name)
    where c.oid in ('private.community_projects'::regclass,'private.project_revisions'::regclass,'private.project_images'::regclass,
      'private.project_events'::regclass,'private.project_reports'::regclass)
      and (not c.relrowsecurity or has_table_privilege(r.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('authenticated','public.project_image_for_api(uuid,uuid,integer,text)','execute')
    or has_function_privilege('anon','public.project_create_for_client(uuid,text,uuid,uuid,jsonb)','execute')
  then raise exception 'project grants too broad'; end if;
  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@project-rollback.invalid',now(),now(),now() from unnest(array[author_id,reviewer,stranger,delegate]) u(id);
  perform public.initialize_member_for_api(id) from unnest(array[author_id,reviewer,stranger,delegate]) u(id);
  update public.profiles set display_name='Synthetic project participant',username='project_'||left(replace(user_id::text,'-',''),12),is_visible=true
    where user_id=any(array[author_id,reviewer,stranger,delegate]);
  insert into public.user_settings(user_id,discoverable) values(author_id,true) on conflict(user_id) do update set discoverable=true;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(author_factor,author_id,'totp','verified','rollback-only',now(),now()),(reviewer_factor,reviewer,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id) values(author_sid,author_id,'aal2',author_factor),(reviewer_sid,reviewer,'aal2',reviewer_factor),
    (stranger_sid,stranger,'aal1',null),(delegate_sid,delegate,'aal1',null);
  insert into public.role_assignments(user_id,role) values(author_id,'moderator'),(reviewer,'moderator');

  perform set_config('request.jwt.claims',author_jwt,true);
  begin
    perform public.project_create_for_client(gen_random_uuid(),'individual',null,null,proposal||'{"objectives":"18.123456, -72.123456"}');
    raise exception 'precise coordinates accepted';
  exception when sqlstate 'PJP03' then null; end;
  project:=public.project_create_for_client(key,'individual',null,null,proposal);
  if public.project_create_for_client(key,'individual',null,null,proposal)<>project then raise exception 'submission lost idempotency'; end if;
  begin
    perform public.project_create_for_client(key,'individual',null,null,proposal||'{"title":"Changed proposal"}');
    raise exception 'reused idempotency key accepted a different request';
  exception when sqlstate 'PJP09' then null; end;
  insert into feed_data.write_limits(actor_id,action,window_started,total)
    values(stranger,'project_create',now(),5);
  perform set_config('request.jwt.claims',stranger_jwt,true);
  begin
    perform public.project_create_for_client(gen_random_uuid(),'individual',null,null,proposal);
    raise exception 'proposal creation exceeded rate limit';
  exception when sqlstate 'PFR29' then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_detail_for_client(project);
    raise exception 'anonymous draft leak';
  exception when sqlstate 'PJP04' then null; end;
  perform set_config('request.jwt.claims',author_jwt,true);
  perform public.project_submit_for_client(project,1);
  begin
    perform public.project_review_for_client(project,2,'assign',note,null);
    raise exception 'owner assigned own review';
  exception when sqlstate 'PJP14' then null; end;
  perform set_config('request.jwt.claims',(review_jwt::jsonb-'amr')::text,true);
  begin
    perform public.project_review_for_client(project,2,'assign',note,null);
    raise exception 'review without recent TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',review_jwt,true);
  if not exists(select 1 from jsonb_array_elements(public.project_queue_for_client(false)) e where e->>'id'=project::text)
    then raise exception 'queue missing submitted case'; end if;
  perform public.project_review_for_client(project,2,'assign',note,null);
  if not (public.project_detail_for_client(project)->>'canDecide')::boolean then raise exception 'assigned case unavailable'; end if;
  perform public.project_review_for_client(project,3,'request_changes',note,null);
  perform set_config('request.jwt.claims',author_jwt,true);
  perform public.project_edit_for_client(project,4,proposal||'{"title":"Synthetic revised project"}',false);
  begin
    perform public.project_edit_for_client(project,4,proposal,false);
    raise exception 'stale update succeeded';
  exception when sqlstate 'PJP09' then null; end;
  perform public.project_submit_for_client(project,5);
  perform set_config('request.jwt.claims',review_jwt,true);
  perform public.project_review_for_client(project,6,'assign',note,null);
  perform public.project_review_for_client(project,7,'approve',note,null);
  perform set_config('request.jwt.claims','{}',true);
  payload:=public.project_detail_for_client(project);
  if payload->>'status'<>'approved' or payload->>'publishedAt' is null or payload->'history'<>'[]'::jsonb or payload->>'version' is not null
    or not exists(select 1 from jsonb_array_elements(public.projects_list_for_client('education','HT','HT-OU',null,null)) e where e->>'id'=project::text)
  then raise exception 'public projection missing or too broad'; end if;

  perform set_config('request.jwt.claims',stranger_jwt,true);
  report:=public.project_report_for_client(project,'fundraising','Synthetic misleading fundraising report.');
  if exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n where n->>'kind' like 'project_%')
    then raise exception 'cross-account notification'; end if;
  perform set_config('request.jwt.claims',review_jwt,true);
  if not exists(select 1 from jsonb_array_elements(public.project_queue_for_client(true)) e
    where e->>'id'=report::text and not (e ? 'reporterId')) then raise exception 'reporter privacy failed'; end if;
  perform public.project_report_decide_for_client(project,report,8,true,note);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_media_for_client(project);
    raise exception 'restricted project media readable';
  exception when sqlstate 'PJP04' then null; end;

  org:=public.institution_save_for_api(author_id,null,jsonb_build_object('handle','project-'||suffix,
    'name','Synthetic project institution','kind','nonprofit','countryCode','HT'));
  insert into private.organization_affiliations(organization_id,user_id,affiliation_type,status,admission,joined_at)
    values(org,delegate,'volunteer','active','self_joined',now()) returning id into affiliation;
  perform set_config('request.jwt.claims',author_jwt,true);
  role_id:=public.organization_role_save_for_client(org,null,null,'Project liaison',null,
    array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
      'projects.propose','projects.edit','projects.submit','projects.view_private'],false);
  perform public.organization_role_assignment_for_client(org,role_id,1,delegate,null);
  perform set_config('request.jwt.claims',stranger_jwt,true);
  begin
    perform public.project_create_for_client(gen_random_uuid(),'organization',org,null,proposal);
    raise exception 'unrelated member proposed for organization';
  exception when sqlstate 'PJP13' then null; end;
  perform set_config('request.jwt.claims',delegate_jwt,true);
  org_project:=public.project_create_for_client(gen_random_uuid(),'organization',org,null,proposal);
  perform public.project_submit_for_client(org_project,1);
  perform public.affiliation_own_action_for_api(delegate,org,true,false);
  begin
    perform public.project_detail_for_client(org_project);
    raise exception 'revoked delegate retained project access';
  exception when sqlstate 'PJP04' then null; end;
  perform set_config('request.jwt.claims',review_jwt,true);
  perform public.project_review_for_client(org_project,2,'assign',note,null);
  begin
    perform public.project_review_for_client(org_project,3,'approve',note,null);
    raise exception 'organization approval bypassed current submitting authority';
  exception when sqlstate 'PJP13' then null; end;
  perform public.project_review_for_client(org_project,3,'reject',note,null);

  insert into feed_data.communities(slug,kind,name,description,rules,policy,owner_id)
    values('project-group-'||suffix,'interest','Synthetic project group '||suffix,'Synthetic group description.','Synthetic group rules.','private',author_id)
    returning id into group_id;
  select id into department_id from feed_data.communities where slug='ouest';
  insert into feed_data.community_memberships(community_id,user_id) values(group_id,author_id),(department_id,author_id);
  insert into feed_data.community_staff(community_id,user_id,role) values(department_id,author_id,'administrator');
  perform set_config('request.jwt.claims',author_jwt,true);
  group_project:=public.project_create_for_client(gen_random_uuid(),'community',group_id,null,proposal);
  department_project:=public.project_create_for_client(gen_random_uuid(),'community',department_id,null,proposal);
  perform public.project_submit_for_client(group_project,1);
  perform public.project_submit_for_client(department_project,1);
  delete from feed_data.community_memberships where community_id=department_id and user_id=author_id;
  perform set_config('request.jwt.claims',review_jwt,true);
  perform public.project_review_for_client(group_project,2,'assign',note,null);
  perform public.project_review_for_client(group_project,3,'approve',note,null);
  perform public.project_review_for_client(department_project,2,'assign',note,null);
  begin
    perform public.project_review_for_client(department_project,3,'approve',note,null);
    raise exception 'community approval bypassed current membership';
  exception when sqlstate 'PJP13' then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_detail_for_client(group_project);
    raise exception 'private group project published';
  exception when sqlstate 'PJP04' then null; end;
  perform set_config('request.jwt.claims',author_jwt,true);
  if public.project_detail_for_client(group_project)->>'publishedAt' is not null
    or not exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
      where n->>'kind'='project_approved' and n->'actor'='null'::jsonb)
  then raise exception 'private project or notices projected incorrectly'; end if;
  insert into private.account_restrictions(user_id,status,reason) values(author_id,'suspended',note);
  begin
    perform public.project_create_for_client(gen_random_uuid(),'individual',null,null,proposal);
    raise exception 'restricted account created proposal';
  exception when insufficient_privilege then null; end;
end;
$$;
