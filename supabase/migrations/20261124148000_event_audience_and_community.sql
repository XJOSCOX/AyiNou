-- A linked community organizes discovery. Visibility determines access and RSVP eligibility.
alter table feed_data.events
  drop constraint events_check1,
  add constraint events_community_visibility_requires_link
    check (visibility <> 'community' or community_id is not null);

create or replace function feed_data.f25_event_json(e feed_data.events,p_detail boolean) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',e.id,'createdAt',e.created_at,'version',e.version,'title',e.title,'description',e.description,
    'category',e.category,'format',e.format,'visibility',e.visibility,'status',e.status,
    'startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',e.time_zone,'country',e.country,
    'department',e.department,'locality',e.locality,'coverUrl',e.cover_url,'capacity',e.capacity,'language',e.language,
    'organizationId',e.organization_id,'communityId',e.community_id,
    'communityName',(select coalesce(d.name,c.name,c.slug) from feed_data.communities c
      left join public.departments d on d.code=c.department_code where c.id=e.community_id),
    'projectId',case when manager or exists (select 1 from private.community_projects p where p.id=e.project_id
      and private.project_visible(p)) then e.project_id end,
    'organizer',feed_data.f25_event_organizer(e),'canManage',manager,
    'canShare',coalesce(manager and e.status='published' and feed_data.f25_event_public_share(e),false),
    'canRsvp',auth.uid() is not null and coalesce(e.status='published' and e.ends_at>now()
      and feed_data.f25_event_scope(e) and feed_data.f25_policy('events.rsvp'),false),
    'canComplete',manager and e.status='published' and e.ends_at<=now(),'response',r.response,'listMe',coalesce(r.list_me,false),
    'venue',case when access_venue then e.venue end,'meetingUrl',case when access_venue then e.meeting_url end,
    'counts',case when p_detail and manager then (select jsonb_build_object(
      'going',count(*) filter(where response='going'),'interested',count(*) filter(where response='interested'),
      'not_going',count(*) filter(where response='not_going')) from feed_data.event_rsvps where event_id=e.id) end
  )
  from (select coalesce(feed_data.f25_event_manage(e),false) manager) m
  left join feed_data.event_rsvps r on r.event_id=e.id and r.user_id=auth.uid()
  cross join lateral (select p_detail and (manager or (r.response='going' and e.status='published' and e.ends_at>now()
    and feed_data.f25_event_scope(e))) access_venue) details
$$;
