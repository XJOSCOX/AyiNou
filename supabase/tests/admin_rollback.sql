do $$
declare
  owner uuid:=gen_random_uuid();
  delegate uuid:=gen_random_uuid();
  ordinary uuid:=gen_random_uuid();
  sess uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid();
  target regclass;
begin
  foreach target in array array['private.account_restrictions'::regclass,'private.platform_admin_audit'::regclass,
    'private.verification_review_work'::regclass] loop
    if not (select relrowsecurity from pg_class where oid=target)
      or has_table_privilege('authenticated',target,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('anon',target,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('service_role',target,'SELECT,INSERT,UPDATE,DELETE')
    then raise exception 'unsafe grant for %',target; end if;
  end loop;
  if has_function_privilege('authenticated','public.admin_account_action_for_api(uuid,uuid,text,text,text)','EXECUTE')
    or has_table_privilege('service_role','public.role_assignments','INSERT,UPDATE,DELETE')
  then raise exception 'unsafe role assignment boundary'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
  select id,id::text||'@phase2e.invalid',now(),now(),now() from unnest(array[owner,delegate,ordinary]) as fixture(id);
  insert into public.role_assignments(user_id,role) values(owner,'administrator'),(delegate,'administrator');
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
  values(factor,owner,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id) values(sess,owner,'aal2',factor);
  perform public.admin_overview_for_api(owner);
  if not public.account_session_for_api(owner,sess,true,true)
    or public.account_session_for_api(ordinary,sess,true,false)
  then raise exception 'session ownership or MFA boundary failed'; end if;
  begin
    perform public.admin_overview_for_api(delegate);
    raise exception 'administrator with no factor admitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_account_action_for_api(ordinary,delegate,'grant','administrator','Synthetic unauthorized grant');
    raise exception 'ordinary grant admitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_account_action_for_api(owner,owner,'revoke','administrator','Synthetic last admin removal');
    raise exception 'administrator may revoke own administrator role';
  exception when insufficient_privilege then null; end;
  -- If the project has no pre-existing eligible admins, the only fixture
  -- administrator must retain its last usable authenticator.
  if not exists(select 1 from public.role_assignments where user_id<>owner and role='administrator' and private.platform_admin(user_id)) then
    begin
      delete from auth.mfa_factors where id=factor;
      raise exception 'last administrator authenticator was removed';
    exception when object_not_in_prerequisite_state then null; end;
  end if;
  perform public.admin_account_action_for_api(owner,delegate,'status','suspended','Synthetic suspension reason');
  perform public.admin_account_action_for_api(owner,delegate,'status','active','Synthetic reinstatement reason');
  perform public.admin_account_action_for_api(owner,ordinary,'status','banned','Synthetic ban reason');
  if private.institution_actor(ordinary) then raise exception 'banned actor remained eligible'; end if;
  perform public.admin_account_action_for_api(owner,ordinary,'status','active','Synthetic reinstatement reason');
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
  values(gen_random_uuid(),ordinary,'totp','verified','rollback-only',now(),now());
  perform public.admin_account_action_for_api(owner,ordinary,'grant','verification_reviewer','Synthetic reviewer appointment');
  if not private.institution_reviewer(ordinary) or private.platform_admin(ordinary)
  then raise exception 'reviewer assignment is coupled to platform administrator'; end if;
  if not exists(select 1 from jsonb_array_elements(public.admin_audit_for_api(owner,null)) e
    where e->>'subjectId'=ordinary::text and e->>'event'='role_granted' and e->>'role'='verification_reviewer')
  then raise exception 'scoped audit missing reviewer appointment'; end if;
  delete from auth.sessions where id=sess;
  if public.account_session_for_api(owner,sess,true,true) then raise exception 'deleted session accepted'; end if;
end;
$$;
