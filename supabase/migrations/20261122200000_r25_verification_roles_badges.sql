-- R2.5 uses the versioned Founder policy and audit pattern.
create function private.verification_policy_defaults()
returns jsonb language sql immutable set search_path='' as $$
  select '{"personalIntake":true,"organizationIntake":true,"publicFigureIntake":true,"founderBlue":true,"founderGold":true,"appealsIntake":true,"administratorAppointments":true,"organizationAssignments":true,"showBlue":true,"showGold":true,"recognitionEnabled":true,"recognitionAwards":true,"recognitionPublic":true}'::jsonb
$$;

create table private.verification_policy (
  singleton boolean primary key default true check(singleton),
  value jsonb not null default private.verification_policy_defaults(),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.verification_policy default values;
create table private.verification_policy_events (
  revision integer primary key check(revision>1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  request_id uuid not null,
  occurred_at timestamptz not null,
  unique(actor_id,request_id)
);
create index verification_policy_events_recent on private.verification_policy_events(occurred_at desc,revision desc);
create function public.founder_verification_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_value jsonb,p_expected integer,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.verification_policy; e private.verification_policy_events; previous jsonb;
begin
  if p_request is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;
  if p_request is null then
    select * into p from private.verification_policy where singleton;
  else
    if p_expected is null or p_expected<1 or not coalesce(length(btrim(p_reason)) between 10 and 500 and p_reason !~ '[[:cntrl:]]',false)
      or jsonb_typeof(p_value) is distinct from 'object'
      or (p_value - array(select jsonb_object_keys(private.verification_policy_defaults()))) <> '{}'::jsonb
      or exists(select 1 from jsonb_object_keys(private.verification_policy_defaults()) k where jsonb_typeof(p_value->k) is distinct from 'boolean')
      then raise exception 'Invalid verification policy update' using errcode='23514'; end if;
    select * into strict p from private.verification_policy where singleton for update;
    select * into e from private.verification_policy_events where actor_id=p_actor and request_id=p_request;
    if found then
      if e.revision-1<>p_expected or e.new_value<>p_value or e.reason<>btrim(p_reason)
        then raise exception 'Request conflict' using errcode='O2002'; end if;
      return jsonb_build_object('value',e.new_value,'revision',e.revision,'updatedAt',e.occurred_at);
    end if;
    if p.revision<>p_expected then raise exception 'Stale revision' using errcode='O2004'; end if;
    if p.value=p_value then raise exception 'No changed value' using errcode='55000'; end if;
    previous:=p.value;
    update private.verification_policy set value=p_value,revision=revision+1,updated_at=clock_timestamp()
      where singleton returning * into p;
    insert into private.verification_policy_events(revision,actor_id,previous_value,new_value,reason,request_id,occurred_at)
      values(p.revision,p_actor,previous,p_value,btrim(p_reason),p_request,p.updated_at);
  end if;
  if p.singleton is null then return null; end if;
  return jsonb_build_object('value',p.value,'revision',p.revision,'updatedAt',p.updated_at);
end;
$$;


alter table private.verification_policy enable row level security;
alter table private.verification_policy_events enable row level security;
revoke all on private.verification_policy,private.verification_policy_events from public,anon,authenticated,service_role;

create function private.verification_policy_flag(p_flag text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select value->p_flag='true'::jsonb from private.verification_policy where singleton),false)
$$;

-- Check only new intake and new privileged actions. A transaction that reaches
-- an existing receipt takes its original replay path without inserting a new event.
create function private.guard_r25_creation()
returns trigger language plpgsql security definer set search_path='' as $$
declare flag text;
begin
  if tg_table_name='verification_applications' then
    flag:=case new.kind when 'identity' then 'personalIntake' when 'notable_person' then 'publicFigureIntake'
      when 'organization' then 'organizationIntake' when 'government' then 'organizationIntake'
      when 'representative' then 'organizationIntake' end;
  elsif tg_table_name='institution_audit' then
    if new.event in ('founder_identity_approved','founder_identity_rejected') then flag:='founderBlue'; end if;
  elsif tg_table_name='founder_identity_cases' then
    flag:='founderGold';
  elsif tg_table_name='founder_identity_grants' then
    flag:='founderGold';
  elsif tg_table_name='platform_governance_proposals' then
    if new.kind='appoint' then flag:='administratorAppointments'; end if;
  elsif tg_table_name in ('organization_custom_assignments','organization_invitations') then
    flag:='organizationAssignments';
  end if;
  if flag is not null and not private.verification_policy_flag(flag) then
    raise exception 'Action paused by platform policy' using errcode='RV250';
  end if;
  return new;
end;
$$;
create trigger r25_verification_intake before insert on private.verification_applications
  for each row execute function private.guard_r25_creation();
create trigger r25_founder_blue before insert on private.institution_audit
  for each row execute function private.guard_r25_creation();
create trigger r25_founder_gold_case before insert on private.founder_identity_cases
  for each row execute function private.guard_r25_creation();
create trigger r25_founder_gold_grant before insert on private.founder_identity_grants
  for each row execute function private.guard_r25_creation();
create trigger r25_admin_appointment before insert on private.platform_governance_proposals
  for each row execute function private.guard_r25_creation();
create trigger r25_org_assignment before insert on private.organization_custom_assignments
  for each row execute function private.guard_r25_creation();
create trigger r25_org_invitation before insert on private.organization_invitations
  for each row execute function private.guard_r25_creation();

-- This projection is presentation only. Verified status, reviewer provenance,
-- eligibility checks and member disclosure stay in their original domains.
create function public.verification_presentation()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('showBlue',private.verification_policy_flag('showBlue'),
    'showGold',private.verification_policy_flag('showGold'),
    'personalIntake',private.verification_policy_flag('personalIntake'),
    'organizationIntake',private.verification_policy_flag('organizationIntake'),
    'publicFigureIntake',private.verification_policy_flag('publicFigureIntake'))
$$;

create function private.r25_founder_workspace(actor uuid, session_id uuid, aal2 boolean, totp_at bigint, workspace uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.platform_founder(actor) and private.institution_actor(actor)
    and public.s2b_workflow_for_api(actor,session_id,aal2,totp_at,'read',null,workspace,'admin',null,null) is not null
$$;

create function public.r25_roles_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.r25_founder_workspace(p_actor,p_session,p_aal2,p_totp,p_workspace),false)
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;
  return jsonb_build_object(
    'platform',coalesce((select jsonb_agg(to_jsonb(a)) from (
      select r.role,p.username,case when private.institution_actor(r.user_id) then 'active' else 'restricted' end as status
      from (
        select role,user_id from public.role_assignments
        union all select 'founder',b.user_id from private.platform_bootstrap b where private.platform_founder(b.user_id)
        union all select 'verification_reviewer',v.user_id from private.verification_reviewers v
      ) r join public.profiles p using(user_id)
      order by r.role,p.username limit 100
    ) a),'[]'::jsonb),
    'organizations',coalesce((select jsonb_agg(to_jsonb(a)) from (
      select a.role,p.username,o.name as organization,
        case when a.assigned and private.institution_actor(a.user_id) then 'assigned' else 'inactive' end as status
      from (
        select ca.id,ca.organization_id,ca.user_id,r.name as role,ca.granted_at as created_at,
          ca.revoked_at is null and r.deactivated_at is null as assigned from private.organization_custom_assignments ca
          join private.organization_custom_roles r on r.id=ca.role_id and r.organization_id=ca.organization_id
        union all
        select m.id,m.organization_id,m.user_id,m.role,m.created_at,
          m.revoked_at is null and (m.expires_at is null or m.expires_at>clock_timestamp()) from private.organization_memberships m
      ) a join private.organizations o on o.id=a.organization_id
      join public.profiles p on p.user_id=a.user_id
      where private.institution_role(p_actor,a.organization_id) in ('owner','administrator')
      order by a.created_at desc,a.id desc limit 100
    ) a),'[]'::jsonb));
end;
$$;

revoke all on function private.verification_policy_defaults(),private.verification_policy_flag(text),private.guard_r25_creation(),
  private.r25_founder_workspace(uuid,uuid,boolean,bigint,uuid),
  public.founder_verification_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,integer,text,uuid),
  public.r25_roles_for_api(uuid,uuid,boolean,bigint,uuid),public.verification_presentation()
  from public,anon,authenticated,service_role;
