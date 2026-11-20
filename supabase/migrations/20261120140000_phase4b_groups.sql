alter table feed_data.communities
  drop constraint communities_kind_check,
  alter column department_code drop not null,
  add column name text,
  add column description text,
  add column rules text,
  add column country_code text,
  add column topic text,
  add column policy text not null default 'approval',
  add column public_since timestamptz,
  add column owner_id uuid references auth.users(id) on delete set null,
  add column version integer not null default 1,
  add constraint community_kind_fields check (
    (kind='department' and department_code is not null and name is null and description is null and rules is null
      and owner_id is null and country_code is null and topic is null and policy='approval' and public_since is null)
    or (kind in ('diaspora','interest') and department_code is null and name is not null
      and description is not null and rules is not null and (country_code is null or kind='diaspora')
      and (topic is null or kind='interest'))),
  add constraint community_group_policy check (policy in ('public','approval','private') and (public_since is null or policy='public')),
  add constraint community_group_metadata check (
    (name is null or char_length(name) between 3 and 80) and
    (description is null or char_length(description) between 10 and 500) and
    (rules is null or char_length(rules) between 10 and 2000) and
    (country_code is null or country_code ~ '^[A-Z]{2}$') and
    (topic is null or topic in ('education','peace','healthcare','agriculture','technology','entrepreneurship',
      'employment','environment','infrastructure','culture')));
create unique index communities_group_names on feed_data.communities(lower(name)) where kind<>'department';
create index communities_groups_directory on feed_data.communities(kind,slug) where kind<>'department' and policy<>'private';
create index communities_owners on feed_data.communities(owner_id) where owner_id is not null;

