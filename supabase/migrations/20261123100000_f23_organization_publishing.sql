-- Organization publishing metadata stays on the authoritative post.
alter table feed_data.posts
  add column organization_announcement boolean not null default false,
  add column organization_pinned_at timestamptz,
  add column linked_project_id uuid references private.community_projects(id) on delete set null;
create index f23_organization_pins on feed_data.posts(organization_id,organization_pinned_at desc,id)
  where organization_pinned_at is not null;

create table feed_data.organization_post_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id uuid not null,
  representative_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('published','edited','deleted','pinned','unpinned')),
  post_version integer not null,
  occurred_at timestamptz not null default clock_timestamp()
);
alter table feed_data.organization_post_events enable row level security;
revoke all on feed_data.organization_post_events from public,anon,authenticated,service_role;

create function feed_data.f23_can_publish(p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select feed_data.member_allowed() and feed_data.f21_org_visible(p_org)
    and coalesce(private.institution_role(auth.uid(),p_org),'') in ('owner','administrator','editor')
$$;

create function feed_data.f23_record_post_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_action text;
begin
  if new.organization_id is null then return new; end if;
  if old.organization_id is null then
    event_action:='published';
  elsif old.deleted_at is null and new.deleted_at is not null and auth.uid()=old.author_id then
    event_action:='deleted';
  elsif new.edited_at is distinct from old.edited_at then
    event_action:='edited';
  elsif new.organization_pinned_at is distinct from old.organization_pinned_at and new.status='published'
    and new.deleted_at is null and new.visibility='public' then
    event_action:=case when new.organization_pinned_at is null then 'unpinned' else 'pinned' end;
  end if;
  if event_action is not null then
    if not feed_data.f23_can_publish(new.organization_id) then
      raise exception 'organization publishing authority required' using errcode='42501';
    end if;
    insert into feed_data.organization_post_events(organization_id,post_id,representative_id,action,post_version)
      values(new.organization_id,new.id,auth.uid(),event_action,new.version);
  end if;
  return new;
end;
$$;
create trigger f23_record_post_change after update on feed_data.posts
  for each row execute function feed_data.f23_record_post_change();

create function public.publish_organization_post_for_client(p_organization text,p_body text,p_language text,
  p_submission uuid,p_announcement boolean,p_project uuid,p_source uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); org uuid; item feed_data.posts; source feed_data.posts; result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('feed:'||actor::text,0));
  select id into org from private.organizations where handle=p_organization;
  if org is null or not feed_data.f23_can_publish(org) then
    raise exception 'organization unavailable' using errcode='PFR04';
  end if;
  if p_announcement is null or p_submission is null then raise exception 'missing fields' using errcode='22023'; end if;
  select p.* into item from feed_data.post_submissions s join feed_data.posts p on p.id=s.post_id
    where s.author_id=actor and s.submission_id=p_submission;
  if item.id is not null and (item.organization_id is distinct from org
    or item.organization_announcement is distinct from p_announcement or item.linked_project_id is distinct from p_project
    or (select source_id from feed_data.post_quotes where post_id=item.id) is distinct from p_source) then
    raise exception 'submission reused' using errcode='PFR09';
  end if;
  if p_project is not null and not exists(select from private.community_projects p
    where p.id=p_project and p.organization_id=org and private.project_visible(p)) then
    raise exception 'project unavailable' using errcode='PJP04';
  end if;
  if p_source is not null then
    select * into source from feed_data.posts where id=p_source;
    if source.id is not null then perform feed_data.lock_member_pair(actor,source.author_id); end if;
    if source.id is null or not feed_data.f21_shareable(source)
      or exists(select from feed_data.post_quotes where post_id=p_source) then
      raise exception 'original unavailable' using errcode='PFR04';
    end if;
  end if;
  result:=public.create_post_with_media_for_client(p_body,p_language,'public',p_submission,array[]::text[],'[]');
  if item.id is null then
    update feed_data.posts set organization_id=org,organization_announcement=p_announcement,linked_project_id=p_project
      where id=result;
    if p_source is not null then
      insert into feed_data.post_quotes(post_id,source_id) values(result,p_source);
    end if;
  end if;
  return result;
