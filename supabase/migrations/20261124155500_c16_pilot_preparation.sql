-- C1.6 prepares the production pilot. There are deliberately no policy, enrollment or attestation seeds.
create table private.c16_policy (
  singleton boolean primary key default true check (singleton),
  community_id uuid not null references feed_data.communities(id),
  revision integer not null check (revision > 0),
  mode text not null check (mode in ('prepared','active','paused')),
  capacity integer not null check (capacity between 1 and 10),
  duration_days integer not null check (duration_days between 1 and 30),
  intake boolean not null, review boolean not null, publication boolean not null, association boolean not null,
  release text check (release ~ '^[0-9a-f]{40}$'),
  starts_at timestamptz, ends_at timestamptz, evidence_digest bytea,
  check ((mode='prepared' and starts_at is null and ends_at is null and evidence_digest is null)
    or (mode in ('active','paused') and starts_at is not null and ends_at is not null and evidence_digest is not null)),
  check (ends_at is null or (ends_at>starts_at and ends_at<=starts_at+interval '30 days'))
);

create table private.c16_enrollment (
  user_id uuid primary key references auth.users(id) on delete cascade,
  until_at timestamptz not null,
  revoked_at timestamptz
);

-- Only an independently reviewed operational process may write these records.
-- Founder dashboard commands and the normal backend role receive no write path.
create table private.c16_evidence (
  requirement text not null check (requirement in ('privacy','support','databaseRecovery','storageRecovery','release','launchBlockers')),
  community_id uuid not null references feed_data.communities(id),
  release text not null check (release ~ '^[0-9a-f]{40}$'),
  evidence_reference text not null check (length(evidence_reference) between 8 and 200),
  attested_by uuid not null,
  verified_at timestamptz not null,
  valid_until timestamptz not null check (valid_until>verified_at),
  revoked_at timestamptz,
  primary key (requirement,community_id,release,verified_at)
);

create table private.c16_cases (
  need_id uuid primary key references private.c11_needs(id),
  submitted_at timestamptz
);
create index c16_recent_submissions on private.c16_cases(submitted_at) where submitted_at is not null;

create table private.c16_history (
  revision integer primary key,
  actor_id uuid not null, workspace_id uuid not null,
  request_id uuid not null unique,
  digest bytea not null,
  action text not null,
  subject_id uuid,
  reason text not null,
  before_value jsonb, after_value jsonb not null,
  occurred_at timestamptz not null
);

alter table private.c16_policy enable row level security;
alter table private.c16_enrollment enable row level security;
alter table private.c16_evidence enable row level security;
alter table private.c16_cases enable row level security;
alter table private.c16_history enable row level security;
revoke all on private.c16_policy,private.c16_enrollment,private.c16_evidence,private.c16_cases,private.c16_history
  from public,anon,authenticated,service_role;

create function private.c16_ouest(p_room uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from feed_data.communities c where c.id=p_room and c.slug='ouest' and c.kind='department')
$$;

create function private.c16_eligible(p_actor uuid,p_room uuid) returns boolean
language sql stable set search_path='' as $$
  select coalesce(private.c16_ouest(p_room) and private.institution_actor(p_actor)
    and private.member_onboarding_access(p_actor) and feed_data.community_member(p_room,p_actor)
    and not exists(select from private.m23_restrictions r
      where r.subject_id=p_actor and r.capability='community_need_submit' and r.revoked_at is null
        and r.starts_at<=statement_timestamp() and (r.expires_at is null or r.expires_at>statement_timestamp())
        and (r.scope_kind='platform' or (r.scope_kind='community' and r.scope_id=p_room))),false)
$$;

create function private.c16_participant(p_actor uuid,p_room uuid) returns boolean
language sql stable set search_path='' as $$
  select private.c16_eligible(p_actor,p_room) and exists(select from private.c16_enrollment e
    where e.user_id=p_actor and e.revoked_at is null and e.until_at>statement_timestamp())
$$;

create function private.c16_roster(p_actor uuid,p_room uuid,p_lane text) returns boolean
language sql stable set search_path='' as $$
  select private.c16_ouest(p_room) and coalesce(private.c12_granted(p_actor,p_room,p_lane),false)
    and not private.c16_participant(p_actor,p_room)
    and (p_lane<>'review' or not coalesce(private.platform_admin(p_actor),false))
$$;

create function private.c16_requirements(p_room uuid,p_release text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_object_agg(k, coalesce((select case when e.revoked_at is null and e.valid_until>statement_timestamp()
     then 'verified' else 'pending' end
    from private.c16_evidence e
    where e.community_id=p_room and e.release=p_release and e.requirement=k and e.verified_at<=statement_timestamp()
    order by e.verified_at desc limit 1),'pending'))
  from unnest(array['privacy','support','databaseRecovery','storageRecovery','release','launchBlockers']) k
$$;

-- Bind authorization to the evidence reviewed on the exact activation or resumption.
create function private.c16_evidence_digest(p_room uuid,p_release text) returns bytea
language sql stable set search_path='' as $$
  select extensions.digest(coalesce(jsonb_agg(to_jsonb(latest) order by latest.requirement)::text,'[]'),'sha256')
  from (select distinct on (e.requirement) e.* from private.c16_evidence e
    where e.community_id=p_room and e.release=p_release and e.verified_at<=statement_timestamp()
    order by e.requirement,e.verified_at desc) latest
$$;

create function private.c16_ready(p_room uuid,p_release text) returns boolean
language sql stable set search_path='' as $$
  select private.c16_ouest(p_room) and p_release is not null
    and not exists(select from jsonb_each_text(private.c16_requirements(p_room,p_release)) e where e.value<>'verified')
    and exists(select from private.c16_enrollment e where private.c16_participant(e.user_id,p_room))
    and exists(select from private.c12_authority a where a.community_id=p_room and a.lane='triage'
      and private.c16_roster(a.actor_id,p_room,'triage') and not private.c16_participant(a.actor_id,p_room))
    and (select count(*) from private.c12_authority a where a.community_id=p_room and a.lane='review'
      and private.c16_roster(a.actor_id,p_room,'review') and not private.c16_participant(a.actor_id,p_room)
      and not private.c16_roster(a.actor_id,p_room,'triage'))>=4
$$;

create function private.c16_live(p_room uuid,p_stage text) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c16_policy p where p.community_id=p_room and p.mode='active'
    and p.ends_at>clock_timestamp() and private.c16_ready(p.community_id,p.release)
    and p.evidence_digest=private.c16_evidence_digest(p.community_id,p.release)
    and case p_stage when 'intake' then p.intake when 'review' then p.review
      when 'publication' then p.publication when 'association' then p.association else false end)
$$;

create function private.c16_retained() returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c16_policy p where p.starts_at is not null and private.c16_ouest(p.community_id))
$$;

create function private.c16_case(p_need uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c16_cases where need_id=p_need)
$$;

-- Compatible release routing is necessary but is never an activation decision.
create function public.c16_runtime_for_api(p_release text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from private.c16_policy p where p.release=p_release and private.c16_ouest(p.community_id))
$$;

create function private.c16_require_live(p_room uuid,p_stage text) returns void
language plpgsql set search_path='' as $$
begin
  perform 1 from private.c16_policy p where p.community_id=p_room for share;
  if not private.c16_live(p_room,p_stage) then
    raise exception 'pilot stage closed' using errcode='C1602';
  end if;
end
$$;

create function private.c16_weekly_count() returns integer
language sql volatile set search_path='' as $$
  select count(*)::integer from private.c16_cases where submitted_at>clock_timestamp()-interval '7 days'
$$;

create function private.c16_intake(p_actor uuid,p_room uuid,p_action text,p_need uuid) returns void
language plpgsql set search_path='' as $$
declare limit_value integer;
begin
  perform private.c16_require_live(p_room,'intake');
  perform private.m23_require(p_actor,'community_need_submit','community',p_room);
  if not private.c16_participant(p_actor,p_room) or (p_action<>'create' and not private.c16_case(p_need)) then
    raise exception 'pilot enrollment required' using errcode='42501';
  end if;
  if p_action in ('create','submit') then
    -- Keep the separate cohort quota in the same transaction as the native submission and receipt.
    perform pg_advisory_xact_lock(20261124,1556);
    select capacity into strict limit_value from private.c16_policy;
    if private.c16_weekly_count()>=limit_value then
      raise exception 'pilot capacity reached' using errcode='C1603';
    end if;
    if p_action='submit' then
      update private.c16_cases set submitted_at=clock_timestamp() where need_id=p_need and submitted_at is null;
      if not found then raise exception 'case changed' using errcode='O2004'; end if;
    end if;
  end if;
