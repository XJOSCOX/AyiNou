-- Extend the existing protected read model. Operational custody, ACLs, and activation checks are unchanged.
create or replace function private.c16_dashboard(p_release text,p_before integer,p_query text) returns jsonb
language plpgsql stable set search_path='' as $$
declare p private.c16_policy; room uuid; staff jsonb; participants jsonb; metrics jsonb; next_revision integer;
  current_status text; active_enrollments integer; triagers integer; reviewers integer; check_release text;
  operational_evidence jsonb;
begin
  select id into room from feed_data.communities where slug='ouest' and kind='department';
  select * into p from private.c16_policy;
  check_release:=coalesce(p_release,p.release);
  current_status:=case when p.revision is null then 'unconfigured'
    when p.ends_at<=statement_timestamp() then 'expired'
    when p.mode='active' and (p.release is distinct from p_release or not private.c16_ready(room,p.release)
      or p.evidence_digest is distinct from private.c16_evidence_digest(room,p.release)) then 'blocked'
    else p.mode end;
  select count(*) into active_enrollments from private.c16_enrollment e where private.c16_participant(e.user_id,room);
  select count(*) filter(where a.lane='triage'),count(*) filter(where a.lane='review' and not private.c16_roster(a.actor_id,room,'triage'))
    into triagers,reviewers from private.c12_authority a where a.community_id=room and private.c16_roster(a.actor_id,room,a.lane)
    and not private.c16_participant(a.actor_id,room);
  select coalesce(jsonb_agg(x.item order by x.handle),'[]'::jsonb) into staff from (
    select profile.username handle,jsonb_build_object('id',a.actor_id,'handle',profile.username,'lane',a.lane,
      'eligible',private.c16_roster(a.actor_id,room,a.lane) and not private.c16_participant(a.actor_id,room),
      'expiresAt',a.until_at,'revoked',a.revoked_at is not null,
      'grantStatus',case when a.revoked_at is not null then 'revoked'
        when a.until_at<=statement_timestamp() then 'expired'
        when private.c16_roster(a.actor_id,room,a.lane)
          and (a.lane<>'review' or not private.c16_roster(a.actor_id,room,'triage')) then 'eligible'
        else 'recertify' end,
      'assigned',(select count(*) from private.c12_cases r join private.c16_cases k on k.need_id=r.need_id
        where r.state in ('submitted','under_review','needs_information')
          and case when a.lane='triage' then r.triager=a.actor_id else r.reviewer=a.actor_id end),
      'challenges',(select count(*) from private.c12_challenges c join private.c16_cases k on k.need_id=c.need_id
        where a.lane='review' and c.reviewer=a.actor_id and c.status='pending')) item
    from private.c12_authority a left join public.profiles profile on profile.user_id=a.actor_id
    where a.community_id=room order by a.until_at desc,a.actor_id limit 50) x;
  select coalesce(jsonb_agg(x.item order by x.handle),'[]'::jsonb) into participants from (
    select profile.username handle,jsonb_build_object('id',e.user_id,'handle',profile.username,'expiresAt',e.until_at,
      'status',case when e.revoked_at is not null then 'removed' when e.until_at<=statement_timestamp() then 'expired'
        when private.c16_participant(e.user_id,room) then 'eligible' else 'blocked' end) item
    from private.c16_enrollment e left join public.profiles profile on profile.user_id=e.user_id
    order by (e.revoked_at is null and e.until_at>statement_timestamp()) desc,e.until_at desc,e.user_id limit 50) x;
  select jsonb_build_object(
    'pending',(select count(*) from private.c16_cases k join private.c11_needs n on n.id=k.need_id
      left join private.c12_cases r on r.need_id=k.need_id where n.status='submitted'
        and coalesce(r.state,'submitted') in ('submitted','under_review','needs_information')),
    'awaitingReview',(select count(*) from private.c16_cases k join private.c11_needs n on n.id=k.need_id
      left join private.c12_cases r on r.need_id=k.need_id where n.status='submitted'
        and coalesce(r.state,'submitted') in ('submitted','under_review') and not coalesce(r.accepted,false)),
    'challenges',(select count(*) from private.c12_challenges c join private.c16_cases k on k.need_id=c.need_id where c.status='pending')
      +(select count(*) from private.c13_publications p1 join private.c16_cases k on k.need_id=p1.need_id where p1.state='challenged'),
    'publications',(select count(*) from private.c13_publications p1 join private.c16_cases k on k.need_id=p1.need_id where p1.live_proposal is not null),
    'associations',(select count(*) from private.c14_links l join private.c13_publications p1 on p1.id=l.publication_id
      join private.c16_cases k on k.need_id=p1.need_id where l.state='approved' and l.activated_at is not null),
    'conflicts',(select count(*) from private.c12_conflicts c join private.c16_cases k on k.need_id=c.need_id),
    'weekly',private.c16_weekly_count()) into metrics;
  select revision into next_revision from private.c16_history where p_before is null or revision<p_before
    order by revision desc offset 20 limit 1;
  -- Use the same latest, non-future record lookup as the activation checks.
  -- Keep evidence references within independent custody.
  select jsonb_object_agg(k, jsonb_build_object(
    'status',case when e.verified_at is null then 'missing' when e.revoked_at is not null then 'revoked'
      when e.valid_until<=statement_timestamp() then 'expired' else 'verified' end,
    'operator',profile.username,'verifiedAt',e.verified_at,'expiresAt',e.valid_until,'revokedAt',e.revoked_at))
    into operational_evidence
  from jsonb_object_keys(private.c16_requirements(room,check_release)) k
  left join lateral (
    select record.attested_by,record.verified_at,record.valid_until,record.revoked_at
    from private.c16_evidence record
    where record.community_id=room and record.release=check_release and record.requirement=k
      and record.verified_at<=statement_timestamp()
    order by record.verified_at desc limit 1
  ) e on true
  left join public.profiles profile on profile.user_id=e.attested_by;
  return jsonb_build_object(
    'revision',coalesce(p.revision,0),'status',current_status,'scope','ouest','scopeAvailable',room is not null,
    'capacity',coalesce(p.capacity,10),'durationDays',coalesce(p.duration_days,30),'endsAt',p.ends_at,
    'stages',jsonb_build_object('intake',coalesce(p.intake,false),'review',coalesce(p.review,false),
      'publication',coalesce(p.publication,false),'association',coalesce(p.association,false)),
    'requirements',private.c16_requirements(room,check_release),'releaseConfigured',p_release is not null,
    'operationalEvidence',operational_evidence,
    'runtimeRelease',p_release,'policyRelease',p.release,
    'releaseMatches',p_release is not null and p.release is not distinct from p_release,
    'ready',coalesce(p.revision is not null and p.release=p_release and (p.intake or p.review or p.publication or p.association)
      and private.c16_ready(room,p.release),false),
    'activeParticipants',active_enrollments,'triagers',triagers,'reviewers',reviewers,
    'enrollments',participants,'staff',staff,'metrics',case when room is not null then metrics else null end,
    'candidates',case when length(coalesce(p_query,''))>=2 then coalesce((select jsonb_agg(x.item order by x.handle) from (
      select profile.username handle,jsonb_build_object('id',profile.user_id,'handle',profile.username) item
      from feed_data.community_memberships m join public.profiles profile on profile.user_id=m.user_id
      where m.community_id=room and starts_with(lower(profile.username),lower(p_query))
        and private.c16_eligible(profile.user_id,room)
        and not exists(select from private.c16_enrollment e where e.user_id=profile.user_id and e.revoked_at is null and e.until_at>statement_timestamp())
      order by profile.username limit 12) x),'[]'::jsonb) else '[]'::jsonb end,
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'action',h.action,'reason',h.reason,
      'occurredAt',h.occurred_at,'actor',profile.username,'subject',subject.username,'before',h.before_value,'after',h.after_value) order by h.revision desc)
      from (select * from private.c16_history where p_before is null or revision<p_before order by revision desc limit 20) h
      left join public.profiles profile on profile.user_id=h.actor_id
      left join public.profiles subject on subject.user_id=h.subject_id),'[]'::jsonb),
    'hasMore',next_revision is not null);
end
$$;
