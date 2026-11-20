-- Private social graph. Caller-bound RPCs expose only eligible projections.
create table feed_data.member_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (follower_id,target_id),
  check (follower_id<>target_id)
);
create index member_follows_target on feed_data.member_follows(target_id,follower_id);

create table feed_data.institution_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references private.organizations(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (follower_id,organization_id)
);
create index institution_follows_target on feed_data.institution_follows(organization_id,follower_id);
alter table feed_data.member_follows enable row level security;
alter table feed_data.institution_follows enable row level security;
revoke all on feed_data.member_follows,feed_data.institution_follows from public,anon,authenticated,service_role;

create index discovery_profile_name on public.profiles(lower(display_name) text_pattern_ops)
  where is_visible and username is not null;
create index discovery_profile_handle on public.profiles(username text_pattern_ops)
  where is_visible and display_name is not null;
create index discovery_org_name on private.organizations(lower(name) text_pattern_ops)
  where status='active' and verification_status<>'revoked';
create index discovery_org_handle on private.organizations(handle text_pattern_ops)
  where status='active' and verification_status<>'revoked';
create index discovery_org_category on private.organizations(kind,handle)
  where status='active' and verification_status<>'revoked';
create index discovery_org_country on private.organizations(country_code,handle)
  where status='active' and verification_status<>'revoked';
create index posts_following_author_page on feed_data.posts(author_id,created_at desc,id desc)
  where status='published' and deleted_at is null and visibility in ('public','members_only');

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check (action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search'));

create function feed_data.followable_member(p public.profiles)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p.is_visible and p.username is not null and p.display_name is not null
    and private.member_discoverable(p.user_id) and feed_data.author_active(p.user_id),false);
$$;

create function feed_data.followable_institution(o private.organizations)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(o.status='active' and o.verification_status<>'revoked',false);
$$;

-- Keep the existing public detail endpoint on the same current-account gate.
create or replace function public.find_public_profile_for_api(p_username text)
returns table (user_id uuid, display_name text, username text, biography text, avatar_asset uuid, membership_category text)
language sql stable security definer set search_path = '' as $$
  select p.user_id,p.display_name,p.username,p.biography,p.avatar_asset,
    case when s.show_membership_category then m.membership_category end
  from public.profiles p join public.user_settings s using (user_id) join public.member_private m using (user_id)
  where p.username=p_username and feed_data.followable_member(p);
$$;
revoke all on function public.find_public_profile_for_api(text) from public,anon,authenticated;
grant execute on function public.find_public_profile_for_api(text) to service_role;

create function feed_data.follower_visible(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.user_id=p_user and feed_data.followable_member(p));
$$;

create function feed_data.member_card(p public.profiles)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id','member:'||p.username,'kind','member','handle',p.username,'name',p.display_name,
    'verified',exists(select 1 from public.verification_records v where v.user_id=p.user_id and v.status='verified'
      and v.verification_type in ('identity','notable_person')),
    'following',exists(select 1 from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=p.user_id),
    'self',coalesce(auth.uid()=p.user_id,false));
$$;

create function feed_data.institution_card(o private.organizations)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id','institution:'||o.handle,'kind','institution','targetId',o.id,'handle',o.handle,
    'name',o.name,'verified',o.verification_status='verified','verificationStatus',o.verification_status,
    'category',o.kind,'countryCode',o.country_code,'departmentCode',o.department_code,'description',o.description,
    'following',exists(select 1 from feed_data.institution_follows f where f.follower_id=auth.uid() and f.organization_id=o.id));
$$;

create function public.search_discovery_for_client(p_kind text,p_search text,p_verified boolean,p_category text,
  p_country text,p_department text,p_after text,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  search text:=lower(btrim(coalesce(p_search,'')));
  pattern text;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'discovery_search',90);
  if p_kind is null or p_kind not in ('people','institutions') or p_limit is null or p_limit not between 1 and 20
    or search ~ '[[:cntrl:]]' or char_length(search)>80 or char_length(search)=1
    or char_length(coalesce(p_after,''))>40
    or (p_kind='people' and (p_category is not null or p_country is not null or p_department is not null))
  then raise exception 'invalid search' using errcode='22023'; end if;
  pattern:=replace(replace(replace(search,'!','!!'),'%','!%'),'_','!_')||'%';
  if p_kind='people' then
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from public.profiles x where x.is_visible and x.display_name is not null and x.username is not null
        and x.username>coalesce(p_after,'') and (search='' or x.username like pattern escape '!'
          or lower(x.display_name) like pattern escape '!')
        and feed_data.followable_member(x)
        and (not coalesce(p_verified,false) or exists(select 1 from public.verification_records v
          where v.user_id=x.user_id and v.status='verified' and v.verification_type in ('identity','notable_person')))
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(feed_data.institution_card(o) order by o.handle) from (
    select x.* from private.organizations x where x.status='active' and x.verification_status<>'revoked'
      and x.handle>coalesce(p_after,'') and (search='' or x.handle like pattern escape '!' or lower(x.name) like pattern escape '!')
      and (not coalesce(p_verified,false) or x.verification_status='verified')
      and (p_category is null or x.kind=p_category) and (p_country is null or x.country_code=p_country)
      and (p_department is null or x.department_code=p_department)
    order by x.handle limit p_limit+1
  ) o),'[]'::jsonb);
