-- Show the live directory listing alongside the status of the working revision.
create or replace function public.my_projects_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(private.project_card(private.project_working_copy(p))||jsonb_build_object('createdByMe',p.creator_id=actor,
    'restricted',p.restricted_at is not null,
    'publishedAt',case when private.project_visible(p) then p.directory_published_at end) order by p.updated_at desc,p.id desc)
    from (select x.id from private.community_projects x where
      private.project_owner_access(x,actor,'view_private') or private.project_owner_access(x,actor,'edit')
      or private.project_owner_access(x,actor,'submit') or private.project_owner_access(x,actor,'propose')
      order by x.updated_at desc,x.id desc limit 50) eligible join private.community_projects p using(id)),'[]');
end;
$$;
