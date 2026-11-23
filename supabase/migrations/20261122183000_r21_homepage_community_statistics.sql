-- R2.1: one allowlisted global boolean with an explicit deployment default.
create table private.platform_boolean_policies (
  policy_key text primary key check (policy_key='homepage.community_statistics.enabled'),
  enabled boolean not null,
  revision integer not null default 1 check (revision>0),
  updated_at timestamptz not null default clock_timestamp()
);
create table private.platform_boolean_policy_events (
  policy_key text not null references private.platform_boolean_policies(policy_key) on delete restrict,
  revision integer not null check (revision>1),
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_enabled boolean not null,
  enabled boolean not null,
  reason text not null check (length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]'),
  request_id uuid not null,
  occurred_at timestamptz not null,
  primary key(policy_key,revision),
  unique(actor_id,request_id),
  check(previous_enabled<>enabled)
);
alter table private.platform_boolean_policies enable row level security;
alter table private.platform_boolean_policy_events enable row level security;
revoke all on private.platform_boolean_policies,private.platform_boolean_policy_events from public,anon,authenticated,service_role;

insert into private.platform_boolean_policies(policy_key,enabled)
values ('homepage.community_statistics.enabled',true);

-- Resolve visibility and the existing privacy-safe projection within one snapshot.
create function public.homepage_community_statistics_for_api()
returns jsonb language sql stable security definer set search_path='' as $$
  with homepage as materialized (
    select public.community_stats_v2_for_api() as stats from private.platform_boolean_policies
    where policy_key='homepage.community_statistics.enabled' and enabled
  )
  select jsonb_build_object('registered',stats->'registered','haiti',stats->'haiti','diaspora',stats->'diaspora')
  from homepage
$$;

create function public.founder_homepage_policy_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_enabled boolean,p_expected integer,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r private.platform_boolean_policies;
  prior private.platform_boolean_policy_events;
  k constant text := 'homepage.community_statistics.enabled';
begin
  if p_request is not null then perform private.s2b_lock_actor(p_actor,p_session); end if;
  if not private.platform_founder(p_actor) or not private.institution_actor(p_actor)
    or public.s2b_workflow_for_api(p_actor,p_session,p_aal2,p_totp,'read',null,p_workspace,'admin',null,null) is null
    then raise exception 'Founder workspace unavailable' using errcode='O2003'; end if;

  if p_request is null then
    if p_enabled is not null or p_expected is not null or p_reason is not null
      then raise exception 'invalid read' using errcode='23514'; end if;
    select * into r from private.platform_boolean_policies where policy_key=k;
  else
    if p_enabled is null or p_expected is null or p_expected<1 or not
      coalesce(length(btrim(p_reason)) between 10 and 500 and btrim(p_reason) !~ '[[:cntrl:]]',false)
      then raise exception 'invalid policy change' using errcode='23514'; end if;
    select * into r from private.platform_boolean_policies where policy_key=k for update;
    if found then
      select * into prior from private.platform_boolean_policy_events where actor_id=p_actor and request_id=p_request;
      if found then
        if prior.policy_key<>k or prior.enabled<>p_enabled or prior.revision-1<>p_expected or prior.reason<>btrim(p_reason)
          then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('key',k,'enabled',prior.enabled,'revision',prior.revision,'updatedAt',prior.occurred_at);
      end if;
      if r.revision<>p_expected then raise exception 'stale policy revision' using errcode='O2004'; end if;
      if r.enabled=p_enabled then raise exception 'value already saved' using errcode='55000'; end if;
      update private.platform_boolean_policies set enabled=p_enabled,revision=revision+1,updated_at=clock_timestamp()
        where policy_key=k returning * into r;
      insert into private.platform_boolean_policy_events(policy_key,revision,actor_id,previous_enabled,enabled,reason,request_id,occurred_at)
        values(k,r.revision,p_actor,not p_enabled,p_enabled,btrim(p_reason),p_request,r.updated_at);
    end if;
  end if;
  if r.policy_key is null then return null; end if;
  return jsonb_build_object('key',k,'enabled',r.enabled,'revision',r.revision,'updatedAt',r.updated_at);
end;
$$;
revoke all on function public.homepage_community_statistics_for_api(),
  public.founder_homepage_policy_for_api(uuid,uuid,boolean,bigint,uuid,boolean,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.homepage_community_statistics_for_api(),
  public.founder_homepage_policy_for_api(uuid,uuid,boolean,bigint,uuid,boolean,integer,text,uuid)
  to service_role;
