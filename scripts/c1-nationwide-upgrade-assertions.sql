do $$
declare room uuid:=(select id from feed_data.communities where slug='ouest');
begin
  if (select max(version) from supabase_migrations.schema_migrations)<>'20261125120000'
    or (select count(*) from private.c16_policy)<>1 or (select count(*) from private.c16_history)<>1
    or (select count(*) from private.c16_enrollment)<>1
    or not exists(select from private.c16_policy where community_id=room and revision=2 and mode='prepared'
      and eligible and not verified_identity and max_participants=20 and capacity=7 and duration_days=22
      and intake and review and not publication and not association and starts_at is null and ends_at is null)
    or not exists(select from private.c16_enrollment where community_id=room
      and user_id='a18c0000-0000-4000-8000-000000000001' and until_at='2030-01-10 10:00:00Z' and revoked_at is null)
    or not exists(select from private.c16_history where community_id=room and decision_scope='department' and revision=2
      and actor_id='a18c0000-0000-4000-8000-000000000001' and workspace_id='a18c0000-0000-4000-8000-000000000002'
      and request_id='a18c0000-0000-4000-8000-000000000003' and digest=decode(repeat('18',32),'hex')
      and action='enroll' and reason='Existing Ouest pilot receipt' and after_value='{"keep":"legacy"}'
      and occurred_at='2026-11-24 18:00:00Z')
    or (select count(*) from feed_data.communities where private.c18_department(id))<>10
    or exists(select from feed_data.communities c cross join unnest(array['intake','review','publication','association']) stage
      where private.c18_live(c.id,stage,repeat('0',40))) then
    raise exception 'nationwide upgrade failed to preserve Ouest or disabled stages';
  end if;
end $$;
