-- Read existing policy events through the original private Founder workspace.
create index homepage_policy_audit_time on private.platform_boolean_policy_events(occurred_at desc,revision desc);
create index registration_policy_audit_time on private.registration_policy_events(occurred_at desc,revision desc);

create function public.platform_policy_audit_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
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
      or p_before_at>high or p_before_source not in ('homepage','registration') or p_before_revision<2))
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
    ), events as (
      select * from (select * from homepage union all select * from registration) combined
      order by occurred_at desc,source desc,revision desc limit 21
    )
    select jsonb_build_object('high',high,'events',coalesce(jsonb_agg(jsonb_build_object(
      'source',e.source,'revision',e.revision,'actorId',e.actor_id,'actorUsername',p.username,
      'reason',e.reason,'occurredAt',e.occurred_at,'changes',coalesce((
        select jsonb_agg(jsonb_build_object('key',k.key,'before',e.previous_value->k.key,'after',e.new_value->k.key) order by k.position)
        from unnest(array['homepageStatistics','enabled','mode','individualEnabled','organizationEnabled','referralsEnabled','rewardsEnabled'])
          with ordinality as k(key,position)
        where e.previous_value ? k.key and e.new_value ? k.key
          and e.previous_value->k.key is distinct from e.new_value->k.key
      ),'[]'::jsonb)
    ) order by e.occurred_at desc,e.source desc,e.revision desc),'[]'::jsonb))
    from events e left join public.profiles p on p.user_id=e.actor_id
  );
end;
$$;

revoke all on function public.platform_policy_audit_for_api(uuid,uuid,boolean,bigint,uuid,timestamptz,timestamptz,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.platform_policy_audit_for_api(uuid,uuid,boolean,bigint,uuid,timestamptz,timestamptz,text,integer)
  to service_role;