end;
$$;

create function public.set_organization_post_pin_for_client(p_id uuid,p_version integer,p_pinned boolean)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; item feed_data.posts;
begin
  select organization_id into org from feed_data.posts where id=p_id;
  if org is null or not feed_data.f23_can_publish(org) then raise exception 'post unavailable' using errcode='PFR04'; end if;
  perform pg_advisory_xact_lock(hashtextextended('organization-pin:'||org::text,0));
  select * into item from feed_data.posts where id=p_id for update;
  if not feed_data.f23_can_publish(org) or not feed_data.f21_shareable(item) then
    raise exception 'post unavailable' using errcode='PFR04';
  end if;
  if p_pinned is null then raise exception 'missing pin state' using errcode='22023'; end if;
  if p_pinned=(item.organization_pinned_at is not null) then return; end if;
  if item.version is distinct from p_version then raise exception 'stale version' using errcode='PFR09'; end if;
  if p_pinned and (select count(*) from feed_data.posts
    where organization_id=org and organization_pinned_at is not null)>=3 then
    raise exception 'pin limit reached' using errcode='PF323';
  end if;
  update feed_data.posts set organization_pinned_at=case when p_pinned then clock_timestamp() end,version=version+1 where id=p_id;
end;
$$;

-- Drop pins atomically when their post leaves the public feed. Moderation remains in its own ledger.
create function feed_data.f23_clear_invalid_pin()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.deleted_at is not null or new.status<>'published' or new.visibility<>'public' then
    new.organization_pinned_at:=null;
  end if;
  return new;
end;
$$;
create trigger f23_clear_invalid_pin before update on feed_data.posts
  for each row when (old.organization_pinned_at is not null) execute function feed_data.f23_clear_invalid_pin();

create function public.read_organization_posts_for_client(p_handle text,p_filter text,p_pins boolean,
  p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(feed_data.f21_card(x) order by x.organization_pinned_at desc nulls last,x.created_at desc,x.id desc),'[]')
  from (
    select p.* from feed_data.posts p
    where p.organization_id=(select o.id from private.organizations o where o.handle=p_handle and feed_data.followable_institution(o))
      and p.status='published' and p.deleted_at is null and feed_data.discussion_visible(p)
      and feed_data.viewer_unmuted(p.author_id)
      and (p_filter='all' or (p_filter='announcements' and p.organization_announcement))
      and p_pins=(p.organization_pinned_at is not null)
      and (p_before_at is null or (p.created_at,p.id)<(p_before_at,p_before_id))
    order by p.organization_pinned_at desc nulls last,p.created_at desc,p.id desc
    limit case when p_pins then 3 else least(greatest(coalesce(p_limit,20),1),20)+1 end
  ) x
$$;

revoke all on function feed_data.f23_can_publish(uuid),feed_data.f23_record_post_change(),feed_data.f23_clear_invalid_pin()
  from public,anon,authenticated,service_role;