grant execute on function public.founder_verification_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,integer,text,uuid),
  public.r25_roles_for_api(uuid,uuid,boolean,bigint,uuid) to service_role;
grant execute on function public.verification_presentation() to anon,authenticated;


-- Recognition has no foreign keys into verification or permission ledgers.
create table private.recognition_badges (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null, description jsonb not null,
  icon text not null check(icon in ('ribbon','sun','leaf','hands')),
  color text check(color ~ '^#[0-9A-Fa-f]{6}$'),
  archived boolean not null default false,
  awards_enabled boolean not null default true,
  public_enabled boolean not null default true,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);
create table private.recognition_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references private.recognition_badges(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  awarded_by uuid not null references auth.users(id) on delete restrict,
  awarded_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  show_public boolean not null default false
);
create unique index recognition_award_active on private.recognition_awards(badge_id,user_id) where revoked_at is null;
create index recognition_member_history on private.recognition_awards(user_id,awarded_at desc,id);
create table private.recognition_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  badge_id uuid not null references private.recognition_badges(id) on delete restrict,
  award_id uuid references private.recognition_awards(id) on delete set null,
  action text not null check(action in ('create','edit','archive','reactivate','award','revoke')),
  fingerprint bytea not null,
  request_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  reason text not null,
  unique(actor_id,request_id)
);
create index recognition_event_recent on private.recognition_events(occurred_at desc,id);
alter table private.recognition_badges enable row level security;
alter table private.recognition_awards enable row level security;
alter table private.recognition_events enable row level security;
revoke all on private.recognition_badges,private.recognition_awards,private.recognition_events from public,anon,authenticated,service_role;

