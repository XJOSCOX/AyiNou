-- Preserve public release withdrawal when a consented association loses an eligibility prerequisite.
create or replace function private.c24_freeze() returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb; row_value jsonb; p uuid; owner_ref uuid; organization_ref uuid;
  community_ref uuid; member_ref uuid; pair_actor uuid; pair_target uuid; sector_scope text;
begin
  if not exists(select from private.c24_releases where state='sealed') then return null; end if;
  if tg_op<>'INSERT' then old_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then new_row:=to_jsonb(new); end if;
  if old_row is not distinct from new_row then return null; end if;
  row_value:=coalesce(new_row,old_row);
  case tg_table_name
    when 'c24_settings' then null;
    when 'c24_definitions' then
      if old_row->>'state' is distinct from 'active' and new_row->>'state' is distinct from 'active' then return null; end if;
      sector_scope:=row_value->>'sector';
    when 'c24_mappings' then
      if old_row->>'state' is distinct from 'approved' and new_row->>'state' is distinct from 'approved' then return null; end if;
      select d.sector into sector_scope from private.c24_definitions d where d.code=row_value->>'code'
        and d.version=(row_value->>'definition_version')::int;
    when 'c24_need_consents' then select l.project_id into p from private.c14_links l where l.id=(row_value->>'link')::uuid;
    when 'community_projects' then p:=(row_value->>'id')::uuid;
    when 'c23_publications' then
      if old_row->>'state' is distinct from 'approved' and new_row->>'state' is distinct from 'approved' then return null; end if;
      p:=(row_value->>'project_id')::uuid;
    when 'profiles' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'profile_privacy' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'user_settings' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'verification_records' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'account_restrictions' then owner_ref:=(row_value->>'user_id')::uuid;
    when 'm22_account_sanctions' then owner_ref:=(row_value->>'subject_id')::uuid;
    when 'users' then owner_ref:=(row_value->>'id')::uuid;
    when 'organizations' then organization_ref:=(row_value->>'id')::uuid;
    when 'organization_memberships','organization_custom_assignments','organization_custom_roles','organization_affiliations','verification_applications' then
      organization_ref:=(row_value->>'organization_id')::uuid;
    when 'communities' then community_ref:=(row_value->>'id')::uuid;
    when 'community_memberships','community_staff' then
      community_ref:=(row_value->>'community_id')::uuid;
      member_ref:=(row_value->>'user_id')::uuid;
    when 'member_blocks' then
      pair_actor:=(row_value->>'actor_id')::uuid;
      pair_target:=(row_value->>'target_id')::uuid;
    else p:=(row_value->>'project_id')::uuid;
  end case;
  with removed as (
    update private.c24_releases a set state='suppressed',version=a.version+1
    where a.state='sealed' and (tg_table_name='c24_settings'
      or sector_scope=a.sector or (p is not null and a.projects @> array[p])
      or ((owner_ref is not null or organization_ref is not null or community_ref is not null) and exists(
        select from private.community_projects pr where pr.id=any(a.projects) and (
          pr.organization_id=organization_ref or community_ref in(pr.community_id,pr.association_id)
          or owner_ref in(pr.owner_user_id,pr.submitted_by) or exists(select from private.organization_memberships om
            where om.organization_id=pr.organization_id and om.user_id=owner_ref))))
      or ((owner_ref is not null or community_ref is not null or pair_actor is not null)
        and exists(select from private.c24_settings s where s.needs)
        and exists(
          select from private.c14_links link
          join private.c24_need_consents consent on consent.link=link.id
            and consent.consented and consent.link_revision=link.revision
          join private.c13_publications publication on publication.id=link.publication_id
          join private.c11_needs need on need.id=publication.need_id
          where link.project_id=any(a.projects) and link.state='approved' and (
            owner_ref in(link.author,link.organizer)
            or (need.community_id=community_ref and (member_ref is null or member_ref in(link.author,link.organizer)))
            or (pair_actor in(link.author,link.organizer) and pair_target in(link.author,link.organizer))
          )
        )))
    returning a.*
  )
  insert into private.c24_events(action,resource,version,reason)
    select 'suppress',report_year||'/'||sector,version,'An input to the sealed reporting cohort changed.' from removed;
  return null;
end
$$;

create trigger c25_impact_association_block after insert or delete on feed_data.member_blocks
  for each row execute function private.c24_freeze();
create trigger c25_impact_pending_proposal after update of pending_revision,pending_status on private.community_projects
  for each row when (old.pending_revision is distinct from new.pending_revision or old.pending_status is distinct from new.pending_status)
  execute function private.c24_freeze();

revoke all on function private.c24_freeze() from public,anon,authenticated,service_role;

-- Select the reporting year's latest completed projects once before applying the native privacy predicates.
create index c25_project_completed_date on private.project_operations_events(created_at,project_id)
  where action='execution_status' and detail='completed';
create index c25_project_latest_completion on private.project_operations_events(project_id,created_at desc)
  where action='execution_status' and detail='completed';

create or replace function private.c24_projects(p_year int,p_sector text,p_departments text[] default null)
returns table(id uuid,department text,revision int,owner text,title text) language sql stable set search_path='' as $$
  with limits as (
    select make_timestamptz(p_year,1,1,0,0,0,'UTC') as start_at,
      make_timestamptz(p_year+1,1,1,0,0,0,'UTC') as end_at
  ), current_completions as materialized (
    select distinct recent.project_id
    from private.project_operations_events recent cross join limits bounds
    where recent.action='execution_status' and recent.detail='completed'
      and recent.created_at>=bounds.start_at and recent.created_at<bounds.end_at
      and not exists (
        select from private.project_operations_events newer
        where newer.project_id=recent.project_id and newer.action='execution_status' and newer.detail='completed'
          and newer.created_at>=bounds.end_at
      )
  ), projects as materialized (
    select p.id,private.c22_department(p) department,p.revision,
      coalesce('person:'||p.owner_user_id,'institution:'||p.organization_id,'community:'||p.community_id) owner,
      v.proposal->>'title' title
    from current_completions complete
    join private.project_execution e on e.project_id=complete.project_id
    join private.community_projects p on p.id=e.project_id and p.revision=e.approved_revision
    join private.project_revisions v on v.project_id=p.id and v.revision=p.revision
    where e.status in ('completed','archived') and p.directory_published_at is not null and p.restricted_at is null
      and v.proposal->>'country'='HT' and private.c24_sector(v.proposal->>'category')=p_sector
      and private.project_progress_public(p)
  )
  select p.id,p.department,p.revision,p.owner,p.title from projects p
  where p.department is not null and (p_departments is null or p.department=any(p_departments))
  order by p.id limit 601
$$;
revoke all on function private.c24_projects(integer,text,text[]) from public,anon,authenticated,service_role;
