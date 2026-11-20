import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const app = createApp(config);
const users = [];
const slug = randomUUID().slice(0, 8);
const password = `Synthetic-Discovery!9-${randomUUID()}`;
const orgHandle = `discovery-${slug}`;
let organization;

function query(sql) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", sql],
    { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function fixture(label, discoverable) {
  const email = `ayinou-discover-${label}-${slug}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  const username = `${label}_${slug}`;
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Discovery ${slug} ${label}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return Object.assign(user, { client, token: login.data.session.access_token });
}

async function request(status, method, url, user, payload, extra = {}) {
  const res = await app.inject({ method, url, payload, headers: { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) } });
  assert.equal(res.statusCode, status, `${method} ${url}: ${res.statusCode === status ? "" : res.body}`);
  return res.body ? res.json() : null;
}

try {
  const followed = await fixture("alpha", true);
  const viewer = await fixture("beta", true);
  const hidden = await fixture("hidden", false);
  const feed = "/api/v1/feed?scope=following";
  const member = `/api/v1/members/${followed.username}`;
  const memberFollow = `${member}/follow`;
  const people = "/api/v1/discover/people";
  const search = `${people}?q=Discovery%20${slug}&limit=1`;
  const createPost = (actor, visibility) => request(201, "POST", "/api/v1/posts", actor, {
    body: `Synthetic discovery fixture ${visibility}`, visibility, language: "ht",
  }, { "idempotency-key": randomUUID() });

  await request(401, "GET", feed);
  await request(401, "GET", people);
  await request(400, "GET", `${people}?q=x`, viewer);
  await request(400, "GET", `${people}?department=HT-OU`, viewer);
  assert.deepEqual((await request(200, "GET", feed, viewer)).posts, []);
  const page = await request(200, "GET", search, viewer);
  assert.equal(page.accounts[0].handle, followed.username);
  assert.equal(page.nextCursor, followed.username);
  assert.equal((await request(200, "GET", `${search}&cursor=${page.nextCursor}`, viewer)).accounts[0].handle, viewer.username);
  assert.deepEqual((await request(200, "GET", `${people}?q=${hidden.username}`, viewer)).accounts, []);
  assert.deepEqual((await request(200, "GET", `${people}?q=%25_`, viewer)).accounts, []);
  await request(404, "GET", `/api/v1/members/${hidden.username}/follow`);
  await request(404, "PUT", `/api/v1/members/${hidden.username}/follow`, viewer);
  await request(403, "PUT", memberFollow, followed);
  await request(400, "PUT", memberFollow, viewer, { followerId: hidden.id });

  const states = await Promise.all([1, 2, 3].map(() => request(200, "PUT", memberFollow, viewer)));
  assert.ok(states.every((state) => state.following && state.followerCount === 1));
  assert.equal((await request(200, "GET", memberFollow)).following, false);
  assert.equal((await request(200, "GET", `${member}/followers`, followed)).accounts[0].handle, viewer.username);
  await request(401, "GET", `${member}/followers`);
  await request(200, "PUT", memberFollow, hidden);
  assert.equal((await request(200, "GET", memberFollow)).followerCount, 1);
  assert.equal((await request(200, "GET", `${member}/followers`, followed)).accounts.length, 1);
  assert.equal((await request(200, "GET", "/api/v1/me/following", hidden)).accounts[0].handle, followed.username);
  const invalidSchema = await viewer.client.schema("feed_data").from("member_follows").select("follower_id");
  assert.equal(invalidSchema.error?.code, "PGRST106");

  organization = (await request(201, "POST", "/api/v1/institutions", followed, {
    handle: orgHandle, name: `Synthetic discovery school ${slug}`, kind: "education", description: "Synthetic public description",
    countryCode: "HT", departmentCode: "HT-OU", website: null, contactEmail: "synthetic-discovery-contact@example.invalid",
  })).id;
  assert.match(organization, /^[0-9a-f-]{36}$/);
  const orgFollow = `/api/v1/institutions/${organization}/follow`;
  const directory = `/api/v1/discover/institutions?q=${orgHandle}&category=education&country=HT&department=HT-OU`;
  const orgCard = (await request(200, "GET", directory, viewer)).accounts[0];
  assert.equal(orgCard.targetId, organization);
  assert.equal(orgCard.verificationStatus, "unverified");
  assert.equal("contactEmail" in orgCard, false);
  assert.deepEqual((await request(200, "GET", `${directory}&verified=true`, viewer)).accounts, []);
  await request(200, "PUT", orgFollow, viewer);
  assert.equal((await request(200, "GET", orgFollow)).followerCount, 1);
  assert.equal((await request(200, "GET", `/api/v1/institutions/${organization}/followers`, followed)).accounts[0].handle, viewer.username);
  await request(403, "GET", `/api/v1/institutions/${organization}`, viewer);
  const accounts = await request(200, "GET", "/api/v1/me/institution-accounts", viewer);
  assert.equal(accounts.organizations.length, 0);
  const list = await request(200, "GET", "/api/v1/me/following?limit=1", viewer);
  assert.equal(list.accounts[0].handle, orgHandle);
  assert.equal((await request(200, "GET", "/api/v1/me/following?cursor=" + encodeURIComponent(list.nextCursor), viewer)).accounts[0].handle, followed.username);
  const suggestions = (await request(200, "GET", "/api/v1/discover/suggestions", viewer)).accounts;
  assert.ok(suggestions.length <= 6 && !suggestions.some((item) => [hidden.username, followed.username, viewer.username, orgHandle].includes(item.handle)));

  const publicPost = await createPost(followed, "public");
  const memberPost = await createPost(followed, "members_only");
  await createPost(followed, "private");
  await createPost(viewer, "public");
  const moderated = await createPost(followed, "public");
  for (const id of [followed.id, moderated.id]) assert.match(id, /^[0-9a-f-]{36}$/);
  query(`update feed_data.posts set status='hidden' where id='${moderated.id}' and author_id='${followed.id}';`);
  await request(404, "GET", `/api/v1/posts/${memberPost.id}`);
  await request(200, "PUT", `/api/v1/posts/${publicPost.id}/reaction`, viewer, { kind: "support" });
  const first = await request(200, "GET", `${feed}&limit=1`, viewer);
  assert.equal(first.posts[0].id, memberPost.id);
  const next = await request(200, "GET", `${feed}&cursor=${first.nextCursor}`, viewer);
  assert.deepEqual(next.posts.map(({ id }) => id), [publicPost.id]);
  assert.equal(next.posts[0].reactions.mine, "support");
  assert.ifError((await admin.from("user_settings").update({ discoverable: false }).eq("user_id", followed.id)).error);
  assert.deepEqual((await request(200, "GET", feed, viewer)).posts, []);
  await request(404, "GET", memberFollow);
  await request(404, "GET", `/api/v1/profiles/${followed.username}`);
  assert.ifError((await admin.from("user_settings").update({ discoverable: true }).eq("user_id", followed.id)).error);
  assert.equal((await request(200, "GET", memberFollow, viewer)).following, true);
  await request(200, "DELETE", orgFollow, viewer);
  await request(200, "DELETE", orgFollow, viewer);
  assert.equal((await request(200, "GET", orgFollow)).followerCount, 0);
  await request(200, "DELETE", memberFollow, viewer);
  assert.deepEqual((await request(200, "GET", feed, viewer)).posts, []);
  query(`insert into private.account_restrictions(user_id,status,reason) select id,'suspended','Synthetic discovery check'
    from auth.users where id='${followed.id}' and email='${followed.email}';`);
  await request(404, "GET", `/api/v1/profiles/${followed.username}`);
  await request(404, "PUT", memberFollow, viewer);
  await request(401, "PUT", orgFollow, followed);
  console.log("Hosted discovery, privacy, concurrent follow replay, relationship lists, institution boundaries, chronological feed, and live restrictions passed.");
} finally {
  await app.close();
  try {
    if (organization) {
      assert.match(organization, /^[0-9a-f-]{36}$/);
      query(`begin; delete from private.institution_audit where organization_id='${organization}' and exists(
        select 1 from private.organizations where id='${organization}' and handle='${orgHandle}');
        delete from private.organizations where id='${organization}' and handle='${orgHandle}'; commit;`);
    }
  } finally {
    const results = await Promise.allSettled(users.map(async ({ id, email }) => {
      const record = await admin.auth.admin.getUserById(id);
      assert.ifError(record.error);
      assert.equal(record.data.user.email, email);
      assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }));
    assert.ok(results.every(({ status }) => status === "fulfilled"), "Targeted synthetic account cleanup failed");
  }
  console.log("Synthetic following accounts and institution removed.");
}
