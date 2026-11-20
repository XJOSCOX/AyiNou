-- A case preserves the complete invitation and designation history for program version 1.
create table private.ambassador_cases (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete set null,
  category text not null check(category in ('community','education','culture','technology','service')),
  status text not null default 'proposed' check(status in (
    'proposed','invited','active','declined','suspended','revoked','expired','completed','withdrawn')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  invite_expires_at timestamptz,
  accepted_at timestamptz,
  public_opt_in boolean not null default false,
  statement text check(statement is null or private.valid_trust_text(statement,1,500)),
  reconsideration text check(reconsideration in ('pending','upheld','new_invitation')),
  check(status not in ('active','suspended','completed','withdrawn') or accepted_at is not null),
  check(status<>'invited' or invite_expires_at is not null),
  check(not public_opt_in or status='active'),
  check(reconsideration is null or (status='revoked' and accepted_at is not null))
);
create unique index ambassador_one_open on private.ambassador_cases(recipient_id)
  where status in ('proposed','invited','active','suspended');
create index ambassador_recipient_history on private.ambassador_cases(recipient_id,created_at desc,id);
create index ambassador_admin_queue on private.ambassador_cases(created_at desc,id desc);

create table private.ambassador_audit (
  case_id uuid not null references private.ambassador_cases(id) on delete restrict,
  version integer not null,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check(event in (
    'propose','invite','accept','decline','publish','withdraw','suspend','resume','revoke','expire','complete',
    'request_review','uphold','allow_new_invitation')),
  reason text check(reason is null or private.valid_trust_text(reason,10,1000)),
  created_at timestamptz not null default clock_timestamp(),
  primary key(case_id,version)
);
create index ambassador_audit_actor on private.ambassador_audit(actor_id,created_at desc);

alter table private.ambassador_cases enable row level security;
alter table private.ambassador_audit enable row level security;
revoke all on private.ambassador_cases,private.ambassador_audit from public,anon,authenticated,service_role;

create function private.ambassador_public_eligible(p_user uuid)
returns boolean language sql stable set search_path='' as $$
  select 'identity'=any(private.reviewed_personal_claims(p_user))
    and exists(select 1 from public.profiles p where p.user_id=p_user and feed_data.followable_member(p));
$$;

create function private.ambassador_admin()
returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not coalesce(private.platform_admin(actor),false) then raise exception 'access denied' using errcode='42501'; end if;
  if not feed_data.recent_feed_totp() then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return actor;
end;
$$;

create function private.ambassador_card(c private.ambassador_cases)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'version',c.version,'category',c.category,
    'status',case when c.status='invited' and c.invite_expires_at<=statement_timestamp() then 'expired' else c.status end,
    'createdAt',c.created_at,'updatedAt',c.updated_at,'expiresAt',c.invite_expires_at,
    'acceptedAt',c.accepted_at,'publicOptIn',c.public_opt_in,'statement',c.statement,
    'publicEligible',private.ambassador_public_eligible(c.recipient_id),'reconsideration',c.reconsideration,
    'canRequestReview',c.status='revoked' and c.accepted_at is not null and c.reconsideration is null
      and c.updated_at>statement_timestamp()-interval '14 days');
$$;

create function private.ambassador_admin_budget(actor uuid)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ambassador-admin:'||actor::text,0));
  if (select count(*) from private.ambassador_audit where actor_id=actor and created_at>now()-interval '1 day')>=30
  then raise exception 'program limit' using errcode='PFR29'; end if;
end;
$$;