end
$$;

create function private.c16_dashboard(p_release text,p_before integer,p_query text) returns jsonb
language plpgsql stable set search_path='' as $$
declare p private.c16_policy; room uuid; staff jsonb; participants jsonb; metrics jsonb; next_revision integer;
  current_status text; active_enrollments integer; triagers integer; reviewers integer; check_release text;
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
  return jsonb_build_object(
    'revision',coalesce(p.revision,0),'status',current_status,'scope','ouest','scopeAvailable',room is not null,
    'capacity',coalesce(p.capacity,10),'durationDays',coalesce(p.duration_days,30),'endsAt',p.ends_at,
    'stages',jsonb_build_object('intake',coalesce(p.intake,false),'review',coalesce(p.review,false),
      'publication',coalesce(p.publication,false),'association',coalesce(p.association,false)),
    'requirements',private.c16_requirements(room,check_release),'releaseConfigured',p_release is not null,
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

create function public.c16_pilot_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_release text,p_command jsonb,p_before integer,p_query text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='6s' as $$
declare p private.c16_policy; former jsonb; changed jsonb; grant_row private.c16_enrollment; previous private.c16_history;
  room uuid; target uuid:=(p_command->>'target')::uuid; receipt_id uuid:=(p_command->>'requestId')::uuid;
  verb text:=p_command->>'action'; written_reason text:=btrim(p_command->>'reason');
  command_digest bytea; t timestamptz; new_cap integer; days integer; stages jsonb;
begin
  if p_command is not null then
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
  end if;
  if not coalesce(private.platform_founder(p_actor) and private.institution_actor(p_actor)
    and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false) then
    raise exception 'Founder workspace required' using errcode='42501';
  end if;
  if p_release is not null and p_release !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid release identity' using errcode='23514';
  end if;
  if p_command is null then return private.c16_dashboard(p_release,p_before,p_query); end if;
  if p_command->'confirmed' is distinct from 'true'::jsonb or receipt_id is null or verb is null
    or verb not in ('configure','enroll','remove','activate','pause','resume')
    or coalesce(length(written_reason),0) not between 10 and 500 or written_reason ~ '[[:cntrl:]]'
  then raise exception 'invalid pilot decision' using errcode='23514'; end if;
  select id into room from feed_data.communities where slug='ouest' and kind='department';
  if room is null then raise exception 'Ouest unavailable' using errcode='C1602'; end if;

  perform pg_advisory_xact_lock(20261124,1555);
  select * into p from private.c16_policy for update;
  command_digest:=extensions.digest(p_command::text,'sha256');
  select * into previous from private.c16_history h where h.request_id=receipt_id;
  if found then
    if previous.actor_id is distinct from p_actor or previous.digest is distinct from command_digest then
      raise exception 'request conflict' using errcode='O2002';
    end if;
    return private.c16_dashboard(p_release,null,null);
  end if;
  if coalesce(p.revision,0) is distinct from (p_command->>'expectedRevision')::int then
    raise exception 'pilot policy changed' using errcode='O2004';
  end if;
  if p.community_id is not null and p.community_id<>room then raise exception 'scope changed' using errcode='C1602'; end if;

  t:=clock_timestamp();
  former:=to_jsonb(p);
  if verb='configure' then
    new_cap:=(p_command->>'capacity')::int;
    days:=(p_command->>'durationDays')::int;
    stages:=p_command->'stages';
    if new_cap is null or new_cap not between 1 and 10 or days is null or days not between 1 and 30
      or jsonb_typeof(stages) is distinct from 'object'
      or not (stages ?& array['intake','review','publication','association'])
      or stages-array['intake','review','publication','association']<>'{}'::jsonb
      or exists(select from jsonb_each(stages) item where jsonb_typeof(item.value)<>'boolean')
    then raise exception 'invalid capacity, duration or stages' using errcode='23514'; end if;
    if p.starts_at is not null and (p.duration_days<>days or p.release is distinct from p_release) then
      raise exception 'pilot window and release already pinned' using errcode='C1602';
    end if;
    if p.mode='active' and (new_cap>=p.capacity or stages is distinct from
      jsonb_build_object('intake',p.intake,'review',p.review,'publication',p.publication,'association',p.association)) then
      raise exception 'pause before changing stages' using errcode='C1602';
    end if;
    insert into private.c16_policy(community_id,revision,mode,capacity,duration_days,intake,review,publication,association,release)
      values(room,1,'prepared',new_cap,days,(stages->>'intake')::boolean,(stages->>'review')::boolean,
        (stages->>'publication')::boolean,(stages->>'association')::boolean,p_release)
      on conflict(singleton) do update set revision=private.c16_policy.revision+1,capacity=excluded.capacity,
        duration_days=excluded.duration_days,intake=excluded.intake,review=excluded.review,
        publication=excluded.publication,association=excluded.association,release=excluded.release returning * into p;
    changed:=to_jsonb(p);
  else
    if p.revision is null then raise exception 'save pilot configuration first' using errcode='C1602'; end if;
    if verb in ('enroll','remove') then
      select * into grant_row from private.c16_enrollment e where e.user_id=target;
      former:=to_jsonb(grant_row);
      if verb='enroll' then
        days:=(p_command->>'days')::int;
        if target is null or days is null or days not between 1 and p.duration_days
          or p.ends_at<=t or not private.c16_eligible(target,room) then
          raise exception 'ineligible pilot member or term' using errcode='42501';
        end if;
        perform 1 from feed_data.community_memberships m where m.community_id=room and m.user_id=target for key share;
        if not found or not private.c16_eligible(target,room) then raise exception 'ineligible pilot member' using errcode='42501'; end if;
        if (select count(*) from private.c16_enrollment e where e.user_id<>target and e.revoked_at is null and e.until_at>t)>=20 then
          raise exception 'pilot cohort full' using errcode='C1603';
        end if;
        insert into private.c16_enrollment(user_id,until_at,revoked_at)
          values(target,least(t+make_interval(days=>days),p.ends_at),null)
          on conflict(user_id) do update set until_at=excluded.until_at,revoked_at=null returning * into grant_row;
      else
        update private.c16_enrollment set revoked_at=t where user_id=target and revoked_at is null returning * into grant_row;
        if not found then raise exception 'enrollment unavailable' using errcode='O2003'; end if;
      end if;
      changed:=to_jsonb(grant_row);
    elsif verb='pause' then
      if p.mode<>'active' then raise exception 'pilot is not active' using errcode='C1602'; end if;
      p.mode:='paused';
    else
      if not coalesce((verb='activate' and p.mode='prepared' or verb='resume' and p.mode='paused' and p.ends_at>t)
        and p.release=p_release and (p.intake or p.review or p.publication or p.association)
        and private.c16_ready(room,p_release),false)
        or exists(select from private.c11_intake_fixture) or exists(select from private.c12_fixture)
        or exists(select from private.c13_fixture) or exists(select from private.c14_fixture)
      then raise exception 'pilot readiness is incomplete' using errcode='C1602'; end if;
      if verb='activate' then p.starts_at:=t; p.ends_at:=t+make_interval(days=>p.duration_days); end if;
      p.evidence_digest:=private.c16_evidence_digest(room,p_release);
      p.mode:='active';
    end if;
    update private.c16_policy set revision=revision+1,mode=p.mode,starts_at=p.starts_at,ends_at=p.ends_at,evidence_digest=p.evidence_digest
      where singleton and community_id=room returning * into p;
    changed:=coalesce(changed,to_jsonb(p));
  end if;
  insert into private.c16_history(revision,actor_id,workspace_id,request_id,digest,action,subject_id,reason,before_value,after_value,occurred_at)
    values(p.revision,p_actor,p_workspace,receipt_id,command_digest,verb,target,written_reason,former,changed,t);
  return private.c16_dashboard(p_release,null,null);
end
$$;

revoke all on function private.c16_ouest(uuid),private.c16_eligible(uuid,uuid),private.c16_participant(uuid,uuid),
  private.c16_roster(uuid,uuid,text),private.c16_requirements(uuid,text),private.c16_evidence_digest(uuid,text),private.c16_ready(uuid,text),
  private.c16_live(uuid,text),private.c16_retained(),private.c16_case(uuid),private.c16_require_live(uuid,text),
  private.c16_weekly_count(),private.c16_intake(uuid,uuid,text,uuid),private.c16_dashboard(text,integer,text),
  public.c16_runtime_for_api(text),public.c16_pilot_for_api(uuid,uuid,boolean,bigint,uuid,text,jsonb,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.c16_runtime_for_api(text),
  public.c16_pilot_for_api(uuid,uuid,boolean,bigint,uuid,text,jsonb,integer,text) to service_role;


-- Native fixture lanes stay exactly as before. Production rows are explicitly bound to the pilot.

create function private.c16_fixture(p_level integer) returns boolean
language sql stable set search_path='' as $$
  select not private.c16_retained() and exists(select from private.c11_intake_fixture where enabled)
    and (p_level<12 or exists(select from private.c12_fixture where enabled))
    and (p_level<13 or exists(select from private.c13_fixture where enabled))
    and (p_level<14 or exists(select from private.c14_fixture where enabled))
$$;
revoke all on function private.c16_fixture(integer) from public,anon,authenticated,service_role;

create or replace function public.c11_needs_for_api(p_actor uuid, p_session uuid, p_aal2 boolean,
    p_action text, p_id uuid, p_community uuid, p_request uuid, p_expected integer,
    p_content jsonb, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n private.c11_needs;
  prior private.c11_need_revisions;
  fingerprint bytea;
  moment timestamptz;
  cursor_at timestamptz;
  fixture boolean:=private.c16_fixture(11);
  room uuid;
  intake_status text;
begin
  if not fixture and not private.c16_retained() then
    raise exception 'intake disabled' using errcode='C1101';
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    or not coalesce(private.member_onboarding_access(p_actor),false) then
    raise exception 'member access denied' using errcode='42501';
  end if;
  if not fixture then
    select community_id into room from private.c16_policy;
    if p_action='list' and not private.c16_participant(p_actor,room)
      and not exists(select from private.c11_needs k where k.author_id=p_actor and private.c16_case(k.id)) then
      raise exception 'intake disabled' using errcode='C1101';
    end if;
    intake_status:=case when not private.c16_participant(p_actor,room) or not private.c16_live(room,'intake') then 'closed'
      when private.c16_weekly_count()>=(select capacity from private.c16_policy) then 'capacity' else 'open' end;
  end if;
  if p_action in ('list','read') then
    if p_id is not null then
      select * into n from private.c11_needs where id=p_id and author_id=p_actor and (fixture or private.c16_case(id));
      if not found then raise exception 'need unavailable' using errcode='O2003'; end if;
      cursor_at:=n.created_at;
    end if;
    if p_action='read' then
      if p_id is null then raise exception 'need unavailable' using errcode='O2003'; end if;
      return private.c11_need_json(n,true)||case when fixture then '{}'::jsonb else jsonb_build_object('intakeStatus',intake_status) end;
    end if;
    return jsonb_build_object('communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,
          'name',coalesce(d.name,c.name,c.slug)) order by c.slug)
        from feed_data.community_memberships m join feed_data.communities c on c.id=m.community_id
        left join public.departments d on d.code=c.department_code where m.user_id=p_actor and (fixture or (c.id=room and intake_status='open'))),'[]'::jsonb),
      'needs',coalesce((select jsonb_agg(private.c11_need_json(page,false) order by page.created_at desc,page.id desc)
        from (select * from private.c11_needs where author_id=p_actor and (fixture or private.c16_case(id))
          and (p_id is null or (created_at,id)<(cursor_at,p_id)) order by created_at desc,id desc limit 21) page),'[]'::jsonb))
      ||case when fixture then '{}'::jsonb else jsonb_build_object('intakeStatus',intake_status) end;
  end if;

  if p_action is null or p_action not in ('create','edit','submit','withdraw') or p_request is null
    or (p_action='create' and (p_community is null or p_id is not null or p_expected is not null))
    or (p_action<>'create' and (p_id is null or p_community is not null or p_expected is null or p_expected<1))
    or (p_action in ('submit','withdraw') and p_confirmed is distinct from true)
    or (p_action in ('submit','withdraw') and p_content is not null)
  then raise exception 'invalid need command' using errcode='23514'; end if;

  -- Match account enforcement lock ordering, and serialize receipts and actor quotas.
  perform pg_advisory_xact_lock_shared(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false) then
    raise exception 'session unavailable' using errcode='42501';
  end if;
  fingerprint:=extensions.digest(jsonb_build_array(p_action,p_id,p_community,p_expected,p_content,p_confirmed)::text,'sha256');
  select * into prior from private.c11_need_revisions where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.fingerprint<>fingerprint then raise exception 'request conflict' using errcode='O2002'; end if;
    select * into n from private.c11_needs where id=prior.need_id and author_id=p_actor and (fixture or private.c16_case(id));
    if not found then raise exception 'need unavailable' using errcode='O2003'; end if;
    return private.c11_need_json(n,true);
  end if;

  if p_action<>'create' then
    select * into n from private.c11_needs where id=p_id and author_id=p_actor and (fixture or private.c16_case(id)) for update;
    if not found then raise exception 'need unavailable' using errcode='O2003'; end if;
    if n.revision<>p_expected or n.status<>(case when p_action='withdraw' then 'submitted' else 'draft' end)::private.c11_need_status then
      raise exception 'need changed' using errcode='O2004';
    end if;
  end if;
  if p_action<>'withdraw' then
    perform 1 from feed_data.community_memberships m
      where m.user_id=p_actor and m.community_id=coalesce(p_community,n.community_id) for key share;
    if not found then raise exception 'current membership required' using errcode='C1102'; end if;
  end if;

  if not fixture and p_action<>'withdraw' then
    perform private.c16_intake(p_actor,coalesce(p_community,n.community_id),p_action,n.id);
  end if;
  moment:=clock_timestamp();
  if (select count(*) from private.c11_need_revisions where actor_id=p_actor and occurred_at>moment-interval '24 hours')>=40
    or (p_action='create' and (select count(*) from private.c11_needs where author_id=p_actor and status='draft')>=10)
    or (p_action='submit' and (select count(*) from private.c11_need_revisions where actor_id=p_actor
        and action='submit' and occurred_at>moment-interval '24 hours')>=5)
  then raise exception 'need quota exceeded' using errcode='54000'; end if;

  if p_action='create' then
    perform private.c11_validate_content(p_content,false);
    insert into private.c11_needs(community_id,author_id,content,created_at,updated_at)
      values(p_community,p_actor,p_content,moment,moment) returning * into n;
    if not fixture then insert into private.c16_cases(need_id) values(n.id); end if;
  else
    if p_action='edit' then perform private.c11_validate_content(p_content,false); end if;
    if p_action='submit' then perform private.c11_validate_content(n.content,true); end if;
    update private.c11_needs set revision=n.revision+1, updated_at=moment,
      content=coalesce(p_content,n.content),
      status=(case p_action when 'submit' then 'submitted' when 'withdraw' then 'withdrawn' else 'draft' end)::private.c11_need_status
      where id=n.id returning * into n;
  end if;
  insert into private.c11_need_revisions(need_id,community_id,revision,actor_id,request_id,fingerprint,action,status,content,occurred_at)
    values(n.id,n.community_id,n.revision,p_actor,p_request,fingerprint,p_action,n.status,n.content,moment);
  return private.c11_need_json(n,true);
