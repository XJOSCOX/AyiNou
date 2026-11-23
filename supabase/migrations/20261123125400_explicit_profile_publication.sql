-- An explicit publication works even when discovery was already enabled on a hidden profile.
create function public.publish_member_profile_for_client()
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  policy jsonb;
begin
  if actor is null or not private.member_session_allowed() or not feed_data.member_allowed()
    then raise exception 'Authentication required' using errcode='42501'; end if;

  select value into policy from private.member_experience_policy where singleton for share;
  if policy is null or policy->'profilesEnabled'='false'::jsonb
    or policy->'publicProfiles'='false'::jsonb or policy->'profileEdits'='false'::jsonb
    then raise exception 'Profile publication unavailable' using errcode='R2302'; end if;

  -- Reuse the profile save and its lock so this command serializes with hide and edit.
  perform public.save_member_profile_v2('{"discoverable":true}'::jsonb);
  update public.profiles set is_visible=true where user_id=actor
    and username is not null and nullif(btrim(display_name),'') is not null;
  if not found then raise exception 'Save a name and username before publishing' using errcode='23514'; end if;
end
$$;

revoke all on function public.publish_member_profile_for_client() from public,anon,authenticated,service_role;
grant execute on function public.publish_member_profile_for_client() to authenticated;
