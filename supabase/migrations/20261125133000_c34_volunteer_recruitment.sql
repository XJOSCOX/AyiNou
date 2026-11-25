-- Opportunity outreach is an invitation to use the native application, never a role.
create table private.c34_fixture(singleton boolean primary key check(singleton));
create table private.c34_contact(
  actor uuid primary key references private.c31_profiles(actor) on delete cascade,
  allowed boolean not null, version integer not null check(version>0),
  request uuid not null, changed_at timestamptz not null default clock_timestamp()
);
create table private.c34_configuration(
  version integer primary key check(version>0), settings jsonb not null,
  actor uuid references auth.users(id) on delete set null, workspace uuid not null,
  request uuid unique not null, fingerprint text not null, reason text not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create table private.c34_invitations(
  id uuid primary key default gen_random_uuid(),
  project uuid not null, opportunity uuid not null, requirement integer not null,
  organizer uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  message text not null check(length(message) between 1 and 400),
  status text not null default 'pending' check(status in ('pending','application_initiated','declined','withdrawn','expired','invalidated')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null, changed_at timestamptz not null default clock_timestamp(),
  dismissed_at timestamptz,
  application uuid unique references private.project_applications(id) on delete set null,
  foreign key(project,opportunity) references private.project_opportunities(project_id,id) on delete cascade,
  foreign key(opportunity,requirement) references private.c32_requirements(opportunity,version) on delete cascade,
  check(organizer<>recipient)
);
create unique index c34_one_pending on private.c34_invitations(opportunity,recipient) where status='pending';
create index c34_recipient on private.c34_invitations(recipient,id);
create index c34_organizer on private.c34_invitations(organizer,id);
create index c34_opportunity on private.c34_invitations(opportunity,id);
create index c34_project_pending on private.c34_invitations(project,id) where status='pending';
create index c34_recent_organizer on private.c34_invitations(organizer,created_at desc);
create index c34_recent_recipient on private.c34_invitations(recipient,created_at desc);
create index c34_recent_opportunity on private.c34_invitations(opportunity,created_at desc);
create index c34_pair_cooldown on private.c34_invitations(organizer,recipient,changed_at desc);
create index c34_opportunity_cooldown on private.c34_invitations(opportunity,recipient,changed_at desc);
create index c34_origin_active on private.c34_invitations(opportunity,recipient) where status in ('pending','application_initiated');
create index c34_pending on private.c34_invitations(id) where status='pending';
create table private.c34_events(
  invitation uuid references private.c34_invitations(id) on delete cascade,
  version integer not null, status text not null, actor uuid references auth.users(id) on delete set null,
  request uuid unique, fingerprint text, report uuid references private.project_reports(id) on delete set null, happened_at timestamptz not null default clock_timestamp(),
  primary key(invitation,version)
);

alter table private.c34_fixture enable row level security;
alter table private.c34_contact enable row level security;
alter table private.c34_configuration enable row level security;
alter table private.c34_invitations enable row level security;
alter table private.c34_events enable row level security;
revoke all on private.c34_fixture,private.c34_contact,private.c34_configuration,private.c34_invitations,private.c34_events
  from public,anon,authenticated,authenticator,service_role;

create function private.c34_enabled() returns boolean language sql stable set search_path='' as $$
  select exists(select from private.c34_fixture) and exists(select from private.c33_fixture)
    and exists(select from private.c32_fixture) and exists(select from private.c31_fixture)
$$;

create function private.c34_defaults() returns jsonb language sql immutable set search_path='' as $$
  select (private.c33_defaults()-array['criteria','requiredWeight','preferredWeight','recommendationLimit','discoveryLimit'])
    || '{"expiryDays":7,"organizerDailyLimit":5,"opportunityDailyLimit":8,"recipientDailyLimit":2,"cooldownDays":14}'
$$;

create function private.c34_settings() returns jsonb language sql stable set search_path='' as $$
  select coalesce((select settings||jsonb_build_object('version',version) from private.c34_configuration order by version desc limit 1),private.c34_defaults())
$$;

create function private.c34_organizer(p private.community_projects, actor uuid) returns boolean
language sql stable set search_path='' as $$
  select coalesce(private.project_execution_actor(p,actor) and private.member_onboarding_access(actor)
    and private.project_identity_state(actor)='verified'
    and private.project_permission(private.project_execution_role(p,actor),'volunteers.review')
    and not exists(select from private.m23_restrictions m where m.subject_id=actor and m.capability='project_manage'
      and m.revoked_at is null and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
      and private.m23_scope_includes(m.scope_kind,m.scope_id,'project',p.id)),false)
$$;

create function private.c34_terms(project_ref uuid, opportunity_ref uuid, expected_revision integer, sender uuid, target uuid) returns jsonb
language sql stable set search_path='' as $$
  select r.snapshot||jsonb_build_object('revision',r.version,'title',o.title,'projectTitle',pr.proposal->>'title')
  from private.project_opportunities o
  join private.community_projects p on p.id=o.project_id
  join private.project_revisions pr on pr.project_id=p.id and pr.revision=p.revision
  join lateral (select * from private.c32_requirements where opportunity=o.id and action='publish' order by version desc limit 1) r on true
  join private.c31_profiles v on v.actor=target
  join private.c31_consents c on c.actor=v.actor and c.discovery
  join private.c34_contact permission on permission.actor=v.actor and permission.allowed
  join public.profiles identity on identity.user_id=v.actor
  cross join lateral (select private.c34_settings() as settings) config
  cross join lateral (select coalesce((select settings from private.c33_configuration order by version desc limit 1),private.c33_defaults()) as settings) matching
  where p.id=project_ref and o.id=opportunity_ref and r.version=expected_revision
    and sender<>target and private.c34_organizer(p,sender) and not feed_data.blocked_pair(sender,o.manager_id)
    and private.c33_opportunity(r,o,p,matching.settings,private.c32_settings())
    and not (r.snapshot->>'screening')::boolean
    and config.settings->'modes' ? (r.snapshot->>'mode') and config.settings->'departments' ? (r.snapshot->>'department')
    and private.member_experience_flag('profilesEnabled')
    and v.availability='available'
    and (v.expires_on is null or v.expires_on>=(now() at time zone 'America/Port-au-Prince')::date)
    and (v.mode=r.snapshot->>'mode' or v.mode='hybrid')
    and (v.nationwide or (r.snapshot->>'department')=any(v.departments)
      or (r.snapshot->>'mode'='remote' and cardinality(v.departments)=0))
    and feed_data.f24_mode(target)<>'private' and feed_data.f24_identity(identity,sender)
    and not feed_data.blocked_pair(sender,target) and not exists(select from feed_data.member_mutes m where m.actor_id=target and m.target_id=sender)
    and private.c33_viewer(target,o,p)
    and exists(select from (select private.c33_compare(v,private.c33_skills(target),r.snapshot,matching.settings) fit offset 0) compatibility
      where fit->>'classification'<>'additional'
        and (fit->'reasons' ?| array['skillFit','preferredFit','languageFit'] or (r.snapshot->>'beginnerFriendly')::boolean))
$$;

create function private.c34_pending_state(i private.c34_invitations) returns text
language sql stable set search_path='' as $$
  select case when i.status<>'pending' then i.status when i.expires_at<=now() then 'expired'
    when private.c34_terms(i.project,i.opportunity,i.requirement,i.organizer,i.recipient) is null then 'invalidated' else 'pending' end
$$;

create function private.c34_transition(invite uuid, next_state text, actor_ref uuid, request_ref uuid default null,
  digest text default null, application_ref uuid default null) returns integer
language plpgsql set search_path='' as $$
declare next_version integer;
begin
  update private.c34_invitations set status=case when next_state='dismissed' then status else next_state end,
    dismissed_at=case when next_state='dismissed' then clock_timestamp() else dismissed_at end,
    application=coalesce(application_ref,application), version=version+1, changed_at=clock_timestamp()
    where id=invite and (status='pending' or (next_state='dismissed' and dismissed_at is null))
    returning version into next_version;
  if found then
    insert into private.c34_events(invitation,version,status,actor,request,fingerprint)
      values(invite,next_version,next_state,actor_ref,request_ref,digest);
  end if;
  return next_version;
end $$;

create function private.c34_refresh(invite uuid) returns text language plpgsql set search_path='' as $$
declare i private.c34_invitations; current_state text;
begin
  select * into i from private.c34_invitations where id=invite for update;
  if not found then return null; end if;
  current_state:=private.c34_pending_state(i);
  if current_state<>i.status then perform private.c34_transition(i.id,current_state,null); end if;
  return current_state;
end $$;

create function public.c34_recruitment_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_fixture boolean,p_project uuid,p_opportunity uuid,p_invitation uuid,p_after uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='6s' as $$
declare
  settings jsonb:=private.c34_settings(); defaults jsonb:=private.c34_defaults();
  config private.c34_configuration; contact private.c34_contact; i private.c34_invitations; event private.c34_events;
  p private.community_projects; item record; target uuid; after_key uuid:=coalesce(p_after,'00000000-0000-0000-0000-000000000000');
  request_key uuid; version_input integer; revision integer; fingerprint text; note text; terms jsonb; items jsonb;
  next_id uuid; native_report uuid; state text; visible_name text; visible_handle text; closed constant jsonb:='{"state":"closed","items":[],"nextKey":null}';
  staff boolean:=p_action in ('settings','configure');
  command boolean:=p_action in ('configure','contact','send','decline','withdraw','dismiss','report');
begin
  if p_action is null or p_action not in ('settings','configure','preferences','contact','inbox','sent','preview','send','open','decline','withdraw','dismiss','report')
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false) and private.member_onboarding_access(p_actor),false)
    then raise exception 'member session required' using errcode='42501'; end if;
  if command then
    perform private.s2b_lock_actor(p_actor,p_session);
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false) and private.member_onboarding_access(p_actor),false)
      then raise exception 'member session required' using errcode='42501'; end if;
  end if;
  if staff then
    if not coalesce(private.platform_founder(p_actor)
      and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
  elsif not (coalesce(p_fixture,false) and private.c34_enabled()) then
    if p_action in ('preferences','inbox','sent','open') then return closed; end if;
    raise exception 'recruitment closed' using errcode='42501';
  end if;

  if command then
    if jsonb_typeof(p_input) is distinct from 'object' or not private.c32_integer(p_input->'expectedVersion',0,2147483646)
      or jsonb_typeof(p_input->'requestId') is distinct from 'string'
      then raise exception 'invalid recruitment command' using errcode='23514'; end if;
    request_key:=(p_input->>'requestId')::uuid;
    version_input:=(p_input->>'expectedVersion')::integer;
    fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_action,p_project,p_opportunity,p_invitation,p_input)::text,'UTF8')),'hex');
  end if;

  if p_action='settings' then
    return jsonb_build_object('settings',settings,'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
      from (select version,reason,recorded_at as at from private.c34_configuration order by version desc limit 30) h));
  elsif p_action='configure' then
    perform pg_advisory_xact_lock(20261125,340);
    settings:=private.c34_settings();
    note:=trim(p_input->>'reason');
    if p_input-array['expectedVersion','requestId','confirmed','reason','departments','modes','expiryDays','organizerDailyLimit','opportunityDailyLimit','recipientDailyLimit','cooldownDays']<>'{}'
      or p_input->'confirmed' is distinct from 'true'
      or not coalesce(length(note) between 10 and 500 and note !~ '[[:cntrl:]]',false)
      or not private.c32_enum_list(p_input->'departments',defaults->'departments')
      or not private.c32_enum_list(p_input->'modes',defaults->'modes')
      or not private.c32_integer(p_input->'expiryDays',1,14)
      or not private.c32_integer(p_input->'organizerDailyLimit',1,10)
      or not private.c32_integer(p_input->'opportunityDailyLimit',1,15)
      or not private.c32_integer(p_input->'recipientDailyLimit',1,3)
      or not private.c32_integer(p_input->'cooldownDays',7,30)
      then raise exception 'invalid recruitment settings' using errcode='23514'; end if;
    select * into config from private.c34_configuration where request=request_key;
    if found then
      if config.actor is distinct from p_actor or config.workspace is distinct from p_workspace or config.fingerprint<>fingerprint
        then raise exception 'conflicting request' using errcode='55000'; end if;
      return jsonb_build_object('version',config.version);
    end if;
    if version_input<>(settings->>'version')::integer then raise exception 'stale settings' using errcode='55000'; end if;
    insert into private.c34_configuration(version,settings,actor,workspace,request,fingerprint,reason)
      values(version_input+1,p_input-array['expectedVersion','requestId','confirmed','reason'],p_actor,p_workspace,request_key,fingerprint,note);
    return jsonb_build_object('version',version_input+1);
  end if;

  if p_action in ('preferences','contact') then
    select * into contact from private.c34_contact where actor=p_actor;
    if p_action='preferences' then
      return jsonb_build_object('state','ready','allowed',coalesce(contact.allowed,false),'version',coalesce(contact.version,0),
        'hasProfile',exists(select from private.c31_profiles where actor=p_actor));
    end if;
    if p_input-array['expectedVersion','requestId','allowed']<>'{}' or jsonb_typeof(p_input->'allowed') is distinct from 'boolean'
      or not exists(select from private.c31_profiles where actor=p_actor)
      then raise exception 'invalid consent' using errcode='23514'; end if;
    if contact.request=request_key then
      if contact.allowed<>(p_input->>'allowed')::boolean or contact.version<>version_input+1
        then raise exception 'conflicting request' using errcode='55000'; end if;
      return jsonb_build_object('version',contact.version);
    end if;
    if version_input<>coalesce(contact.version,0) then raise exception 'stale consent' using errcode='55000'; end if;
    insert into private.c34_contact(actor,allowed,version,request) values(p_actor,(p_input->>'allowed')::boolean,version_input+1,request_key)
      on conflict(actor) do update set allowed=excluded.allowed,version=excluded.version,request=excluded.request,changed_at=clock_timestamp();
    return jsonb_build_object('version',version_input+1);
  end if;

  if p_action in ('sent','preview','send') then
    if p_action='send' then
      select * into p from private.community_projects where id=p_project for update;
      perform pg_advisory_xact_lock(20261125,341);
    else
      select * into p from private.community_projects where id=p_project;
    end if;
    if p.id is null or not private.c34_organizer(p,p_actor)
      or not exists(select from private.project_opportunities where id=p_opportunity and project_id=p.id)
      then raise exception 'recruitment unavailable' using errcode='42501'; end if;
  end if;

  if p_action in ('preview','send') then
    if p_action='send' then
      if version_input<>0 or not private.c32_integer(p_input->'revision',1,2147483646)
        or p_input-array['expectedVersion','requestId','revision','message','handle']<>'{}'
        then raise exception 'invalid invitation' using errcode='23514'; end if;
      note:=trim(p_input->>'message');
      revision:=(p_input->>'revision')::integer;
      if not coalesce(private.project_operational_text(note,1,400),false) then raise exception 'invalid message' using errcode='23514'; end if;
      select * into event from private.c34_events where request=request_key;
      if found then
        if event.actor is distinct from p_actor or event.fingerprint<>fingerprint then raise exception 'conflicting request' using errcode='55000'; end if;
        return jsonb_build_object('id',event.invitation,'version',event.version);
      end if;
    else
      revision:=(p_input->>'revision')::integer;
    end if;
    -- A handle is accepted only within the same fixed discovery cohort and full eligibility checks.
    select pr.user_id into target from public.profiles pr
      join (select actor from private.c31_consents where discovery order by actor limit 96) cohort on cohort.actor=pr.user_id
      where pr.username=p_input->>'handle';
    terms:=private.c34_terms(p_project,p_opportunity,revision,p_actor,target);
    if terms is null or exists(select from private.project_applications where opportunity_id=p_opportunity and applicant_id=target)
      then raise exception 'invitation unavailable' using errcode='42501'; end if;
    if p_action='preview' then return terms; end if;

    for item in select id from private.c34_invitations where opportunity=p_opportunity and recipient=target and status='pending' loop
      perform private.c34_refresh(item.id);
    end loop;
    if exists(select from private.c34_invitations x where x.opportunity=p_opportunity and x.recipient=target
      and x.status in ('pending','application_initiated'))
      or exists(select from private.c34_invitations x where x.opportunity=p_opportunity and x.recipient=target
        and x.changed_at>now()-make_interval(days=>(settings->>'cooldownDays')::integer))
      or exists(select from private.c34_invitations x where x.organizer=p_actor and x.recipient=target and x.status in ('pending','declined','expired','withdrawn','invalidated')
        and x.changed_at>now()-make_interval(days=>(settings->>'cooldownDays')::integer))
      then raise exception 'invitation unavailable' using errcode='55000'; end if;
    if (select count(*) from private.c34_invitations where organizer=p_actor and created_at>now()-interval '24 hours')>=(settings->>'organizerDailyLimit')::integer
      or (select count(*) from private.c34_invitations where opportunity=p_opportunity and created_at>now()-interval '24 hours')>=(settings->>'opportunityDailyLimit')::integer
      or (select count(*) from private.c34_invitations where recipient=target and created_at>now()-interval '24 hours')>=(settings->>'recipientDailyLimit')::integer
      then raise exception 'invitation limit' using errcode='PFR29'; end if;
    if (select count(*) from private.c34_invitations where project=p_project and status='pending' and expires_at>now())>=50
      or (select count(*) from private.c34_invitations where recipient=target and status='pending' and expires_at>now())>=5
      then raise exception 'pending invitation limit' using errcode='PFR29'; end if;
    insert into private.c34_invitations(project,opportunity,requirement,organizer,recipient,message,expires_at)
      values(p_project,p_opportunity,revision,p_actor,target,note,least(now()+make_interval(days=>(settings->>'expiryDays')::integer),
        case when terms->>'deadline' is not null then (((terms->>'deadline')::date+1)::timestamp at time zone 'America/Port-au-Prince') end))
      returning * into i;
    insert into private.c34_events(invitation,version,status,actor,request,fingerprint)
      values(i.id,i.version,i.status,p_actor,request_key,fingerprint);
    return jsonb_build_object('id',i.id,'version',i.version);
  end if;

  if p_action in ('inbox','sent') then
    with page as materialized (
      select x from private.c34_invitations x where x.id>after_key and
        ((p_action='inbox' and x.recipient=p_actor and x.dismissed_at is null) or
         (p_action='sent' and x.organizer=p_actor and x.opportunity=p_opportunity and x.project=p_project))
      order by x.id limit 20 for update of x
    ), candidates as materialized (
      select (x).id,private.c34_pending_state(x) as current_state from page where (x).status='pending'
    ), changed as (
      update private.c34_invitations x set status=c.current_state,version=x.version+1,changed_at=clock_timestamp()
        from candidates c where x.id=c.id and x.status='pending' and c.current_state<>'pending'
        returning x.id,x.version,x.status
    )
    insert into private.c34_events(invitation,version,status)
      select id,version,status from changed;
    with page as materialized (
      select x.id,x.version,x.expires_at,x.created_at,o.title,pr.display_name,x as invitation
      from private.c34_invitations x join private.project_opportunities o on o.id=x.opportunity
      left join public.profiles pr on pr.user_id=case when p_action='inbox' then x.organizer else x.recipient end
      where x.id>after_key and ((p_action='inbox' and x.recipient=p_actor and x.dismissed_at is null) or
        (p_action='sent' and x.organizer=p_actor and x.opportunity=p_opportunity and x.project=p_project))
      order by x.id limit 21
    ), shown as materialized (select *,private.c34_pending_state(invitation) as status from (select * from page order by id limit 20) candidates)
    select (select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'version',version,
      'title',case when status='pending' then title end,'name',case when status='pending' then display_name end,
      'expiresAt',expires_at,'createdAt',created_at) order by id),'[]') from shown),
      (case when (select count(*) from page)>20 then (select id from shown order by id desc limit 1) end) into items,next_id;
    return jsonb_build_object('state','ready','items',items,'nextKey',next_id);
  end if;

  select * into i from private.c34_invitations where id=p_invitation and (recipient=p_actor or organizer=p_actor) for update;
  if not found or (i.organizer=p_actor and not exists(select from private.community_projects where id=i.project and private.c34_organizer(community_projects,p_actor)))
    or (p_action='withdraw' and i.organizer<>p_actor)
    or (p_action in ('decline','dismiss','report') and i.recipient<>p_actor)
    then raise exception 'invitation unavailable' using errcode='42501'; end if;
  if command then
    if p_input-(case when p_action='report' then array['requestId','expectedVersion','category','explanation'] else array['requestId','expectedVersion'] end)<>'{}'
      then raise exception 'invalid invitation action' using errcode='23514'; end if;
    select * into event from private.c34_events where request=request_key;
    if found then
      if event.actor is distinct from p_actor or event.fingerprint<>fingerprint then raise exception 'conflicting request' using errcode='55000'; end if;
      return jsonb_build_object('id',i.id,'version',event.version);
    end if;
  end if;
  if p_action='report' then
    if i.version<>version_input then raise exception 'stale invitation' using errcode='55000'; end if;
    note:=trim(p_input->>'explanation');
    if not coalesce(p_input->>'category' in ('misleading','privacy','unsafe','fundraising')
      and private.valid_trust_text(note,10,500),false)
      then raise exception 'invalid report' using errcode='23514'; end if;
    if exists(select from private.c34_events where invitation=i.id and status='reported')
      then raise exception 'report already recorded' using errcode='23505'; end if;
    perform feed_data.consume_limit(p_actor,'project_report',5);
    insert into private.project_reports(project_id,reporter_id,category,explanation)
      values(i.project,p_actor,p_input->>'category',note) on conflict(project_id,reporter_id) do nothing
      returning id into native_report;
    if native_report is null then raise exception 'project already reported' using errcode='23505'; end if;
    update private.c34_invitations set version=version+1 where id=i.id;
    insert into private.c34_events(invitation,version,status,actor,request,fingerprint,report)
      values(i.id,i.version+1,'reported',p_actor,request_key,fingerprint,native_report);
    return jsonb_build_object('id',i.id,'version',i.version+1);
  end if;
  state:=private.c34_refresh(i.id);
  select * into i from private.c34_invitations where id=i.id;
  if p_action='open' then
    if state='pending' and i.dismissed_at is null then
      terms:=private.c34_terms(i.project,i.opportunity,i.requirement,i.organizer,i.recipient);
      if terms is not null then
        select display_name,username into visible_name,visible_handle from public.profiles
          where user_id=case when i.recipient=p_actor then i.organizer else i.recipient end;
      end if;
    end if;
    return jsonb_build_object('state','ready','id',i.id,'status',case when state='pending' and terms is null then 'invalidated' else state end,
      'version',i.version,'terms',terms,'message',case when terms is not null then i.message end,
      'name',visible_name,'handle',visible_handle,'project',case when terms is not null then i.project end,
      'opportunity',case when terms is not null then i.opportunity end,'recipient',i.recipient=p_actor,'expiresAt',i.expires_at,
      'reported',i.recipient=p_actor and exists(select from private.c34_events where invitation=i.id and status='reported'));
  end if;
  if i.version<>version_input or (p_action<>'dismiss' and state<>'pending') or i.dismissed_at is not null then
    return jsonb_build_object('id',i.id,'version',i.version,'changed',false);
  end if;
  return jsonb_build_object('id',i.id,'version',private.c34_transition(i.id,
    case p_action when 'decline' then 'declined' when 'withdraw' then 'withdrawn' else 'dismissed' end,
    p_actor,request_key,fingerprint),'changed',true);
