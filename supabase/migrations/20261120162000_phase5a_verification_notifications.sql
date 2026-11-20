alter table feed_data.notifications drop constraint notifications_kind_check,
  add column verification_application_id uuid references private.verification_applications(id) on delete cascade,
  add column verification_appeal_id uuid references private.verification_appeals(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided')),
  add constraint notifications_verification_scope check(
    (kind='verification_decided')=(verification_application_id is not null)
    and (kind='verification_appeal_decided')=(verification_appeal_id is not null)
    and (kind not in ('verification_decided','verification_appeal_decided') or
      (actor_id is null and post_id is null and comment_id is null and appeal_id is null)));
create index notifications_verification_application on feed_data.notifications(verification_application_id) where verification_application_id is not null;
create index notifications_verification_appeal on feed_data.notifications(verification_appeal_id) where verification_appeal_id is not null;

create function private.notify_verification_application()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','revoked')
    and private.institution_actor(new.applicant_id) then
    insert into feed_data.notifications(recipient_id,kind,verification_application_id,dedupe)
      values(new.applicant_id,'verification_decided',new.id,'verification:'||new.id::text||':'||new.status)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
create function private.notify_verification_appeal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.outcome is distinct from old.outcome and new.outcome<>'pending' and private.institution_actor(new.appellant_id) then
    insert into feed_data.notifications(recipient_id,kind,verification_appeal_id,dedupe)
      values(new.appellant_id,'verification_appeal_decided',new.id,'verification-appeal:'||new.id::text)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_verification_application(),private.notify_verification_appeal()
  from public,anon,authenticated,service_role;
create trigger notify_verification_application after update of status on private.verification_applications
  for each row execute function private.notify_verification_application();
create trigger notify_verification_appeal after update of outcome on private.verification_appeals
  for each row execute function private.notify_verification_appeal();

create or replace function feed_data.notification_visible(n feed_data.notifications)
returns boolean language sql stable set search_path='' as $$
  select case
    when n.kind='verification_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_applications a where a.id=n.verification_application_id
        and a.applicant_id=n.recipient_id and a.status in ('approved','rejected','revoked'))
    when n.kind='verification_appeal_decided' then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.verification_appeals a where a.id=n.verification_appeal_id
        and a.appellant_id=n.recipient_id and a.outcome<>'pending')
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
