-- Expose only the operations needed by the independent API. The secret key
-- calls the initializer; member updates run with the caller's JWT and RLS.
create function public.initialize_member_for_api(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.initialize_member(p_user_id);
$$;

revoke all on function public.initialize_member_for_api(uuid) from public, anon, authenticated;
grant execute on function public.initialize_member_for_api(uuid) to service_role;

create function public.update_my_profile(
  p_display_name text,
  p_preferred_locale text,
  p_residence_country_code text,
  p_residence_department_code text,
  p_diaspora_department_code text
)
returns table (
  user_id uuid,
  display_name text,
  preferred_locale text,
  is_visible boolean,
  residence_country_code text,
  residence_department_code text,
  diaspora_department_code text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
begin
  if member_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.profiles p
    set display_name = p_display_name, preferred_locale = p_preferred_locale
    where p.user_id = member_id;

  update public.member_private m
    set residence_country_code = p_residence_country_code,
        residence_department_code = p_residence_department_code,
        diaspora_department_code = p_diaspora_department_code
    where m.user_id = member_id;

  return query
    select p.user_id, p.display_name, p.preferred_locale, p.is_visible,
      m.residence_country_code, m.residence_department_code,
      m.diaspora_department_code
    from public.profiles p
    join public.member_private m on m.user_id = p.user_id
    where p.user_id = member_id;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile(text, text, text, text, text)
  to authenticated;