end $$;

revoke all on function private.c34_enabled(),private.c34_defaults(),private.c34_settings(),
  private.c34_organizer(private.community_projects,uuid),private.c34_terms(uuid,uuid,integer,uuid,uuid),
  private.c34_pending_state(private.c34_invitations),private.c34_transition(uuid,text,uuid,uuid,text,uuid),private.c34_refresh(uuid),
  public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c34_recruitment_for_api(uuid,uuid,boolean,bigint,uuid,boolean,uuid,uuid,uuid,uuid,text,jsonb) to service_role;


-- Existing in-app notices carry only an invitation identifier and lifecycle state.
alter table feed_data.notifications add column recruitment_invitation_id uuid references private.c34_invitations(id) on delete cascade,
  add constraint c34_recruitment_notice_shape check ((kind='volunteer_recruitment')=(recruitment_invitation_id is not null)
    and (recruitment_invitation_id is null or (actor_id is null and post_id is null and comment_id is null))),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice','community_need_notice','need_project_notice','volunteer_recruitment'));

create index c34_notifications_invitation on feed_data.notifications(recruitment_invitation_id) where recruitment_invitation_id is not null;

create function private.c34_notice_visible(invite uuid, receiver uuid) returns boolean
language sql stable set search_path='' as $$
  select private.c34_enabled() and feed_data.author_active(receiver) and exists(
    select from private.c34_invitations i join private.community_projects p on p.id=i.project
    where i.id=invite and not feed_data.blocked_pair(i.recipient,i.organizer)
      and not exists(select from feed_data.member_mutes where actor_id=receiver
        and target_id=case when receiver=i.recipient then i.organizer else i.recipient end)
      and ((i.recipient=receiver and i.dismissed_at is null) or (i.organizer=receiver and private.c34_organizer(p,receiver)))
      and (i.status<>'pending' or private.c34_pending_state(i)='pending'))
