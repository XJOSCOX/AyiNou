create function private.poll_event(p_poll uuid,p_actor uuid,p_action text,p_version integer,
  p_reason text default null,p_recipient uuid default null,p_nomination uuid default null)
returns void language sql set search_path='' as $$
  insert into private.poll_events(poll_id,actor_id,recipient_id,action,reason,version,nomination_id)
    values(p_poll,p_actor,case when p_recipient is distinct from p_actor then p_recipient end,p_action,p_reason,p_version,p_nomination);
$$;

create function private.poll_manage_guard(p private.polls,p_actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  if not private.poll_can_organize(p,p_actor) then raise exception 'poll unavailable' using errcode='PVG04'; end if;
  if private.poll_high_trust(p) then
    perform private.project_require_identity(p_actor);
    if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  end if;
end;
$$;

create function private.poll_option_available(p private.polls,o private.poll_options)
returns boolean language sql stable set search_path='' as $$
  select o.poll_id=p.id and (o.consent is null or (o.consent='accepted'
    and private.poll_live_eligible(p,o.nominee_id)
    and exists(select 1 from public.profiles u where u.user_id=o.nominee_id and feed_data.followable_member(u)
      and u.display_name=o.consented_name and u.username=o.consented_handle)));
$$;

create function private.poll_set_options(p private.polls,p_actor uuid,p_options jsonb)
returns void language plpgsql set search_path='' as $$
declare item jsonb; position integer:=0; label_text text; nominee uuid; option_id uuid;
begin
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) not between 2 and 10
    then raise exception 'two to ten options required' using errcode='PVG03'; end if;
  if p.kind='person' and (select count(*) from private.poll_events where actor_id=p_actor and action='nomination_requested'
    and created_at>=now()-interval '1 day')+jsonb_array_length(p_options)>30
    then raise exception 'nomination limit' using errcode='PFR29'; end if;
  delete from private.poll_options where poll_id=p.id;
  for item in select value from jsonb_array_elements(p_options) loop
    position:=position+1;
    if jsonb_typeof(item) is distinct from 'string' then raise exception 'invalid option' using errcode='PVG03'; end if;
    label_text:=btrim(item#>>'{}');
    if p.kind='person' then
      select u.user_id into nominee from public.profiles u where u.username=label_text and feed_data.followable_member(u);
      if nominee is null or nominee=p_actor or not private.poll_live_eligible(p,nominee)
        or not feed_data.viewer_can_interact(nominee)
        or exists(select 1 from private.poll_options where poll_id=p.id and nominee_id=nominee)
        then raise exception 'nominee unavailable' using errcode='PVG11'; end if;
      insert into private.poll_options(poll_id,position,nominee_id,consent) values(p.id,position,nominee,'pending') returning id into option_id;
      perform private.poll_event(p.id,p_actor,'nomination_requested',p.version,null,nominee,option_id);
    else
      if not private.project_operational_text(label_text,1,120)
        or exists(select 1 from private.poll_options where poll_id=p.id and lower(label)=lower(label_text))
        then raise exception 'invalid or duplicate option' using errcode='PVG03'; end if;
      insert into private.poll_options(poll_id,position,label) values(p.id,position,label_text);
    end if;
  end loop;
end;
$$;

create function private.poll_snapshot(p private.polls)
returns integer language plpgsql set search_path='' as $$
declare result integer;
begin
  -- The snapshot is created once at publication. Scope and restrictions are also checked at cast time.
  insert into private.poll_electorate(poll_id,user_id)
    select p.id,c.user_id from (
      select m.user_id from feed_data.community_memberships m where m.community_id=p.community_id
      union select m.user_id from private.organization_memberships m where m.organization_id=p.organization_id
      union select a.user_id from private.organization_affiliations a where a.organization_id=p.organization_id and a.status='active'
      union select t.user_id from private.project_team t where t.project_id=p.project_id and t.revoked_at is null
      union select e.operator_id from private.project_execution e where e.project_id=p.project_id
      union select q.submitted_by from private.community_projects q where q.id=p.project_id
      union select q.owner_user_id from private.community_projects q where q.id=p.project_id
      union select c.user_id from private.community_projects q join feed_data.community_staff c on c.community_id=q.community_id
        where q.id=p.project_id and c.role='administrator'
      union select c.owner_id from private.community_projects q join feed_data.communities c on c.id=q.community_id where q.id=p.project_id
      union select p.creator_id
    ) c where c.user_id is not null and private.poll_live_eligible(p,c.user_id)
    order by c.user_id limit 5001;
  get diagnostics result=row_count;
  if result not between 1 and 5000 or (p.quorum is not null and p.quorum>result)
    then raise exception 'electorate or quorum unavailable' using errcode='PVG10'; end if;
  return result;
end;
$$;

create function private.poll_tally(p private.polls,p_final boolean)
returns jsonb language plpgsql stable set search_path='' as $$
declare total integer; highest_count integer; tied integer; winner uuid; candidate private.poll_options;
  counts jsonb; outcome text;
begin
  select count(*) into total from private.poll_ballots where poll_id=p.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'votes',c.votes,
    'percentage',case when total=0 then 0 else round(c.votes*100.0/total,2) end) order by o.position),'[]'),max(c.votes)
    into counts,highest_count from private.poll_options o
    cross join lateral (select count(*)::integer votes from private.poll_ballots b where b.poll_id=p.id and b.option_id=o.id) c
    where o.poll_id=p.id;
  if p_final then
    select count(*),(array_agg((item->>'id')::uuid))[1] into tied,winner
      from jsonb_array_elements(counts) item where (item->>'votes')::integer=highest_count;
    select * into candidate from private.poll_options where id=winner and poll_id=p.id;
    outcome:=case
      when total=0 then 'no_votes'
      when p.quorum is not null and total<p.quorum then 'no_quorum'
      when tied>1 then 'tie'
      when not private.poll_option_available(p,candidate) then 'withdrawn_leads'
      when p.threshold is not null and highest_count*100.0/total<p.threshold then 'below_threshold'
      else 'winner' end;
  end if;
  return jsonb_build_object('total',total,'options',counts,'outcome',outcome,
    'winnerId',case when outcome='winner' then winner end,
    'quorumMet',case when p_final and p.quorum is not null then total>=p.quorum end,
    'thresholdMet',case when p_final and p.threshold is not null and total>0 then highest_count*100.0/total>=p.threshold end);
