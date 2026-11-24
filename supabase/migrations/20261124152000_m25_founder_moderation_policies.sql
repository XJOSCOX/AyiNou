-- Versioned Founder policy with the existing platform policy receipt and audit pattern.
create table private.m25_policy (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  value jsonb not null
);
create table private.m25_policy_events (
  revision integer primary key,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null unique,
  command jsonb not null,
  reason text not null,
  occurred_at timestamptz not null,
  previous_value jsonb not null,
  new_value jsonb not null
);
create index m25_policy_audit_time on private.m25_policy_events(occurred_at desc,revision desc);
alter table private.m25_policy enable row level security;
alter table private.m25_policy_events enable row level security;
revoke all on private.m25_policy,private.m25_policy_events from public,anon,authenticated,service_role;

insert into private.m25_policy(value)
select jsonb_build_object(
  'suspensionPresets',jsonb_build_array(60,1440,4320,10080,43200,129600),
  'administratorMaxMinutes',129600,'moderatorMaxMinutes',10080,'defaultMinutes',60,
  'delegableCapabilities',(select jsonb_agg(capability order by capability) from private.m23_capabilities where not high_impact),
  'reasonCategories',jsonb_build_array('safety','harassment','spam','integrity','other'),
  'repeatViolationGuidance','','notifyStaffGuidance',false
);

create function private.m25_validate(v jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare admin_max numeric; moderator_max numeric; suggested numeric;
begin
  if jsonb_typeof(v) is distinct from 'object'
    or jsonb_typeof(v->'administratorMaxMinutes') is distinct from 'number'
    or jsonb_typeof(v->'moderatorMaxMinutes') is distinct from 'number'
    or jsonb_typeof(v->'defaultMinutes') is distinct from 'number'
    or jsonb_typeof(v->'suspensionPresets') is distinct from 'array'
    or jsonb_typeof(v->'delegableCapabilities') is distinct from 'array'
    or jsonb_typeof(v->'reasonCategories') is distinct from 'array'
    or jsonb_typeof(v->'repeatViolationGuidance') is distinct from 'string'
    or jsonb_typeof(v->'notifyStaffGuidance') is distinct from 'boolean'
    or v-array['administratorMaxMinutes','moderatorMaxMinutes','defaultMinutes','suspensionPresets','delegableCapabilities',
      'reasonCategories','repeatViolationGuidance','notifyStaffGuidance'] <> '{}'::jsonb
  then return false; end if;
  admin_max:=(v->>'administratorMaxMinutes')::numeric;
  moderator_max:=(v->>'moderatorMaxMinutes')::numeric;
  suggested:=(v->>'defaultMinutes')::numeric;
  return admin_max between 1 and 129600 and admin_max=trunc(admin_max)
    and moderator_max between 1 and 10080 and moderator_max=trunc(moderator_max)
    and suggested between 1 and least(admin_max,moderator_max) and suggested=trunc(suggested)
    and length(v->>'repeatViolationGuidance')<=500 and v->>'repeatViolationGuidance' !~ '[[:cntrl:]]'
    and ((v->>'notifyStaffGuidance')::boolean=false or length(btrim(v->>'repeatViolationGuidance'))>0)
    and jsonb_array_length(v->'suspensionPresets')=(select count(distinct x) from jsonb_array_elements(v->'suspensionPresets') x)
    and not exists(select from jsonb_array_elements(v->'suspensionPresets') x
      where x not in ('60','1440','4320','10080','43200','129600'))
    and jsonb_array_length(v->'reasonCategories') between 1 and 5
    and jsonb_array_length(v->'reasonCategories')=(select count(distinct x) from jsonb_array_elements(v->'reasonCategories') x)
    and not exists(select from jsonb_array_elements_text(v->'reasonCategories') x
      where x is null or x not in ('safety','harassment','spam','integrity','other'))
    and jsonb_array_length(v->'delegableCapabilities')=(select count(distinct x) from jsonb_array_elements(v->'delegableCapabilities') x)
    and not exists(select from jsonb_array_elements_text(v->'delegableCapabilities') x
      where not exists(select from private.m23_capabilities c where c.capability=x and not c.high_impact));
end
$$;

create function public.m25_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_command jsonb,p_before int default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy private.m25_policy; entry private.m25_policy_events; desired jsonb; receipt uuid;
  written_reason text; action text; restore_revision int; happened timestamptz;
begin
  perform pg_advisory_xact_lock(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  if private.m23_authority(p_actor,p_session,p_aal2,p_totp,p_workspace)<>'founder'
    or not private.institution_actor(p_actor)
  then raise exception 'Founder required' using errcode='42501'; end if;

  select * into strict policy from private.m25_policy where singleton for update;
  if p_command is not null then
    receipt:=(p_command->>'requestId')::uuid;
    written_reason:=btrim(p_command->>'reason');
    action:=p_command->>'action';
    if receipt is null or coalesce(length(written_reason),0) not between 10 and 500
      or written_reason ~ '[[:cntrl:]]' or p_command->'confirmed' is distinct from 'true'::jsonb
      or action is null or action not in ('update','restore')
    then raise exception 'invalid policy command' using errcode='23514'; end if;

    select * into entry from private.m25_policy_events where request_id=receipt;
    if found then
      if entry.actor_id is distinct from p_actor or entry.command is distinct from p_command
        then raise exception 'request conflict' using errcode='O2002'; end if;
    else
      if policy.revision is distinct from (p_command->>'expectedRevision')::int
        then raise exception 'moderation policy changed' using errcode='O2004'; end if;
      if action='restore' then
        restore_revision:=(p_command->>'restoreRevision')::int;
        if restore_revision=1 then
          select previous_value into desired from private.m25_policy_events where revision=2;
        else
          select new_value into desired from private.m25_policy_events where revision=restore_revision;
        end if;
      else
        desired:=p_command->'value';
      end if;
      if not private.m25_validate(desired) or desired=policy.value
        then raise exception 'invalid moderation policy' using errcode='23514'; end if;
      happened:=clock_timestamp();
      insert into private.m25_policy_events(revision,actor_id,request_id,command,reason,occurred_at,previous_value,new_value)
      values(policy.revision+1,p_actor,receipt,p_command,written_reason,happened,policy.value,desired);
      update private.m25_policy set revision=revision+1,updated_at=happened,value=desired
      where singleton returning * into policy;
    end if;
  end if;

  return jsonb_build_object('revision',policy.revision,'updatedAt',policy.updated_at,'value',policy.value,
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',e.revision,'occurredAt',e.occurred_at,
      'reason',e.reason,'actorName',coalesce(p.display_name,p.username),'previous',e.previous_value,'value',e.new_value,
      'restoredFrom',e.command->'restoreRevision') order by e.revision desc)
      from (select * from private.m25_policy_events where p_before is null or revision<p_before order by revision desc limit 21) e
      left join public.profiles p on p.user_id=e.actor_id),'[]'::jsonb));
