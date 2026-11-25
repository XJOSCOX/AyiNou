-- Founder-only callers use an original-session administrative workspace. This summary reads governance metadata only.
create function private.c26_readiness(p_live_fixture boolean)
returns jsonb language sql stable set search_path='' as $$
  with appointments as (
    select a.actor,a.department scope,a.lane role,a.expires_at,
      case when a.state<>'active' then a.state when a.expires_at<=now() then 'expired'
        when private.c22_grant(a.actor,a.department,a.lane) is null then 'ineligible' else 'active' end state
    from private.c22_authority a
    union all
    select a.actor,a.department,'publication',a.expires_at,
      case when a.revoked_at is not null then 'revoked' when a.expires_at<=now() then 'expired'
        when private.c23_grant(a.actor,a.department) is null then 'ineligible' else 'active' end
    from private.c23_grants a
    union all
    select a.actor,'national','governance',a.expires_at,
      case when a.revoked_at is not null then 'revoked' when a.expires_at<=now() then 'expired'
        when not private.c24_governor(a.actor) then 'ineligible' else 'active' end
    from private.c24_governors a
  ), recent_appointments as (
    select * from appointments order by scope,role,actor limit 100
  ), roster_history as (
    select e.id,'evidence' track,e.department scope,e.action,e.happened_at,e.note reason
    from private.c22_events e where e.case_id is null and e.action in ('grant','revoke','suspend')
    union all
    select e.id,'publication',e.department,e.action,e.happened_at,e.reason
    from private.c23_events e where e.publication_id is null and e.action in ('grant','revoke')
  ), plans as (
    select distinct on (e.resource) e.current,e.resource
    from private.c24_events e where e.action='plan_reviewer' order by e.resource,e.version desc
  )
  select jsonb_build_object(
    'fixtureOperations',p_live_fixture,
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.actor,'scope',a.scope,'role',a.role,
      'label',coalesce(p.display_name,p.username),'expiresAt',a.expires_at,'status',a.state) order by a.scope,a.role,a.actor)
      from recent_appointments a left join public.profiles p on p.user_id=a.actor),'[]'),
    'rosterHistory',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'track',h.track,'scope',h.scope,
      'action',h.action,'at',h.happened_at,'reason',h.reason) order by h.happened_at desc,h.id)
      from (select * from roster_history order by happened_at desc,id limit 60) h),'[]'),
    'plans',coalesce((select jsonb_agg(p.current order by p.resource) from plans p),'[]')
  )
$$;
revoke all on function private.c26_readiness(boolean) from public,anon,authenticated,service_role;

create or replace function public.c24_manage_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='4s' as $$
declare s private.c24_settings; def private.c24_definitions; m private.c24_mappings; a private.c24_releases;
  g private.c24_governors; n private.c24_need_consents; l private.c14_links;
  x private.c23_publications; p private.community_projects; r private.c21_outcome_requests; f private.c22_findings; d private.c23_disclosures;
  receipt private.c24_events; previous jsonb; updated jsonb; snapshot jsonb; text_reason text; resource text;
  scope text; metric text; selected_year int; expected int; next_version int; request_key uuid; fingerprint bytea; ref uuid; target uuid;
  live_fixture boolean; plan_role text; plan_key text; slots int;
  chosen_years int[]; chosen_departments text[]; chosen_sectors text[]; expires timestamptz; moment timestamptz:=clock_timestamp();
