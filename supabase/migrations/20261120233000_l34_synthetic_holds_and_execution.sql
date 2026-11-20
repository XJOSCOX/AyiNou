create table private.lifecycle_authorities (
  case_id uuid references private.privacy_cases(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  authority text not null check(authority in ('approve','place_hold','release_hold','simulate','restore')),
  expires_at timestamptz not null,
  conflicted boolean not null default false,
  primary key(case_id,actor_id)
);

create table private.lifecycle_holds (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  placed_for_plan uuid not null references private.lifecycle_plans(id) on delete restrict,
  subject_id uuid not null references auth.users(id) on delete restrict,
  placed_by uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  scope text not null,
  resource_ref text not null,
  reason text not null check(reason in ('case_evidence','shared_resource','verification')),
  policy_version integer not null references private.lifecycle_policy(version),
  created_at timestamptz not null default clock_timestamp(),
  review_at timestamptz not null,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete restrict,
  check((released_at is null)=(released_by is null)),
  check(released_by is distinct from placed_by),
  unique(placed_for_plan,placed_by,request_key)
);
create index lifecycle_active_hold_subject on private.lifecycle_holds(subject_id) where released_at is null;

-- Markers stand in for a provider's records. These columns have no keys, URLs or links to real assets.
create table private.lifecycle_steps (
  plan_id uuid not null references private.lifecycle_plans(id) on delete restrict,
  step text not null check(step in ('profile_projection','provider_media')),
  state text not null default 'pending' check(state in ('pending','leased','retryable','verified')),
  fixture_present boolean not null default true,
  worker uuid references auth.users(id) on delete restrict,
  lease uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 5),
  verified_at timestamptz,
  primary key(plan_id,step),
  check((state='leased')=(lease is not null and lease_until is not null and worker is not null)),
  check((state='verified')=(verified_at is not null))
);

create table private.lifecycle_restore_checks (
  plan_id uuid primary key references private.lifecycle_plans(id) on delete restrict,
  restored_by uuid not null references auth.users(id) on delete restrict,
  reapplied_at timestamptz not null default clock_timestamp(),
  released_by uuid references auth.users(id) on delete restrict,
  released_at timestamptz,
  check(released_by is distinct from restored_by),
  check((released_at is null)=(released_by is null))
);

alter table private.lifecycle_authorities enable row level security;
alter table private.lifecycle_holds enable row level security;
alter table private.lifecycle_steps enable row level security;
alter table private.lifecycle_restore_checks enable row level security;
revoke all on private.lifecycle_authorities,private.lifecycle_holds,private.lifecycle_steps,private.lifecycle_restore_checks
  from public,anon,authenticated,service_role;

create function private.lifecycle_summary(p_inventory jsonb,p_plan private.lifecycle_plans,p_subject uuid,p_stale boolean)
returns jsonb language sql stable set search_path='' as $$
  with flags as (
    select array(select distinct d->>'kind' from pg_catalog.jsonb_array_elements(p_inventory->'dependencies') d order by 1)
      || case when exists(select 1 from private.lifecycle_holds where subject_id=p_subject and released_at is null)
         then array['evidence_hold'] else array[]::text[] end as warnings
  )
  select pg_catalog.jsonb_build_object(
    'state',case when p_stale then 'stale'
      when p_plan.completed_at is not null and (
        exists(select 1 from private.lifecycle_steps where plan_id=p_plan.id and fixture_present)
        or exists(select 1 from private.lifecycle_restore_checks where plan_id=p_plan.id and released_at is null)) then 'quarantined'
      when p_plan.completed_at is not null then 'simulated'
      when cardinality(warnings)>0 then 'blocked'
      when p_plan.id is null then 'preview'
      when exists(select 1 from private.lifecycle_steps where plan_id=p_plan.id
        and (state='retryable' or state='leased' or state='verified')) then 'partial'
      when p_plan.approved_by is not null then 'approved'
      else 'review_required' end,
    'caseVersion',p_plan.case_version,'planVersion',p_plan.version,'receipt',p_plan.id,
    'warnings',warnings,'confirmed',p_plan.confirmed_at is not null,
    'verifiedSteps',(select count(*) from private.lifecycle_steps where plan_id=p_plan.id and state='verified'))
  from flags
$$;

