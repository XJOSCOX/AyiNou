-- O6 uses existing Auth, organizations and ownership. No production program or authority is seeded.
create table private.early_partner_programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  version integer not null check (version>0),
  title text not null check (length(title) between 3 and 100),
  purpose text not null check (length(purpose) between 10 and 500),
  terms_version integer not null check (terms_version>0),
  terms_digest text not null check (terms_digest ~ '^[a-f0-9]{64}$'),
  eligible_kinds text[] not null check (cardinality(eligible_kinds) between 1 and 15 and array_position(eligible_kinds,null) is null),
  features text[] not null check (features <@ array['pilot_feedback','guided_onboarding','feature_preview','volunteer_testing','program_preview','pilot_documents','beta_interface']
    and cardinality(features) between 1 and 7 and array_position(features,null) is null),
  capacity integer not null check (capacity between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at>starts_at),
  provisioned_by uuid not null references auth.users(id) on delete restrict,
  approval_reference uuid not null,
  synthetic boolean not null default false,
  unique(slug,version)
);
create table private.early_partner_operators (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references private.early_partner_programs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in ('nominate','review')),
  granted_by uuid not null references auth.users(id) on delete restrict check(granted_by<>user_id),
  approval_reference uuid not null,
  granted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at>granted_at),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict check (revoked_by<>user_id),
  revocation_reference uuid,
  check ((revoked_at is null)=(revoked_by is null) and (revoked_at is null)=(revocation_reference is null))
);
create unique index early_partner_operator_grant on private.early_partner_operators(program_id,user_id,scope) where revoked_at is null;

create table private.early_partner_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references private.early_partner_programs(id) on delete restrict,
  organization_id uuid not null references private.organizations(id) on delete restrict,
  nominated_by uuid not null references auth.users(id) on delete restrict,
  offered_by uuid references auth.users(id) on delete restrict check (offered_by<>nominated_by),
  offer_until timestamptz,
  owner_grant uuid,
  accepted_by uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  acceptance_valid_until timestamptz,
  feedback_enabled boolean not null default true,
  opted_in_at timestamptz,
  state text not null default 'nominated' check (state in ('nominated','offered','active','suspended','declined','withdrawn','ended','expired')),
  revision integer not null default 1 check (revision>0),
  updated_at timestamptz not null default clock_timestamp(),
  check ((accepted_at is null) = (accepted_by is null)),
  check ((accepted_at is null) = (acceptance_valid_until is null)),
  unique(program_id,organization_id)
);
create index early_partner_enrollments_organization on private.early_partner_enrollments(organization_id,updated_at desc);
create index early_partner_enrollments_capacity on private.early_partner_enrollments(program_id,state,offer_until);