$$;

create function private.c34_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare i private.c34_invitations; receiver uuid;
begin
  if not private.c34_enabled() or new.status in ('dismissed','reported') then return new; end if;
  select * into i from private.c34_invitations where id=new.invitation;
  receiver:=case when new.status in ('pending','withdrawn','expired','invalidated') then i.recipient else i.organizer end;
  if not private.c34_notice_visible(i.id,receiver) then return new; end if;
  insert into feed_data.notifications(recipient_id,kind,recruitment_invitation_id,dedupe)
    values(receiver,'volunteer_recruitment',i.id,'volunteer-recruitment:'||i.id::text||':'||new.status)
    on conflict(recipient_id,dedupe) do nothing;
  return new;
end $$;
create trigger c34_invitation_notice after insert on private.c34_events for each row execute function private.c34_notify();

-- A normal native application may consume the eligible invitation in the same transaction.
create function private.c34_native_application() returns trigger language plpgsql security definer set search_path='' as $$
declare invite uuid;
begin
  if not private.c34_enabled() then return new; end if;
  select id into invite from private.c34_invitations
    where opportunity=new.opportunity_id and project=new.project_id and recipient=new.applicant_id and status='pending' and dismissed_at is null;
  if invite is not null and private.c34_refresh(invite)='pending' then
    perform private.c34_transition(invite,'application_initiated',new.applicant_id,null,null,new.id);
  end if;
  return new;
