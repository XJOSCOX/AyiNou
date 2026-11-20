import assert from "node:assert/strict";
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
const password = `Synthetic-Recommendation!9-${randomUUID()}`;

async function fixture(label, discoverable) {
  const email = `ayinou-rank-${label}-${slug}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  const username = `${label}_${slug}`;
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Recommendation ${slug} ${label}`, is_visible: true, username }).eq("user_id", id)).error);
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
  const author = await fixture("author", true);
  const viewer = await fixture("viewer", true);
  const stranger = await fixture("stranger", true);
  const feed = "/api/v1/feed?scope=for_you";
  const settings = "/api/v1/recommendations/settings";
  const create = (id, value, status = 201) => request(status, "POST", "/api/v1/posts", author, value, { "idempotency-key": id });
  const untagged = (await create(randomUUID(), { body: "Synthetic untagged recommendation", language: "ht", visibility: "public" })).id;
  const key = randomUUID();
  const input = { body: "Synthetic topic relevance", visibility: "members_only", language: "ht", topics: ["education", "culture"] };
  const tagged = (await create(key, input)).id;
  assert.equal((await create(key, { ...input, topics: ["culture", "education"] })).id, tagged);
  assert.equal((await create(key, { ...input, topics: [] }, 409)).error.code, "CONFLICT");
  assert.equal((await create(key, { body: input.body, language: input.language, visibility: input.visibility }, 409)).error.code, "CONFLICT");
  await create(randomUUID(), { ...input, topics: ["education", "culture", "healthcare", "peace"] }, 400);
  const taggedPath = `/api/v1/posts/${tagged}`;
  await request(404, "GET", taggedPath);
  assert.deepEqual((await request(200, "GET", taggedPath, viewer)).post.topics, ["culture", "education"]);
  await request(404, "PATCH", taggedPath, viewer, { ...input, topics: ["peace"], version: 1 });
  assert.equal((await request(200, "GET", taggedPath, viewer)).post.version, 1);
  await request(204, "PATCH", taggedPath, author, { ...input, topics: ["culture", "education"], version: 1 });
  const restricted = await viewer.client.schema("feed_data").from("recommendation_snapshots").select("post_ids");
  assert.equal(restricted.error?.code, "PGRST106");

  await request(401, "GET", feed);
  await request(401, "GET", settings);
  await request(400, "GET", `${feed}&cursor=invalid`, viewer);
  assert.deepEqual((await request(200, "GET", settings, viewer)).topics, []);
  assert.deepEqual((await request(200, "PUT", settings, viewer, { topics: ["education", "culture"] })).topics, ["culture", "education"]);
  assert.deepEqual((await request(200, "GET", settings, stranger)).topics, []);
  await request(200, "PUT", `/api/v1/members/${author.username}/follow`, viewer);
  const first = await request(200, "GET", `${feed}&limit=1`, viewer);
  assert.equal(first.algorithmVersion, "v1");
  assert.equal(first.posts[0].id, tagged);
  assert.equal(first.posts[0].recommendationReason, "topic");
  assert.equal("rankPosition" in first.posts[0], false);
  assert.ok(first.nextCursor);
  const after = `${feed}&cursor=${first.nextCursor}`;
  const nextBefore = await request(200, "GET", after, viewer);
  assert.ok(nextBefore.posts.some(({ id }) => id === untagged));
  assert.ok(nextBefore.posts.every(({ id }) => id !== tagged));
  assert.equal((await request(409, "GET", after, stranger)).error.code, "FEED_REFRESH_REQUIRED");
  await request(200, "PUT", `/api/v1/posts/${untagged}/reaction`, viewer, { kind: "support" });
  const nextAfter = await request(200, "GET", after, viewer);
  assert.deepEqual(nextBefore.posts.map(({ id }) => id), nextAfter.posts.map(({ id }) => id));
  assert.equal(nextAfter.posts.find(({ id }) => id === untagged)?.reactions.mine, "support");
  const following = (await request(200, "GET", "/api/v1/feed?scope=following", viewer)).posts;
  assert.deepEqual(following.map(({ id }) => id), [tagged, untagged]);
  assert.ok(following.every((item) => !item.recommendationReason));
  await request(204, "POST", `${taggedPath}/recommendation-feedback`, viewer, { action: "hide_author" });
  assert.ok((await request(200, "GET", after, viewer)).posts.every(({ id }) => id !== untagged));
  const hidden = await request(200, "GET", feed, viewer);
  assert.ok(hidden.posts.every(({ id }) => id !== tagged && id !== untagged));
  assert.deepEqual((await request(200, "GET", "/api/v1/feed?scope=following", viewer)).posts.map(({ id }) => id), [tagged, untagged]);
  assert.equal((await request(200, "DELETE", "/api/v1/recommendations/feedback", viewer)).feedbackCount, 0);
  assert.equal((await request(200, "GET", `${feed}&limit=1`, viewer)).posts[0].id, tagged);
  assert.ifError((await admin.from("user_settings").update({ discoverable: false }).eq("user_id", author.id)).error);
  const unavailable = await request(200, "GET", feed, viewer);
  assert.ok(unavailable.posts.every(({ id }) => id !== untagged && id !== tagged));
  await request(404, "POST", `${taggedPath}/recommendation-feedback`, viewer, { action: "not_interested" });
  console.log("Hosted recommendation topics, legacy posts, live sessions, snapshot ownership, feedback, reactions, and chronological feed passed.");
} finally {
  await app.close();
  const results = await Promise.allSettled(users.map(async ({ id, email }) => {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }));
  assert.ok(results.every(({ status }) => status === "fulfilled"), "Targeted recommendation account cleanup failed");
  console.log("Synthetic recommendation accounts and posts removed.");
}