create table private.early_partner_feedback (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references private.early_partner_enrollments(id) on delete restrict,
  reporter_id uuid references auth.users(id) on delete set null,
  feature text not null,
  category text not null check (category in ('usability','accessibility','defect','suggestion')),
  description text not null check (length(description) between 10 and 500 and description !~ '[[:cntrl:]]'),
  steps text check (length(steps) between 3 and 500 and steps !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','resolved')),
  resolution text check (length(resolution) between 10 and 500 and resolution !~ '[[:cntrl:]]'),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default clock_timestamp()
);
create index early_partner_feedback_scope on private.early_partner_feedback(enrollment_id,created_at desc);

create table private.early_partner_events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references private.early_partner_programs(id) on delete restrict,
  enrollment_id uuid references private.early_partner_enrollments(id) on delete restrict,
  feedback_id uuid references private.early_partner_feedback(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  revision integer not null check (revision>0),
  reason text,
  request_key uuid,
  fingerprint bytea,
  outcome jsonb not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(actor_id,request_key),
  check ((request_key is null)=(fingerprint is null))
);
create index early_partner_events_scope on private.early_partner_events(program_id,created_at desc);
create index early_partner_events_enrollment on private.early_partner_events(enrollment_id,created_at desc);

alter table private.early_partner_programs enable row level security;
alter table private.early_partner_operators enable row level security;
alter table private.early_partner_enrollments enable row level security;
alter table private.early_partner_feedback enable row level security;
alter table private.early_partner_events enable row level security;
revoke all on private.early_partner_programs,private.early_partner_operators,private.early_partner_enrollments,
  private.early_partner_feedback,private.early_partner_events from public,anon,authenticated,service_role;

-- This named fixture seam may only be replaced by the disposable test harness.
-- There is no program, setting, policy registry entry, or route that can activate production.
create function private.early_partner_synthetic_gate(p_program uuid) returns boolean
language sql stable set search_path='' as $$ select false $$;

create function private.early_partner_gate(p private.early_partner_programs) returns boolean
language sql stable set search_path='' as $$
  select p.synthetic and private.early_partner_synthetic_gate(p.id)
$$;

create function private.early_partner_configuration_event() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='early_partner_programs' then
    insert into private.early_partner_events(program_id,actor_id,action,revision,outcome)
      values(new.id,new.provisioned_by,'program_version',new.version,jsonb_build_object('approval',new.approval_reference));
  else
    if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null
      or (to_jsonb(old)-array['revoked_at','revoked_by','revocation_reference'])<>
        (to_jsonb(new)-array['revoked_at','revoked_by','revocation_reference'])) then
      raise exception 'invalid authority change' using errcode='23514';
    end if;
    insert into private.early_partner_events(program_id,actor_id,action,revision,outcome)
      values(new.program_id,case when tg_op='INSERT' then new.granted_by else new.revoked_by end,
        case when tg_op='INSERT' then 'operator_granted' else 'operator_revoked' end,
        case when tg_op='INSERT' then 1 else 2 end,
        jsonb_build_object('approval',coalesce(new.revocation_reference,new.approval_reference),'scope',new.scope,'authority',new.id));
  end if;
  return new;
end
$$;
create trigger early_partner_program_versions after insert on private.early_partner_programs
  for each row execute function private.early_partner_configuration_event();
create trigger early_partner_operator_events after insert or update on private.early_partner_operators
  for each row execute function private.early_partner_configuration_event();

create function private.early_partner_immutable() returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'append a new version' using errcode='55000';
end
$$;
create trigger early_partner_version_immutable before update or delete on private.early_partner_programs
  for each row execute function private.early_partner_immutable();
create trigger early_partner_operator_no_delete before delete on private.early_partner_operators
  for each row execute function private.early_partner_immutable();
create trigger early_partner_event_immutable before update or delete on private.early_partner_events
  for each row when (pg_trigger_depth()=0) execute function private.early_partner_immutable();

create function private.early_partner_scope(p_actor uuid,p_program uuid,p_scope text default null)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.early_partner_operators o where o.user_id=p_actor and o.program_id=p_program
    and o.revoked_at is null and o.expires_at>now() and (p_scope is null or o.scope=p_scope))
$$;

create function private.early_partner_owner(p_org uuid)
returns uuid language sql stable set search_path='' as $$
  select m.id from private.organization_memberships m
  where m.organization_id=p_org and m.role='owner' and m.revoked_at is null
    and (m.expires_at is null or m.expires_at>now()) and private.institution_actor(m.user_id)
  order by m.id limit 1
$$;

