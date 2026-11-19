-- Ordinary affiliations do not participate in institutional authorization.
alter table private.organizations
  add column membership_policy text not null default 'invitation_only'
    check (membership_policy in ('open','approval_required','invitation_only')),
  add column membership_policy_locked boolean not null default false,
  add column member_directory_enabled boolean not null default false,
  add constraint official_membership_invitation_only check (
    membership_policy = 'invitation_only' or
    (not membership_policy_locked and kind not in ('municipality','ministry','embassy','government_agency'))
  );

create table private.organization_affiliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  affiliation_type text not null check (affiliation_type in ('member','volunteer','staff','supporter')),
  status text not null check (status in ('pending','active','suspended','removed','left')),
  admission text check (admission in ('self_joined','approved','invited')),
  listed boolean not null default false,
  joined_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id,user_id),
  check ((status in ('removed','left')) = (ended_at is not null)),
  check ((joined_at is null) = (admission is null)),
  check (status not in ('active','suspended') or admission is not null),
  check (status <> 'pending' or admission is null),
  check (not listed or status = 'active'),
  check (approved_by is distinct from user_id)
);
create unique index organization_one_current_affiliation on private.organization_affiliations(organization_id,user_id)
  where status in ('pending','active','suspended');
create index organization_affiliations_user on private.organization_affiliations(user_id,updated_at desc);
create index organization_affiliations_directory on private.organization_affiliations(organization_id,joined_at,id)
  where status='active' and listed;

create table private.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  requester_id uuid not null,
  affiliation_id uuid not null unique,
  affiliation_type text not null check (affiliation_type in ('member','volunteer','staff','supporter')),
  message text check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (affiliation_id,organization_id,requester_id)
    references private.organization_affiliations(id,organization_id,user_id) on delete cascade,
  check ((status='pending') = (decided_at is null)),
  check (reviewer_id is distinct from requester_id),
  check (status <> 'rejected' or coalesce(char_length(btrim(reason)),0) > 0)
);
create unique index organization_open_join_request on private.organization_join_requests(organization_id,requester_id) where status='pending';
create index organization_join_queue on private.organization_join_requests(organization_id,created_at,id) where status='pending';
create index organization_join_history on private.organization_join_requests(requester_id,created_at desc);

create table private.organization_affiliation_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  affiliation_type text not null check (affiliation_type in ('member','volunteer','staff','supporter')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  closed_at timestamptz,
  check (invited_by is distinct from recipient_id and expires_at > created_at),
  check ((status='pending') = (closed_at is null))
);
create unique index organization_current_affiliation_invitation on private.organization_affiliation_invitations(organization_id,recipient_id)
  where status='pending';
create index organization_affiliation_invitation_inbox on private.organization_affiliation_invitations(recipient_id,expires_at);
create index organization_affiliation_invitation_quota on private.organization_affiliation_invitations(organization_id,created_at desc);

create table private.organization_affiliation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  affiliation_id uuid,
  event text not null check (event in ('requested','joined','approved','rejected','withdrawn','suspended','reinstated',
    'removed','left','type_changed','directory_changed','policy_changed','invited','invitation_revoked')),
  affiliation_type text check (affiliation_type in ('member','volunteer','staff','supporter')),
  occurred_at timestamptz not null default now()
);
create index organization_affiliation_events_subject on private.organization_affiliation_events(user_id,occurred_at desc,id);
create index organization_affiliation_events_org on private.organization_affiliation_events(organization_id,occurred_at desc);

alter table private.organization_affiliations enable row level security;
alter table private.organization_join_requests enable row level security;
alter table private.organization_affiliation_invitations enable row level security;
alter table private.organization_affiliation_events enable row level security;
revoke all on private.organization_affiliations, private.organization_join_requests,
  private.organization_affiliation_invitations, private.organization_affiliation_events
  from public,anon,authenticated,service_role;

