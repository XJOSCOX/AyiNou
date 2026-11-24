-- A preview uses the submitted working copy and does not claim or modify a proposal.
create function private.project_review_preview(p_id uuid)
returns private.community_projects language plpgsql stable set search_path='' as $$
declare item private.community_projects; actor uuid:=auth.uid();
begin
  select * into item from private.community_projects where id=p_id;
  if not found then raise exception 'project unavailable' using errcode='PJP04'; end if;
  item:=private.project_working_copy(item);

  if not coalesce(feed_data.member_allowed() and item.restricted_at is null
    and item.status in ('submitted','under_review')
    and (private.project_reviewer(item,actor) or private.project_founder_owner_review(item,actor)),false)
  then raise exception 'project unavailable' using errcode='PJP04'; end if;

  if not feed_data.recent_feed_totp()
    then raise exception 'recent MFA required' using errcode='PCG05'; end if;
  return item;
end;
$$;

create function public.project_review_preview_for_client(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item private.community_projects:=private.project_review_preview(p_id);
begin
  return private.project_card(item)||jsonb_build_object(
    'proposal',(select r.proposal from private.project_revisions r where r.project_id=item.id and r.revision=item.revision),
    'version',null,'publishedAt',null,'restricted',false,'canEdit',false,'canSubmit',false,
    'canDecide',false,'canReport',false,'submissionIdentity',null,'publicationEligibility',null,'history','[]'::jsonb);
end;
$$;

create function public.project_review_preview_media_for_client(p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare item private.community_projects:=private.project_review_preview(p_id);
begin
  return (select encode(i.image,'base64') from private.project_revisions r
    join private.project_images i on i.project_id=r.project_id and i.digest=r.image_digest
    where r.project_id=item.id and r.revision=item.revision);
end;
$$;

revoke all on function private.project_review_preview(uuid),public.project_review_preview_for_client(uuid),
  public.project_review_preview_media_for_client(uuid) from public,anon,authenticated,service_role;
grant execute on function public.project_review_preview_for_client(uuid),
  public.project_review_preview_media_for_client(uuid) to authenticated;