create function private.early_partner_eligible(p private.early_partner_programs,p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce((select o.status='active' and o.kind=any(p.eligible_kinds)
    and o.kind not in ('municipality','ministry','embassy','government_agency')
    and o.verification_status not in ('revoked','rejected')
    and private.early_partner_owner(o.id) is not null
    and not exists(select 1 from private.verification_applications v where v.organization_id=o.id and v.kind='claim' and v.status='pending')
    and not exists(select 1 from private.impersonation_reports r where r.organization_id=o.id
      and r.kind in ('institution','representative') and r.outcome in ('pending','substantiated'))
    from private.organizations o where o.id=p_org),false)
$$;

create function private.early_partner_conflict(p_actor uuid,p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_report_conflict(p_actor,p_org)
    or exists(select 1 from private.organization_custom_assignments a where a.organization_id=p_org and a.user_id=p_actor
      and private.organization_grant_current(a))
$$;

create function private.early_partner_state(e private.early_partner_enrollments,p private.early_partner_programs)
returns text language sql stable set search_path='' as $$
  select case
    when e.state in ('nominated','offered') and (p.ends_at<=clock_timestamp() or e.offer_until<=clock_timestamp()) then 'expired'
    when e.state in ('active','suspended') and p.ends_at<=clock_timestamp() then 'ended'
    else e.state end
$$;

create function private.early_partner_slots(p_program uuid)
returns integer language sql stable set search_path='' as $$
  select count(*)::integer from private.early_partner_enrollments e where e.program_id=p_program
    and (e.state in ('active','suspended') or (e.state='offered' and e.offer_until>clock_timestamp()))
$$;

create function private.early_partner_feedback_access(e private.early_partner_enrollments,p private.early_partner_programs)
returns boolean language sql stable set search_path='' as $$
  select coalesce(e.state='active' and e.feedback_enabled and 'pilot_feedback'=any(p.features)
    and clock_timestamp()>=p.starts_at and p.ends_at>clock_timestamp() and e.acceptance_valid_until>clock_timestamp()
    and private.early_partner_gate(p) and private.early_partner_eligible(p,e.organization_id)
    and private.early_partner_owner(e.organization_id)=e.owner_grant
    and private.institution_role(e.accepted_by,e.organization_id)='owner',false)
$$;

create function private.early_partner_program_card(p private.early_partner_programs,p_admin boolean,p_actor uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'purpose',p.purpose,'version',p.version,
    'termsVersion',p.terms_version,'termsDigest',p.terms_digest,'startsAt',p.starts_at,'endsAt',p.ends_at,
    'syntheticOpen',private.early_partner_gate(p),'features',p.features)
  || case when p_admin then jsonb_build_object('capacity',p.capacity,'reserved',private.early_partner_slots(p.id),
    'nominate',private.early_partner_scope(p_actor,p.id,'nominate'),'review',private.early_partner_scope(p_actor,p.id,'review'),
    'eligibleKinds',p.eligible_kinds) else '{}'::jsonb end
$$;

create function private.early_partner_card(e private.early_partner_enrollments,p private.early_partner_programs,
  p_actor uuid,p_admin boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',e.id,'organizationId',e.organization_id,'programId',e.program_id,
    'state',private.early_partner_state(e,p),'revision',e.revision,
    'eligible',private.early_partner_eligible(p,e.organization_id),'offerUntil',e.offer_until,'optedIn',e.opted_in_at is not null,
    'canOffer',p_admin and e.nominated_by<>p_actor and private.early_partner_scope(p_actor,p.id,'review') and not private.early_partner_conflict(p_actor,e.organization_id),
    'canFeedback',not p_admin and private.early_partner_feedback_access(e,p),
    'canRevokeFeedback',p_admin and e.feedback_enabled,
    'canRecordExpiry',p_admin and e.state in ('nominated','offered') and private.early_partner_state(e,p)='expired',
    'canRecordEnd',p_admin and e.state in ('active','suspended') and private.early_partner_state(e,p)='ended',
    'sameOwner',coalesce(e.owner_grant=private.early_partner_owner(e.organization_id),false),
    'canAccept',private.institution_role(p_actor,e.organization_id)='owner'
      and coalesce(e.owner_grant=private.early_partner_owner(e.organization_id),false) and now()>=p.starts_at
      and not exists(select 1 from private.organization_memberships m where m.id=e.owner_grant and m.user_id<>p_actor))
$$;

create function public.early_partner_read_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_admin boolean,p_org uuid,p_program uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean; actor_role text;
begin
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_admin,false);
  if p_admin then
    if p_org is not null then raise exception 'invalid scope' using errcode='23514'; end if;
    select exists(select 1 from private.early_partner_operators o where o.user_id=p_actor
      and o.revoked_at is null and o.expires_at>now() and (p_program is null or o.program_id=p_program)) into allowed;
    if not allowed then raise exception 'operator scope required' using errcode='42501'; end if;
  else
    actor_role := private.institution_role(p_actor,p_org);
    if actor_role is null or actor_role not in ('owner','administrator') then
      raise exception 'organization unavailable' using errcode='O2003';
    end if;
    if p_program is not null then raise exception 'invalid scope' using errcode='23514'; end if;
  end if;

  return jsonb_build_object('operational',false,'role',actor_role,
    'programs',coalesce((select jsonb_agg(private.early_partner_program_card(p,p_admin,p_actor) order by p.starts_at desc,p.id)
      from (select p0.* from private.early_partner_programs p0 where
        (p_admin and private.early_partner_scope(p_actor,p0.id))
        or (not p_admin and exists(select 1 from private.early_partner_enrollments e
          where e.program_id=p0.id and e.organization_id=p_org and e.offered_by is not null))
        order by p0.starts_at desc,p0.id limit 25) p),'[]'::jsonb),
    'enrollments',coalesce((select jsonb_agg(private.early_partner_card(e,p,p_actor,p_admin) order by e.updated_at desc,e.id)
      from (select e0.* from private.early_partner_enrollments e0 where
        (p_admin and e0.program_id=p_program and not private.early_partner_conflict(p_actor,e0.organization_id))
        or (not p_admin and e0.organization_id=p_org and e0.offered_by is not null)
        order by e0.updated_at desc,e0.id limit 50) e join private.early_partner_programs p on p.id=e.program_id),'[]'::jsonb),
    'feedback',coalesce((select jsonb_agg(to_jsonb(f)-'reporter_id' order by f.created_at desc,f.id) from
      (select f0.* from private.early_partner_feedback f0 join private.early_partner_enrollments e on e.id=f0.enrollment_id
        where (p_admin and e.program_id=p_program and not private.early_partner_conflict(p_actor,e.organization_id))
          or (not p_admin and e.organization_id=p_org)
        order by f0.created_at desc,f0.id limit 30) f),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'enrollmentId',ev.enrollment_id,'action',ev.action,
      'revision',ev.revision,'at',ev.created_at) order by ev.created_at desc,ev.id) from
      (select ev0.* from private.early_partner_events ev0 left join private.early_partner_enrollments e on e.id=ev0.enrollment_id
        where (p_admin and ev0.program_id=p_program and (e.id is null or not private.early_partner_conflict(p_actor,e.organization_id)))
          or (not p_admin and e.organization_id=p_org and e.offered_by is not null
            and ev0.action not in ('nominate','reject_nomination'))
        order by ev0.created_at desc,ev0.id limit 50) ev),'[]'::jsonb));
