do $$
declare
  owner_id uuid:=gen_random_uuid(); first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid(); newcomer uuid:=gen_random_uuid(); actor uuid; session_key uuid; factor_key uuid;
  owner_claims text; first_claims text; second_claims text; outside_claims text; new_claims text; claims text;
  group_id uuid; personal uuid; ordinary uuid; disputed uuid; selection uuid; org_id uuid; org_poll uuid; moderated uuid;
  project uuid; priority uuid; task uuid; task_poll uuid; decision jsonb; report jsonb;
  first_option uuid; second_option uuid; names jsonb; mark text:=left(replace(owner_id::text,'-',''),12);
  fields jsonb:=jsonb_build_object('title','Synthetic poll question','description','Hosted rollback fixture.',
    'scope','individual','kind','community','policy','advisory','audience','members','eligibility','active',
    'resultPolicy','after_vote','language','en','opensAt',now()+interval '1 hour','closesAt',now()+interval '2 hours',
    'quorum',null,'threshold',null,'scopeId',null,'taskId',null,'options',jsonb_build_array('First option','Second option'));
  config jsonb; updated jsonb;
  project_fields jsonb:='{"title":"Synthetic voting proposal","description":"A synthetic proposal description.","problem":"A synthetic problem statement.","solution":"A synthetic proposed solution.","objectives":"Synthetic objectives stated plainly.","beneficiaries":"Synthetic community beneficiaries.","outcomes":"A synthetic expected outcome.","category":"education","country":"HT","department":null,"startDate":null,"endDate":null,"references":[],"publishRequested":true}';
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join unnest(array['anon','authenticated','service_role']) as role(name)
    where n.nspname='private' and c.relname in ('polls','poll_options','poll_electorate','poll_ballots','poll_events','poll_decisions')
      and (not c.relrowsecurity or has_table_privilege(role.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.poll_detail_for_client(uuid)','execute')
    or has_function_privilege('anon','public.poll_vote_for_client(uuid,uuid)','execute')
    or has_function_privilege('authenticated','private.poll_tally(private.polls,boolean)','execute')
    then raise exception 'poll grants too broad'; end if;
  foreach actor in array array[owner_id,first_id,second_id,outsider,newcomer] loop
    insert into auth.users(id,email,email_confirmed_at) values(actor,actor::text||'@poll-rollback.invalid',now());
    perform public.initialize_member_for_api(actor);
    update public.profiles set display_name='Synthetic voter',username='poll_'||left(replace(actor::text,'-',''),14),is_visible=true
      where user_id=actor;
    insert into public.user_settings(user_id,discoverable) values(actor,true) on conflict(user_id) do update set discoverable=true;
    session_key:=gen_random_uuid();
    if actor in (owner_id,newcomer) then
      factor_key:=gen_random_uuid();
      insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
        values(factor_key,actor,'totp','verified','rollback-only',now(),now());
      insert into auth.sessions(id,user_id,aal,factor_id) values(session_key,actor,'aal2',factor_key);
      claims:=jsonb_build_object('sub',actor,'session_id',session_key,'aal','aal2',
        'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text;
    else
      insert into auth.sessions(id,user_id,aal) values(session_key,actor,'aal1');
      claims:=jsonb_build_object('sub',actor,'session_id',session_key,'aal','aal1')::text;
    end if;
    case actor when owner_id then owner_claims:=claims; when first_id then first_claims:=claims;
      when second_id then second_claims:=claims; when outsider then outside_claims:=claims; else new_claims:=claims; end case;
  end loop;
  insert into public.verification_records(user_id,verification_type,status,reviewed_by,verified_at)
    values(owner_id,'identity','verified',outsider,now()),(first_id,'identity','verified',outsider,now()),
      (second_id,'identity','verified',outsider,now()),(newcomer,'identity','verified',outsider,now());

  perform set_config('request.jwt.claims',owner_claims,true);
  config:=fields||jsonb_build_object('key',gen_random_uuid());
  report:=public.poll_save_for_client(null,config);
  personal:=(report->>'id')::uuid;
  if public.poll_save_for_client(null,config)<>report then raise exception 'creation replay changed'; end if;
  begin
    perform public.poll_save_for_client(null,config||'{"title":"Different question"}');
    raise exception 'mismatched nonce replay accepted';
  exception when sqlstate 'PVG09' then null; end;
  updated:=public.poll_save_for_client(personal,fields||jsonb_build_object('version',(report->>'version')::integer));
  perform public.poll_transition_for_client(personal,'publish',(updated->>'version')::integer,null,null);
  first_option:=(public.poll_detail_for_client(personal)->'options'->0->>'id')::uuid;
  begin
    perform public.poll_vote_for_client(personal,first_option);
    raise exception 'early vote accepted';
  exception when sqlstate 'PVG05' then null; end;
  begin
    perform public.poll_save_for_client(personal,fields||jsonb_build_object('version',(updated->>'version')::integer+1));
    raise exception 'published settings changed';
  exception when sqlstate 'PVG09' then null; end;
  update private.polls set opens_at=now()-interval '5 min' where id=personal;
  perform set_config('request.jwt.claims',outside_claims,true);
  if public.poll_detail_for_client(personal)->'results'<>'null'::jsonb then raise exception 'premature totals'; end if;
  report:=public.poll_vote_for_client(personal,first_option);
  if public.poll_vote_for_client(personal,first_option)<>report then raise exception 'receipt changed on retry'; end if;
  report:=public.poll_detail_for_client(personal);
  if (report->'results'->>'total')::int<>1 or report->>'ownBallot'<>first_option::text
    then raise exception 'own vote/results visibility mismatch'; end if;
  second_option:=(report->'options'->1->>'id')::uuid;
  begin
    perform public.poll_vote_for_client(personal,second_option);
    raise exception 'second ballot accepted';
  exception when sqlstate 'PVG07' then null; end;
  begin
    perform public.poll_transition_for_client(personal,'moderate_cancel',3,'Synthetic moderation reason',null);
    raise exception 'ordinary account moderated poll';
  exception when sqlstate 'PVG04' then null; end;
  perform set_config('request.jwt.claims',first_claims,true);
  if public.poll_detail_for_client(personal)->'ownBallot'<>'null'::jsonb
    or public.poll_detail_for_client(personal)->'results'<>'null'::jsonb then raise exception 'another voter receipt or results leaked'; end if;
  perform public.poll_vote_for_client(personal,second_option);
  update private.polls set closes_at=now()-interval '1 min' where id=personal;
  perform set_config('request.jwt.claims',second_claims,true);
  begin
    perform public.poll_vote_for_client(personal,first_option);
    raise exception 'late vote accepted';
  exception when sqlstate 'PVG06' then null; end;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.poll_transition_for_client(personal,'close',3,null,null);
  report:=public.poll_detail_for_client(personal);
  if report->'results'->>'outcome'<>'tie' or (report->'results'->'options'->0->>'percentage')::numeric<>50
    or report->'results'->>'winnerId' is not null or (report->'events')::text like '%ballot_cast%'
    or (report->'events')::text like '%'||outsider::text||'%' then raise exception 'ties, tally or history privacy failed'; end if;

  report:=public.create_member_group_for_client(gen_random_uuid(),'Poll group '||mark,'poll-'||mark,'diaspora',
    'Synthetic fixture description.','Synthetic fixture rules.','private',false,'CA',null);
  group_id:=(report->>'id')::uuid;
  insert into feed_data.community_memberships(community_id,user_id) values(group_id,first_id),(group_id,second_id);
  config:=fields||jsonb_build_object('scope','community','scopeId',group_id,'audience','scope','key',gen_random_uuid());
  ordinary:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  perform public.poll_transition_for_client(ordinary,'publish',1,null,null);
  update private.polls set opens_at=now()-interval '5 min' where id=ordinary;
  perform set_config('request.jwt.claims',outside_claims,true);
  if jsonb_array_length(public.polls_for_client(false,'community',group_id,null,null))<>0 then raise exception 'private listing leaked'; end if;
  begin
    perform public.poll_detail_for_client(ordinary);
    raise exception 'cross-group detail available';
  exception when sqlstate 'PVG04' then null; end;
  begin
    perform public.poll_vote_for_client(ordinary,first_option);
    raise exception 'cross-group ballot accepted';
  exception when sqlstate 'PVG04' then null; end;
  perform set_config('request.jwt.claims',first_claims,true);
  first_option:=(public.poll_detail_for_client(ordinary)->'options'->0->>'id')::uuid;
  perform public.poll_vote_for_client(ordinary,first_option);
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.poll_transition_for_client(ordinary,'cancel',2,'Synthetic cancellation test',null);
  report:=public.poll_detail_for_client(ordinary);
  if report->>'status'<>'cancelled' or report->'results'<>'null'::jsonb
    or (select count(*) from private.poll_ballots b where b.poll_id=ordinary)<>1 then raise exception 'cancellation lost audit or disclosed totals'; end if;

  config:=config||jsonb_build_object('policy','governance','eligibility','verified','resultPolicy','after_close',
    'quorum',2,'threshold',75,'key',gen_random_uuid());
  perform set_config('request.jwt.claims',(owner_claims::jsonb-'amr')::text,true);
  begin
    perform public.poll_save_for_client(null,config);
    raise exception 'high-trust creation without TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',owner_claims,true);
  disputed:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  perform public.poll_transition_for_client(disputed,'publish',1,null,null);
  update private.polls set opens_at=now()-interval '5 min' where id=disputed;
  insert into feed_data.community_memberships(community_id,user_id) values(group_id,newcomer),(group_id,outsider);
  perform set_config('request.jwt.claims',first_claims,true);
  report:=public.poll_detail_for_client(disputed);
  if (report->>'electorateSize')::int<>3 then raise exception 'snapshot did not freeze'; end if;
  first_option:=(report->'options'->0->>'id')::uuid;
  perform public.poll_vote_for_client(disputed,first_option);
  if public.poll_detail_for_client(disputed)->'results'<>'null'::jsonb then raise exception 'sealed result leaked after ballot'; end if;
  perform set_config('request.jwt.claims',new_claims,true);
  begin
    perform public.poll_vote_for_client(disputed,first_option);
    raise exception 'newcomer entered frozen electorate';
  exception when sqlstate 'PVG08' then null; end;
  delete from feed_data.community_memberships m where m.community_id=group_id and m.user_id=first_id;
  perform set_config('request.jwt.claims',first_claims,true);
  begin
    perform public.poll_detail_for_client(disputed);
    raise exception 'former member still has private access';
  exception when sqlstate 'PVG04' then null; end;
  update private.polls set closes_at=now()-interval '1 min' where id=disputed;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.poll_transition_for_client(disputed,'close',2,null,null);
  if public.poll_detail_for_client(disputed)->'results'->>'outcome'<>'no_quorum' then raise exception 'quorum ignored'; end if;
  begin
    perform public.poll_transition_for_client(disputed,'record_decision',3,'Synthetic unsupported result','recommend');
    raise exception 'inconclusive tally recommended a winner';
  exception when sqlstate 'PVG10' then null; end;
  perform public.poll_transition_for_client(disputed,'record_decision',3,'Synthetic written decision','defer');
  decision:=public.poll_detail_for_client(disputed)->'decision';
  if decision->>'disposition'<>'defer' or decision->>'recommendedOptionId' is not null then raise exception 'decision audit incorrect'; end if;
  begin
    perform public.poll_transition_for_client(disputed,'record_decision',4,'Synthetic attempt to replace decision','decline');
    raise exception 'decision history overwritten';
  exception when sqlstate 'PVG09' then null; end;

  insert into feed_data.community_memberships(community_id,user_id) values(group_id,first_id);
  names:=jsonb_build_array('poll_'||left(replace(first_id::text,'-',''),14),'poll_'||left(replace(second_id::text,'-',''),14));
  config:=config||jsonb_build_object('key',gen_random_uuid(),'kind','person','options',names,'quorum',null);
  selection:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  report:=public.poll_detail_for_client(selection);
  first_option:=(report->'options'->0->>'id')::uuid;
  second_option:=(report->'options'->1->>'id')::uuid;
  if report->'options'->0->>'handle' is not null or report->'options'->0->>'label' is not null then raise exception 'unconsented candidate exposed'; end if;
  begin
    perform public.poll_transition_for_client(selection,'publish',1,null,null);
    raise exception 'published before candidate consent';
  exception when sqlstate 'PVG11' then null; end;
  perform set_config('request.jwt.claims',outside_claims,true);
  if exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n where n->>'kind'='poll_event') then
    raise exception 'nomination notification leaked'; end if;
  perform set_config('request.jwt.claims',first_claims,true);
  if not exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
      where n->>'kind'='poll_event' and n->'pollEvent'->>'action'='nomination_requested' and n->'actor'='null'::jsonb)
    then raise exception 'private nomination notice missing or exposed actor'; end if;
  begin
    perform public.poll_nomination_for_client(selection,second_option,'accepted');
    raise exception 'accepted someone else’s nomination';
  exception when sqlstate 'PVG04' then null; end;
  perform public.poll_nomination_for_client(selection,first_option,'accepted');
  perform set_config('request.jwt.claims',second_claims,true);
  perform public.poll_nomination_for_client(selection,second_option,'accepted');
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.poll_transition_for_client(selection,'publish',1,null,null);
  update private.polls set opens_at=now()-interval '5 min' where id=selection;
  perform public.poll_vote_for_client(selection,first_option);
  perform set_config('request.jwt.claims',first_claims,true);
  perform public.poll_nomination_for_client(selection,first_option,'withdrawn');
  report:=public.poll_detail_for_client(selection);
  if report->'options'->0->>'label' is not null then raise exception 'withdrawn identity visible'; end if;
  begin
    perform public.poll_vote_for_client(selection,first_option);
    raise exception 'withdrawn candidate still selectable';
  exception when sqlstate 'PVG11' then null; end;
  update private.polls set closes_at=now()-interval '1 min' where id=selection;
  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.poll_transition_for_client(selection,'close',2,null,null);
  if public.poll_detail_for_client(selection)->'results'->>'outcome'<>'withdrawn_leads'
    or (select count(*) from feed_data.community_memberships m where m.community_id=group_id)<>5
    then raise exception 'withdrawal tally or separate community membership failed'; end if;

  org_id:=public.institution_save_for_api(owner_id,null,jsonb_build_object('handle','poll-'||mark,
    'name','Synthetic voting institution','kind','nonprofit','countryCode','HT'));
  config:=fields||jsonb_build_object('scope','organization','scopeId',org_id,'audience','scope',
    'eligibility','verified','resultPolicy','after_close','key',gen_random_uuid());
  begin
    perform public.poll_save_for_client(null,config);
    raise exception 'unverified institution created a poll';
  exception when sqlstate 'PVG04' then null; end;
  insert into private.verification_applications(applicant_id,organization_id,kind,status,decided_at)
    values(owner_id,org_id,'organization','approved',now());
  update private.organizations set verification_status='verified' where id=org_id;
  org_poll:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  perform public.poll_transition_for_client(org_poll,'publish',1,null,null);
  perform set_config('request.jwt.claims',first_claims,true);
  begin
    perform public.poll_detail_for_client(org_poll);
    raise exception 'reviewed identity alone accessed organization ballot';
  exception when sqlstate 'PVG04' then null; end;
  perform set_config('request.jwt.claims',owner_claims,true);
  begin
    perform public.poll_save_for_client(null,config||jsonb_build_object('key',gen_random_uuid()));
    raise exception 'daily limit evaded';
  exception when sqlstate 'PFR29' then null; end;
  -- Preserve the production budget while permitting additional rollback cases.
  update private.polls set created_at=now()-interval '2 days'
    where creator_id=owner_id and id in (personal,ordinary,disputed,selection,org_poll);
  delete from feed_data.write_limits w where w.actor_id=owner_id and w.action='poll_manage';
  project:=public.project_create_for_client(gen_random_uuid(),'individual',null,null,project_fields);
  config:=fields||jsonb_build_object('scope','project','scopeId',project,'kind','priority','audience','scope',
    'eligibility','verified','resultPolicy','after_close','key',gen_random_uuid());
  begin
    perform public.poll_save_for_client(null,config);
    raise exception 'unapproved proposal accepted priority poll';
  exception when sqlstate 'PVG03' then null; end;
  update private.community_projects set status='approved',submitted_by=owner_id,submitted_at=now(),approved_at=now()
    where id=project;
  perform public.project_operation_for_client(project,'execution_status','{"status":"active","version":0}');
  priority:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  perform public.poll_transition_for_client(priority,'publish',1,null,null);
  if (public.poll_detail_for_client(priority)->>'proposalRevision')::int<>1 then raise exception 'project poll is not bound to approved revision'; end if;
  task:=(public.project_operation_for_client(project,'task_create',
    '{"title":"Synthetic task","description":"Prepare the synthetic task.","priority":"normal","sensitive":false,"dueOn":null}')->>'id')::uuid;
  config:=config||jsonb_build_object('kind','decision','policy','governance','key',gen_random_uuid(),'taskId',task,'threshold',75);
  task_poll:=(public.poll_save_for_client(null,config)->>'id')::uuid;
  perform public.poll_transition_for_client(task_poll,'publish',1,null,null);
  perform set_config('request.jwt.claims',first_claims,true);
  begin
    perform public.poll_detail_for_client(task_poll);
    raise exception 'project task poll was readable by unrelated member';
  exception when sqlstate 'PVG04' then null; end;
  perform set_config('request.jwt.claims',owner_claims,true);
  first_option:=(public.poll_detail_for_client(task_poll)->'options'->0->>'id')::uuid;
  update private.polls set opens_at=now()-interval '5 min' where id=task_poll;
  perform public.poll_vote_for_client(task_poll,first_option);
  update private.polls set closes_at=now()-interval '1 min' where id=task_poll;
  perform public.poll_transition_for_client(task_poll,'close',2,null,null);
  perform public.poll_transition_for_client(task_poll,'record_decision',3,'Synthetic project recommendation','recommend');
  if (public.poll_detail_for_client(task_poll)->'decision'->>'recommendedOptionId')::uuid is distinct from first_option
    or (select status from private.community_projects where id=project)<>'approved'
    or (select status from private.project_tasks where id=task)<>'todo' then raise exception 'vote changed project or task state'; end if;

  moderated:=(public.poll_save_for_client(null,fields||jsonb_build_object('key',gen_random_uuid()))->>'id')::uuid;
  perform public.poll_transition_for_client(moderated,'publish',1,null,null);
  first_option:=(public.poll_detail_for_client(moderated)->'options'->0->>'id')::uuid;
  update private.polls set opens_at=now()-interval '5 min' where id=moderated;
  insert into private.account_restrictions(user_id,status,reason,changed_by)
    values(first_id,'suspended','Synthetic account restriction',owner_id);
  perform set_config('request.jwt.claims',first_claims,true);
  begin
    perform public.poll_vote_for_client(moderated,first_option);
    raise exception 'restricted account cast a ballot';
  exception when insufficient_privilege then null; end;
  insert into public.role_assignments(user_id,role) values(newcomer,'moderator');
  perform set_config('request.jwt.claims',(new_claims::jsonb-'amr')::text,true);
  begin
    perform public.poll_transition_for_client(moderated,'moderate_cancel',2,'Synthetic moderation reason',null);
    raise exception 'moderator cancelled without recent TOTP';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',new_claims,true);
  begin
    perform public.poll_transition_for_client(org_poll,'moderate_cancel',2,'Synthetic moderation reason',null);
    raise exception 'moderator crossed private organization scope';
  exception when sqlstate 'PVG04' then null; end;
  perform public.poll_transition_for_client(moderated,'moderate_cancel',2,'Synthetic moderation reason',null);
  perform set_config('request.jwt.claims',owner_claims,true);
  if public.poll_detail_for_client(moderated)->>'status'<>'cancelled'
    or not exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
      where n->'pollEvent'->>'pollId'=moderated::text and n->'pollEvent'->>'action'='cancelled')
    then raise exception 'cancelled poll or organizer notice missing'; end if;
end $$;