create function private.affiliation_manager(p_actor uuid,p_org uuid)
returns boolean language sql stable set search_path='' as $$
  select private.institution_actor(p_actor) and
    coalesce(private.institution_role(p_actor,p_org) in ('owner','administrator'),false);
$$;

create function private.affiliation_event(p_org uuid,p_user uuid,p_actor uuid,p_affiliation uuid,p_event text,p_type text)
returns void language sql set search_path='' as $$
  insert into private.organization_affiliation_events(organization_id,user_id,actor_id,affiliation_id,event,affiliation_type)
    values(p_org,p_user,p_actor,p_affiliation,p_event,p_type);
$$;

create function private.affiliation_projection(a private.organization_affiliations)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',a.id,'organizationId',a.organization_id,'affiliationType',a.affiliation_type,
    'status',a.status,'admission',a.admission,'listed',a.listed,'joinedAt',a.joined_at,'updatedAt',a.updated_at);
$$;

create function public.affiliation_directory_for_api(p_handle text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('membershipPolicy',o.membership_policy,'directoryEnabled',o.member_directory_enabled,
    'members', case when o.member_directory_enabled then coalesce((
      select jsonb_agg(m.entry order by m.joined_at,m.id) from (
        select a.joined_at,a.id,jsonb_build_object('displayName',p.display_name,'affiliationType',a.affiliation_type) as entry
        from private.organization_affiliations a join public.profiles p using(user_id)
        where a.organization_id=o.id and a.status='active' and a.listed and p.display_name is not null
          and private.institution_actor(a.user_id)
        order by a.joined_at,a.id limit 100
      ) m
    ),'[]'::jsonb) else '[]'::jsonb end)
  from private.organizations o where o.handle=p_handle and o.status='active';
$$;

create function public.affiliations_own_for_api(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'affiliations',coalesce((
      select jsonb_agg(private.affiliation_projection(a) || jsonb_build_object('organizationName',o.name,'handle',o.handle) order by o.name,a.id)
      from private.organization_affiliations a join private.organizations o on o.id=a.organization_id
      where a.user_id=p_actor and a.status in ('pending','active','suspended') and o.status='active'
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'organizationName',o.name,'handle',o.handle,'affiliationType',i.affiliation_type,
        'expiresAt',i.expires_at) order by i.expires_at,i.id)
      from private.organization_affiliation_invitations i join private.organizations o on o.id=i.organization_id
      where i.recipient_id=p_actor and i.status='pending' and i.expires_at>now() and o.status='active'
        and private.affiliation_manager(i.invited_by,o.id)
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'event',e.event,'affiliationType',e.affiliation_type,
        'occurredAt',e.occurred_at,'organizationName',o.name,'reason',r.reason) order by e.occurred_at desc,e.id)
      from (select * from private.organization_affiliation_events where user_id=p_actor
        order by occurred_at desc,id limit 100) e
      join private.organizations o on o.id=e.organization_id
      left join private.organization_join_requests r on r.affiliation_id=e.affiliation_id and e.event='rejected'
    ),'[]'::jsonb)
  );
end;
$$;

create function public.affiliation_manage_for_api(p_actor uuid,p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o private.organizations;
begin
  if not private.affiliation_manager(p_actor,p_org) then raise exception 'access denied' using errcode='42501'; end if;
  select * into strict o from private.organizations where id=p_org;
  return jsonb_build_object('membershipPolicy',o.membership_policy,'directoryEnabled',o.member_directory_enabled,
    'policyLocked',o.membership_policy_locked or o.kind in ('municipality','ministry','embassy','government_agency'),
    'canSetPolicy',private.institution_role(p_actor,p_org)='owner',
    'members',coalesce((
      select jsonb_agg(private.affiliation_projection(a) || jsonb_build_object('displayName',p.display_name,
        'username',p.username,'isSelf',a.user_id=p_actor) order by a.joined_at,a.id)
      from private.organization_affiliations a left join public.profiles p using(user_id)
      where a.organization_id=p_org and a.status in ('active','suspended')
    ),'[]'::jsonb),
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'affiliationType',r.affiliation_type,'message',r.message,
        'createdAt',r.created_at,'displayName',p.display_name,'username',p.username,'isSelf',r.requester_id=p_actor)
        order by r.created_at,r.id)
      from private.organization_join_requests r left join public.profiles p on p.user_id=r.requester_id
      where r.organization_id=p_org and r.status='pending'
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'affiliationType',i.affiliation_type,'expiresAt',i.expires_at,
        'username',p.username) order by i.expires_at,i.id)
      from private.organization_affiliation_invitations i left join public.profiles p on p.user_id=i.recipient_id
      where i.organization_id=p_org and i.status='pending' and i.expires_at>now()
    ),'[]'::jsonb)
  );