end;
$$;

revoke all on function private.poll_event(uuid,uuid,text,integer,text,uuid,uuid),private.poll_manage_guard(private.polls,uuid),
  private.poll_option_available(private.polls,private.poll_options),private.poll_set_options(private.polls,uuid,jsonb),
  private.poll_snapshot(private.polls),private.poll_tally(private.polls,boolean)
  from public,anon,authenticated,service_role;

create function public.poll_save_for_client(p_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.polls; input_key uuid; fingerprint bytea; scope_id uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>10000 then
    raise exception 'invalid poll' using errcode='PVG03'; end if;
  if p_id is null then
    input_key:=(p_input->>'key')::uuid;
    if input_key is null then raise exception 'missing request key' using errcode='PVG03'; end if;
    fingerprint:=sha256(convert_to((p_input-'key')::text,'UTF8'));
    perform pg_advisory_xact_lock(hashtextextended('poll-create:'||actor::text,0));
    select * into p from private.polls x where x.creator_id=actor and x.request_key=input_key;
    if found then
      perform private.poll_manage_guard(p,actor);
      if p.request_digest<>fingerprint then raise exception 'request changed' using errcode='PVG09'; end if;
      return jsonb_build_object('id',p.id,'version',p.version);
    end if;
    if (select count(*) from private.polls where creator_id=actor and created_at>=now()-interval '1 day')>=5
      then raise exception 'poll creation limit' using errcode='PFR29'; end if;
    p.creator_id:=actor; p.request_key:=input_key; p.request_digest:=fingerprint;
    p.scope:=p_input->>'scope'; p.kind:=p_input->>'kind'; p.policy:=p_input->>'policy';
    scope_id:=(p_input->>'scopeId')::uuid;
    p.community_id:=case when p.scope='community' then scope_id end;
    p.organization_id:=case when p.scope='organization' then scope_id end;
    p.project_id:=case when p.scope='project' then scope_id end;
    p.task_id:=(p_input->>'taskId')::uuid;
    if p.scope='project' then
      select e.approved_revision into p.proposal_revision from private.project_execution e
        where e.project_id=p.project_id and e.status in ('active','paused');
    end if;
    if (p.scope='individual') is distinct from (scope_id is null)
      or coalesce(p.scope,'') not in ('individual','community','organization','project')
      or coalesce(p.kind,'') not in ('community','priority','decision','person')
      or coalesce(p.policy,'') not in ('advisory','governance')
      or (p.scope='individual' and (p.policy<>'advisory' or p.kind<>'community'))
      or (p.kind in ('priority','decision') and p.scope<>'project')
      or (p.kind='person' and p.scope not in ('community','project'))
      or (p.scope='project' and (p.proposal_revision is null or p.kind='community'))
      or (p.task_id is not null and (p.kind<>'decision' or p.scope<>'project'))
      then raise exception 'invalid poll scope' using errcode='PVG03'; end if;
  else
    select * into p from private.polls where id=p_id for update;
    if not found then raise exception 'poll unavailable' using errcode='PVG04'; end if;
    perform private.poll_manage_guard(p,actor);
    if p.status<>'draft' or p.version is distinct from (p_input->>'version')::integer
      then raise exception 'configuration frozen or changed' using errcode='PVG09'; end if;
    if p.kind='person' and not (p_input ? 'options') and (p.title is distinct from btrim(p_input->>'title')
      or p.description is distinct from btrim(p_input->>'description'))
      then raise exception 'changed topic needs renewed consent' using errcode='PVG11'; end if;
  end if;

  p.title:=btrim(p_input->>'title'); p.description:=btrim(p_input->>'description'); p.language:=p_input->>'language';
  p.audience:=p_input->>'audience'; p.eligibility:=p_input->>'eligibility'; p.result_policy:=p_input->>'resultPolicy';
  p.opens_at:=(p_input->>'opensAt')::timestamptz; p.closes_at:=(p_input->>'closesAt')::timestamptz;
  p.quorum:=(p_input->>'quorum')::integer; p.threshold:=(p_input->>'threshold')::integer;
  if not private.project_operational_text(p.title,3,120) or not private.project_operational_text(p.description,3,2000)
    or coalesce(p.language,'') not in ('ht','fr','en','es')
    or coalesce(p.audience,'') not in ('members','scope') or coalesce(p.eligibility,'') not in ('active','verified')
    or coalesce(p.result_policy,'') not in ('after_vote','after_close')
    or p.opens_at is null or p.closes_at is null or p.opens_at<=clock_timestamp()
    or p.opens_at>now()+interval '90 days' or p.closes_at<=p.opens_at or p.closes_at-p.opens_at>interval '30 days'
    or (p.scope='individual' and p.audience<>'members') or (p.scope in ('organization','project') and p.audience<>'scope')
    or (p.kind='person' and p.audience<>'scope')
    or (private.poll_high_trust(p) and (p.eligibility<>'verified' or p.result_policy<>'after_close'))
    or ((p.quorum is not null or p.threshold is not null) and p.policy<>'governance')
    or (p.quorum is not null and p.quorum not between 1 and 5000)
    or (p.threshold is not null and p.threshold not between 50 and 100)
    then raise exception 'invalid poll configuration' using errcode='PVG03'; end if;
  if not private.poll_scope_live(p) then raise exception 'poll scope unavailable' using errcode='PVG04'; end if;
  perform private.poll_manage_guard(p,actor);
  perform feed_data.consume_limit(actor,case when p_id is null then 'poll_create' else 'poll_manage' end,8);

  if p_id is null then
    insert into private.polls(creator_id,request_key,request_digest,scope,community_id,organization_id,project_id,task_id,proposal_revision,
      kind,policy,audience,eligibility,result_policy,title,description,language,opens_at,closes_at,quorum,threshold)
      values(actor,p.request_key,p.request_digest,p.scope,p.community_id,p.organization_id,p.project_id,p.task_id,p.proposal_revision,
        p.kind,p.policy,p.audience,p.eligibility,p.result_policy,p.title,p.description,p.language,p.opens_at,p.closes_at,p.quorum,p.threshold)
      returning * into p;
    perform private.poll_set_options(p,actor,p_input->'options');
  else
    update private.polls set title=p.title,description=p.description,language=p.language,audience=p.audience,eligibility=p.eligibility,
      result_policy=p.result_policy,opens_at=p.opens_at,closes_at=p.closes_at,quorum=p.quorum,threshold=p.threshold,
      version=version+1,updated_at=clock_timestamp() where id=p_id returning * into p;
    if p_input ? 'options' then perform private.poll_set_options(p,actor,p_input->'options'); end if;
  end if;
  perform private.poll_event(p.id,actor,case when p_id is null then 'created' else 'edited' end,p.version);
  return jsonb_build_object('id',p.id,'version',p.version);
end;
$$;

create function public.poll_vote_for_client(p_id uuid,p_option uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.polls; selected uuid; option_row private.poll_options; at_time timestamptz;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into p from private.polls where id=p_id for update;
  if not found or not private.poll_can_read(p,actor) then raise exception 'poll unavailable' using errcode='PVG04'; end if;
  select option_id into selected from private.poll_ballots where poll_id=p.id and voter_id=actor;
  if found then
    if selected=p_option then return jsonb_build_object('optionId',selected); end if;
    raise exception 'ballot already recorded' using errcode='PVG07';
  end if;
  at_time:=clock_timestamp();
  if p.status='cancelled' then raise exception 'poll cancelled' using errcode='PVG12'; end if;
  if p.status='draft' or at_time<p.opens_at then raise exception 'poll not open' using errcode='PVG05'; end if;
  if p.status<>'published' or at_time>=p.closes_at then raise exception 'voting closed' using errcode='PVG06'; end if;
  if p.eligibility='verified' and private.poll_scope_member(p,actor) then perform private.project_require_identity(actor); end if;
  if not private.poll_live_eligible(p,actor) or (p.electorate_size is not null and not exists(
      select 1 from private.poll_electorate where poll_id=p.id and user_id=actor))
    or (p.scope='project' and not exists(select 1 from private.project_execution e
      where e.project_id=p.project_id and e.status in ('active','paused')))
    then raise exception 'member not eligible' using errcode='PVG08'; end if;
  select * into option_row from private.poll_options where poll_id=p.id and id=p_option;
  if not found or not private.poll_option_available(p,option_row) or feed_data.blocked_pair(actor,option_row.nominee_id)
    then raise exception 'option unavailable' using errcode='PVG11'; end if;
  perform feed_data.consume_limit(actor,'poll_vote',12);
  insert into private.poll_ballots(poll_id,voter_id,option_id,cast_at) values(p.id,actor,p_option,at_time);
  perform private.poll_event(p.id,actor,'ballot_cast',p.version);
  return jsonb_build_object('optionId',p_option);
end;
$$;

create function public.poll_nomination_for_client(p_id uuid,p_option uuid,p_response text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.polls; o private.poll_options; profile public.profiles;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into p from private.polls where id=p_id and kind='person' for update;
  if not found then raise exception 'nomination unavailable' using errcode='PVG04'; end if;
  select * into o from private.poll_options where id=p_option and poll_id=p.id and nominee_id=actor;
  if not found then raise exception 'nomination unavailable' using errcode='PVG04'; end if;
  if p_response in ('accepted','declined') and (p.status<>'draft' or o.consent<>'pending')
    or p_response='withdrawn' and o.consent<>'accepted'
    or coalesce(p_response,'') not in ('accepted','declined','withdrawn')
    then raise exception 'nomination changed' using errcode='PVG09'; end if;
  if p_response='accepted' then
    if not private.poll_live_eligible(p,actor) then raise exception 'nomination unavailable' using errcode='PVG08'; end if;
    select * into profile from public.profiles u where u.user_id=actor and feed_data.followable_member(u);
    if not found then raise exception 'public profile unavailable' using errcode='PVG11'; end if;
  end if;
  perform feed_data.consume_limit(actor,'poll_manage',12);
  update private.poll_options set consent=p_response,decided_at=clock_timestamp(),
    consented_name=case when p_response='accepted' then profile.display_name end,
    consented_handle=case when p_response='accepted' then profile.username end where id=o.id;
  perform private.poll_event(p.id,actor,'nomination_'||p_response,p.version);
end;
$$;

create function public.poll_transition_for_client(p_id uuid,p_action text,p_version integer,p_reason text,p_disposition text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.polls; total_eligible integer; result jsonb; recommended uuid; candidate uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  select * into p from private.polls where id=p_id for update;
  if not found then raise exception 'poll unavailable' using errcode='PVG04'; end if;
  if p_action='moderate_cancel' then
    if not feed_data.moderation_role() or p.status<>'published' or p.audience<>'members'
      or not private.poll_can_read(p,actor) then raise exception 'poll unavailable' using errcode='PVG04'; end if;
    if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  else
    perform private.poll_manage_guard(p,actor);
  end if;
  if p.version is distinct from p_version then raise exception 'configuration changed' using errcode='PVG09'; end if;
  perform feed_data.consume_limit(actor,'poll_manage',12);
  if p_action='publish' then
    if p.status<>'draft' or clock_timestamp()>=p.opens_at then raise exception 'configuration changed' using errcode='PVG09'; end if;
    if not private.poll_scope_live(p) then raise exception 'poll scope unavailable' using errcode='PVG04'; end if;
    if p.scope='project' and not exists(select 1 from private.project_execution
      where project_id=p.project_id and status in ('active','paused')) then raise exception 'poll unavailable' using errcode='PVG04'; end if;
    if p.kind='person' and exists(select 1 from private.poll_options o where o.poll_id=p.id
      and not private.poll_option_available(p,o)) then raise exception 'nominee consent incomplete' using errcode='PVG11'; end if;
    -- Snapshot time is frozen before the opening boundary.
    if private.poll_high_trust(p) then total_eligible:=private.poll_snapshot(p); end if;
    if p.kind='person' and exists(select 1 from private.poll_options o where o.poll_id=p.id and not exists(
      select 1 from private.poll_electorate e where e.poll_id=p.id and e.user_id=o.nominee_id))
      then raise exception 'nominee outside electorate' using errcode='PVG11'; end if;
    update private.polls set status='published',published_at=clock_timestamp(),electorate_size=total_eligible
      where id=p.id;
    perform private.poll_event(p.id,actor,'published',p.version+1);
  elsif p_action='close' then
    if p.status<>'published' or clock_timestamp()<p.closes_at then raise exception 'poll not ready to finalize' using errcode='PVG06'; end if;
    result:=private.poll_tally(p,true);
    update private.polls set status='closed',finalized_at=clock_timestamp(),final_result=result where id=p.id;
    perform private.poll_event(p.id,actor,'finalized',p.version+1,null,p.creator_id);
    for candidate in select o.nominee_id from private.poll_options o where o.poll_id=p.id and o.nominee_id is distinct from p.creator_id
      and o.consent='accepted' and private.poll_option_available(p,o)
      loop perform private.poll_event(p.id,actor,'finalized',p.version+1,null,candidate); end loop;
  elsif p_action in ('cancel','moderate_cancel') then
    if p.status not in ('draft','published') then raise exception 'poll changed' using errcode='PVG09'; end if;
    if not private.project_operational_text(p_reason,3,600) then raise exception 'reason required' using errcode='PVG03'; end if;
    update private.polls set status='cancelled' where id=p.id;
    perform private.poll_event(p.id,actor,'cancelled',p.version+1,btrim(p_reason),p.creator_id);
  elsif p_action='record_decision' then
    if p.policy<>'governance' or p.status<>'closed' or p_disposition is null
      or p_disposition not in ('recommend','defer','decline') or not private.project_operational_text(p_reason,3,600)
      then raise exception 'decision unavailable' using errcode='PVG10'; end if;
    if exists(select 1 from private.poll_decisions where poll_id=p.id)
      then raise exception 'decision already recorded' using errcode='PVG09'; end if;
    if p_disposition='recommend' then
      recommended:=(p.final_result->>'winnerId')::uuid;
      if recommended is null or not exists(select 1 from private.poll_options o where o.id=recommended
        and private.poll_option_available(p,o))
        then raise exception 'result does not support recommendation' using errcode='PVG10'; end if;
    end if;
    insert into private.poll_decisions(poll_id,actor_id,disposition,recommended_option,reason)
      values(p.id,actor,p_disposition,recommended,btrim(p_reason));
    perform private.poll_event(p.id,actor,'decision_recorded',p.version+1,null,p.creator_id);
  else raise exception 'invalid poll action' using errcode='PVG03'; end if;
  update private.polls set version=version+1,updated_at=clock_timestamp() where id=p.id;
  return jsonb_build_object('id',p.id,'version',p.version+1);
end;
$$;

revoke all on function public.poll_save_for_client(uuid,jsonb),public.poll_vote_for_client(uuid,uuid),
  public.poll_nomination_for_client(uuid,uuid,text),public.poll_transition_for_client(uuid,text,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.poll_save_for_client(uuid,jsonb),public.poll_vote_for_client(uuid,uuid),
  public.poll_nomination_for_client(uuid,uuid,text),public.poll_transition_for_client(uuid,text,integer,text,text)
  to authenticated;
