create function private.poll_card(p private.polls)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'kind',p.kind,'scope',p.scope,'language',p.language,
    'policy',p.policy,'status',private.poll_status(p),'closesAt',p.closes_at,'createdAt',p.created_at,
    'scopeName',case p.scope
      when 'community' then (select coalesce(c.name,d.name) from feed_data.communities c
        left join public.departments d on d.code=c.department_code where c.id=p.community_id)
      when 'organization' then (select o.name from private.organizations o where o.id=p.organization_id)
      when 'project' then (select r.proposal->>'title' from private.project_revisions r where r.project_id=p.project_id and r.revision=p.proposal_revision)
      else (select u.display_name from public.profiles u where u.user_id=p.creator_id and feed_data.followable_member(u)) end);
$$;

create function public.polls_for_client(p_mine boolean,p_scope text,p_scope_id uuid,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_mine is null or ((p_scope is null)<>(p_scope_id is null)) or ((p_before is null)<>(p_before_id is null))
    or (p_scope is not null and p_scope not in ('community','organization','project')) then
    raise exception 'invalid listing' using errcode='PVG03'; end if;
  return coalesce((select jsonb_agg(private.poll_card(p) order by p.created_at desc,p.id desc)
    from (select x.* from private.polls x where
      (case when p_mine then private.poll_can_manage(x,actor)
        else x.status in ('published','closed') and private.poll_can_read(x,actor) end)
      and (p_scope is null or (x.scope=p_scope and coalesce(x.community_id,x.organization_id,x.project_id)=p_scope_id))
      and (p_before is null or (x.created_at,x.id)<(p_before,p_before_id))
      order by x.created_at desc,x.id desc limit 21) p),'[]');
end;
$$;

create function public.poll_detail_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.polls; vote uuid; managing boolean; can_vote boolean; results jsonb; decision jsonb;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into p from private.polls where id=p_id;
  if not found or not private.poll_can_read(p,actor) then raise exception 'poll unavailable' using errcode='PVG04'; end if;
  managing:=private.poll_can_manage(p,actor);
  select option_id into vote from private.poll_ballots where poll_id=p.id and voter_id=actor;
  can_vote:=private.poll_status(p)='open' and vote is null and private.poll_live_eligible(p,actor)
    and (p.electorate_size is null or exists(select 1 from private.poll_electorate e where e.poll_id=p.id and e.user_id=actor))
    and (p.project_id is null or exists(select 1 from private.project_execution e where e.project_id=p.project_id and e.status in ('active','paused')));
  if p.status='closed' then
    results:=p.final_result;
    select jsonb_build_object('disposition',d.disposition,'recommendedOptionId',d.recommended_option,'reason',d.reason,'at',d.created_at)
      into decision from private.poll_decisions d where d.poll_id=p.id;
  elsif p.status='published' and vote is not null and p.result_policy='after_vote' and private.poll_live_eligible(p,actor) then
    results:=private.poll_tally(p,false);
  end if;
  return private.poll_card(p)||jsonb_build_object(
    'description',p.description,'audience',p.audience,'eligibility',p.eligibility,'resultPolicy',p.result_policy,'opensAt',p.opens_at,
    'quorum',p.quorum,'threshold',p.threshold,'electorateSize',p.electorate_size,'finalizedAt',p.finalized_at,
    'scopeId',coalesce(p.community_id,p.organization_id,p.project_id),'taskId',p.task_id,'proposalRevision',p.proposal_revision,
    'canManage',managing,'canVote',can_vote,
    'canModerate',p.audience='members' and p.status='published' and feed_data.moderation_role(),
    'version',case when managing or (p.audience='members' and feed_data.moderation_role()) then p.version end,
    'ownBallot',vote,'results',results,'decision',decision,
    'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'position',o.position,
      'available',private.poll_option_available(p,o) and not feed_data.blocked_pair(actor,o.nominee_id),
      'label',case when o.consent is null then o.label when private.poll_option_available(p,o)
        and not feed_data.blocked_pair(actor,o.nominee_id) then o.consented_name end,
      'handle',case when o.consent is not null and private.poll_option_available(p,o)
        and not feed_data.blocked_pair(actor,o.nominee_id) then o.consented_handle end,
      'consent',case when managing then o.consent end) order by o.position)
      from private.poll_options o where o.poll_id=p.id),'[]'),
    'events',case when managing then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'version',e.version,
      'reason',e.reason,'at',e.created_at) order by e.created_at desc,e.id desc)
      from (select x.* from private.poll_events x where x.poll_id=p.id and x.action not in ('ballot_cast','nomination_requested')
        order by x.created_at desc,x.id desc limit 40) e),'[]') else '[]'::jsonb end,
    'cancellationReason',case when p.status='cancelled' then (select e.reason from private.poll_events e
      where e.poll_id=p.id and e.action='cancelled' order by e.created_at desc limit 1) end);
end;
$$;

