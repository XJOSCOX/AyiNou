-- Separate, empty synthetic allowlist. No production export mode and no public Storage objects.
create table private.privacy_export_fixtures (
  subject_id uuid primary key references auth.users(id) on delete cascade
);

create table private.privacy_exports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  case_id uuid not null unique references private.privacy_cases(id) on delete restrict,
  subject_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  case_version integer not null check (case_version=1),
  policy_version integer not null default 1 check (policy_version=1),
  creation_key uuid not null,
  revocation_key uuid,
  state text not null default 'queued' check (state in ('queued','generating','available','failed_retryable','expired','revoked','cleaned')),
  attempt integer not null default 0 check (attempt between 0 and 5),
  fence uuid,
  lease_until timestamptz,
  source_digest bytea,
  category_counts jsonb,
  envelope bytea check (octet_length(envelope) between 30 and 262200),
  ciphertext_digest bytea,
  key_version integer check (key_version=1),
  downloads integer not null default 0 check (downloads between 0 and 3),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
  cleaned_at timestamptz,
  terminal_state text check (terminal_state in ('expired','revoked')),
  unique(subject_id,creation_key),
  unique(subject_id,revocation_key),
  check ((state='generating')=(fence is not null and lease_until is not null)),
  check (state<>'available' or (envelope is not null and key_version is not null
    and source_digest is not null and ciphertext_digest is not null)),
  check (envelope is null or state in ('available','revoked','expired')),
  check ((state='cleaned')=(cleaned_at is not null))
);
create index privacy_exports_cleanup on private.privacy_exports (subject_id,expires_at,id);

alter table private.privacy_export_fixtures enable row level security;
alter table private.privacy_exports enable row level security;
revoke all on private.privacy_export_fixtures,private.privacy_exports from public,anon,authenticated,service_role;

-- One MVCC snapshot. Explicit keys only. 101 is one sentinel beyond each repeatable category's
-- 100-record bound. The archive builder records truncation and never packages the sentinel row.
create function private.privacy_export_projection(p_subject uuid)
returns jsonb language sql stable set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'profile', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'locale',p.preferred_locale,'publicProfile',p.is_visible)) from public.profiles p where p.user_id=p_subject),'[]'::jsonb),
    'residence', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'countryCode',m.residence_country_code,'departmentCode',m.residence_department_code,
      'diasporaDepartmentCode',m.diaspora_department_code)) from public.member_private m where m.user_id=p_subject),'[]'::jsonb),
    'preferences',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'discoverable',s.discoverable,'showMembershipCategory',s.show_membership_category))
      from public.user_settings s where s.user_id=p_subject),'[]'::jsonb),
    'interests',coalesce((select pg_catalog.jsonb_agg(x.interest_code order by x.interest_code) from
      (select interest_code from public.member_interests where user_id=p_subject order by interest_code limit 101)x),'[]'::jsonb),
    'posts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'language',x.language,'visibility',x.visibility,'status',x.status,'createdAt',x.created_at) order by x.created_at desc,x.id desc) from
      (select id,language,visibility,status,created_at from feed_data.posts where author_id=p_subject
        and deleted_at is null and status in ('draft','published') and community_id is null order by created_at desc,id desc limit 101)x),'[]'::jsonb),
    'comments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'language',x.language,'createdAt',x.created_at) order by x.created_at desc,x.id desc) from
      (select c.id,c.language,c.created_at from feed_data.comments c join feed_data.posts p on p.id=c.post_id
        where c.author_id=p_subject and p.author_id=p_subject and p.deleted_at is null and p.status='published'
        and p.community_id is null and c.parent_id is null and c.status='published' and c.deleted_at is null
        order by c.created_at desc,c.id desc limit 101)x),'[]'::jsonb),
    'affiliations',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'type',x.affiliation_type,'directoryOptIn',x.listed) order by x.id) from
      (select id,affiliation_type,listed from private.organization_affiliations where user_id=p_subject
        and status='active' order by id limit 101)x),'[]'::jsonb),
    'privacyRequests',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'kind',x.kind,'state',x.state,'createdAt',x.created_at) order by x.created_at desc,x.id desc) from
      (select id,kind,state,created_at from private.privacy_cases where subject_id=p_subject
        order by created_at desc,id desc limit 101)x),'[]'::jsonb),
    'pollParticipation',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('hasParticipated',
      exists(select 1 from private.poll_ballots b where b.voter_id=p_subject)))
  )
$$;

create function private.require_privacy_export(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,p_sensitive boolean)
returns void language plpgsql stable set search_path='' as $$
begin
  perform private.require_privacy_intake(p_actor,p_session,p_aal2);
  if not exists(select 1 from private.privacy_export_fixtures where subject_id=p_actor) then
    raise exception using errcode='PT404', message='PRIVACY_EXPORT_DISABLED';
  end if;
  if p_sensitive and (
    not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,true),false)
    or p_totp is null or p_totp < extract(epoch from clock_timestamp())-900 or p_totp > extract(epoch from clock_timestamp())+30
  ) then raise exception using errcode='PT403',message='MFA_REQUIRED'; end if;
