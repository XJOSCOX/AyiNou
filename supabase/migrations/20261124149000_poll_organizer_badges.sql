-- Reuse existing profile and organization badge disclosure for names already shown on polls.
create or replace function private.poll_card(p private.polls)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'kind',p.kind,'scope',p.scope,'language',p.language,
    'policy',p.policy,'status',private.poll_status(p),'closesAt',p.closes_at,'createdAt',p.created_at,
    'scopeName',case p.scope
      when 'community' then (select coalesce(c.name,d.name) from feed_data.communities c
        left join public.departments d on d.code=c.department_code where c.id=p.community_id)
      when 'organization' then (select o.name from private.organizations o where o.id=p.organization_id)
      when 'project' then (select r.proposal->>'title' from private.project_revisions r where r.project_id=p.project_id and r.revision=p.proposal_revision)
      else (select u.display_name from public.profiles u where u.user_id=p.creator_id and feed_data.followable_member(u)) end,
    'scopeBadges',case p.scope
      when 'individual' then (
        select jsonb_build_object('personalClaims',private.reviewed_personal_claims(u.user_id))
          || case when public.founder_identity_public_for_api(u.user_id)
            then jsonb_build_object('founderVerified',true) else '{}'::jsonb end
        from public.profiles u where u.user_id=p.creator_id and feed_data.followable_member(u)
          and feed_data.f24_details(u.user_id,auth.uid())
      )
      when 'organization' then (
        select jsonb_build_object('verifiedOrganization',true)
        from private.organizations o where o.id=p.organization_id and o.verification_status='verified'
          and feed_data.f21_org_visible(o.id)
      )
    end);
$$;
