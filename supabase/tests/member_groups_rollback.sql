do $$
declare
  owner_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  owner_session uuid:=gen_random_uuid(); member_session uuid:=gen_random_uuid(); outsider_session uuid:=gen_random_uuid();
  owner_factor uuid:=gen_random_uuid(); member_factor uuid:=gen_random_uuid();
  stamp text:=left(replace(owner_id::text,'-',''),9);
  group_slug text:='test-group-'||stamp;
  approval_slug text:='test-approval-'||stamp;
  private_slug text:='test-private-'||stamp;
  owner_handle text:='group_'||left(replace(owner_id::text,'-',''),12);
  member_handle text:='group_'||left(replace(member_id::text,'-',''),12);
  outsider_handle text:='group_'||left(replace(outsider_id::text,'-',''),12);
  reason text:='Written rollback fixture decision.';
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
  owner_jwt text:=jsonb_build_object('sub',owner_id,'session_id',owner_session,'aal','aal2','amr',amr)::text;
  member_jwt text:=jsonb_build_object('sub',member_id,'session_id',member_session,'aal','aal2','amr',amr)::text;
  outsider_jwt text:=jsonb_build_object('sub',outsider_id,'session_id',outsider_session,'aal','aal1')::text;
  key uuid:=gen_random_uuid(); group_id uuid; post_old uuid; post_public uuid; private_post uuid; image uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid();
  invite uuid; ownership uuid; comment_id uuid; item jsonb; public_version integer;
