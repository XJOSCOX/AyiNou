-- Run only inside the guarded rollback runner.
do $$
declare
  creator uuid := gen_random_uuid();
  delegate uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  claimant uuid := gen_random_uuid();
  reviewer1 uuid := gen_random_uuid();
  reviewer2 uuid := gen_random_uuid();
  user_id_to_seed uuid;
  org uuid;
  invite uuid;
  claim_invite uuid;
  application uuid;
  public_data jsonb;
  management jsonb;
  suffix text := substr(replace(gen_random_uuid()::text,'-',''),1,12);
  institute_handle text := 'institution-test-' || suffix;
  actor_input jsonb;
begin
  if (select count(*) from pg_class where relrowsecurity and oid in (
    'private.organizations'::regclass,'private.organization_memberships'::regclass,
    'private.organization_invitations'::regclass,'private.verification_reviewers'::regclass,
    'private.verification_applications'::regclass,'private.verification_evidence'::regclass,
    'private.verification_reviews'::regclass,'private.institution_audit'::regclass
  )) <> 8 then raise exception 'institution RLS missing'; end if;
  if has_table_privilege('authenticated','private.verification_evidence','select')
    or has_table_privilege('service_role','private.organization_memberships','update')
    or has_function_privilege('authenticated','public.verification_decide_for_api(uuid,uuid,text,text,boolean)','execute')
    or has_function_privilege('anon','public.institution_public_for_api(text)','execute')
  then raise exception 'excess institution grants'; end if;
  if to_regclass('private.verification_challenges') is not null then raise exception 'challenges activated'; end if;

  foreach user_id_to_seed in array array[creator,delegate,other_user,claimant,reviewer1,reviewer2] loop
    insert into auth.users(id,email,email_confirmed_at)
      values(user_id_to_seed,'institution-sql-'||user_id_to_seed||'@example.invalid',now());
    perform public.initialize_member_for_api(user_id_to_seed);
  end loop;
  update public.profiles set username='delegate_'||suffix,display_name='Synthetic delegate' where user_id=delegate;
  update public.profiles set username='outsider_'||suffix,display_name='Synthetic outsider' where user_id=other_user;
  insert into public.role_assignments(user_id,role) select id,'administrator' from unnest(array[creator,reviewer1,reviewer2]) s(id);
  insert into private.verification_reviewers(user_id) select id from unnest(array[creator,reviewer1,reviewer2]) s(id);
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    select gen_random_uuid(),id,'totp','verified','rollback-only',now(),now() from unnest(array[creator,reviewer1,reviewer2]) s(id);
  actor_input := jsonb_build_object('handle',institute_handle,'name','Synthetic institution','kind','ministry',
    'countryCode','HT','departmentCode','HT-OU','contactEmail','private@example.invalid');
  org := public.institution_save_for_api(creator,null,actor_input);
  public_data := public.institution_public_for_api(institute_handle);
  if public_data->>'verificationStatus' is distinct from 'unverified' or public_data ? 'contactEmail'
  then raise exception 'public projection or initial badge'; end if;
  if public.institution_manage_for_api(creator,org)->>'contactEmail' is distinct from 'private@example.invalid'
  then raise exception 'owner contact missing'; end if;
  begin
    perform public.institution_save_for_api(other_user,org,'{"description":"out of scope"}');
    raise exception 'outsider could edit';
  exception when insufficient_privilege then null; end;
  invite := public.institution_invite_for_api(creator,org,'delegate_'||suffix,'administrator',7);
  begin
    perform public.institution_resolve_invite_for_api(other_user,invite,true);
    raise exception 'wrong account accepted';
  exception when insufficient_privilege then null; end;
  perform public.institution_resolve_invite_for_api(delegate,invite,true);
  begin
    perform public.institution_resolve_invite_for_api(delegate,invite,true);
    raise exception 'replayed invitation';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.institution_invite_for_api(delegate,org,'outsider_'||suffix,'administrator',null);
    raise exception 'administrator granted peer role';
  exception when insufficient_privilege then null; end;
  invite := public.institution_invite_for_api(delegate,org,'outsider_'||suffix,'editor',1);
  perform public.institution_resolve_invite_for_api(other_user,invite,true);
  management := public.institution_manage_for_api(other_user,org);
  if management->>'contactEmail' is not null then raise exception 'editor received private contact'; end if;
  perform public.institution_save_for_api(other_user,org,'{"description":"Synthetic editor allowed"}');
  begin
    perform public.institution_save_for_api(other_user,org,'{"name":"Forbidden edit"}');
    raise exception 'editor changed identity';
  exception when insufficient_privilege then null; end;
  update private.organization_memberships set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where organization_id=org and user_id=other_user;
  if private.institution_role(other_user,org) is not null then raise exception 'expired role was active'; end if;
  perform public.institution_revoke_member_for_api(creator,org,(select id from private.organization_memberships where organization_id=org and user_id=delegate));
  if private.institution_role(delegate,org) is not null then raise exception 'revoked role was active'; end if;

  application := public.verification_submit_for_api(creator,org,'government',array['https://example.invalid/registry']);
  begin
    perform public.verification_decide_for_api(creator,application,'approve','Synthetic conflict denial.',true);
    raise exception 'owner reviewed own institution';
  exception when insufficient_privilege then null; end;
  if jsonb_array_length(public.verification_queue_for_api(creator,'pending')) <> 0 then raise exception 'conflicted queue leak'; end if;
  if not exists (select 1 from jsonb_array_elements(public.verification_queue_for_api(reviewer1,'pending')) entry where entry->>'id'=application::text)
  then raise exception 'application missing from reviewer queue'; end if;
  if public.verification_decide_for_api(reviewer1,application,'approve','Synthetic initial approval.',true) <> 'pending'
    or public.institution_public_for_api(institute_handle)->>'verificationStatus' <> 'unverified'
  then raise exception 'single review conferred badge'; end if;
  if public.verification_decide_for_api(reviewer2,application,'approve','Synthetic independent approval.',true) <> 'approved'
  then raise exception 'second review did not approve'; end if;
  if public.institution_public_for_api(institute_handle)->>'verificationStatus' <> 'verified'
  then raise exception 'approved institution stayed unverified'; end if;
  if public.verification_decide_for_api(reviewer1,application,'revoke','Synthetic independent revocation.',true) <> 'revoked'
  then raise exception 'manual revocation failed'; end if;
  if public.institution_public_for_api(institute_handle)->>'verificationStatus' <> 'revoked'
  then raise exception 'public badge remained active'; end if;

  claim_invite := public.institution_invite_for_api(creator,org,'delegate_'||suffix,'viewer',null);
  application := public.verification_submit_for_api(claimant,org,'claim',array['https://example.invalid/authorized']);
  if private.institution_role(claimant,org) is not null then raise exception 'submission granted access'; end if;
  perform public.verification_decide_for_api(reviewer1,application,'approve','Synthetic initial ownership review.',true);
  if private.institution_role(claimant,org) is not null then raise exception 'one review granted ownership'; end if;
  perform public.verification_decide_for_api(reviewer2,application,'approve','Synthetic independent ownership review.',true);
  if private.institution_role(claimant,org) is distinct from 'owner' or private.institution_role(creator,org) is not null
    or (select state from private.organization_invitations where id=claim_invite) <> 'revoked'
    or public.institution_public_for_api(institute_handle)->>'verificationStatus' <> 'revoked'
  then raise exception 'ownership transfer leaked access or badge'; end if;
  application := public.verification_submit_for_api(claimant,null,'notable_person',
    array['https://example.invalid/public-bio','https://publisher.invalid/independent-profile']);
  perform public.verification_work_for_api(reviewer1,application,true);
  perform public.verification_work_for_api(reviewer2,application,true);
  perform public.verification_decide_for_api(reviewer1,application,'approve','Synthetic first personal review.',true);
  perform public.verification_decide_for_api(reviewer2,application,'approve','Synthetic second personal review.',true);
  if not exists (select 1 from public.verification_records where user_id=claimant and verification_type='notable_person' and status='verified')
  then raise exception 'personal verification record missing'; end if;
  if not exists (select 1 from private.institution_audit where organization_id=org and event='ownership_transferred')
  then raise exception 'ownership audit missing'; end if;
end;
$$;