create table feed_data.group_creations (
  creator_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  community_id uuid not null unique references feed_data.communities(id) on delete cascade,
  digest bytea not null,
  primary key(creator_id,submission_id)
);
create table feed_data.group_requests (
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(community_id,user_id)
);
create index group_pending_requests on feed_data.group_requests(community_id,created_at,user_id) where status='pending';
create table feed_data.group_invitations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  purpose text not null check(purpose in ('membership','ownership')),
  status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at)
);
create unique index group_invitation_pending on feed_data.group_invitations(community_id,recipient_id,purpose) where status='pending';
create index group_invitation_inbox on feed_data.group_invitations(recipient_id,created_at desc,id desc) where status='pending';
create index group_invitation_group on feed_data.group_invitations(community_id,created_at desc,id desc) where status='pending';
create table feed_data.group_removals (
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(community_id,user_id)
);
create table feed_data.group_audit (
  id bigint generated always as identity primary key,
  community_id uuid not null references feed_data.communities(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index group_audit_room on feed_data.group_audit(community_id,created_at desc,id desc);
alter table feed_data.group_creations enable row level security;
alter table feed_data.group_requests enable row level security;
alter table feed_data.group_invitations enable row level security;
alter table feed_data.group_removals enable row level security;
alter table feed_data.group_audit enable row level security;
revoke all on feed_data.group_creations,feed_data.group_requests,feed_data.group_invitations,feed_data.group_removals,feed_data.group_audit
  from public,anon,authenticated,service_role;

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff','group_manage','group_response'));

create function feed_data.group_role(c feed_data.communities,p_user uuid)
returns text language sql stable set search_path='' as $$
  select case when c.kind<>'department' and feed_data.author_active(p_user) and feed_data.community_member(c.id,p_user)
    then case when c.owner_id=p_user then 'owner' else coalesce(
      (select role from feed_data.community_staff where community_id=c.id and user_id=p_user),'member') end end;
$$;
create function feed_data.group_visible(c feed_data.communities)
returns boolean language sql stable set search_path='' as $$
  select c.kind='department' or c.policy<>'private' or
    (feed_data.member_allowed() and feed_data.community_member(c.id,auth.uid()));
$$;
create function feed_data.group_card(c feed_data.communities)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'slug',c.slug,'kind',c.kind,'departmentCode',null,'name',c.name,
    'description',c.description,'rules',c.rules,'countryCode',c.country_code,'topic',c.topic,'policy',c.policy,
    'discussionPublic',c.public_since is not null,'version',c.version,
    'joined',mine.user_id is not null,'directoryVisible',coalesce(mine.directory_visible,false),
    'role',case when mine.user_id is not null then feed_data.group_role(c,auth.uid()) end,
    'canModerate',mine.user_id is not null and feed_data.group_role(c,auth.uid()) in ('owner','administrator','moderator'),
    'canManageRoles',mine.user_id is not null and c.owner_id=auth.uid(),
    'requestStatus',(select status from feed_data.group_requests where community_id=c.id and user_id=auth.uid() and feed_data.member_allowed()),
    'memberCount',case when c.policy<>'private' or mine.user_id is not null then
      (select case when n>=10 then (n/10)*10 end from (
        select count(*) n from feed_data.community_memberships where community_id=c.id and feed_data.author_active(user_id)
      ) counts) end)
  from (select 1) seed left join feed_data.community_memberships mine
    on mine.community_id=c.id and mine.user_id=auth.uid() and feed_data.member_allowed();
$$;

create function feed_data.validate_group_metadata(p_name text,p_slug text,p_kind text,p_description text,p_rules text,
  p_policy text,p_public boolean,p_country text,p_topic text)
returns void language plpgsql stable set search_path='' as $$
declare name_key text:=regexp_replace(lower(normalize(p_name,NFKD)), '[^a-z0-9]', '', 'g');
        slug_key text:=replace(p_slug,'-','');
begin
  if p_name is null or p_slug is null or p_kind is null or p_description is null or p_rules is null or p_policy is null or p_public is null
    or p_kind not in ('diaspora','interest') or p_policy not in ('public','approval','private') or (p_public and p_policy<>'public')
    or char_length(p_slug) not between 3 and 40 or p_slug !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    or p_name ~ '[[:cntrl:]]' or translate(p_description,E'\n\r\t','') ~ '[[:cntrl:]]'
    or translate(p_rules,E'\n\r\t','') ~ '[[:cntrl:]]'
    or (p_country is not null and p_kind<>'diaspora') or (p_topic is not null and p_kind<>'interest')
  then raise exception 'invalid group metadata' using errcode='22023'; end if;
  if p_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or slug_key ~ '^(ayinou|official|officiel|ofisyel|oficial|admin|moderation|government|gouvernement|gobierno|ministry|ministere)'
    or name_key ~ '(ayinou|official|officiel|ofisyel|oficial|government|gouvernement|gobierno|ministr|embassy|ambassade|embajada)'
    or slug_key in ('new','create','manage','invitations','directory','me','groups','departments','communities','haiti')
    or exists(select 1 from feed_data.communities c join public.departments d on d.code=c.department_code
      where slug_key in (replace(c.slug,'-',''),replace(lower(d.code),'-',''))
        or name_key in (replace(c.slug,'-',''),replace(lower(d.code),'-',''),
          regexp_replace(lower(normalize(d.name,NFKD)), '[^a-z0-9]', '', 'g')))
  then raise exception 'reserved group identity' using errcode='PCG01'; end if;
end;
$$;

create function public.member_groups_for_client(p_kind text,p_mine boolean,p_search text,p_country text,p_topic text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 24 or char_length(coalesce(p_search,''))>80
    or char_length(coalesce(p_after,''))>40 or (p_kind is not null and p_kind not in ('interest','diaspora'))
  then raise exception 'invalid group search' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(feed_data.group_card(c) order by c.slug) from (
    select * from feed_data.communities c where c.kind<>'department'
      and (case when p_mine then feed_data.member_allowed() and feed_data.community_member(c.id,auth.uid())
        else c.policy<>'private' end)
      and (p_kind is null or c.kind=p_kind) and (p_country is null or c.country_code=p_country)
      and (p_topic is null or c.topic=p_topic) and c.slug>coalesce(p_after,'')
      and (p_search is null or strpos(lower(c.name),lower(p_search))>0 or strpos(c.slug,lower(p_search))>0)
    order by c.slug limit p_limit+1
  ) c),'[]');
end;
$$;

