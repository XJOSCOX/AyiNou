-- Run through the guarded disposable database runner.
set statement_timeout = '45s';
insert into auth.users(id,email,email_confirmed_at)
select md5('poll-bench-user-'||n)::uuid, 'poll-bench-'||n||'@example.invalid', now()
from generate_series(1,4840) n;
insert into auth.sessions(id,user_id,aal)
select md5('poll-bench-session-'||n)::uuid,md5('poll-bench-user-'||n)::uuid,'aal1'
from generate_series(1,40) n;
do $$ begin
  for n in 1..40 loop
    perform public.initialize_member_for_api(md5('poll-bench-user-'||n)::uuid);
  end loop;
end $$;

insert into feed_data.community_memberships(community_id,user_id)
select c.id,md5('poll-bench-user-'||n)::uuid
from (select id from feed_data.communities where kind='department' order by slug limit 1) c
cross join generate_series(1,4840) n where n<>3;
insert into feed_data.community_memberships(community_id,user_id)
select id,md5('poll-bench-user-4')::uuid
from feed_data.communities where kind='department' order by slug offset 1 limit 1;

insert into private.polls (id,creator_id,request_key,request_digest,scope,community_id,kind,policy,audience,
    eligibility,result_policy,title,description,language,opens_at,closes_at,status,published_at,created_at)
select md5('poll-bench-directory-'||n)::uuid,md5('poll-bench-user-1')::uuid,gen_random_uuid(),'\x00','community',
    (select id from feed_data.communities where kind='department' order by slug offset (case when n<=30 then 0 else 1 end) limit 1),
    'community','advisory','scope','active','after_close','Synthetic directory poll','Disposable benchmark','en',
    now()-interval '1 hour',now()+interval '1 hour','published',now()-interval '2 hours',now()+n*interval '1 second'
from generate_series(1,12030) n;

insert into private.polls (id,creator_id,request_key,request_digest,scope,kind,policy,audience,
    eligibility,result_policy,title,description,language,opens_at,closes_at,status,published_at)
values ('e1000000-0000-4000-8000-000000000001',md5('poll-bench-user-1')::uuid,gen_random_uuid(),'\x00',
    'individual','community','advisory','members','active','after_vote','Synthetic ballot poll','Disposable benchmark','en',
    now()-interval '1 hour',now()+interval '1 hour','published',now()-interval '2 hours');
insert into private.poll_options(id,poll_id,position,label)
values ('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',1,'First'),
       ('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001',2,'Second');
insert into private.poll_ballots(poll_id,voter_id,option_id)
select 'e1000000-0000-4000-8000-000000000001',md5('poll-bench-user-'||n)::uuid,
    case when n%2=0 then 'e1000000-0000-4000-8000-000000000002'::uuid else 'e1000000-0000-4000-8000-000000000003'::uuid end
from generate_series(41,4840) n;
analyze private.polls;
analyze private.poll_ballots;
analyze feed_data.community_memberships;
