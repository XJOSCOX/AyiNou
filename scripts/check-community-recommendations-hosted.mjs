import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../apps/api/src/app.ts";
import { readConfig } from "../apps/api/src/config.ts";

const project = "hcbxulyfmdmuyccgrujs";
assert.equal(process.env.AYINOU_HOSTED_TEST_PROJECT_REF, project);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), project);
dotenv.config({ path: "apps/api/.env", quiet: true });
const config = readConfig({ ...process.env, LOG_LEVEL: "silent" });
assert.equal(new URL(config.SUPABASE_URL).hostname, `${project}.supabase.co`);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const app = createApp(config);
const users = [];
const suffix = randomUUID().slice(0, 8);
const password = `Synthetic-Discovery!9-${randomUUID()}`;
const base = "/api/v1/communities";
const list = base + "/recommendations/list";
const settings = "/api/v1/me/community-recommendation-settings";
const reset = "/api/v1/me/community-recommendation-feedback";
const slugs = ["learning", "diaspora", "approval", "private"].map((value) => `check-${value}-${suffix}`);
const room = (slug) => `${base}/${slug}`;

function query(statement) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement],
    { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function fixture(label) {
  const email = `ayinou-discovery-${label}-${suffix}@example.invalid`;
  const username = `rec_${label}_${suffix}`;
  const account = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(account.error);
  const id = account.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Discovery ${label} ${suffix}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  user.token = login.data.session.access_token;
  return user;
}

async function request(expected, method, url, user, payload, headers) {
  const response = await app.inject({ method, url, payload,
    headers: { ...headers, ...(user ? { authorization: `Bearer ${user.token}` } : {}) } });
  assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body}`);
  return response.body ? response.json() : null;
}

try {
  const owner = await fixture("owner");
  const reader = await fixture("reader");
  const stranger = await fixture("other");
  const known = await request(200, "GET", base);
  assert.equal(known.communities.length, 10);
  const [learning, diaspora, approval, hidden] = await Promise.all([
    { slug: slugs[0], name: `Learning ${suffix}`, kind: "interest", policy: "public", topic: "education", countryCode: null, discussionPublic: false },
    { slug: slugs[1], name: `Diaspora ${suffix}`, kind: "diaspora", policy: "public", topic: null, countryCode: "CA", discussionPublic: true },
    { slug: slugs[2], name: `Approval ${suffix}`, kind: "interest", policy: "approval", topic: "culture", countryCode: null, discussionPublic: false },
    { slug: slugs[3], name: `Private ${suffix}`, kind: "interest", policy: "private", topic: "education", countryCode: null, discussionPublic: false },
  ].map((fields) => request(201, "POST", base, owner, {
    ...fields, description: "Synthetic fixture used only by the hosted recommendations check.", rules: "Only test accounts should participate.",
  }, { "idempotency-key": randomUUID() }).then(({ community }) => community)));
  const posted = await request(201, "POST", room(diaspora.slug) + "/posts", owner,
    { body: "Eligible public fixture activity.", language: "ht", groupVersion: 1 }, { "idempotency-key": randomUUID() });
  const restrictedPost = await request(201, "POST", room(approval.slug) + "/posts", owner,
    { body: "Restricted approval-only fixture activity.", language: "fr", groupVersion: 1 }, { "idempotency-key": randomUUID() });
  const prefs = await request(200, "PUT", "/api/v1/recommendations/settings", reader, { topics: ["education"] });
  assert.deepEqual(prefs.topics, ["education"]);

  await request(401, "GET", list);
  await request(400, "GET", list + "?country=canada", reader);
  const target = `search=${suffix}`;
  const initial = await request(200, "GET", `${list}?${target}&limit=1`, reader);
  assert.equal(initial.algorithmVersion, "v1");
  assert.equal(initial.recommendations[0].community.id, learning.id);
  assert.equal(initial.recommendations[0].reason, "interest");
  assert.ok(initial.nextCursor);
  const subsequent = `${list}?${target}&cursor=${initial.nextCursor}&limit=1`;
  const second = await request(200, "GET", subsequent, reader);
  assert.deepEqual(await request(200, "GET", subsequent, reader), second);
  assert.equal(second.recommendations[0].community.id, diaspora.id);
  assert.equal(second.recommendations[0].recentPublicActivity, true);
  await request(409, "GET", subsequent, stranger);

  const publicGroups = await request(200, "GET", `${base}/groups?${target}`);
  assert.deepEqual(new Set(publicGroups.communities.map(({ id }) => id)), new Set([learning.id, diaspora.id, approval.id]));
  await request(404, "GET", room(hidden.slug));
  const displayed = await request(200, "GET", `${list}?${target}`, reader);
  const approvalCard = displayed.recommendations.find((entry) => entry.community.id === approval.id);
  assert.equal(approvalCard.recentPublicActivity, false);
  assert.equal(JSON.stringify(displayed).includes(restrictedPost.id), false);
  await request(404, "GET", `/api/v1/posts/${restrictedPost.id}`, reader);
  await request(200, "GET", `/api/v1/posts/${posted.id}`);

  const feedback = room(diaspora.id) + "/recommendation-feedback";
  await request(204, "POST", feedback, reader, { action: "hide" });
  await request(204, "POST", feedback, reader, { action: "hide" });
  assert.deepEqual(await request(200, "GET", settings, reader), { hidden: 1, notInterested: 0 });
  assert.deepEqual(await request(200, "GET", settings, stranger), { hidden: 0, notInterested: 0 });
  assert.ok((await request(200, "GET", subsequent, reader)).recommendations.every(({ community }) => community.id !== diaspora.id));
  await request(204, "POST", feedback, reader, { action: "restore" });
  assert.equal((await request(200, "GET", subsequent, reader)).recommendations[0].community.id, diaspora.id);
  await request(200, "POST", room(approval.slug) + "/join", reader);
  const my = "/api/v1/me/community-activity";
  assert.equal((await request(200, "GET", my + "?view=pending", reader)).communities[0].id, approval.id);
  assert.equal((await request(200, "GET", my + "?view=managed", owner)).communities.length, 4);
  await request(204, "DELETE", reset, reader);
  await request(409, "GET", subsequent, reader);
  assert.ok((await request(200, "GET", `${list}?${target}`, reader)).recommendations.every(({ community }) => community.id !== approval.id));
  assert.deepEqual((await request(200, "GET", base)).communities.map(({ id }) => id), known.communities.map(({ id }) => id));
  console.log("Hosted recommendations, private feedback, stable paging, account boundaries and live membership passed.");

  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase4c-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: reader.email, password, suffix, learningName: learning.name }), { mode: 0o600, flag: "wx" });
      console.log("Browser fixture ready. Press Enter to remove the synthetic records.");
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
    const knownSlugs = slugs.map((slug) => `'${slug}'`).join(",");
    query(`begin; create temporary table rec_fixture_users on commit drop as
      select u.id from auth.users u join (values ${identities}) f(id,email) on u.id=f.id and u.email=f.email;
      create temporary table rec_fixture_groups on commit drop as
      select c.id from feed_data.communities c join feed_data.group_creations gc on gc.community_id=c.id
        where c.slug in (${knownSlugs}) and gc.creator_id in (select id from rec_fixture_users);
      delete from feed_data.posts where community_id in (select id from rec_fixture_groups)
        and author_id in (select id from rec_fixture_users);
      delete from feed_data.communities where id in (select id from rec_fixture_groups);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from rec_fixture_users);
      commit;`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic recommendation accounts and groups removed.");
}