create function public.ambassador_admin_list_for_client(p_handle text,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.ambassador_admin(); candidate uuid;
begin
  if (p_before is null)<>(p_before_id is null) or (p_handle is not null and p_handle !~ '^[a-z0-9][a-z0-9_]{2,23}$')
  then raise exception 'invalid search' using errcode='22023'; end if;
  if p_handle is not null then
    select user_id into candidate from public.profiles where username=p_handle;
  end if;
  return jsonb_build_object(
    'candidate',(select jsonb_build_object('username',p.username,'displayName',p.display_name,
      'eligible',p.user_id<>actor and private.institution_actor(p.user_id),
      'publicEligible',private.ambassador_public_eligible(p.user_id)) from public.profiles p where p.user_id=candidate),
    'cases',coalesce((select jsonb_agg(private.ambassador_card(c)||jsonb_build_object('username',p.username,
      'displayName',p.display_name,'history',(select coalesce(jsonb_agg(jsonb_build_object(
        'version',h.version,'event',h.event,'reason',h.reason,'actorId',h.actor_id,'createdAt',h.created_at)
        order by h.version desc),'[]') from (select * from private.ambassador_audit where case_id=c.id order by version desc limit 20) h))
      order by c.created_at desc,c.id desc) from (
        select x.* from private.ambassador_cases x where (p_handle is null or x.recipient_id=candidate)
          and (p_before is null or (x.created_at,x.id)<(p_before,p_before_id))
        order by x.created_at desc,x.id desc limit 21) c left join public.profiles p on p.user_id=c.recipient_id),'[]'));
end;
$$;

create function public.ambassador_propose_for_client(p_handle text,p_category text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.ambassador_admin(); recipient uuid; result uuid; expired record;
begin
  if p_category is null or p_category not in ('community','education','culture','technology','service')
    or not private.valid_trust_text(p_reason,10,1000)
  then raise exception 'invalid proposal' using errcode='22023'; end if;
  perform private.ambassador_admin_budget(actor);
  select user_id into recipient from public.profiles where username=p_handle and display_name is not null;
  if recipient is null or recipient=actor then raise exception 'candidate unavailable' using errcode='PAB04'; end if;
  perform 1 from auth.users where id=recipient for no key update;
  if not private.institution_actor(recipient) then raise exception 'candidate unavailable' using errcode='PAB04'; end if;
  if exists(select 1 from private.ambassador_cases where recipient_id=recipient and status='revoked'
    and accepted_at is not null and reconsideration is distinct from 'new_invitation')
  then raise exception 'new nomination unavailable' using errcode='PAB09'; end if;
  if exists(select 1 from private.ambassador_cases where recipient_id=recipient and status in ('declined','withdrawn')
    and updated_at>clock_timestamp()-interval '30 days')
  then raise exception 'recipient cooling-off period' using errcode='PAB09'; end if;
  for expired in update private.ambassador_cases set status='expired',version=version+1,updated_at=clock_timestamp()
    where recipient_id=recipient and status='invited' and invite_expires_at<=clock_timestamp() returning id,version
  loop
    insert into private.ambassador_audit(case_id,version,event) values(expired.id,expired.version,'expire');
  end loop;
  insert into private.ambassador_cases(recipient_id,category) values(recipient,p_category) returning id into result;
  insert into private.ambassador_audit(case_id,version,actor_id,event,reason)
    values(result,1,actor,'propose',btrim(p_reason));
  return result;
exception when unique_violation then raise exception 'open program case exists' using errcode='PAB09';
end;
$$;

create function public.ambassador_admin_action_for_client(p_id uuid,p_version integer,p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.ambassador_admin(); c private.ambassador_cases; next_status text;
begin
  if not private.valid_trust_text(p_reason,10,1000) or p_version is null or p_action is null
  then raise exception 'invalid decision' using errcode='22023'; end if;
  perform private.ambassador_admin_budget(actor);
  select * into c from private.ambassador_cases where id=p_id for update;
  if c.recipient_id is null or c.recipient_id=actor then raise exception 'case unavailable' using errcode='PAB04'; end if;
  if c.version<>p_version then raise exception 'case changed' using errcode='PAB09'; end if;
  next_status:=case
    when p_action='invite' and c.status='proposed' and private.institution_actor(c.recipient_id) then 'invited'
    when p_action='suspend' and c.status='active' then 'suspended'
    when p_action='resume' and c.status='suspended' and private.institution_actor(c.recipient_id) then 'active'
    when p_action='revoke' and (c.status in ('proposed','active','suspended')
      or (c.status='invited' and c.invite_expires_at>clock_timestamp())) then 'revoked'
    when p_action='complete' and c.status='active' then 'completed'
    when p_action in ('uphold','allow_new_invitation') and c.reconsideration='pending'
      and not exists(select 1 from private.ambassador_audit h where h.case_id=c.id and h.event='revoke' and h.actor_id=actor)
      then c.status end;
  if next_status is null then raise exception 'action unavailable' using errcode='PAB09'; end if;
  update private.ambassador_cases set status=next_status,version=version+1,updated_at=clock_timestamp(),
    invite_expires_at=case when p_action='invite' then clock_timestamp()+interval '14 days' else invite_expires_at end,
    public_opt_in=false,statement=case when p_action in ('revoke','complete') then null else statement end,
    reconsideration=case p_action when 'uphold' then 'upheld' when 'allow_new_invitation' then 'new_invitation' else reconsideration end
    where id=c.id;
  insert into private.ambassador_audit(case_id,version,actor_id,event,reason)
    values(c.id,c.version+1,actor,p_action,btrim(p_reason));
end;
$$;

create function public.ambassador_own_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.ambassador_card(c) order by c.created_at desc,c.id desc) from (
    select x.* from private.ambassador_cases x where x.recipient_id=auth.uid() and x.invite_expires_at is not null
    order by x.created_at desc,x.id desc limit 30) c),'[]');
end;
$$;