end
$$;

create function public.early_partner_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_admin boolean,p_org uuid,p_program uuid,p_id uuid,p_action text,p_version integer,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p private.early_partner_programs;
  e private.early_partner_enrollments;
  f private.early_partner_feedback;
  actor_role text;
  action_scope text := case when p_action='nominate' then 'nominate' else 'review' end;
  reason text := p_input->>'reason';
  digest bytea := private.o5_digest('early_partner',coalesce(p_id,p_program),p_action,p_version,
    jsonb_build_array(p_admin,p_org,p_program,p_input));
  event_id uuid := gen_random_uuid();
  result jsonb;
  receipt_digest bytea;
  current_state text;
  message text := p_input->>'description';
  steps text := p_input->>'steps';
  feedback_id uuid := (p_input->>'feedbackId')::uuid;
  event_revision integer;
begin
  if p_request is null or p_version is null or p_version not between 0 and 2147483646
    or p_input->'confirm' is distinct from 'true'::jsonb or pg_column_size(p_input)>2048
    or (p_input - case when p_admin and p_action='resolve' then array['confirm','reason','feedbackId']
        when p_admin then array['confirm','reason']
        when p_action='accept' then array['confirm','termsVersion','termsDigest']
        when p_action='feedback' then array['confirm','feature','category','description','steps']
        else array['confirm'] end)<>'{}'::jsonb
    or not coalesce(case when p_admin then p_action in ('nominate','offer','reject_nomination','suspend','end','expire','revoke_feedback','resolve')
      else p_action in ('accept','decline','withdraw','opt_in','opt_out','feedback') end,false)
    or (p_id is null)<>(p_action='nominate') or (p_program is not null)<>(p_action='nominate')
    or (p_org is not null)<>(not p_admin or p_action='nominate')
    or (p_admin and not coalesce(length(btrim(reason)) between 10 and 500 and reason !~ '[[:cntrl:]]',false))
  then raise exception 'invalid partner command' using errcode='23514'; end if;

  -- Existing claim and onboarding corrections share this lock. Program and scope rows are locked underneath it.
  perform pg_advisory_xact_lock(20261120,300);
  perform private.o5_lock_actor(p_actor,p_session);
  perform private.o5_session(p_actor,p_session,p_aal2,p_totp,p_admin,p_action in ('accept','opt_in'));
  if p_id is not null then
    select * into e from private.early_partner_enrollments where id=p_id and (p_admin or organization_id=p_org) for update;
    if not found then raise exception 'enrollment unavailable' using errcode='O2003'; end if;
  end if;

  select * into p from private.early_partner_programs where id=coalesce(p_program,e.program_id) for update;
  if not found then raise exception 'program unavailable' using errcode='O2003'; end if;
  perform 1 from private.organizations where id=coalesce(p_org,e.organization_id) for no key update;
  if not found then raise exception 'organization unavailable' using errcode='O2003'; end if;
  perform 1 from private.organization_memberships where organization_id=coalesce(p_org,e.organization_id)
    and revoked_at is null and (role='owner' or user_id=p_actor) order by id for share;
  if p_admin then
    perform 1 from private.early_partner_operators where program_id=p.id and user_id=p_actor and scope=action_scope for share;
    if not private.early_partner_scope(p_actor,p.id,action_scope)
      or private.early_partner_conflict(p_actor,coalesce(p_org,e.organization_id))
      then raise exception 'operator denied' using errcode='42501'; end if;
  else
    actor_role := private.institution_role(p_actor,p_org);
    if e.offered_by is null or actor_role is null or actor_role not in ('owner','administrator')
      then raise exception 'enrollment unavailable' using errcode='O2003'; end if;
    if actor_role<>'owner' and p_action<>'feedback' then raise exception 'owner required' using errcode='42501'; end if;
  end if;

  select outcome,fingerprint into result,receipt_digest from private.early_partner_events where actor_id=p_actor and request_key=p_request;
  if found then
    if receipt_digest is distinct from digest then raise exception 'request conflict' using errcode='O2002'; end if;
    return result;
  end if;
  if (select count(*) from private.early_partner_events where actor_id=p_actor and request_key is not null
      and created_at>now()-interval '1 day')>=60 then raise exception 'command budget' using errcode='54000'; end if;

  if p_action in ('nominate','offer','accept','opt_in','feedback')
    and not private.early_partner_gate(p) then raise exception 'pilot closed' using errcode='O6001'; end if;
  if p_action in ('nominate','offer','accept') and (p.ends_at<=clock_timestamp() or not private.early_partner_eligible(p,coalesce(p_org,e.organization_id)))
    then raise exception 'partner ineligible' using errcode='O6002'; end if;

  if p_action='nominate' then
    if p_version<>p.version then raise exception 'stale program' using errcode='O2004'; end if;
    insert into private.early_partner_enrollments(program_id,organization_id,nominated_by)
      values(p.id,p_org,p_actor) returning * into e;
  elsif p_action='resolve' then
    select * into f from private.early_partner_feedback where id=feedback_id and enrollment_id=e.id for update;
    if not found then raise exception 'feedback unavailable' using errcode='O2003'; end if;
    if f.revision<>p_version then raise exception 'stale feedback' using errcode='O2004'; end if;
    if f.state<>'open' then raise exception 'feedback already resolved' using errcode='55000'; end if;
    update private.early_partner_feedback set state='resolved',resolution=reason,revision=revision+1 where id=f.id returning * into f;
  else
    if e.revision<>p_version then raise exception 'stale enrollment' using errcode='O2004'; end if;
    current_state := private.early_partner_state(e,p);
    if p_action='offer' and current_state='nominated' then
      if e.nominated_by=p_actor then raise exception 'independent review required' using errcode='42501'; end if;
      if private.early_partner_slots(p.id)>=p.capacity then raise exception 'pilot full' using errcode='O6003'; end if;
      update private.early_partner_enrollments set state='offered',offered_by=p_actor,owner_grant=private.early_partner_owner(e.organization_id),
        offer_until=least(p.ends_at,now()+interval '7 days'),revision=revision+1,updated_at=clock_timestamp() where id=e.id returning * into e;
    elsif p_action='accept' and current_state='offered' then
      if p.starts_at>now() or e.owner_grant is distinct from private.early_partner_owner(e.organization_id)
        or not exists(select 1 from private.organization_memberships m where m.id=e.owner_grant and m.user_id=p_actor)
        then raise exception 'stale owner or timing' using errcode='O6002'; end if;
      if (p_input->>'termsVersion')::integer is distinct from p.terms_version
        or p_input->>'termsDigest' is distinct from p.terms_digest then raise exception 'stale terms' using errcode='O2004'; end if;
      update private.early_partner_enrollments set state='active',accepted_by=p_actor,accepted_at=clock_timestamp(),
        acceptance_valid_until=p.ends_at,revision=revision+1,updated_at=clock_timestamp() where id=e.id returning * into e;
    elsif p_action in ('opt_in','opt_out') and current_state='active' then
      if p_action='opt_in' and (not private.early_partner_eligible(p,e.organization_id)
        or e.owner_grant is distinct from private.early_partner_owner(e.organization_id))
        then raise exception 'pilot unavailable' using errcode='O6002'; end if;
      if (p_action='opt_in')=(e.opted_in_at is not null) then raise exception 'no visibility change' using errcode='55000'; end if;
      update private.early_partner_enrollments set opted_in_at=case when p_action='opt_in' then clock_timestamp() end,
        revision=revision+1,updated_at=clock_timestamp() where id=e.id returning * into e;
    elsif p_action='feedback' and private.early_partner_feedback_access(e,p) then
      if p_input->>'feature' is null or not ((p_input->>'feature')=any(p.features))
        or not coalesce(length(btrim(message)) between 10 and 500 and message !~ '[[:cntrl:]]',false)
        or (steps is not null and not (length(btrim(steps)) between 3 and 500 and steps !~ '[[:cntrl:]]'))
        then raise exception 'invalid feedback' using errcode='23514'; end if;
      if (select count(*) from private.early_partner_feedback where enrollment_id=e.id and reporter_id=p_actor
        and created_at>now()-interval '1 day')>=5 then raise exception 'feedback limit' using errcode='54000'; end if;
      insert into private.early_partner_feedback(enrollment_id,reporter_id,feature,category,description,steps)
        values(e.id,p_actor,p_input->>'feature',p_input->>'category',btrim(message),btrim(steps)) returning * into f;
    elsif p_action='revoke_feedback' and current_state in ('active','suspended') and e.feedback_enabled then
      update private.early_partner_enrollments set feedback_enabled=false,revision=revision+1,updated_at=clock_timestamp()
        where id=e.id returning * into e;
    elsif (p_action='reject_nomination' and current_state='nominated')
      or (p_action='decline' and current_state='offered')
      or (p_action='withdraw' and current_state in ('offered','active','suspended'))
      or (p_action='suspend' and current_state in ('offered','active'))
      or (p_action='end' and e.state in ('nominated','offered','active','suspended'))
      or (p_action='expire' and e.state in ('nominated','offered') and current_state='expired') then
      if p_action='reject_nomination' and e.nominated_by=p_actor then
        raise exception 'independent review required' using errcode='42501'; end if;
      update private.early_partner_enrollments set
        state=case p_action when 'reject_nomination' then 'declined' when 'decline' then 'declined' when 'withdraw' then 'withdrawn'
          when 'suspend' then 'suspended' when 'expire' then 'expired' else 'ended' end,
        opted_in_at=null,revision=revision+1,updated_at=clock_timestamp() where id=e.id returning * into e;
    else
      raise exception 'partner transition unavailable' using errcode='55000';
    end if;
  end if;

  event_revision := coalesce(f.revision,e.revision);
  result := jsonb_build_object('id',coalesce(f.id,e.id),'state',coalesce(f.state,e.state),'revision',event_revision,'receiptId',event_id);
  if p_action='accept' then result := result || jsonb_build_object('synthetic',true,'termsVersion',p.terms_version); end if;
  insert into private.early_partner_events(id,program_id,enrollment_id,feedback_id,actor_id,action,revision,reason,request_key,fingerprint,outcome,context)
    values(event_id,p.id,e.id,f.id,p_actor,p_action,event_revision,case when p_action<>'resolve' then reason end,p_request,digest,
      result,case when p_action='accept' then jsonb_build_object('termsDigest',p.terms_digest,'ownerGrant',e.owner_grant,
        'features',p.features,'accessUntil',e.acceptance_valid_until) else '{}'::jsonb end);
  return result;