end
$$;

create or replace function private.c12_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c16_fixture(12) or private.c16_retained()
$$;

create or replace function private.c13_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c16_fixture(13) or private.c16_retained()
$$;

create or replace function private.c14_enabled() returns boolean language sql stable set search_path='' as $$
  select private.c16_fixture(14) or private.c16_retained()
$$;

create or replace function public.c12_needs_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_lane text,p_id uuid,p_command jsonb,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  n private.c11_needs; other_need private.c11_needs; r private.c12_cases; other_review private.c12_cases;
  appeal private.c12_challenges; prior private.c12_events; finding private.c12_events;
  a text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; scope_id uuid:=(p_command->>'communityId')::uuid;
  scope_lane text:=p_command->>'role'; feedback text:=p_command->>'summary';
  note text:=btrim(p_command->>'note'); evidence jsonb:=p_command->'content';
  hash bytea; event_id uuid:=gen_random_uuid(); moment timestamptz;
  next_state text; evidence_revision integer;
  conflict_denied boolean:=false;
  fixture boolean:=private.c16_fixture(12);
begin
  if not private.c12_enabled() and not coalesce(p_lane in ('access','admin') and p_id is null
    and exists(select from private.c16_policy p where private.c16_ouest(p.community_id)),false) then
    raise exception 'review disabled' using errcode='C1201';
  end if;
  if p_lane in ('member','access') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false)
    then raise exception 'authorization required' using errcode='42501'; end if;
  elsif not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false)
    then raise exception 'workspace required' using errcode='42501';
  end if;

  if p_lane='access' then
    return jsonb_build_object('oversight',private.platform_admin(p_actor),'allowed',exists(select from private.c12_authority a where a.actor_id=p_actor
      and a.lane='triage' and private.c12_granted(p_actor,a.community_id,'triage')
      and (fixture or private.c16_ouest(a.community_id))));
  end if;

  if p_command is not null then
    if p_command->'confirmed' is distinct from 'true'::jsonb or req is null or a is null
      or (note is not null and (length(note) not between 5 and 1500 or note ~ '[[:cntrl:]]'))
    then raise exception 'invalid review command' using errcode='23514'; end if;
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
    perform pg_advisory_xact_lock(20261124,1551);
    if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
      or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
    then raise exception 'session unavailable' using errcode='42501'; end if;
    hash:=extensions.digest(jsonb_build_array(p_id,p_lane,p_command)::text,'sha256');
    moment:=clock_timestamp();

    if a in ('grant','revoke') then
      if p_lane<>'admin' or not private.platform_founder(p_actor) or target is null or target=p_actor or scope_id is null
        or scope_lane is null or scope_lane not in ('triage','review') or note is null or p_id is not null
      then raise exception 'authority unavailable' using errcode='42501'; end if;
      select * into prior from private.c12_events where actor_id=p_actor and request_id=req;
      if found then
        if prior.command_hash<>hash then raise exception 'request conflict' using errcode='O2002'; end if;
        return jsonb_build_object('eventId',prior.id);
      end if;
      if not fixture then
        perform 1 from private.c16_policy p where p.community_id=scope_id and private.c16_ouest(scope_id)
          and (a='revoke' or p.mode='prepared' or (p.mode='active' and p.ends_at>clock_timestamp())) for share;
        if not found then raise exception 'pilot authority closed' using errcode='C1602'; end if;
        if scope_lane='review' and coalesce(private.platform_admin(target),false) then
          raise exception 'independent reviewer required' using errcode='42501';
        end if;
      end if;
      if a='grant' then
        if not private.institution_actor(target) or not private.verified_totp(target)
          or (scope_lane='review' and not private.institution_reviewer(target))
          or (scope_lane='triage' and (not feed_data.community_member(scope_id,target)
            or not exists(select from feed_data.community_staff s where s.community_id=scope_id and s.user_id=target)))
        then raise exception 'candidate unavailable' using errcode='42501'; end if;
        insert into private.c12_authority(community_id,actor_id,lane,granted_by,until_at)
          values(scope_id,target,scope_lane,p_actor,moment+interval '30 days')
          on conflict(community_id,actor_id,lane) do update set granted_by=p_actor,until_at=excluded.until_at,revoked_at=null;
      else
        update private.c12_authority set revoked_at=moment where community_id=scope_id and actor_id=target and c12_authority.lane=(p_command->>'role') and revoked_at is null;
        if not found then raise exception 'grant unavailable' using errcode='O2003'; end if;
      end if;
      insert into private.c12_events(id,community_id,actor_id,request_id,command_hash,workspace_id,action,subject_id,note)
        values(event_id,scope_id,p_actor,req,hash,p_workspace,a||'_'||scope_lane,target,note);
      return jsonb_build_object('eventId',event_id);
    end if;
  end if;

  if p_id is null then
    if p_command is not null or p_lane='member' then raise exception 'case required' using errcode='23514'; end if;
    return jsonb_build_object('cases',coalesce((
      select jsonb_agg(jsonb_build_object('id',x.id,'communityId',x.community_id,'state',x.state,'revision',x.revision) order by x.id)
      from (select item.id,item.community_id,coalesce(review.state,item.status::text) state,coalesce(review.revision,0) revision
        from private.c11_needs item left join private.c12_cases review on review.need_id=item.id
        where item.status='submitted' and (fixture or private.c16_case(item.id)) and (p_after is null or item.id>p_after)
          and private.c12_staff_case(p_actor,p_lane,item,review) order by item.id limit 21) x),'[]'::jsonb),
      'canGrant',p_lane='admin' and private.platform_founder(p_actor),
      'communities',case when p_lane='admin' then (select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug) order by c.slug)
        from feed_data.communities c where fixture or private.c16_ouest(c.id)) else '[]'::jsonb end);
  end if;

  if p_command is null then
    select * into n from private.c11_needs where id=p_id;
  else
    -- Match C1.1 ordering for withdrawn cases, and order both ends of duplicate links.
    if a='duplicate' and target is not null then
      perform 1 from private.c11_needs where id in (p_id,target) order by id for update;
    end if;
    select * into n from private.c11_needs where id=p_id for update;
  end if;
  if not found or (not fixture and not private.c16_case(n.id)) then raise exception 'case unavailable' using errcode='O2003'; end if;
  if not fixture and p_lane='review' and not private.c16_roster(p_actor,n.community_id,'review') then
    raise exception 'independent reviewer required' using errcode='42501';
  end if;
  select * into r from private.c12_cases where need_id=p_id;
  if p_lane='member' then
    if n.author_id is distinct from p_actor then raise exception 'case unavailable' using errcode='O2003'; end if;
  elsif not coalesce(private.c12_staff_case(p_actor,p_lane,n,r),false) then
    raise exception 'case unavailable' using errcode='O2003';
  end if;

  if p_command is null then
    if p_lane in ('triage','review') then
      insert into private.c12_events(need_id,community_id,actor_id,workspace_id,action,case_revision,evidence_revision)
        values(n.id,n.community_id,p_actor,p_workspace,'access',r.revision,n.revision);
    end if;
    return private.c12_projection(n,r,p_lane);
  end if;
  select * into prior from private.c12_events where actor_id=p_actor and request_id=req;
  if found then
    if prior.command_hash<>hash then raise exception 'request conflict' using errcode='O2002'; end if;
    if prior.action='conflict_denied' then return jsonb_build_object('denied',true); end if;
    return private.c12_projection(n,r,p_lane);
  end if;
  if n.status<>'submitted' or coalesce(r.revision,0) is distinct from (p_command->>'expectedRevision')::integer then
    raise exception 'case changed' using errcode='O2004';
  end if;
  if r.need_id is null then
    if p_lane<>'admin' or a not in ('assign_triage','assign_review','flag_conflict') then
      raise exception 'assignment required' using errcode='42501'; end if;
    insert into private.c12_cases(need_id,revision) values(n.id,0) returning * into r;
  end if;
  select * into appeal from private.c12_challenges where need_id=n.id and status='pending';
  if not fixture then
    if a not in ('correct','challenge','flag_conflict','declare_conflict','return')
      and not (appeal.finding_id is not null and a in ('accept','observe','uphold_challenge','return_challenge')) then
      perform private.c16_require_live(n.community_id,'review');
    end if;
    if a in ('assign_review','assign_challenge') and not private.c16_roster(target,n.community_id,'review') then
      raise exception 'independent reviewer required' using errcode='42501';
    end if;
    if a='duplicate' and not private.c16_case(target) then raise exception 'case unavailable' using errcode='O2003'; end if;
  end if;
  next_state:=r.state;
  evidence_revision:=n.revision;

  case a
    when 'assign_triage','assign_review','assign_challenge' then
      if p_lane<>'admin' or p_actor=n.author_id or target is null or target=p_actor or note is null
        or (a='assign_challenge' and appeal.finding_id is null)
        or (a<>'assign_challenge' and (appeal.finding_id is not null or r.state not in ('submitted','under_review')))
        or (a='assign_review' and not r.referred)
        or (a='assign_triage' and (r.referred or r.reviewer is not null))
      then raise exception 'assignment unavailable' using errcode='42501'; end if;
      if not private.c12_granted(target,n.community_id,case when a='assign_triage' then 'triage' else 'review' end)
        or target=n.author_id or exists(select from private.c12_conflicts where need_id=n.id and actor_id=target)
        or (a<>'assign_triage' and private.c12_conflicted(target,n,r,a='assign_challenge'))
      then conflict_denied:=true;
      elsif a='assign_triage' then
        r.triager:=target;
      elsif a='assign_review' then
        r.reviewer:=target;
        r.accepted:=false;
        next_state:='submitted';
      else
        update private.c12_challenges set reviewer=target,accepted=false where finding_id=appeal.finding_id;
      end if;
    when 'flag_conflict','declare_conflict' then
      if note is null or (a='flag_conflict' and (p_lane<>'admin' or p_actor=n.author_id or target is null))
        or (a='declare_conflict' and p_lane not in ('review','triage'))
      then raise exception 'conflict command unavailable' using errcode='42501'; end if;
      target:=case when a='declare_conflict' then p_actor else target end;
      insert into private.c12_conflicts(need_id,actor_id) values(n.id,target) on conflict do nothing;
      if r.reviewer=target and r.state in ('submitted','under_review','needs_information') then
        r.reviewer:=null; r.accepted:=false;
        if r.state='needs_information' then r.resume_state:='submitted'; else next_state:='submitted'; end if;
      end if;
      if r.triager=target then r.triager:=null; end if;
      if appeal.reviewer=target then
        update private.c12_challenges set reviewer=null,accepted=false where finding_id=appeal.finding_id;
      end if;
    when 'triage','refer','escalate','flag_unsafe' then
      if p_lane<>'triage' or r.state<>'submitted' or r.reviewer is not null or note is null then
        raise exception 'triage unavailable' using errcode='42501'; end if;
      if a='refer' then r.referred:=true;
      elsif a='escalate' then r.escalated:=true; r.referred:=true;
      elsif a='flag_unsafe' then r.unsafe:=true;
      end if;
    when 'duplicate' then
      if p_lane not in ('triage','review') or target is null or target=n.id or note is null then
        raise exception 'duplicate link unavailable' using errcode='42501'; end if;
      select * into other_need from private.c11_needs where id=target and community_id=n.community_id and status='submitted';
      select * into other_review from private.c12_cases where need_id=target;
      if other_need.id is null or not coalesce(private.c12_staff_case(p_actor,p_lane,other_need,other_review),false)
        then raise exception 'duplicate link unavailable' using errcode='O2003'; end if;
      if exists(select from private.c12_duplicates where low_id=least(n.id,target) and high_id=greatest(n.id,target))
        then raise exception 'duplicate link exists' using errcode='O2002'; end if;
    when 'accept' then
      if p_lane<>'review' or p_command->'conflictFree' is distinct from 'true'::jsonb then raise exception 'independence required' using errcode='42501'; end if;
      if appeal.finding_id is not null and appeal.reviewer=p_actor and not appeal.accepted
        and not private.c12_conflicted(p_actor,n,r,true) then
        update private.c12_challenges set accepted=true where finding_id=appeal.finding_id;
      elsif appeal.finding_id is null and r.reviewer=p_actor and not r.accepted and r.state='submitted' then
        r.accepted:=true; next_state:='under_review';
      else raise exception 'accept unavailable' using errcode='42501'; end if;
    when 'request_information' then
      if note is null or feedback is null or feedback not in ('clarify_scope','clarify_beneficiaries','clarify_references','remove_personal_information')
        or not coalesce((p_lane='triage' and r.state='submitted' and r.reviewer is null)
          or (p_lane='review' and r.state='under_review' and r.reviewer=p_actor and r.accepted),false)
      then raise exception 'information request unavailable' using errcode='42501'; end if;
      r.resume_state:=r.state; next_state:='needs_information';
    when 'correct' then
      if p_lane<>'member' or r.state<>'needs_information' or appeal.finding_id is not null
        or n.revision is distinct from (p_command->>'expectedEvidenceRevision')::integer then
        raise exception 'correction unavailable' using errcode='O2004'; end if;
      perform private.c11_validate_content(evidence,true);
      update private.c11_needs set content=evidence,revision=revision+1,updated_at=moment where id=n.id returning * into n;
      evidence_revision:=n.revision;
      insert into private.c11_need_revisions(need_id,community_id,revision,actor_id,request_id,fingerprint,action,status,content,occurred_at)
        values(n.id,n.community_id,n.revision,p_actor,req,hash,'edit','submitted',evidence,moment);
      next_state:=coalesce(r.resume_state,'submitted'); r.resume_state:=null;
    when 'observe' then
      if p_lane<>'review' or note is null or not coalesce((appeal.reviewer=p_actor and appeal.accepted)
        or (appeal.finding_id is null and r.reviewer=p_actor and r.accepted and r.state='under_review'),false)
      then raise exception 'observation unavailable' using errcode='42501'; end if;
    when 'supported','insufficient_evidence','not_supported','close','return' then
      if p_lane<>'review' or r.reviewer is distinct from p_actor or not r.accepted or note is null
        or appeal.finding_id is not null or r.state<>'under_review'
      then raise exception 'decision unavailable' using errcode='42501'; end if;
      if a='return' then r.reviewer:=null; r.accepted:=false; r.previous_reviewer:=p_actor; next_state:='submitted';
      elsif a='close' then next_state:='closed'; feedback:='closed';
      else
        if not coalesce(case a
          when 'supported' then feedback='evidence_matches'
          when 'insufficient_evidence' then feedback in ('missing_independent_sources','scope_unconfirmed')
          when 'not_supported' then feedback='conflicting_evidence' end,false)
        then raise exception 'safe explanation required' using errcode='23514'; end if;
        next_state:=a; r.finding_id:=event_id;
      end if;
    when 'challenge' then
      if p_lane<>'member' or note is null
        or (p_command->>'findingId')::uuid is distinct from r.finding_id then
        raise exception 'challenge unavailable' using errcode='42501'; end if;
      select * into finding from private.c12_events where id=r.finding_id and need_id=n.id;
      if not found or appeal.finding_id is not null or finding.state not in ('insufficient_evidence','not_supported')
        or moment>=finding.happened_at+interval '14 days'
        or exists(select from private.c12_challenges where finding_id=finding.id)
      then raise exception 'challenge unavailable' using errcode='O2004'; end if;
      insert into private.c12_challenges(finding_id,need_id,filed_at) values(finding.id,n.id,moment);
    when 'uphold_challenge','return_challenge' then
      if p_lane<>'review' or appeal.reviewer is distinct from p_actor or not coalesce(appeal.accepted,false)
        or note is null or private.c12_conflicted(p_actor,n,r,true)
      then raise exception 'challenge decision unavailable' using errcode='42501'; end if;
      update private.c12_challenges set status=case when a='uphold_challenge' then 'upheld' else 'returned' end where finding_id=appeal.finding_id;
      if a='return_challenge' then
        r.previous_reviewer:=r.reviewer; r.reviewer:=null; r.accepted:=false; r.finding_id:=null;
        next_state:='submitted';
      end if;
      feedback:=a;
    else raise exception 'invalid action' using errcode='23514';
  end case;

  if a not in ('request_information','supported','insufficient_evidence','not_supported','close','uphold_challenge','return_challenge') then feedback:=null; end if;
  if conflict_denied then
    insert into private.c12_events(id,need_id,community_id,actor_id,request_id,command_hash,workspace_id,action,case_revision,evidence_revision,subject_id)
      values(event_id,n.id,n.community_id,p_actor,req,hash,p_workspace,'conflict_denied',r.revision,n.revision,target);
    return jsonb_build_object('denied',true);
  end if;
  update private.c12_cases set revision=r.revision+1,state=next_state,reviewer=r.reviewer,triager=r.triager,
    previous_reviewer=r.previous_reviewer,accepted=r.accepted,resume_state=r.resume_state,referred=r.referred,
    escalated=r.escalated,unsafe=r.unsafe,finding_id=r.finding_id,updated_at=moment where need_id=n.id returning * into r;
  insert into private.c12_events(id,need_id,community_id,actor_id,request_id,command_hash,workspace_id,
    action,state,case_revision,evidence_revision,subject_id,note,safe_code,happened_at)
    values(event_id,n.id,n.community_id,p_actor,req,hash,p_workspace,a,r.state,r.revision,evidence_revision,
      case when a<>'duplicate' then target end,note,feedback,moment);
  if a='duplicate' then
    insert into private.c12_duplicates(low_id,high_id,event_id) values(least(n.id,target),greatest(n.id,target),event_id);
  end if;
  return private.c12_projection(n,r,p_lane);
