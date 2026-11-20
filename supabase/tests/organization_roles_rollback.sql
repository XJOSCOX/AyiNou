do $$
declare
  owner_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid();
  other_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid();
  owner_factor uuid:=gen_random_uuid(); manager_factor uuid:=gen_random_uuid();
  owner_session uuid:=gen_random_uuid(); manager_session uuid:=gen_random_uuid();
  member_session uuid:=gen_random_uuid(); outsider_session uuid:=gen_random_uuid();
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  owner_claims text:=jsonb_build_object('sub',owner_id,'session_id',owner_session,'aal','aal2','amr',amr)::text;
  manager_claims text:=jsonb_build_object('sub',manager_id,'session_id',manager_session,'aal','aal2','amr',amr)::text;
  member_claims text:=jsonb_build_object('sub',member_id,'session_id',member_session,'aal','aal1')::text;
  outsider_claims text:=jsonb_build_object('sub',outsider_id,'session_id',outsider_session,'aal','aal1')::text;
  outsider_name text:='orgrole_'||left(replace(outsider_id::text,'-',''),10);
  handle text:='orgrole-'||left(replace(owner_id::text,'-',''),10);
  org uuid; other_org uuid; editor_grant uuid; dispatcher uuid; writer uuid; roster uuid; reviewer uuid;
  member_write uuid; member_view uuid; invitation uuid; checked jsonb; target_id uuid;
