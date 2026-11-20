do $$
declare
  owner uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); supervisor uuid:=gen_random_uuid();
  worker uuid:=gen_random_uuid(); visitor uuid:=gen_random_uuid(); row_actor uuid; session_id uuid; factor_id uuid;
  owner_jwt text; manager_jwt text; supervisor_jwt text; worker_jwt text; visitor_jwt text; role_jwt text;
  project uuid; other uuid; org_project uuid; group_project uuid; org uuid; room uuid; private_room uuid;
  invite uuid; task uuid; opportunity uuid; application uuid; request_key uuid:=gen_random_uuid(); report jsonb;
  owner_name text:='pw_'||left(replace(owner::text,'-',''),14);
  manager_name text:='pw_'||left(replace(manager::text,'-',''),14);
  supervisor_name text:='pw_'||left(replace(supervisor::text,'-',''),14);
  worker_name text:='pw_'||left(replace(worker::text,'-',''),14);
  visitor_name text:='pw_'||left(replace(visitor::text,'-',''),14);
  proposal jsonb:='{"title":"Synthetic work proposal","description":"A synthetic proposal description.","problem":"A synthetic problem statement.","solution":"A synthetic proposed solution.","objectives":"Synthetic objectives stated plainly.","beneficiaries":"Synthetic community beneficiaries.","outcomes":"A synthetic expected outcome.","category":"education","country":"HT","department":null,"startDate":null,"endDate":null,"references":[],"publishRequested":true}';
  task_fields jsonb:='{"title":"Plan a workshop","description":"Prepare a synthetic workshop outline.","priority":"normal","sensitive":false,"dueOn":null}';