end
$$;

create or replace function public.c13_publication_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_lane text,p_id uuid,p_room uuid,p_category text,p_after uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  n private.c11_needs; r private.c12_cases; p private.c13_publications;
  s private.c13_events; contested private.c13_events; prior private.c13_events;
  a text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; rationale text:=trim(p_command->>'note');
  next_id uuid:=gen_random_uuid(); contents jsonb:=p_command->'content'; digest bytea; moment timestamptz;
  safe_reason text:=p_command->>'reason'; requires_finding boolean;
  fixture boolean:=private.c16_fixture(13);
begin
  if not private.c13_enabled() then raise exception 'publication disabled' using errcode='C1301'; end if;
  if p_lane in ('directory','member') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false)
    then raise exception 'member required' using errcode='42501'; end if;
  elsif p_lane not in ('admin','review','triage') or not coalesce(
    private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false) then
    raise exception 'workspace required' using errcode='42501';
  end if;
  if p_lane='directory' then
    if p_command is not null or p_room is null or not feed_data.community_member(p_room,p_actor)
      or (not fixture and (not private.c16_live(p_room,'publication') or not private.c16_participant(p_actor,p_room))) then
      raise exception 'publication unavailable' using errcode='C1302';
    end if;
    return jsonb_build_object('items',coalesce((
      select jsonb_agg(x.item order by x.id desc) from (
        select pub.id,private.c13_public_view(pub,need,approved,p_actor) item
        from private.c13_publications pub join private.c11_needs need on need.id=pub.need_id
        join private.c12_cases evidence on evidence.need_id=need.id
        join private.c13_events approved on approved.id=pub.live_proposal
        where need.community_id=p_room and (fixture or (private.c16_case(need.id) and private.c16_participant(need.author_id,p_room)))
          and (p_id is null or pub.id=p_id)
          and (p_category is null or approved.content->>'category'=p_category)
          and (p_after is null or pub.id<p_after)
          and private.c13_current(need,evidence,approved.finding,approved.evidence_revision)
        order by pub.id desc limit 21
      ) x
    ),'[]'::jsonb));
  end if;
  if p_id is null then
    if p_lane='member' or p_command is not null then raise exception 'case required' using errcode='42501'; end if;
    return jsonb_build_object('items',coalesce((
      select jsonb_agg(x.item order by x.id desc) from (
        select pub.id,jsonb_build_object('id',pub.id,'revision',pub.revision,'state',pub.state,'published',pub.live_proposal is not null,
          'snapshot',case when p_lane='review' then jsonb_build_object('content',candidate.content,
            'attribution',candidate.attribution and candidate.consent_epoch=pub.consent_epoch,
            'evidenceRevision',candidate.evidence_revision) end) item
        from private.c13_publications pub join private.c11_needs need on need.id=pub.need_id
        join private.c12_cases evidence on evidence.need_id=need.id join private.c13_events candidate on candidate.id=pub.proposal
        left join private.c13_events decision on decision.id=pub.decision and pub.state='challenged'
        where (fixture or (private.c16_case(need.id) and (p_lane<>'review' or private.c16_roster(p_actor,need.community_id,'review'))))
          and (p_after is null or pub.id<p_after) and (
          (p_lane='admin' and (pub.state in ('pending','challenged') or pub.live_proposal is not null))
          or (p_lane='review' and pub.state in ('pending','challenged') and pub.reviewer=p_actor
            and private.c13_current(need,evidence,candidate.finding,candidate.evidence_revision)
            and private.c13_independent(p_actor,need,evidence,candidate,decision))
          or (p_lane='triage' and pub.live_proposal is not null and private.c12_granted(p_actor,need.community_id,'triage')))
        order by pub.id desc limit 21
      ) x
    ),'[]'::jsonb));
  end if;
  if p_command is not null then
    if p_command->'confirmed' is distinct from 'true'::jsonb or req is null or a is null
      or (rationale is not null and (char_length(rationale) not between 5 and 1500 or rationale ~ '[[:cntrl:]]'))
    then raise exception 'invalid publication command' using errcode='23514'; end if;
    perform pg_advisory_xact_lock_shared(20261120,300);
    perform private.s2b_lock_actor(p_actor,p_session);
    -- Share C1.2's mutation ordering, then lock the publication.
    perform pg_advisory_xact_lock(20261124,1551);
    if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
      or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
    then raise exception 'session required' using errcode='42501'; end if;
  end if;
  if p_lane='member' then
    select * into n from private.c11_needs where id=p_id and author_id=p_actor and status<>'draft';
    select * into p from private.c13_publications where need_id=n.id;
  else
    select * into p from private.c13_publications where id=p_id;
    select * into n from private.c11_needs where id=p.need_id;
  end if;
  select * into r from private.c12_cases where need_id=n.id;
  if n.id is null or (not fixture and (not private.c16_case(n.id)
      or (p_lane='review' and not private.c16_roster(p_actor,n.community_id,'review'))))
    or (p_lane='triage' and not coalesce(private.c12_granted(p_actor,n.community_id,'triage'),false))
  then raise exception 'publication unavailable' using errcode='C1302'; end if;
  select * into s from private.c13_events where id=p.proposal;
  if p.state='challenged' then select * into contested from private.c13_events where id=p.decision; end if;
  if p_command is null then
    if p_lane='review' and (p.reviewer is distinct from p_actor or not coalesce(private.c13_independent(p_actor,n,r,s,contested),false)) then
      raise exception 'publication unavailable' using errcode='C1302';
    end if;
    return private.c13_status(p,n,r,p_lane);
  end if;
  digest:=extensions.digest(jsonb_build_array(p_lane,p_id,p_command)::text,'sha256');
  select * into prior from private.c13_events where actor=p_actor and request_id=req;
  if prior.id is not null then
    if prior.command_hash is distinct from digest then raise exception 'command changed' using errcode='C1303'; end if;
    return case when p_lane='review' and p.reviewer is distinct from p_actor
      then jsonb_build_object('id',p.id,'revision',prior.revision,'state',prior.state)
      else private.c13_status(p,n,r,p_lane) end;
  end if;
  if p_lane='review' and p.reviewer is distinct from p_actor then raise exception 'publication unavailable' using errcode='C1302'; end if;
  if coalesce(p.revision,0) is distinct from (p_command->>'expectedRevision')::integer
    then raise exception 'publication revision changed' using errcode='C1303'; end if;
  if not fixture then
    if a not in ('revoke_attribution','withdraw','hide','remove','challenge','uphold','return') then
      perform private.c16_require_live(n.community_id,'publication');
      if not private.c16_participant(n.author_id,n.community_id) then
        raise exception 'pilot enrollment required' using errcode='42501';
      end if;
    end if;
    if a in ('assign','assign_challenge') and not private.c16_roster(target,n.community_id,'review') then
      raise exception 'independent reviewer required' using errcode='42501';
    end if;
  end if;
  moment:=clock_timestamp();
  requires_finding:=a in ('assign','assign_challenge','approve','reject','request_correction','challenge','uphold','return');
  if requires_finding and not coalesce(private.c13_current(n,r,s.finding,s.evidence_revision),false) then
    raise exception 'evidence changed' using errcode='C1303';
  end if;
  if a='request' and p_lane='member' then
    if p.state in ('pending','challenged') or p_command->>'audience' is distinct from 'community'
      or p_command->'attribution' is null or jsonb_typeof(p_command->'attribution')<>'boolean'
      or not coalesce(private.c13_current(n,r,(p_command->>'finding')::uuid,(p_command->>'expectedEvidenceRevision')::integer),false)
    then raise exception 'publication request unavailable' using errcode='C1303'; end if;
    perform private.m23_require(p_actor,'community_need_submit','community',n.community_id);
    perform 1 from feed_data.community_memberships m where m.community_id=n.community_id and m.user_id=p_actor for key share;
    if not found then raise exception 'current membership required' using errcode='42501'; end if;
    if jsonb_typeof(contents) is distinct from 'object' or contents ? 'references'
      or char_length(contents->>'description')>1200 or contents::text ~* '(https?://|www\.|@|([0-9][ .()+-]*){7,}|[0-9]+[.][0-9]{2,}[ ,;-]+-?[0-9]+[.][0-9]{2,})'
    then raise exception 'invalid publication summary' using errcode='23514'; end if;
    perform private.c11_validate_content(contents||'{"references":[]}'::jsonb,true);
    if p.id is null then insert into private.c13_publications(need_id) values(n.id) returning * into p; end if;
    p.state:='pending'; p.reviewer:=null; p.decision:=null;
  elsif a in ('assign','assign_challenge') and p_lane='admin' and rationale is not null
    and ((a='assign' and p.state='pending') or (a='assign_challenge' and p.state='challenged')) then
    if target is null or target=p_actor or not coalesce(private.c13_independent(target,n,r,s,contested),false) then
      raise exception 'independent reviewer required' using errcode='42501';
    end if;
    p.reviewer:=target;
  elsif a in ('approve','reject','request_correction') and p_lane='review' and p.state='pending' and rationale is not null
    and coalesce(private.c13_independent(p_actor,n,r,s,contested),false) then
    if a='approve' then
      if not private.institution_actor(n.author_id) then raise exception 'author unavailable' using errcode='42501'; end if;
      perform private.m23_require(n.author_id,'community_need_submit','community',n.community_id);
      perform 1 from feed_data.community_memberships m where m.community_id=n.community_id and m.user_id=n.author_id for key share;
      if not found then raise exception 'current membership required' using errcode='42501'; end if;
      p.state:='published'; p.live_proposal:=p.proposal; p.published_at:=moment;
    else
      if not coalesce(safe_reason in ('privacy','clarity','evidence'),false) then
        raise exception 'safe reason required' using errcode='23514';
      end if;
      p.state:=case when a='reject' then 'rejected' else 'changes_requested' end;
    end if;
    p.decision:=next_id;
  elsif a='challenge' and p_lane='member' and p.state='rejected' and rationale is not null then
    select * into contested from private.c13_events where id=p.decision and action='reject';
    if contested.id is null or moment>=contested.happened_at+interval '14 days'
      or exists(select from private.c13_challenges where decision=contested.id)
    then raise exception 'challenge unavailable' using errcode='C1303'; end if;
    insert into private.c13_challenges(decision,publication_id) values(contested.id,p.id);
    p.state:='challenged'; p.reviewer:=null;
  elsif a in ('uphold','return') and p_lane='review' and p.state='challenged' and rationale is not null
    and coalesce(private.c13_independent(p_actor,n,r,s,contested),false) then
    update private.c13_challenges set outcome=case when a='uphold' then 'upheld' else 'returned' end
      where decision=contested.id and outcome is null;
    if not found then raise exception 'challenge unavailable' using errcode='C1303'; end if;
    p.state:=case when a='uphold' then 'rejected' else 'pending' end;
    p.reviewer:=null;
  elsif a='revoke_attribution' and p_lane='member' and p.proposal is not null then
    p.consent_epoch:=p.consent_epoch+1;
  elsif a='withdraw' and p_lane='member' and p.proposal is not null and p.state<>'withdrawn' then
    p.state:='withdrawn'; p.live_proposal:=null; p.reviewer:=null;
    update private.c13_challenges set outcome='stale' where publication_id=p.id and outcome is null;
  elsif a in ('hide','remove') and rationale is not null and p.live_proposal is not null
    and (p_lane='admin' or (a='hide' and p_lane='triage')) then
    p.state:=case when a='hide' then 'hidden' else 'removed' end;
    p.live_proposal:=null; p.reviewer:=null;
    update private.c13_challenges set outcome='stale' where publication_id=p.id and outcome is null;
  else
    raise exception 'publication command unavailable' using errcode='42501';
  end if;

  insert into private.c13_events(id,publication_id,actor,workspace,request_id,command_hash,revision,
    action,state,proposal,finding,evidence_revision,content,audience,attribution,consent_epoch,subject,note,reason_code,happened_at)
  values(next_id,p.id,p_actor,p_workspace,req,digest,p.revision+1,a,p.state,p.proposal,
    case when a='request' then r.finding_id else s.finding end,
    case when a='request' then n.revision else s.evidence_revision end,
    case when a='request' then contents end,case when a='request' then 'community' end,
    case when a='request' then (p_command->>'attribution')::boolean end,
    p.consent_epoch,target,rationale,case when a in ('reject','request_correction') then safe_reason end,moment);
  if a='request' then p.proposal:=next_id; end if;
  update private.c13_publications set revision=p.revision+1,state=p.state,proposal=p.proposal,live_proposal=p.live_proposal,
    reviewer=p.reviewer,decision=p.decision,consent_epoch=p.consent_epoch,published_at=p.published_at where id=p.id returning * into p;
  return private.c13_status(p,n,r,p_lane);
