create function feed_data.public_group_post(p_room uuid,p_created timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from feed_data.communities c where c.id=p_room and c.kind<>'department'
    and c.policy='public' and c.public_since is not null and p_created>=c.public_since);
$$;
revoke all on function feed_data.public_group_post(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function feed_data.public_group_post(uuid,timestamptz) to anon,authenticated;

drop policy department_post_boundary on feed_data.posts;
create policy community_post_boundary on feed_data.posts as restrictive for select to anon,authenticated
  using(feed_data.can_read_community(community_id) or (status='published' and deleted_at is null
    and feed_data.public_group_post(community_id,created_at)));
create policy public_group_post_read on feed_data.posts for select to anon,authenticated
  using(status='published' and deleted_at is null and feed_data.author_active(author_id)
    and (auth.uid() is null or feed_data.member_allowed()) and feed_data.public_group_post(community_id,created_at));

create or replace function feed_data.require_community_membership(p_community uuid)
returns void language plpgsql set search_path='' as $$
declare room feed_data.communities;
begin
  if p_community is null then return; end if;
  select * into room from feed_data.communities where id=p_community for share;
  if not found or not feed_data.group_visible(room) then raise exception 'community unavailable' using errcode='PCM04'; end if;
  perform 1 from feed_data.community_memberships where community_id=p_community and user_id=auth.uid() for key share;
  if not found then raise exception 'membership required' using errcode='PCM03'; end if;
end;
$$;

create or replace function feed_data.discussion_visible(p feed_data.posts)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p.status='published' and p.deleted_at is null and feed_data.author_active(p.author_id)
    and feed_data.viewer_can_interact(p.author_id)
    and (case when auth.uid() is null then p.visibility='public' or feed_data.public_group_post(p.community_id,p.created_at)
      else p.visibility in ('public','members_only') and feed_data.member_allowed()
        and (feed_data.can_read_community(p.community_id) or feed_data.public_group_post(p.community_id,p.created_at)) end),false);
$$;

create or replace function feed_data.community_post_reference(p_room uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'slug',c.slug) from feed_data.communities c
    where c.id=p_room and (feed_data.can_read_community(c.id) or (c.kind<>'department' and c.public_since is not null));
$$;

create or replace function feed_data.community_review_role(p_community uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.member_allowed() and case when p_community is null then feed_data.moderation_role()
    else coalesce(private.platform_admin(auth.uid()),false) or exists(
      select 1 from feed_data.communities c where c.id=p_community and (
        (c.kind='department' and exists(select 1 from feed_data.community_staff s
          where s.community_id=c.id and s.user_id=auth.uid()))
        or feed_data.group_role(c,auth.uid()) in ('owner','administrator','moderator'))) end;
$$;

create or replace function public.department_communities_for_client(p_mine boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(feed_data.community_card(c) order by c.department_code),'[]') from feed_data.communities c
    where c.kind='department' and (p_mine is false or (p_mine is true and feed_data.member_allowed() and feed_data.community_member(c.id,auth.uid())));
$$;

create or replace function public.department_community_for_client(p_key text)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when c.kind='department' then feed_data.community_card(c) else feed_data.group_card(c) end
    from feed_data.communities c where c.id=feed_data.community_reference(p_key) and feed_data.group_visible(c);
$$;

create or replace function public.read_department_posts_for_client(p_key text,p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room feed_data.communities; joined boolean;
begin
  select * into room from feed_data.communities where id=feed_data.community_reference(p_key);
  if not found or not feed_data.group_visible(room) then raise exception 'community unavailable' using errcode='PCM04'; end if;
  joined:=feed_data.can_read_community(room.id);
  if not joined and (room.public_since is null or (auth.uid() is not null and not feed_data.member_allowed()))
  then raise exception 'membership required' using errcode='PCM03'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,
    'visibility',case when room.public_since is not null and p.created_at>=room.public_since then 'public' else p.visibility end,
    'status',p.status,'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id),
    'community',feed_data.community_post_reference(room.id)
  ) order by p.created_at desc,p.id desc) from (
    select x.* from feed_data.posts x where x.community_id=room.id and x.status='published' and x.deleted_at is null
      and (joined or x.created_at>=room.public_since)
      and feed_data.author_active(x.author_id) and feed_data.viewer_can_interact(x.author_id) and feed_data.viewer_unmuted(x.author_id)
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]');
end;
$$;

grant execute on function public.read_department_posts_for_client(text,integer,timestamptz,uuid) to anon;