end
$$;

create function public.m25_action_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.m23_authority(p_actor,p_session,p_aal2,p_totp,p_workspace);
  return (select value from private.m25_policy where singleton);
end
$$;

alter table private.m22_account_events add column policy_revision integer not null default 1;

create function private.m25_decision_policy()
returns trigger language plpgsql set search_path='' as $$
declare policy private.m25_policy; v jsonb; maximum int;
begin
  -- Native commands already authorize and serialize decisions. Check only newly appended decisions,
  -- in the same transaction, so denials roll back the command and replay still returns its receipt.
  select * into strict policy from private.m25_policy where singleton for share;
  v:=policy.value;

  if tg_table_name='m22_account_events' then
    new.policy_revision:=policy.revision;
    if new.action in ('suspension_created','ban_issued') and not (v->'reasonCategories' ? (new.after_state->>'category'))
      then raise exception 'moderation category disabled' using errcode='23514'; end if;
    if new.authority='administrator' and new.action in ('suspension_created','suspension_extended')
      and (new.after_state->>'expiresAt')::timestamptz >
        (new.after_state->>'startsAt')::timestamptz+make_interval(mins=>(v->>'administratorMaxMinutes')::int)
      then raise exception 'account duration exceeds policy' using errcode='M2201'; end if;
  else
    new.policy_version:=policy.revision;
    if new.action='restrict' and not (v->'reasonCategories' ? (new.current->>'category'))
      then raise exception 'moderation category disabled' using errcode='23514'; end if;
    if new.action in ('delegate','update_delegation') then
      if not (v->'delegableCapabilities' ? new.capability)
        then raise exception 'delegation disabled by policy' using errcode='42501'; end if;
      if (new.current->>'maxMinutes')::int>(v->>'moderatorMaxMinutes')::int
        then raise exception 'delegation duration exceeds policy' using errcode='M2302'; end if;
    elsif new.action in ('restrict','extend') and new.authority<>'founder' then
      if new.authority='moderator' and not (v->'delegableCapabilities' ? new.capability)
        then raise exception 'delegation disabled by policy' using errcode='42501'; end if;
      maximum:=(v->>case new.authority when 'moderator' then 'moderatorMaxMinutes' else 'administratorMaxMinutes' end)::int;
      if (new.current->>'expiresAt')::timestamptz >
        (new.current->>'startsAt')::timestamptz+make_interval(mins=>maximum)
        then raise exception 'feature duration exceeds policy' using errcode='M2302'; end if;
    end if;
  end if;
  return new;
