do $$
begin
  if (select max(version) from supabase_migrations.schema_migrations)<>'20261124155600'
    or current_database()<>'postgres' then
    raise exception 'unexpected disposable upgrade baseline';
  end if;
end $$;

insert into auth.users(id,email,email_confirmed_at,invited_at)
values('a18c0000-0000-4000-8000-000000000001','legacy-pilot@example.test',now(),now());

insert into private.c16_policy(community_id,revision,mode,capacity,duration_days,intake,review,publication,association)
select id,2,'prepared',7,22,true,true,false,false from feed_data.communities where slug='ouest';

insert into private.c16_enrollment(user_id,until_at)
values('a18c0000-0000-4000-8000-000000000001','2030-01-10 10:00:00Z');

insert into private.c16_history(revision,actor_id,workspace_id,request_id,digest,action,subject_id,reason,before_value,after_value,occurred_at)
values(2,'a18c0000-0000-4000-8000-000000000001','a18c0000-0000-4000-8000-000000000002',
  'a18c0000-0000-4000-8000-000000000003',decode(repeat('18',32),'hex'),'enroll',
  'a18c0000-0000-4000-8000-000000000001','Existing Ouest pilot receipt',null,'{"keep":"legacy"}','2026-11-24 18:00:00Z');