create function private.recognition_valid_text(p_value jsonb,p_limit integer,p_name boolean)
returns boolean language plpgsql immutable set search_path='' as $$
declare item record; normalized text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or p_value - array['en','fr','es','ht'] <> '{}'::jsonb then return false; end if;
  if exists(select 1 from unnest(array['en','fr','es','ht']) l where jsonb_typeof(p_value->l) is distinct from 'string')
    then return false; end if;
  for item in select value from jsonb_each_text(p_value) loop
    if length(btrim(item.value)) not between 2 and p_limit or item.value ~ '[[:cntrl:]]' then return false; end if;
    if p_name then
      normalized:=translate(lower(item.value),'àâäáãåçèéêëìíîïñòóôöõùúûüýÿœ','aaaaaaceeeeiiiinooooouuuuyyo');
      if normalized !~ '^[a-z0-9 .-]+$'
        or regexp_replace(normalized,'[^a-z0-9]','','g') ~ '(verif|founder|fondate|fondat|fondad|fondatè|admin|moderat|moderad|reviewer|ofisyel|offici|ofici|authority|otorite|autorite|certif|bluebadge|goldbadge)'
        then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

alter table private.recognition_badges add constraint recognition_safe_copy
  check(private.recognition_valid_text(name,64,true) and private.recognition_valid_text(description,300,false));

create function private.recognition_badge_card(b private.recognition_badges)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',b.id,'name',b.name,'description',b.description,'icon',b.icon,'color',b.color,
    'archived',b.archived,'awardsEnabled',b.awards_enabled,'publicEnabled',b.public_enabled,'revision',b.revision,'createdAt',b.created_at,'updatedAt',b.updated_at)
$$;

create function public.r25_recognition_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_command jsonb,p_request uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.recognition_badges; a private.recognition_awards; prior private.recognition_events;
  op text:=p_command->>'action'; recipient uuid; badge_id uuid; award_id uuid; expected integer;
  fingerprint bytea:=sha256(convert_to(p_command::text,'UTF8'));
  receipt jsonb;
