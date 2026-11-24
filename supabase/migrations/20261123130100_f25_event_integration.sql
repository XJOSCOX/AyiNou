
alter table feed_data.posts add column linked_event_id uuid references feed_data.events(id) on delete restrict;

create function public.share_event_for_client(p_id uuid,p_body text,p_language text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e feed_data.events; post_id uuid; post feed_data.posts;
begin
  perform pg_advisory_xact_lock(hashtextextended('feed:'||auth.uid()::text,0));
  select * into e from feed_data.events where id=p_id for share;
  if e.id is null or not feed_data.f25_event_manage(e) or e.status<>'published' or not feed_data.f25_event_public_share(e) then
    raise exception 'event unavailable' using errcode='PFR04';
  end if;
  select p.* into post from feed_data.post_submissions s join feed_data.posts p on p.id=s.post_id
    where s.author_id=auth.uid() and s.submission_id=p_request;
  if found and post.linked_event_id is distinct from p_id then raise exception 'request conflict' using errcode='PFR09'; end if;
  if e.organization_id is null then
    post_id:=public.create_post_with_media_for_client(p_body,p_language,'public',p_request,array[]::text[],'[]');
  else
    post_id:=public.publish_organization_post_for_client(
      (select handle from private.organizations where id=e.organization_id),p_body,p_language,p_request,true,null,null);
  end if;
  if post.id is null then update feed_data.posts set linked_event_id=p_id where id=post_id; end if;
  return post_id;
end;
$$;

create or replace function public.social_post_info_for_client(p_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id::text,feed_data.f21_post_info(p) || coalesce((
    select jsonb_build_object('event',jsonb_build_object('id',e.id,'title',e.title,'organizer',feed_data.f25_event_organizer(e),
      'startsAt',e.starts_at,'timeZone',e.time_zone,'status',e.status))
    from feed_data.events e where e.id=p.linked_event_id and feed_data.f25_event_public_share(e) and feed_data.discussion_visible(p)
  ),'{}'::jsonb)),'{}')
  from feed_data.posts p where cardinality(p_ids) between 1 and 41 and p.id=any(p_ids)
    and (feed_data.discussion_visible(p) or (p.author_id=auth.uid() and feed_data.member_allowed() and p.deleted_at is null))
    and feed_data.f21_org_visible(p.organization_id)
$$;

create function public.event_reports_for_client(p_before_at timestamptz,p_before_id uuid,p_limit int) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.mod_allowed() then raise exception 'moderation required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q."createdAt" desc,q.id desc) from (
    select r.id,r.created_at as "createdAt",r.category,r.note,e.id as "eventId",e.title,e.status,
      e.moderated_at is not null as restricted
    from feed_data.event_reports r join feed_data.events e on e.id=r.event_id where r.resolved_at is null
      and (p_before_at is null or (r.created_at,r.id)<(p_before_at,p_before_id))
    order by r.created_at desc,r.id desc limit (least(greatest(p_limit,1),20)+1)
  ) q),'[]'::jsonb);
end;
$$;

alter table feed_data.event_audit add column reason text;

