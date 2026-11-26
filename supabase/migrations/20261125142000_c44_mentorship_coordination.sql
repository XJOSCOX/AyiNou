-- C4.4. Existing mentorship intake and every live stage remain closed.
create table private.c44_fixture (
  singleton boolean primary key default true check (singleton),
  selection_key bytea not null default extensions.gen_random_bytes(32)
);

create table private.c44_preparation (
  version integer primary key check (version > 0),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  reason text not null check (length(reason) between 10 and 500),
  settings jsonb not null,
  recorded_at timestamptz not null default statement_timestamp()
);

-- Only opted-in roles are indexed. This stores a topic code and an opaque profile FK.
create table private.c44_candidate_topics (
  profile uuid not null references private.c43_profiles(id) on delete cascade,
  role text not null check (role in ('mentor','mentee')),
  topic text not null,
  primary key (profile,topic)
);
create index c44_candidate_topic_page on private.c44_candidate_topics(role,topic,profile);

create table private.c44_dismissals (
  owner uuid not null references private.c43_profiles(id) on delete cascade,
  candidate uuid not null references private.c43_profiles(id) on delete cascade,
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (owner,candidate),
  check (owner <> candidate)
);
create index c44_dismissals_candidate on private.c44_dismissals(candidate);

create table private.c44_requests (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  mentor uuid not null references private.c43_profiles(id) on delete cascade,
  mentee uuid not null references private.c43_profiles(id) on delete cascade,
  mentor_version integer not null,
  mentee_version integer not null,
  introduction text not null check (length(introduction) between 0 and 400),
  state text not null default 'pending' check (state in ('pending','accepted','declined','withdrawn','expired','invalidated')),
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check (sender <> recipient and mentor <> mentee and expires_at > created_at)
);
create unique index c44_pending_pair on private.c44_requests(mentor,mentee) where state='pending';
create index c44_pair_history on private.c44_requests(mentor,mentee,created_at desc);
create index c44_requests_sender on private.c44_requests(sender,created_at desc,id);
create index c44_requests_recipient on private.c44_requests(recipient,created_at desc,id);
create index c44_request_capacity on private.c44_requests(mentor,id) where state='pending';

create table private.c44_relationships (
  id uuid primary key default gen_random_uuid(),
  request uuid not null unique references private.c44_requests(id) on delete cascade,
  mentor uuid not null references private.c43_profiles(id) on delete cascade,
  mentee uuid not null references private.c43_profiles(id) on delete cascade,
  state text not null default 'agreement_pending'
    check (state in ('agreement_pending','active','paused','completed','ended','safety_restricted')),
  version integer not null default 1,
  agreement_revision integer,
  active_revision integer,
  completion_actor uuid references auth.users(id) on delete set null,
  safety_restricted_at timestamptz,
  created_at timestamptz not null default statement_timestamp()
);
create unique index c44_open_relationship_pair on private.c44_relationships(mentor,mentee)
  where state in ('agreement_pending','active','paused','safety_restricted');
create index c44_relationship_mentor on private.c44_relationships(mentor,state,id);
create index c44_relationship_mentee on private.c44_relationships(mentee,state,id);

create table private.c44_agreements (
  relationship uuid not null references private.c44_relationships(id) on delete cascade,
  revision integer not null check (revision > 0),
  terms jsonb not null check (octet_length(terms::text) <= 4200),
  proposed_by uuid references auth.users(id) on delete set null,
  mentor_confirmed_at timestamptz,
  mentee_confirmed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (relationship,revision)
);

-- Coordination content is shared only with this relationship's participants.
create table private.c44_items (
  id uuid primary key default gen_random_uuid(),
  relationship uuid not null references private.c44_relationships(id) on delete cascade,
  kind text not null check (kind in ('objective','session','progress')),
  introduced_by uuid references auth.users(id) on delete set null,
  pending_by uuid references auth.users(id) on delete set null,
  objective uuid references private.c44_items(id) on delete cascade,
  version integer not null default 1,
  accepted jsonb check (octet_length(accepted::text) <= 1600),
  proposed jsonb check (octet_length(proposed::text) <= 1600),
  state text not null check (state in ('proposed','agreed','declined','cancelled','completion_pending','completed','recorded')),
  prior_state text,
  created_at timestamptz not null default statement_timestamp(),
  check ((kind='progress')=(objective is not null))
);
create index c44_items_relationship on private.c44_items(relationship,kind,created_at desc,id);
create index c44_items_objective on private.c44_items(objective) where objective is not null;

-- Events intentionally omit profile and agreement copies; item revisions are participant-scoped.
create table private.c44_events (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  request uuid references private.c44_requests(id) on delete cascade,
  relationship uuid references private.c44_relationships(id) on delete cascade,
  item uuid references private.c44_items(id) on delete cascade,
  action text not null,
  state text,
  version integer,
  correction jsonb,
  recorded_at timestamptz not null default statement_timestamp(),
  check (request is not null or relationship is not null)
);
create index c44_events_request on private.c44_events(request,id desc) where request is not null;
create index c44_events_relationship on private.c44_events(relationship,id desc) where relationship is not null;

create table private.c44_receipts (
  actor uuid not null references auth.users(id) on delete cascade,
  key uuid not null,
  fingerprint bytea not null,
  result jsonb not null,
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (actor,key)
);
create index c44_receipt_time on private.c44_receipts(actor,recorded_at desc);

create table private.c44_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users(id) on delete cascade,
  request uuid not null references private.c44_requests(id) on delete cascade,
  category text not null check (category in
    ('harassment','unwanted_contact','impersonation','misrepresentation','solicitation','exploitation','unsafe_activity','privacy')),
  explanation text not null check (length(explanation) between 10 and 1000),
  created_at timestamptz not null default statement_timestamp(),
  unique(reporter,request)
);

do $$
declare relation text;
begin
  foreach relation in array array['fixture','preparation','candidate_topics','dismissals','requests','relationships','agreements','items','events','receipts','reports'] loop
    execute format('alter table private.%I enable row level security','c44_'||relation);
    execute format('revoke all on table private.%I from public,anon,authenticated,authenticator,service_role','c44_'||relation);
  end loop;
end $$;

create function private.c44_index_topics() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from private.c44_fixture) then return null; end if;
  delete from private.c44_candidate_topics where profile=new.id;
  if new.discovery and new.participation_at is not null and not new.paused then
    insert into private.c44_candidate_topics(profile,role,topic)
    select new.id,new.role,topic from jsonb_array_elements_text(new.preferences->'topics') topic;
  end if;
  return null;
end $$;
create trigger c44_update_topic_index after insert or update of preferences,discovery,participation_at,paused
  on private.c43_profiles for each row execute function private.c44_index_topics();

insert into private.m23_capabilities(capability,high_impact,scopes) values ('mentorship_participate',true,'{}');

create function private.c44_settings() returns jsonb
language sql stable set search_path='' as $$
  select coalesce((select settings from private.c44_preparation order by version desc limit 1),
    '{"recommendationLimit":8,"senderDaily":3,"recipientDaily":3,"outstanding":3,"expiryDays":7,"cooldownDays":30,
      "capacity":4,"agreementWeeks":26,"sessionDays":60,"sessionMinutes":90,"considerations":["skills","timing","experience"],
      "safeguardingSince":"2026-01-01","safeguardingNotes":"","moderationNotes":""}'::jsonb)
$$;

