-- Keep the existing transaction, audit and last-administrator rules behind the new promotion gate.
alter function public.admin_account_action_for_api(uuid,uuid,text,text,text) set schema private;
revoke all on function private.admin_account_action_for_api(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

create function public.admin_account_action_for_api(p_actor uuid,p_subject uuid,p_action text,p_value text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action='grant' and p_value='administrator' then
    perform pg_advisory_xact_lock(20261120,300);
    if not private.platform_admin(p_actor) or p_subject is null or p_actor=p_subject then
      raise exception 'access denied' using errcode='42501';
    end if;
    perform 1 from public.verification_records
      where user_id=p_subject and verification_type in ('identity','notable_person') and status='verified'
      for share;
    if not found then raise exception 'active personal verification required' using errcode='PVE01'; end if;
  end if;
  perform private.admin_account_action_for_api(p_actor,p_subject,p_action,p_value,p_reason);
end;
$$;

alter function public.admin_accounts_for_api(uuid,text,integer) set schema private;
revoke all on function private.admin_accounts_for_api(uuid,text,integer) from public,anon,authenticated,service_role;

create function public.admin_accounts_for_api(p_actor uuid,p_query text,p_offset integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row.account || jsonb_build_object('verified',exists (
    select 1 from public.verification_records v
    where v.user_id=(row.account->>'id')::uuid and v.verification_type in ('identity','notable_person') and v.status='verified'
  )) order by row.position),'[]'::jsonb)
  from jsonb_array_elements(private.admin_accounts_for_api(p_actor,p_query,p_offset))
    with ordinality as row(account,position);
$$;

revoke all on function public.admin_account_action_for_api(uuid,uuid,text,text,text),
  public.admin_accounts_for_api(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_account_action_for_api(uuid,uuid,text,text,text),
  public.admin_accounts_for_api(uuid,text,integer) to service_role;
