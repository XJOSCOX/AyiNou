create table private.organization_signup_choices (
  subject_id uuid primary key references auth.users(id) on delete cascade
);
create table private.organization_onboarding_intents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users(id) on delete cascade,
  pathway text not null check (pathway in ('organization','individual')),
  stage text not null check (stage in ('selected','drafting','awaiting_identity','cancelled')),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pathway='individual')=(stage='cancelled'))
);
create unique index organization_intent_one_open on private.organization_onboarding_intents(subject_id)
  where stage<>'cancelled';
create table private.organization_onboarding_receipts (
  subject_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  intent_id uuid not null references private.organization_onboarding_intents(id) on delete cascade,
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (subject_id,request_id)
);
create index organization_intent_receipt_recent on private.organization_onboarding_receipts(subject_id,created_at);

alter table private.organization_signup_choices enable row level security;
alter table private.organization_onboarding_intents enable row level security;
alter table private.organization_onboarding_receipts enable row level security;
revoke all on private.organization_signup_choices,private.organization_onboarding_intents,
  private.organization_onboarding_receipts from public,anon,authenticated,service_role;

-- Capture the signup hint once. Later user metadata changes cannot reopen an intent.
create function private.capture_organization_signup_choice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and not new.is_anonymous and new.raw_user_meta_data->>'signup_path'='organization' then
    insert into private.organization_signup_choices(subject_id) values(new.id);
  end if;
  if new.email_confirmed_at is not null and not new.is_anonymous then
    delete from private.organization_signup_choices where subject_id=new.id;
    if found then
      insert into private.organization_onboarding_intents(subject_id,pathway,stage)
        values(new.id,'organization','selected') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_organization_signup_choice() from public,anon,authenticated,service_role;
create trigger ayinou_capture_organization_signup_choice after insert or update of email_confirmed_at on auth.users
  for each row execute function private.capture_organization_signup_choice();

create function private.organization_intent_card(p private.organization_onboarding_intents)
returns jsonb language sql stable set search_path='' as $$
  select case when p.id is not null then jsonb_build_object('id',p.id,'pathway',p.pathway,
    'stage',p.stage,'version',p.version,'createdAt',p.created_at,'updatedAt',p.updated_at) end;
$$;
revoke all on function private.organization_intent_card(private.organization_onboarding_intents)
  from public,anon,authenticated,service_role;

create function public.organization_intent_for_api(p_actor uuid,p_session uuid,p_aal2 boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  return (select private.organization_intent_card(i) from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled');
end;
$$;

create function public.organization_intent_command_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,
  p_id uuid,p_action text,p_stage text,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  intent private.organization_onboarding_intents;
  receipt private.organization_onboarding_receipts;
  command jsonb := jsonb_build_object('id',p_id,'action',p_action,'stage',p_stage,'expected',p_expected);
  result jsonb;
begin
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  if p_expected is null or p_expected<0 or p_request is null
    or (p_id is null)<>(p_expected=0)
    or not coalesce((p_action='save' and p_stage in ('drafting','awaiting_identity'))
      or (p_action='cancel' and p_stage is null and p_id is not null),false)
  then raise exception 'invalid command' using errcode='23514'; end if;

  -- Institution creation and claim submission also take this actor lock.
  perform 1 from auth.users where id=p_actor for no key update;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='O2001'; end if;
  select * into receipt from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.request_id=p_request;
  if found then
    if receipt.command<>command then raise exception 'request conflict' using errcode='O2002'; end if;
    return receipt.result;
  end if;
  if (select count(*) from private.organization_onboarding_receipts r
    where r.subject_id=p_actor and r.created_at>now()-interval '1 day')>=60
  then raise exception 'command limit' using errcode='54000'; end if;

  if p_id is not null and not exists (select 1 from private.organization_onboarding_intents i
    where i.id=p_id and i.subject_id=p_actor)
  then raise exception 'intent unavailable' using errcode='O2003'; end if;
  select * into intent from private.organization_onboarding_intents i
    where i.subject_id=p_actor and i.stage<>'cancelled' for update;
  if intent.id is distinct from p_id or coalesce(intent.version,0)<>p_expected
  then raise exception 'stale intent' using errcode='O2004'; end if;

  if p_action='cancel' and (
    exists(select 1 from private.organization_memberships m
      where m.user_id=p_actor and m.role='owner' and m.revoked_at is null)
    or exists(select 1 from private.verification_applications a
      where a.applicant_id=p_actor and a.kind='claim' and a.status in ('pending','approved'))
  ) then raise exception 'protected dependency' using errcode='O2005'; end if;

  if intent.id is null then
    insert into private.organization_onboarding_intents(subject_id,pathway,stage)
      values(p_actor,'organization',p_stage) returning * into intent;
  else
    update private.organization_onboarding_intents i set
      pathway=case when p_action='cancel' then 'individual' else 'organization' end,
      stage=case when p_action='cancel' then 'cancelled' else p_stage end,
      version=i.version+1,updated_at=clock_timestamp() where i.id=intent.id returning * into intent;
  end if;
  result := jsonb_build_object('intent',private.organization_intent_card(intent),'requestId',p_request);
  insert into private.organization_onboarding_receipts(subject_id,request_id,intent_id,command,result)
    values(p_actor,p_request,intent.id,command,result);
  return result;
end;
$$;
revoke all on function public.organization_intent_for_api(uuid,uuid,boolean),
  public.organization_intent_command_for_api(uuid,uuid,boolean,uuid,text,text,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.organization_intent_for_api(uuid,uuid,boolean),
  public.organization_intent_command_for_api(uuid,uuid,boolean,uuid,text,text,integer,uuid) to service_role;