begin
  if exists(select 1 from pg_class c,unnest(array['anon','authenticated','service_role']) r(name)
    where c.oid in ('private.organization_custom_roles'::regclass,'private.organization_custom_assignments'::regclass,
      'private.organization_role_audit'::regclass)
      and (not c.relrowsecurity or has_table_privilege(r.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.organization_roles_for_client(uuid,text)','execute')
    or has_function_privilege('service_role','public.organization_role_assignment_for_client(uuid,uuid,integer,uuid,uuid)','execute')
  then raise exception 'role grants too broad'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@organization-role-rollback.invalid',now(),now(),now()
    from unnest(array[owner_id,manager_id,member_id,other_id,outsider_id,editor_id]) u(id);
  perform public.initialize_member_for_api(id) from unnest(array[owner_id,manager_id,member_id,other_id,outsider_id,editor_id]) u(id);
  update public.profiles set display_name='Synthetic team member',username='orgrole_'||left(replace(user_id::text,'-',''),10)
    where user_id=any(array[owner_id,manager_id,member_id,other_id,outsider_id,editor_id]);
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(owner_factor,owner_id,'totp','verified','rollback-only',now(),now()),
      (manager_factor,manager_id,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(owner_session,owner_id,'aal2',owner_factor),(manager_session,manager_id,'aal2',manager_factor),
      (member_session,member_id,'aal1',null),(outsider_session,outsider_id,'aal1',null);

  org:=public.institution_save_for_api(owner_id,null,jsonb_build_object('handle',handle,'name','Synthetic roles','kind','nonprofit',
    'countryCode','HT','contactEmail','private@example.invalid'));
  other_org:=public.institution_save_for_api(owner_id,null,jsonb_build_object('handle',handle||'-other','name','Other synthetic','kind','nonprofit','countryCode','HT'));
  insert into private.organization_affiliations(organization_id,user_id,affiliation_type,status,admission,joined_at)
    values(org,manager_id,'member','active','self_joined',now()),(org,member_id,'volunteer','active','self_joined',now()),
      (other_org,other_id,'member','active','self_joined',now());
  insert into private.organization_memberships(organization_id,user_id,role,granted_by,expires_at)
    values(org,editor_id,'editor',owner_id,now()+interval '5 days') returning id into editor_grant;

  perform set_config('request.jwt.claims',(owner_claims::jsonb-'amr')::text,true);
  begin
    perform public.organization_role_save_for_client(org,null,null,'Coordinator',null,array['content.edit'],false);
    raise exception 'missing TOTP accepted';
  exception when sqlstate 'PCG05' then null; end;
  perform set_config('request.jwt.claims',owner_claims,true);
  writer:=public.organization_role_save_for_client(org,null,null,'Communications Officer',null,array['content.edit'],false);
  roster:=public.organization_role_save_for_client(org,null,null,'Supervisor',null,array['team.view'],false);
  reviewer:=public.organization_role_save_for_client(org,null,null,'Intake',null,array['affiliations.review'],false);
  dispatcher:=public.organization_role_save_for_client(org,null,null,'Lead coordinator',null,
    array['roles.assign','content.edit','affiliations.invite','affiliations.manage'],false);
  begin
    perform public.organization_role_save_for_client(org,null,null,'communications officer',null,array['content.edit'],false);
    raise exception 'case-insensitive duplicate allowed';
  exception when sqlstate 'POR12' then null; end;
  begin
    perform public.organization_role_save_for_client(org,null,null,'Finance',null,array['finance.reports'],false);
    raise exception 'future permission accepted';
  exception when sqlstate 'POR11' then null; end;
  perform public.organization_role_assignment_for_client(org,dispatcher,1,manager_id,null);
  perform public.organization_role_assignment_for_client(org,reviewer,1,manager_id,null);
  member_view:=public.organization_role_assignment_for_client(org,roster,1,member_id,null);
  perform public.organization_role_assignment_for_client(org,roster,1,editor_id,null);
  begin
    perform public.organization_role_assignment_for_client(org,roster,1,other_id,null);
    raise exception 'cross-organization assignment allowed';
  exception when sqlstate 'POR14' then null; end;
  begin
    perform public.organization_role_assignment_for_client(other_org,roster,1,other_id,null);
    raise exception 'cross-organization role allowed';
  exception when sqlstate 'POR04' then null; end;

  perform set_config('request.jwt.claims',manager_claims,true);
  checked:=public.organization_roles_for_client(org,null);
  if checked->'team'<>'[]'::jsonb or checked->'activity'<>'[]'::jsonb then raise exception 'delegated lookup leaked team'; end if;
  target_id:=(public.organization_roles_for_client(org,(select username from public.profiles where user_id=member_id))->'team'->0->>'id')::uuid;
  if target_id is distinct from member_id then raise exception 'authorized exact lookup failed'; end if;
  begin
    perform public.organization_role_save_for_client(org,writer,1,'Overreach',null,array['content.edit','team.view'],false);
    raise exception 'delegate edited a role definition';
  exception when insufficient_privilege then null; end;
  begin
    perform public.organization_role_assignment_for_client(org,roster,1,member_id,null);
    raise exception 'delegate granted unavailable permission';
  exception when sqlstate 'POR13' then null; end;
  begin
    perform public.organization_role_assignment_for_client(org,dispatcher,1,member_id,null);
    raise exception 'delegate created another delegation manager';
  exception when sqlstate 'POR13' then null; end;
  begin
    perform public.organization_role_assignment_for_client(org,writer,1,manager_id,null);
    raise exception 'self grant allowed';
  exception when sqlstate 'POR13' then null; end;
  begin
    perform public.organization_role_assignment_for_client(org,writer,1,owner_id,null);
    raise exception 'owner grant modified';
  exception when sqlstate 'POR13' then null; end;
  member_write:=public.organization_role_assignment_for_client(org,writer,1,member_id,null);

  begin
    perform public.affiliation_invite_for_api(manager_id,org,outsider_name,'staff');
    raise exception 'delegate invited protected staff';
  exception when insufficient_privilege then null; end;
  invitation:=public.affiliation_invite_for_api(manager_id,org,outsider_name,'volunteer');
  begin
    perform public.affiliation_resolve_invite_for_api(member_id,invitation,true);
    raise exception 'invitation accepted across recipients';
  exception when insufficient_privilege then null; end;
  perform public.affiliation_resolve_invite_for_api(outsider_id,invitation,true);
  perform public.affiliation_member_action_for_api(manager_id,org,(select id from private.organization_affiliations
    where organization_id=org and user_id=outsider_id),'change_type','supporter');
  perform public.affiliation_policy_for_api(owner_id,org,'approval_required',false);
  if public.affiliation_join_for_api(other_id,org,'supporter','Synthetic membership request.')<>'pending' then
    raise exception 'membership fixture was not pending';
  end if;
  perform public.affiliation_decide_for_api(manager_id,org,(select id from private.organization_join_requests
    where organization_id=org and requester_id=other_id),true,null);
  if not exists(select 1 from private.organization_affiliations where organization_id=org and user_id=other_id and status='active')
  then raise exception 'delegated request decision did not take effect'; end if;
  begin
    perform public.affiliation_member_action_for_api(manager_id,org,(select id from private.organization_affiliations
      where organization_id=org and user_id=member_id),'suspend',null);
    raise exception 'affiliation manager bypassed assignment revocation safeguards';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',member_claims,true);
  if private.organization_effective_permissions(member_id,org)<>array['content.edit','team.view']
    or private.institution_role(member_id,org) is not null or private.institution_reviewer(member_id)
    or private.platform_admin(member_id) then raise exception 'permission union or separation failed'; end if;
  perform public.institution_save_for_api(member_id,org,'{"description":"Delegated synthetic text"}');
  begin
    perform public.institution_save_for_api(member_id,org,'{"name":"Public identity change"}');
    raise exception 'content permission changed identity';
  exception when insufficient_privilege then null; end;
  begin
    perform public.institution_manage_for_api(member_id,org);
    raise exception 'delegated user got foundational management view';
  exception when insufficient_privilege then null; end;
  if jsonb_array_length(public.my_organization_roles_for_client())<>1
    or public.organization_roles_for_client(org,null)::text like '%private@example.invalid%'
  then raise exception 'operational projection incorrect'; end if;
  if (select count(*) from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
    where n->>'kind'='organization_access_changed' and n->'actor'='null'::jsonb)<>2
  then raise exception 'private assignment alerts missing'; end if;
  perform set_config('request.jwt.claims',outsider_claims,true);
  if exists(select 1 from jsonb_array_elements(public.notifications_for_client(20,null,null)) n
    where n->>'kind'='organization_access_changed') then raise exception 'cross-account notification'; end if;

  perform set_config('request.jwt.claims',owner_claims,true);
  perform public.organization_role_save_for_client(org,writer,1,'Communications Officer','Updated scope',array['organization.view'],false);
  if private.organization_has_permission(member_id,org,'content.edit')
    or not private.organization_has_permission(member_id,org,'organization.view') then raise exception 'edits did not change live permission'; end if;
  begin
    perform public.organization_role_assignment_for_client(org,writer,1,null,member_write);
    raise exception 'stale revocation accepted';
  exception when sqlstate 'POR09' then null; end;
  perform public.organization_role_assignment_for_client(org,writer,2,null,member_write);
  if private.organization_has_permission(member_id,org,'organization.view') then raise exception 'revoked authority retained'; end if;

  insert into private.account_restrictions(user_id,status,reason) values(member_id,'suspended','Synthetic account restriction.');
  if cardinality(private.organization_effective_permissions(member_id,org))<>0 then raise exception 'restricted account retained permission'; end if;
  delete from private.account_restrictions where user_id=member_id;
  update private.organizations set status='restricted' where id=org;
  if cardinality(private.organization_effective_permissions(owner_id,org))<>0
    or cardinality(private.organization_effective_permissions(member_id,org))<>0 then raise exception 'restricted institution retained permission'; end if;
  update private.organizations set status='active' where id=org;

  update private.organization_memberships set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=editor_grant;
  if cardinality(private.organization_effective_permissions(editor_id,org))<>0 then raise exception 'expired representative retained permission'; end if;
  perform public.affiliation_member_action_for_api(owner_id,org,(select id from private.organization_affiliations
    where organization_id=org and user_id=member_id),'suspend',null);
  perform public.affiliation_member_action_for_api(owner_id,org,(select id from private.organization_affiliations
    where organization_id=org and user_id=member_id),'reinstate',null);
  if private.organization_has_permission(member_id,org,'team.view')
    or not exists(select 1 from private.organization_role_audit where assignment_id=member_view and event='relationship_ended')
  then raise exception 'affiliation reinstatement restored old grant'; end if;
  perform public.organization_role_save_for_client(org,roster,1,null,null,null,true);
  if not exists(select 1 from private.organization_role_audit where role_id=roster and event='role_deactivated')
    or exists(select 1 from private.organization_custom_assignments where role_id=roster and revoked_at is null)
  then raise exception 'deactivation retained assignments or lost audit'; end if;

  update private.organization_memberships set revoked_at=now() where organization_id=org and user_id=owner_id;
  if private.organization_has_permission(manager_id,org,'roles.assign')
    or not exists(select 1 from private.organization_role_audit where organization_id=org and event='ownership_ended')
  then raise exception 'previous ownership left live grants'; end if;
end;
$$;