create function private.c44_pair_safe(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
  select coalesce(a<>b and not feed_data.blocked_pair(a,b)
    and not exists(select from feed_data.member_mutes m where
      (m.actor_id=a and m.target_id=b) or (m.actor_id=b and m.target_id=a)),false)
$$;

create function private.c44_role_safe(profile private.c43_profiles, settings jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce((profile).adult_at is not null
    and (profile).participation_at is not null
    and (profile).safeguarding_at >= ((settings->>'safeguardingSince')::date::timestamp at time zone 'America/Port-au-Prince')
    and feed_data.author_active((profile).actor)
    and private.member_onboarding_access((profile).actor)
    and ((profile).role='mentee' or private.member_identity_verified((profile).actor))
    and not exists(select from private.m23_restrictions r where r.subject_id=(profile).actor
      and r.capability='mentorship_participate' and r.scope_kind='platform' and r.revoked_at is null
      and r.starts_at<=now() and (r.expires_at is null or r.expires_at>now())),false)
$$;

create function private.c44_available(profile private.c43_profiles, settings jsonb, catalog jsonb) returns boolean
language sql stable set search_path='' as $$
  select private.c44_role_safe(profile,settings)
    and not (profile).paused
    and coalesce(((profile).preferences->>'expiresOn')::date,
      (now() at time zone 'America/Port-au-Prince')::date)>=(now() at time zone 'America/Port-au-Prince')::date
    and private.c43_complete((profile).role,(profile).preferences)
    and private.c43_allowed((profile).role,(profile).preferences,catalog)
    and private.member_discoverable((profile).actor)
    and feed_data.f24_mode((profile).actor)<>'private'
    and not exists(select from private.c43_skills c
      left join private.c31_skills s on s.code=c.code
      where c.profile=(c44_available.profile).id and (s.code is null or s.status<>'active' or not(catalog->'skillCategories' ? s.category)))
$$;

create function private.c44_space(mentor private.c43_profiles, settings jsonb, excluded uuid default null)
returns boolean language sql stable set search_path='' as $$
  select coalesce((select count(*) from private.c44_relationships r
    where r.mentor=(c44_space.mentor).id and r.state in ('active','paused') and r.id is distinct from excluded)
    < least(((mentor).preferences->>'capacity')::integer,(settings->>'capacity')::integer),false)
$$;

create function private.c44_compare(mentor private.c43_profiles, mentee private.c43_profiles, settings jsonb)
returns jsonb language sql stable set search_path='' as $$
  with prefs as (
    select (mentor).preferences a,(mentee).preferences b
  ), fit as (
    select
      (a->'topics') ?| array(select jsonb_array_elements_text(b->'topics')) topic_fit,
      exists(select from jsonb_array_elements(a->'languages') x join jsonb_array_elements(b->'languages') y
        on x->>'code'=y->>'code') language_fit,
      exists(select from private.c43_skills ms join private.c43_skills ls using(code)
        where ms.profile=(mentor).id and ls.profile=(mentee).id) skill_fit,
      exists(select from private.c43_skills ms join private.c43_skills ls using(code)
        where ms.profile=(mentor).id and ls.profile=(mentee).id and
          array_position(array['beginner','intermediate','advanced'],ms.proficiency)>
          array_position(array['beginner','intermediate','advanced'],ls.proficiency)) skill_growth,
      (select count(distinct profile)<2 from private.c43_skills where profile in ((mentor).id,(mentee).id)) skill_missing,
      (a->>'mode'=b->>'mode' or 'hybrid' in (a->>'mode',b->>'mode')) mode_fit,
      ((a->>'mode' in ('remote','hybrid') and b->>'mode' in ('remote','hybrid')
          and 'worldwide_remote' in (a->>'geography',b->>'geography'))
        or (a->>'geography' in ('haiti_nationwide','haiti_departments') and b->>'geography' in ('haiti_nationwide','haiti_departments')
          and ('haiti_nationwide' in (a->>'geography',b->>'geography')
            or (a->'departments') ?| array(select jsonb_array_elements_text(b->'departments'))))
        or (a->'countries') ?| array(select jsonb_array_elements_text(b->'countries'))
        or (a->>'geography' in ('haiti_nationwide','haiti_departments') and b->'countries' ? 'HT')
        or (b->>'geography' in ('haiti_nationwide','haiti_departments') and a->'countries' ? 'HT')) geography_fit,
      least((a->>'weeklyHours')::int,(b->>'weeklyHours')::int)*60>=greatest((a->>'sessionMinutes')::int,(b->>'sessionMinutes')::int) available_fit,
      abs((a->>'sessionMinutes')::int-(b->>'sessionMinutes')::int)<=15 session_fit,
      abs((a->>'durationWeeks')::int-(b->>'durationWeeks')::int)<=4 duration_fit,
      case when a->>'experience' is null then null else (a->>'experience')::int>0 end experience_fit
    from prefs
  )
  select jsonb_build_object(
    'classification',case when not(topic_fit and language_fit and mode_fit and geography_fit) then 'additional'
      when (not(settings->'considerations' ? 'timing') or (available_fit and session_fit and duration_fit))
        and (not(settings->'considerations' ? 'skills') or skill_growth) then 'strong' else 'partial' end,
    'reasons',to_jsonb(array_remove(array[
      case when topic_fit then 'topicFit' else 'topicMismatch' end,
      case when language_fit then 'languageFit' else 'languageMismatch' end,
      case when not (settings->'considerations' ? 'skills') then null when skill_missing then 'skillMissing' when skill_growth then 'skillGrowth'
        when skill_fit then 'skillFit' else 'skillMismatch' end,
      case when mode_fit then 'modeFit' else 'modeMismatch' end,
      case when geography_fit then 'geographyFit' else 'geographyMismatch' end,
      case when settings->'considerations' ? 'timing' then
        case when available_fit and session_fit and duration_fit then 'timingFit' else 'timingMismatch' end end,
      case when not(settings->'considerations' ? 'experience') then null when experience_fit is null then 'experienceMissing' when experience_fit then 'experienceReported' end
    ],null)))
  from fit
$$;

create function private.c44_sign(payload jsonb,key bytea) returns text
language sql immutable set search_path='' as $$
  select encode(convert_to(payload::text,'UTF8'),'hex')||'.'||encode(extensions.hmac(convert_to(payload::text,'UTF8'),key,'sha256'),'hex')
$$;

create function private.c44_token(token text,key bytea) returns jsonb
language plpgsql immutable set search_path='' as $$
declare payload jsonb;
begin
  if token is null or length(token)>1800 or token !~ '^[0-9a-f]+\.[0-9a-f]{64}$' then return null; end if;
  payload:=convert_from(decode(split_part(token,'.',1),'hex'),'UTF8')::jsonb;
  if private.c44_sign(payload,key)=token then return payload; end if;
  return null;
exception when data_exception then return null;
end $$;

create function private.c44_candidates(owner private.c43_profiles, lane text, filters jsonb, cursor_token text,
  settings jsonb, catalog jsonb, signing_key bytea) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  page_size integer:=(settings->>'recommendationLimit')::integer;
  scope_hash text:=encode(extensions.digest(filters::text,'sha256'),'hex');
  cursor_data jsonb:=private.c44_token(cursor_token,signing_key);
  boundary uuid;
  steps int:=0;
  cohort_end uuid;
  cohort_more boolean;
  next_key text;
  matches jsonb;
  items jsonb;
begin
  if not private.c44_available(owner,settings,catalog)
    or (lane='discovery' and not (owner).discovery)
    or (lane='recommendations' and not (owner).recommendations)
  then return '{"state":"unavailable","items":[],"next":null}'; end if;
  if cursor_token is not null then
    if cursor_data is null or cursor_data->>'kind'<>'page' or cursor_data->>'owner'<>(owner).id::text
      or (cursor_data->>'version')::int<>(owner).version or cursor_data->>'lane'<>lane or cursor_data->>'scope'<>scope_hash
      or (cursor_data->>'until')::bigint < extract(epoch from now()) then
      raise exception 'cursor expired' using errcode='23514';
    end if;
    boundary:=(cursor_data->>'after')::uuid;
    steps:=(cursor_data->>'step')::int;
  end if;
  with cohort_ids as materialized (
    select distinct candidate.profile
    from jsonb_array_elements_text((owner).preferences->'topics') topic(code)
    cross join lateral (
      select t.profile from private.c44_candidate_topics t
      where t.role=case (owner).role when 'mentor' then 'mentee' else 'mentor' end and t.topic=topic.code
        and t.profile>coalesce(boundary,'00000000-0000-0000-0000-000000000000'::uuid)
      order by t.profile limit 129
    ) candidate
    where filters->>'topic' is null or topic.code=filters->>'topic'
    order by candidate.profile limit 129
  ), cohort as materialized (
    select c from (select profile from cohort_ids order by profile limit 128) candidate
    join private.c43_profiles c on c.id=candidate.profile
    where c.discovery and c.participation_at is not null and not c.paused
  ), eligible as materialized (
    select c,v.display_name,v.username from cohort
    join public.profiles v on v.user_id=(c).actor
    where (c).actor<>(owner).actor
      and ((c).preferences->'topics') ?| array(select jsonb_array_elements_text((owner).preferences->'topics'))
      and (filters->>'topic' is null or ((c).preferences->'topics') ? (filters->>'topic'))
      and (filters->>'mode' is null or (c).preferences->>'mode' in (filters->>'mode','hybrid'))
      and (filters->>'geography' is null or (c).preferences->>'geography'=filters->>'geography')
      and (filters->>'language' is null or exists(select from jsonb_array_elements((c).preferences->'languages') preference
        where preference->>'code'=filters->>'language'))
      and (filters->>'skill' is null or exists(select from private.c43_skills skill
        where skill.profile=(c).id and skill.code=filters->>'skill'))
      and not exists(select from private.c44_dismissals d where d.owner=(c44_candidates.owner).id and d.candidate=(c).id)
      and private.c44_available(c,settings,catalog) and private.c44_pair_safe((owner).actor,(c).actor)
      and feed_data.f24_identity(v,(owner).actor)
      and exists(select from public.profiles me where me.user_id=(owner).actor and feed_data.f24_identity(me,(c).actor))
      and private.c44_space(case when (owner).role='mentor' then owner else c end,settings)
  ), projected as materialized (
    select (c).id as id,
      jsonb_build_object('name',coalesce(nullif(display_name,''),username),'username',username,'role',(c).role,
        'identityVerified',(c).role='mentor',
        'selection',private.c44_sign(jsonb_build_object('kind','selection','owner',(owner).id,'version',(owner).version,
          'candidate',(c).id,'revision',(c).version,'until',floor(extract(epoch from now()+interval '15 minutes'))),signing_key),
        'canRequest',(owner).discovery and (owner).requests and (c).requests and (fit->>'classification')<>'additional')||fit as item
    from eligible
    cross join lateral (select private.c44_compare(
      case when (owner).role='mentor' then owner else c end,
      case when (owner).role='mentee' then owner else c end,settings) as fit offset 0) compare
    order by (c).id limit page_size+1
  )
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'item',item) order by id) from projected),'[]'),
    (select profile from cohort_ids order by profile limit 1 offset 127),
    (select count(*)>128 from cohort_ids)
  into matches,cohort_end,cohort_more;
  if jsonb_array_length(matches)>page_size then
    cohort_end:=(matches->(page_size-1)->>'id')::uuid;
  end if;
  if cohort_end is not null and steps<7 and (jsonb_array_length(matches)>page_size or cohort_more)
  then
    next_key:=private.c44_sign(jsonb_build_object('kind','page','owner',(owner).id,'version',(owner).version,
      'lane',lane,'scope',scope_hash,'after',cohort_end,'step',steps+1,
      'until',floor(extract(epoch from now()+interval '15 minutes'))),signing_key);
  end if;
  select coalesce(jsonb_agg(value->'item' order by n),'[]') into items
    from jsonb_array_elements(matches) with ordinality as entries(value,n) where n<=page_size;
  return jsonb_build_object('state','available','items',items,'next',next_key);