begin
  if p_request is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not coalesce(private.r25_founder_workspace(p_actor,p_session,p_aal2,p_totp,p_workspace),false)
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;
  if p_request is null then
    return jsonb_build_object('badges',coalesce((select jsonb_agg(private.recognition_badge_card(rows)) from (
      select * from private.recognition_badges order by created_at desc,id desc limit 100) rows),'[]'),
      'awards',coalesce((select jsonb_agg(jsonb_build_object('id',a1.id,'badgeId',a1.badge_id,'username',p.username,
        'public',a1.show_public,'awardedAt',a1.awarded_at,'revokedAt',a1.revoked_at) order by a1.awarded_at desc,a1.id desc)
        from (select * from private.recognition_awards order by awarded_at desc,id desc limit 100) a1
        left join public.profiles p on p.user_id=a1.user_id),'[]'),
      'history',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'actor',p.username,'at',e.occurred_at,
        'badgeId',e.badge_id,'awardId',e.award_id,'reason',e.reason) order by e.occurred_at desc,e.id desc)
        from (select * from private.recognition_events order by occurred_at desc,id desc limit 100) e
        left join public.profiles p on p.user_id=e.actor_id),'[]'));
  end if;

  if not coalesce(length(btrim(p_reason)) between 10 and 500 and p_reason !~ '[[:cntrl:]]',false)
    or not coalesce(op in ('create','edit','archive','reactivate','award','revoke'),false)
    then raise exception 'Invalid recognition command' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261122200000));
  select * into prior from private.recognition_events where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.fingerprint is distinct from fingerprint or prior.reason is distinct from btrim(p_reason)
      then raise exception 'Request conflict' using errcode='O2002'; end if;
    return jsonb_build_object('badgeId',prior.badge_id,'awardId',prior.award_id);
  end if;
  badge_id:=(p_command->>'badgeId')::uuid;
  award_id:=(p_command->>'awardId')::uuid;
  expected:=(p_command->>'expectedRevision')::integer;
  if op='revoke' then
    select * into a from private.recognition_awards ra where ra.id=award_id for update;
    if not found or a.revoked_at is not null then raise exception 'Award unavailable' using errcode='O2003'; end if;
    badge_id:=a.badge_id;
    update private.recognition_awards ra set revoked_at=clock_timestamp(),show_public=false where ra.id=award_id;
  else
    if not private.verification_policy_flag('recognitionEnabled') and op in ('create','award','reactivate')
      then raise exception 'Recognition paused' using errcode='RV250'; end if;
    if op<>'create' then
      select * into b from private.recognition_badges rb where rb.id=badge_id for update;
      if not found then raise exception 'Badge unavailable' using errcode='O2003'; end if;
      if b.revision is distinct from expected then raise exception 'Stale revision' using errcode='O2004'; end if;
    end if;
    case op
      when 'create' then
        insert into private.recognition_badges(name,description,icon,color,created_by,awards_enabled,public_enabled)
          values(p_command->'name',p_command->'description',p_command->>'icon',p_command->>'color',p_actor,
            (p_command->>'awardsEnabled')::boolean,(p_command->>'publicEnabled')::boolean) returning id into badge_id;
      when 'edit' then
        update private.recognition_badges rb set name=p_command->'name',description=p_command->'description',
          icon=p_command->>'icon',color=p_command->>'color',awards_enabled=(p_command->>'awardsEnabled')::boolean,
          public_enabled=(p_command->>'publicEnabled')::boolean,revision=revision+1,updated_at=clock_timestamp() where rb.id=badge_id;
      when 'archive','reactivate' then
        if b.archived=(op='archive') then raise exception 'Badge already in desired state' using errcode='55000'; end if;
        update private.recognition_badges rb set archived=(op='archive'),revision=revision+1,updated_at=clock_timestamp() where rb.id=badge_id;
      when 'award' then
        if b.archived or not b.awards_enabled or not private.verification_policy_flag('recognitionAwards')
          then raise exception 'Awards paused' using errcode='RV250'; end if;
        select p.user_id into recipient from public.profiles p where p.username=lower(btrim(p_command->>'username'));
        if recipient is null or not private.institution_actor(recipient)
          then raise exception 'Eligible member unavailable' using errcode='O2003'; end if;
        if exists(select 1 from private.recognition_awards ra where ra.badge_id=b.id and ra.user_id=recipient and ra.revoked_at is null)
          then raise exception 'Active award already exists' using errcode='O2002'; end if;
        insert into private.recognition_awards(badge_id,user_id,awarded_by) values(b.id,recipient,p_actor) returning id into award_id;
    end case;
  end if;
  insert into private.recognition_events(actor_id,badge_id,award_id,action,fingerprint,request_id,reason)
    values(p_actor,badge_id,award_id,op,fingerprint,p_request,btrim(p_reason));
  receipt:=jsonb_build_object('badgeId',badge_id,'awardId',award_id);
  return receipt;
end;
$$;


create function public.my_recognition_awards()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'badge',private.recognition_badge_card(b),
    'public',a.show_public,'awardedAt',a.awarded_at,'revokedAt',a.revoked_at) order by a.awarded_at desc,a.id desc),'[]')
  from (select * from private.recognition_awards where user_id=auth.uid()
    and private.member_session_allowed() order by awarded_at desc,id desc limit 100) a
  join private.recognition_badges b on b.id=a.badge_id
$$;

