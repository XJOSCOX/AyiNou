create function public.project_milestone_for_client(p_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; m private.project_milestones; t private.project_tasks;
  actor_role text; execution text; resource uuid; responsible uuid; entry_key uuid; fingerprint bytea; expected integer;
  next_state text; note text; name text; milestone_description text; starts date; due date; quantity numeric; units text; position integer; listed boolean;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>12000 then raise exception 'invalid milestone' using errcode='22023'; end if;
  p:=private.project_progress_lock(p_id);
  actor_role:=private.project_execution_role(p,actor);
  if actor_role is null or actor_role='delegate' then raise exception 'access denied' using errcode='42501'; end if;
  select status into execution from private.project_execution where project_id=p.id;
  if execution is distinct from 'active' and p_action is distinct from 'milestone_hide'
    then raise exception 'project not active' using errcode='PJB01'; end if;
  expected:=(p_data->>'version')::integer;
  note:=p_data->>'reason';
  if p_action='task_milestone' then
    select * into t from private.project_tasks where project_id=p.id and id=(p_data->>'id')::uuid;
    if not found or not private.project_task_visible(p,t,actor,actor_role) then raise exception 'task unavailable' using errcode='PJB05'; end if;
    if not private.project_permission(actor_role,'tasks.edit')
      or (actor_role='supervisor' and t.created_by is distinct from actor) then raise exception 'access denied' using errcode='42501'; end if;
    if expected is distinct from t.version then raise exception 'stale task' using errcode='PJB06'; end if;
    resource:=(p_data->>'milestoneId')::uuid;
    if resource is not null and not exists(select 1 from private.project_milestones
      where project_id=p.id and id=resource and status<>'cancelled') then raise exception 'milestone unavailable' using errcode='PJC04'; end if;
    if resource is not distinct from t.milestone_id then return jsonb_build_object('id',t.id,'version',t.version); end if;
    perform private.project_require_identity(actor);
    perform private.project_progress_limit(actor);
    update private.project_tasks set milestone_id=resource,version=version+1,updated_at=clock_timestamp() where id=t.id;
    perform private.project_progress_event(p.id,coalesce(resource,t.milestone_id),actor,null,p_action,null,
      jsonb_build_object('previous',t.milestone_id,'current',resource),t.id);
    return jsonb_build_object('id',t.id,'version',t.version+1);
  end if;

  if p_action<>'milestone_create' then
    select * into m from private.project_milestones where project_id=p.id and id=(p_data->>'id')::uuid;
    if not found then raise exception 'milestone unavailable' using errcode='PJC04'; end if;
    if expected is distinct from m.version then raise exception 'stale milestone' using errcode='PJC09'; end if;
    if not private.project_progress_manager(actor_role) and m.responsible_id is distinct from actor
      then raise exception 'access denied' using errcode='42501'; end if;
  end if;

  if p_action in ('milestone_create','milestone_edit') then
    if not private.project_progress_manager(actor_role) then raise exception 'access denied' using errcode='42501'; end if;
    perform private.project_require_identity(actor);
    if p_action='milestone_create' then
      entry_key:=(p_data->>'key')::uuid;
      if entry_key is null then raise exception 'missing idempotency key' using errcode='22023'; end if;
      fingerprint:=sha256(convert_to((p_data-'key')::text,'UTF8'));
      select * into m from private.project_milestones x where x.project_id=p.id and x.creator_id=actor and x.request_key=entry_key;
      if found then
        if m.request_digest<>fingerprint then raise exception 'idempotency conflict' using errcode='PJC09'; end if;
        return jsonb_build_object('id',m.id,'version',m.version);
      end if;
      if (select count(*) from private.project_milestones where project_id=p.id)>=60
        then raise exception 'milestone limit' using errcode='PFR29'; end if;
    elsif m.status not in ('planned','in_progress','blocked') then raise exception 'milestone unavailable' using errcode='PJC09'; end if;
    name:=btrim(p_data->>'title'); milestone_description:=btrim(p_data->>'description');
    starts:=(p_data->>'startsOn')::date; due:=(p_data->>'targetOn')::date;
    quantity:=(p_data->>'target')::numeric; units:=btrim(p_data->>'unit'); position:=(p_data->>'displayOrder')::integer;
    listed:=(p_data->>'publicRequested')::boolean; responsible:=(p_data->>'responsibleId')::uuid;
    if not private.project_operational_text(name,3,120) or not private.project_operational_text(milestone_description,3,1500)
      or (starts is not null and due is not null and starts>due) or coalesce(position,-1) not between 0 and 10000
      or listed is null or (quantity is null)<>(units is null)
      or (quantity is not null and (quantity not between 0 and 100000000 or scale(quantity)>2
        or not private.project_operational_text(units,1,48))) then raise exception 'invalid milestone' using errcode='22023'; end if;
    if responsible is distinct from m.responsible_id then
      if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
      if responsible is not null and (responsible=actor or private.project_execution_role(p,responsible) is null
        or feed_data.blocked_pair(actor,responsible) or not exists(select 1 from private.project_team
          where project_id=p.id and user_id=responsible and revoked_at is null))
        then raise exception 'responsible participant unavailable' using errcode='PJC04'; end if;
    end if;
    perform private.project_progress_limit(actor);
    if p_action='milestone_create' then
      insert into private.project_milestones(project_id,creator_id,request_key,request_digest,title,description,starts_on,target_on,
        target,unit,display_order,public_requested,responsible_id)
        values(p.id,actor,entry_key,fingerprint,name,milestone_description,starts,due,quantity,units,position,listed,responsible) returning * into m;
    else
      update private.project_milestones set title=name,description=milestone_description,starts_on=starts,target_on=due,
        target=quantity,unit=units,display_order=position,public_requested=listed,responsible_id=responsible,
        version=version+1,updated_at=clock_timestamp() where id=m.id returning * into m;
    end if;
    perform private.project_progress_event(p.id,m.id,actor,responsible,
      case when responsible is not null then 'milestone_assigned' else p_action end,null,
      to_jsonb(m)-'request_digest'-'request_key');
    return jsonb_build_object('id',m.id,'version',m.version);
  end if;

  if p_action in ('milestone_start','milestone_block','milestone_submit') then
    if m.status not in ('planned','in_progress','blocked') then raise exception 'milestone changed' using errcode='PJC09'; end if;
    if p_action<>'milestone_submit' and not (private.project_progress_manager(actor_role) or actor_role='supervisor')
      then raise exception 'access denied' using errcode='42501'; end if;
    next_state:=case p_action when 'milestone_start' then 'in_progress' when 'milestone_block' then 'blocked' else 'submitted' end;
  elsif p_action in ('milestone_approve','milestone_return','milestone_cancel','milestone_hide') then
    if not private.project_progress_manager(actor_role) then raise exception 'access denied' using errcode='42501'; end if;
    if p_action in ('milestone_approve','milestone_return') then
      if m.status<>'submitted' then raise exception 'milestone changed' using errcode='PJC09'; end if;
      perform private.project_progress_review(actor_role,actor,m.submitter_id);
      if p_action='milestone_approve' and m.public_requested and m.creator_id=actor
        then raise exception 'public milestone reviewer conflict' using errcode='PJC03'; end if;
      if p_action='milestone_approve' and private.project_execution_role(p,m.submitter_id) is null
        then raise exception 'submitter unavailable' using errcode='PJC03'; end if;
    else
      perform private.project_require_identity(actor);
      if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
      if (p_action='milestone_cancel' and m.status in ('completed','cancelled'))
        or (p_action='milestone_hide' and (m.status<>'completed' or not m.public_requested))
        then raise exception 'milestone changed' using errcode='PJC09'; end if;
    end if;
    if not private.project_operational_text(note,3,600) then raise exception 'reason required' using errcode='22023'; end if;
    next_state:=case p_action when 'milestone_approve' then 'completed' when 'milestone_return' then 'in_progress'
      when 'milestone_cancel' then 'cancelled' else m.status end;
  else raise exception 'invalid milestone operation' using errcode='22023'; end if;
  perform private.project_progress_limit(actor);
  update private.project_milestones set status=next_state,version=version+1,updated_at=clock_timestamp(),
    public_requested=case when p_action='milestone_hide' then false else public_requested end,
    submitter_id=case when p_action='milestone_submit' then actor else submitter_id end,
    reviewer_id=case when p_action in ('milestone_approve','milestone_return') then actor else reviewer_id end
    where id=m.id;
  select e.operator_id into responsible from private.project_execution e where e.project_id=p.id;
  if p_action='milestone_submit' and (responsible=actor or private.project_execution_role(p,responsible) is distinct from 'owner') then
    select team.user_id into responsible from private.project_team team where team.project_id=p.id and team.user_id<>actor
      and private.project_execution_role(p,team.user_id)='manager'
      and (not m.public_requested or team.user_id is distinct from m.creator_id)
      order by team.joined_at,team.user_id limit 1;
  end if;
  perform private.project_progress_event(p.id,m.id,actor,case when p_action='milestone_submit' then responsible
    when p_action in ('milestone_approve','milestone_return') then m.submitter_id end,
    case p_action when 'milestone_submit' then 'milestone_submitted' when 'milestone_approve' then 'milestone_approved'
      when 'milestone_return' then 'milestone_returned' else p_action end,note,
    jsonb_build_object('from',m.status,'to',next_state,'version',m.version+1));
  return jsonb_build_object('id',m.id,'version',m.version+1);
end;
$$;
revoke all on function public.project_milestone_for_client(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_milestone_for_client(uuid,text,jsonb) to authenticated;

create function public.project_metric_for_client(p_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; m private.project_metrics; observation private.project_metric_observations;
  label text; units text; quantity numeric; first_day date; last_day date; explanation_text text; source_url text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>6000 then raise exception 'invalid metric' using errcode='PJC05'; end if;
  p:=private.project_progress_lock(p_id);
  if not private.project_progress_manager(private.project_execution_role(p,actor)) then raise exception 'access denied' using errcode='42501'; end if;
  perform private.project_require_identity(actor);
  if not exists(select 1 from private.project_execution where project_id=p.id and status='active')
    then raise exception 'project not active' using errcode='PJB01'; end if;
  if p_action in ('metric_create','metric_edit') then
    label:=btrim(p_data->>'name'); units:=btrim(p_data->>'unit'); quantity:=(p_data->>'target')::numeric;
    if not private.project_operational_text(label,2,80) or not private.project_operational_text(units,1,48)
      or quantity is null or quantity not between 0 and 100000000 or scale(quantity)>2
      then raise exception 'invalid metric' using errcode='PJC05'; end if;
    if p_action='metric_create' then
      select * into m from private.project_metrics x where x.project_id=p.id and lower(x.name)=lower(label);
      if found then
        if m.creator_id=actor and m.name=label and m.unit=units and m.target=quantity
          then return jsonb_build_object('id',m.id,'version',m.version); end if;
        raise exception 'duplicate metric' using errcode='PJC05';
      end if;
      if (select count(*) from private.project_metrics where project_id=p.id)>=30 then raise exception 'metric limit' using errcode='PFR29'; end if;
      perform private.project_progress_limit(actor);
      insert into private.project_metrics(project_id,creator_id,name,unit,target) values(p.id,actor,label,units,quantity) returning * into m;
    else
      select * into m from private.project_metrics where id=(p_data->>'id')::uuid and project_id=p.id;
      if not found then raise exception 'metric unavailable' using errcode='PJC05'; end if;
      if m.version is distinct from (p_data->>'version')::integer
        or exists(select 1 from private.project_metric_observations where metric_id=m.id)
        then raise exception 'metric changed or already measured' using errcode='PJC09'; end if;
      if exists(select 1 from private.project_metrics x where x.project_id=p.id and lower(x.name)=lower(label) and x.id<>m.id)
        then raise exception 'duplicate metric' using errcode='PJC05'; end if;
      perform private.project_progress_limit(actor);
      update private.project_metrics set name=label,unit=units,target=quantity,version=version+1 where id=m.id returning * into m;
    end if;
    perform private.project_progress_event(p.id,m.id,actor,null,p_action,null,to_jsonb(m));
    return jsonb_build_object('id',m.id,'version',m.version);
  elsif p_action='metric_observe' then
    select * into m from private.project_metrics where id=(p_data->>'id')::uuid and project_id=p.id;
    if not found then raise exception 'metric unavailable' using errcode='PJC05'; end if;
    first_day:=(p_data->>'startsOn')::date; last_day:=(p_data->>'endsOn')::date; quantity:=(p_data->>'actual')::numeric;
    explanation_text:=btrim(p_data->>'explanation'); source_url:=p_data->>'reference';
    if first_day is null or last_day is null or first_day<'2000-01-01' or last_day>current_date or last_day-first_day not between 0 and 366
      or quantity is null or quantity not between 0 and 100000000 or scale(quantity)>2
      or not private.project_operational_text(explanation_text,3,800)
      or not private.valid_public_references(case when source_url is null then '{}'::text[] else array[source_url] end)
      then raise exception 'invalid observation' using errcode='PJC05'; end if;
    select * into observation from private.project_metric_observations x where x.metric_id=m.id
      and x.starts_on=first_day and x.ends_on=last_day;
    if found and observation.reporter_id=actor and observation.actual=quantity and observation.explanation=explanation_text
      and observation.reference is not distinct from source_url then return jsonb_build_object('id',observation.id); end if;
    if exists(select 1 from private.project_metric_observations x where x.metric_id=m.id
      and x.starts_on<=last_day and x.ends_on>=first_day)
      then raise exception 'measurement period overlaps' using errcode='PJC05'; end if;
    if (select count(*) from private.project_metric_observations where metric_id=m.id)>=120
      then raise exception 'measurement limit' using errcode='PFR29'; end if;
    perform private.project_progress_limit(actor);
    insert into private.project_metric_observations(project_id,metric_id,reporter_id,starts_on,ends_on,actual,explanation,reference)
      values(p.id,m.id,actor,first_day,last_day,quantity,explanation_text,source_url) returning * into observation;
    perform private.project_progress_event(p.id,m.id,actor,null,p_action,null,to_jsonb(observation));
    return jsonb_build_object('id',observation.id);
  end if;
  raise exception 'invalid metric operation' using errcode='22023';
end;
$$;
revoke all on function public.project_metric_for_client(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_metric_for_client(uuid,text,jsonb) to authenticated;

create function private.project_progress_content(value jsonb,p_kind text,p_correction boolean)
returns boolean language plpgsql stable set search_path='' as $$
declare k text; refs text[];
begin
  if jsonb_typeof(value) is distinct from 'object' or pg_column_size(value)>14500
    or value-array['title','description','summary','language','references','includeMetrics','unfinished','challenges','lessons','nextSteps','correction']
      <>'{}'::jsonb
    or exists(select 1 from jsonb_each(value) j where j.key not in ('references','includeMetrics') and jsonb_typeof(j.value)<>'string')
    or not private.project_operational_text(value->>'title',3,120)
    or not private.project_operational_text(value->>'description',3,2400)
    or not private.project_operational_text(value->>'summary',3,1200)
    or coalesce(value->>'language','') not in ('ht','fr','en','es')
    or jsonb_typeof(value->'references') is distinct from 'array'
    or jsonb_typeof(value->'includeMetrics') is distinct from 'boolean'
    or (p_correction and not private.project_operational_text(value->>'correction',3,600))
    then return false; end if;
  if p_kind<>'report' and value ?| array['unfinished','challenges','lessons','nextSteps'] then return false; end if;
  if p_kind='report' then
    foreach k in array array['unfinished','challenges','lessons'] loop
      if not private.project_operational_text(value->>k,3,1200) then return false; end if;
    end loop;
    if value->>'nextSteps' is not null and not private.project_operational_text(value->>'nextSteps',1,1200)
      then return false; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(value->'references') x where jsonb_typeof(x)<>'string') then return false; end if;
  refs:=array(select jsonb_array_elements_text(value->'references'));
  return private.valid_public_references(refs);
end;
$$;

create function private.project_progress_snapshot(p private.community_projects,p_kind text,p_include_metrics boolean,p_public boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'objectives',case when p_kind='report' then (select r.proposal->>'objectives' from private.project_revisions r
      join private.project_execution e on e.project_id=r.project_id and e.approved_revision=r.revision
      where r.project_id=p.id) end,
    'completedOn',case when p_kind='report' then private.project_completion_on(p.id) end,
    'milestones',case when p_kind='report' then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'date',m.updated_at)
      order by m.display_order,m.id) from private.project_milestones m where m.project_id=p.id and m.status='completed'
        and (not p_public or m.public_requested)),'[]') end,
    'metrics',case when p_include_metrics then coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'unit',m.unit,'target',m.target,
      'actual',o.actual,'startsOn',o.starts_on,'endsOn',o.ends_on,'source','self_reported') order by m.name)
      from private.project_metrics m join lateral (select x.actual,x.starts_on,x.ends_on from private.project_metric_observations x
        where x.metric_id=m.id order by x.ends_on desc limit 1) o on true where m.project_id=p.id),'[]') end);
