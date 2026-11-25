-- C3.1 adds private, self-reported volunteer preferences. Only a disposable fixture can open intake.
create table private.c31_fixture (singleton boolean primary key check(singleton));
create table private.c31_settings (
  singleton boolean primary key check(singleton),
  version integer not null check(version>0),
  categories text[] not null,
  fields text[] not null
);
create table private.c31_skills (
  code text primary key check(code ~ '^[a-z][a-z0-9_]{2,39}$'),
  version integer not null check(version>0),
  category text not null,
  names jsonb not null,
  descriptions jsonb,
  aliases text[] not null,
  status text not null check(status in ('draft','active','retired'))
);
create table private.c31_catalog_terms (
  term text primary key,
  code text not null references private.c31_skills(code)
);
create index c31_catalog_terms_skill on private.c31_catalog_terms(code);
create table private.c31_profiles (
  actor uuid primary key references auth.users(id) on delete cascade,
  version integer not null check(version>0),
  summary text not null check(length(summary)<=500),
  languages jsonb not null check(jsonb_typeof(languages)='array' and jsonb_array_length(languages)<=9),
  mode text not null check(mode in ('remote','on_site','hybrid')),
  commitment text not null check(commitment in ('occasional','one_three','four_eight','nine_plus')),
  departments text[] not null,
  nationwide boolean not null check(not nationwide or cardinality(departments)=0),
  availability text not null check(availability in ('available','paused')),
  expires_on date
);
create table private.c31_selections (
  actor uuid references private.c31_profiles(actor) on delete cascade,
  code text references private.c31_skills(code),
  proficiency text not null check(proficiency in ('beginner','intermediate','advanced')),
  experience integer check(experience between 0 and 60),
  primary key(actor,code)
);
create index c31_selections_skill on private.c31_selections(code);
create table private.c31_consents (
  actor uuid primary key references private.c31_profiles(actor) on delete cascade,
  matching boolean not null,
  discovery boolean not null,
  profile_display boolean not null,
  recorded_at timestamptz not null default now()
);
-- The current receipt is sufficient for retries. Earlier versions always fail revision checks.
create table private.c31_owner_receipts (
  actor uuid primary key references private.c31_profiles(actor) on delete cascade,
  request uuid not null, fingerprint text not null, version integer not null
);
create table private.c31_admin_history (
  request uuid primary key, actor uuid references auth.users(id) on delete set null,
  workspace uuid not null, action text not null check(action in ('configure','define')),
  code text, version integer not null, reason text not null check(length(reason) between 10 and 500),
  fingerprint text not null, snapshot jsonb not null, recorded_at timestamptz not null default now()
);
create index c31_admin_history_recent on private.c31_admin_history(recorded_at desc);
do $$
declare relation text;
begin
  foreach relation in array array['fixture','settings','skills','catalog_terms','profiles','selections','consents','owner_receipts','admin_history'] loop
    execute format('alter table private.%I enable row level security','c31_'||relation);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role','c31_'||relation);
  end loop;
end $$;

create function private.c31_term(value text) returns text
language sql immutable set search_path='' as $$
  select trim(regexp_replace(translate(lower(normalize(value)),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),
    '[^[:alnum:]]+',' ','g'))
$$;