create function public.lifecycle_subject_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_case uuid,p_action text,p_case_version integer default null,p_plan_version integer default null,p_key uuid default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='4s' as $$
declare
  c private.privacy_cases;
  p private.lifecycle_plans;
  latest private.lifecycle_plans;
  inventory jsonb;
begin
  if p_action is null or p_action not in ('preview','status','plan','confirm') then
    raise exception using errcode='PT400',message='INVALID_INPUT';
  end if;
  perform private.require_lifecycle_session(p_actor,p_session,p_aal2,p_totp,p_action in ('plan','confirm'));
  if p_action in ('plan','confirm') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lifecycle:'||p_actor::text,0));
  end if;
  select * into c from private.privacy_cases where id=p_case and subject_id=p_actor and kind in ('deletion','closure');
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if p_action in ('plan','confirm') then
    select * into c from private.privacy_cases where id=c.id for update;
  end if;
  if c.state<>'received' or c.policy_context<>'unresolved' then
    raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT';
  end if;
  perform private.require_lifecycle_session(p_actor,p_session,p_aal2,p_totp,p_action in ('plan','confirm'));
  select * into latest from private.lifecycle_plans where case_id=c.id order by version desc limit 1;
  inventory:=private.lifecycle_inventory(p_actor);
  if p_action in ('preview','status') then
    return private.lifecycle_summary(inventory,latest,p_actor,latest.id is not null and latest.snapshot<>inventory)
      || pg_catalog.jsonb_build_object('caseVersion',c.version);
  end if;
  if p_case_version is distinct from c.version then raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT'; end if;
  if p_action='plan' then
    if p_key is null then raise exception using errcode='PT400',message='INVALID_INPUT'; end if;
    select * into p from private.lifecycle_plans where case_id=c.id and request_key=p_key;
    if p.id is not null then
      return private.lifecycle_summary(inventory,p,p_actor,p.snapshot<>inventory or latest.version<>p.version);
    end if;
    if exists(select 1 from private.lifecycle_steps where plan_id=latest.id and attempts>0) or coalesce(latest.version,0)>=20 then
      raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT';
    end if;
    insert into private.lifecycle_plans(case_id,version,case_version,request_key,snapshot)
      values(c.id,coalesce(latest.version,0)+1,c.version,p_key,inventory) returning * into p;
    insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'planned');
  else
    p:=latest;
    if p.id is null or p.version is distinct from p_plan_version or p.snapshot<>inventory or p_key is null
      or (p.confirmation_key is not null and p.confirmation_key<>p_key)
      or pg_catalog.jsonb_array_length(inventory->'dependencies')>0
      or exists(select 1 from private.lifecycle_holds where subject_id=p_actor and released_at is null)
    then raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT'; end if;
    if p.confirmed_at is null then
      update private.lifecycle_plans set confirmed_at=clock_timestamp(),confirmation_key=p_key where id=p.id returning * into p;
      insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'confirmed');
    end if;
  end if;
  return private.lifecycle_summary(inventory,p,p_actor,false);
end;
$$;

create function public.lifecycle_operator_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_plan uuid,p_action text,p_request uuid default null,p_scope text default null,p_ref text default null,
  p_reason text default null,p_hold uuid default null,p_step text default null,p_lease uuid default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='4s' as $$
declare
  p private.lifecycle_plans;
  c private.privacy_cases;
  authority_needed text;
  inventory jsonb;
  h private.lifecycle_holds;
  s private.lifecycle_steps;
  outcome text;