end $$;

create function private.c44_request_eligible(r private.c44_requests,settings jsonb,catalog jsonb) returns boolean
language sql stable set search_path='' as $$
  select coalesce(exists(select from private.c43_profiles m join private.c43_profiles n on n.id=(r).mentee
    join public.profiles mi on mi.user_id=m.actor join public.profiles ni on ni.user_id=n.actor
    where m.id=(r).mentor and m.role='mentor' and n.role='mentee'
      and m.version=(r).mentor_version and n.version=(r).mentee_version
      and m.discovery and n.discovery and m.requests and n.requests
      and private.c44_available(m,settings,catalog) and private.c44_available(n,settings,catalog)
      and private.c44_pair_safe(m.actor,n.actor)
      and feed_data.f24_identity(mi,n.actor) and feed_data.f24_identity(ni,m.actor)
      and private.c44_space(m,settings) and private.c44_compare(m,n,settings)->>'classification'<>'additional'),false)
$$;

create function private.c44_relationship_safe(r private.c44_relationships,settings jsonb) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c43_profiles m join private.c43_profiles n on n.id=(r).mentee
    where m.id=(r).mentor and private.c44_role_safe(m,settings) and private.c44_role_safe(n,settings)
      and private.c44_pair_safe(m.actor,n.actor))
$$;

create function private.c44_sync(request_id uuid,settings jsonb,catalog jsonb) returns void
language plpgsql set search_path='' as $$
declare req private.c44_requests; rel private.c44_relationships; next_state text;
begin
  select * into req from private.c44_requests where id=request_id for update;
  if not found then return; end if;
  if req.state='pending' then
    next_state:=case when req.expires_at<=now() then 'expired'
      when not private.c44_request_eligible(req,settings,catalog) then 'invalidated' else 'pending' end;
    if next_state<>'pending' then
      update private.c44_requests set state=next_state,version=version+1,introduction='' where id=req.id;
      insert into private.c44_events(request,action,state,version) values(req.id,'eligibility',next_state,req.version+1);
    end if;
  end if;
  select * into rel from private.c44_relationships where request=req.id for update;
  if found and rel.state in ('agreement_pending','active','paused') and not private.c44_relationship_safe(rel,settings) then
    update private.c44_relationships set state='safety_restricted',version=version+1,completion_actor=null,safety_restricted_at=statement_timestamp() where id=rel.id;
    insert into private.c44_events(relationship,action,state,version) values(rel.id,'eligibility','safety_restricted',rel.version+1);
  end if;
end $$;

create function private.c44_invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  snapshot jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  subject uuid:=(snapshot->>nullif(tg_argv[0],''))::uuid;
  other uuid:=(snapshot->>nullif(tg_argv[1],''))::uuid;
  request_id uuid;
  settings jsonb;
  catalog jsonb;
begin
  if not exists(select from private.c44_fixture) then return null; end if;
  settings:=private.c44_settings();
  catalog:=coalesce((select configuration from private.c43_settings),private.c43_defaults());
  -- Restrict maintenance to relevant open requests and relationships, never all profiles.
  for request_id in
    select q.id from private.c44_requests q
    where (subject is null or subject in(q.sender,q.recipient))
      and (other is null or other in(q.sender,q.recipient))
      and (q.state='pending' or exists(select from private.c44_relationships r
        where r.request=q.id and r.state in ('agreement_pending','active','paused')))
    order by q.id
  loop
    perform private.c44_sync(request_id,settings,catalog);
  end loop;
  return null;
end $$;

-- Deferred profile triggers see the final C4.3 skill and consent state in the transaction.
create constraint trigger c44_profile_change after update on private.c43_profiles
  deferrable initially deferred for each row execute function private.c44_invalidate('actor','');
create trigger c44_privacy_change after insert or update or delete on feed_data.profile_privacy
  for each row execute function private.c44_invalidate('user_id','');
create trigger c44_block_change after insert on feed_data.member_blocks
  for each row execute function private.c44_invalidate('actor_id','target_id');
create trigger c44_mute_change after insert on feed_data.member_mutes
  for each row execute function private.c44_invalidate('actor_id','target_id');
create trigger c44_standing_change after insert or update on private.account_restrictions
  for each row execute function private.c44_invalidate('user_id','');
create trigger c44_moderation_change after insert or update on private.m23_restrictions
  for each row when (new.capability='mentorship_participate') execute function private.c44_invalidate('subject_id','');
create trigger c44_identity_change after insert or update or delete on public.verification_records
  for each row execute function private.c44_invalidate('user_id','');
create trigger c44_founder_identity_change after update of state on private.founder_identity_cases
  for each row execute function private.c44_invalidate('subject_id','');
create trigger c44_founder_policy_change after insert or update or delete on private.fv_development_policies
  for each row execute function private.c44_invalidate('','');
create trigger c44_native_identity_change after update of is_visible on public.profiles
  for each row execute function private.c44_invalidate('user_id','');
create trigger c44_discoverable_change after insert or update of discoverable or delete on public.user_settings
  for each row execute function private.c44_invalidate('user_id','');
create trigger c44_catalog_change after update or delete on private.c31_skills
  for each row execute function private.c44_invalidate('','');
create trigger c44_profile_policy_change after insert or update on private.c43_settings
  for each row execute function private.c44_invalidate('','');
