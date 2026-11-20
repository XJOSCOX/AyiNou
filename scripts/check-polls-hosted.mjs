import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(new URL(config.SUPABASE_URL).hostname, project + ".supabase.co");
const auth = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, auth);
const app = createApp(config);
const stamp = randomUUID().slice(0, 8);
const slug = "poll-fixture-" + stamp;
const password = "Synthetic-Poll!9-" + randomUUID();
const users = [];
const base = "/api/v1/polls";

async function fixture(role) {
  const email = `ayinou-poll-${role}-${stamp}@example.invalid`;
  const create = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(create.error);
  const id = create.data.user.id;
  assert.match(id, /^[a-f0-9-]{36}$/);
  users.push({ id, email });
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({
    display_name: "Poll fixture " + stamp, username: `poll_${role}_${stamp}`, is_visible: false,
  }).eq("user_id", id)).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, auth);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { email, client, token: login.data.session.access_token };
}

const send = (method, url, user, payload) => app.inject({
  method, url, payload, headers: user ? { authorization: "Bearer " + user.token } : {},
});
async function request(status, method, url, user, payload) {
  const response = await send(method, url, user, payload);
  assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
  return response.json();
}

try {
  const owner = await fixture("owner");
  const outside = await fixture("outside");
  const group = await owner.client.rpc("create_member_group_for_client", {
    p_submission: randomUUID(), p_name: "Private voting fixture " + stamp, p_slug: slug, p_kind: "diaspora",
    p_description: "A synthetic fixture for scoped voting.", p_rules: "Temporary fixture kept private.",
    p_policy: "private", p_public: false, p_country: "CA", p_topic: null,
  });
  assert.ifError(group.error);
  const opens = Date.now() + 10_000;
  const payload = {
    title: "Private voting fixture " + stamp, description: "Verify concurrent submissions.",
    scope: "community", scopeId: group.data.id, taskId: null, kind: "community", policy: "advisory",
    language: "en", audience: "scope", eligibility: "active", resultPolicy: "after_vote",
    opensAt: new Date(opens).toISOString(), closesAt: new Date(opens + 3600_000).toISOString(),
    quorum: null, threshold: null, key: randomUUID(), options: ["One", "Two"],
  };
  const first = await request(201, "POST", base, owner, payload);
  const replay = await request(201, "POST", base, owner, payload);
  assert.equal(first.id, replay.id);
  const path = base + "/" + first.id;
  await request(200, "POST", path + "/transition", owner, { action: "publish", version: first.version });
  await request(401, "GET", path);
  await request(404, "GET", path, outside);
  assert.deepEqual((await request(200, "GET", base + "?scope=community&scopeId=" + group.data.id, outside)).items, []);
  await request(409, "GET", path + "/results", owner);
  await sleep(Math.max(0, opens - Date.now() + 500));
  let details = await request(200, "GET", path, owner);
  for (let attempt = 0; details.status === "scheduled" && attempt < 8; attempt++) {
    await sleep(1000);
    details = await request(200, "GET", path, owner);
  }
  assert.equal(details.status, "open", "Hosted database did not reach the opening time");
  const choices = details.options.map(({ id }) => id);
  const ballots = await Promise.all(choices.map((optionId) => send("POST", path + "/ballot", owner, { optionId })));
  assert.deepEqual(ballots.map(({ statusCode }) => statusCode).sort(), [200, 409], ballots.map((item) => item.body).join("\n"));
  const accepted = ballots.find(({ statusCode }) => statusCode === 200).json();
  assert.equal(ballots.find(({ statusCode }) => statusCode === 409).json().error.code, "POLL_BALLOT_EXISTS");
  assert.deepEqual(await request(200, "POST", path + "/ballot", owner, accepted), accepted);
  assert.deepEqual(await request(200, "GET", path + "/ballot", owner), accepted);
  const tally = await request(200, "GET", path + "/results", owner);
  assert.equal(tally.total, 1);
  assert.deepEqual(tally.options.map(({ votes }) => votes).sort(), [0, 1]);
  await request(404, "GET", path + "/results", outside);
  console.log("Hosted Fastify vote race, single receipt, sealed preview, and private scope passed.");
  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase6d-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: owner.email, password, pollId: first.id }), { mode: 0o600, flag: "wx" });
      console.log("Browser fixture ready. Press Enter to clean up.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(file, { force: true });
    }
  }
} finally {
  await app.close();
  if (users.length) {
    const identities = users.map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
    const query = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", `
      begin;
      create temporary table poll_fixture_accounts on commit drop as
        select u.id from auth.users u join (values ${identities}) f(id,email) on (u.id,u.email)=(f.id,f.email);
      delete from private.polls where creator_id in (select id from poll_fixture_accounts);
      delete from feed_data.communities c where c.slug='${slug}' and c.owner_id in (select id from poll_fixture_accounts);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from poll_fixture_accounts);
      commit;`], { encoding: "utf8", timeout: 30000 });
    assert.equal(query.status, 0, query.stderr || query.stdout);
  }
  for (const { id, email } of users) {
    const account = await admin.auth.admin.getUserById(id);
    assert.ifError(account.error);
    assert.equal(account.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Synthetic poll, group, and accounts removed.");
}