begin
  authority_needed:=case
    when p_action in ('approve','restore_release') then 'approve'
    when p_action in ('place_hold','release_hold') then p_action
    when p_action='restore_reapply' then 'restore'
    when p_action in ('claim','effect','reconcile') then 'simulate'
    end;
  if authority_needed is null then raise exception using errcode='PT400',message='INVALID_INPUT'; end if;
  perform private.require_lifecycle_session(p_actor,p_session,p_aal2,p_totp,true);
  select * into p from private.lifecycle_plans where id=p_plan;
  if p.id is null then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  select * into c from private.privacy_cases where id=p.case_id;
  if c.subject_id=p_actor or not exists(select 1 from private.lifecycle_fixtures where subject_id=c.subject_id)
    or not exists(select 1 from private.lifecycle_authorities
      where case_id=p.case_id and actor_id=p_actor and authority=authority_needed and not conflicted and expires_at>clock_timestamp())
  then raise exception using errcode='PT403',message='LIFECYCLE_FORBIDDEN'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lifecycle:'||c.subject_id::text,0));
  select * into c from private.privacy_cases where id=c.id for update;
  select * into p from private.lifecycle_plans where id=p.id for update;
  perform private.require_lifecycle_session(p_actor,p_session,p_aal2,p_totp,true);
  if not exists(select 1 from private.lifecycle_authorities
      where case_id=p.case_id and actor_id=p_actor and authority=authority_needed and not conflicted and expires_at>clock_timestamp())
  then raise exception using errcode='PT403',message='LIFECYCLE_FORBIDDEN'; end if;

  if p_action='release_hold' then
    -- Release stays available after withdrawal only to the original case's independent release authority.
    select * into h from private.lifecycle_holds where id=p_hold and placed_for_plan=p.id and subject_id=c.subject_id for update;
    if h.id is null then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
    if h.placed_by=p_actor or (h.released_by is not null and h.released_by<>p_actor) then
      raise exception using errcode='PT403',message='LIFECYCLE_FORBIDDEN';
    end if;
    if h.released_at is null then
      update private.lifecycle_holds set released_by=p_actor,released_at=clock_timestamp() where id=h.id;
      insert into private.lifecycle_events(plan_id,actor_id,kind,resource) values(p.id,p_actor,'hold_released',h.id);
    end if;
    return '{"released":true}'::jsonb;
  end if;

  inventory:=private.lifecycle_inventory(c.subject_id);
  if c.state<>'received' or c.version<>p.case_version or c.policy_context<>'unresolved' or p.policy_version<>1
    or exists(select 1 from private.lifecycle_plans where case_id=c.id and version>p.version)
    or p.snapshot<>inventory then raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT'; end if;

  if p_action='place_hold' then
    if p_request is null or p_reason is null or p_reason not in ('case_evidence','shared_resource','verification')
      or not exists(select 1 from pg_catalog.jsonb_array_elements(inventory->'resources') r
        where r->>'category'=p_scope and r->>'ref'=p_ref)
    then raise exception using errcode='PT400',message='INVALID_INPUT'; end if;
    select * into h from private.lifecycle_holds where placed_for_plan=p.id and placed_by=p_actor and request_key=p_request;
    if h.id is not null then
      if (h.scope,h.resource_ref,h.reason) is distinct from (p_scope,p_ref,p_reason) then
        raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT';
      end if;
    else
      insert into private.lifecycle_holds(placed_for_plan,subject_id,placed_by,request_key,scope,resource_ref,reason,policy_version,review_at)
        values(p.id,c.subject_id,p_actor,p_request,p_scope,p_ref,p_reason,p.policy_version,clock_timestamp()+interval '1 day') returning * into h;
      insert into private.lifecycle_events(plan_id,actor_id,kind,resource) values(p.id,p_actor,'hold_placed',h.id);
    end if;
    return pg_catalog.jsonb_build_object('hold',h.id);
  end if;

  if p.confirmed_at is null or pg_catalog.jsonb_array_length(inventory->'dependencies')>0
    or exists(select 1 from private.lifecycle_holds where subject_id=c.subject_id and released_at is null)
  then raise exception using errcode='PT409',message='LIFECYCLE_BLOCKED'; end if;
  if p_action='approve' then
    if p.approved_by is not null and p.approved_by<>p_actor then raise exception using errcode='PT403',message='LIFECYCLE_FORBIDDEN'; end if;
    if p.approved_by is null then
      update private.lifecycle_plans set approved_by=p_actor where id=p.id returning * into p;
      insert into private.lifecycle_steps(plan_id,step) values(p.id,'profile_projection'),(p.id,'provider_media');
      insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'approved');
    end if;
    return private.lifecycle_summary(inventory,p,c.subject_id,false);
  end if;
  if p.approved_by is null or not exists(select 1 from private.lifecycle_authorities
    where case_id=p.case_id and actor_id=p.approved_by and authority='approve' and not conflicted and expires_at>clock_timestamp())
  then raise exception using errcode='PT403',message='LIFECYCLE_FORBIDDEN'; end if;

  if p_action in ('restore_reapply','restore_release') then
    if p.completed_at is null then raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT'; end if;
    if p_action='restore_reapply' then
      -- A new observed resurrection always invalidates an earlier release receipt.
      if exists(select 1 from private.lifecycle_steps where plan_id=p.id and fixture_present) then
        update private.lifecycle_steps set fixture_present=false where plan_id=p.id and state='verified';
        insert into private.lifecycle_restore_checks(plan_id,restored_by) values(p.id,p_actor)
          on conflict(plan_id) do update set restored_by=excluded.restored_by,reapplied_at=clock_timestamp(),released_at=null,released_by=null;
        insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'restore_reapplied');
      end if;
    else
      if exists(select 1 from private.lifecycle_steps where plan_id=p.id and fixture_present)
        or not exists(select 1 from private.lifecycle_restore_checks where plan_id=p.id and restored_by<>p_actor)
      then raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT'; end if;
      update private.lifecycle_restore_checks set released_by=p_actor,released_at=clock_timestamp() where plan_id=p.id and released_at is null;
      if found then insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'restore_released'); end if;
    end if;
    return private.lifecycle_summary(inventory,p,c.subject_id,false);
  end if;

  select * into s from private.lifecycle_steps where plan_id=p.id and step=p_step for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if s.state='verified' then return '{"status":"verified"}'::jsonb; end if;
  if p_action='claim' then
    if p_step='provider_media' and not exists(select 1 from private.lifecycle_steps
      where plan_id=p.id and step='profile_projection' and state='verified') then
      raise exception using errcode='PT409',message='LIFECYCLE_CONFLICT';
    end if;
    if s.state='leased' then
      if s.worker=p_actor and s.lease_until>clock_timestamp() then return pg_catalog.jsonb_build_object('lease',s.lease); end if;
      raise exception using errcode='PT409',message='LIFECYCLE_RECONCILE_REQUIRED';
    end if;
    if not s.fixture_present or s.attempts>=5 then raise exception using errcode='PT409',message='LIFECYCLE_RECONCILE_REQUIRED'; end if;
    update private.lifecycle_steps set state='leased',lease=pg_catalog.gen_random_uuid(),worker=p_actor,
      lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1
      where plan_id=p.id and step=s.step returning * into s;
    insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'claimed');
    return pg_catalog.jsonb_build_object('lease',s.lease);
  end if;
  if s.state<>'leased' or (p_lease is not null and s.lease is distinct from p_lease) then
    raise exception using errcode='PT409',message='LIFECYCLE_RECONCILE_REQUIRED';
  end if;
  if p_action='effect' then
    if p_lease is null or s.worker<>p_actor or s.lease_until<=clock_timestamp() then
      raise exception using errcode='PT409',message='LIFECYCLE_RECONCILE_REQUIRED';
    end if;
    if s.fixture_present then
      update private.lifecycle_steps set fixture_present=false where plan_id=p.id and step=s.step;
      insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'simulated_effect');
    end if;
    return '{"status":"awaiting_readback"}'::jsonb;
  end if;
  -- A worker may lose the claim response itself. After expiry a scoped reconciler
  -- can inspect the marker without the lost fence, but can never run the effect.
  if s.lease_until>clock_timestamp() and (s.fixture_present or p_lease is null or s.worker<>p_actor) then
    raise exception using errcode='PT409',message='LIFECYCLE_RECONCILE_REQUIRED';
  end if;
  outcome:=case when s.fixture_present then 'retryable' else 'verified' end;
  update private.lifecycle_steps set state=outcome,lease=null,lease_until=null,worker=null,
    verified_at=case when outcome='verified' then clock_timestamp() end where plan_id=p.id and step=s.step;
  insert into private.lifecycle_events(plan_id,actor_id,kind)
    values(p.id,p_actor,case when outcome='verified' then 'reconciled' else 'retryable' end);
  if not exists(select 1 from private.lifecycle_steps where plan_id=p.id and state<>'verified') then
    update private.lifecycle_plans set completed_at=clock_timestamp() where id=p.id and completed_at is null;
    if found then insert into private.lifecycle_events(plan_id,actor_id,kind) values(p.id,p_actor,'simulated'); end if;
  end if;
  return pg_catalog.jsonb_build_object('status',outcome);
end;
$$;

revoke all on function private.lifecycle_summary(jsonb,private.lifecycle_plans,uuid,boolean),
  public.lifecycle_subject_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,integer,uuid),
  public.lifecycle_operator_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,text,text,text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.lifecycle_subject_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,integer,uuid),
  public.lifecycle_operator_for_api(uuid,uuid,boolean,bigint,uuid,text,uuid,text,text,text,uuid,text,uuid)
  to service_role;
