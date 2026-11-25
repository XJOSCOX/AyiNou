-- C1.1 has no hosted activation mechanism. Only the disposable test fixture opens this gate.
create table private.c11_intake_fixture (
  singleton boolean primary key check (singleton),
  enabled boolean not null check (enabled)
);

create type private.c11_need_status as enum ('draft', 'submitted', 'withdrawn');

create table private.c11_needs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references feed_data.communities(id),
  author_id uuid references auth.users(id) on delete set null,
  status private.c11_need_status not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  content jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index c11_needs_author on private.c11_needs(author_id, created_at desc, id desc);

-- Snapshots are case evidence. The receipt and action metadata carry no narrative.
create table private.c11_need_revisions (
  need_id uuid not null references private.c11_needs(id),
  community_id uuid not null references feed_data.communities(id),
  revision integer not null,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  fingerprint bytea not null,
  action text not null check (action in ('create', 'edit', 'submit', 'withdraw')),
  status private.c11_need_status not null,
  content jsonb not null,
  occurred_at timestamptz not null,
  primary key (need_id, revision),
  unique (actor_id, request_id)
);
create index c11_revisions_actor_time on private.c11_need_revisions(actor_id, occurred_at desc);

alter table private.c11_intake_fixture enable row level security;
alter table private.c11_needs enable row level security;
alter table private.c11_need_revisions enable row level security;
revoke all on private.c11_intake_fixture, private.c11_needs, private.c11_need_revisions
  from public, anon, authenticated, service_role;

create function private.c11_validate_content(p jsonb, p_complete boolean)
returns void language plpgsql set search_path='' as $$
declare ref jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or not (p ?& array['title','description','category','area','beneficiaries','references'])
    or p - array['title','description','category','area','beneficiaries','references'] <> '{}'::jsonb
    or jsonb_typeof(p->'title') is distinct from 'string'
    or char_length(btrim(p->>'title')) not between (case when p_complete then 5 else 1 end) and 100
    or p->>'title' ~ '[[:cntrl:]]'
    or jsonb_typeof(p->'description') is distinct from 'string'
    or char_length(btrim(p->>'description')) not between (case when p_complete then 20 else 0 end) and 3000
    or regexp_replace(p->>'description', E'[\t\r\n]', '', 'g') ~ '[[:cntrl:]]'
    or not coalesce((p->>'category') in ('education','healthcare','infrastructure','sanitation','environment','other'), false)
    or jsonb_typeof(p->'area') not in ('string','null')
    or (p->>'area' is not null and p->>'area' !~ '^[[:alpha:]][[:alpha:] .''’,-]{0,59}$')
    or jsonb_typeof(p->'beneficiaries') is distinct from 'string'
    or char_length(btrim(p->>'beneficiaries')) not between (case when p_complete then 3 else 0 end) and 200
    or p->>'beneficiaries' ~ '[[:cntrl:]]'
    or jsonb_typeof(p->'references') is distinct from 'array'
  then raise exception 'invalid need content' using errcode='23514'; end if;

  if jsonb_array_length(p->'references') > 4 then
    raise exception 'invalid references' using errcode='23514';
  end if;
  for ref in select value from jsonb_array_elements(p->'references') loop
    if jsonb_typeof(ref) is distinct from 'object'
      or not (ref ?& array['url','description']) or ref - array['url','description'] <> '{}'::jsonb
      or jsonb_typeof(ref->'url') is distinct from 'string'
      or char_length(ref->>'url') > 500
      or ref->>'url' !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[a-zA-Z0-9/_.~%-]*)?$'
      or ref->>'url' ~ '^https://([^/]+\.)?(localhost|local|internal|test|invalid|example|onion|lan|home|corp|arpa)(/|$)'
      or ref->>'url' ~* '%(0[0-9a-f]|1[0-9a-f]|7f|2f|5c)'
      or jsonb_typeof(ref->'description') is distinct from 'string'
      or char_length(ref->>'description') > 160 or ref->>'description' ~ '[[:cntrl:]]'
    then raise exception 'invalid reference' using errcode='23514'; end if;
  end loop;
  if (select count(distinct value->>'url') from jsonb_array_elements(p->'references')) <> jsonb_array_length(p->'references')
  then raise exception 'duplicate reference' using errcode='23514'; end if;
end
$$;

create function private.c11_need_json(n private.c11_needs, p_details boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',n.id,'communityId',n.community_id,'communitySlug',c.slug,
    'status',n.status,'revision',n.revision,'createdAt',n.created_at,'updatedAt',n.updated_at,
    'title',n.content->>'title','category',n.content->>'category')
    || case when p_details then jsonb_build_object('content',n.content,
      'history',(select jsonb_agg(jsonb_build_object('revision',r.revision,'status',r.status,'occurredAt',r.occurred_at)
          order by r.revision desc) from private.c11_need_revisions r where r.need_id=n.id))
      else '{}'::jsonb end
  from feed_data.communities c where c.id=n.community_id;
$$;

create function public.c11_needs_for_api(p_actor uuid, p_session uuid, p_aal2 boolean,
    p_action text, p_id uuid, p_community uuid, p_request uuid, p_expected integer,
    p_content jsonb, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n private.c11_needs;
  prior private.c11_need_revisions;
  fingerprint bytea;
  moment timestamptz;
  cursor_at timestamptz;
begin
  if not exists (select from private.c11_intake_fixture where enabled) then
    raise exception 'intake disabled' using errcode='C1101';
  end if;
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    or not coalesce(private.member_onboarding_access(p_actor),false) then
    raise exception 'member access denied' using errcode='42501';
  end if;
  if p_action in ('list','read') then
    if p_id is not null then
      select * into n from private.c11_needs where id=p_id and author_id=p_actor;
      if not found then raise exception 'need unavailable' using errcode='O2003'; end if;
      cursor_at:=n.created_at;
    end if;
    if p_action='read' then
      if p_id is null then raise exception 'need unavailable' using errcode='O2003'; end if;
      return private.c11_need_json(n,true);
    end if;
    return jsonb_build_object('communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,
          'name',coalesce(d.name,c.name,c.slug)) order by c.slug)
        from feed_data.community_memberships m join feed_data.communities c on c.id=m.community_id
        left join public.departments d on d.code=c.department_code where m.user_id=p_actor),'[]'::jsonb),
      'needs',coalesce((select jsonb_agg(private.c11_need_json(page,false) order by page.created_at desc,page.id desc)
        from (select * from private.c11_needs where author_id=p_actor
          and (p_id is null or (created_at,id)<(cursor_at,p_id)) order by created_at desc,id desc limit 21) page),'[]'::jsonb));
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
    select * into n from private.c11_needs where id=prior.need_id and author_id=p_actor;
    if not found then raise exception 'need unavailable' using errcode='O2003'; end if;
    return private.c11_need_json(n,true);
  end if;

  if p_action<>'create' then
    select * into n from private.c11_needs where id=p_id and author_id=p_actor for update;
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

revoke all on function private.c11_validate_content(jsonb,boolean),private.c11_need_json(private.c11_needs,boolean),
  public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)
  to service_role;