create function public.poll_nominations_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'pollId',p.id,
    'title',case when private.poll_live_eligible(p,actor) then p.title end,
    'description',case when private.poll_live_eligible(p,actor) then p.description end,'language',p.language,
    'consent',o.consent,'canRespond',p.status='draft' and private.poll_live_eligible(p,actor))
    order by p.created_at desc,p.id) from (select x.* from private.poll_options x
      where x.nominee_id=actor and x.consent in ('pending','accepted') order by x.id limit 50) o
    join private.polls p on p.id=o.poll_id where p.status<>'cancelled'
      and (o.consent='accepted' or (p.status='draft' and private.poll_live_eligible(p,actor)))),'[]');
end;
$$;

create function public.poll_config_options_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); identity text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  identity:=private.project_identity_state(actor);
  return jsonb_build_object('identity',identity,
    'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',coalesce(c.name,d.name),
      'memberAudience',private.poll_community_active(c.id,true,now())) order by coalesce(c.name,d.name),c.id)
      from (select x.* from feed_data.communities x join feed_data.community_memberships m on m.community_id=x.id and m.user_id=actor
        where private.project_community_manager(x.id,actor) order by x.slug limit 50) c
      left join public.departments d on d.code=c.department_code),'[]'),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name,o.id)
      from (select x.* from private.organizations x where identity='verified'
        and private.project_organization_verified(x.id) and private.organization_has_permission(actor,x.id,'polls.manage')
        order by x.name,x.id limit 50) o),'[]'),
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',r.proposal->>'title','tasks',
      coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.title) order by t.created_at desc)
        from (select x.id,x.title,x.created_at from private.project_tasks x where x.project_id=q.id
          and private.project_task_visible(q,x,actor,private.project_execution_role(q,actor)) order by x.created_at desc limit 75) t),'[]'))
      order by q.updated_at desc,q.id)
      from (select p.* from private.community_projects p join private.project_execution e on e.project_id=p.id
        where identity='verified' and e.status in ('active','paused') and private.project_execution_role(p,actor) in ('owner','manager')
        order by p.updated_at desc,p.id limit 50) q
      join private.project_revisions r on r.project_id=q.id and r.revision=q.revision),'[]'));
end;
$$;

revoke all on function private.poll_card(private.polls),public.polls_for_client(boolean,text,uuid,timestamptz,uuid),
  public.poll_detail_for_client(uuid),public.poll_nominations_for_client(),public.poll_config_options_for_client()
  from public,anon,authenticated,service_role;
grant execute on function public.polls_for_client(boolean,text,uuid,timestamptz,uuid),
  public.poll_detail_for_client(uuid),public.poll_nominations_for_client(),public.poll_config_options_for_client()
  to authenticated;

create or replace function private.organization_permission_catalog()
returns text[] language sql immutable set search_path='' as $$
  select array['organization.view','content.edit','affiliations.manage','affiliations.review','affiliations.invite','team.view','roles.assign',
    'projects.propose','projects.edit','projects.submit','projects.view_private','projects.operate','polls.manage'];
$$;

alter table feed_data.write_limits drop constraint write_limits_action_check,
  add constraint write_limits_action_check check(action in ('create','edit','report','comment_create','comment_edit',
    'reaction','comment_report','engagement_attempt','follow_write','discovery_search','recommendation_build',
    'recommendation_write','media_upload','notification_write','safety_write','appeal_submit','appeal_review',
    'community_membership','community_staff','group_manage','group_response','community_rec_build','community_rec_write',
    'project_create','project_write','project_review','project_report','project_image','project_invite','project_apply','project_task_create','project_operations','poll_create','poll_manage','poll_vote'));

alter table feed_data.notifications drop constraint notifications_kind_check,
  add column poll_event_id uuid references private.poll_events(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved','project_rejected','project_operation','poll_event')),
  add constraint notification_poll_scope check((kind='poll_event')=(poll_event_id is not null)
    and (poll_event_id is null or num_nonnulls(actor_id,post_id,comment_id,appeal_id,verification_application_id,verification_appeal_id,
      representative_membership_id,ambassador_case_id,organization_role_event_id,project_event_id,project_operation_event_id)=0));
create index notifications_poll_event on feed_data.notifications(poll_event_id) where poll_event_id is not null;

create function private.poll_notice_visible(p_event uuid,p_recipient uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.poll_events e join private.polls p on p.id=e.poll_id
    where e.id=p_event and e.recipient_id=p_recipient and not feed_data.blocked_pair(p_recipient,e.actor_id)
      and case when e.action='nomination_requested' then p.status='draft' and private.poll_live_eligible(p,p_recipient)
        and exists(select 1 from private.poll_options o where o.id=e.nomination_id and o.poll_id=e.poll_id
          and o.nominee_id=p_recipient and o.consent='pending')
      else e.action in ('finalized','cancelled','decision_recorded') and private.poll_can_read(p,p_recipient) end);
$$;

create function private.notify_poll_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.recipient_id is not null and new.recipient_id is distinct from new.actor_id
    and private.poll_notice_visible(new.id,new.recipient_id) then
    insert into feed_data.notifications(recipient_id,kind,poll_event_id,dedupe)
      values(new.recipient_id,'poll_event',new.id,'poll:'||new.poll_id||':'||new.action||coalesce(':'||new.nomination_id,''))
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
create trigger notify_poll_event after insert on private.poll_events for each row execute function private.notify_poll_event();
revoke all on function private.poll_notice_visible(uuid,uuid),private.notify_poll_event() from public,anon,authenticated,service_role;

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
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