end
$$;

create or replace function private.c14_need_read(pub private.c13_publications,n private.c11_needs,who uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(who is not null and pub.live_proposal is not null and feed_data.community_member(n.community_id,who)
    and (private.c16_fixture(14) or (private.c16_case(n.id) and private.c16_live(n.community_id,'publication')
      and private.c16_live(n.community_id,'association') and private.c16_participant(who,n.community_id)
      and private.c16_participant(n.author_id,n.community_id)))
    and exists(select from private.c13_events s join private.c12_cases r on r.need_id=n.id
      where s.id=pub.live_proposal and private.c13_current(n,r,s.finding,s.evidence_revision)),false)
$$;

create or replace function private.c14_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid; affected private.c14_links; current_project private.community_projects; revoke_link boolean; activate_link boolean;
begin
  if tg_table_name='community_projects' then
    target_id:=old.id;
    if tg_op='DELETE' then revoke_link:=true;
    else
      current_project:=new;
      revoke_link:=new.restricted_at is not null or new.status='rejected' or coalesce(new.pending_status='rejected',false)
        or coalesce(new.pending_revision,new.revision)<>coalesce(old.pending_revision,old.revision)
        or (old.directory_published_at is not null and new.directory_published_at is null);
      activate_link:=not revoke_link and old.directory_published_at is null and new.directory_published_at is not null;
    end if;
    if not (coalesce(revoke_link,false) or coalesce(activate_link,false)) then return null; end if;
  else
    target_id:=new.id;
    revoke_link:=new.live_proposal is distinct from old.live_proposal and old.live_proposal is not null;
    if not revoke_link then return null; end if;
  end if;
  if coalesce(activate_link,false) and not private.c16_fixture(14) then
    perform 1 from private.c16_policy p for share;
  end if;
  for affected in
    update private.c14_links l
    set state=case when revoke_link then 'revoked' else l.state end,
        reviewer=case when revoke_link then null else l.reviewer end,
        activated_at=case when activate_link then clock_timestamp() else l.activated_at end,revision=l.revision+1
    where (case when tg_table_name='community_projects' then l.project_id=target_id else l.publication_id=target_id end)
      and ((revoke_link and l.state in ('awaiting_consent','awaiting_review','approved'))
        or (activate_link and l.state='approved' and l.activated_at is null
          and exists(select from private.c13_publications b join private.c11_needs n on n.id=b.need_id
            where b.id=l.publication_id and private.c14_current(l,current_project,b,n))))
    returning l.*
  loop
    insert into private.c14_events(link_id,action,revision,state) values(affected.id,
      case when revoke_link then 'invalidate' else 'activate' end,affected.revision,affected.state);
  end loop;
  return null;
end
$$;

create or replace function public.c14_links_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_workspace uuid,
  p_lane text,p_id uuid,p_after uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  l private.c14_links; p private.community_projects; pub private.c13_publications;
  n private.c11_needs; r private.c12_cases; prior private.c14_events;
  action text:=p_command->>'action'; req uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'target')::uuid; reason text:=btrim(p_command->>'reason'); digest bytea;
  act_at timestamptz; project_id uuid;
  fixture boolean:=private.c16_fixture(14);