create function public.moderate_event_for_client(p_report uuid,p_action text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare e feed_data.events; report feed_data.event_reports; moment timestamptz:=clock_timestamp();
begin
  if not feed_data.mod_allowed() then raise exception 'moderation required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('restricted','restored','dismissed') or p_reason is null
    or length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into report from feed_data.event_reports where id=p_report for update;
  if report.id is null or report.resolved_at is not null then raise exception 'report unavailable' using errcode='PFR04'; end if;
  select * into e from feed_data.events where id=report.event_id for update;
  if (p_action='restricted' and e.moderated_at is not null) or (p_action='restored' and e.moderated_at is null)
    or (p_action='dismissed' and e.moderated_at is not null) then raise exception 'invalid event decision' using errcode='PFR09'; end if;
  if p_action<>'dismissed' then
    update feed_data.events set moderated_at=case when p_action='restricted' then moment end,
      version=e.version+1,updated_at=moment where id=e.id returning * into e;
  end if;
  if p_action<>'restricted' then
    update feed_data.event_reports set resolved_at=moment where id=report.id;
  end if;
  insert into feed_data.event_audit(event_id,actor_id,action,version,reason)
    values(e.id,auth.uid(),p_action,e.version,p_reason);
  return true;
end;
$$;

alter table feed_data.event_audit drop constraint event_audit_action_check,
  add constraint event_audit_action_check check(action in ('created','edited','published','canceled','completed','announced','restricted','restored','dismissed'));

revoke all on function public.share_event_for_client(uuid,text,text,uuid),
  public.event_reports_for_client(timestamptz,uuid,int),public.moderate_event_for_client(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.share_event_for_client(uuid,text,text,uuid),
  public.event_reports_for_client(timestamptz,uuid,int),public.moderate_event_for_client(uuid,text,text) to authenticated;


alter table feed_data.notification_preferences add column events boolean not null default true;
alter table feed_data.notifications add column community_event_id uuid references feed_data.events(id) on delete cascade,
  add column event_action text check(event_action in ('rsvp','changed','canceled','announcement')),
  add constraint event_notice_shape check((kind='event_notice')=(community_event_id is not null and event_action is not null)),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice'));

create function public.event_notification_preference_for_client(p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_enabled is not null then
    perform feed_data.consume_limit(auth.uid(),'notification_write',15);
    insert into feed_data.notification_preferences(user_id,events) values(auth.uid(),p_enabled)
      on conflict(user_id) do update set events=excluded.events,updated_at=clock_timestamp();
  end if;
  select events into enabled from feed_data.notification_preferences where user_id=auth.uid();
  return coalesce(enabled,true);
end;
$$;

create function feed_data.f25_event_notice() returns trigger language plpgsql set search_path='' as $$
declare cause text; target uuid; operation text; actor uuid:=auth.uid(); sequence text;
begin
  if actor is null or not feed_data.f25_policy('events.notifications') then return new; end if;
  case tg_table_name
    when 'event_rsvps' then target:=new.event_id; cause:='rsvp'; sequence:=new.id::text;
    when 'event_updates' then target:=new.event_id; cause:='announcement'; sequence:=new.id::text;
    when 'events' then
      if old.status<>'published' then return new; end if;
      target:=new.id;
      sequence:=new.version::text;
      case
        when new.status='canceled' then cause:='canceled';
        when row(old.starts_at,old.ends_at,old.country,old.department,old.locality,old.venue,old.meeting_url,old.format)
          is distinct from row(new.starts_at,new.ends_at,new.country,new.department,new.locality,new.venue,new.meeting_url,new.format)
          then cause:='changed';
        else return new;
      end case;
  end case;
  insert into feed_data.notifications(recipient_id,actor_id,kind,community_event_id,event_action,dedupe)
  select r.user_id,case when cause='rsvp' then null else actor end,'event_notice',target,cause,
    concat('event:',target,':',cause,':',sequence)
  from feed_data.event_rsvps r left join feed_data.notification_preferences np on np.user_id=r.user_id
  where r.event_id=target and coalesce(np.events,true) and feed_data.author_active(r.user_id)
    and ((cause='rsvp' and r.user_id=actor)
      or (r.user_id<>actor and r.response in ('going','interested') and not feed_data.blocked_pair(r.user_id,actor)
        and not exists(select 1 from feed_data.member_mutes m where m.actor_id=r.user_id and m.target_id=actor)))
    and (cause in ('rsvp','canceled') or not exists (
      select 1 from feed_data.notifications n where n.recipient_id=r.user_id and n.community_event_id=target
        and n.event_action=cause and n.created_at>now()-interval '5 minutes'))
  order by r.updated_at,r.user_id limit 5000
  on conflict(recipient_id,dedupe) do nothing;
  return new;
end;
$$;
create index f25_notice_event on feed_data.notifications(community_event_id,event_action,recipient_id,created_at desc)
  where community_event_id is not null;
create trigger f25_rsvp_notice after insert on feed_data.event_rsvps for each row execute function feed_data.f25_event_notice();
create trigger f25_change_notice after update on feed_data.events for each row execute function feed_data.f25_event_notice();
create trigger f25_update_notice after insert on feed_data.event_updates for each row execute function feed_data.f25_event_notice();

revoke all on function feed_data.f25_event_notice(),public.event_notification_preference_for_client(boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.event_notification_preference_for_client(boolean) to authenticated;

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='event_notice' then exists (select 1 from feed_data.events e where e.id=n.community_event_id
        and feed_data.f25_event_visible(e) and (n.actor_id is null or (not feed_data.blocked_pair(n.recipient_id,n.actor_id)
          and not exists(select 1 from feed_data.member_mutes m where m.actor_id=n.recipient_id and m.target_id=n.actor_id))))
      when n.kind='poll_event' then private.poll_notice_visible(n.poll_event_id,n.recipient_id)
    when n.kind='project_operation' then private.project_operation_notice_visible(n.project_operation_event_id,n.recipient_id)
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
    when n.kind='organization_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_role_audit a where a.id=n.organization_role_event_id and a.subject_id=n.recipient_id)
    when n.kind in ('project_submitted','project_assigned','project_changes','project_approved','project_rejected') then
      feed_data.author_active(n.recipient_id) and exists(select 1 from private.project_events e
        join private.community_projects p on p.id=e.project_id where e.id=n.project_event_id and e.recipient_id=n.recipient_id
          and (case when e.action='assign' then p.status='under_review' and p.reviewer_id=n.recipient_id
            and private.project_reviewer(p,n.recipient_id)
            else private.project_owner_access(p,n.recipient_id,'submit') or private.project_owner_access(p,n.recipient_id,'view_private') end))
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind in ('post_mention','post_repost','post_quote') then
      not exists(select from feed_data.member_mutes where actor_id=n.recipient_id and target_id=n.actor_id)
      and exists(select from feed_data.posts p where p.id=n.post_id
        and feed_data.discussion_visible(p) and feed_data.f21_org_visible(p.organization_id)
        and case n.kind
          when 'post_mention' then feed_data.f24_allows_mention(n.recipient_id,n.actor_id) and exists(select from feed_data.social_mentions m
            where m.post_id=p.id and m.comment_id is not distinct from n.comment_id and m.member_id=n.recipient_id)
            and (n.comment_id is null or exists(select from feed_data.comments c where c.id=n.comment_id
              and feed_data.comment_visible(c) and (c.parent_id is null or exists(select from feed_data.comments parent
                where parent.id=c.parent_id and feed_data.comment_visible(parent)))))
          when 'post_repost' then feed_data.f21_shareable(p) and exists(select from feed_data.reposts r
            where r.post_id=p.id and r.actor_id=n.actor_id)
          else exists(select from feed_data.post_quotes q join feed_data.posts source on source.id=q.source_id
            where q.post_id=p.id and source.author_id=n.recipient_id and feed_data.f21_shareable(source))
        end)
    when n.kind='follow_requested' then exists(select from feed_data.follow_requests r
      where r.requester_id=n.actor_id and r.target_id=n.recipient_id and n.dedupe='follow_requested:'||r.id::text)
    when n.kind='follow_approved' then exists(select from feed_data.member_follows f
      where f.follower_id=n.recipient_id and f.target_id=n.actor_id and f.explicitly_approved_at is not null)
    when n.kind='new_follower' then feed_data.follower_visible(n.actor_id)
      and feed_data.follower_visible(n.recipient_id) and exists(
        select 1 from feed_data.member_follows where follower_id=n.actor_id and target_id=n.recipient_id)
    else exists(select 1 from feed_data.posts p where p.id=n.post_id and feed_data.discussion_visible(p))
      and case when n.kind='post_reaction' then exists(
        select 1 from feed_data.post_reactions r where r.post_id=n.post_id and r.user_id=n.actor_id)
      else exists(select 1 from feed_data.comments c where c.id=n.comment_id and c.post_id=n.post_id
        and feed_data.comment_visible(c)
        and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
          and feed_data.comment_visible(parent)))) end
    end;
$$;
create or replace function public.notifications_for_client(p_limit integer,p_before_at timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 30 or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.created_at,'readAt',n.read_at,
    'available',n.visible,'kind',case when n.visible then n.kind end,'postId',case when n.visible then n.post_id end,
    'commentId',case when n.visible then n.comment_id end,'appealId',case when n.visible then n.appeal_id end,
    'communityEvent',case when n.visible and n.kind='event_notice' then jsonb_build_object('eventId',n.community_event_id,'action',n.event_action) end,
    'pollEvent',case when n.visible and n.kind='poll_event' then (
      select jsonb_build_object('pollId',e.poll_id,'action',e.action) from private.poll_events e where e.id=n.poll_event_id)
    end,'projectOperation',case when n.visible and n.kind='project_operation' then (
      select jsonb_build_object('projectId',e.project_id,'action',e.action) from private.project_operations_events e where e.id=n.project_operation_event_id)
    end,'actor',case when n.visible then feed_data.author_projection(n.actor_id)-'avatarPath' end) order by n.created_at desc,n.id desc)
    from (
      select n.*,feed_data.notification_visible(n) as visible from (
        select x.* from feed_data.notifications x where x.recipient_id=auth.uid() and x.created_at>=now()-interval '30 days'
          and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
        order by x.created_at desc,x.id desc limit p_limit+1
      ) n
    ) n),'[]');
end;
$$;
