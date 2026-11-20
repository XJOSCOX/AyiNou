create function feed_data.group_membership_write(p_key text,p_action text,p_visible boolean)
returns jsonb language plpgsql set search_path='' as $$
declare room feed_data.communities:=feed_data.group_lock(p_key); actor uuid:=auth.uid();
begin
  if not feed_data.group_visible(room) then raise exception 'group unavailable' using errcode='PCM04'; end if;
  if p_action='join' then
    if feed_data.community_member(room.id,actor) then return feed_data.group_card(room); end if;
    if exists(select 1 from feed_data.group_removals where community_id=room.id and user_id=actor)
    then raise exception 'membership unavailable' using errcode='42501'; end if;
    perform feed_data.consume_limit(actor,'community_membership',15);
    if room.policy='public' then
      insert into feed_data.community_memberships(community_id,user_id) values(room.id,actor);
      insert into feed_data.group_audit(community_id,actor_id,target_id,action) values(room.id,actor,actor,'joined');
    elsif room.policy='approval' then
      if exists(select 1 from feed_data.group_requests where community_id=room.id and user_id=actor and status='rejected')
      then raise exception 'request unavailable' using errcode='42501'; end if;
      insert into feed_data.group_requests(community_id,user_id,status) values(room.id,actor,'pending')
        on conflict(community_id,user_id) do update set status='pending',created_at=clock_timestamp()
        where group_requests.status not in ('pending','rejected');
    else
      raise exception 'invitation required' using errcode='42501';
    end if;
  elsif p_action='leave' then
    if room.owner_id=actor then raise exception 'last owner must transfer first' using errcode='PCG07'; end if;
    perform feed_data.consume_limit(actor,'community_membership',15);
    delete from feed_data.community_memberships where community_id=room.id and user_id=actor;
    if found then
      delete from feed_data.community_staff where community_id=room.id and user_id=actor;
      update feed_data.group_invitations set status='revoked'
        where community_id=room.id and status='pending' and (sender_id=actor or (recipient_id=actor and purpose='ownership'));
      insert into feed_data.group_audit(community_id,actor_id,target_id,action) values(room.id,actor,actor,'left');
    end if;
    update feed_data.group_requests set status='cancelled' where community_id=room.id and user_id=actor and status='pending';
    if room.policy='private' then return null; end if;
  else
    perform feed_data.consume_limit(actor,'community_membership',15);
    update feed_data.community_memberships set directory_visible=p_visible where community_id=room.id and user_id=actor;
    if not found then raise exception 'membership required' using errcode='PCM03'; end if;
  end if;
  return feed_data.group_card(room);
end;
$$;

create function feed_data.group_reason(p_reason text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(char_length(btrim(p_reason)) between 10 and 500 and p_reason !~ '[[:cntrl:]]',false);
$$;

create function public.group_management_for_client(p_key text,p_section text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room feed_data.communities; actor uuid:=auth.uid();
begin
  select * into room from feed_data.communities where id=feed_data.community_reference(p_key) and kind<>'department';
  if not found or not feed_data.group_visible(room) then raise exception 'group unavailable' using errcode='PCM04'; end if;
  if not feed_data.member_allowed() or coalesce(feed_data.group_role(room,actor),'') not in ('owner','administrator')
  then raise exception 'group manager required' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if p_limit is null or p_limit not between 1 and 24 or char_length(coalesce(p_after,''))>36
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_section='requests' then
    return coalesce((select jsonb_agg(jsonb_build_object('handle',p.username,'name',p.display_name) order by p.username) from (
      select p.username,p.display_name from feed_data.group_requests r join public.profiles p on p.user_id=r.user_id
      where r.community_id=room.id and r.status='pending' and feed_data.author_active(r.user_id)
        and not feed_data.blocked_pair(actor,r.user_id) and p.username>coalesce(p_after,'')
      order by p.username limit p_limit+1
    ) p),'[]');
  elsif p_section='invitations' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'handle',q.username,'purpose',q.purpose,
      'expiresAt',q.expires_at) order by q.id) from (
      select i.id,p.username,i.purpose,i.expires_at from feed_data.group_invitations i join public.profiles p on p.user_id=i.recipient_id
      where i.community_id=room.id and i.status='pending' and i.expires_at>now() and i.id::text>coalesce(p_after,'')
        and not feed_data.blocked_pair(actor,i.recipient_id)
      order by i.id limit p_limit+1
    ) q),'[]');
  elsif p_section='staff' then
    return coalesce((select jsonb_agg(jsonb_build_object('handle',p.username,'role',p.role) order by p.username) from (
      select * from (
        select u.username,'owner'::text as role from public.profiles u where u.user_id=room.owner_id
        union all select u.username,s.role from feed_data.community_staff s join public.profiles u on u.user_id=s.user_id
          where s.community_id=room.id and s.user_id is distinct from room.owner_id
      ) entries where entries.username>coalesce(p_after,'') order by entries.username limit p_limit+1
    ) p),'[]');
  end if;
  raise exception 'invalid section' using errcode='22023';