create or replace function public.change_department_membership_for_client(p_key text,p_action text,p_visible boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room uuid:=feed_data.community_reference(p_key);
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if p_action is null or p_action not in ('join','leave','privacy') or (p_action='privacy')<>(p_visible is not null)
  then raise exception 'invalid membership' using errcode='22023'; end if;
  if exists(select 1 from feed_data.communities where id=room and kind<>'department') then
    return feed_data.group_membership_write(p_key,p_action,p_visible);
  end if;
  perform feed_data.consume_limit(actor,'community_membership',15);
  if p_action='join' then
    insert into feed_data.community_memberships(community_id,user_id) values(room,actor) on conflict do nothing;
  elsif p_action='leave' then
    delete from feed_data.community_memberships where community_id=room and user_id=actor;
  else
    update feed_data.community_memberships set directory_visible=p_visible where community_id=room and user_id=actor;
    if not found then raise exception 'membership required' using errcode='PCM03'; end if;
  end if;
  return public.department_community_for_client(room::text);
end;
$$;

create or replace function public.department_members_for_client(p_key text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null or not exists(select 1 from feed_data.communities c where c.id=room and feed_data.group_visible(c)) then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if not feed_data.can_read_community(room) then raise exception 'membership required' using errcode='PCM03'; end if;
  if p_limit is null or p_limit not between 1 and 20 or char_length(coalesce(p_after,''))>24
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
    select u.* from feed_data.community_memberships m join public.profiles u on u.user_id=m.user_id
    where m.community_id=room and m.directory_visible and u.username>coalesce(p_after,'') and feed_data.followable_member(u)
    order by u.username limit p_limit+1
  ) p),'[]');
end;
$$;

create or replace function public.change_department_staff_for_client(p_key text,p_username text,p_role text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key); actor uuid:=auth.uid(); target uuid; old_role text;
begin
  if not coalesce(private.platform_admin(actor) and feed_data.recent_feed_totp(),false)
  then raise exception 'administrator required' using errcode='42501'; end if;
  if room is null or not exists(select 1 from feed_data.communities where id=room and kind='department') then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if (p_role is not null and p_role not in ('moderator','administrator')) or p_reason is null
    or char_length(btrim(p_reason)) not between 10 and 500 or p_reason ~ '[[:cntrl:]]'
  then raise exception 'invalid role change' using errcode='22023'; end if;
  select user_id into target from public.profiles where username=p_username;
  if target is null or (p_role is not null and not feed_data.author_active(target))
  then raise exception 'account unavailable' using errcode='PFR04'; end if;
  perform feed_data.consume_limit(actor,'community_staff',15);
  perform pg_advisory_xact_lock(hashtextextended('community-staff:'||room::text||':'||target::text,0));
  select s.role into old_role from feed_data.community_staff s where s.community_id=room and s.user_id=target;
  if p_role is not distinct from old_role then return; end if;
  if p_role is null then delete from feed_data.community_staff where community_id=room and user_id=target;
  else
    insert into feed_data.community_staff(community_id,user_id,role) values(room,target,p_role)
      on conflict(community_id,user_id) do update set role=excluded.role,granted_at=clock_timestamp();
  end if;
  insert into feed_data.community_staff_audit(community_id,actor_id,target_id,old_role,new_role,reason)
    values(room,actor,target,old_role,p_role,btrim(p_reason));
end;
$$;

create or replace function public.read_feed_for_client(p_scope text,p_limit integer,p_before_at timestamptz,p_before_id uuid,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('feed','mine') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='mine' and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',case when feed_data.public_group_post(p.community_id,p.created_at) then 'public' else p.visibility end,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id),'community',feed_data.community_post_reference(p.community_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null and x.community_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_id is not null or p_scope<>'feed' or feed_data.viewer_unmuted(x.author_id))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;
create function public.create_group_post_for_client(p_key text,p_version integer,p_body text,p_language text,
  p_submission uuid,p_topics text[],p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare room feed_data.communities;
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feed:'||auth.uid()::text,0));
  select * into room from feed_data.communities where id=feed_data.community_reference(p_key) and kind<>'department' for share;
  if not found or not feed_data.group_visible(room) then raise exception 'group unavailable' using errcode='PCM04'; end if;
  perform feed_data.require_community_membership(room.id);
  if room.version is distinct from p_version then raise exception 'group policy changed' using errcode='PCG06'; end if;
  return feed_data.create_scoped_media_post(room.id,p_body,p_language,'members_only',p_submission,p_topics,p_items);
end;
$$;
revoke all on function public.create_group_post_for_client(text,integer,text,text,uuid,text[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.create_group_post_for_client(text,integer,text,text,uuid,text[],jsonb) to authenticated;