create function private.c31_labels(value jsonb, maximum integer) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)='object' then
    value ?& array['en','ht','fr','es'] and (select count(*)=4 and bool_and(jsonb_typeof(v)='string'
      and length(trim(v#>>'{}')) between 1 and maximum and (v#>>'{}') !~ '[[:cntrl:]]')
      from jsonb_each(value) t(k,v)) else false end
$$;

create function public.c31_volunteer_for_api(p_actor uuid,p_session uuid,p_aal2 boolean,p_totp bigint,
  p_workspace uuid,p_fixture boolean,p_lane text,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  department_codes constant text[] := array['HT-AR','HT-CE','HT-GA','HT-NI','HT-ND','HT-NE','HT-NO','HT-OU','HT-SD','HT-SE'];
  category_codes constant text[] := array['education','healthcare','engineering','agriculture','environment','technology',
    'business','finance','administration','community','logistics','communications','arts','trades','languages'];
  field_codes constant text[] := array['summary','experience','languages'];
  levels constant text[] := array['beginner','intermediate','advanced'];
  language_codes constant text[] := array['ht','fr','en','es','pt','de','ar','zh','asl'];
  s private.c31_settings; profile private.c31_profiles; skill private.c31_skills;
  owner_receipt private.c31_owner_receipts; admin_receipt private.c31_admin_history;
  consents jsonb; selections jsonb; catalog jsonb; config jsonb; view_profile jsonb; details jsonb; item jsonb;
  consent private.c31_consents;
  code_input text; reason_input text; expected integer; request_key uuid; signature text; saved_version integer;
  intake boolean; eligible boolean; allowed_keys text[]; values_input text[]; fields_input text[]; expires date;
begin
  if p_lane is null or p_action is null or p_lane not in ('owner','founder') or not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
    then raise exception 'member session required' using errcode='42501'; end if;
  if p_action <> 'read' then
    perform private.s2b_lock_actor(p_actor,p_session);
    if not coalesce(public.account_session_for_api(p_actor,p_session,p_aal2,false),false)
      then raise exception 'member session required' using errcode='42501'; end if;
  end if;
  eligible := coalesce(private.member_onboarding_access(p_actor) and feed_data.author_active(p_actor),false);
  if p_lane='founder' then
    if not (eligible and coalesce(private.platform_founder(p_actor) and
      private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false))
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
  end if;
  intake := coalesce(p_fixture,false) and exists(select from private.c31_fixture);
  select * into s from private.c31_settings;
  config:=jsonb_build_object('version',coalesce(s.version,0),'categories',coalesce(s.categories,category_codes),
    'fields',coalesce(s.fields,field_codes));
  if p_lane='owner' then select * into profile from private.c31_profiles where actor=p_actor; end if;
  if p_action='read' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.category,c.code),'[]') into catalog
      from private.c31_skills c
      where p_lane='founder' or (intake and c.status='active' and c.category=any(coalesce(s.categories,category_codes)))
        or exists(select from private.c31_selections v where v.actor=p_actor and v.code=c.code);
    if p_lane='founder' then return jsonb_build_object('settings',config,'catalog',catalog,'history',
      (select coalesce(jsonb_agg(to_jsonb(h) order by h.at desc),'[]') from
        (select action,code,version,reason,recorded_at as at from private.c31_admin_history order by recorded_at desc limit 30) h));
    end if;
    select * into consent from private.c31_consents where actor=p_actor;
    select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'proficiency',v.proficiency,'experience',v.experience) order by v.code),'[]')
      into selections from private.c31_selections v where v.actor=p_actor;
    if profile.actor is not null then
      view_profile:=jsonb_build_object('version',profile.version,'summary',profile.summary,'skills',selections,
        'languages',profile.languages,'mode',profile.mode,'commitment',profile.commitment,'departments',profile.departments,
        'nationwide',profile.nationwide,'availability',profile.availability,'expiresOn',profile.expires_on,
        'consent',jsonb_build_object('matching',consent.matching,'discovery',consent.discovery,'profileDisplay',consent.profile_display));
    end if;
    return jsonb_build_object('intake',intake and eligible,'profile',view_profile,'settings',config,'catalog',catalog,'status',
      case when profile.actor is null or selections='[]' then 'incomplete'
        when profile.expires_on < (now() at time zone 'America/Port-au-Prince')::date then 'expired'
        when profile.availability='paused' or not intake or not eligible then 'unavailable' else 'available' end);
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number'
    or coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$' or (p_input->>'expectedVersion')::numeric > 2147483646
    or jsonb_typeof(p_input->'requestId') is distinct from 'string'
    then raise exception 'invalid receipt' using errcode='23514'; end if;
  expected:=(p_input->>'expectedVersion')::integer;
  request_key:=(p_input->>'requestId')::uuid;
  signature:=md5(jsonb_build_array(p_action,p_input)::text);
  if p_lane='founder' then
    perform pg_advisory_xact_lock(20261125,310);
    if not coalesce(private.m24_staff(p_actor,p_session,p_aal2,p_totp,p_workspace,'admin'),false)
      then raise exception 'Founder workspace required' using errcode='42501'; end if;
    select * into admin_receipt from private.c31_admin_history where request=request_key;
    if found then
      if admin_receipt.actor is distinct from p_actor or admin_receipt.workspace is distinct from p_workspace
        or admin_receipt.fingerprint<>signature then raise exception 'request conflict' using errcode='55000'; end if;
      return jsonb_build_object('version',admin_receipt.version);
    end if;
    reason_input:=trim(p_input->>'reason');
    if p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'reason') is distinct from 'string'
      or length(reason_input) not between 10 and 500 or reason_input ~ '[[:cntrl:]]'
      then raise exception 'confirmation required' using errcode='23514'; end if;
    if p_action='configure' then
      allowed_keys:=array['expectedVersion','requestId','confirmed','reason','categories','fields'];
      if p_input-allowed_keys<>'{}' or jsonb_typeof(p_input->'categories') is distinct from 'array'
        or jsonb_typeof(p_input->'fields') is distinct from 'array'
        then raise exception 'invalid configuration' using errcode='23514'; end if;
      select * into s from private.c31_settings;
      if expected<>coalesce(s.version,0) then raise exception 'revision conflict' using errcode='55000'; end if;
      values_input:=array(select jsonb_array_elements_text(p_input->'categories'));
      fields_input:=array(select jsonb_array_elements_text(p_input->'fields'));
      if not (values_input <@ category_codes and fields_input <@ field_codes)
        or cardinality(values_input)<>(select count(distinct x) from unnest(values_input) x)
        or cardinality(fields_input)<>(select count(distinct x) from unnest(fields_input) x)
        then raise exception 'invalid configuration' using errcode='23514'; end if;
      insert into private.c31_settings values(true,expected+1,values_input,fields_input)
        on conflict(singleton) do update set version=excluded.version,categories=excluded.categories,fields=excluded.fields;
      details:=jsonb_build_object('categories',values_input,'fields',fields_input);
    elsif p_action='define' then
      allowed_keys:=array['expectedVersion','requestId','confirmed','reason','code','category','names','descriptions','aliases','status'];
      code_input:=p_input->>'code';
      if p_input-allowed_keys<>'{}' or coalesce(code_input,'') !~ '^[a-z][a-z0-9_]{2,39}$'
        or not coalesce((p_input->>'category')=any(category_codes),false)
        or not coalesce((p_input->>'status') in ('draft','active','retired'),false)
        or not private.c31_labels(p_input->'names',80)
        or (p_input->'descriptions' is distinct from 'null'::jsonb and not private.c31_labels(p_input->'descriptions',240))
        or jsonb_typeof(p_input->'aliases') is distinct from 'array'
        then raise exception 'invalid skill' using errcode='23514'; end if;
      if jsonb_array_length(p_input->'aliases')>12 or exists(select from jsonb_array_elements(p_input->'aliases') alias
        where jsonb_typeof(alias)<>'string' or length(trim(alias#>>'{}')) not between 2 and 80 or (alias#>>'{}') ~ '[[:cntrl:]]'
        or private.c31_term(alias#>>'{}')='')
        then raise exception 'invalid aliases' using errcode='23514'; end if;
      select * into skill from private.c31_skills where code=code_input;
      if expected<>coalesce(skill.version,0) then raise exception 'revision conflict' using errcode='55000'; end if;
      values_input:=array(select jsonb_array_elements_text(p_input->'aliases'));
      if cardinality(values_input)<>(select count(distinct private.c31_term(x)) from unnest(values_input) x)
        or exists(select from jsonb_each_text(p_input->'names') n where private.c31_term(n.value)='')
        then raise exception 'duplicate or invalid terms' using errcode='23514'; end if;
      if expected=0 and (select count(*) from private.c31_skills)>=500
        then raise exception 'catalog limit' using errcode='54000'; end if;
      insert into private.c31_skills values(code_input,expected+1,p_input->>'category',p_input->'names',
        nullif(p_input->'descriptions','null'::jsonb),values_input,p_input->>'status')
        on conflict(code) do update set version=excluded.version,category=excluded.category,names=excluded.names,
          descriptions=excluded.descriptions,aliases=excluded.aliases,status=excluded.status;
      if exists(select from private.c31_catalog_terms t where t.code<>code_input and t.term in
        (select private.c31_term(x) from unnest(values_input || array(select value from jsonb_each_text(p_input->'names'))) x))
        then raise exception 'catalog term conflict' using errcode='23505'; end if;
      -- Retain the reserved terms of prior revisions so aliases cannot be reassigned to another skill.
      insert into private.c31_catalog_terms(term,code)
        select distinct private.c31_term(x),code_input from unnest(values_input ||
          array(select value from jsonb_each_text(p_input->'names'))) x
        on conflict(term) do nothing;
      details:=p_input-array['expectedVersion','requestId','confirmed','reason'];
    else raise exception 'unsupported action' using errcode='42501'; end if;
    insert into private.c31_admin_history(request,actor,workspace,action,code,version,reason,fingerprint,snapshot)
      values(request_key,p_actor,p_workspace,p_action,code_input,expected+1,reason_input,signature,details);
    return jsonb_build_object('version',expected+1);
  end if;

  select * into owner_receipt from private.c31_owner_receipts where actor=p_actor;
  if owner_receipt.request=request_key then
    if owner_receipt.fingerprint<>signature then raise exception 'request conflict' using errcode='55000'; end if;
    return jsonb_build_object('version',owner_receipt.version);
  end if;
  if expected<>coalesce(profile.version,0) then raise exception 'revision conflict' using errcode='55000'; end if;
  if p_action in ('pause','withdraw') then
    if profile.actor is null or p_input-array['expectedVersion','requestId','consentKey']<>'{}'
      or (p_input ? 'consentKey' and (p_action='pause' or not coalesce((p_input->>'consentKey') in ('matching','discovery','profileDisplay'),false)))
      then raise exception 'profile required' using errcode='23514'; end if;
    update private.c31_profiles set version=expected+1,
      availability=case when p_action='pause' then 'paused' else availability end where actor=p_actor;
    if p_action='withdraw' then update private.c31_consents set
      matching=matching and coalesce((p_input->>'consentKey')<>'matching',false),
      discovery=discovery and coalesce((p_input->>'consentKey')<>'discovery',false),
      profile_display=profile_display and coalesce((p_input->>'consentKey')<>'profileDisplay',false),
      recorded_at=now() where actor=p_actor; end if;
  elsif p_action='save' then
    if not (intake and eligible) then raise exception 'volunteer intake closed' using errcode='42501'; end if;
    -- Serialize validation against catalog changes so a selection cannot race retirement.
    perform pg_advisory_xact_lock_shared(20261125,310);
    select * into s from private.c31_settings;
    if p_input-array['expectedVersion','requestId','summary','skills','languages','mode','commitment','departments',
        'nationwide','availability','expiresOn','consent']<>'{}'
      or jsonb_typeof(p_input->'summary') is distinct from 'string' or length(p_input->>'summary')>500
      or (p_input->>'summary') ~ '[[:cntrl:]]'
      or not coalesce((p_input->>'mode') in ('remote','on_site','hybrid'),false)
      or not coalesce((p_input->>'commitment') in ('occasional','one_three','four_eight','nine_plus'),false)
      or not coalesce((p_input->>'availability') in ('available','paused'),false)
      or jsonb_typeof(p_input->'nationwide') is distinct from 'boolean'
      or jsonb_typeof(p_input->'departments') is distinct from 'array'
      or jsonb_typeof(p_input->'skills') is distinct from 'array'
      or jsonb_typeof(p_input->'languages') is distinct from 'array'
      or jsonb_typeof(p_input->'consent') is distinct from 'object'
      or p_input->'expiresOn' is null
      then raise exception 'invalid profile' using errcode='23514'; end if;
    values_input:=array(select jsonb_array_elements_text(p_input->'departments'));
    if not (values_input <@ department_codes) or cardinality(values_input)<>(select count(distinct x) from unnest(values_input) x)
      or ((p_input->>'nationwide')::boolean and cardinality(values_input)>0)
      then raise exception 'invalid departments' using errcode='23514'; end if;
    if p_input->'expiresOn'<>'null'::jsonb then
      if coalesce(p_input->>'expiresOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then raise exception 'invalid expiration' using errcode='23514'; end if;
      begin expires:=(p_input->>'expiresOn')::date;
      exception when datetime_field_overflow or invalid_datetime_format then
        raise exception 'invalid expiration' using errcode='23514';
      end;
      if expires>(now() at time zone 'America/Port-au-Prince')::date+730
        then raise exception 'invalid expiration' using errcode='23514'; end if;
    end if;
    selections:=p_input->'skills';
    if jsonb_array_length(selections)>20 or jsonb_array_length(p_input->'languages')>9
      or (not ('summary'=any(coalesce(s.fields,field_codes))) and (p_input->>'summary')<>coalesce(profile.summary,''))
      or (not ('languages'=any(coalesce(s.fields,field_codes))) and p_input->'languages'<>coalesce(profile.languages,'[]'))
      then raise exception 'profile field unavailable' using errcode='23514'; end if;
    for item in select value from jsonb_array_elements(selections) loop
      if jsonb_typeof(item)<>'object' or item-array['code','proficiency','experience']<>'{}'
        or not coalesce((item->>'proficiency')=any(levels),false)
        or not exists(select from private.c31_skills c where c.code=item->>'code' and
          ((c.status='active' and c.category=any(coalesce(s.categories,category_codes))) or
            exists(select from private.c31_selections v where v.actor=p_actor and v.code=c.code)))
        or item->'experience' is null
        or (item->'experience'<>'null'::jsonb and (jsonb_typeof(item->'experience')<>'number'
          or (item->>'experience') !~ '^([0-9]|[1-5][0-9]|60)$'))
        then raise exception 'invalid skill selection' using errcode='23514'; end if;
      if not ('experience'=any(coalesce(s.fields,field_codes))) and (item->>'experience')::integer is distinct from
        (select v.experience from private.c31_selections v where v.actor=p_actor and v.code=item->>'code')
        then raise exception 'experience unavailable' using errcode='23514'; end if;
    end loop;
    for item in select value from jsonb_array_elements(p_input->'languages') loop
      if jsonb_typeof(item)<>'object' or item-array['code','proficiency']<>'{}'
        or not coalesce((item->>'code')=any(language_codes),false) or not coalesce((item->>'proficiency')=any(levels),false)
        then raise exception 'invalid language selection' using errcode='23514'; end if;
    end loop;
    if (select count(distinct selection->>'code') from jsonb_array_elements(selections) items(selection))<>jsonb_array_length(selections)
      or (select count(distinct selection->>'code') from jsonb_array_elements(p_input->'languages') items(selection))<>jsonb_array_length(p_input->'languages')
      then raise exception 'duplicate selection' using errcode='23514'; end if;
    consents:=p_input->'consent';
    if consents-array['matching','discovery','profileDisplay']<>'{}'
      or jsonb_typeof(consents->'matching') is distinct from 'boolean'
      or jsonb_typeof(consents->'discovery') is distinct from 'boolean'
      or jsonb_typeof(consents->'profileDisplay') is distinct from 'boolean'
      then raise exception 'invalid consent' using errcode='23514'; end if;
    insert into private.c31_profiles values(p_actor,expected+1,p_input->>'summary',p_input->'languages',
      p_input->>'mode',p_input->>'commitment',values_input,(p_input->>'nationwide')::boolean,p_input->>'availability',expires)
      on conflict(actor) do update set version=excluded.version,summary=excluded.summary,languages=excluded.languages,
        mode=excluded.mode,commitment=excluded.commitment,departments=excluded.departments,nationwide=excluded.nationwide,
        availability=excluded.availability,expires_on=excluded.expires_on;
    delete from private.c31_selections where actor=p_actor;
    insert into private.c31_selections select p_actor,v.code,v.proficiency,v.experience
      from jsonb_to_recordset(selections) v(code text, proficiency text, experience integer);
    insert into private.c31_consents(actor,matching,discovery,profile_display)
      values(p_actor,(consents->>'matching')::boolean,(consents->>'discovery')::boolean,(consents->>'profileDisplay')::boolean)
      on conflict(actor) do update set matching=excluded.matching,discovery=excluded.discovery,profile_display=excluded.profile_display,
        recorded_at=excluded.recorded_at where
        (c31_consents.matching,c31_consents.discovery,c31_consents.profile_display) is distinct from
        (excluded.matching,excluded.discovery,excluded.profile_display);
  else raise exception 'unsupported action' using errcode='42501'; end if;
  saved_version:=expected+1;
  insert into private.c31_owner_receipts values(p_actor,request_key,signature,saved_version)
    on conflict(actor) do update set request=excluded.request,fingerprint=excluded.fingerprint,version=excluded.version;
  return jsonb_build_object('version',saved_version);
end $$;

revoke all on function private.c31_term(text),private.c31_labels(jsonb,integer),
  public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.c31_volunteer_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,text,jsonb) to service_role;

-- Initial catalog version. No member profiles, consent, fixture activation or appointments are seeded.
insert into private.c31_skills values
  ('literacy_tutoring',1,'education','{"en":"Literacy tutoring","ht":"Leson lekti","fr":"Soutien en lecture","es":"Tutoría de lectura"}'::jsonb,null,array['reading tutor'],'active'),
  ('first_aid',1,'healthcare','{"en":"First aid","ht":"Premye swen","fr":"Premiers secours","es":"Primeros auxilios"}'::jsonb,null,array['first responder'],'active'),
  ('site_surveying',1,'engineering','{"en":"Land surveying","ht":"Mezi teren","fr":"Arpentage","es":"Topografía"}'::jsonb,null,array['land survey'],'active'),
  ('crop_production',1,'agriculture','{"en":"Crop production","ht":"Pwodiksyon rekòt","fr":"Production végétale","es":"Producción de cultivos"}'::jsonb,null,array['crop growing'],'active'),
  ('watershed_restoration',1,'environment','{"en":"Watershed restoration","ht":"Restorasyon basen vèsan","fr":"Restauration des bassins versants","es":"Restauración de cuencas"}'::jsonb,null,array['watershed'],'active'),
  ('computer_support',1,'technology','{"en":"Computer support","ht":"Sipò enfòmatik","fr":"Assistance informatique","es":"Soporte informático"}'::jsonb,null,array['it support'],'active'),
  ('business_planning',1,'business','{"en":"Business planning","ht":"Planifikasyon biznis","fr":"Planification d’entreprise","es":"Planificación empresarial"}'::jsonb,null,array['business plans'],'active'),
  ('bookkeeping',1,'finance','{"en":"Bookkeeping","ht":"Tenis liv kontab","fr":"Tenue de livres","es":"Contabilidad básica"}'::jsonb,null,array['ledger keeping'],'active'),
  ('records_management',1,'administration','{"en":"Records management","ht":"Jesyon dosye","fr":"Gestion des dossiers","es":"Gestión documental"}'::jsonb,null,array['archives management'],'active'),
  ('community_facilitation',1,'community','{"en":"Community facilitation","ht":"Animasyon kominotè","fr":"Animation communautaire","es":"Facilitación comunitaria"}'::jsonb,null,array['group facilitation'],'active'),
  ('inventory_management',1,'logistics','{"en":"Inventory management","ht":"Jesyon envantè","fr":"Gestion des stocks","es":"Gestión de inventarios"}'::jsonb,null,array['stock management'],'active'),
  ('audio_production',1,'communications','{"en":"Audio production","ht":"Pwodiksyon odyo","fr":"Production audio","es":"Producción de audio"}'::jsonb,null,array['sound production'],'active'),
  ('visual_arts',1,'arts','{"en":"Visual arts","ht":"Atizay vizyèl","fr":"Arts visuels","es":"Artes visuales"}'::jsonb,null,array['visual art'],'active'),
  ('carpentry',1,'trades','{"en":"Carpentry","ht":"Chapant","fr":"Charpenterie","es":"Carpintería"}'::jsonb,null,array['woodworking'],'active'),
  ('written_translation',1,'languages','{"en":"Written translation","ht":"Tradiksyon ekri","fr":"Traduction écrite","es":"Traducción escrita"}'::jsonb,null,array['document translation'],'active');
insert into private.c31_catalog_terms(term,code)
  select distinct private.c31_term(x),code from private.c31_skills cross join lateral
    unnest(aliases || array(select value from jsonb_each_text(names))) x;