end;
$$;

create function public.affiliation_policy_for_api(p_actor uuid,p_org uuid,p_policy text,p_directory boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.institution_actor(p_actor) or private.institution_role(p_actor,p_org) is distinct from 'owner'
  then raise exception 'access denied' using errcode='42501'; end if;
  update private.organizations set membership_policy=p_policy,member_directory_enabled=p_directory,updated_at=now() where id=p_org
    and (membership_policy,member_directory_enabled) is distinct from (p_policy,p_directory);
  if found then perform private.affiliation_event(p_org,null,p_actor,null,'policy_changed',null); end if;
end;
$$;

create function public.affiliation_join_for_api(p_actor uuid,p_org uuid,p_type text,p_message text)
returns text language plpgsql security definer set search_path='' as $$
declare
  policy text;
  latest private.organization_affiliations;
  affiliation uuid;
  needs_review boolean;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select membership_policy into policy from private.organizations where id=p_org and status='active' for no key update;
  if policy is null or policy='invitation_only' then raise exception 'joining unavailable' using errcode='42501'; end if;
  select * into latest from private.organization_affiliations where organization_id=p_org and user_id=p_actor
    order by created_at desc,id desc limit 1;
  if latest.status in ('pending','active','suspended') or (latest.status='removed' and latest.admission is not null)
  then raise exception 'affiliation unavailable' using errcode='55000'; end if;
  if (select count(*) from private.organization_affiliations where organization_id=p_org and user_id=p_actor
    and created_at>now()-interval '1 day')>=5 then raise exception 'joining limit' using errcode='54000'; end if;
  needs_review := policy='approval_required' or p_type='staff';
  insert into private.organization_affiliations(organization_id,user_id,affiliation_type,status,admission,joined_at)
    values(p_org,p_actor,p_type,case when needs_review then 'pending' else 'active' end,
      case when not needs_review then 'self_joined' end,case when not needs_review then now() end)
    returning id into affiliation;
  if needs_review then
    insert into private.organization_join_requests(organization_id,requester_id,affiliation_id,affiliation_type,message)
      values(p_org,p_actor,affiliation,p_type,nullif(btrim(p_message),''));
  end if;
  perform private.affiliation_event(p_org,p_actor,p_actor,affiliation,case when needs_review then 'requested' else 'joined' end,p_type);
  return case when needs_review then 'pending' else 'active' end;
end;
$$;

create function public.affiliation_decide_for_api(p_actor uuid,p_org uuid,p_request uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare
  r private.organization_join_requests;
  policy text;
begin
  select membership_policy into policy from private.organizations where id=p_org for no key update;
  if not private.affiliation_manager(p_actor,p_org) then raise exception 'access denied' using errcode='42501'; end if;
  select * into r from private.organization_join_requests where id=p_request and organization_id=p_org;
  if r.id is null or r.requester_id=p_actor then raise exception 'access denied' using errcode='42501'; end if;
  if r.status<>'pending' or (p_approve and (policy='invitation_only' or not private.institution_actor(r.requester_id)))
    then raise exception 'decision unavailable' using errcode='55000'; end if;
  update private.organization_join_requests set status=case when p_approve then 'approved' else 'rejected' end,
    reason=nullif(btrim(p_reason),''),reviewer_id=p_actor,decided_at=now() where id=r.id;
  update private.organization_affiliations set status=case when p_approve then 'active' else 'removed' end,
    admission=case when p_approve then 'approved' end,approved_by=case when p_approve then p_actor end,
    joined_at=case when p_approve then now() end,ended_at=case when not p_approve then now() end,updated_at=now()
    where id=r.affiliation_id;
  perform private.affiliation_event(p_org,r.requester_id,p_actor,r.affiliation_id,
    case when p_approve then 'approved' else 'rejected' end,r.affiliation_type);
end;
$$;

create function public.affiliation_own_action_for_api(p_actor uuid,p_org uuid,p_leave boolean,p_listed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare a private.organization_affiliations;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select * into a from private.organization_affiliations
    where organization_id=p_org and user_id=p_actor and status in ('pending','active','suspended');
  if a.id is null or (not p_leave and a.status<>'active') then raise exception 'affiliation unavailable' using errcode='55000'; end if;
  if p_leave then
    update private.organization_join_requests set status='withdrawn',decided_at=now()
      where affiliation_id=a.id and status='pending';
    update private.organization_affiliations set status='left',listed=false,ended_at=now(),updated_at=now() where id=a.id;
    perform private.affiliation_event(p_org,p_actor,p_actor,a.id,case when a.status='pending' then 'withdrawn' else 'left' end,a.affiliation_type);
  elsif a.listed is distinct from p_listed then
    update private.organization_affiliations set listed=p_listed,updated_at=now() where id=a.id;
    perform private.affiliation_event(p_org,p_actor,p_actor,a.id,'directory_changed',a.affiliation_type);
  end if;
end;
$$;

create function public.affiliation_member_action_for_api(p_actor uuid,p_org uuid,p_affiliation uuid,p_action text,p_type text)
returns void language plpgsql security definer set search_path='' as $$
declare a private.organization_affiliations;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.affiliation_manager(p_actor,p_org) then raise exception 'access denied' using errcode='42501'; end if;
  select * into a from private.organization_affiliations where id=p_affiliation and organization_id=p_org;
  if a.id is null or a.user_id=p_actor then raise exception 'access denied' using errcode='42501'; end if;
  if p_action='suspend' and a.status='active' then
    update private.organization_affiliations set status='suspended',listed=false,updated_at=now() where id=a.id;
  elsif p_action='reinstate' and a.status='suspended' and private.institution_actor(a.user_id) then
    update private.organization_affiliations set status='active',listed=false,updated_at=now() where id=a.id;
  elsif p_action='remove' and a.status in ('active','suspended') then
    update private.organization_affiliations set status='removed',listed=false,ended_at=now(),updated_at=now() where id=a.id;
  elsif p_action='change_type' and a.status='active' then
    if a.affiliation_type=p_type then return; end if;
    update private.organization_affiliations set affiliation_type=p_type,listed=false,updated_at=now() where id=a.id;
  else raise exception 'transition unavailable' using errcode='55000'; end if;
  perform private.affiliation_event(p_org,a.user_id,p_actor,a.id,case p_action
    when 'suspend' then 'suspended' when 'reinstate' then 'reinstated' when 'remove' then 'removed' else 'type_changed' end,
    case when p_action='change_type' then p_type else a.affiliation_type end);
end;
$$;

create function public.affiliation_invite_for_api(p_actor uuid,p_org uuid,p_username text,p_type text)
returns uuid language plpgsql security definer set search_path='' as $$
declare recipient uuid; invitation uuid;
begin
  perform 1 from private.organizations where id=p_org for no key update;
  if not private.affiliation_manager(p_actor,p_org) then raise exception 'access denied' using errcode='42501'; end if;
  select user_id into recipient from public.profiles where username=p_username;
  if recipient is null or recipient=p_actor or not private.institution_actor(recipient)
    or exists(select 1 from private.organization_affiliations where organization_id=p_org and user_id=recipient and status in ('pending','active','suspended'))
  then raise exception 'recipient unavailable' using errcode='55000'; end if;
  if (select count(*) from private.organization_affiliation_invitations where organization_id=p_org
    and created_at>now()-interval '1 day')>=25 then raise exception 'invitation limit' using errcode='54000'; end if;
  update private.organization_affiliation_invitations set status='revoked',closed_at=now()
    where organization_id=p_org and recipient_id=recipient and status='pending'
      and (expires_at<=now() or not private.affiliation_manager(invited_by,p_org));
  insert into private.organization_affiliation_invitations(organization_id,recipient_id,invited_by,affiliation_type)
    values(p_org,recipient,p_actor,p_type) returning id into invitation;
  perform private.affiliation_event(p_org,recipient,p_actor,null,'invited',p_type);
  return invitation;
end;
$$;

create function public.affiliation_resolve_invite_for_api(p_actor uuid,p_invitation uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  i private.organization_affiliation_invitations;
  org uuid;
  affiliation uuid;
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  select organization_id into org from private.organization_affiliation_invitations where id=p_invitation;
  perform 1 from private.organizations where id=org for no key update;
  select * into i from private.organization_affiliation_invitations where id=p_invitation;
  if i.id is null or (p_accept and p_actor<>i.recipient_id)
    or (not p_accept and p_actor<>i.recipient_id and not private.affiliation_manager(p_actor,org))
  then raise exception 'access denied' using errcode='42501'; end if;
  if i.status<>'pending' or i.expires_at<=now() then raise exception 'invitation unavailable' using errcode='55000'; end if;
  if p_accept then
    if not private.affiliation_manager(i.invited_by,org)
      or exists(select 1 from private.organization_affiliations where organization_id=org and user_id=p_actor
        and status in ('pending','active','suspended'))
    then raise exception 'invitation unavailable' using errcode='55000'; end if;
    insert into private.organization_affiliations(organization_id,user_id,affiliation_type,status,admission,approved_by,joined_at)
      values(org,p_actor,i.affiliation_type,'active','invited',i.invited_by,now()) returning id into affiliation;
  end if;
  update private.organization_affiliation_invitations set status=case when p_accept then 'accepted' else 'revoked' end,
    closed_at=now() where id=i.id;
  perform private.affiliation_event(org,i.recipient_id,p_actor,affiliation,
    case when p_accept then 'joined' else 'invitation_revoked' end,i.affiliation_type);
end;
$$;

revoke all on function private.affiliation_manager(uuid,uuid),private.affiliation_event(uuid,uuid,uuid,uuid,text,text),
  private.affiliation_projection(private.organization_affiliations) from public,anon,authenticated,service_role;
revoke all on function public.affiliation_directory_for_api(text),public.affiliations_own_for_api(uuid),
  public.affiliation_manage_for_api(uuid,uuid),public.affiliation_policy_for_api(uuid,uuid,text,boolean),
  public.affiliation_join_for_api(uuid,uuid,text,text),public.affiliation_decide_for_api(uuid,uuid,uuid,boolean,text),
  public.affiliation_own_action_for_api(uuid,uuid,boolean,boolean),public.affiliation_member_action_for_api(uuid,uuid,uuid,text,text),
  public.affiliation_invite_for_api(uuid,uuid,text,text),public.affiliation_resolve_invite_for_api(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.affiliation_directory_for_api(text),public.affiliations_own_for_api(uuid),
  public.affiliation_manage_for_api(uuid,uuid),public.affiliation_policy_for_api(uuid,uuid,text,boolean),
  public.affiliation_join_for_api(uuid,uuid,text,text),public.affiliation_decide_for_api(uuid,uuid,uuid,boolean,text),
  public.affiliation_own_action_for_api(uuid,uuid,boolean,boolean),public.affiliation_member_action_for_api(uuid,uuid,uuid,text,text),
  public.affiliation_invite_for_api(uuid,uuid,text,text),public.affiliation_resolve_invite_for_api(uuid,uuid,boolean) to service_role;