end $$;
create trigger c34_native_application after insert on private.project_applications for each row execute function private.c34_native_application();

-- The trigger arguments identify source keys. Refresh tests full current authorization.
create function private.c34_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; actor_ref uuid; target_ref uuid; project_ref uuid; opportunity_ref uuid; item record;
begin
  if not private.c34_enabled() then return null; end if;
  perform pg_advisory_xact_lock(20261125,341);
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor_ref:=(row_data->>nullif(tg_argv[0],''))::uuid;
  target_ref:=(row_data->>nullif(tg_argv[1],''))::uuid;
  project_ref:=(row_data->>nullif(tg_argv[2],''))::uuid;
  opportunity_ref:=(row_data->>nullif(tg_argv[3],''))::uuid;
  for item in
    select i.id from private.c34_invitations i
    join private.community_projects p on p.id=i.project
    join private.project_opportunities o on o.id=i.opportunity
    left join private.project_team recruiter on recruiter.project_id=p.id and recruiter.user_id=i.organizer
    where i.status='pending'
      and (actor_ref is null or actor_ref in (i.organizer,i.recipient,p.submitted_by,o.manager_id,recruiter.sponsor_id))
      and (target_ref is null or target_ref in (i.organizer,i.recipient,p.submitted_by,o.manager_id,recruiter.sponsor_id))
      and (project_ref is null or i.project=project_ref)
      and (opportunity_ref is null or i.opportunity=opportunity_ref)
      and (tg_table_name not in ('organization_memberships','verification_applications')
        or p.organization_id=(row_data->>'organization_id')::uuid)
      and (tg_table_name<>'organizations' or p.organization_id=(row_data->>'id')::uuid)
      and (tg_table_name not in ('community_staff','community_memberships')
        or (row_data->>'community_id')::uuid in (p.community_id,p.association_id))
    order by i.id
  loop
    perform private.c34_refresh(item.id);
  end loop;
  return null;