end;
$$;

create function public.group_manage_member_for_client(p_key text,p_action text,p_handle text,p_role text,p_reason text,p_invitation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room feed_data.communities; authority text; target uuid; old_role text; invite uuid; invite_purpose text;
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  room:=feed_data.group_lock(p_key);
  authority:=feed_data.group_role(room,actor);
  if authority is null and not feed_data.group_visible(room)
    and not (p_action='recover' and coalesce(private.platform_admin(actor),false) and feed_data.recent_feed_totp())
    then raise exception 'group unavailable' using errcode='PCM04'; end if;
  if p_action='recover' then
    if not coalesce(private.platform_admin(actor),false) or (room.owner_id is not null and feed_data.author_active(room.owner_id))
    then raise exception 'recovery unavailable' using errcode='42501'; end if;
  elsif coalesce(authority,'') not in ('owner','administrator')
    or (p_action in ('staff','transfer') and authority<>'owner')
    then raise exception 'group manager required' using errcode='42501';
  end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if not feed_data.group_reason(p_reason) then raise exception 'written reason required' using errcode='22023'; end if;
  perform feed_data.consume_limit(actor,'group_manage',25);
  if p_action='revoke' then
    update feed_data.group_invitations set status='revoked' where id=p_invitation and community_id=room.id and status='pending'
      and (group_invitations.purpose='membership' or authority='owner') returning recipient_id into target;
    if found then insert into feed_data.group_audit(community_id,actor_id,target_id,action,reason)
      values(room.id,actor,target,'invitation_revoked',btrim(p_reason)); end if;
    return null;
  end if;
  select user_id into target from public.profiles where username=p_handle;
  if target is null or actor=target then raise exception 'account unavailable' using errcode='PFR04'; end if;
  if p_action in ('invite','transfer','approve','staff','recover') and p_action<>'staff' and
    (not feed_data.author_active(target) or feed_data.blocked_pair(actor,target)
     or exists(select 1 from feed_data.group_removals where community_id=room.id and user_id=target))
    then raise exception 'account unavailable' using errcode='PFR04'; end if;
  if p_action in ('approve','reject') then
    if room.policy<>'approval' then raise exception 'group policy changed' using errcode='PCG06'; end if;
    update feed_data.group_requests set status=case when p_action='approve' then 'approved' else 'rejected' end
      where community_id=room.id and user_id=target and status='pending';
    if not found then raise exception 'request changed' using errcode='PFR09'; end if;
    if p_action='approve' then
      insert into feed_data.community_memberships(community_id,user_id) values(room.id,target) on conflict do nothing;
    end if;
  elsif p_action in ('invite','transfer') then
    if p_action='invite' and not exists(select 1 from public.profiles p where p.user_id=target and feed_data.followable_member(p))
    then raise exception 'account unavailable' using errcode='PFR04'; end if;
    if (p_action='transfer') is distinct from feed_data.community_member(room.id,target)
    then raise exception 'membership changed' using errcode='PFR09'; end if;
    invite_purpose:=case when p_action='transfer' then 'ownership' else 'membership' end;
    update feed_data.group_invitations i set status='revoked' where i.community_id=room.id and i.recipient_id=target
      and i.purpose=invite_purpose and i.status='pending' and
      (i.expires_at<=now() or i.sender_id is distinct from actor);
    select i.id into invite from feed_data.group_invitations i where i.community_id=room.id and i.recipient_id=target
      and i.purpose=invite_purpose and i.status='pending';
    if found then return invite; end if;
    insert into feed_data.group_invitations(community_id,recipient_id,sender_id,purpose,expires_at)
      values(room.id,target,actor,invite_purpose,clock_timestamp()+interval '7 days') returning id into invite;
  elsif p_action='remove' then
    if target=room.owner_id then raise exception 'last owner must transfer first' using errcode='PCG07'; end if;
    select role into old_role from feed_data.community_staff where community_id=room.id and user_id=target;
    if old_role is not null and authority<>'owner' then raise exception 'owner required' using errcode='42501'; end if;
    delete from feed_data.community_memberships where community_id=room.id and user_id=target;
    if not found then raise exception 'membership changed' using errcode='PFR09'; end if;
    delete from feed_data.community_staff where community_id=room.id and user_id=target;
    insert into feed_data.group_removals values(room.id,target) on conflict do nothing;
    update feed_data.group_invitations set status='revoked' where community_id=room.id and status='pending'
      and (recipient_id=target or sender_id=target);
  elsif p_action='staff' then
    if target=room.owner_id or not feed_data.community_member(room.id,target)
      or (p_role is not null and (p_role not in ('moderator','administrator') or not feed_data.author_active(target)
        or feed_data.blocked_pair(actor,target)))
      then raise exception 'role unavailable' using errcode='42501'; end if;
    select role into old_role from feed_data.community_staff where community_id=room.id and user_id=target;
    if old_role is not distinct from p_role then return null; end if;
    if p_role is null then
      delete from feed_data.community_staff where community_id=room.id and user_id=target;
    else
      insert into feed_data.community_staff(community_id,user_id,role) values(room.id,target,p_role)
        on conflict(community_id,user_id) do update set role=excluded.role,granted_at=clock_timestamp();
    end if;
    update feed_data.group_invitations set status='revoked' where community_id=room.id and status='pending' and sender_id=target
      and p_role is distinct from 'administrator';
    insert into feed_data.community_staff_audit(community_id,actor_id,target_id,old_role,new_role,reason)
      values(room.id,actor,target,old_role,p_role,btrim(p_reason));
  elsif p_action='recover' then
    if not feed_data.community_member(room.id,target) then raise exception 'existing member required' using errcode='PCM03'; end if;
    update feed_data.communities set owner_id=target,version=version+1 where id=room.id;
    delete from feed_data.community_staff where community_id=room.id and user_id=target;
    update feed_data.group_invitations set status='revoked' where community_id=room.id and status='pending' and purpose='ownership';
  else
    raise exception 'invalid group action' using errcode='22023';
  end if;
  insert into feed_data.group_audit(community_id,actor_id,target_id,action,reason)
    values(room.id,actor,target,p_action,btrim(p_reason));
  return invite;
end;
$$;

create function feed_data.group_invitation_sender(c feed_data.communities,i feed_data.group_invitations)
returns boolean language sql stable set search_path='' as $$
  select coalesce(feed_data.group_role(c,i.sender_id) in ('owner','administrator') and
    (i.purpose='membership' or c.owner_id=i.sender_id)
    and not feed_data.blocked_pair(i.sender_id,i.recipient_id),false);
$$;

create function public.group_inbox_for_client(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 24 then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(q.value order by q.id) from (
    select i.id,jsonb_build_object('id',i.id,'name',c.name,'purpose',i.purpose,'expiresAt',i.expires_at) value
    from feed_data.group_invitations i join feed_data.communities c on c.id=i.community_id
    where i.recipient_id=auth.uid() and i.status='pending' and i.expires_at>now()
      and (p_after is null or i.id>p_after) and feed_data.group_invitation_sender(c,i)
    order by i.id limit p_limit+1
  ) q),'[]');
