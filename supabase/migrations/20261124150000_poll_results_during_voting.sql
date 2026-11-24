-- Keep the stored policy key and share aggregate results as soon as voting opens.
create or replace function public.poll_detail_for_client(p_id uuid)
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
  elsif p.status='published' and p.opens_at<=statement_timestamp()
    and p.result_policy='after_vote' and private.poll_live_eligible(p,actor) then
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
