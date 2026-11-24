-- Reuse member profile disclosure and organization badge rules on event organizer reads.
create or replace function feed_data.f25_event_organizer(e feed_data.events)
returns jsonb language sql stable set search_path='' as $$
  select case when e.organization_id is null then
    jsonb_build_object('kind','member','name',p.display_name,'handle',p.username)
    || case when feed_data.f24_identity(p,auth.uid()) and feed_data.f24_details(p.user_id,auth.uid())
      then jsonb_build_object('personalClaims',private.reviewed_personal_claims(p.user_id))
        || case when feed_data.followable_member(p) and public.founder_identity_public_for_api(p.user_id)
          then jsonb_build_object('founderVerified',true) else '{}'::jsonb end
      else '{}'::jsonb end
    else jsonb_build_object('kind','organization','name',o.name,'handle',o.handle)
      || case when o.verification_status='verified' and feed_data.f21_org_visible(o.id)
        then jsonb_build_object('verified',true) else '{}'::jsonb end
    end
  from (select 1) anchor
  left join public.profiles p on p.user_id=e.creator_id
  left join private.organizations o on o.id=e.organization_id
$$;