$$;
revoke all on function private.project_progress_content(jsonb,text,boolean),
  private.project_progress_snapshot(private.community_projects,text,boolean,boolean) from public,anon,authenticated,service_role;

create function public.project_progress_entry_for_client(p_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p private.community_projects; entry private.project_progress_entries; old_entry private.project_progress_entries;
  actor_role text; author_role text; execution text; entry_kind text; scope text; milestone uuid; parent uuid; entry_key uuid; fingerprint bytea;
  payload jsonb; summary_snapshot jsonb; note text; new_state text; target uuid;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16000 then raise exception 'invalid progress entry' using errcode='22023'; end if;
  p:=private.project_progress_lock(p_id);
  actor_role:=private.project_execution_role(p,actor);
  if actor_role is null or actor_role='delegate' then raise exception 'access denied' using errcode='42501'; end if;
  select status,operator_id into execution,target from private.project_execution where project_id=p.id;
  if p_action<>'entry_create' then
    select * into entry from private.project_progress_entries where project_id=p.id and id=(p_data->>'id')::uuid;
    if not found or feed_data.blocked_pair(actor,entry.author_id)
      or (entry.author_id is distinct from actor and not private.project_progress_manager(actor_role))
      then raise exception 'progress entry unavailable' using errcode='PJC04'; end if;
    if entry.version is distinct from (p_data->>'version')::integer then raise exception 'progress entry changed' using errcode='PJC09'; end if;
    entry_kind:=entry.kind; scope:=entry.visibility; milestone:=entry.milestone_id; parent:=entry.supersedes_id;
  else
    entry_kind:=p_data->>'kind'; scope:=p_data->>'visibility'; milestone:=(p_data->>'milestoneId')::uuid;
    parent:=(p_data->>'supersedesId')::uuid;
    if coalesce(entry_kind,'') not in ('update','evidence','report') or coalesce(scope,'') not in ('team','public')
      or (entry_kind='evidence' and scope<>'team') or (entry_kind='report' and milestone is not null)
      then raise exception 'invalid progress entry' using errcode='22023'; end if;
  end if;
  if p_action<>'entry_withdraw' then
    if entry_kind='report' then
      if execution not in ('completed','archived') or private.project_completion_on(p.id) is null then
        raise exception 'recorded completion required' using errcode='PJC08'; end if;
    elsif execution is distinct from 'active' then
      raise exception 'project not active' using errcode='PJB01';
    end if;
  end if;
  if entry_kind='report' and (p_action in ('entry_create','entry_edit','entry_submit') and actor_role<>'owner')
    then raise exception 'access denied' using errcode='42501'; end if;
  if entry_kind='report' and p_action in ('entry_create','entry_edit','entry_submit') then perform private.project_require_identity(actor); end if;
  if milestone is not null and p_action<>'entry_withdraw' and not exists(select 1 from private.project_milestones m
    where m.id=milestone and m.project_id=p.id and m.status<>'cancelled'
      and (scope='team' or (m.status='completed' and m.public_requested)))
      then raise exception 'milestone unavailable for selected visibility' using errcode='PJC04'; end if;

  if p_action='entry_remove_image' then
    if entry.author_id is distinct from actor or entry.state not in ('draft','returned') then
      raise exception 'entry unavailable for editing' using errcode='PJC09'; end if;
    if entry.image_digest is null then return jsonb_build_object('id',entry.id,'version',entry.version); end if;
    perform private.project_progress_limit(actor);
    update private.project_progress_entries set image_digest=null,version=version+1,updated_at=clock_timestamp() where id=entry.id;
    perform private.project_remove_unreferenced_progress_image(p.id,entry.image_digest);
    perform private.project_progress_event(p.id,entry.id,actor,null,p_action);
    return jsonb_build_object('id',entry.id,'version',entry.version+1);
  end if;

  if p_action in ('entry_create','entry_edit') then
    payload:=p_data->'content';
    if not private.project_progress_content(payload,entry_kind,parent is not null) then
      raise exception 'invalid progress content' using errcode='22023'; end if;
    if scope='public' and not private.project_visible(p)
      then raise exception 'project publication unavailable' using errcode='PJP04'; end if;
    if p_action='entry_create' then
      entry_key:=(p_data->>'key')::uuid;
      if entry_key is null then raise exception 'missing idempotency key' using errcode='22023'; end if;
      fingerprint:=sha256(convert_to((p_data-'key')::text,'UTF8'));
      select * into entry from private.project_progress_entries x where x.project_id=p.id and x.author_id=actor and x.request_key=entry_key;
      if found then
        if entry.request_digest<>fingerprint then raise exception 'idempotency conflict' using errcode='PJC09'; end if;
        return jsonb_build_object('id',entry.id,'version',entry.version);
      end if;
      if parent is not null then
        select * into old_entry from private.project_progress_entries where project_id=p.id and id=parent and kind=entry_kind
          and visibility=scope and state in ('approved','withdrawn') and approved_at is not null;
        if not found or (old_entry.author_id is distinct from actor and not private.project_progress_manager(actor_role))
          or exists(select 1 from private.project_progress_entries x where x.supersedes_id=parent and x.state not in ('rejected','withdrawn'))
          then raise exception 'correction unavailable' using errcode='PJC09'; end if;
      elsif entry_kind='report' and exists(select 1 from private.project_progress_entries x where x.project_id=p.id
        and x.kind='report' and x.visibility=scope and x.supersedes_id is null
        and (x.approved_at is not null or x.state not in ('rejected','withdrawn')))
        then raise exception 'existing final report requires a correction' using errcode='PJC09'; end if;
      if (select count(*) from private.project_progress_entries where project_id=p.id)>=120
        then raise exception 'progress entry limit' using errcode='PFR29'; end if;
      perform private.project_progress_limit(actor);
      insert into private.project_progress_entries(project_id,milestone_id,author_id,supersedes_id,kind,visibility,request_key,request_digest,content)
        values(p.id,milestone,actor,parent,entry_kind,scope,entry_key,fingerprint,payload) returning * into entry;
    else
      if entry.author_id is distinct from actor or entry.state not in ('draft','returned')
        then raise exception 'entry unavailable for editing' using errcode='PJC09'; end if;
      perform private.project_progress_limit(actor);
      update private.project_progress_entries set content=payload,version=version+1,updated_at=clock_timestamp()
        where id=entry.id returning * into entry;
    end if;
    perform private.project_progress_event(p.id,entry.id,actor,null,p_action,null,entry.content);
    return jsonb_build_object('id',entry.id,'version',entry.version);
  end if;

  note:=p_data->>'reason';
  if p_action='entry_submit' then
    if entry.author_id is distinct from actor or entry.state not in ('draft','returned')
      then raise exception 'entry changed' using errcode='PJC09'; end if;
    if scope='public' and not private.project_visible(p)
      then raise exception 'project publication unavailable' using errcode='PJP04'; end if;
    summary_snapshot:=private.project_progress_snapshot(p,entry_kind,(entry.content->>'includeMetrics')::boolean,scope='public');
    if scope='team' and entry_kind='update' and entry.image_digest is null then new_state:='approved';
    else
      new_state:='submitted';
      if target=actor or private.project_execution_role(p,target) is distinct from 'owner' then
        select t.user_id into target from private.project_team t where t.project_id=p.id and t.user_id<>actor
          and private.project_execution_role(p,t.user_id)='manager' order by t.joined_at,t.user_id limit 1;
      end if;
    end if;
  elsif p_action in ('entry_approve','entry_return','entry_reject') then
    if entry.state<>'submitted' then raise exception 'entry changed' using errcode='PJC09'; end if;
    perform private.project_progress_review(actor_role,actor,entry.author_id);
    if not private.project_operational_text(note,3,600) then raise exception 'reason required' using errcode='22023'; end if;
    if p_action='entry_approve' then
      author_role:=private.project_execution_role(p,entry.author_id);
      if author_role is null or author_role='delegate' or (entry_kind='report' and author_role<>'owner')
        then raise exception 'submitter unavailable' using errcode='PJC03'; end if;
      if scope='public' and not private.project_visible(p)
        then raise exception 'project publication unavailable' using errcode='PJP04'; end if;
    end if;
    new_state:=case p_action when 'entry_approve' then 'approved' when 'entry_return' then 'returned' else 'rejected' end;
    target:=entry.author_id;
  elsif p_action='entry_withdraw' then
    if entry.state='withdrawn' or (entry.author_id is distinct from actor and not private.project_progress_manager(actor_role))
      then raise exception 'entry unavailable' using errcode='PJC04'; end if;
    if entry.state='approved' then
      if not private.project_progress_manager(actor_role) then raise exception 'access denied' using errcode='42501'; end if;
      perform private.project_require_identity(actor);
      if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
    end if;
    if not private.project_operational_text(note,3,600) then raise exception 'reason required' using errcode='22023'; end if;
    new_state:='withdrawn'; target:=null;
  else raise exception 'invalid progress operation' using errcode='22023'; end if;
  perform private.project_progress_limit(actor);
  update private.project_progress_entries set state=new_state,version=version+1,updated_at=clock_timestamp(),
    reviewer_id=case when p_action in ('entry_approve','entry_return','entry_reject') then actor
      when p_action='entry_submit' then null else reviewer_id end,
    snapshot=case when p_action='entry_submit' then summary_snapshot else snapshot end,
    approved_at=case when new_state='approved' then clock_timestamp() else approved_at end
    where id=entry.id;
  perform private.project_progress_event(p.id,entry.id,actor,target,
    case when new_state='approved' and entry_kind='report' then 'report_published'
      when new_state='submitted' and entry_kind='report' then 'report_submitted'
      when new_state='returned' and entry_kind='report' then 'report_returned'
      when new_state='rejected' and entry_kind='report' then 'report_rejected'
      when new_state='approved' and p_action='entry_submit' then 'team_update_shared' else p_action end,note,
    jsonb_build_object('from',entry.state,'to',new_state,'version',entry.version+1));
  return jsonb_build_object('id',entry.id,'version',entry.version+1);
end;
$$;
revoke all on function public.project_progress_entry_for_client(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_progress_entry_for_client(uuid,text,jsonb) to authenticated;

create function public.project_progress_image_for_api(p_actor uuid,p_id uuid,p_entry uuid,p_version integer,p_webp text)
returns integer language plpgsql security definer set search_path='' as $$
declare p private.community_projects; entry private.project_progress_entries; raw bytea; fingerprint text; actor_role text;
begin
  p:=private.project_progress_lock(p_id);
  select * into entry from private.project_progress_entries where project_id=p.id and id=p_entry;
  actor_role:=private.project_execution_role(p,p_actor);
  if not found or entry.author_id is distinct from p_actor or actor_role is null or actor_role='delegate'
    then raise exception 'evidence unavailable' using errcode='PJC06'; end if;
  if entry.version is distinct from p_version or entry.state not in ('draft','returned')
    then raise exception 'entry changed' using errcode='PJC09'; end if;
  if entry.kind='report' then
    if actor_role<>'owner' or private.project_completion_on(p.id) is null or not exists(
      select 1 from private.project_execution where project_id=p.id and status in ('completed','archived'))
      then raise exception 'evidence unavailable' using errcode='PJC06'; end if;
  elsif not exists(select 1 from private.project_execution where project_id=p.id and status='active')
    then raise exception 'project not active' using errcode='PJB01'; end if;
  if char_length(coalesce(p_webp,'')) not between 22 and 699052 then raise exception 'invalid image' using errcode='22023'; end if;
  raw:=decode(p_webp,'base64');
  if octet_length(raw) not between 16 and 524288 or substring(raw,1,4)<>convert_to('RIFF','UTF8')
    or substring(raw,9,4)<>convert_to('WEBP','UTF8') then raise exception 'invalid image' using errcode='22023'; end if;
  fingerprint:=encode(sha256(raw),'hex');
  if fingerprint is not distinct from entry.image_digest then return entry.version; end if;
  perform feed_data.consume_limit(p_actor,'project_image',5);
  insert into private.project_images(project_id,digest,image) values(p.id,fingerprint,raw) on conflict(project_id,digest) do nothing;
  update private.project_progress_entries set image_digest=fingerprint,version=version+1,updated_at=clock_timestamp() where id=entry.id;
  perform private.project_remove_unreferenced_progress_image(p.id,entry.image_digest);
  perform private.project_progress_event(p.id,entry.id,p_actor,null,'entry_image',null,jsonb_build_object('version',entry.version+1));
  return entry.version+1;
end;
$$;
revoke all on function public.project_progress_image_for_api(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.project_progress_image_for_api(uuid,uuid,uuid,integer,text) to service_role;
