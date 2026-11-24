-- Keep the explanation intended for the recipient separate from private decision history.
alter table private.ambassador_cases
  add column invitation_message text
  check (invitation_message is null or private.valid_trust_text(invitation_message,10,1000));

create or replace function private.clear_deleted_ambassador_publicity()
returns trigger language plpgsql set search_path='' as $$
begin
  new.public_opt_in:=false;
  new.statement:=null;
  new.invitation_message:=null;
  return new;
end;
$$;

create function public.ambassador_send_invitation_for_client(
  p_id uuid,p_version integer,p_reason text,p_message text
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_message is null or not private.valid_trust_text(p_message,10,1000) then
    raise exception 'invalid invitation message' using errcode='22023';
  end if;

  -- Reuse authorization, locking, lifecycle checks, audit and notification.
  perform public.ambassador_admin_action_for_client(p_id,p_version,'invite',p_reason);
  update private.ambassador_cases set invitation_message=btrim(p_message) where id=p_id;
end;
$$;

revoke all on function public.ambassador_send_invitation_for_client(uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ambassador_send_invitation_for_client(uuid,integer,text,text)
  to authenticated;

create or replace function public.ambassador_own_for_client()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(
      private.ambassador_card(c)||jsonb_build_object(
        'invitedAt', sent.created_at,
        'invitationMessage', c.invitation_message,
        'sender', case when sender.user_id is not null then jsonb_build_object(
          'displayName', sender.display_name,
          'personalClaims', private.reviewed_personal_claims(sender.user_id),
          'founderVerified', public.founder_identity_public_for_api(sender.user_id)
        ) end
      ) order by c.created_at desc,c.id desc
    )
    from (
      select x.* from private.ambassador_cases x
      where x.recipient_id=auth.uid() and x.invite_expires_at is not null
      order by x.created_at desc,x.id desc limit 30
    ) c
    left join private.ambassador_audit sent on sent.case_id=c.id and sent.version=2 and sent.event='invite'
    left join public.profiles sender on sender.user_id=sent.actor_id
      and feed_data.followable_member(sender)
      and feed_data.f24_mode(sender.user_id)='public'
  ),'[]');
end;
$$;