revoke all on function public.publish_organization_post_for_client(text,text,text,uuid,boolean,uuid,uuid),
  public.set_organization_post_pin_for_client(uuid,integer,boolean),
  public.read_organization_posts_for_client(text,text,boolean,integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.publish_organization_post_for_client(text,text,text,uuid,boolean,uuid,uuid),
  public.set_organization_post_pin_for_client(uuid,integer,boolean) to authenticated;
grant execute on function public.read_organization_posts_for_client(text,text,boolean,integer,timestamptz,uuid) to anon,authenticated;

create or replace function feed_data.f21_post_info(p feed_data.posts)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'shareable',feed_data.f21_shareable(p),
    'quotable',feed_data.f21_shareable(p) and q.post_id is null,
    'bookmarked',exists(select 1 from feed_data.bookmarks b where b.actor_id=auth.uid() and b.post_id=p.id),
    'reposted',exists(select 1 from feed_data.reposts r where r.actor_id=auth.uid() and r.post_id=p.id),
    'repostCount',case when feed_data.f21_shareable(p) then (
      select count(*) from feed_data.reposts r
      where r.post_id=p.id and feed_data.follower_visible(r.actor_id)
        and feed_data.viewer_can_interact(r.actor_id)) else 0 end,
    'quote',case when q.post_id is not null then coalesce((select jsonb_build_object(
      'id',o.id,'body',left(o.body,300),'language',o.language,'author',case when o.organization_id is null then feed_data.author_projection(o.author_id)-'avatarPath' end,
      'organization',(select jsonb_build_object('handle',s.handle,'name',s.name) from private.organizations s where s.id=o.organization_id))
      from feed_data.posts o where o.id=q.source_id and feed_data.f21_shareable(o)
        and feed_data.viewer_unmuted(o.author_id)),'{"unavailable":true}'::jsonb) end,
    'organization',(select jsonb_build_object('handle',o.handle,'name',o.name,'verified',o.verification_status='verified') from private.organizations o where o.id=p.organization_id),
    'hashtags',coalesce((select jsonb_agg(tag order by tag) from feed_data.post_hashtags where post_id=p.id),'[]'),
    'mentions',feed_data.f21_mention_links(p.id,null),
    'announcement',p.organization_announcement,
    'pinned',p.organization_pinned_at is not null,
    'canPin',p.organization_id is not null and feed_data.f23_can_publish(p.organization_id),
    'project',(select jsonb_build_object('id',pr.id,'title',r.proposal->>'title',
      'summary',left(r.proposal->>'description',260),
      'opportunities',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title) order by o.created_at desc,o.id)
        from (select v.id,v.title,v.created_at from private.project_opportunities v
          join private.project_execution e on e.project_id=v.project_id and e.status='active'
          where v.project_id=pr.id and v.closed_at is null and (v.closes_on is null or v.closes_on>=current_date)
            and private.project_executable(pr) and feed_data.author_active(v.manager_id)
            and not feed_data.blocked_pair(auth.uid(),v.manager_id)
          order by v.created_at desc,v.id limit 3) o),'[]'))
      from private.community_projects pr join private.project_revisions r on r.project_id=pr.id and r.revision=pr.revision
      where pr.id=p.linked_project_id and pr.organization_id=p.organization_id and private.project_visible(pr)))
  from (select 1) seed left join feed_data.post_quotes q on q.post_id=p.id
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
    'own',coalesce(p.author_id=auth.uid(),false),'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,'community',feed_data.community_post_reference(p.community_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null and x.community_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_id is not null or p_scope<>'feed' or feed_data.viewer_unmuted(x.author_id))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;

create or replace function public.read_following_feed_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or ((p_before_at is null)<>(p_before_id is null))
    then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((
    select jsonb_agg(feed_data.f21_card(p) || jsonb_build_object('timelineId',e.id,'timelineAt',e.at)
      || case when e.actor is null then '{}'::jsonb else jsonb_build_object('repostBy',feed_data.author_projection(e.actor)-'avatarPath') end
      order by e.at desc,e.id desc)
    from (
      (select x.id,x.created_at as at,x.id as post_id,null::uuid as actor from feed_data.member_follows f
        join public.profiles a on a.user_id=f.target_id
        cross join lateral (select v.id,v.created_at from feed_data.posts v where v.author_id=f.target_id
          and v.organization_id is null and v.community_id is null and v.status='published' and v.deleted_at is null
          and v.visibility in ('public','members_only') and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select x.id,x.created_at,x.id,null::uuid from feed_data.institution_follows f
        join private.organizations o on o.id=f.organization_id and feed_data.followable_institution(o)
        cross join lateral (select v.id,v.created_at from feed_data.posts v where v.organization_id=o.id
          and v.community_id is null and v.status='published' and v.deleted_at is null and v.visibility='public'
          and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id)
          and (p_before_at is null or (v.created_at,v.id)<(p_before_at,p_before_id))
          order by v.created_at desc,v.id desc limit p_limit+1) x
        where f.follower_id=auth.uid() order by x.created_at desc,x.id desc limit p_limit+1)
      union all
      (select r.id,r.created_at,r.post_id,r.actor_id from feed_data.member_follows f join public.profiles a on a.user_id=f.target_id
        cross join lateral (select r1.* from feed_data.reposts r1 join feed_data.posts v on v.id=r1.post_id
          where r1.actor_id=f.target_id and feed_data.f21_shareable(v) and feed_data.viewer_unmuted(v.author_id)
          and (v.organization_id is null or not exists(select from feed_data.institution_follows o
            where o.follower_id=auth.uid() and o.organization_id=v.organization_id and not o.show_reposts))
          and (p_before_at is null or (r1.created_at,r1.id)<(p_before_at,p_before_id))
          order by r1.created_at desc,r1.id desc limit p_limit+1) r
        where f.follower_id=auth.uid() and f.show_reposts and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id)
        order by r.created_at desc,r.id desc limit p_limit+1)
      order by at desc,id desc limit p_limit+1
    ) e join feed_data.posts p on p.id=e.post_id
  ),'[]');
