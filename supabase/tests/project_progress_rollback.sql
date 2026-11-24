do $$
declare
  owner uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); supervisor uuid:=gen_random_uuid();
  worker uuid:=gen_random_uuid(); visitor uuid:=gen_random_uuid(); row_actor uuid; session_id uuid; factor_id uuid;
  owner_jwt text; manager_jwt text; supervisor_jwt text; worker_jwt text; visitor_jwt text; role_jwt text;
  project uuid; other uuid; org_project uuid; community_project uuid; org uuid; room uuid;
  invite uuid; task uuid; milestone uuid; foreign_milestone uuid; metric uuid; measure uuid; evidence uuid; update_entry uuid; report uuid; correction uuid; response jsonb;
  key uuid:=gen_random_uuid(); payload jsonb; reason text:='Synthetic written review decision.';
  manager_name text:='pw_'||left(replace(manager::text,'-',''),14);
  supervisor_name text:='pw_'||left(replace(supervisor::text,'-',''),14);
  worker_name text:='pw_'||left(replace(worker::text,'-',''),14);
  proposal jsonb:='{"title":"Synthetic progress proposal","description":"A synthetic proposal description.","problem":"A synthetic problem statement.","solution":"A synthetic proposed solution.","objectives":"Synthetic objectives stated plainly.","beneficiaries":"Synthetic community beneficiaries.","outcomes":"A synthetic expected outcome.","category":"education","country":"HT","department":null,"startDate":null,"endDate":null,"references":[],"publishRequested":true}';
  task_fields jsonb:='{"title":"Plan a workshop","description":"Prepare a synthetic workshop outline.","priority":"normal","sensitive":false,"dueOn":null}';
  milestone_fields jsonb:='{"title":"First public workshop","description":"Complete workshop preparation and delivery.","displayOrder":10,"publicRequested":true,"target":2,"unit":"sessions"}';
  content jsonb:='{"title":"Workshop progress notes","description":"Materials are ready for an internal test.","summary":"Progress for the synthetic workshop.","language":"ht","references":["https://example.invalid/workshop"],"includeMetrics":false}';
  report_content jsonb:='{"title":"Final workshop outcome","description":"A synthetic workshop outcome report.","summary":"The project team reported its workshop results.","language":"en","references":[],"includeMetrics":true,"unfinished":"No unfinished work was reported.","challenges":"The schedule needed adjustment.","lessons":"Allow time to review materials."}';
  webp text:=encode(decode('5249464610000000574542505650384c040000002f000000','hex'),'base64');