end;
$$;

create function private.privacy_export_summary(p_run private.privacy_exports,p_case_state text,p_session uuid)
returns jsonb language sql stable set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p_run.id,'state',case
    when p_run.state in ('cleaned','revoked','expired') then p_run.state
    when p_case_state<>'received' then 'revoked'
    when p_run.expires_at<=clock_timestamp() then 'expired'
    when p_run.state='generating' and p_run.lease_until<=clock_timestamp() then 'failed_retryable'
    else p_run.state end,'expiresAt',p_run.expires_at,'counts',case when p_run.state='available'
      and p_case_state='received' and p_run.expires_at>clock_timestamp() then p_run.category_counts end,'canDownload',
    p_run.state='available' and p_case_state='received' and p_run.expires_at>clock_timestamp()
    and p_run.session_id=p_session and p_run.downloads<3)
$$;

create function public.privacy_export_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_action text,p_case uuid default null,p_id uuid default null,p_key uuid default null,
  p_version integer default null,p_policy integer default null,p_fence uuid default null,p_envelope text default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='4s' as $$
declare
  run private.privacy_exports;
  c private.privacy_cases;
  snapshot jsonb;
  ciphertext bytea;
  inserted integer;
begin
  if p_action is null or p_action not in ('availability','status','start','finish','fail','read','release','revoke') then
    raise exception using errcode='PT400',message='INVALID_INPUT';
  end if;
  perform private.require_privacy_export(p_actor,p_session,p_aal2,p_totp,p_action not in ('availability','status'));
  if p_action='availability' then return '{"enabled":true}'::jsonb; end if;
  if p_id is not null then
    select e.case_id into p_case from private.privacy_exports e where e.id=p_id and e.subject_id=p_actor;
  end if;
  select * into c from private.privacy_cases where id=p_case and subject_id=p_actor and kind='export' for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  -- The shared case row fences an L3.2 withdrawal during generation or before release.
  -- Always lock the run after its case.
  select * into run from private.privacy_exports where case_id=c.id and subject_id=p_actor for update;
  perform private.require_privacy_export(p_actor,p_session,p_aal2,p_totp,p_action not in ('availability','status'));
  if p_action='status' then
    if run.id is null then return '{"state":"none","canDownload":false}'::jsonb; end if;
    return private.privacy_export_summary(run,c.state,p_session);
  end if;
  if p_action='revoke' then
    if run.id is null then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
    if p_key is null then raise exception using errcode='PT400',message='INVALID_INPUT'; end if;
    if run.revocation_key is distinct from p_key then
      if run.revocation_key is not null then raise exception using errcode='PT409',message='EXPORT_CONFLICT'; end if;
      update private.privacy_exports set revocation_key=p_key,
        state=case when state in ('expired','cleaned') then state else 'revoked' end,
        terminal_state=coalesce(terminal_state,'revoked'),fence=null,lease_until=null
        where id=run.id returning * into run;
    end if;
    return private.privacy_export_summary(run,c.state,p_session);
  end if;
  if c.state<>'received' or c.policy_context<>'unresolved' or
    (run.id is not null and (run.case_version<>c.version or run.policy_version<>1)) then
    raise exception using errcode='PT409',message='EXPORT_CONFLICT';
  end if;
  if p_action='start' then
    if p_version is distinct from c.version or p_policy is distinct from 1 or p_key is null then
      raise exception using errcode='PT409',message='EXPORT_CONFLICT';
    end if;
    if run.id is null then
      insert into private.privacy_exports(case_id,subject_id,session_id,case_version,creation_key)
        values(c.id,p_actor,p_session,c.version,p_key) on conflict (subject_id,creation_key) do nothing
        returning * into run;
      get diagnostics inserted=row_count;
      if inserted<>1 then raise exception using errcode='PT409',message='EXPORT_CONFLICT'; end if;
    elsif run.creation_key<>p_key or run.session_id<>p_session then
      raise exception using errcode='PT409',message='EXPORT_CONFLICT';
    end if;
    if run.expires_at<=clock_timestamp() or run.state in ('available','revoked','expired','cleaned') or
      (run.state='generating' and run.lease_until>clock_timestamp()) then
      return private.privacy_export_summary(run,c.state,p_session);
    end if;
    if run.attempt>=5 then raise exception using errcode='PT409',message='EXPORT_CONFLICT'; end if;
    snapshot:=private.privacy_export_projection(p_actor);
    update private.privacy_exports set state='generating',attempt=attempt+1,fence=pg_catalog.gen_random_uuid(),
      lease_until=clock_timestamp()+interval '30 seconds',source_digest=pg_catalog.sha256(pg_catalog.convert_to(snapshot::text,'UTF8')),
      category_counts=(select pg_catalog.jsonb_object_agg(k,pg_catalog.jsonb_array_length(v))
        from pg_catalog.jsonb_each(snapshot) as category(k,v))
      where id=run.id returning * into run;
    return private.privacy_export_summary(run,c.state,p_session) || pg_catalog.jsonb_build_object(
      'projection',snapshot,'fence',run.fence,'generatedAt',clock_timestamp());
  end if;
  if run.id is null or run.session_id<>p_session then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if run.expires_at<=clock_timestamp() then raise exception using errcode='PT410',message='EXPORT_EXPIRED'; end if;
  if p_action in ('finish','fail') then
    if run.state<>'generating' or run.fence is distinct from p_fence or run.lease_until<=clock_timestamp() then
      raise exception using errcode='PT409',message='EXPORT_CONFLICT';
    end if;
    if p_action='finish' and (p_envelope is null or length(p_envelope)>524400 or p_envelope !~ '^[0-9a-f]+$') then
      raise exception using errcode='PT400',message='INVALID_INPUT';
    end if;
    if p_action='finish' then ciphertext:=pg_catalog.decode(p_envelope,'hex'); end if;
    update private.privacy_exports set state=case when p_action='finish' then 'available' else 'failed_retryable' end,
      envelope=ciphertext,ciphertext_digest=pg_catalog.sha256(ciphertext),
      key_version=case when p_action='finish' then 1 end,fence=null,lease_until=null
      where id=run.id returning * into run;
    return private.privacy_export_summary(run,c.state,p_session);
  end if;
  if run.state<>'available' or run.downloads>=3 then raise exception using errcode='PT409',message='EXPORT_CONFLICT'; end if;
  snapshot:=private.privacy_export_projection(p_actor);
  if run.source_digest<>pg_catalog.sha256(pg_catalog.convert_to(snapshot::text,'UTF8')) then
    raise exception using errcode='PT409',message='EXPORT_CHANGED';
  end if;
  perform private.require_privacy_export(p_actor,p_session,p_aal2,p_totp,true);
  if run.expires_at<=clock_timestamp() then raise exception using errcode='PT410',message='EXPORT_EXPIRED'; end if;
  if p_action='read' then
    if run.ciphertext_digest<>pg_catalog.sha256(run.envelope) then
      update private.privacy_exports set state='failed_retryable',envelope=null,ciphertext_digest=null,key_version=null
        where id=run.id;
      return '{"corrupt":true}'::jsonb;
    end if;
    return pg_catalog.jsonb_build_object('envelope',pg_catalog.encode(run.envelope,'hex'),'keyVersion',run.key_version,'caseId',run.case_id);
  end if;
  update private.privacy_exports set downloads=downloads+1 where id=run.id;
  return '{"released":true}'::jsonb;