create function public.create_member_group_for_client(p_submission uuid,p_name text,p_slug text,p_kind text,p_description text,
  p_rules text,p_policy text,p_public boolean,p_country text,p_topic text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room feed_data.communities; prior feed_data.group_creations;
  fingerprint bytea:=extensions.digest(jsonb_build_array(p_name,p_slug,p_kind,p_description,p_rules,p_policy,p_public,p_country,p_topic)::text,'sha256');
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  if p_submission is null then raise exception 'invalid submission' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('group-creator:'||actor::text,0));
  select * into prior from feed_data.group_creations where creator_id=actor and submission_id=p_submission;
  if found then
    if prior.digest<>fingerprint then raise exception 'submission reused' using errcode='PFR09'; end if;
    select * into room from feed_data.communities where id=prior.community_id;
    if not feed_data.group_visible(room) then raise exception 'group unavailable' using errcode='PCM04'; end if;
    return feed_data.group_card(room);
  end if;
  if (select count(*) from feed_data.group_creations where creator_id=actor)>=5
    then raise exception 'group creation limit' using errcode='PCG02'; end if;
  perform feed_data.validate_group_metadata(p_name,p_slug,p_kind,p_description,p_rules,p_policy,p_public,p_country,p_topic);
  insert into feed_data.communities(slug,kind,name,description,rules,policy,public_since,country_code,topic,owner_id)
    values(p_slug,p_kind,btrim(p_name),btrim(p_description),btrim(p_rules),p_policy,
      case when p_public then clock_timestamp() end,p_country,p_topic,actor) returning * into room;
  insert into feed_data.community_memberships(community_id,user_id) values(room.id,actor);
  insert into feed_data.group_creations values(actor,p_submission,room.id,fingerprint);
  insert into feed_data.group_audit(community_id,actor_id,target_id,action) values(room.id,actor,actor,'created');
  return feed_data.group_card(room);
exception when unique_violation then raise exception 'group name or slug in use' using errcode='PCG03';
end;
$$;

create function feed_data.group_lock(p_key text)
returns feed_data.communities language plpgsql set search_path='' as $$
declare room feed_data.communities;
begin
  select * into room from feed_data.communities where id=feed_data.community_reference(p_key) and kind<>'department' for update;
  if not found then raise exception 'group unavailable' using errcode='PCM04'; end if;
  return room;
end;
$$;

create function public.update_member_group_for_client(p_key text,p_version integer,p_name text,p_description text,
  p_rules text,p_policy text,p_public boolean,p_country text,p_topic text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room feed_data.communities;
begin
  if not feed_data.member_allowed() then raise exception 'membership required' using errcode='42501'; end if;
  room:=feed_data.group_lock(p_key);
  if not feed_data.group_visible(room) then raise exception 'group unavailable' using errcode='PCM04'; end if;
  if feed_data.group_role(room,auth.uid()) is distinct from 'owner' then raise exception 'owner required' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  if room.version is distinct from p_version then raise exception 'group settings changed' using errcode='PCG06'; end if;
  perform feed_data.validate_group_metadata(p_name,room.slug,room.kind,p_description,p_rules,p_policy,p_public,p_country,p_topic);
  perform feed_data.consume_limit(auth.uid(),'group_manage',25);
  update feed_data.communities set name=btrim(p_name),description=btrim(p_description),rules=btrim(p_rules),policy=p_policy,
    public_since=case when p_public then coalesce(room.public_since,clock_timestamp()) end,
    country_code=p_country,topic=p_topic,version=version+1 where id=room.id returning * into room;
  if p_policy<>'approval' then update feed_data.group_requests set status='cancelled' where community_id=room.id and status='pending'; end if;
  insert into feed_data.group_audit(community_id,actor_id,action,reason)
    values(room.id,auth.uid(),'settings',p_policy||case when p_public then ':public' else ':members' end);
  return feed_data.group_card(room);
exception when unique_violation then raise exception 'group name in use' using errcode='PCG03';
end;
$$;

revoke all on function feed_data.group_role(feed_data.communities,uuid),feed_data.group_visible(feed_data.communities),
  feed_data.group_card(feed_data.communities),feed_data.validate_group_metadata(text,text,text,text,text,text,boolean,text,text),feed_data.group_lock(text),
  public.member_groups_for_client(text,boolean,text,text,text,text,integer),
  public.create_member_group_for_client(uuid,text,text,text,text,text,text,boolean,text,text),
  public.update_member_group_for_client(text,integer,text,text,text,text,boolean,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.member_groups_for_client(text,boolean,text,text,text,text,integer) to anon,authenticated;
grant execute on function public.create_member_group_for_client(uuid,text,text,text,text,text,text,boolean,text,text),
  public.update_member_group_for_client(text,integer,text,text,text,text,boolean,text,text) to authenticated;
