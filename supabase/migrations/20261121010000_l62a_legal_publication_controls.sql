-- L6.2A stores operational availability only. No legal text or approval is inserted.
create table private.legal_publication_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  suspended boolean not null default false,
  revision bigint not null default 0 check (revision>=0),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  check (not (enabled and suspended))
);
insert into private.legal_publication_settings(singleton) values (true);

create table private.legal_policy_settings (
  policy_id text primary key check (policy_id in ('terms','privacy','community-guidelines','organizations',
    'projects-and-volunteers','voting','verification','cookies','data-rights')),
  state text not null default 'draft' check (state in ('draft','under_review','approved','scheduled','published','suspended','superseded','withdrawn')),
  enabled boolean not null default false,
  release_version text,
  release_digest text,
  legal_approval_ref text,
  owner_approval_ref text,
  publication_authority_ref text,
  effective_at timestamptz,
  expires_at timestamptz,
  revision bigint not null default 0 check (revision>=0),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  check (not enabled or state='published'),
  check (expires_at is null or effective_at is null or expires_at>effective_at),
  check (state in ('draft','under_review') or (release_version is not null and release_digest is not null))
);
insert into private.legal_policy_settings(policy_id) values
 ('terms'),('privacy'),('community-guidelines'),('organizations'),('projects-and-volunteers'),
 ('voting'),('verification'),('cookies'),('data-rights');

create table private.legal_publication_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_id uuid references auth.users(id) on delete set null,
  scope text not null check (scope in ('global','policy')),
  policy_id text references private.legal_policy_settings(policy_id),
  action text not null check (action in ('enable','disable','suspend','restore')),
  expected_revision bigint not null,
  previous_revision bigint not null,
  next_revision bigint not null,
  previous_enabled boolean not null,
  next_enabled boolean not null,
  previous_state text,
  next_state text,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  occurred_at timestamptz not null default now(),
  check ((scope='global' and policy_id is null) or (scope='policy' and policy_id is not null))
);
create index legal_publication_audit_recent on private.legal_publication_audit(occurred_at desc,id);

alter table private.legal_publication_settings enable row level security;
alter table private.legal_policy_settings enable row level security;
alter table private.legal_publication_audit enable row level security;
revoke all on private.legal_publication_settings,private.legal_policy_settings,private.legal_publication_audit
  from public,anon,authenticated,service_role;

create function public.legal_availability_for_api()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled',s.enabled and not s.suspended,
    'revision',s.revision,
    'policies',coalesce((select jsonb_agg(jsonb_build_object('policyId',p.policy_id,
      'version',p.release_version,'digest',p.release_digest) order by p.policy_id)
      from private.legal_policy_settings p where p.enabled and p.state='published'
        and p.release_version is not null and p.release_digest is not null
        and p.legal_approval_ref is not null and p.owner_approval_ref is not null
        and p.publication_authority_ref is not null and p.effective_at<=now()
        and (p.expires_at is null or p.expires_at>now())),'[]'::jsonb))
  from private.legal_publication_settings s where s.singleton;
$$;

create function public.admin_legal_settings_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'global',(select jsonb_build_object('enabled',enabled,'suspended',suspended,'revision',revision,'changedAt',changed_at)
      from private.legal_publication_settings where singleton),
    'policies',coalesce((select jsonb_agg(jsonb_build_object(
      'policyId',policy_id,'state',state,'enabled',enabled,'revision',revision,
      'releaseVersion',release_version,'releaseDigest',release_digest,'effectiveAt',effective_at,'expiresAt',expires_at,
      'eligible',state in ('approved','published','suspended') and release_version is not null
        and release_digest is not null and legal_approval_ref is not null and owner_approval_ref is not null
        and publication_authority_ref is not null and effective_at<=now()
        and (expires_at is null or expires_at>now()),
      'changedAt',changed_at) order by policy_id) from private.legal_policy_settings),'[]'::jsonb));
end;
$$;

create function public.admin_legal_audit_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'actorId',actor_id,'scope',scope,'policyId',policy_id,'action',action,'reason',reason,
    'previousEnabled',previous_enabled,'nextEnabled',next_enabled,
    'previousState',previous_state,'nextState',next_state,'previousRevision',previous_revision,
    'nextRevision',next_revision,'occurredAt',occurred_at) order by occurred_at desc,id)
    from (select * from private.legal_publication_audit order by occurred_at desc,id limit 100) x),'[]'::jsonb);
end;
$$;