end;
$$;

create function public.discovery_suggestions_for_client()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
    select x.* from public.profiles x where x.username is not null and x.user_id<>auth.uid() and feed_data.followable_member(x)
      and not exists(select 1 from feed_data.member_follows f where f.follower_id=auth.uid() and f.target_id=x.user_id)
    order by x.username limit 3
  ) p),'[]'::jsonb) || coalesce((select jsonb_agg(feed_data.institution_card(o) order by o.handle) from (
    select candidate.* from unnest(array['haitian_organization','international_organization','ngo','nonprofit','foundation',
      'business','education','media','municipality','ministry','embassy','government_agency']) kind(name)
      cross join lateral (
        select x.* from private.organizations x where x.kind=kind.name and x.status='active' and x.verification_status<>'revoked'
          and not exists(select 1 from feed_data.institution_follows f where f.follower_id=auth.uid() and f.organization_id=x.id)
        order by x.handle limit 1
      ) candidate
    order by candidate.handle limit 3
  ) o),'[]'::jsonb);
end;
$$;

create function public.follow_status_for_client(p_kind text,p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  member public.profiles;
  org private.organizations;
  actor uuid:=auth.uid();
begin
  if actor is not null and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_kind='member' then
    select p.* into member from public.profiles p where p.username=p_key and feed_data.followable_member(p);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return jsonb_build_object(
      'following', exists(select 1 from feed_data.member_follows f where f.follower_id=actor and f.target_id=member.user_id),
      'canFollow', actor is not null and actor<>member.user_id,
      'verified',feed_data.member_card(member)->'verified',
      'followerCount',(select count(*) from feed_data.member_follows f where f.target_id=member.user_id and feed_data.follower_visible(f.follower_id)),
      'followingCount',(select count(*) from feed_data.member_follows f where f.follower_id=member.user_id and feed_data.follower_visible(f.target_id))
        +(select count(*) from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
          where f.follower_id=member.user_id and feed_data.followable_institution(o))
    );
  elsif p_kind='institution' then
    if p_key is null or p_key !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid identifier' using errcode='22023'; end if;
    select o.* into org from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
    return jsonb_build_object(
      'following',exists(select 1 from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=org.id),
      'canFollow',actor is not null,
      'verified',org.verification_status='verified',
      'followerCount',(select count(*) from feed_data.institution_follows f where f.organization_id=org.id and feed_data.follower_visible(f.follower_id)),
      'followingCount',null
    );
  end if;
  raise exception 'invalid target' using errcode='22023';
end;
$$;

create function public.write_follow_for_client(p_kind text,p_key text,p_follow boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  target uuid;
  already boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  perform feed_data.consume_limit(actor,'follow_write',20);
  begin
    if p_follow is null or p_key is null then raise exception 'invalid follow' using errcode='22023'; end if;
    if p_kind='member' then
      select p.user_id into target from public.profiles p where p.username=p_key and feed_data.followable_member(p) for share;
      if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
      if target=actor then raise exception 'self follow' using errcode='42501'; end if;
      select exists(select 1 from feed_data.member_follows f where f.follower_id=actor and f.target_id=target) into already;
    elsif p_kind='institution' then
      select o.id into target from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o) for share;
      if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
      select exists(select 1 from feed_data.institution_follows f where f.follower_id=actor and f.organization_id=target) into already;
    else raise exception 'invalid target' using errcode='22023';
    end if;
    if p_follow and not already and
      (select count(*) from feed_data.member_follows f where f.follower_id=actor)
      +(select count(*) from feed_data.institution_follows f where f.follower_id=actor)>=1000
    then raise exception 'following ceiling' using errcode='PFD12'; end if;

    if p_kind='member' then
      if p_follow then
        insert into feed_data.member_follows(follower_id,target_id) values(actor,target) on conflict do nothing;
      else
        delete from feed_data.member_follows where follower_id=actor and target_id=target;
      end if;
    elsif p_follow then
      insert into feed_data.institution_follows(follower_id,organization_id) values(actor,target) on conflict do nothing;
    else
      delete from feed_data.institution_follows where follower_id=actor and organization_id=target;
    end if;
    return public.follow_status_for_client(p_kind,p_key);
  exception when sqlstate 'PFR04' or sqlstate 'PFD12' or insufficient_privilege or invalid_parameter_value or invalid_text_representation
  then return jsonb_build_object('error',sqlstate);
  end;
end;
$$;

create function public.follow_list_for_client(p_view text,p_key text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  subject uuid;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_view is null or p_view not in ('mine','followers','following','institution_followers')
    or p_limit is null or p_limit not between 1 and 20 or char_length(coalesce(p_after,''))>52
  then raise exception 'invalid list' using errcode='22023'; end if;

  if p_view='institution_followers' then
    select o.id into subject from private.organizations o where o.id=p_key::uuid and feed_data.followable_institution(o);
    if not found then raise exception 'institution unavailable' using errcode='PFR04'; end if;
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from feed_data.institution_follows f join public.profiles x on x.user_id=f.follower_id
      where f.organization_id=subject and x.username>coalesce(p_after,'') and feed_data.followable_member(x)
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;
  if p_view='mine' then subject:=auth.uid();
  else
    select p.user_id into subject from public.profiles p where p.username=p_key and feed_data.followable_member(p);
    if not found then raise exception 'account unavailable' using errcode='PFR04'; end if;
  end if;

  if p_view='followers' then
    return coalesce((select jsonb_agg(feed_data.member_card(p) order by p.username) from (
      select x.* from feed_data.member_follows f join public.profiles x on x.user_id=f.follower_id
      where f.target_id=subject and x.username>coalesce(p_after,'') and feed_data.followable_member(x)
      order by x.username limit p_limit+1
    ) p),'[]'::jsonb);
  end if;

  return coalesce((select jsonb_agg(card order by key) from (
    select 'member:'||p.username as key,feed_data.member_card(p) as card
      from feed_data.member_follows f join public.profiles p on p.user_id=f.target_id
      where f.follower_id=subject and feed_data.followable_member(p) and 'member:'||p.username>coalesce(p_after,'')
    union all
    select 'institution:'||o.handle,feed_data.institution_card(o)
      from feed_data.institution_follows f join private.organizations o on o.id=f.organization_id
      where f.follower_id=subject and feed_data.followable_institution(o) and 'institution:'||o.handle>coalesce(p_after,'')
    order by key limit p_limit+1
  ) eligible),'[]'::jsonb);
end;
$$;

create function public.read_following_feed_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',false,'author',feed_data.author_projection(p.author_id)
  ) order by p.created_at desc,p.id desc) from (
    select x.* from feed_data.member_follows f join public.profiles a on a.user_id=f.target_id
      cross join lateral (
        select candidate.* from feed_data.posts candidate where candidate.author_id=f.target_id
          and candidate.status='published' and candidate.deleted_at is null and candidate.visibility in ('public','members_only')
          and (p_before_at is null or (candidate.created_at,candidate.id)<(p_before_at,p_before_id))
        order by candidate.created_at desc,candidate.id desc limit p_limit+1
      ) x
    where f.follower_id=auth.uid() and feed_data.followable_member(a)
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;

revoke all on function feed_data.followable_member(public.profiles),feed_data.followable_institution(private.organizations),
  feed_data.follower_visible(uuid),feed_data.member_card(public.profiles),feed_data.institution_card(private.organizations)
  from public,anon,authenticated,service_role;
revoke all on function public.search_discovery_for_client(text,text,boolean,text,text,text,text,integer),
  public.discovery_suggestions_for_client(),public.follow_status_for_client(text,text),
  public.write_follow_for_client(text,text,boolean),public.follow_list_for_client(text,text,text,integer),
  public.read_following_feed_for_client(integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.follow_status_for_client(text,text) to anon,authenticated;
grant execute on function public.search_discovery_for_client(text,text,boolean,text,text,text,text,integer),
  public.discovery_suggestions_for_client(),public.write_follow_for_client(text,text,boolean),
  public.follow_list_for_client(text,text,text,integer),public.read_following_feed_for_client(integer,timestamptz,uuid)
  to authenticated;