create trigger c44_staff_policy_change after update on private.member_experience_policy
  for each row execute function private.c44_invalidate('','');
create trigger c44_safety_policy_change after insert on private.c44_preparation
  for each row execute function private.c44_invalidate('','');

create function private.c44_request_view(q private.c44_requests, viewer uuid,settings jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',(q).id,'state',(q).state,'version',(q).version,
    'direction',case when viewer=(q).sender then 'sent' else 'received' end,
    'role',case when viewer=m.actor then 'mentor' else 'mentee' end,
    'createdAt',(q).created_at,'expiresAt',(q).expires_at,'relationship',r.id,
    'reported',exists(select from private.c44_reports f where f.reporter=viewer and f.request=(q).id),
    'peer',case when (q).state in ('pending','accepted') and private.c44_pair_safe(m.actor,n.actor)
      and (r.id is null or (r.safety_restricted_at is null and private.c44_relationship_safe(r,settings)))
      and feed_data.f24_identity(p,viewer) then jsonb_build_object('name',coalesce(nullif(p.display_name,''),p.username),
        'username',p.username,'identityVerified', p.user_id=m.actor and private.member_identity_verified(m.actor)) end,
    'introduction',case when (q).state='pending' then (q).introduction end)
  from private.c43_profiles m join private.c43_profiles n on n.id=(q).mentee
  join public.profiles p on p.user_id=case when viewer=m.actor then n.actor else m.actor end
  left join private.c44_relationships r on r.request=(q).id
  where m.id=(q).mentor and viewer in ((q).sender,(q).recipient)
$$;

create function private.c44_workspace(r private.c44_relationships, viewer uuid,settings jsonb,catalog jsonb)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',(r).id,'request',(r).request,'state',(r).state,'version',(r).version,
    'role',case when viewer=m.actor then 'mentor' else 'mentee' end,
    'limits',jsonb_build_object('agreementWeeks',settings->'agreementWeeks',
      'sessionDays',settings->'sessionDays','sessionMinutes',settings->'sessionMinutes','topics',catalog->'topics','modes',catalog->'modes'),
    'completion',case when (r).completion_actor is null then null when (r).completion_actor=viewer then 'mine' else 'peer' end,
    'reported',exists(select from private.c44_reports f where f.reporter=viewer and f.request=(r).request))
  || case when (r).safety_restricted_at is not null or not private.c44_relationship_safe(r,settings) then '{}'::jsonb
    else jsonb_build_object(
    'agreement',(select jsonb_build_object('revision',a.revision,'terms',a.terms,
      'mine',case when viewer=m.actor then a.mentor_confirmed_at is not null else a.mentee_confirmed_at is not null end,
      'peer',case when viewer=m.actor then a.mentee_confirmed_at is not null else a.mentor_confirmed_at is not null end)
      from private.c44_agreements a where a.relationship=(r).id and a.revision=(r).agreement_revision),
    'agreedTerms',(select a.terms from private.c44_agreements a
      where a.relationship=(r).id and a.revision=(r).active_revision),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'version',i.version,'state',i.state,
      'accepted',i.accepted,'proposed',i.proposed,'mine',i.pending_by=viewer,'objective',i.objective)
      order by i.created_at desc,i.id),'[]') from
        (select * from private.c44_items where relationship=(r).id order by created_at desc,id limit 120) i),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'state',e.state,'version',e.version,
      'at',e.recorded_at,'mine',e.actor=viewer,'item',e.item,'correction',e.correction) order by e.id desc),'[]')
      from (select * from private.c44_events where relationship=(r).id order by id desc limit 30) e)) end
  from private.c43_profiles m join private.c43_profiles n on n.id=(r).mentee
  where m.id=(r).mentor and viewer in (m.actor,n.actor)
$$;

