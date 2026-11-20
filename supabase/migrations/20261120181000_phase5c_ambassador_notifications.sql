alter table feed_data.notifications drop constraint notifications_kind_check,
  add column ambassador_case_id uuid references private.ambassador_cases(id) on delete cascade,
  add constraint notifications_kind_check check(kind in ('post_reaction','post_comment','comment_reply','new_follower','appeal_decided',
    'verification_decided','verification_appeal_decided','representative_access_changed','ambassador_invited','ambassador_updated')),
  add constraint notifications_ambassador_scope check(
    (kind in ('ambassador_invited','ambassador_updated'))=(ambassador_case_id is not null)
    and (ambassador_case_id is null or (actor_id is null and post_id is null and comment_id is null and appeal_id is null
      and verification_application_id is null and verification_appeal_id is null and representative_membership_id is null)));
create index notifications_ambassador_case on feed_data.notifications(ambassador_case_id) where ambassador_case_id is not null;

create function private.notify_ambassador_case()
returns trigger language plpgsql security definer set search_path='' as $$
declare c private.ambassador_cases;
begin
  if new.event not in ('invite','accept','suspend','resume','revoke','complete','uphold','allow_new_invitation') then return new; end if;
  select * into c from private.ambassador_cases where id=new.case_id;
  if c.invite_expires_at is not null and c.recipient_id is not null then
    insert into feed_data.notifications(recipient_id,kind,ambassador_case_id,dedupe)
      values(c.recipient_id,case when new.event='invite' then 'ambassador_invited' else 'ambassador_updated' end,
        c.id,'ambassador:'||c.id::text||':'||new.version::text)
      on conflict(recipient_id,dedupe) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_ambassador_case() from public,anon,authenticated,service_role;
create trigger notify_ambassador_case after insert on private.ambassador_audit
  for each row execute function private.notify_ambassador_case();

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
    when n.kind in ('ambassador_invited','ambassador_updated') then private.institution_actor(n.recipient_id)
      and exists(select 1 from private.ambassador_cases c where c.id=n.ambassador_case_id
        and c.recipient_id=n.recipient_id and c.invite_expires_at is not null)
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
