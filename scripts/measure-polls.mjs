import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const project = process.argv[2];
assert.match(project ?? "", /^ayinou-e2e-[a-f0-9-]{12}$/);
const args = ["exec", "-i", "supabase_db_" + project, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const query = (sql) => execFileSync("docker", args, { input: sql, encoding: "utf8", timeout: 70_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const execute = promisify(execFile);
const concurrent = (sql) => execute("docker", [...args, "-c", sql], { encoding: "utf8", timeout: 15_000 });
const poll = "'e1000000-0000-4000-8000-000000000001'";
const option = "'e1000000-0000-4000-8000-000000000002'";
const scope = "(select id from feed_data.communities where kind='department' order by slug limit 1)";
const claims = (n) => `set_config('request.jwt.claims', jsonb_build_object('sub',md5('poll-bench-user-${n}')::uuid,
  'session_id',md5('poll-bench-session-${n}')::uuid,'aal','aal1')::text,false)`;
const stats = (samples) => {
  const sorted = samples.toSorted((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
const last = (value) => value.split("\n").at(-1);

query(readFileSync(new URL("../supabase/tests/poll_performance.sql", import.meta.url), "utf8"));
const historicalSql = readFileSync(new URL("../supabase/migrations/20261120212000_phase6d_poll_access.sql", import.meta.url), "utf8");
const historicalListing = historicalSql.match(/create function public\.polls_for_client\([\s\S]*?\$\$;/)?.[0];
assert(historicalListing);
const signature = "public.polls_for_client(boolean,text,uuid,timestamptz,uuid)";
const currentListing = query(`select pg_get_functiondef('${signature}'::regprocedure)`);
query(historicalListing.replace("create function", "create or replace function"));
measureListings("Baseline");
query(currentListing);
measureListings("Candidate");

function measureListings(label) {
  const tasks = ["directory", "scoped directory", "scoped keyset", "private scope denied", "4,800 ballot detail"];
  for (const task of tasks) {
    try {
      const report = query(`
  set statement_timeout='35s';
  set plan_cache_mode='${task === "directory" ? "force_custom_plan" : "force_generic_plan"}';
  create temp table measurement(label text, elapsed numeric);
  select ${claims(1)};
  do $$
  declare start_at timestamptz; payload jsonb; scope_id uuid:=${scope}; task text:='${task}'; n integer;
    before_at timestamptz; before_id uuid;
  begin
    select created_at,id into before_at,before_id from private.polls where community_id=scope_id order by created_at desc,id desc offset 20 limit 1;
      for n in 1..15 loop
        if task='directory' then perform ${claims(4)}; end if;
        if task in ('scoped directory','scoped keyset') then perform ${claims(1)}; end if;
        if task='private scope denied' then perform ${claims(3)}; end if;
        if task='4,800 ballot detail' then perform ${claims(2)}; end if;
        start_at:=clock_timestamp();
        case task
        when 'directory' then payload:=public.polls_for_client(false,null,null,null,null);
        when 'scoped directory' then payload:=public.polls_for_client(false,'community',scope_id,null,null);
        when 'scoped keyset' then payload:=public.polls_for_client(false,'community',scope_id,before_at,before_id);
        when 'private scope denied' then payload:=public.polls_for_client(false,'community',scope_id,null,null);
        else payload:=public.poll_detail_for_client(${poll});
        end case;
        if n>3 then insert into measurement values(task,extract(epoch from clock_timestamp()-start_at)*1000); end if;
        if (task='scoped directory' and jsonb_array_length(payload)<>21)
          or (task='scoped keyset' and jsonb_array_length(payload)<>9)
          or (task='private scope denied' and payload<>'[]')
          or (task='4,800 ballot detail' and (payload->'ownBallot'<>'null' or payload->'results'<>'null'))
          then raise exception 'directory or detail bug: %',task;
        end if;
      end loop;
  end $$;
  select jsonb_object_agg(label,timings) from (
    select label, jsonb_build_object('samples',count(*),'medianMs',round(percentile_disc(.5) within group(order by elapsed),3),
      'p95Ms',round(percentile_disc(.95) within group(order by elapsed),3)) timings
    from measurement group by label
  ) values_by_task;`);
      console.log(label, "poll RPC latency", last(report));
    } catch (error) {
      if (label !== "Baseline" || !error.stderr?.includes("canceling statement due to statement timeout")) throw error;
      console.log(label, "poll RPC sample batch exceeded 35 seconds:", task);
    }
  }
}

console.log(query(`
  set plan_cache_mode='force_generic_plan';
  prepare original(uuid) as select id from private.polls where scope='community'
    and coalesce(community_id,organization_id,project_id)=$1 order by created_at desc,id desc limit 21;
  prepare indexed(uuid) as select id from private.polls where scope='community'
    and community_id=$1 order by created_at desc,id desc limit 21;
  select id as scope from feed_data.communities where kind='department' order by slug limit 1 \\gset
  explain (analyze, buffers) execute original(:'scope');
  explain (analyze, buffers) execute indexed(:'scope');`));

const release = new Date(Date.now() + 1_500).toISOString();
const votes = await Promise.all(Array.from({ length: 16 }, async (_, i) => {
  const { stderr } = await concurrent(`select ${claims(i+2)}; set statement_timeout='8s'; do $$
    declare started timestamptz; receipt jsonb;
    begin
      perform pg_sleep_until('${release}'::timestamptz);
      started:=clock_timestamp();
      receipt:=public.poll_vote_for_client(${poll},${option});
      if receipt->>'optionId'<>${option} then raise exception 'bad receipt'; end if;
      raise notice 'vote-ms=%', round(extract(epoch from clock_timestamp()-started)*1000,3);
    end $$;`);
  const match = /vote-ms=([\d.]+)/.exec(stderr);
  assert(match);
  return Number(match[1]);
}));
assert.equal(Number(query(`select count(*) from private.poll_ballots where poll_id=${poll};`)), 4816);
const retry = last(query(`select ${claims(2)}; select public.poll_vote_for_client(${poll},${option});`));
assert.equal(JSON.parse(retry).optionId, option.slice(1,-1));
console.log("16 concurrent database votes including lock wait", JSON.stringify(stats(votes)));

query(`update private.polls set closes_at=now()-interval '1 second' where id=${poll};`);
const closeSql = `select ${claims(1)}; select public.poll_transition_for_client(${poll},'close',1,null,null);`;
const lateVote = (n) => `select ${claims(n)}; do $$ begin
  perform public.poll_vote_for_client(${poll},${option}); raise exception 'late vote accepted';
exception when sqlstate 'PVG06' then null; end $$;`;
const startClose = performance.now();
await Promise.all([concurrent(closeSql), ...Array.from({ length: 8 }, (_, i) => concurrent(lateVote(i+25)))]);
const closed = JSON.parse(last(query(`select ${claims(25)}; select public.poll_detail_for_client(${poll});`)));
assert.equal(closed.status, "closed");
assert.equal(closed.ownBallot, null);
assert.equal(closed.results.total, 4816);
assert.equal(closed.results.outcome, "winner");
console.log("Close with eight late votes, all rejected", Math.round(performance.now() - startClose), "ms");

console.log(query(`
  set statement_timeout='15s';
  create temp table snapshot_time as select clock_timestamp() as started;
  do $$ declare p private.polls; begin
    select x.* into p from private.polls x where x.community_id=${scope} limit 1;
    if private.poll_snapshot(p)<>4839 then raise exception 'unexpected electorate size'; end if;
  end $$;
  select 'Snapshot ms: '||round(extract(epoch from clock_timestamp()-started)*1000,3) from snapshot_time;`));