exception when unique_violation then
  raise exception using errcode='PT409',message='EXPORT_CONFLICT';
end;
$$;

-- Purge only ciphertext belonging to the verified synthetic subject. No user media or account data is touched.
create function public.privacy_export_cleanup_for_api(p_actor uuid,p_session uuid,p_aal2 boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  perform private.require_privacy_export(p_actor,p_session,p_aal2,null,false);
  with eligible as (
    select e.id,case when e.state='revoked' or c.state='withdrawn' then 'revoked' else 'expired' end as reason
    from private.privacy_exports e join private.privacy_cases c on c.id=e.case_id and c.subject_id=e.subject_id
    where e.subject_id=p_actor and e.state<>'cleaned'
      and (e.expires_at<=now() or e.state='revoked' or c.state='withdrawn')
      and (e.lease_until is null or e.lease_until<=now() or c.state='withdrawn')
    order by e.expires_at,e.id limit 8 for update of e skip locked
  )
  update private.privacy_exports e set state='cleaned',terminal_state=eligible.reason,envelope=null,
    source_digest=null,category_counts=null,ciphertext_digest=null,key_version=null,fence=null,lease_until=null,cleaned_at=clock_timestamp()
    from eligible where e.id=eligible.id and e.subject_id=p_actor;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on function private.privacy_export_projection(uuid),private.require_privacy_export(uuid,uuid,boolean,bigint,boolean),
  private.privacy_export_summary(private.privacy_exports,text,uuid),
  public.privacy_export_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid,uuid,integer,integer,uuid,text),
  public.privacy_export_cleanup_for_api(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.privacy_export_for_api(uuid,uuid,boolean,bigint,text,uuid,uuid,uuid,integer,integer,uuid,text),
  public.privacy_export_cleanup_for_api(uuid,uuid,boolean) to service_role;