end;
$$;

create function public.respond_group_invitation_for_client(p_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room feed_data.communities; invite feed_data.group_invitations;
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  if p_accept is null then raise exception 'invalid response' using errcode='22023'; end if;
  select * into invite from feed_data.group_invitations where id=p_id and recipient_id=actor;
  if not found then raise exception 'invitation unavailable' using errcode='PCM04'; end if;
  room:=feed_data.group_lock(invite.community_id::text);
  select * into invite from feed_data.group_invitations where id=p_id and recipient_id=actor;
  if invite.status=(case when p_accept then 'accepted' else 'declined' end) then return; end if;
  if invite.status<>'pending' or invite.expires_at<=clock_timestamp() or not feed_data.group_invitation_sender(room,invite)
    or exists(select 1 from feed_data.group_removals where community_id=room.id and user_id=actor)
    then raise exception 'invitation unavailable' using errcode='PCG04'; end if;
  perform feed_data.consume_limit(actor,'group_response',15);
  if p_accept and invite.purpose='ownership' then
    if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
    if not feed_data.community_member(room.id,actor) then raise exception 'membership required' using errcode='PCM03'; end if;
    update feed_data.communities set owner_id=actor,version=version+1 where id=room.id;
    delete from feed_data.community_staff where community_id=room.id and user_id=actor;
    update feed_data.group_invitations set status='revoked' where community_id=room.id and status='pending' and id<>invite.id
      and (purpose='ownership' or sender_id=invite.sender_id);
  elsif p_accept then
    insert into feed_data.community_memberships(community_id,user_id) values(room.id,actor) on conflict do nothing;
    update feed_data.group_requests set status='approved' where community_id=room.id and user_id=actor and status='pending';
  end if;
  update feed_data.group_invitations set status=case when p_accept then 'accepted' else 'declined' end where id=invite.id;
  insert into feed_data.group_audit(community_id,actor_id,target_id,action)
    values(room.id,actor,invite.sender_id,invite.purpose||case when p_accept then '_accepted' else '_declined' end);
end;
$$;

revoke all on function feed_data.group_membership_write(text,text,boolean),feed_data.group_reason(text),
  feed_data.group_invitation_sender(feed_data.communities,feed_data.group_invitations),
  public.group_management_for_client(text,text,text,integer),public.group_manage_member_for_client(text,text,text,text,text,uuid),
  public.group_inbox_for_client(uuid,integer),public.respond_group_invitation_for_client(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.group_management_for_client(text,text,text,integer),
  public.group_manage_member_for_client(text,text,text,text,text,uuid),public.group_inbox_for_client(uuid,integer),
  public.respond_group_invitation_for_client(uuid,boolean) to authenticated;