end $$;

create trigger c34_contact_change after insert or update or delete on private.c34_contact
  for each row execute function private.c34_invalidate('actor','','','');
create trigger c34_discovery_change after update of discovery or delete on private.c31_consents
  for each row execute function private.c34_invalidate('actor','','','');
create constraint trigger c34_volunteer_change after update on private.c31_profiles
  deferrable initially deferred for each row execute function private.c34_invalidate('actor','','','');
create constraint trigger c34_qualification_change after update or delete on private.c31_selections
  deferrable initially deferred for each row execute function private.c34_invalidate('actor','','','');
create trigger c34_privacy_change after insert or update or delete on feed_data.profile_privacy
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_block_change after insert on feed_data.member_blocks
  for each row execute function private.c34_invalidate('actor_id','target_id','','');
create trigger c34_mute_change after insert on feed_data.member_mutes
  for each row execute function private.c34_invalidate('actor_id','target_id','','');
create trigger c34_standing_change after insert or update on private.account_restrictions
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_restriction_change after insert or update on private.m23_restrictions
  for each row execute function private.c34_invalidate('subject_id','','','');
create trigger c34_team_change after update or delete on private.project_team
  for each row execute function private.c34_invalidate('user_id','','project_id','');
create trigger c34_org_change after update or delete on private.organization_memberships
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_org_verification_change after update or delete on private.verification_applications
  for each row when (old.kind='organization') execute function private.c34_invalidate('','','','');
