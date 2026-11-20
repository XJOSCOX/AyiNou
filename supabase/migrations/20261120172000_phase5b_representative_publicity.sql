-- Representative publicity is opt-in for the specific currently verified grant.
alter table private.organization_memberships add column public_verified_rep boolean not null default false;

create function private.representative_verified(m private.organization_memberships)
returns boolean language sql stable set search_path='' as $$
  select m.verified_at is not null and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
    and private.institution_actor(m.user_id)
    and exists(select 1 from private.organizations o where o.id=m.organization_id and o.status='active')
    and exists(select 1 from private.verification_applications a where a.membership_id=m.id
      and a.kind='representative' and a.status='approved');
$$;

create function public.institution_representatives_for_api(p_actor uuid,p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.institution_actor(p_actor) then raise exception 'access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'representatives',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'displayName',p.display_name) order by p.username)
      from private.organization_memberships m join public.profiles p on p.user_id=m.user_id
      where m.organization_id=p_org and m.public_verified_rep and private.representative_verified(m)
        and feed_data.followable_member(p) and not feed_data.blocked_pair(p_actor,m.user_id)),'[]'::jsonb),
    'ownConsent',(select m.public_verified_rep from private.organization_memberships m
      join public.profiles p on p.user_id=m.user_id
      where m.organization_id=p_org and m.user_id=p_actor and m.revoked_at is null
        and private.representative_verified(m) and (m.public_verified_rep or feed_data.followable_member(p))));
end;
$$;

create function public.institution_representative_consent_for_api(p_actor uuid,p_org uuid,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
declare membership_id uuid;
begin
  if not private.institution_actor(p_actor) or p_publish is null
  then raise exception 'access denied' using errcode='42501'; end if;
  perform 1 from private.organizations where id=p_org for no key update;
  update private.organization_memberships m set public_verified_rep=p_publish
    where m.organization_id=p_org and m.user_id=p_actor and m.revoked_at is null
      and private.representative_verified(m) and m.public_verified_rep is distinct from p_publish
      and (not p_publish or exists(select 1 from public.profiles p where p.user_id=p_actor and feed_data.followable_member(p)))
    returning id into membership_id;
  if found then
    insert into private.institution_audit(actor_id,organization_id,subject_id,event)
      values(p_actor,p_org,membership_id,case when p_publish then 'representative_publicity_enabled' else 'representative_publicity_disabled' end);
  elsif not exists(select 1 from private.organization_memberships m where m.organization_id=p_org and m.user_id=p_actor
      and m.revoked_at is null and private.representative_verified(m) and m.public_verified_rep=p_publish)
  then raise exception 'representative unavailable' using errcode='55000'; end if;
end;
$$;

alter table feed_data.notifications drop constraint notifications_kind_check,
  add column representative_membership_id uuid references private.organization_memberships(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed')),
  add constraint notifications_representative_scope check(
    (kind='representative_access_changed')=(representative_membership_id is not null)
    and (kind<>'representative_access_changed' or (actor_id is null and post_id is null and comment_id is null and appeal_id is null)));
create index notifications_representative_membership on feed_data.notifications(representative_membership_id)
  where representative_membership_id is not null;

create function private.clear_representative_consent()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.revoked_at is distinct from old.revoked_at or new.verified_at is distinct from old.verified_at
  then new.public_verified_rep := false; end if;
  return new;
end;
$$;
create trigger clear_representative_consent before update of revoked_at,verified_at on private.organization_memberships
  for each row execute function private.clear_representative_consent();

create function private.notify_representative_access()
returns trigger language plpgsql security definer set search_path='' as $$
declare change_type text;
begin
  if tg_op='INSERT' then
    if new.role='owner' then return new; end if;
    change_type := 'granted';
  elsif new.revoked_at is not null and old.revoked_at is null then
    change_type := 'revoked';
  else
    return new;
  end if;
  if private.institution_actor(new.user_id) then
    insert into feed_data.notifications(recipient_id,kind,representative_membership_id,dedupe)
      values(new.user_id,'representative_access_changed',new.id,'representative:'||new.id::text||':'||change_type)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
create trigger notify_representative_access after insert or update of revoked_at on private.organization_memberships
  for each row execute function private.notify_representative_access();

revoke all on function private.representative_verified(private.organization_memberships),private.clear_representative_consent(),
  private.notify_representative_access(),public.institution_representatives_for_api(uuid,uuid),
  public.institution_representative_consent_for_api(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.institution_representatives_for_api(uuid,uuid),
  public.institution_representative_consent_for_api(uuid,uuid,boolean) to service_role;
create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.kind='representative_access_changed' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.organization_memberships m where m.id=n.representative_membership_id and m.user_id=n.recipient_id)
    when n.kind='appeal_decided' then exists(select 1 from feed_data.moderation_appeals a
      where a.id=n.appeal_id and a.appellant_id=n.recipient_id and a.outcome<>'pending')
    when n.actor_id is null or feed_data.blocked_pair(n.recipient_id,n.actor_id) or not feed_data.author_active(n.actor_id) then false
    when n.kind='new_follower' then feed_data.follower_visible(n.actor_id)
      and feed_data.follower_visible(n.recipient_id) and exists(
        select 1 from feed_data.member_follows where follower_id=n.actor_id and target_id=n.recipient_id)
    else exists(select 1 from feed_data.posts p where p.id=n.post_id and feed_data.discussion_visible(p))
      and case when n.kind='post_reaction' then exists(
        select 1 from feed_data.post_reactions r where r.post_id=n.post_id and r.user_id=n.actor_id)
      else exists(select 1 from feed_data.comments c where c.id=n.comment_id and c.post_id=n.post_id
        and feed_data.comment_visible(c)
        and (c.parent_id is null or exists(select 1 from feed_data.comments parent where parent.id=c.parent_id
          and feed_data.comment_visible(parent)))) end
    end;
$$;