create function private.c44_prepare(actor uuid,workspace uuid,payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  version_now integer;
  settings jsonb:=payload->'settings';
  bounds record;
begin
  perform pg_advisory_xact_lock(20261125,440);
  select coalesce(max(version),0) into version_now from private.c44_preparation;
  if payload - array['requestId','expectedVersion','confirmed','reason','settings']<>'{}'
    or payload->'confirmed' is distinct from 'true'::jsonb
    or not private.c43_text(payload->'reason',10,500)
    or not private.c43_number(payload->'expectedVersion',0,2147483646)
    or jsonb_typeof(settings) is distinct from 'object'
    or settings - array['recommendationLimit','senderDaily','recipientDaily','outstanding','expiryDays','cooldownDays',
      'capacity','agreementWeeks','sessionDays','sessionMinutes','considerations','safeguardingSince','safeguardingNotes','moderationNotes'] <>'{}'
    or not private.c43_strings(settings->'considerations','["skills","timing","experience"]'::jsonb,3)
    or not private.c43_text(settings->'safeguardingSince',10,10)
    or (settings->>'safeguardingSince') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (settings->>'safeguardingSince')::date<greatest('2026-01-01'::date,(private.c44_settings()->>'safeguardingSince')::date)
    or (settings->>'safeguardingSince')::date>current_date
    or not private.c43_text(settings->'safeguardingNotes',0,500)
    or not private.c43_text(settings->'moderationNotes',0,500)
  then raise exception 'invalid settings' using errcode='23514'; end if;
  for bounds in select * from (values
    ('recommendationLimit',1,12),('senderDaily',1,5),('recipientDaily',1,5),('outstanding',1,5),
    ('expiryDays',1,14),('cooldownDays',14,90),('capacity',1,8),
    ('agreementWeeks',1,52),('sessionDays',7,90),('sessionMinutes',15,120)
  ) v(key,minimum,maximum) loop
    if not private.c43_number(settings->bounds.key,bounds.minimum,bounds.maximum)
      then raise exception 'invalid limits' using errcode='23514'; end if;
  end loop;
  if version_now<>(payload->>'expectedVersion')::int then raise exception 'settings changed' using errcode='40001'; end if;
  insert into private.c44_preparation(version,actor,workspace,reason,settings)
    values(version_now+1,actor,workspace,trim(payload->>'reason'),settings);
  return jsonb_build_object('version',version_now+1);
end $$;

create function private.c44_start(actor uuid,payload jsonb,action text,key bytea,settings jsonb,catalog jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  selection jsonb:=private.c44_token(payload->>'selection',key);
  own private.c43_profiles; peer private.c43_profiles;
  mentor private.c43_profiles; mentee private.c43_profiles;
  q private.c44_requests;
  request_ref uuid;
  daily_at timestamptz:=now()-interval '24 hours';
begin
  if selection is null or selection->>'kind'<>'selection' or (selection->>'until')::bigint<extract(epoch from now())
    then raise exception 'selection unavailable' using errcode='42501'; end if;
  select * into own from private.c43_profiles where id=(selection->>'owner')::uuid and c43_profiles.actor=c44_start.actor;
  select * into peer from private.c43_profiles where id=(selection->>'candidate')::uuid;
  if own.id is null or peer.id is null or own.version<>(selection->>'version')::int
    or peer.version<>(selection->>'revision')::int or own.actor=peer.actor or own.role=peer.role
    or not(own.discovery and peer.discovery and private.c44_available(own,settings,catalog) and private.c44_available(peer,settings,catalog))
    or not private.c44_pair_safe(own.actor,peer.actor)
    or not exists(select from public.profiles p where p.user_id=peer.actor and feed_data.f24_identity(p,own.actor))
    or not exists(select from public.profiles p where p.user_id=own.actor and feed_data.f24_identity(p,peer.actor))
    then raise exception 'selection unavailable' using errcode='42501'; end if;

  if action='dismiss' then
    if payload - array['requestId','selection']<>'{}'
      then raise exception 'invalid dismissal' using errcode='23514'; end if;
    insert into private.c44_dismissals(owner,candidate) values(own.id,peer.id) on conflict do nothing;
    return '{"state":"dismissed"}';
  end if;

  if payload - array['requestId','selection','introduction']<>'{}' or not private.c43_text(payload->'introduction',0,400)
    then raise exception 'invalid introduction' using errcode='23514'; end if;
  mentor:=case when own.role='mentor' then own else peer end;
  mentee:=case when own.role='mentee' then own else peer end;
  -- Sorted participant locks serialize incoming, outgoing and outstanding limits in both directions.
  perform pg_advisory_xact_lock(hashtextextended('c44:'||least(own.actor,peer.actor)::text,0));
  perform pg_advisory_xact_lock(hashtextextended('c44:'||greatest(own.actor,peer.actor)::text,0));
  -- Re-read profile revisions after waiting on another coordination command.
  select * into mentor from private.c43_profiles where id=mentor.id for share;
  select * into mentee from private.c43_profiles where id=mentee.id for share;
  if mentor.version<>(case when own.role='mentor' then own.version else peer.version end)
    or mentee.version<>(case when own.role='mentee' then own.version else peer.version end)
    then raise exception 'selection unavailable' using errcode='42501'; end if;
  q.sender:=own.actor; q.recipient:=peer.actor; q.mentor:=mentor.id; q.mentee:=mentee.id;
  q.mentor_version:=mentor.version; q.mentee_version:=mentee.version;
  if not private.c44_request_eligible(q,settings,catalog) then raise exception 'selection unavailable' using errcode='42501'; end if;
  if exists(select from private.c44_relationships r where r.mentor=mentor.id and r.mentee=mentee.id
      and r.state in ('agreement_pending','active','paused','safety_restricted'))
    or exists(select from private.c44_requests r where r.mentor=mentor.id and r.mentee=mentee.id
      and ((r.state='pending' and r.expires_at>now()) or r.created_at>now()-make_interval(days=>(settings->>'cooldownDays')::int)))
    then raise exception 'repeat contact unavailable' using errcode='23505'; end if;
  if (select count(*) from private.c44_requests r where r.sender=own.actor and r.created_at>daily_at)>=(settings->>'senderDaily')::int
    or (select count(*) from private.c44_requests r where r.recipient=peer.actor and r.created_at>daily_at)>=(settings->>'recipientDaily')::int
    or (select count(*) from private.c44_requests r where r.sender=own.actor and r.state='pending' and r.expires_at>now())>=(settings->>'outstanding')::int
    then raise exception 'request limit reached' using errcode='23514'; end if;
  for request_ref in select r.id from private.c44_requests r where r.mentor=mentor.id and r.mentee=mentee.id and r.state='pending' loop
    perform private.c44_sync(request_ref,settings,catalog);
  end loop;
  insert into private.c44_requests(sender,recipient,mentor,mentee,mentor_version,mentee_version,introduction,expires_at)
    values(q.sender,q.recipient,q.mentor,q.mentee,q.mentor_version,q.mentee_version,trim(payload->>'introduction'),
      now()+make_interval(days=>(settings->>'expiryDays')::int)) returning id into request_ref;
  insert into private.c44_events(actor,request,action,state,version) values(actor,request_ref,'request','pending',1);
  return jsonb_build_object('id',request_ref,'state','pending','version',1);
end $$;

create function private.c44_request_command(q private.c44_requests,actor uuid,action text,payload jsonb,settings jsonb,catalog jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  next_state text;
  relationship_id uuid;
begin
  if action='report' then
    if payload - array['requestId','id','category','explanation']<>'{}'
      or coalesce(payload->>'category','') not in ('harassment','unwanted_contact','impersonation','misrepresentation',
        'solicitation','exploitation','unsafe_activity','privacy') or not private.c43_text(payload->'explanation',10,1000)
    then raise exception 'invalid report' using errcode='23514'; end if;
    if (select count(*) from private.c44_reports f where f.reporter=actor and f.created_at>now()-interval '24 hours')>=5
      then raise exception 'report limit reached' using errcode='23514'; end if;
    insert into private.c44_reports(reporter,request,category,explanation)
      values(actor,q.id,payload->>'category',trim(payload->>'explanation'));
    insert into private.c44_events(actor,request,action) values(actor,q.id,'report');
    return '{"state":"reported"}';
  end if;
  if payload - array['requestId','id','expectedVersion']<>'{}'
    or not private.c43_number(payload->'expectedVersion',1,2147483646)
    then raise exception 'invalid request change' using errcode='23514'; end if;
  if q.state<>'pending' or q.version<>(payload->>'expectedVersion')::int
    then raise exception 'request changed' using errcode='40001'; end if;
  if action='withdraw' and actor=q.sender then next_state:='withdrawn';
  elsif action='decline' and actor=q.recipient then next_state:='declined';
  elsif action='accept' and actor=q.recipient then
    if not private.c44_request_eligible(q,settings,catalog) then raise exception 'request unavailable' using errcode='42501'; end if;
    next_state:='accepted';
    insert into private.c44_relationships(request,mentor,mentee) values(q.id,q.mentor,q.mentee) returning id into relationship_id;
    insert into private.c44_events(actor,relationship,action,state,version)
      values(actor,relationship_id,'relationship','agreement_pending',1);
  else raise exception 'request unavailable' using errcode='42501'; end if;
  update private.c44_requests set state=next_state,version=version+1,introduction='' where id=q.id;
  insert into private.c44_events(actor,request,action,state,version) values(actor,q.id,action,next_state,q.version+1);
  return jsonb_build_object('id',q.id,'version',q.version+1,'state',next_state,'relationship',relationship_id);
end $$;

create function private.c44_agreement(r private.c44_relationships,actor uuid,is_mentor boolean,action text,
  payload jsonb,settings jsonb,catalog jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  terms jsonb:=payload->'terms';
  agreement private.c44_agreements;
  mentor private.c43_profiles;
  next_state text:=r.state;
  revision_number int:=coalesce(r.agreement_revision,0);
  agreed_revision int:=r.active_revision;
begin
  if r.state not in('agreement_pending','active','paused') then raise exception 'agreement unavailable' using errcode='42501'; end if;
  if action='propose_agreement' then
    if payload-array['requestId','id','expectedVersion','terms']<>'{}' or jsonb_typeof(terms) is distinct from 'object'
      or terms-array['title','objectives','weeks','frequency','minutes','mode','topics','expectations','free','safeguarding']<>'{}'
      or not private.c43_text(terms->'title',3,100) or not private.c43_text(terms->'objectives',3,750)
      or not private.c43_text(terms->'expectations',3,750)
      or not private.c43_number(terms->'weeks',1,least((settings->>'agreementWeeks')::int,(catalog->>'maxDurationWeeks')::int))
      or not private.c43_number(terms->'frequency',1,4)
      or not private.c43_number(terms->'minutes',15,least((settings->>'sessionMinutes')::int,(catalog->>'maxSessionMinutes')::int))
      or not coalesce(catalog->'modes' ? (terms->>'mode'),false)
      or not private.c43_strings(terms->'topics',catalog->'topics',8) or jsonb_array_length(terms->'topics')=0
      or terms->'free' is distinct from 'true'::jsonb or terms->'safeguarding' is distinct from 'true'::jsonb
    then raise exception 'invalid agreement' using errcode='23514'; end if;
    if revision_number>=30 then raise exception 'agreement limit reached' using errcode='23514'; end if;
    revision_number:=revision_number+1;
    insert into private.c44_agreements(relationship,revision,terms,proposed_by) values(r.id,revision_number,terms,actor);
  else
    if payload-array['requestId','id','expectedVersion','revision','confirmed']<>'{}'
      or payload->'confirmed' is distinct from 'true'::jsonb or not private.c43_number(payload->'revision',1,30)
      or revision_number<>(payload->>'revision')::int or agreed_revision=revision_number
      then raise exception 'agreement changed' using errcode='40001'; end if;
    select * into agreement from private.c44_agreements where relationship=r.id and c44_agreements.revision=revision_number;
    if not found then raise exception 'agreement unavailable' using errcode='42501'; end if;
    if ((is_mentor and agreement.mentor_confirmed_at is not null) or (not is_mentor and agreement.mentee_confirmed_at is not null))
    then raise exception 'already confirmed' using errcode='40001'; end if;
    if (is_mentor and agreement.mentee_confirmed_at is not null) or (not is_mentor and agreement.mentor_confirmed_at is not null) then
      if r.state='agreement_pending' then
        select * into mentor from private.c43_profiles where id=r.mentor for share;
        if not private.c44_space(mentor,settings,r.id)
          then raise exception 'mentor capacity unavailable' using errcode='40001'; end if;
        next_state:='active';
      end if;
      agreed_revision:=revision_number;
    end if;
    update private.c44_agreements set mentor_confirmed_at=case when is_mentor then now() else mentor_confirmed_at end,
      mentee_confirmed_at=case when not is_mentor then now() else mentee_confirmed_at end
    where relationship=r.id and c44_agreements.revision=revision_number;
  end if;
  update private.c44_relationships set state=next_state,version=version+1,
    agreement_revision=revision_number,active_revision=agreed_revision where id=r.id;
  insert into private.c44_events(actor,relationship,action,state,version) values(actor,r.id,action,next_state,r.version+1);
  if r.state='agreement_pending' and next_state='active' and not private.c44_space(mentor,settings) then
    with affected as (
      update private.c44_requests set state='invalidated',version=version+1,introduction=''
      where c44_requests.mentor=r.mentor and state='pending'
      returning id,version
    )
    insert into private.c44_events(request,action,state,version)
      select id,'eligibility','invalidated',version from affected;
  end if;
  return jsonb_build_object('id',r.id,'version',r.version+1,'state',next_state);
end $$;

create function private.c44_item_command(r private.c44_relationships,actor uuid,action text,payload jsonb,settings jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  item private.c44_items; objective_ref uuid; item_id uuid;
  kind text:=payload->>'kind';
  content jsonb:=payload->'content';
  next_state text;
  local_start timestamp;
  start_at timestamptz;
  original jsonb;
  item_version int;
  response jsonb;
begin
  if r.state<>'active' or r.active_revision is null then raise exception 'coordination unavailable' using errcode='42501'; end if;
  if action='propose_item' then
    if payload-array['requestId','id','expectedVersion','kind','item','itemVersion','objective','content']<>'{}'
      or kind is null or kind not in('objective','session','progress') or jsonb_typeof(content) is distinct from 'object'
    then raise exception 'invalid coordination item' using errcode='23514'; end if;
    if kind='session' then
      if content-array['localStart','timeZone','minutes','topic']<>'{}'
        or not private.c43_text(content->'topic',3,100)
        or not private.c43_text(content->'timeZone',1,64)
        or not exists(select from pg_timezone_names where name=content->>'timeZone')
        or not private.c43_text(content->'localStart',16,16)
        or content->>'localStart' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
        or not private.c43_number(content->'minutes',15,(settings->>'sessionMinutes')::int)
      then raise exception 'invalid session date or topic' using errcode='23514'; end if;
      local_start:=(content->>'localStart')::timestamp;
      start_at:=local_start at time zone (content->>'timeZone');
      if local_start<>start_at at time zone (content->>'timeZone')
        or start_at<=now() or start_at+make_interval(mins=>(content->>'minutes')::int)>now()+make_interval(days=>(settings->>'sessionDays')::int)
      then raise exception 'invalid session time' using errcode='23514'; end if;
      content:=content||jsonb_build_object('startsAt',start_at);
    elsif content-array['text']<>'{}' or not private.c43_text(content->'text',3,500)
    then raise exception 'invalid learning item' using errcode='23514'; end if;

    if payload->>'item' is not null then
      select * into item from private.c44_items where id=(payload->>'item')::uuid and relationship=r.id for update;
      if not found or item.kind<>kind or item.version<>(payload->>'itemVersion')::int
        or not private.c43_number(payload->'itemVersion',1,2147483646)
        or item.state not in ('agreed','proposed') or kind='progress' or item.version>=20
      then raise exception 'coordination item changed' using errcode='40001'; end if;
      original:=item.proposed;
      update private.c44_items set prior_state=case when accepted is not null then 'agreed' end,
        pending_by=actor,proposed=content,state='proposed',version=version+1 where id=item.id
        returning id,version,state into item_id,item_version,next_state;
    else
      if (select count(*) from private.c44_items where relationship=r.id)>=120
        then raise exception 'coordination limit reached' using errcode='23514'; end if;
      if kind='progress' then
        select id into objective_ref from private.c44_items where id=(payload->>'objective')::uuid and relationship=r.id
          and c44_items.kind='objective' and accepted is not null and state in ('agreed','proposed','completion_pending');
        if not found then raise exception 'objective unavailable' using errcode='42501'; end if;
      end if;
      next_state:=case when kind='progress' then 'recorded' else 'proposed' end;
      insert into private.c44_items(relationship,kind,introduced_by,pending_by,objective,proposed,accepted,state)
        values(r.id,kind,actor,case when kind<>'progress' then actor end,objective_ref,
          case when kind<>'progress' then content end,case when kind='progress' then content end,next_state)
        returning id,version into item_id,item_version;
    end if;
  else
    if payload-array['requestId','id','expectedVersion','item','itemVersion']<>'{}' or not private.c43_number(payload->'itemVersion',1,2147483646)
    then raise exception 'invalid item change' using errcode='23514'; end if;
    select * into item from private.c44_items where id=(payload->>'item')::uuid and relationship=r.id for update;
    if not found or item.version<>(payload->>'itemVersion')::int or item.kind='progress'
      then raise exception 'coordination item unavailable' using errcode='42501'; end if;
    if action in ('agree_item','decline_item') and item.state='proposed' and item.pending_by<>actor then
      if action='agree_item' and item.kind='session' and (item.proposed->>'startsAt')::timestamptz<=now()
        then raise exception 'session has already started' using errcode='23514'; end if;
      next_state:=case when action='agree_item' or item.accepted is not null then 'agreed' else 'declined' end;
    elsif action='cancel_item' and item.kind='session' and item.state in('proposed','agreed','completion_pending') then
      next_state:='cancelled';
    elsif action='complete_item' and item.state='agreed' then
      if item.kind='session' and (item.accepted->>'startsAt')::timestamptz
          +make_interval(mins=>(item.accepted->>'minutes')::int)>now()
      then raise exception 'session has not finished' using errcode='23514'; end if;
      next_state:='completion_pending';
    elsif action='complete_item' and item.state='completion_pending' and item.pending_by<>actor then
      next_state:='completed';
    else raise exception 'coordination item unavailable' using errcode='42501'; end if;
    original:=case when action in ('agree_item','decline_item','cancel_item') then coalesce(item.proposed,item.accepted) end;
    update private.c44_items set version=version+1,state=next_state,prior_state=null,
      accepted=case when action='agree_item' then proposed else accepted end,proposed=null,
      pending_by=case when next_state='completion_pending' then actor end
    where id=item.id returning id,version into item_id,item_version;
  end if;
  insert into private.c44_events(actor,relationship,item,action,state,version,correction)
    values(actor,r.id,item_id,action,next_state,item_version,original);
  response:=jsonb_build_object('id',item_id,'version',item_version,'state',next_state);
  return response;
end $$;

create function public.c44_coordination_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  settings jsonb:=private.c44_settings();
  catalog jsonb:=coalesce((select configuration from private.c43_settings),private.c43_defaults());
  signing_key bytea;
  q private.c44_requests;
  r private.c44_relationships;
  own private.c43_profiles;
  document jsonb;
  next_state text;
  target uuid;
  after_id uuid;
  after_time timestamptz;
  request_key uuid;
  fingerprint bytea;
  previous private.c44_receipts;
  item record;
  rows jsonb;
  coordinated boolean;
begin
  if p_action is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>12000
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'session unavailable' using errcode='42501'; end if;

  if p_action in('settings','configure') then
    if not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    if p_action='settings' and p_input='{}' then
      return jsonb_build_object('version',coalesce((select max(version) from private.c44_preparation),0),
        'settings',settings,'live',false,'stages',jsonb_build_object('intake',false,'matching',false,'discovery',false,'requests',false,'coordination',false),
        'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]')
          from (select version,reason,recorded_at as "recordedAt" from private.c44_preparation order by version desc limit 20) h));
    elsif p_action='settings' then raise exception 'invalid settings read' using errcode='23514'; end if;
  else
    if p_fixture and exists(select from private.c43_fixture) then select selection_key into signing_key from private.c44_fixture; end if;
    if signing_key is null then
      if p_action in('dashboard','recommendations','discovery') then return '{"state":"closed","items":[],"next":null}'; end if;
      raise exception 'mentorship unavailable' using errcode='42501';
    end if;
  end if;

  if p_action in('recommendations','discovery') then
    if p_input-array['role','topic','skill','mode','geography','language','cursor']<>'{}'
      or coalesce(p_input->>'role','') not in ('mentor','mentee')
    then raise exception 'invalid criteria' using errcode='23514'; end if;
    select * into own from private.c43_profiles where actor=p_actor and role=p_input->>'role';
    if not found then return '{"state":"unavailable","items":[],"next":null}'; end if;
    return private.c44_candidates(own,p_action,p_input-array['role','cursor'],p_input->>'cursor',settings,catalog,signing_key);
  end if;

  if p_action='dashboard' then
    if p_input-array['before']<>'{}' then raise exception 'invalid page' using errcode='23514'; end if;
    if p_input ? 'before' then
      select id,created_at into after_id,after_time from private.c44_requests
        where id=(p_input->>'before')::uuid and p_actor in(sender,recipient);
      if not found then raise exception 'page unavailable' using errcode='42501'; end if;
    end if;
    for item in select qx.id from private.c44_requests qx where p_actor in(qx.sender,qx.recipient)
      and (after_id is null or (qx.created_at,qx.id)<(after_time,after_id))
      order by qx.created_at desc,qx.id desc limit 21
    loop
      perform private.c44_sync(item.id,settings,catalog);
    end loop;
    select coalesce(jsonb_agg(private.c44_request_view(qx,p_actor,settings) order by qx.created_at desc,qx.id desc),'[]')
      into rows from (select * from private.c44_requests where p_actor in(sender,recipient)
        and (after_id is null or (created_at,id)<(after_time,after_id)) order by created_at desc,id desc limit 21) qx;
    return jsonb_build_object('state','available','items',rows-20,'next',case when jsonb_array_length(rows)>20 then rows->19->'id' end);
  end if;

  if p_action in('open_request','open_relationship','accept','decline','withdraw','report','propose_agreement',
    'confirm_agreement','pause','resume','end','complete','propose_item','agree_item','decline_item','cancel_item','complete_item')
  then
    target:=(p_input->>'id')::uuid;
    coordinated:=p_action not in('open_request','accept','decline','withdraw','report');
    if coordinated then
      select qx.* into q from private.c44_relationships rx join private.c44_requests qx on qx.id=rx.request
        where rx.id=target and p_actor in(qx.sender,qx.recipient);
    else
      select * into q from private.c44_requests where id=target and p_actor in(sender,recipient);
    end if;
    if q.id is null then raise exception 'coordination unavailable' using errcode='42501'; end if;
    if p_action not in ('open_request','open_relationship') then
      perform pg_advisory_xact_lock(hashtextextended('c44:'||least(q.sender,q.recipient)::text,0));
      perform pg_advisory_xact_lock(hashtextextended('c44:'||greatest(q.sender,q.recipient)::text,0));
    end if;
    perform private.c44_sync(q.id,settings,catalog);
    select * into q from private.c44_requests where id=q.id;
    if coordinated then select * into r from private.c44_relationships where id=target; end if;
    if p_action in('open_request','open_relationship') then
      if p_input-array['id']<>'{}' then raise exception 'invalid resource' using errcode='23514'; end if;
      if p_action='open_request' then return private.c44_request_view(q,p_actor,settings); end if;
      return private.c44_workspace(r,p_actor,settings,catalog);
    end if;
  end if;

  request_key:=(p_input->>'requestId')::uuid;
  if request_key is null then raise exception 'request receipt required' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('c44-receipt:'||p_actor::text||':'||request_key::text,0));
  if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'session unavailable' using errcode='42501'; end if;
  if p_action='configure' and not coalesce(private.platform_founder(p_actor) and private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    then raise exception 'Founder workspace required' using errcode='42501'; end if;
  fingerprint:=extensions.digest(jsonb_build_array(p_action,p_workspace,p_input)::text,'sha256');
  select * into previous from private.c44_receipts where actor=p_actor and key=request_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'receipt conflict' using errcode='23505'; end if;
    if coordinated and p_action<>'end' and (r.state='safety_restricted' or not private.c44_relationship_safe(r,settings))
      then raise exception 'coordination unavailable' using errcode='42501'; end if;
    return previous.result;
  end if;
  if p_action='configure' then
    document:=private.c44_prepare(p_actor,p_workspace,p_input);
  elsif p_action in('send','dismiss') then
    document:=private.c44_start(p_actor,p_input,p_action,signing_key,settings,catalog);
  elsif not coordinated and q.id is not null then
    document:=private.c44_request_command(q,p_actor,p_action,p_input,settings,catalog);
  elsif coordinated and r.id is not null then
    if not private.c43_number(p_input->'expectedVersion',1,2147483646)
      or r.version<>(p_input->>'expectedVersion')::int
      then raise exception 'relationship changed' using errcode='40001'; end if;
    if p_action<>'end' and not private.c44_relationship_safe(r,settings)
      then raise exception 'coordination unavailable' using errcode='42501'; end if;
    if p_action in('propose_agreement','confirm_agreement') then
      document:=private.c44_agreement(r,p_actor,
        (select actor=p_actor from private.c43_profiles where id=r.mentor),p_action,p_input,settings,catalog);
    elsif p_action in('propose_item','agree_item','decline_item','cancel_item','complete_item') then
      document:=private.c44_item_command(r,p_actor,p_action,p_input,settings);
    else
      if p_input-array['requestId','id','expectedVersion','confirmed']<>'{}'
        or p_input->'confirmed' is distinct from 'true'::jsonb
        then raise exception 'confirmation required' using errcode='23514'; end if;
      next_state:=case
        when p_action='end' and r.state not in('ended','completed') then 'ended'
        when p_action='pause' and r.state='active' then 'paused'
        when p_action='resume' and r.state='paused' then 'active'
        when p_action='complete' and r.state in('active','paused') and r.completion_actor<>p_actor then 'completed'
        when p_action='complete' and r.state in('active','paused') and r.completion_actor is null then r.state
        else null end;
      if next_state is null then raise exception 'relationship transition unavailable' using errcode='40001'; end if;
      update private.c44_relationships set state=next_state,version=version+1,
        completion_actor=case when p_action='complete' and next_state<>'completed' then p_actor end
        where id=r.id;
      insert into private.c44_events(actor,relationship,action,state,version)
        values(p_actor,r.id,p_action,next_state,r.version+1);
      document:=jsonb_build_object('id',r.id,'version',r.version+1,'state',next_state);
    end if;
  else raise exception 'unsupported command' using errcode='23514'; end if;

  insert into private.c44_receipts(actor,key,fingerprint,result) values(p_actor,request_key,fingerprint,document);
  return document;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format
  then raise exception 'invalid coordination input' using errcode='23514';
end $$;

revoke all on function public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c44_coordination_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb) to service_role;

do $$
declare signature text;
begin
  for signature in
    select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'c44\_%'
  loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated,authenticator,service_role';
  end loop;
end $$;

alter table feed_data.notifications add column mentorship_event bigint references private.c44_events(id) on delete cascade,
  add constraint c44_notification_shape check ((kind='mentorship_notice')=(mentorship_event is not null)
    and (mentorship_event is null or (actor_id is null and post_id is null and comment_id is null))),
  drop constraint notifications_kind_check,
  add constraint notifications_kind_check check(kind in (
    'post_reaction','post_comment','comment_reply','new_follower','appeal_decided','verification_decided',
    'verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated',
    'organization_access_changed','project_submitted','project_assigned','project_changes','project_approved',
    'project_rejected','project_operation','poll_event','post_mention','post_repost','post_quote','follow_requested',
    'follow_approved','event_notice','community_need_notice','need_project_notice','volunteer_recruitment',
    'opportunity_interest','mentorship_notice'));
create index c44_notification_event on feed_data.notifications(mentorship_event) where mentorship_event is not null;

create function private.c44_notice_visible(event_ref bigint,recipient uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from private.c44_fixture) and exists(select from private.c43_fixture)
    and feed_data.author_active(recipient) and exists(
    select from private.c44_events e
      left join private.c44_relationships r on r.id=e.relationship
      join private.c44_requests q on q.id=coalesce(e.request,r.request)
      where e.id=event_ref and recipient in(q.sender,q.recipient) and recipient<>e.actor
        and private.c44_pair_safe(q.sender,q.recipient)
        and q.state not in ('invalidated','expired')
        and (q.state<>'pending' or (q.expires_at>now() and private.c44_request_eligible(q,private.c44_settings(),
          coalesce((select configuration from private.c43_settings),private.c43_defaults()))))
        and (r.id is null or (r.safety_restricted_at is null and private.c44_relationship_safe(r,private.c44_settings()))))
$$;

create function private.c44_notify() returns trigger
language plpgsql set search_path='' as $$
declare receiver uuid; item_kind text;
begin
  if new.action in ('propose_item','agree_item','decline_item','cancel_item','complete_item') then
    select kind into item_kind from private.c44_items where id=new.item;
    if item_kind is distinct from 'session' then return new; end if;
  elsif new.action not in ('request','decline','accept','withdraw','propose_agreement','confirm_agreement','pause','resume','end','complete')
  then return new; end if;
  select case when q.sender=new.actor then q.recipient else q.sender end into receiver
  from private.c44_requests q where q.id=coalesce(new.request,(select request from private.c44_relationships where id=new.relationship));
  if receiver is not null and private.c44_notice_visible(new.id,receiver) then
    insert into feed_data.notifications(recipient_id,kind,mentorship_event,dedupe)
      values(receiver,'mentorship_notice',new.id,'mentorship:'||new.id::text)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end $$;
create trigger c44_notice after insert on private.c44_events for each row execute function private.c44_notify();

do $notices$
declare definition text; marker text:='    when n.kind=''opportunity_interest'' then';
begin
  select pg_get_functiondef('feed_data.notification_visible(feed_data.notifications)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'notification visibility source mismatch'; end if;
  execute replace(definition,marker,
    '    when n.kind=''mentorship_notice'' then private.c44_notice_visible(n.mentorship_event,n.recipient_id)'||chr(10)||marker);
  marker:='    || case when n.visible and n.kind=''volunteer_recruitment''';
  select pg_get_functiondef('public.notifications_for_client(integer,timestamptz,uuid)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'notification projection source mismatch'; end if;
  execute replace(definition,marker,
    '    || case when n.visible and n.kind=''mentorship_notice'' then jsonb_build_object(''mentorship'',('||
    'select jsonb_build_object(''id'',coalesce(e.relationship,e.request),''relationship'',e.relationship is not null,''action'',e.action)'||
    ' from private.c44_events e where e.id=n.mentorship_event)) else ''{}''::jsonb end'||chr(10)||marker);
end $notices$;
revoke all on function private.c44_notice_visible(bigint,uuid),private.c44_notify()
  from public,anon,authenticated,authenticator,service_role;

-- Report triage is case-scoped. Any later account sanction must go through native moderation and appeals.
alter table private.c44_reports add column reviewer uuid references auth.users(id) on delete set null,
  add column state text not null default 'open' check(state in ('open','assigned','referred','closed')),
  add column version integer not null default 1 check(version>0);
create index c44_reports_queue on private.c44_reports(state,created_at desc,id);
create index c44_reports_reviewer on private.c44_reports(reviewer,state,created_at desc,id);

create table private.c44_report_actions (
  report uuid not null references private.c44_reports(id) on delete cascade,
  version integer not null check(version>1),
  actor uuid references auth.users(id) on delete set null,
  workspace uuid not null,
  action text not null check(action in ('assign','refer','close')),
  reason text not null check(length(reason) between 10 and 500),
  recorded_at timestamptz not null default statement_timestamp(),
  primary key(report,version)
);
alter table private.c44_report_actions enable row level security;
revoke all on private.c44_report_actions from public,anon,authenticated,authenticator,service_role;

create function public.c44_reports_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='4s' as $$
declare
  founder boolean:=private.platform_founder(p_actor);
  report private.c44_reports;
  request private.c44_requests;
  reviewer_id uuid;
  receipt_key uuid;
  fingerprint bytea;
  receipt private.c44_receipts;
  summary jsonb;
  next_state text;
begin
  if not coalesce(private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
  then raise exception 'review workspace required' using errcode='42501'; end if;
  if p_action is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>4000
    then raise exception 'invalid report command' using errcode='23514'; end if;
  if not coalesce(p_fixture,false) or not exists(select from private.c44_fixture) or not exists(select from private.c43_fixture) then
    if p_action='list' then return '{"state":"closed","items":[]}'; end if;
    raise exception 'report review unavailable' using errcode='42501';
  end if;

  if p_action='list' and p_input='{}' then
    return jsonb_build_object('state','available','founder',founder,'items',coalesce((
      select jsonb_agg(to_jsonb(items) order by items."createdAt" desc,items.id) from (
        select r.id,r.state,r.version,r.created_at as "createdAt",r.reviewer=p_actor as assigned,p.username as reviewer
        from private.c44_reports r join private.c44_requests q on q.id=r.request
        left join public.profiles p on p.user_id=r.reviewer
        where p_actor not in(q.sender,q.recipient) and (founder or r.reviewer=p_actor)
        order by r.created_at desc,r.id limit 30
      ) items),'[]'));
  end if;
  select * into report from private.c44_reports r where r.id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'report unavailable' using errcode='42501'; end if;
  select * into request from private.c44_requests where id=report.request;
  if p_actor in(request.sender,request.recipient) or (p_action<>'assign' and report.reviewer is distinct from p_actor)
    then raise exception 'report unavailable' using errcode='42501'; end if;
  if p_action='open' and p_input-array['id']='{}' then
    return jsonb_build_object('id',report.id,'state',report.state,'version',report.version,
      'category',report.category,'explanation',report.explanation,'createdAt',report.created_at);
  end if;
  if p_action not in('assign','refer','close') or p_input-array['id','requestId','expectedVersion','reviewer','reason','confirmed']<>'{}'
    or p_input->'confirmed' is distinct from 'true'::jsonb or not private.c43_number(p_input->'expectedVersion',1,2147483646)
    or not private.c43_text(p_input->'reason',10,500)
  then raise exception 'invalid report command' using errcode='23514'; end if;
  receipt_key:=(p_input->>'requestId')::uuid;
  if receipt_key is null then raise exception 'receipt required' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('c44-receipt:'||p_actor::text||':'||receipt_key::text,0));
  fingerprint:=extensions.digest(jsonb_build_array('report_'||p_action,p_workspace,p_input)::text,'sha256');
  select * into receipt from private.c44_receipts where actor=p_actor and key=receipt_key;
  if found then
    if receipt.fingerprint<>fingerprint then raise exception 'receipt conflict' using errcode='23505'; end if;
    return receipt.result;
  end if;
  if report.version<>(p_input->>'expectedVersion')::int or report.state not in('open','assigned')
    then raise exception 'case changed' using errcode='40001'; end if;
  if p_action='assign' then
    if not founder or not private.c43_text(p_input->'reviewer',2,50)
      then raise exception 'report assignment unavailable' using errcode='42501'; end if;
    select p.user_id into reviewer_id from public.profiles p where lower(p.username)=lower(p_input->>'reviewer')
      and p.user_id not in(p_actor,request.sender,request.recipient) and private.platform_admin(p.user_id)
      and feed_data.author_active(p.user_id);
    if reviewer_id is null then raise exception 'report reviewer unavailable' using errcode='42501'; end if;
    next_state:='assigned';
  else
    if p_input ? 'reviewer' or report.state<>'assigned' then raise exception 'report unavailable' using errcode='42501'; end if;
    reviewer_id:=report.reviewer;
    next_state:=case when p_action='refer' then 'referred' else 'closed' end;
  end if;
  if not coalesce(private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
    or (p_action='assign' and not private.platform_founder(p_actor))
    then raise exception 'review workspace required' using errcode='42501'; end if;
  update private.c44_reports set state=next_state,reviewer=reviewer_id,version=version+1 where id=report.id;
  insert into private.c44_report_actions(report,version,actor,workspace,action,reason)
    values(report.id,report.version+1,p_actor,p_workspace,p_action,trim(p_input->>'reason'));
  summary:=jsonb_build_object('id',report.id,'state',next_state,'version',report.version+1);
  insert into private.c44_receipts(actor,key,fingerprint,result) values(p_actor,receipt_key,fingerprint,summary);
  return summary;
exception when invalid_text_representation then raise exception 'invalid report command' using errcode='23514';
end $$;
revoke all on function public.c44_reports_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.c44_reports_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb) to service_role;