create function public.ambassador_member_action_for_client(p_id uuid,p_version integer,p_action text,p_publish boolean,p_statement text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c private.ambassador_cases; next_status text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_version is null or p_action is null then raise exception 'invalid action' using errcode='22023'; end if;
  select * into c from private.ambassador_cases where id=p_id and recipient_id=actor and invite_expires_at is not null for update;
  if not found then raise exception 'case unavailable' using errcode='PAB04'; end if;
  if c.version<>p_version then raise exception 'case changed' using errcode='PAB09'; end if;
  if c.status='invited' and c.invite_expires_at<=clock_timestamp() then raise exception 'invitation expired' using errcode='PAB04'; end if;
  if p_action='publish' then
    if p_publish is null or (p_statement is not null and not private.valid_trust_text(p_statement,1,500))
      then raise exception 'invalid publicity choice' using errcode='22023'; end if;
    if c.status<>'active' then raise exception 'action unavailable' using errcode='PAB09'; end if;
    if p_publish and not private.ambassador_public_eligible(actor) then raise exception 'public eligibility required' using errcode='PAB11'; end if;
    if p_publish=c.public_opt_in and (case when p_publish then btrim(p_statement) end) is not distinct from c.statement then return; end if;
  end if;
  if p_action='request_review' and not private.valid_trust_text(p_reason,10,1000)
    then raise exception 'invalid review request' using errcode='22023'; end if;
  next_status:=case
    when c.status='invited' and p_action='accept' then 'active'
    when c.status='invited' and p_action='decline' then 'declined'
    when c.status in ('active','suspended') and p_action='withdraw' then 'withdrawn'
    when c.status='active' and p_action='publish' then c.status
    when c.status='revoked' and p_action='request_review' and c.accepted_at is not null and c.reconsideration is null
      and c.updated_at>clock_timestamp()-interval '14 days' then c.status end;
  if next_status is null then raise exception 'action unavailable' using errcode='PAB09'; end if;
  update private.ambassador_cases set status=next_status,version=version+1,updated_at=clock_timestamp(),
    accepted_at=case when p_action='accept' then clock_timestamp() else accepted_at end,
    public_opt_in=(p_action='publish' and coalesce(p_publish,false)),
    statement=case when p_action='publish' and p_publish then btrim(p_statement) end,
    reconsideration=case when p_action='request_review' then 'pending' else reconsideration end
    where id=c.id;
  insert into private.ambassador_audit(case_id,version,actor_id,event,reason)
    values(c.id,c.version+1,actor,p_action,case when p_action='request_review' then btrim(p_reason) end);
end;
$$;

create function public.ambassador_directory_for_client(p_handle text,p_query text,p_category text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null and not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 20 or char_length(coalesce(p_query,''))>80
    or (p_category is not null and p_category not in ('community','education','culture','technology','service'))
    then raise exception 'invalid search' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('username',a.username,'displayName',a.display_name,
    'category',a.category,'statement',a.statement,
    'avatarPath',case when a.avatar_asset is not null then a.user_id::text||'/'||a.avatar_asset::text||'.webp' end)
    order by a.username) from (
      select p.username,p.display_name,p.user_id,p.avatar_asset,c.category,c.statement
      from private.ambassador_cases c join public.profiles p on p.user_id=c.recipient_id
      where c.status='active' and c.public_opt_in and private.ambassador_public_eligible(c.recipient_id)
        and (p_handle is null or p.username=p_handle)
        and (p_category is null or c.category=p_category)
        and (p_after is null or p.username>p_after)
        and (coalesce(p_query,'')='' or strpos(lower(p.username),lower(p_query))>0 or strpos(lower(p.display_name),lower(p_query))>0)
      order by p.username limit p_limit+1) a),'[]');
end;
$$;

revoke all on function private.ambassador_public_eligible(uuid),private.ambassador_admin(),
  private.ambassador_card(private.ambassador_cases),private.ambassador_admin_budget(uuid),
  public.ambassador_admin_list_for_client(text,timestamptz,uuid),public.ambassador_propose_for_client(text,text,text),
  public.ambassador_admin_action_for_client(uuid,integer,text,text),public.ambassador_own_for_client(),
  public.ambassador_member_action_for_client(uuid,integer,text,boolean,text,text),
  public.ambassador_directory_for_client(text,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ambassador_admin_list_for_client(text,timestamptz,uuid),
  public.ambassador_propose_for_client(text,text,text),public.ambassador_admin_action_for_client(uuid,integer,text,text),
  public.ambassador_own_for_client(),public.ambassador_member_action_for_client(uuid,integer,text,boolean,text,text) to authenticated;
grant execute on function public.ambassador_directory_for_client(text,text,text,text,integer) to anon,authenticated;

create function private.clear_deleted_ambassador_publicity()
returns trigger language plpgsql set search_path='' as $$
begin
  new.public_opt_in:=false;
  new.statement:=null;
  return new;
end;
$$;
revoke all on function private.clear_deleted_ambassador_publicity() from public,anon,authenticated,service_role;
create trigger clear_deleted_ambassador_publicity before update of recipient_id on private.ambassador_cases
  for each row when (old.recipient_id is not null and new.recipient_id is null)
  execute function private.clear_deleted_ambassador_publicity();