create function public.admin_legal_action_for_api(p_actor uuid,p_scope text,p_policy text,p_action text,
  p_expected bigint,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_global private.legal_publication_settings;
  old_policy private.legal_policy_settings;
  earlier private.legal_publication_audit;
  next_enabled boolean;
  next_suspended boolean;
  next_state text;
  next_revision bigint;
begin
  perform pg_advisory_xact_lock(20261121,62);
  if not private.platform_admin(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  if p_request is null or p_expected is null or p_expected<0 or
    coalesce(char_length(btrim(p_reason)),0) not between 10 and 500 or p_reason ~ '[[:cntrl:]]' or
    p_scope is null or p_action is null or p_scope not in ('global','policy') or
    p_action not in ('enable','disable','suspend','restore') or
    (p_scope='global' and p_policy is not null) or (p_scope='policy' and p_policy is null)
  then raise exception 'invalid legal action' using errcode='23514'; end if;
  select * into earlier from private.legal_publication_audit where request_id=p_request;
  if earlier.id is not null then
    if earlier.actor_id=p_actor and earlier.scope=p_scope and earlier.policy_id is not distinct from p_policy
      and earlier.action=p_action and earlier.expected_revision=p_expected and earlier.reason=btrim(p_reason)
    then return jsonb_build_object('revision',earlier.next_revision,'enabled',earlier.next_enabled); end if;
    raise exception 'conflicting request' using errcode='23505';
  end if;

  if p_scope='global' then
    select * into old_global from private.legal_publication_settings where singleton for update;
    if old_global.revision<>p_expected then raise exception 'stale legal revision' using errcode='55000'; end if;
    if p_action in ('enable','restore') then
      -- No approved release rows exist in L6.2A. A future independently reviewed migration must supply them.
      if not exists (select 1 from private.legal_policy_settings where enabled and state='published'
        and release_digest is not null and legal_approval_ref is not null and owner_approval_ref is not null
        and publication_authority_ref is not null and effective_at<=now()
        and (expires_at is null or expires_at>now()))
      then raise exception 'approved release required' using errcode='55000'; end if;
      if p_action='restore' and not old_global.suspended then raise exception 'not suspended' using errcode='55000'; end if;
      if p_action='enable' and old_global.enabled then raise exception 'already enabled' using errcode='55000'; end if;
      next_enabled:=true; next_suspended:=false;
    else
      if not old_global.enabled and not old_global.suspended then raise exception 'already disabled' using errcode='55000'; end if;
      next_enabled:=false; next_suspended:=p_action='suspend';
    end if;
    next_revision:=old_global.revision+1;
    update private.legal_publication_settings set enabled=next_enabled,suspended=next_suspended,
      revision=next_revision,changed_at=now(),changed_by=p_actor where singleton;
    insert into private.legal_publication_audit(request_id,actor_id,scope,action,expected_revision,
      previous_revision,next_revision,previous_enabled,next_enabled,previous_state,next_state,reason)
      values(p_request,p_actor,p_scope,p_action,p_expected,old_global.revision,next_revision,
        old_global.enabled,next_enabled,case when old_global.suspended then 'suspended' else 'active' end,
        case when next_suspended then 'suspended' else 'active' end,btrim(p_reason));
  else
    select * into old_policy from private.legal_policy_settings where policy_id=p_policy for update;
    if old_policy.policy_id is null then raise exception 'unknown policy' using errcode='23514'; end if;
    if old_policy.revision<>p_expected then raise exception 'stale legal revision' using errcode='55000'; end if;
    if p_action in ('enable','restore') then
      if old_policy.state not in ('approved','published','suspended') or old_policy.release_version is null
        or old_policy.release_digest is null or old_policy.legal_approval_ref is null
        or old_policy.owner_approval_ref is null or old_policy.publication_authority_ref is null
        or old_policy.effective_at is null or old_policy.effective_at>now()
        or (old_policy.expires_at is not null and old_policy.expires_at<=now())
      then raise exception 'approved release required' using errcode='55000'; end if;
      if p_action='restore' and old_policy.state<>'suspended' then raise exception 'not suspended' using errcode='55000'; end if;
      if p_action='enable' and old_policy.enabled then raise exception 'already enabled' using errcode='55000'; end if;
      next_enabled:=true; next_state:='published';
    elsif p_action='suspend' then
      if not old_policy.enabled or old_policy.state<>'published' then raise exception 'not published' using errcode='55000'; end if;
      next_enabled:=false; next_state:='suspended';
    else
      if not old_policy.enabled then raise exception 'already disabled' using errcode='55000'; end if;
      next_enabled:=false; next_state:=old_policy.state;
    end if;
    next_revision:=old_policy.revision+1;
    update private.legal_policy_settings set enabled=next_enabled,state=next_state,
      revision=next_revision,changed_at=now(),changed_by=p_actor where policy_id=p_policy;
    insert into private.legal_publication_audit(request_id,actor_id,scope,policy_id,action,expected_revision,
      previous_revision,next_revision,previous_enabled,next_enabled,previous_state,next_state,reason)
      values(p_request,p_actor,p_scope,p_policy,p_action,p_expected,old_policy.revision,next_revision,
        old_policy.enabled,next_enabled,old_policy.state,next_state,btrim(p_reason));
  end if;
  return jsonb_build_object('revision',next_revision,'enabled',next_enabled);
end;
$$;

revoke all on function public.legal_availability_for_api(),public.admin_legal_settings_for_api(uuid),
  public.admin_legal_audit_for_api(uuid),public.admin_legal_action_for_api(uuid,text,text,text,bigint,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.legal_availability_for_api(),public.admin_legal_settings_for_api(uuid),
  public.admin_legal_audit_for_api(uuid),public.admin_legal_action_for_api(uuid,text,text,text,bigint,text,uuid)
  to service_role;