end
$$;

create trigger m25_account_policy before insert on private.m22_account_events
for each row execute function private.m25_decision_policy();
create trigger m25_feature_policy before insert on private.m23_events
for each row execute function private.m25_decision_policy();

revoke all on function private.m25_validate(jsonb),private.m25_decision_policy(),
  public.m25_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,int),
  public.m25_action_policy_for_api(uuid,uuid,boolean,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.m25_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,int),
  public.m25_action_policy_for_api(uuid,uuid,boolean,bigint,uuid) to service_role;

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
      or p_before_at>high or p_before_source not in ('homepage','registration','member_experience','verification','moderation') or p_before_revision<2))
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
    ), moderation as (
      select 'moderation'::text collate "C" as source,revision,actor_id,reason,occurred_at,previous_value,new_value
      from private.m25_policy_events
      where occurred_at<=least(high,coalesce(p_before_at,high))
        and (p_before_at is null or (occurred_at,'moderation'::text collate "C",revision)<(p_before_at,p_before_source collate "C",p_before_revision))
      order by occurred_at desc,revision desc limit 21
    ), events as (
      select * from (select * from homepage union all select * from registration union all select * from member_experience union all select * from verification union all select * from moderation) combined
      order by occurred_at desc,source desc,revision desc limit 21
    )
    select jsonb_build_object('high',high,'events',coalesce(jsonb_agg(jsonb_build_object(
      'source',e.source,'revision',e.revision,'actorId',e.actor_id,'actorUsername',p.username,
      'reason',e.reason,'occurredAt',e.occurred_at,'changes',coalesce((
        select jsonb_agg(jsonb_build_object('key',k.key,'before',e.previous_value->k.key,'after',e.new_value->k.key) order by k.position)
        from unnest(array['homepageStatistics','enabled','mode','individualEnabled','organizationEnabled','referralsEnabled','rewardsEnabled',
          'onboardingEnabled','requireCompletion','requireCountry','requireDepartment','requireInterests','requireLanguage','allowSkip','showProgress',
          'profilesEnabled','publicProfiles','privateProfiles','profileEdits','profilePictures','profileBiographies','displayCountry','displayDepartment','displayInterests','personalIntake','organizationIntake','publicFigureIntake','founderBlue','founderGold','appealsIntake','administratorAppointments','organizationAssignments','showBlue','showGold','recognitionEnabled','recognitionAwards','recognitionPublic','suspensionPresets','administratorMaxMinutes','moderatorMaxMinutes','defaultMinutes','delegableCapabilities','reasonCategories','repeatViolationGuidance','notifyStaffGuidance'])
          with ordinality as k(key,position)
        where e.previous_value ? k.key and e.new_value ? k.key
          and e.previous_value->k.key is distinct from e.new_value->k.key
      ),'[]'::jsonb)
    ) order by e.occurred_at desc,e.source desc,e.revision desc),'[]'::jsonb))
    from events e left join public.profiles p on p.user_id=e.actor_id
  );
end;
$$;