begin
  if not private.c14_enabled() then raise exception 'association disabled' using errcode='C1401'; end if;
  if p_lane in ('member','project','publication','options') then
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      or not coalesce(private.member_onboarding_access(p_actor),false) then
      raise exception 'live member required' using errcode='42501';
    end if;
  elsif p_lane not in ('admin','review') or not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false) then
    raise exception 'original workspace required' using errcode='42501';
  end if;

  if p_lane='options' and p_command is null then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,jsonb_build_object('id',q.id,'title',e.content->>'title','slug',c.slug,'community',c.department_code)
        as item
      from private.c13_publications q join private.c11_needs d on d.id=q.need_id
      join private.c13_events e on e.id=q.live_proposal join feed_data.communities c on c.id=d.community_id
      where (p_after is null or q.id<p_after) and private.c14_need_read(q,d,p_actor)
        and private.institution_actor(d.author_id) and feed_data.community_member(d.community_id,d.author_id)
        and d.author_id is distinct from p_actor and not feed_data.blocked_pair(p_actor,d.author_id)
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_lane='project' and p_command is null then
    select * into p from private.community_projects where id=p_id;
    if not private.c14_project_read(p,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    return jsonb_build_object('canRequest',private.c14_organizer(p,p_actor) and p.restricted_at is null
      and (fixture or exists(select from private.c16_policy cfg where private.c16_live(cfg.community_id,'association')
        and private.c16_participant(p_actor,cfg.community_id)))
      and p.status<>'rejected' and p.pending_status is distinct from 'rejected'
      and private.project_proposal_identity_state(p_actor,p.owner_user_id)='verified',
      'items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,case when q.organizer=p_actor and private.c14_organizer(p,p_actor)
        then private.c14_manage_view(q,p,b,d,p_actor,'member')
        else jsonb_build_object('id',q.id,'state','approved','need',
          private.c14_manage_view(q,p,b,d,p_actor,'member')->'need') end item
      from private.c14_links q join private.c13_publications b on b.id=q.publication_id
      join private.c11_needs d on d.id=b.need_id where q.project_id=p_id and (fixture or private.c16_case(d.id))
        and (p_after is null or q.id<p_after)
        and ((q.state='approved' and (q.activated_at is not null or private.project_operator(p,p_actor)) and private.c14_current(q,p,b,d) and private.c14_need_read(b,d,p_actor))
          or (q.organizer=p_actor and private.c14_organizer(p,p_actor)))
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_lane='publication' and p_command is null then
    select * into pub from private.c13_publications where id=p_id;
    select * into n from private.c11_needs where id=pub.need_id;
    if not private.c14_need_read(pub,n,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select d.id,jsonb_build_object('id',d.id,'title',v.proposal->>'title') item
      from private.c14_links q join private.community_projects d on d.id=q.project_id
      join private.project_revisions v on v.project_id=d.id and v.revision=d.revision
      where q.publication_id=p_id and q.state='approved' and q.activated_at is not null and q.project_revision=d.revision
        and (p_after is null or d.id<p_after) and private.c14_current(q,d,pub,n)
        and private.project_visible(d) and private.c14_project_read(d,p_actor)
      order by d.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_command is null and p_id is null then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.id desc) from (
      select q.id,private.c14_manage_view(q,d,b,need,p_actor,p_lane) item
      from private.c14_links q left join private.community_projects d on d.id=q.project_id
      join private.c13_publications b on b.id=q.publication_id join private.c11_needs need on need.id=b.need_id
      left join private.c12_cases ev on ev.need_id=need.id
      where (fixture or (private.c16_case(need.id) and (p_lane<>'review' or private.c16_roster(p_actor,need.community_id,'review'))))
        and (p_after is null or q.id<p_after) and (
        (p_lane='member' and (q.author=p_actor or q.organizer=p_actor))
        or (p_lane='admin' and q.state='awaiting_review' and private.c14_current(q,d,b,need))
        or (p_lane='review' and q.state='awaiting_review' and q.reviewer=p_actor
          and private.c14_current(q,d,b,need) and private.c14_independent(q,d,b,need,ev,p_actor)))
      order by q.id desc limit 21) x),'[]'::jsonb));
  end if;

  if p_command is null or p_lane not in ('member','admin','review') or req is null or action is null
    or p_command->'confirmed' is distinct from 'true'::jsonb
    or (reason is not null and (char_length(reason) not between 5 and 1500 or reason ~ '[[:cntrl:]]'))
  then raise exception 'invalid command' using errcode='23514'; end if;
  perform pg_advisory_xact_lock_shared(20261120,300);
  perform private.s2b_lock_actor(p_actor,p_session);
  perform pg_advisory_xact_lock(20261124,1551);
  if (p_lane='member' and not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false))
    or (p_lane<>'member' and not coalesce(private.c12_staff_session(p_actor,p_session,p_aal2,p_totp,p_workspace,p_lane),false))
  then raise exception 'session required' using errcode='42501'; end if;
  digest:=extensions.digest(jsonb_build_array(p_lane,p_id,p_command)::text,'sha256');
  select * into prior from private.c14_events where actor=p_actor and request_id=req;
  if prior.id is not null then
    if prior.request_hash is distinct from digest then raise exception 'request changed' using errcode='C1403'; end if;
    return jsonb_build_object('id',prior.link_id,'state',prior.state,'revision',prior.revision);
  end if;

  if action='request' and p_lane='member' then
    project_id:=(p_command->>'project')::uuid;
    select * into p from private.community_projects where id=project_id for share;
    if not private.c14_organizer(p,p_actor) then raise exception 'organizer required' using errcode='42501'; end if;
    if p.version is distinct from (p_command->>'projectVersion')::int then raise exception 'proposal changed' using errcode='C1403'; end if;
    select * into pub from private.c13_publications where id=(p_command->>'publication')::uuid;
    select * into n from private.c11_needs where id=pub.need_id;
    if not fixture then perform private.c16_require_live(n.community_id,'association'); end if;
    if not private.c14_need_read(pub,n,p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    if (p.association_id is not null and p.association_id<>n.community_id)
      or (p.community_id is not null and p.community_id<>n.community_id)
      or p_actor=n.author_id or reason is null or char_length(reason)>600
      or reason ~* '(https?://|www\.|@|([0-9][ .()+-]*){7,})'
    then raise exception 'invalid or conflicting association' using errcode='23514'; end if;
    perform private.m23_resource_guard(p_actor,'project_create','project',p.id);
    l.project_id:=p.id; l.publication_id:=pub.id; l.publication_snapshot:=pub.live_proposal;
    l.project_revision:=coalesce(p.pending_revision,p.revision); l.organizer:=p_actor; l.author:=n.author_id;
    if not private.c14_current(l,p,pub,n) then raise exception 'association unavailable' using errcode='42501'; end if;
    insert into private.c14_links(project_id,publication_id,publication_snapshot,project_revision,initiated_version,
      organizer,author,organizer_authority,purpose)
      values(l.project_id,l.publication_id,l.publication_snapshot,l.project_revision,p.version,l.organizer,l.author,
        case when p.organization_id is not null then 'organization' when p.community_id is not null then 'community' else 'individual' end,reason)
      returning * into l;
  else
    select q.project_id into project_id from private.c14_links q where q.id=p_id;
    select * into p from private.community_projects where id=project_id for share;
    select * into l from private.c14_links where id=p_id for update;
    if l.id is null or (p_lane='member' and l.author is distinct from p_actor and l.organizer is distinct from p_actor)
      or (p_lane='review' and l.reviewer is distinct from p_actor) then raise exception 'not available' using errcode='C1402'; end if;
    if l.revision is distinct from (p_command->>'expectedRevision')::int then raise exception 'association changed' using errcode='C1403'; end if;
    select * into pub from private.c13_publications where id=l.publication_id;
    select * into n from private.c11_needs where id=pub.need_id;
    if not fixture then
      if not private.c16_case(n.id) then raise exception 'not available' using errcode='C1402'; end if;
      if action not in ('withdraw','decline') then
        perform private.c16_require_live(n.community_id,'association');
      end if;
      if (action='assign' and not private.c16_roster(target,n.community_id,'review'))
        or (p_lane='review' and not private.c16_roster(p_actor,n.community_id,'review')) then
        raise exception 'independent reviewer required' using errcode='42501';
      end if;
    end if;
    select * into r from private.c12_cases where need_id=n.id;
    if action in ('consent','assign','approve') and not private.c14_current(l,p,pub,n) then
      raise exception 'association changed' using errcode='C1403';
    end if;
    if action in ('consent','decline') and p_lane='member' and l.author=p_actor and l.state='awaiting_consent' then
      if action='consent' and not private.c14_need_read(pub,n,p_actor) then raise exception 'current membership required' using errcode='42501'; end if;
      l.state:=case when action='consent' then 'awaiting_review' else 'declined' end;
    elsif action='assign' and p_lane='admin' and l.state='awaiting_review' and target is distinct from p_actor and reason is not null then
      if not private.c14_independent(l,p,pub,n,r,target) then raise exception 'independent reviewer required' using errcode='42501'; end if;
      l.reviewer:=target;
    elsif action in ('approve','reject') and p_lane='review' and l.state='awaiting_review' and reason is not null
      and private.c14_independent(l,p,pub,n,r,p_actor) then
      if action='approve' then
        if p_command->'relationshipConfirmed' is distinct from 'true'::jsonb then raise exception 'confirm relationship' using errcode='23514'; end if;
        perform private.m23_resource_guard(l.organizer,'project_create','project',p.id);
        perform 1 from feed_data.community_memberships m where m.community_id=n.community_id
          and m.user_id in (l.author,l.organizer) order by m.user_id for key share;
        if not private.c14_current(l,p,pub,n) then raise exception 'association changed' using errcode='C1403'; end if;
        l.state:='approved';
        if private.project_visible(p) and p.revision=l.project_revision then l.activated_at:=clock_timestamp(); end if;
      else l.state:='rejected'; end if;
    elsif action='withdraw' and p_lane='member' and l.state in ('awaiting_consent','awaiting_review','approved')
      and (l.author=p_actor or (l.organizer=p_actor and private.c14_organizer(p,p_actor))) then
      l.state:=case when l.state='approved' then 'revoked' else 'withdrawn' end;
    else raise exception 'association action unavailable' using errcode='42501';
    end if;
    update private.c14_links set revision=l.revision+1,state=l.state,reviewer=l.reviewer,activated_at=l.activated_at
      where id=l.id returning * into l;
  end if;

  act_at:=clock_timestamp();
  insert into private.c14_events(link_id,actor,workspace,request_id,request_hash,action,revision,state,project_version,reason,subject,happened_at)
    values(l.id,p_actor,p_workspace,req,digest,action,l.revision,l.state,p.version,
      case when action in ('assign','approve','reject') then reason end,target,act_at);
  if action='approve' and l.activated_at is not null then
    insert into private.c14_events(link_id,actor,workspace,action,revision,state,project_version,happened_at)
      values(l.id,p_actor,p_workspace,'activate',l.revision,l.state,p.version,act_at);
  end if;
  return jsonb_build_object('id',l.id,'state',l.state,'revision',l.revision);
end
$$;