begin
  if exists(select 1 from pg_class c cross join unnest(array['anon','authenticated','service_role']) app(name)
    where c.oid in ('private.project_execution'::regclass,'private.project_team'::regclass,'private.project_invitations'::regclass,
      'private.project_opportunities'::regclass,'private.project_applications'::regclass,'private.project_tasks'::regclass,
      'private.project_operations_events'::regclass)
      and (not c.relrowsecurity or has_table_privilege(app.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.project_work_for_client(uuid)','execute')
    or has_function_privilege('anon','public.project_operation_for_client(uuid,text,jsonb)','execute')
    then raise exception 'incorrect work grants'; end if;
  foreach row_actor in array array[owner,manager,supervisor,worker,visitor] loop
    insert into auth.users(id,email,email_confirmed_at) values(row_actor,row_actor::text||'@work-rollback.invalid',now());
    perform public.initialize_member_for_api(row_actor);
    update public.profiles set display_name='Synthetic operator',username='pw_'||left(replace(row_actor::text,'-',''),14),is_visible=true
      where user_id=row_actor;
    insert into public.user_settings(user_id,discoverable) values(row_actor,true) on conflict(user_id) do update set discoverable=true;
    session_id:=gen_random_uuid(); factor_id:=null;
    if row_actor in (owner,manager,supervisor) then
      factor_id:=gen_random_uuid();
      insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
        values(factor_id,row_actor,'totp','verified','rollback-only',now(),now());
      insert into auth.sessions(id,user_id,aal,factor_id) values(session_id,row_actor,'aal2',factor_id);
      role_jwt:=jsonb_build_object('sub',row_actor,'session_id',session_id,'aal','aal2','amr',
        jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
    else
      insert into auth.sessions(id,user_id,aal) values(session_id,row_actor,'aal1');
      role_jwt:=jsonb_build_object('sub',row_actor,'session_id',session_id,'aal','aal1')::text;
    end if;
    case row_actor when owner then owner_jwt:=role_jwt; when manager then manager_jwt:=role_jwt;
      when supervisor then supervisor_jwt:=role_jwt; when worker then worker_jwt:=role_jwt; else visitor_jwt:=role_jwt; end case;
  end loop;
  insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at)
    values(owner,'identity','verified',visitor,now()),(manager,'identity','verified',visitor,now()),(supervisor,'identity','verified',visitor,now());
  perform set_config('request.jwt.claims',owner_jwt,true);
  project:=public.project_create_for_client(gen_random_uuid(),'individual',null,null,proposal);
  other:=public.project_create_for_client(gen_random_uuid(),'individual',null,null,proposal||'{"title":"Separate work proposal"}');
  -- Proposal review is covered by the Phase 6A regression. Only the approved state is seeded here.
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now()
    where id in (project,other);
  update public.verification_records set publication_held_at=now() where user_id=owner;
  begin
    perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":0}');
    raise exception 'unverified owner activated work';
  exception when sqlstate 'PJP22' then null; end;
  update public.verification_records set publication_held_at=null where user_id=owner;
  perform set_config('request.jwt.claims',(owner_jwt::jsonb-'amr')::text,true);
  begin
    perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":0}');
    raise exception 'activation without recent TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":0}');
  perform public.project_operation_for_client(other,'execution_status','{"status":"active","version":0}');
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',request_key,'role','manager','handle',manager_name))->>'id')::uuid;
  if (public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',request_key,'role','manager','handle',manager_name))->>'id')::uuid<>invite
    then raise exception 'invite retry duplicated'; end if;
  perform set_config('request.jwt.claims',visitor_jwt,true);
  begin
    perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
    raise exception 'wrong user accepted invitation';
  exception when sqlstate 'PJB03' then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  report:=public.project_work_for_client(project);
  if report->>'role' is not null or (report->'invites'->0->>'id')::uuid is distinct from invite
    or not exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
      where n->>'kind'='project_operation' and n->'projectOperation'->>'action'='invite' and n->'actor'='null'::jsonb)
    then raise exception 'pending invitation disclosure or notice incorrect'; end if;
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
  begin
    perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
    raise exception 'replayed invitation';
  exception when sqlstate 'PJB09' then null; end;
  begin
    perform public.project_operation_for_client(project,'invite',
      jsonb_build_object('key',gen_random_uuid(),'role','manager','handle',supervisor_name));
    raise exception 'manager could delegate privileged authority';
  exception when insufficient_privilege then null; end;
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','contributor','handle',worker_name))->>'id')::uuid;
  perform set_config('request.jwt.claims',worker_jwt,true);
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));

  perform set_config('request.jwt.claims',owner_jwt,true);
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','supervisor','handle',supervisor_name))->>'id')::uuid;
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
  perform set_config('request.jwt.claims',manager_jwt,true);
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','volunteer','handle',visitor_name))->>'id')::uuid;
  update private.project_invitations set expires_at=clock_timestamp()-interval '1 hour' where id=invite;
  perform set_config('request.jwt.claims',visitor_jwt,true);
  begin
    perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
    raise exception 'expired invitation accepted';
  exception when sqlstate 'PJB02' then null; end;

  perform set_config('request.jwt.claims',manager_jwt,true);
  task:=(public.project_operation_for_client(project,'task_create',task_fields||'{"sensitive":true}')->>'id')::uuid;
  begin
    perform public.project_operation_for_client(project,'task_assign',jsonb_build_object('id',task,'version',1,'userId',worker));
    raise exception 'unverified member received a sensitive assignment';
  exception when sqlstate 'PJB09' then null; end;
  task:=(public.project_operation_for_client(project,'task_create',task_fields)->>'id')::uuid;
  begin
    perform public.project_operation_for_client(project,'task_assign',jsonb_build_object('id',task,'version',1,'userId',visitor));
    raise exception 'non-team member assigned';
  exception when sqlstate 'PJB09' then null; end;
  perform public.project_operation_for_client(project,'task_assign',jsonb_build_object('id',task,'version',1,'userId',worker));
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  begin
    perform public.project_operation_for_client(project,'task_assign',jsonb_build_object('id',task,'version',2,'userId',worker));
    raise exception 'supervisor controlled task outside their scope';
  exception when sqlstate 'PJB05' then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  begin
    perform public.project_operation_for_client(other,'task_cancel',jsonb_build_object('id',task,'version',2,'reason','Cross project'));
    raise exception 'cross-project task reference worked';
  exception when sqlstate 'PJB05' then null; end;
  perform set_config('request.jwt.claims',worker_jwt,true);
  begin
    perform public.project_operation_for_client(project,'task_submit',jsonb_build_object('id',task,'version',2));
    raise exception 'task progressed before consent';
  exception when sqlstate 'PJB09' then null; end;
  perform public.project_operation_for_client(project,'task_accept',jsonb_build_object('id',task,'version',2));
  begin
    perform public.project_operation_for_client(project,'task_submit',jsonb_build_object('id',task,'version',2));
    raise exception 'stale revision accepted';
  exception when sqlstate 'PJB06' then null; end;
  perform public.project_operation_for_client(project,'task_submit',jsonb_build_object('id',task,'version',3));
  begin
    perform public.project_operation_for_client(project,'task_approve',jsonb_build_object('id',task,'version',4,'reason','My own work'));
    raise exception 'assignee approved own work';
  exception when sqlstate 'PJB09' then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_operation_for_client(project,'task_return',jsonb_build_object('id',task,'version',4,'reason','Add another example.'));
  perform set_config('request.jwt.claims',worker_jwt,true);
  perform public.project_operation_for_client(project,'task_submit',jsonb_build_object('id',task,'version',5));
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_operation_for_client(project,'task_approve',jsonb_build_object('id',task,'version',6,'reason','Verified the requested outcome.'));
  if (public.project_work_for_client(project)->>'status')<>'active' then raise exception 'task completion changed project status'; end if;
  opportunity:=(public.project_operation_for_client(project,'opportunity_publish',
    '{"title":"Synthetic volunteer workshop","description":"Help prepare practice workshop materials.","skills":"Writing","commitment":"One hour","remote":true,"capacity":1}') ->>'id')::uuid;
  perform set_config('request.jwt.claims',visitor_jwt,true);
  report:=public.project_work_for_client(project);
  if report->'tasks'<>'[]' or report->'team'<>'[]' or report->'activity'<>'[]' or jsonb_array_length(report->'opportunities')<>1
    then raise exception 'public work projection leaked task or team'; end if;
  application:=(public.project_operation_for_client(project,'volunteer_apply',jsonb_build_object('id',opportunity))->>'id')::uuid;
  if (public.project_operation_for_client(project,'volunteer_apply',jsonb_build_object('id',opportunity))->>'id')::uuid<>application
    then raise exception 'application retry duplicated'; end if;
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_operation_for_client(project,'volunteer_offer',jsonb_build_object('id',application,'reason','Please confirm your participation.'));
  if exists(select 1 from private.project_team where project_id=project and user_id=visitor and revoked_at is null)
    then raise exception 'offer created membership without consent'; end if;
  perform set_config('request.jwt.claims',visitor_jwt,true);
  perform public.project_operation_for_client(project,'volunteer_confirm',jsonb_build_object('id',application));
  if public.project_work_for_client(project)->>'role'<>'volunteer' then raise exception 'volunteer role unavailable'; end if;
  perform public.project_operation_for_client(project,'volunteer_withdraw',jsonb_build_object('id',application));
  if public.project_work_for_client(project)->>'role' is not null then raise exception 'withdrawal retained volunteer authority'; end if;
  insert into feed_data.member_blocks(actor_id,target_id) values(owner,worker);
  perform set_config('request.jwt.claims',worker_jwt,true);
  begin
    perform public.project_work_for_client(project);
    raise exception 'blocked member could read project work';
  exception when sqlstate 'PJP04' then null; end;
  delete from feed_data.member_blocks where actor_id=owner and target_id=worker;
  insert into private.account_restrictions(user_id,status,reason) values(worker,'suspended','Synthetic account restriction');
  begin
    perform public.project_work_for_client(project);
    raise exception 'suspended member could read project work';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  update public.verification_records set status='revoked',verified_at=null where user_id=manager;
  begin
    perform public.project_operation_for_client(project,'task_create',task_fields);
    raise exception 'revoked manager retained privileges';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_operation_for_client(project,'execution_status','{"status":"paused","version":1}');
  begin
    perform public.project_operation_for_client(project,'task_create',task_fields);
    raise exception 'paused project accepted a task';
  exception when sqlstate 'PJB01' then null; end;
  perform public.project_operation_for_client(project,'execution_status','{"status":"completed","version":2}');
  perform public.project_operation_for_client(project,'execution_status','{"status":"archived","version":3}');
  if (select status from private.community_projects where id=project)<>'approved'
    or (select status from private.project_execution where project_id=project)<>'archived'
    or (select count(*) from private.project_operations_events where task_id=task)<6
    then raise exception 'project or task history missing'; end if;

  org:=public.institution_save_for_api(owner,null,jsonb_build_object('handle','work-'||left(replace(owner::text,'-',''),8),
    'name','Synthetic project institution','kind','nonprofit','countryCode','HT'));
  org_project:=public.project_create_for_client(gen_random_uuid(),'organization',org,null,proposal);
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now() where id=org_project;
  begin
    perform public.project_operation_for_client(org_project,'execution_status','{"status":"active","version":0}');
    raise exception 'unverified institution activated operations';
  exception when sqlstate 'PJP04' then null; end;
  insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
    values(owner,org,'organization','approved',now());
  update private.organizations set verification_status='verified' where id=org;
  perform public.project_operation_for_client(org_project,'execution_status','{"status":"active","version":0}');
  perform public.project_operation_for_client(org_project,'task_create',task_fields);
  insert into private.organization_memberships(organization_id,user_id,role) values(org,supervisor,'administrator');
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  report:=public.project_work_for_client(org_project);
  if report->>'role'<>'delegate' or report->'tasks'<>'[]' then raise exception 'organization capability leaked internal tasks'; end if;
  update public.verification_records set status='verified',verified_at=now() where user_id=manager;
  invite:=(public.project_operation_for_client(org_project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','supervisor','handle',manager_name))->>'id')::uuid;
  update private.organization_memberships set revoked_at=clock_timestamp() where organization_id=org and user_id=supervisor;
  begin
    perform public.project_operation_for_client(org_project,'execution_status','{"status":"paused","version":1}');
    raise exception 'revoked institution authorization allowed status transition';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  begin
    perform public.project_operation_for_client(org_project,'invite_accept',jsonb_build_object('id',invite));
    raise exception 'invitation from revoked institution delegate could be accepted';
  exception when sqlstate 'PJB03' then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  select id into room from feed_data.communities where slug='ouest';
  insert into feed_data.community_memberships(community_id,user_id) values(room,owner),(room,supervisor);
  insert into feed_data.community_staff(community_id,user_id,role) values(room,owner,'administrator'),(room,supervisor,'administrator');
  group_project:=public.project_create_for_client(gen_random_uuid(),'community',room,null,proposal);
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now() where id=group_project;
  perform public.project_operation_for_client(group_project,'execution_status','{"status":"active","version":0}');
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  perform public.project_operation_for_client(group_project,'task_create',task_fields);
  delete from feed_data.community_staff where community_id=room and user_id=supervisor;
  begin
    perform public.project_operation_for_client(group_project,'task_create',task_fields);
    raise exception 'former department administrator retained project permissions';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  insert into feed_data.communities(slug,kind,name,description,rules,policy,owner_id)
    values('work-group-'||left(replace(owner::text,'-',''),10),'interest','Synthetic project work group',
      'Synthetic group description.','Synthetic group rules.','private',owner) returning id into private_room;
  insert into feed_data.community_memberships(community_id,user_id) values(private_room,owner);
  group_project:=public.project_create_for_client(gen_random_uuid(),'community',private_room,null,proposal);
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now() where id=group_project;
  perform public.project_operation_for_client(group_project,'execution_status','{"status":"active","version":0}');
  perform public.project_operation_for_client(group_project,'task_create',task_fields);
  perform set_config('request.jwt.claims',visitor_jwt,true);
  begin
    perform public.project_work_for_client(group_project);
    raise exception 'private group leaked project execution to an outsider';
  exception when sqlstate 'PJP04' then null; end;
end;
$$;