end;
$$;

create or replace function feed_data.f21_card(p feed_data.posts)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,
    'community',feed_data.community_post_reference(p.community_id))
$$;

create or replace function public.read_for_you_for_client(p_snapshot uuid,p_after integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  current_time_at timestamptz:=clock_timestamp();
  state feed_data.recommendation_snapshots;
  weights feed_data.recommendation_versions;
  posts uuid[];
  reasons text[];
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or p_after is null or p_after not between 0 and 80
    or (p_snapshot is null and p_after<>0)
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_snapshot is null then
    perform feed_data.consume_limit(actor,'recommendation_build',10);
    select * into strict weights from feed_data.recommendation_versions where version='v1';
    -- Ordinality fixes the exact ranked order in the stored snapshot.
    select coalesce(array_agg(r.post_id order by r.position),'{}'),coalesce(array_agg(r.reason order by r.position),'{}')
      into posts,reasons from feed_data.rank_recommendations(actor,current_time_at,weights) with ordinality r(post_id,reason,position);
    delete from feed_data.recommendation_snapshots where id in (
      select id from feed_data.recommendation_snapshots where expires_at<=current_time_at
      order by expires_at limit 80 for update skip locked
    );
    delete from feed_data.recommendation_snapshots where id in (
      select id from feed_data.recommendation_snapshots where user_id=actor order by created_at desc,id desc offset 2
    );
    insert into feed_data.recommendation_snapshots(user_id,version,created_at,expires_at,post_ids,reasons)
      values(actor,weights.version,current_time_at,current_time_at+interval '10 minutes',posts,reasons) returning * into state;
  else
    select * into state from feed_data.recommendation_snapshots where id=p_snapshot and user_id=actor and expires_at>current_time_at;
    if not found then raise exception 'ranking expired' using errcode='PFD30'; end if;
  end if;

  return jsonb_build_object('snapshotId',state.id,'algorithmVersion',state.version,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
      'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
      'author',case when p.organization_id is null then feed_data.author_projection(p.author_id) end,'own',false,'recommendationReason',p.reason,'rankPosition',p.position)
      order by p.position)
    from (
      select p.*,r.position,state.reasons[r.position::integer] as reason
      from unnest(state.post_ids) with ordinality r(post_id,position)
      join feed_data.posts p on p.id=r.post_id join public.profiles a on a.user_id=p.author_id
      where r.position>p_after and p.community_id is null and p.status='published' and p.deleted_at is null and p.visibility in ('public','members_only')
        and feed_data.followable_member(a) and feed_data.viewer_unmuted(a.user_id) and feed_data.f21_org_visible(p.organization_id)
        and not exists(select 1 from feed_data.recommendation_feedback f where f.user_id=actor and
          (f.post_id=p.id or (f.author_id=p.author_id and (f.action='hide_author' or
            (f.action='less_author' and f.updated_at>state.created_at)))))
      order by r.position limit p_limit+1
    ) p
  ),'[]'::jsonb));
end;
$$;