create function public.set_recognition_visibility(p_award uuid,p_public boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_public is null or not private.member_session_allowed() then return false; end if;
  update private.recognition_awards set show_public=p_public
    where id=p_award and user_id=auth.uid() and revoked_at is null;
  return found;
end;
$$;

create function public.public_recognition_badges(p_username text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(private.recognition_badge_card(b) order by a.awarded_at desc,a.id desc),'[]')
  from (
    select r.id,r.badge_id,r.awarded_at
    from public.find_public_profile_for_api(lower(p_username)) p
    join private.recognition_awards r on r.user_id=p.user_id
    join private.recognition_badges rb on rb.id=r.badge_id
    where private.verification_policy_flag('recognitionEnabled') and private.verification_policy_flag('recognitionPublic')
      and r.show_public and r.revoked_at is null and not rb.archived and rb.public_enabled
      and (auth.uid() is null or feed_data.viewer_can_interact(p.user_id))
    order by r.awarded_at desc,r.id desc limit 24
  ) a join private.recognition_badges b on b.id=a.badge_id
$$;

revoke all on function private.recognition_valid_text(jsonb,integer,boolean),private.recognition_badge_card(private.recognition_badges),
  public.r25_recognition_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,uuid,text),public.my_recognition_awards(),
  public.set_recognition_visibility(uuid,boolean),public.public_recognition_badges(text)
  from public,anon,authenticated,service_role;
grant execute on function public.r25_recognition_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,uuid,text) to service_role;
grant execute on function public.my_recognition_awards(),public.set_recognition_visibility(uuid,boolean) to authenticated;
grant execute on function public.public_recognition_badges(text) to anon,authenticated;

create or replace function public.platform_policy_audit_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_high timestamptz,p_before_at timestamptz,p_before_source text,p_before_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare high timestamptz:=coalesce(p_high,statement_timestamp());
begin
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or not coalesce(private.s2b_recent_mfa(p_actor,p_session,p_aal2,p_totp),false)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then return null; end if;
  if (p_high is null and num_nonnulls(p_before_at,p_before_source,p_before_revision)<>0)
    or (p_high is not null and (num_nonnulls(p_before_at,p_before_source,p_before_revision)<>3
      or p_before_at>high or p_before_source not in ('homepage','registration','member_experience','verification') or p_before_revision<2))
    then raise exception 'Invalid policy history cursor' using errcode='22023'; end if;

  return (
    with homepage as (
      select 'homepage'::text collate "C" as source, revision,actor_id,reason,occurred_at,
        jsonb_build_object('homepageStatistics',previous_enabled) as previous_value,
        jsonb_build_object('homepageStatistics',enabled) as new_value
      from private.platform_boolean_policy_events
      where policy_key='homepage.community_statistics.enabled' and occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'homepage'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), registration as (
      select 'registration'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.registration_policy_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'registration'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), member_experience as (
      select 'member_experience'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.member_experience_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'member_experience'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), verification as (
      select 'verification'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.verification_policy_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'verification'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), events as (
      select * from (select * from homepage union all select * from registration union all select * from member_experience union all select * from verification) combined
      order by occurred_at desc,source desc,revision desc limit 21
    )
    select jsonb_build_object('high',high,'events',coalesce(jsonb_agg(jsonb_build_object(
      'source',e.source,'revision',e.revision,'actorId',e.actor_id,'actorUsername',p.username,
      'reason',e.reason,'occurredAt',e.occurred_at,'changes',coalesce((
        select jsonb_agg(jsonb_build_object('key',k.key,'before',e.previous_value->k.key,'after',e.new_value->k.key) order by k.position)
        from unnest(array['homepageStatistics','enabled','mode','individualEnabled','organizationEnabled','referralsEnabled','rewardsEnabled',
          'onboardingEnabled','requireCompletion','requireCountry','requireDepartment','requireInterests','requireLanguage','allowSkip','showProgress',
          'profilesEnabled','publicProfiles','privateProfiles','profileEdits','profilePictures','profileBiographies','displayCountry','displayDepartment','displayInterests','personalIntake','organizationIntake','publicFigureIntake','founderBlue','founderGold','appealsIntake','administratorAppointments','organizationAssignments','showBlue','showGold','recognitionEnabled','recognitionAwards','recognitionPublic'])
          with ordinality as k(key,position)
        where e.previous_value ? k.key and e.new_value ? k.key
          and e.previous_value->k.key is distinct from e.new_value->k.key
      ),'[]'::jsonb)
    ) order by e.occurred_at desc,e.source desc,e.revision desc),'[]'::jsonb))
    from events e left join public.profiles p on p.user_id=e.actor_id
  );
end;
$$;