begin
  if exists(select 1 from pg_class c cross join unnest(array['anon','authenticated','service_role']) app(name)
    where c.oid in ('private.project_milestones'::regclass,'private.project_metrics'::regclass,
      'private.project_metric_observations'::regclass,'private.project_progress_entries'::regclass)
      and (not c.relrowsecurity or has_table_privilege(app.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('authenticated','public.project_progress_image_for_api(uuid,uuid,uuid,integer,text)','execute')
    or has_function_privilege('anon','public.project_progress_entry_for_client(uuid,text,jsonb)','execute')
    then raise exception 'unexpected Phase 6C grants'; end if;
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
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now(),directory_published_at=now()
    where id in (project,other);
  perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":0}');
  perform public.project_operation_for_client(other,'execution_status','{"status":"active","version":0}');
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','manager','handle',manager_name))->>'id')::uuid;
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
  perform set_config('request.jwt.claims',owner_jwt,true);
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','supervisor','handle',supervisor_name))->>'id')::uuid;
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
  perform set_config('request.jwt.claims',manager_jwt,true);
  invite:=(public.project_operation_for_client(project,'invite',
    jsonb_build_object('key',gen_random_uuid(),'role','contributor','handle',worker_name))->>'id')::uuid;
  perform set_config('request.jwt.claims',worker_jwt,true);
  perform public.project_operation_for_client(project,'invite_accept',jsonb_build_object('id',invite));
  perform set_config('request.jwt.claims',owner_jwt,true);

  payload:=milestone_fields||jsonb_build_object('key',key,'responsibleId',supervisor);
  milestone:=(public.project_milestone_for_client(project,'milestone_create',payload)->>'id')::uuid;
  if (public.project_milestone_for_client(project,'milestone_create',payload)->>'id')::uuid<>milestone
    then raise exception 'milestone retry duplicated'; end if;
  foreign_milestone:=(public.project_milestone_for_client(other,'milestone_create',
    milestone_fields||jsonb_build_object('key',gen_random_uuid()))->>'id')::uuid;
  perform public.project_milestone_for_client(project,'milestone_edit',
    milestone_fields||jsonb_build_object('id',milestone,'version',1,'displayOrder',50,'responsibleId',supervisor));
  begin
    perform public.project_milestone_for_client(project,'milestone_edit',
      milestone_fields||jsonb_build_object('id',milestone,'version',1,'displayOrder',55));
    raise exception 'stale reorder accepted';
  exception when sqlstate 'PJC09' then null; end;
  task:=(public.project_operation_for_client(project,'task_create',task_fields)->>'id')::uuid;
  begin
    perform public.project_milestone_for_client(project,'task_milestone',
      jsonb_build_object('id',task,'version',1,'milestoneId',foreign_milestone));
    raise exception 'cross-project link accepted';
  exception when sqlstate 'PJC04' then null; end;
  perform public.project_milestone_for_client(project,'task_milestone',jsonb_build_object('id',task,'version',1,'milestoneId',milestone));
  perform public.project_milestone_for_client(project,'task_milestone',jsonb_build_object('id',task,'version',2,'milestoneId',null));
  if not exists(select 1 from private.project_tasks where id=task and milestone_id is null and version=3)
    then raise exception 'unlink removed task or history'; end if;

  perform set_config('request.jwt.claims',worker_jwt,true);
  begin
    perform public.project_milestone_for_client(project,'milestone_submit',jsonb_build_object('id',milestone,'version',2));
    raise exception 'unassigned contributor submitted milestone';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',supervisor_jwt,true);
  if not exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) x
    where x->'projectOperation'->>'action'='milestone_assigned' and x->'actor'='null'::jsonb)
    then raise exception 'assignment notice missing or excessive'; end if;
  perform public.project_milestone_for_client(project,'milestone_submit',jsonb_build_object('id',milestone,'version',2));
  perform set_config('request.jwt.claims',owner_jwt,true);
  begin
    perform public.project_milestone_for_client(project,'milestone_approve',jsonb_build_object('id',milestone,'version',3,'reason',reason));
    raise exception 'creator approved public milestone';
  exception when sqlstate 'PJC03' then null; end;
  perform set_config('request.jwt.claims',(manager_jwt::jsonb-'amr')::text,true);
  begin
    perform public.project_milestone_for_client(project,'milestone_approve',jsonb_build_object('id',milestone,'version',3,'reason',reason));
    raise exception 'approval without recent TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_milestone_for_client(project,'milestone_approve',jsonb_build_object('id',milestone,'version',3,'reason',reason));

  perform set_config('request.jwt.claims',worker_jwt,true);
  evidence:=(public.project_progress_entry_for_client(project,'entry_create',jsonb_build_object(
    'key',gen_random_uuid(),'kind','evidence','visibility','team','milestoneId',milestone,'content',content))->>'id')::uuid;
  perform public.project_progress_image_for_api(worker,project,evidence,1,webp);
  if public.project_progress_media_for_client(project,evidence) is null then raise exception 'uploader evidence unavailable'; end if;
  perform public.project_progress_entry_for_client(project,'entry_submit',jsonb_build_object('id',evidence,'version',2));
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_progress_media_for_client(project,evidence);
    raise exception 'private evidence leaked publicly';
  exception when sqlstate 'PJC06' then null; end;
  response:=public.project_progress_for_client(project,false);
  if response->'entries'<>'[]' or response->>'taskCount' is not null or response->'history'<>'[]'
    or response->'milestones'->0->>'responsibleId' is not null or response->'milestones'->0->>'version' is not null
    then raise exception 'public boundary leaked private progress'; end if;

  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_approve',jsonb_build_object('id',evidence,'version',3,'reason',reason));
  perform set_config('request.jwt.claims',owner_jwt,true);
  update_entry:=(public.project_progress_entry_for_client(project,'entry_create',jsonb_build_object(
    'key',gen_random_uuid(),'kind','update','visibility','public','milestoneId',milestone,'content',content))->>'id')::uuid;
  perform public.project_progress_image_for_api(owner,project,update_entry,1,webp);
  perform public.project_progress_entry_for_client(project,'entry_submit',jsonb_build_object('id',update_entry,'version',2));
  begin
    perform public.project_progress_entry_for_client(project,'entry_approve',jsonb_build_object('id',update_entry,'version',3,'reason',reason));
    raise exception 'author approved own public update';
  exception when sqlstate 'PJC03' then null; end;
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_return',jsonb_build_object('id',update_entry,'version',3,'reason',reason));
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_edit',jsonb_build_object('id',update_entry,'version',4,
    'content',content||'{"title":"Revised public workshop update"}'));
  perform public.project_progress_entry_for_client(project,'entry_submit',jsonb_build_object('id',update_entry,'version',5));
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_approve',jsonb_build_object('id',update_entry,'version',6,'reason',reason));
  perform set_config('request.jwt.claims','{}',true);
  response:=public.project_progress_for_client(project,false);
  if response->'entries'->0->'content'->>'language'<>'ht' or response->'entries'->0->>'version' is not null
    or public.project_progress_media_for_client(project,update_entry) is null
    then raise exception 'approved update, original language or media unavailable'; end if;

  perform set_config('request.jwt.claims',owner_jwt,true);
  metric:=(public.project_metric_for_client(project,'metric_create','{"name":"Workshops","unit":"sessions","target":3}')->>'id')::uuid;
  begin
    perform public.project_metric_for_client(project,'metric_observe',jsonb_build_object('id',metric,'actual',-1,
      'startsOn','2026-11-01','endsOn','2026-11-10','explanation','Synthetic tally'));
    raise exception 'negative metric accepted';
  exception when sqlstate 'PJC05' then null; end;
  payload:=jsonb_build_object('id',metric,'actual',2,'startsOn','2026-11-01','endsOn','2026-11-10','explanation','Synthetic tally');
  measure:=(public.project_metric_for_client(project,'metric_observe',payload)->>'id')::uuid;
  if (public.project_metric_for_client(project,'metric_observe',payload)->>'id')::uuid<>measure
    then raise exception 'measurement retry duplicated'; end if;
  begin
    perform public.project_metric_for_client(project,'metric_observe',payload||'{"startsOn":"2026-11-05"}');
    raise exception 'overlapping metric accepted';
  exception when sqlstate 'PJC05' then null; end;
  perform public.project_operation_for_client(project,'execution_status','{"status":"paused","version":1}');
  begin
    perform public.project_metric_for_client(project,'metric_create','{"name":"Other workshops","unit":"sessions","target":3}');
    raise exception 'paused project accepted measurement changes';
  exception when sqlstate 'PJB01' then null; end;
  perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":2}');
  begin
    perform public.project_progress_entry_for_client(project,'entry_create',jsonb_build_object(
      'key',gen_random_uuid(),'kind','report','visibility','public','content',report_content));
    raise exception 'report allowed before completion';
  exception when sqlstate 'PJC08' then null; end;
  perform public.project_operation_for_client(project,'execution_status','{"status":"completed","version":3}');
  report:=(public.project_progress_entry_for_client(project,'entry_create',jsonb_build_object(
    'key',gen_random_uuid(),'kind','report','visibility','public','content',report_content))->>'id')::uuid;
  perform public.project_progress_entry_for_client(project,'entry_submit',jsonb_build_object('id',report,'version',1));
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_approve',jsonb_build_object('id',report,'version',2,'reason',reason));
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_operation_for_client(project,'execution_status','{"status":"archived","version":4}');
  correction:=(public.project_progress_entry_for_client(project,'entry_create',jsonb_build_object(
    'key',gen_random_uuid(),'kind','report','visibility','public','supersedesId',report,
    'content',report_content||'{"title":"Corrected outcome","correction":"Clarified the workshop summary."}'))->>'id')::uuid;
  perform public.project_progress_entry_for_client(project,'entry_submit',jsonb_build_object('id',correction,'version',1));
  perform set_config('request.jwt.claims',manager_jwt,true);
  perform public.project_progress_entry_for_client(project,'entry_approve',jsonb_build_object('id',correction,'version',2,'reason',reason));
  perform set_config('request.jwt.claims','{}',true);
  response:=public.project_progress_for_client(project,false);
  if response->>'status'<>'archived' or response->>'completedOn' is null
    or not exists(select 1 from jsonb_array_elements(response->'entries') x where x->>'id'=correction::text
      and x->>'supersedesId'=report::text and x->'snapshot'->'metrics'->0->>'source'='self_reported'
      and x->'snapshot'->'metrics'->0->>'explanation' is null and x->'snapshot'->'milestones'->0->>'id' is null)
    then raise exception 'final outcome or published version history missing'; end if;
  if not exists(select 1 from private.project_operations_events where progress_subject=correction and action='report_published')
    or not exists(select 1 from private.project_operations_events where progress_subject=milestone and action='task_milestone')
    then raise exception 'operation audit missing'; end if;
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_milestone_for_client(project,'milestone_hide',jsonb_build_object('id',milestone,'version',4,'reason',reason));
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_progress_media_for_client(project,update_entry);
    raise exception 'hidden milestone did not hide associated evidence';
  exception when sqlstate 'PJC06' then null; end;

  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.project_operation_for_client(other,'execution_status','{"status":"paused","version":1}');
  perform public.project_operation_for_client(other,'execution_status','{"status":"archived","version":2}');
  response:=public.project_progress_for_client(other,true);
  if response->>'completedOn' is not null then raise exception 'archival misrepresented completion'; end if;

  org:=public.institution_save_for_api(owner,null,jsonb_build_object('handle','progress-'||left(replace(owner::text,'-',''),8),
    'name','Synthetic progress institution','kind','nonprofit','countryCode','HT'));
  org_project:=public.project_create_for_client(gen_random_uuid(),'organization',org,null,proposal);
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now(),directory_published_at=now() where id=org_project;
  insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
    values(owner,org,'organization','approved',now());
  update private.organizations set verification_status='verified' where id=org;
  perform public.project_operation_for_client(org_project,'execution_status','{"status":"active","version":0}');
  perform public.project_milestone_for_client(org_project,'milestone_create',milestone_fields||jsonb_build_object('key',gen_random_uuid()));
  update private.organizations set verification_status='revoked' where id=org;
  begin
    perform public.project_progress_for_client(org_project,true);
    raise exception 'revoked institution could read progress';
  exception when sqlstate 'PJP04' then null; end;

  select id into room from feed_data.communities where slug='ouest';
  insert into feed_data.community_memberships(community_id,user_id) values(room,owner);
  insert into feed_data.community_staff(community_id,user_id,role) values(room,owner,'administrator');
  community_project:=public.project_create_for_client(gen_random_uuid(),'community',room,null,proposal);
  update private.community_projects set status='approved',submitted_by=owner,submitted_at=now(),approved_at=now(),directory_published_at=now() where id=community_project;
  perform public.project_operation_for_client(community_project,'execution_status','{"status":"active","version":0}');
  perform public.project_milestone_for_client(community_project,'milestone_create',milestone_fields||jsonb_build_object('key',gen_random_uuid()));
  delete from feed_data.community_staff where community_id=room and user_id=owner;
  begin
    perform public.project_progress_for_client(community_project,true);
    raise exception 'revoked community authority could read progress';
  exception when sqlstate 'PJP04' then null; end;

  update public.verification_records set status='revoked',verified_at=null where user_id=owner;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.project_progress_for_client(project,false);
    raise exception 'revoked accountable identity left public progress accessible';
  exception when sqlstate 'PJP04' then null; end;
end;
$$;