end
$$;

-- Record partner dependencies in the existing correction preview and final decision.
alter function private.o5_correction_blockers(private.organization_onboarding_intents)
  rename to o6_prior_correction_blockers;
create function private.o5_correction_blockers(i private.organization_onboarding_intents)
returns text[] language sql stable set search_path='' as $$
  select private.o6_prior_correction_blockers(i) || case when exists(
    select 1 from private.early_partner_enrollments e join private.early_partner_programs p on p.id=e.program_id
    where (e.accepted_by=i.subject_id or exists(select 1 from private.organization_memberships m
      where m.organization_id=e.organization_id and m.user_id=i.subject_id and m.role='owner' and m.revoked_at is null))
      and private.early_partner_state(e,p) in ('offered','active','suspended')
  ) then array['partner_obligations'] else '{}'::text[] end
$$;

revoke all on function private.early_partner_synthetic_gate(uuid),private.early_partner_gate(private.early_partner_programs),
  private.early_partner_configuration_event(),private.early_partner_immutable(),private.early_partner_scope(uuid,uuid,text),
  private.early_partner_owner(uuid),private.early_partner_eligible(private.early_partner_programs,uuid),private.early_partner_conflict(uuid,uuid),
  private.early_partner_state(private.early_partner_enrollments,private.early_partner_programs),private.early_partner_slots(uuid),
  private.early_partner_feedback_access(private.early_partner_enrollments,private.early_partner_programs),
  private.early_partner_program_card(private.early_partner_programs,boolean,uuid),
  private.early_partner_card(private.early_partner_enrollments,private.early_partner_programs,uuid,boolean),
  private.o5_correction_blockers(private.organization_onboarding_intents)
  from public,anon,authenticated,service_role;
revoke all on function public.early_partner_read_for_api(uuid,uuid,boolean,bigint,boolean,uuid,uuid),
  public.early_partner_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,uuid,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.early_partner_read_for_api(uuid,uuid,boolean,bigint,boolean,uuid,uuid),
  public.early_partner_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,uuid,uuid,text,integer,uuid,jsonb)
  to service_role;