create trigger c34_org_status_change after update on private.organizations
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_community_staff_change after update or delete on feed_data.community_staff
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_community_member_change after delete on feed_data.community_memberships
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_project_change after update of status,revision,restricted_at,directory_published_at,owner_user_id,organization_id,community_id,association_id on private.community_projects
  for each row execute function private.c34_invalidate('','','id','');
create trigger c34_verification_change after insert or update or delete on public.verification_records
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_founder_identity_change after update of state on private.founder_identity_cases
  for each row execute function private.c34_invalidate('subject_id','','','');
create trigger c34_founder_identity_policy after insert or update or delete on private.fv_development_policies
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_identity_visibility after update of is_visible,username,display_name on public.profiles
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_discoverable_change after insert or update of discoverable or delete on public.user_settings
  for each row execute function private.c34_invalidate('user_id','','','');
create trigger c34_execution_change after update of status,approved_revision on private.project_execution
  for each row execute function private.c34_invalidate('','','project_id','');
create trigger c34_opportunity_change after update of capacity,closed_at,closes_on,manager_id on private.project_opportunities
  for each row execute function private.c34_invalidate('','','project_id','id');
create trigger c34_publication_change after insert on private.c32_requirements
  for each row when(new.action='publish') execute function private.c34_invalidate('','','project','opportunity');
