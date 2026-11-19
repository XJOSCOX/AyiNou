do $$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  second_owner uuid := gen_random_uuid();
  person uuid;
  open_org uuid;
  review_org uuid;
  official_org uuid;
  affiliation uuid;
  request_id uuid;
  invitation uuid;
  result jsonb;
  suffix text := substr(replace(gen_random_uuid()::text,'-',''),1,12);
begin
  if (select count(*) from pg_class where relrowsecurity and oid in (
    'private.organization_affiliations'::regclass,'private.organization_join_requests'::regclass,
    'private.organization_affiliation_invitations'::regclass,'private.organization_affiliation_events'::regclass
  ))<>4 then raise exception 'affiliation RLS missing'; end if;
  if has_table_privilege('anon','private.organization_affiliations','select')
    or has_table_privilege('authenticated','private.organization_join_requests','update')
    or has_table_privilege('service_role','private.organization_affiliation_events','insert,update,delete')
    or has_function_privilege('authenticated','public.affiliation_decide_for_api(uuid,uuid,uuid,boolean,text)','execute')
    or has_function_privilege('anon','public.affiliation_directory_for_api(text)','execute')
  then raise exception 'unexpected affiliation grant'; end if;

  foreach person in array array[owner_id,member_id,other_id,second_owner] loop
    insert into auth.users(id,email,email_confirmed_at) values(person,'affiliation-sql-'||person||'@example.invalid',now());
    perform public.initialize_member_for_api(person);
  end loop;
  update public.profiles set username='member_'||suffix,display_name='Synthetic member' where user_id=member_id;
  update public.profiles set username='other_'||suffix,display_name='Synthetic other' where user_id=other_id;
  open_org := public.institution_save_for_api(owner_id,null,jsonb_build_object('handle','aff-open-'||suffix,'name','Synthetic open','countryCode','HT','kind','ngo'));
  review_org := public.institution_save_for_api(second_owner,null,jsonb_build_object('handle','aff-review-'||suffix,'name','Synthetic approval','countryCode','HT','kind','nonprofit'));
  official_org := public.institution_save_for_api(owner_id,null,jsonb_build_object('handle','aff-official-'||suffix,'name','Synthetic municipality','countryCode','HT','kind','municipality'));
  if public.affiliation_directory_for_api('aff-open-'||suffix)->>'membershipPolicy'<>'invitation_only'
  then raise exception 'existing default is insecure'; end if;
  begin
    perform public.affiliation_policy_for_api(owner_id,official_org,'open',true);
    raise exception 'official policy was relaxed';
  exception when check_violation then null; end;
  begin
    perform public.affiliation_join_for_api(member_id,official_org,'member',null);
    raise exception 'invitation-only self-join succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.affiliation_policy_for_api(owner_id,review_org,'open',true);
    raise exception 'out of scope policy write succeeded';
  exception when insufficient_privilege then null; end;

  perform public.affiliation_policy_for_api(owner_id,open_org,'open',false);
  perform public.affiliation_policy_for_api(second_owner,review_org,'approval_required',false);
  if public.affiliation_join_for_api(member_id,open_org,'member',null)<>'active'
    or public.affiliation_join_for_api(member_id,review_org,'volunteer','Synthetic private note')<>'pending'
  then raise exception 'wrong admission state'; end if;
  if jsonb_array_length(public.affiliations_own_for_api(member_id)->'affiliations')<>2
    or jsonb_array_length(public.affiliations_own_for_api(other_id)->'affiliations')<>0
  then raise exception 'multi-institution or private scope failure'; end if;
  begin
    perform public.affiliation_join_for_api(member_id,open_org,'member',null);
    raise exception 'duplicate membership succeeded';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.affiliation_join_for_api(member_id,review_org,'supporter',null);
    raise exception 'duplicate request succeeded';
  exception when object_not_in_prerequisite_state then null; end;
  select id into request_id from private.organization_join_requests where organization_id=review_org and requester_id=member_id;
  begin
    perform public.affiliation_decide_for_api(other_id,review_org,request_id,true,null);
    raise exception 'outsider reviewed a request';
  exception when insufficient_privilege then null; end;
  begin
    perform public.affiliation_decide_for_api(owner_id,open_org,request_id,true,null);
    raise exception 'cross-institution review succeeded';
  exception when insufficient_privilege then null; end;
  if public.affiliation_join_for_api(second_owner,review_org,'staff',null)<>'pending' then raise exception 'staff self-assigned'; end if;
  begin
    perform public.affiliation_decide_for_api(second_owner,review_org,(select id from private.organization_join_requests
      where organization_id=review_org and requester_id=second_owner),true,null);
    raise exception 'self-review succeeded';
  exception when insufficient_privilege then null; end;
  perform public.affiliation_own_action_for_api(second_owner,review_org,true,false);
  perform public.affiliation_decide_for_api(second_owner,review_org,request_id,true,null);
  if private.institution_role(member_id,review_org) is not null then raise exception 'affiliation conferred representation'; end if;
  begin
    perform public.institution_manage_for_api(member_id,review_org);
    raise exception 'ordinary member read institution management';
  exception when insufficient_privilege then null; end;
  begin
    perform public.institution_invite_for_api(member_id,review_org,'other_'||suffix,'viewer',null);
    raise exception 'ordinary member invited a representative';
  exception when insufficient_privilege then null; end;

  perform public.affiliation_own_action_for_api(member_id,open_org,false,true);
  if jsonb_array_length(public.affiliation_directory_for_api('aff-open-'||suffix)->'members')<>0
  then raise exception 'disabled directory leaked member'; end if;
  perform public.affiliation_policy_for_api(owner_id,open_org,'open',true);
  result := public.affiliation_directory_for_api('aff-open-'||suffix);
  if jsonb_array_length(result->'members')<>1
    or (result->'members'->0) is distinct from '{"displayName":"Synthetic member","affiliationType":"member"}'::jsonb
  then raise exception 'public directory leaked fields or lost consent'; end if;
  select id into affiliation from private.organization_affiliations where organization_id=open_org and user_id=member_id;
  perform public.affiliation_member_action_for_api(owner_id,open_org,affiliation,'suspend',null);
  if jsonb_array_length(public.affiliation_directory_for_api('aff-open-'||suffix)->'members')<>0
  then raise exception 'suspended member was listed'; end if;
  perform public.affiliation_member_action_for_api(owner_id,open_org,affiliation,'reinstate',null);
  perform public.affiliation_member_action_for_api(owner_id,open_org,affiliation,'change_type','volunteer');
  perform public.affiliation_member_action_for_api(owner_id,open_org,affiliation,'remove',null);
  begin
    perform public.affiliation_join_for_api(member_id,open_org,'member',null);
    raise exception 'removed member bypassed manager reinstatement';
  exception when object_not_in_prerequisite_state then null; end;
  if (select count(*) from private.organization_affiliation_events where affiliation_id=affiliation
    and event in ('joined','suspended','reinstated','type_changed','removed'))<>5
  then raise exception 'expected append-only status history'; end if;

  invitation := public.affiliation_invite_for_api(owner_id,official_org,'other_'||suffix,'staff');
  begin
    perform public.affiliation_resolve_invite_for_api(member_id,invitation,true);
    raise exception 'wrong recipient accepted';
  exception when insufficient_privilege then null; end;
  update private.organization_affiliation_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=invitation;
  begin
    perform public.affiliation_resolve_invite_for_api(other_id,invitation,true);
    raise exception 'expired invitation accepted';
  exception when object_not_in_prerequisite_state then null; end;
  invitation := public.affiliation_invite_for_api(owner_id,official_org,'other_'||suffix,'staff');
  perform public.affiliation_resolve_invite_for_api(owner_id,invitation,false);
  begin
    perform public.affiliation_resolve_invite_for_api(other_id,invitation,true);
    raise exception 'revoked invitation accepted';
  exception when object_not_in_prerequisite_state then null; end;
  invitation := public.affiliation_invite_for_api(owner_id,official_org,'other_'||suffix,'staff');
  perform public.affiliation_resolve_invite_for_api(other_id,invitation,true);
  begin
    perform public.affiliation_resolve_invite_for_api(other_id,invitation,true);
    raise exception 'invitation replay succeeded';
  exception when object_not_in_prerequisite_state then null; end;
  if private.institution_role(other_id,official_org) is not null
    or public.institution_public_for_api('aff-official-'||suffix)->>'verificationStatus'<>'unverified'
  then raise exception 'ordinary invitation conferred privileges or a badge'; end if;
  perform public.affiliation_own_action_for_api(other_id,official_org,true,false);
  perform public.affiliation_join_for_api(other_id,review_org,'supporter','Synthetic request message');
  select id into request_id from private.organization_join_requests where organization_id=review_org and requester_id=other_id;
  perform public.affiliation_decide_for_api(second_owner,review_org,request_id,false,'Synthetic private decision');
  if not exists(select 1 from jsonb_array_elements(public.affiliations_own_for_api(other_id)->'history') h
    where h->>'event'='rejected' and h->>'reason'='Synthetic private decision')
    or public.affiliations_own_for_api(member_id)::text like '%Synthetic private decision%'
  then raise exception 'private decision receipt leaked or missing'; end if;
end;
$$;