begin
  if (select count(*) from feed_data.communities where kind='department')<>10 then raise exception 'Official catalog changed'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
    unnest(array['anon','authenticated','service_role']) roles(name)
    where n.nspname='feed_data' and c.relname in ('group_creations','group_requests','group_invitations','group_removals','group_audit')
    and (not c.relrowsecurity or has_table_privilege(roles.name,c.oid,'select,insert,update,delete')))
    or has_function_privilege('anon','public.group_inbox_for_client(uuid,integer)','execute')
    or has_function_privilege('authenticated','feed_data.group_membership_write(text,text,boolean)','execute')
  then raise exception 'Group grants too broad'; end if;

  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    select id,id::text||'@group-rollback.invalid',now(),now(),now() from unnest(array[owner_id,member_id,outsider_id]) f(id);
  perform public.initialize_member_for_api(id) from unnest(array[owner_id,member_id,outsider_id]) f(id);
  update public.profiles set is_visible=true,display_name='Group fixture',username='group_'||left(replace(user_id::text,'-',''),12)
    where user_id=any(array[owner_id,member_id,outsider_id]);
  insert into public.user_settings(user_id,discoverable) values(owner_id,true),(member_id,true),(outsider_id,true)
    on conflict(user_id) do update set discoverable=true;
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at)
    values(owner_factor,owner_id,'totp','verified','rollback-only',now(),now()),(member_factor,member_id,'totp','verified','rollback-only',now(),now());
  insert into auth.sessions(id,user_id,aal,factor_id)
    values(owner_session,owner_id,'aal2',owner_factor),(member_session,member_id,'aal2',member_factor),(outsider_session,outsider_id,'aal1',null);
  execute 'set local role service_role';
  perform public.reserve_post_upload_for_api(owner_id,image,lease,repeat('aa',32),80,80,1024,1024);
  perform public.finish_post_upload_for_api(image,lease,true);
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',owner_jwt,true);
  begin
    perform public.create_member_group_for_client(key,'Nórd','some-room','diaspora','Fixture description.','Fixture rules.','public',true,'CA',null);
    raise exception 'reserved name accepted';
  exception when sqlstate 'PCG01' then null; end;
  item:=public.create_member_group_for_client(key,'Group '||stamp,group_slug,'diaspora','Fixture description.','Fixture rules.','public',false,'CA',null);
  group_id:=(item->>'id')::uuid;
  if item->>'role'<>'owner' or (public.create_member_group_for_client(key,'Group '||stamp,group_slug,'diaspora',
    'Fixture description.','Fixture rules.','public',false,'CA',null)->>'id')::uuid is distinct from group_id
  then raise exception 'creation replay or owner assignment failed'; end if;
  begin
    perform public.create_member_group_for_client(key,'Changed '||stamp,group_slug,'diaspora','Fixture description.','Fixture rules.','public',false,'CA',null);
    raise exception 'changed creation replay accepted';
  exception when sqlstate 'PFR09' then null; end;
  perform public.create_member_group_for_client(gen_random_uuid(),'Study '||stamp,approval_slug,'interest','Fixture description.','Fixture rules.','approval',false,null,'education');
  perform public.create_member_group_for_client(gen_random_uuid(),'Private '||stamp,private_slug,'interest','Fixture description.','Fixture rules.','private',false,null,'culture');
  begin
    perform public.change_department_membership_for_client(group_slug,'leave',null);
    raise exception 'owner allowed to leave';
  exception when sqlstate 'PCG07' then null; end;
  post_old:=public.create_group_post_for_client(group_slug,1,'Old members-only post.','ht',gen_random_uuid(),'{}','[]');
  private_post:=public.create_group_post_for_client(private_slug,1,'Private room post.','es',gen_random_uuid(),'{}',
    jsonb_build_array(jsonb_build_object('id',image)));
  item:=public.update_member_group_for_client(group_slug,1,'Group '||stamp,'Fixture description.','Fixture rules.','public',true,'CA',null);
  public_version:=(item->>'version')::integer;
  begin
    perform public.create_group_post_for_client(group_slug,1,'Stale audience post.','en',gen_random_uuid(),'{}','[]');
    raise exception 'stale policy accepted';
  exception when sqlstate 'PCG06' then null; end;
  post_public:=public.create_group_post_for_client(group_slug,public_version,'New public post.','fr',gen_random_uuid(),'{culture}','[]');

  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if jsonb_array_length(public.member_groups_for_client(null,false,stamp,null,null,null,24))<>2
    or public.department_community_for_client(private_slug) is not null
    or public.read_feed_for_client('feed',2,null,null,private_post)<>'[]'
    or public.read_feed_for_client('feed',2,null,null,post_old)<>'[]'
    or public.read_feed_for_client('feed',2,null,null,post_public)#>>'{0,id}' is distinct from post_public::text
    or public.read_department_posts_for_client(group_slug,2,null,null)#>>'{0,id}' is distinct from post_public::text
    or jsonb_array_length(public.read_department_posts_for_client(group_slug,2,null,null))<>1
    or public.can_download_post_media_for_client(private_post,image)
  then raise exception 'anonymous read crossed a privacy boundary'; end if;
  begin
    perform public.read_department_posts_for_client(private_slug,2,null,null);
    raise exception 'anonymous got private group';
  exception when sqlstate 'PCM04' then null; end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',member_jwt,true);
  if public.change_department_membership_for_client(approval_slug,'join',null)->>'requestStatus'<>'pending'
    or public.change_department_membership_for_client(group_slug,'join',null)->>'joined'<>'true'
  then raise exception 'join or request failed'; end if;
  begin
    perform public.group_manage_member_for_client(approval_slug,'staff',outsider_handle,'administrator',reason,null);
    raise exception 'ordinary member granted staff';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  if jsonb_array_length(public.group_management_for_client(approval_slug,'requests',null,10))<>1
  then raise exception 'pending request not reviewable'; end if;
  perform public.group_manage_member_for_client(approval_slug,'approve',member_handle,null,reason,null);
  begin
    perform public.group_manage_member_for_client(approval_slug,'approve',member_handle,null,reason,null);
    raise exception 'duplicate approval accepted';
  exception when sqlstate 'PFR09' then null; end;
  invite:=public.group_manage_member_for_client(private_slug,'invite',member_handle,null,reason,null);
  if invite is distinct from public.group_manage_member_for_client(private_slug,'invite',member_handle,null,reason,null)
  then raise exception 'invitation replay duplicated'; end if;
  perform set_config('request.jwt.claims',outsider_jwt,true);
  begin
    perform public.respond_group_invitation_for_client(invite,true);
    raise exception 'invitation transferable';
  exception when sqlstate 'PCM04' then null; end;
  perform set_config('request.jwt.claims',member_jwt,true);
  if jsonb_array_length(public.group_inbox_for_client(null,15))<>1 then raise exception 'inbox failed'; end if;
  perform public.respond_group_invitation_for_client(invite,true);
  perform public.respond_group_invitation_for_client(invite,true);
  if not public.can_download_post_media_for_client(private_post,image)
    or public.department_community_for_client(approval_slug)->>'joined'<>'true'
  then raise exception 'authorized room access failed'; end if;
  comment_id:=(public.write_engagement_for_client('create',private_post,p_body=>'Private group response.',
    p_language=>'es',p_submission=>gen_random_uuid())->>'id')::uuid;
  if comment_id is null or public.write_engagement_for_client('post_reaction',private_post,p_kind=>'love')#>>'{reactions,mine}'<>'love'
  then raise exception 'group engagement failed'; end if;
  perform public.report_post_for_client(private_post,'other',reason);
  if public.can_review_department_for_client(group_slug) then raise exception 'member became moderator'; end if;
  perform set_config('request.jwt.claims',owner_jwt,true);
  if jsonb_array_length(public.department_reports_for_client(private_slug,'posts','reports',null,null))<>1
  then raise exception 'private group report is unavailable to reviewer'; end if;
  if public.notifications_for_client(20,null,null)::text not like '%'||private_post::text||'%'
  then raise exception 'authorized engagement notification missing'; end if;
  perform public.group_manage_member_for_client(private_slug,'staff',member_handle,'moderator',reason,null);
  ownership:=public.group_manage_member_for_client(group_slug,'transfer',member_handle,null,reason,null);
  perform set_config('request.jwt.claims',member_jwt,true);
  if not public.can_review_department_for_client(private_slug) or public.can_review_department_for_client(approval_slug)
  then raise exception 'scoped moderator leaked'; end if;
  perform public.respond_group_invitation_for_client(ownership,true);
  if public.department_community_for_client(group_slug)->>'role'<>'owner' then raise exception 'owner transfer failed'; end if;
  perform public.update_member_group_for_client(group_slug,public_version+1,'Group '||stamp,'Fixture description.','Fixture rules.','private',false,'CA',null);
  perform public.update_member_group_for_client(group_slug,public_version+2,'Group '||stamp,'Fixture description.','Fixture rules.','public',true,'CA',null);
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.read_department_posts_for_client(group_slug,2,null,null)<>'[]' then raise exception 'reopening leaked history'; end if;
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',owner_jwt,true);
  perform public.group_manage_member_for_client(private_slug,'remove',member_handle,null,reason,null);
  perform set_config('request.jwt.claims',member_jwt,true);
  perform public.respond_group_invitation_for_client(invite,true);
  if public.department_community_for_client(private_slug) is not null or public.can_download_post_media_for_client(private_post,image)
    or public.can_review_department_for_client(private_slug)
  then raise exception 'memberships or roles survived removal/replay'; end if;
  perform set_config('request.jwt.claims',owner_jwt,true);
  invite:=public.group_manage_member_for_client(private_slug,'invite',outsider_handle,null,reason,null);
  execute 'reset role';
  update feed_data.group_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=invite;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',outsider_jwt,true);
  begin
    perform public.respond_group_invitation_for_client(invite,true);
    raise exception 'expired invitation accepted';
  exception when sqlstate 'PCG04' then null; end;
  perform public.save_member_safety_for_client('block',true,owner_handle,null);
  perform set_config('request.jwt.claims',owner_jwt,true);
  begin
    perform public.group_manage_member_for_client(private_slug,'invite',outsider_handle,null,reason,null);
    raise exception 'blocked invitation sent';
  exception when sqlstate 'PFR04' then null; end;
  perform set_config('request.jwt.claims',outsider_jwt,true);
  perform public.change_department_membership_for_client(group_slug,'join',null);
  for n in 1..14 loop
    perform public.change_department_membership_for_client(group_slug,'privacy',false);
  end loop;
  begin
    perform public.change_department_membership_for_client(group_slug,'privacy',false);
    raise exception 'group membership quota escaped';
  exception when sqlstate 'PFR29' then null; end;
  perform set_config('request.jwt.claims',owner_jwt,true);
  for n in 1..2 loop
    perform public.create_member_group_for_client(gen_random_uuid(),'Extra '||stamp||n,'test-extra-'||stamp||n,'interest',
      'Fixture description.','Fixture rules.','private',false,null,null);
  end loop;
  begin
    perform public.create_member_group_for_client(gen_random_uuid(),'Overflow '||stamp,'test-cap-'||stamp,'interest',
      'Fixture description.','Fixture rules.','private',false,null,null);
    raise exception 'creation limit escaped';
  exception when sqlstate 'PCG02' then null; end;
  execute 'reset role';
  insert into private.account_restrictions(user_id,status,reason,changed_by)
    values(outsider_id,'suspended',reason,owner_id);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',outsider_jwt,true);
  begin
    perform public.create_group_post_for_client(group_slug,public_version+3,'Suspended group member.','ht',gen_random_uuid(),'{}','[]');
    raise exception 'suspended member posted';
  exception when insufficient_privilege then null; end;
end;
$$;
