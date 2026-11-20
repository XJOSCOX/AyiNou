create table feed_data.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check(kind in ('department')),
  department_code text not null unique references public.departments(code),
  created_at timestamptz not null default clock_timestamp()
);
create table feed_data.community_memberships (
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  directory_visible boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  primary key(community_id,user_id)
);
create index community_memberships_user on feed_data.community_memberships(user_id,community_id);
create index community_memberships_directory on feed_data.community_memberships(community_id,user_id) where directory_visible;
create table feed_data.community_staff (
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('moderator','administrator')),
  granted_at timestamptz not null default clock_timestamp(),
  primary key(community_id,user_id)
);
create index community_staff_user on feed_data.community_staff(user_id,community_id);
create table feed_data.community_staff_audit (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references feed_data.communities(id),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  old_role text check(old_role in ('moderator','administrator')),
  new_role text check(new_role in ('moderator','administrator')),
  reason text not null check(char_length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp(),
  check(old_role is distinct from new_role)
);
create index community_staff_audit_room on feed_data.community_staff_audit(community_id,created_at desc,id desc);
alter table feed_data.communities enable row level security;
alter table feed_data.community_memberships enable row level security;
alter table feed_data.community_staff enable row level security;
alter table feed_data.community_staff_audit enable row level security;
revoke all on feed_data.communities,feed_data.community_memberships,feed_data.community_staff,feed_data.community_staff_audit
  from public,anon,authenticated,service_role;

insert into feed_data.communities(slug,kind,department_code)
select seed.slug,'department',d.code from public.departments d join (values
 ('HT-AR','artibonite'),('HT-CE','centre'),('HT-GA','grand-anse'),('HT-NI','nippes'),('HT-ND','nord'),
 ('HT-NE','nord-est'),('HT-NO','nord-ouest'),('HT-OU','ouest'),('HT-SD','sud'),('HT-SE','sud-est')
) seed(code,slug) on d.code=seed.code
on conflict(department_code) do nothing;

do $$
begin
  if (select count(*) from feed_data.communities where kind='department')<>10 then
    raise exception 'Department community seed requires all ten authoritative department records';
  end if;
end;
$$;

alter table feed_data.posts add column community_id uuid references feed_data.communities(id);
alter table feed_data.posts add constraint community_post_audience check(community_id is null or visibility='members_only');
create index posts_community_page on feed_data.posts(community_id,created_at desc,id desc)
  where community_id is not null and status='published' and deleted_at is null;
alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff'));

create function feed_data.community_member(p_community uuid,p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select p_community is null or exists(select 1 from feed_data.community_memberships
    where community_id=p_community and user_id=p_user);
$$;
create function feed_data.can_read_community(p_community uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_community is null or (feed_data.member_allowed() and feed_data.community_member(p_community,auth.uid()));
$$;
create function feed_data.require_community_membership(p_community uuid)
returns void language plpgsql set search_path='' as $$
begin
  if p_community is null then return; end if;
  perform 1 from feed_data.community_memberships where community_id=p_community and user_id=auth.uid() for key share;
  if not found then raise exception 'membership required' using errcode='PCM03'; end if;
end;
$$;
create policy department_post_boundary on feed_data.posts as restrictive for select to anon,authenticated
  using(feed_data.can_read_community(community_id));

create function feed_data.recent_feed_totp()
returns boolean language sql stable security definer set search_path='' as $$
  select feed_data.member_allowed() and auth.jwt()->>'aal'='aal2'
    and public.account_session_for_api(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,true,true)
    and exists(select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
    ) item where item->>'method' in ('totp','mfa/totp') and case when jsonb_typeof(item->'timestamp')='number'
      then (item->>'timestamp')::numeric between extract(epoch from now())-900 and extract(epoch from now())+30 else false end);
$$;
create function feed_data.community_review_role(p_community uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.member_allowed() and case when p_community is null then feed_data.moderation_role()
    else private.platform_admin(auth.uid()) or exists(select 1 from feed_data.community_staff
      where community_id=p_community and user_id=auth.uid()) end;
$$;
create function feed_data.community_review_allowed(p_community uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.community_review_role(p_community) and feed_data.recent_feed_totp();
$$;
create function feed_data.community_reference(p_key text)
returns uuid language sql stable set search_path='' as $$
  select id from feed_data.communities where slug=p_key or id::text=p_key;
$$;
create function feed_data.community_card(c feed_data.communities)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'slug',c.slug,'kind',c.kind,'departmentCode',c.department_code,'name',d.name,
    'joined',mine.user_id is not null,'directoryVisible',coalesce(mine.directory_visible,false),
    'role',(select role from feed_data.community_staff where community_id=c.id and user_id=auth.uid() and feed_data.member_allowed()),
    'canModerate',feed_data.community_review_role(c.id),'canManageRoles',coalesce(private.platform_admin(auth.uid()),false),
    'memberCount',(select case when n>=10 then (n/10)*10 end from (
      select count(*) n from feed_data.community_memberships m where m.community_id=c.id and feed_data.author_active(m.user_id)
    ) counts)) from public.departments d left join feed_data.community_memberships mine
      on mine.community_id=c.id and mine.user_id=auth.uid() and feed_data.member_allowed()
    where d.code=c.department_code;
$$;
create function public.department_communities_for_client(p_mine boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(feed_data.community_card(c) order by c.department_code),'[]') from feed_data.communities c
    where p_mine is false or (p_mine is true and feed_data.member_allowed() and feed_data.community_member(c.id,auth.uid()));
$$;
create function public.department_community_for_client(p_key text)
returns jsonb language sql stable security definer set search_path='' as $$
  select feed_data.community_card(c) from feed_data.communities c where c.id=feed_data.community_reference(p_key);
$$;
create function public.change_department_membership_for_client(p_key text,p_action text,p_visible boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room uuid:=feed_data.community_reference(p_key);
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
  if p_action is null or p_action not in ('join','leave','privacy') or (p_action='privacy')<>(p_visible is not null)
  then raise exception 'invalid membership' using errcode='22023'; end if;
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
create function public.department_members_for_client(p_key text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key);
begin
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
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
create function public.change_department_staff_for_client(p_key text,p_username text,p_role text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare room uuid:=feed_data.community_reference(p_key); actor uuid:=auth.uid(); target uuid; old_role text;
begin
  if not coalesce(private.platform_admin(actor) and feed_data.recent_feed_totp(),false)
  then raise exception 'administrator required' using errcode='42501'; end if;
  if room is null then raise exception 'community unavailable' using errcode='PCM04'; end if;
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
revoke all on function feed_data.community_member(uuid,uuid),feed_data.can_read_community(uuid),feed_data.require_community_membership(uuid),
  feed_data.recent_feed_totp(),feed_data.community_review_role(uuid),feed_data.community_review_allowed(uuid),
  feed_data.community_reference(text),feed_data.community_card(feed_data.communities),public.department_communities_for_client(boolean),
  public.department_community_for_client(text),public.change_department_membership_for_client(text,text,boolean),
  public.department_members_for_client(text,text,integer),public.change_department_staff_for_client(text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function feed_data.can_read_community(uuid),public.department_communities_for_client(boolean),
  public.department_community_for_client(text) to anon,authenticated;
grant execute on function public.change_department_membership_for_client(text,text,boolean),
  public.department_members_for_client(text,text,integer),public.change_department_staff_for_client(text,text,text,text) to authenticated;
