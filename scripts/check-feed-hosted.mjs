import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
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
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, options);
const app = createApp(config);
const run = randomUUID();
const password = `Synthetic-FEED!9-${randomUUID()}`;
const users = [];

function query(statement) {
  const result = spawnSync(process.execPath, [
    "node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
}

async function fixture(label) {
  const email = `ayinou-feed-${run}-${label}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const user = { id, email, client, token: null };
  users.push(user);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  user.token = login.data.session.access_token;
  return user;
}

function authenticatorCode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function send(method, url, user, payload, extra = {}) {
  const headers = { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) };
  return app.inject({ method, url, headers, payload });
}

async function expected(status, ...args) {
  const res = await send(...args);
  assert.equal(res.statusCode, status, `${args[0]} ${args[1]}: ${res.statusCode === status ? "" : res.body}`);
  return res.body ? res.json() : null;
}

try {
  const author = await fixture("author");
  const reader = await fixture("reader");
  const moderator = await fixture("moderator");
  const posts = "/api/v1/posts";
  const moderation = "/api/v1/moderation/feed";
  const base = { body: "  Synthetic text. Konbit.  ", language: "ht", visibility: "public" };
  const nonce = randomUUID();
  const create = (input = base, key = randomUUID()) => expected(201, "POST", posts, author, input, { "idempotency-key": key });
  await expected(401, "POST", posts, null, base, { "idempotency-key": nonce });
  const pair = await Promise.all([create(base, nonce), create(base, nonce)]);
  assert.equal(pair[0].id, pair[1].id);
  const published = pair[0].id;
  await expected(409, "POST", posts, author, { ...base, body: "Different synthetic text" }, { "idempotency-key": nonce });
  await expected(422, "POST", posts, author, { ...base, body: " \n " }, { "idempotency-key": randomUUID() });
  await expected(400, "POST", posts, author, { ...base, status: "removed" }, { "idempotency-key": randomUUID() });
  const detail = `${posts}/${published}`;
  const second = (await create({ ...base, body: "Synthetic tied timestamp" })).id;
  const members = (await create({ body: "Synthetic members only", language: "fr", visibility: "members_only" })).id;
  const draft = (await create({ body: "Synthetic private draft", language: "es", visibility: "private" })).id;
  for (const id of [published, second, members, draft]) assert.match(id, /^[0-9a-f-]{36}$/);
  query(`update feed_data.posts set created_at=(select max(created_at) from feed_data.posts where author_id='${author.id}')
    where author_id='${author.id}' and id in ('${published}','${second}');`);
  const anonymous = await expected(200, "GET", "/api/v1/feed?limit=1");
  const next = await expected(200, "GET", "/api/v1/feed?limit=1&cursor=" + anonymous.nextCursor);
  assert.deepEqual([anonymous.posts[0].id, next.posts[0].id], [published, second].sort().reverse());
  const publicPost = (await expected(200, "GET", detail)).post;
  assert.equal(publicPost.body, base.body);
  assert.ok(Number.isFinite(Date.parse(publicPost.publishedAt)));
  assert.equal(publicPost.author, null);
  assert.equal("authorId" in publicPost, false);
  assert.equal((await author.client.schema("feed_data").from("posts").select("id").limit(1)).error.code, "PGRST106");
  await expected(404, "GET", `${posts}/${members}`);
  await expected(200, "GET", `${posts}/${members}`, reader);
  await expected(404, "GET", `${posts}/${draft}`, reader);
  const mine = await expected(200, "GET", "/api/v1/feed?scope=mine", author);
  assert.equal(mine.posts.filter((post) => post.id === published).length, 1);
  const privatePost = mine.posts.find((post) => post.id === draft);
  assert.equal(privatePost.status, "draft");
  assert.equal(privatePost.publishedAt, null);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: author.id })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: "Synthetic public author", is_visible: true }).eq("user_id", author.id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: author.id, discoverable: true })).error);
  assert.ifError((await admin.from("verification_records").insert({ user_id: author.id, verification_type: "identity", status: "verified",
    reviewed_by: moderator.id, verified_at: new Date().toISOString() })).error);
  assert.deepEqual((await expected(200, "GET", detail)).post.author, {
    displayName: "Synthetic public author", username: null, avatarUrl: null, verified: true,
  });
  await expected(404, "PATCH", detail, reader, { ...base, version: 1 });
  await expected(404, "DELETE", `${detail}?version=1`, reader);
  const edits = await Promise.all([
    send("PATCH", detail, author, { ...base, body: "Synthetic racing edit one", version: 1 }),
    send("PATCH", detail, author, { ...base, body: "Synthetic racing edit two", version: 1 }),
  ]);
  assert.deepEqual(edits.map((res) => res.statusCode).sort(), [204, 409]);
  assert.equal(edits.find((res) => res.statusCode === 409).json().error.code, "CONFLICT");
  await expected(204, "DELETE", `${posts}/${draft}?version=1`, author);
  await expected(204, "DELETE", `${posts}/${draft}?version=1`, author);
  await expected(404, "GET", `${posts}/${draft}`, author);
  await expected(403, "POST", `${detail}/reports`, author, { category: "spam" });
  await expected(204, "POST", `${detail}/reports`, reader, { category: "privacy", note: "Synthetic moderator-only text." });
  assert.equal((await expected(409, "POST", `${detail}/reports`, reader, { category: "spam" })).error.code, "DUPLICATE_REPORT");
  await expected(200, "GET", detail);
  await expected(403, "GET", moderation, reader);
  query(`insert into public.role_assignments(user_id,role) select id,'moderator' from auth.users
    where id='${moderator.id}' and email='${moderator.email}';`);
  assert.equal((await expected(403, "GET", moderation, moderator)).error.code, "MFA_REQUIRED");
  const enrolled = await moderator.client.auth.mfa.enroll({ factorType: "totp" });
  assert.ifError(enrolled.error);
  const elevated = await moderator.client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id, code: authenticatorCode(enrolled.data.totp.secret),
  });
  assert.ifError(elevated.error);
  moderator.token = elevated.data.access_token;
  const queue = await expected(200, "GET", moderation, moderator);
  assert.ok(queue.reports.some((item) => item.postId === published && item.note === "Synthetic moderator-only text."));
  const review = `/api/v1/moderation/posts/${published}`;
  await expected(403, "PATCH", review, reader, { action: "hide", version: 2, reason: "Synthetic moderation rationale" });
  await expected(204, "PATCH", review, moderator, { action: "hide", version: 2, reason: "Synthetic moderation rationale" });
  await expected(404, "GET", detail, reader);
  assert.equal((await expected(200, "GET", detail, author)).post.status, "hidden");
  await expected(403, "PATCH", detail, author, { ...base, version: 3 });
  const hidden = await expected(200, "GET", `${moderation}?scope=hidden`, moderator);
  assert.ok(hidden.reports.some((item) => item.postId === published && item.lastAction.action === "hide"));
  await expected(204, "PATCH", review, moderator, { action: "restore", version: 3, reason: "Synthetic restoration rationale" });
  await expected(200, "GET", detail, reader);
  await expected(204, "PATCH", review, moderator, { action: "remove", version: 4, reason: "Synthetic removal rationale" });
  await expected(404, "GET", detail, author);
  query(`insert into private.account_restrictions(user_id,status,reason)
    select id,'suspended','Synthetic feed restriction test' from auth.users where id='${author.id}' and email='${author.email}';`);
  await expected(401, "POST", posts, author, base, { "idempotency-key": randomUUID() });
  await expected(401, "PATCH", `${posts}/${second}`, author, { ...base, version: 1 });
  await expected(404, "GET", `${posts}/${second}`);
  assert.equal((await author.client.rpc("create_post_for_client", {
    p_body: "Synthetic direct write while restricted", p_language: "ht", p_visibility: "public", p_submission: randomUUID(),
  })).error.code, "42501");
  console.log("Hosted feed creation, lost-response replay, visibility, safe authors, cursor order, stale edits, reporting, MFA moderation, and live-token restrictions passed.");
} finally {
  await app.close();
  for (const { id } of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  console.log("Synthetic feed accounts and their records removed.");
}
