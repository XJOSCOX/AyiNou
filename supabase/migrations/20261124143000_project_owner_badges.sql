-- Apply the profile's existing disclosure rules before showing verification on project listings.
create or replace function private.project_card(p private.community_projects)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'status',p.status,'title',r.proposal->>'title','category',r.category,
    'department',r.department,'country',r.proposal->>'country','publishedAt',case when private.project_visible(p) then p.directory_published_at end,
    'hasImage',r.image_digest is not null,
    'owner',case
      when p.owner_user_id is not null then coalesce((select jsonb_build_object('kind','individual','name',m.display_name,'handle',m.username,
          'personalClaims',case when feed_data.f24_identity(m,auth.uid()) and feed_data.f24_details(m.user_id,auth.uid())
            then private.reviewed_personal_claims(m.user_id) end,
          'founderVerified',case when feed_data.followable_member(m) and feed_data.f24_details(m.user_id,auth.uid())
            and public.founder_identity_public_for_api(m.user_id) then true end)
        from public.profiles m where m.user_id=p.owner_user_id),jsonb_build_object('kind','individual','name',null,'handle',null))
      when p.organization_id is not null then (select jsonb_build_object('kind','organization','name',o.name,'handle',o.handle)
        from private.organizations o where o.id=p.organization_id)
      else (select jsonb_build_object('kind','community','name',coalesce(c.name,d.name),'handle',c.slug)
        from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.community_id) end,
    'association',(select jsonb_build_object('name',coalesce(c.name,d.name),'handle',c.slug)
      from feed_data.communities c left join public.departments d on d.code=c.department_code where c.id=p.association_id))
  from private.project_revisions r where r.project_id=p.id and r.revision=p.revision;
$$;