create trigger c34_recruitment_policy_change after insert on private.c34_configuration
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_matching_policy_change after insert on private.c33_configuration
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_requirement_policy_change after insert on private.c32_configuration
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_catalog_settings_change after insert or update or delete on private.c31_settings
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_catalog_change after update or delete on private.c31_skills
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_member_policy_change after update on private.member_experience_policy
  for each row execute function private.c34_invalidate('','','','');
create trigger c34_capacity_change after update of status on private.project_applications
  for each row when (new.status in ('offered','accepted') and old.status is distinct from new.status)
  execute function private.c34_invalidate('','','project_id','opportunity_id');

revoke all on function private.c34_notice_visible(uuid,uuid),private.c34_notify(),private.c34_native_application(),private.c34_invalidate()
  from public,anon,authenticated,authenticator,service_role;

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='volunteer_recruitment' then private.c34_notice_visible(n.recruitment_invitation_id,n.recipient_id)
    when n.kind='need_project_notice' then private.c14_enabled() and private.institution_actor(n.recipient_id)
      and exists(select from private.c14_events e join private.c14_links l on l.id=e.link_id
        left join private.community_projects p on p.id=l.project_id
        where e.id=n.need_project_event_id and (l.author=n.recipient_id
          or (l.organizer=n.recipient_id and private.c14_organizer(p,n.recipient_id))))
    when n.kind='community_need_notice' then private.c12_enabled() and private.institution_actor(n.recipient_id)
      and exists(select from private.c12_events e join private.c11_needs c on c.id=e.need_id
        where e.id=n.community_need_event_id and c.author_id=n.recipient_id)
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
    'communityNeed',case when n.visible and n.kind='community_need_notice' then (
      select jsonb_build_object('needId',e.need_id,'action',e.action) from private.c12_events e where e.id=n.community_need_event_id)
    end,'communityEvent',case when n.visible and n.kind='event_notice' then jsonb_build_object('eventId',n.community_event_id,'action',n.event_action) end,
    'pollEvent',case when n.visible and n.kind='poll_event' then (
      select jsonb_build_object('pollId',e.poll_id,'action',e.action) from private.poll_events e where e.id=n.poll_event_id)
    end,'projectOperation',case when n.visible and n.kind='project_operation' then (
      select jsonb_build_object('projectId',e.project_id,'action',e.action) from private.project_operations_events e where e.id=n.project_operation_event_id)
    end,'actor',case when n.visible then feed_data.author_projection(n.actor_id)-'avatarPath' end)
    || case when n.visible and n.kind='volunteer_recruitment' then jsonb_build_object('recruitment',(
      select jsonb_build_object('id',i.id,'status',i.status) from private.c34_invitations i where i.id=n.recruitment_invitation_id)) else '{}'::jsonb end
    order by n.created_at desc,n.id desc)
    from (
      select n.*,feed_data.notification_visible(n) as visible from (
        select x.* from feed_data.notifications x where x.recipient_id=auth.uid() and x.created_at>=now()-interval '30 days'
          and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
        order by x.created_at desc,x.id desc limit p_limit+1
      ) n
    ) n),'[]');
end;
$$;