begin
  if p_lane is null or p_lane not in ('founder','review','member') or p_action is null
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'invalid impact scope' using errcode='23514'; end if;
  live_fixture:=private.c24_enabled();
  if not live_fixture and not (p_lane='founder' and p_action in ('overview','configure','define','plan_reviewer')) then
    raise exception 'impact reporting disabled' using errcode='C2401';
  end if;
  if p_action not in ('overview','mapping_queue','mapping_read','need_read') then
    -- Serialize against the underlying review mutations before binding a receipt.
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform pg_advisory_xact_lock(20261125,220);
    perform private.s2b_lock_actor(p_actor,p_session);
    moment:=clock_timestamp();
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false)
    and private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false)
  then raise exception 'sign in required' using errcode='42501'; end if;
  if p_lane='founder' and not coalesce(private.platform_founder(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
  then raise exception 'Founder workspace required' using errcode='42501'; end if;
  if p_lane='review' and not private.c24_review_workspace(p_actor,p_session,p_aal2,p_totp,p_workspace)
  then raise exception 'review workspace required' using errcode='42501'; end if;
  select * into s from private.c24_settings;
  scope:=p_input->>'scope'; metric:=p_input->>'code'; ref:=(p_input->>'id')::uuid;
  selected_year:=(p_input->>'year')::int; expected:=(p_input->>'expectedVersion')::int;
  if p_action='overview' and p_lane in ('founder','review') then
    return jsonb_build_object('settings',case when p_lane='founder' and s.version is not null then to_jsonb(s)-'singleton' end,
      'globalReviewer',p_lane='review' and private.c24_governor(p_actor),
      'preparation',case when p_lane='founder' then private.c26_readiness(live_fixture) end,
      'catalog',case when p_lane='founder' or private.c24_governor(p_actor) then coalesce((
        select jsonb_agg(private.c24_catalog_row(q) order by q.code,q.version desc)
        from (select * from private.c24_definitions order by code,version desc limit 150) q),'[]') else '[]'::jsonb end,
      'releases',case when p_lane='founder' or private.c24_governor(p_actor) then coalesce((select jsonb_agg(jsonb_build_object(
        'year',b.report_year,'sector',b.sector,'version',b.version,'state',b.state,'fingerprint',encode(b.basis,'hex'),
        'preview',case when p_lane='review' and live_fixture and b.state='proposed' then b.projection end) order by b.report_year desc,b.sector)
        from (select * from private.c24_releases order by report_year desc,sector limit 70) b),'[]') else '[]'::jsonb end,
      'grants',case when p_lane='founder' then coalesce((select jsonb_agg(jsonb_build_object(
        'id',b.actor,'label',coalesce(h.display_name,h.username),'version',b.version,'expiresAt',b.expires_at,'revoked',b.revoked_at is not null))
        from (select * from private.c24_governors order by actor limit 100) b join public.profiles h on h.user_id=b.actor),'[]') else '[]'::jsonb end,
      'candidates',case when live_fixture and p_lane='founder' and char_length(p_input->>'search') between 2 and 60 then coalesce((
        select jsonb_agg(jsonb_build_object('id',j.user_id,'label',coalesce(j.display_name,j.username)))
        from (select h.* from public.profiles h where h.user_id<>p_actor and private.c22_identity(h.user_id)
          and exists(select from private.c23_grants z where z.actor=h.user_id and private.c23_grant(h.user_id,z.department) is not null)
          and (strpos(lower(coalesce(h.username,'')),lower(p_input->>'search'))>0
            or strpos(lower(coalesce(h.display_name,'')),lower(p_input->>'search'))>0) order by h.username limit 15) j),'[]') else '[]'::jsonb end,
      'history',case when p_lane='founder' then coalesce((select jsonb_agg(jsonb_build_object(
        'action',h.action,'at',h.happened_at,'reason',h.reason,'version',h.version) order by h.happened_at desc,h.id desc)
        from (select * from private.c24_events where action in ('configure','grant','revoke','define','approve_definition','plan_reviewer',
          'retire_definition','propose_report','seal_report','reject_report','suppress') order by happened_at desc,id desc limit 60) h),'[]')
        else '[]'::jsonb end);
  end if;
  if p_action='mapping_queue' and p_lane='review' then
    if private.c23_grant(p_actor,scope) is null then raise exception 'department grant required' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',q.publication,'version',q.version,
      'code',q.code,'year',q.report_year,'title',q.title,'state',q.state) order by q.publication)
      from (select b.*,v.proposal->>'title' title from private.c24_mappings b
        join private.c23_publications u on u.id=b.publication join private.community_projects pr on pr.id=b.project
        join private.c21_outcome_requests rr on rr.id=u.case_id
        join private.project_revisions v on v.project_id=pr.id and v.revision=pr.revision
        where b.department=scope and b.state='submitted' and u.state='approved'
          and (ref is null or b.publication>ref) and private.c24_mapping_reviewer(p_actor,pr,rr,u)
        order by b.publication limit 21) q),'[]');
  end if;
  if p_action in ('mapping_read','submit_mapping','approve_mapping','reject_mapping','withdraw_mapping') then
    select * into x from private.c23_publications where id=ref;
    if not found then raise exception 'publication unavailable' using errcode='O2003'; end if;
    select * into r from private.c21_outcome_requests where id=x.case_id;
    select * into p from private.community_projects where id=x.project_id;
    select * into f from private.c22_findings where id=x.finding_id;
    select * into d from private.c23_disclosures where publication_id=x.id and revision=x.revision;
    select * into m from private.c24_mappings where publication=x.id;
    if (p_lane='member' and (r.requester_id is distinct from p_actor or not coalesce(
        private.project_progress_manager(private.project_execution_role(p,p_actor)),false)))
       or (p_lane='review' and (m.publication is null or m.proposer=p_actor or not private.c24_mapping_reviewer(p_actor,p,r,x)))
       or p_lane not in ('member','review')
    then raise exception 'mapping unavailable' using errcode='O2003'; end if;
    if p_action<>'withdraw_mapping' and not private.c24_disclosure(x,p,r,f,d)
    then raise exception 'current disclosure required' using errcode='O2005'; end if;
    if f.measurement is not null then selected_year:=extract(year from (f.measurement->>'startsOn')::date)::int; end if;
    if p_action='mapping_read' then
      return jsonb_build_object('id',x.id,'version',coalesce(m.version,0),'state',m.state,'year',selected_year,'code',m.code,
        'disclosure',d.snapshot,'method',f.measurement->>'methodology',
        'reviewReference',case when p_lane='review' then (
          select latest.current->>'deliveryReference' from private.c24_events latest
          where latest.resource=x.id::text and latest.action='submit_mapping'
          order by latest.version desc limit 1) end,
        'catalog',coalesce((select jsonb_agg(private.c24_catalog_row(q) order by q.code)
          from (select b.* from private.c24_definitions b join private.project_revisions v on v.project_id=p.id and v.revision=p.revision
            where b.sector=private.c24_sector(v.proposal->>'category') and private.c24_compatible(b,r,f,selected_year) limit 30) q),'[]'));
    end if;
  elsif p_action in ('need_read','allow_need','withdraw_need') then
    if p_lane<>'member' then raise exception 'member scope required' using errcode='42501'; end if;
    select * into l from private.c14_links where id=ref and author=p_actor;
    if not found then raise exception 'association unavailable' using errcode='O2003'; end if;
    select * into n from private.c24_need_consents where link=l.id;
    if p_action='need_read' then
      return jsonb_build_object('version',coalesce(n.version,0),'consented',coalesce(n.consented and n.link_revision=l.revision,false));
    end if;
    if p_action='allow_need' and not (private.c14_enabled() and l.state='approved' and exists(
      select from private.c13_publications publication join private.c11_needs need on need.id=publication.need_id
      join private.community_projects project on project.id=l.project_id
      where publication.id=l.publication_id and private.c14_current(l,project,publication,need)))
    then raise exception 'current reviewed association required' using errcode='O2005'; end if;
  elsif p_lane='member' then raise exception 'member command unavailable' using errcode='42501';
  end if;
  request_key:=(p_input->>'requestId')::uuid;
  text_reason:=btrim(p_input->>'reason');
  if expected is null or expected not between 0 and 2147483646 or request_key is null
    or p_input->'confirmed' is distinct from 'true'::jsonb
    or not coalesce(private.project_operational_text(text_reason,10,500),false)
  then raise exception 'reason and confirmation required' using errcode='23514'; end if;
  fingerprint:=extensions.digest(jsonb_build_array(p_lane,p_action,p_input)::text,'sha256');
  select * into receipt from private.c24_events where actor=p_actor and request_id=request_key;
  if found then
    if receipt.command_hash is distinct from fingerprint then raise exception 'request changed' using errcode='O2002'; end if;
    return jsonb_build_object('version',receipt.version);
  end if;
  perform private.project_progress_limit(p_actor);
  if p_action='configure' and p_lane='founder' then
    if p_input - array['years','sectors','departments','links','measurements','needs','expectedVersion','requestId','confirmed','reason'] <> '{}'::jsonb
    then raise exception 'activation is outside configuration' using errcode='23514'; end if;
    if coalesce(s.version,0)<>expected then raise exception 'settings changed' using errcode='O2004'; end if;
    chosen_years:=array(select cast(v as int) from jsonb_array_elements_text(p_input->'years') v order by v);
    chosen_sectors:=array(select v from jsonb_array_elements_text(p_input->'sectors') v order by v);
    chosen_departments:=array(select v from jsonb_array_elements_text(p_input->'departments') v order by v);
    if cardinality(chosen_years) not between 1 and 5 or cardinality(chosen_departments) not between 1 and 10
      or cardinality(chosen_sectors) not between 1 and 7 or not (chosen_sectors<@private.c24_sectors())
      or exists(select from unnest(chosen_years) y where y is null or y<2020 or y>=extract(year from current_date))
      or not chosen_departments<@array(select code from public.departments)
      or cardinality(chosen_years)<>(select count(distinct z) from unnest(chosen_years) z)
      or cardinality(chosen_departments)<>(select count(distinct z) from unnest(chosen_departments) z)
      or cardinality(chosen_sectors)<>(select count(distinct z) from unnest(chosen_sectors) z)
    then raise exception 'invalid reporting dimensions' using errcode='23514'; end if;
    previous:=to_jsonb(s);
    insert into private.c24_settings(version,enabled,sectors,departments,years,measurements,needs,links)
      values(expected+1,false,chosen_sectors,chosen_departments,chosen_years,
        (p_input->>'measurements')::boolean,(p_input->>'needs')::boolean,(p_input->>'links')::boolean)
    on conflict(singleton) do update set version=excluded.version,sectors=excluded.sectors,
      departments=excluded.departments,years=excluded.years,measurements=excluded.measurements,needs=excluded.needs,links=excluded.links
    returning * into s;
    next_version:=s.version; updated:=to_jsonb(s); resource:='settings';
  elsif p_action='plan_reviewer' and p_lane='founder' then
    plan_role:=p_input->>'role'; slots:=(p_input->>'slots')::int;
    if jsonb_typeof(p_input->'slots') is distinct from 'number' or slots is null or slots not between 0 and 10
      or plan_role is null or scope is null
      or (plan_role='governance' and scope<>'national')
      or (plan_role<>'governance' and (plan_role not in ('initial','challenge','assign','publication','mapping')
        or not exists(select from public.departments where code=scope)))
      or p_input - array['scope','role','slots','expectedVersion','requestId','confirmed','reason'] <> '{}'::jsonb
    then raise exception 'invalid reviewer plan' using errcode='23514'; end if;
    plan_key:=scope||'/'||plan_role;
    select e.version,e.current into next_version,previous from private.c24_events e
      where e.action='plan_reviewer' and e.resource=plan_key order by e.version desc limit 1;
    resource:=plan_key;
    if expected<>coalesce(next_version,0) then raise exception 'staffing plan changed' using errcode='O2004'; end if;
    next_version:=expected+1;
    updated:=jsonb_build_object('scope',scope,'role',plan_role,'slots',slots,'version',next_version);
  elsif p_action in ('grant','revoke') and p_lane='founder' then
    target:=(p_input->>'target')::uuid;
    select * into g from private.c24_governors where actor=target;
    if expected<>coalesce(g.version,0) or target is null or target=p_actor then raise exception 'appointment changed' using errcode='O2004'; end if;
    previous:=to_jsonb(g);
    if p_action='grant' then
      expires:=(p_input->>'expiresAt')::timestamptz;
      if not private.c22_identity(target) or not exists(select from private.c23_grants existing where existing.actor=target
        and private.c23_grant(target,existing.department) is not null)
        or expires is null or expires<=moment or expires>moment+interval '180 days'
      then raise exception 'verified reviewer required' using errcode='42501'; end if;
      insert into private.c24_governors(actor,version,expires_at) values(target,expected+1,expires)
        on conflict(actor) do update set version=excluded.version,expires_at=excluded.expires_at,revoked_at=null returning * into g;
    else
      if g.actor is null or g.revoked_at is not null then raise exception 'appointment changed' using errcode='O2004'; end if;
      update private.c24_governors set revoked_at=moment,version=expected+1 where actor=target returning * into g;
    end if;
    next_version:=g.version; updated:=to_jsonb(g); resource:=target::text;
  elsif p_action in ('define','approve_definition','retire_definition') then
    if metric is null or metric !~ '^[a-z][a-z0-9_]{2,39}$' then raise exception 'invalid measurement code' using errcode='23514'; end if;
    select * into def from private.c24_definitions where code=metric order by version desc limit 1;
    if expected<>coalesce(def.version,0) then raise exception 'definition changed' using errcode='O2004'; end if;
    previous:=to_jsonb(def);
    if p_action='define' and p_lane='founder' then
      if not coalesce(p_input->>'sector'=any(private.c24_sectors()),false)
        or (def.code is not null and def.sector is distinct from p_input->>'sector')
        or not(private.c24_localized(p_input->'names') and private.c24_localized(p_input->'descriptions')
          and private.c24_localized(p_input->'methods') and private.c24_localized(p_input->'units'))
        or p_input->>'unit' !~ '^[a-z][a-z_]{1,23}$' or p_input->>'methodologyCode' !~ '^[A-Z][A-Z0-9_]{4,63}$'
        or (p_input->>'aggregatable')::boolean and
          (p_input->>'sector'='healthcare' or p_input->>'unit' not in ('desks','trees','items','classrooms','sessions','kilograms','hectares','meters','wells'))
      then raise exception 'invalid definition' using errcode='23514'; end if;
      if def.state='draft' then update private.c24_definitions set state='retired' where code=metric and version=def.version; end if;
      if expected>=25 or (def.code is null and (select count(distinct code) from private.c24_definitions)>=100)
      then raise exception 'catalog limit reached' using errcode='PFR29'; end if;
      insert into private.c24_definitions(code,version,sector,unit,classification,names,descriptions,methods,units,
        methodology_code,aggregatable,privacy,state,proposer) values(metric,expected+1,p_input->>'sector',p_input->>'unit',
        p_input->>'classification',p_input->'names',p_input->'descriptions',p_input->'methods',p_input->'units',
        p_input->>'methodologyCode',(p_input->>'aggregatable')::boolean,p_input->>'privacy','draft',p_actor) returning * into def;
    elsif p_action='approve_definition' and p_lane='review' and private.c24_governor(p_actor)
      and def.state='draft' and def.proposer is distinct from p_actor and p_input->'methodReviewed'='true'::jsonb then
      update private.c24_definitions set state='retired' where code=metric and state='active';
      update private.c24_definitions set state='active',reviewer=p_actor where code=metric and version=expected returning * into def;
    elsif p_action='retire_definition' and p_lane='founder' and def.state in ('draft','active') then
      update private.c24_definitions set state='retired' where code=metric and state in ('draft','active');
      select * into def from private.c24_definitions where code=metric and version=expected;
    else raise exception 'independent catalog authority required' using errcode='42501'; end if;
    next_version:=def.version; updated:=to_jsonb(def); resource:=metric;
  elsif p_action in ('submit_mapping','withdraw_mapping','approve_mapping','reject_mapping') then
    if expected<>coalesce(m.version,0) then raise exception 'mapping changed' using errcode='O2004'; end if;
    previous:=to_jsonb(m);
    if p_action='submit_mapping' and p_lane='member' then
      perform private.m23_resource_guard(p_actor,'project_manage','project',p.id);
      select * into def from private.c24_definitions where code=metric and version=(p_input->>'definitionVersion')::int;
      if not private.c24_compatible(def,r,f,selected_year) or not exists(select from private.c24_projects(selected_year,def.sector,array[x.department]) eligible where eligible.id=p.id
        and eligible.department=x.department) or p_input->>'deliveryReference' is null
        or p_input->>'deliveryReference' !~ '^[A-Z0-9][A-Z0-9_-]{7,79}$'
      then raise exception 'incompatible observation or delivery reference' using errcode='O2005'; end if;
      insert into private.c24_mappings(publication,version,project,department,report_year,source_id,source_revision,finding,
        disclosure_revision,disclosure_hash,code,definition_version,delivery_hash,proposer,state)
        values(x.id,expected+1,p.id,x.department,selected_year,r.source_id,r.source_revision,f.id,x.revision,d.fingerprint,
          def.code,def.version,extensions.digest(p_input->>'deliveryReference','sha256'),p_actor,'submitted')
      on conflict(publication) do update set version=excluded.version,department=excluded.department,report_year=excluded.report_year,
        source_id=excluded.source_id,source_revision=excluded.source_revision,finding=excluded.finding,
        disclosure_revision=excluded.disclosure_revision,disclosure_hash=excluded.disclosure_hash,code=excluded.code,
        definition_version=excluded.definition_version,delivery_hash=excluded.delivery_hash,proposer=excluded.proposer,
        reviewer=null,state='submitted'
      returning * into m;
    elsif p_action='withdraw_mapping' and p_lane='member' and m.state in ('submitted','approved','rejected') then
      update private.c24_mappings set state='withdrawn',version=expected+1 where publication=x.id returning * into m;
    elsif p_lane='review' and p_action in ('approve_mapping','reject_mapping') and m.state='submitted' then
      select * into def from private.c24_definitions where code=m.code and version=m.definition_version;
      if p_action='approve_mapping' and (not private.c24_compatible(def,r,f,selected_year)
        or m.finding<>f.id or m.source_revision<>r.source_revision or m.source_id<>r.source_id or m.disclosure_revision<>x.revision
        or m.disclosure_hash<>d.fingerprint or m.report_year<>selected_year or m.department<>x.department
        or p_input->'methodReviewed' is distinct from 'true'::jsonb)
      then raise exception 'mapping no longer matches inspected source' using errcode='O2005'; end if;
      update private.c24_mappings set state=case when p_action='approve_mapping' then 'approved' else 'rejected' end,
        version=expected+1,reviewer=p_actor where publication=x.id returning * into m;
    else raise exception 'mapping authority required' using errcode='42501'; end if;
    next_version:=m.version; resource:=x.id::text; updated:=to_jsonb(m);
    if p_action='submit_mapping' then updated:=updated||jsonb_build_object('deliveryReference',p_input->>'deliveryReference'); end if;
  elsif p_action in ('allow_need','withdraw_need') and p_lane='member' then
    if expected<>coalesce(n.version,0) or (p_action='withdraw_need' and n.consented is distinct from true)
    then raise exception 'association consent changed' using errcode='O2004'; end if;
    previous:=to_jsonb(n);
    insert into private.c24_need_consents(link,author,link_revision,consented,version)
      values(l.id,p_actor,l.revision,p_action='allow_need',expected+1)
       on conflict(link) do update set author=excluded.author,link_revision=excluded.link_revision,
         consented=excluded.consented,version=excluded.version returning * into n;
    next_version:=n.version; updated:=to_jsonb(n); resource:=l.id::text;
  elsif p_action in ('propose_report','seal_report','reject_report') then
    if not coalesce(s.enabled and selected_year=any(s.years) and scope=any(s.sectors),false)
    then raise exception 'configured year and sector required' using errcode='O2005'; end if;
    select * into a from private.c24_releases where report_year=selected_year and sector=scope;
    if expected<>coalesce(a.version,0) or a.state in ('sealed','suppressed')
    then raise exception 'report version unavailable' using errcode='O2004'; end if;
    previous:=to_jsonb(a)-'projection';
    if p_action='propose_report' and p_lane='founder' then
      snapshot:=private.c24_snapshot(selected_year,scope,s);
      if snapshot is null then raise exception 'report scope exceeds safe bounds' using errcode='PFR29'; end if;
      insert into private.c24_releases(report_year,sector,version,state,basis,projection,projects,proposer)
        values(selected_year,scope,expected+1,'proposed',decode(snapshot->>'basis','hex'),snapshot->'cells',
          array(select v::uuid from jsonb_array_elements_text(snapshot->'projects') v),p_actor)
      on conflict(report_year,sector) do update set version=excluded.version,state='proposed',basis=excluded.basis,
        projection=excluded.projection,projects=excluded.projects,proposer=excluded.proposer,reviewer=null returning * into a;
    elsif p_lane='review' and private.c24_governor(p_actor) and a.state='proposed' and a.proposer is distinct from p_actor
       and not exists(select from private.community_projects pr where pr.id=any(a.projects) and (
        private.project_conflicted(pr,p_actor) or pr.submitted_by=p_actor
        or exists(select from private.c23_publications cp join private.c21_outcome_requests cr on cr.id=cp.case_id
          join private.c22_findings cf on cf.id=cp.finding_id where cp.project_id=pr.id and cp.state='approved'
          and (cr.requester_id=p_actor or cf.reviewer=p_actor or exists(select from private.c23_events ce
            where ce.publication_id=cp.id and ce.actor=p_actor and ce.action in ('inspect','approve'))))
        or exists(select from private.c24_mappings cm where cm.project=pr.id and cm.state='approved'
          and p_actor in(cm.proposer,cm.reviewer))
        or exists(select from private.c14_links cl join private.c24_need_consents cn on cn.link=cl.id
          where cl.project_id=pr.id and cn.consented and p_actor in(cl.author,cl.organizer,cl.reviewer))))
    then
      if p_action='seal_report' then
        snapshot:=private.c24_snapshot(selected_year,scope,s);
        if snapshot->>'basis' is distinct from encode(a.basis,'hex') or p_input->>'fingerprint' is distinct from encode(a.basis,'hex')
          or p_input->'methodReviewed' is distinct from 'true'::jsonb
          or exists(select from private.c24_releases prior where prior.state in ('sealed','suppressed') and prior.projects && a.projects)
        then raise exception 'review the current distinct reporting cohort again' using errcode='O2004'; end if;
      end if;
      update private.c24_releases set state=case when p_action='seal_report' then 'sealed' else 'rejected' end,
        version=expected+1,reviewer=p_actor where report_year=selected_year and sector=scope returning * into a;
    else raise exception 'independent report reviewer required' using errcode='42501'; end if;
    next_version:=a.version; updated:=to_jsonb(a)-'projection'; resource:=selected_year||'/'||scope;
  else raise exception 'impact command unavailable' using errcode='42501';
  end if;
  insert into private.c24_events(actor,workspace,request_id,command_hash,action,resource,version,previous,current,reason)
    values(p_actor,p_workspace,request_key,fingerprint,p_action,resource,next_version,previous,updated,text_reason);
  return jsonb_build_object('version',next_version);
end
$$;

revoke all on function public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb) from public,anon,authenticated;
