import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import sharp from "sharp";
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
const images = [];
const slug = randomUUID().slice(0, 8);
const password = `Synthetic-Safety!9-${randomUUID()}`;

function sql(statement) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement],
    { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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

async function fixture(label, moderator = false) {
  const email = `ayinou-safety-${label}-${slug}@example.invalid`;
  const username = `safety_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username, name: `Safety ${label} ${slug}` };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: user.name, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  user.client = client;
  user.token = signed.data.session.access_token;
  if (moderator) {
    sql(`insert into public.role_assignments(user_id,role) select id,'moderator' from auth.users where id='${id}' and email='${email}';`);
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp" });
    assert.ifError(enrolled.error);
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id, code: authenticatorCode(enrolled.data.totp.secret),
    });
    assert.ifError(verified.error);
    user.token = verified.data.access_token;
  }
  return user;
}

const duplicate = () => ({ "idempotency-key": randomUUID() });
const send = (method, url, user, payload, extra = {}) => app.inject({
  method, url, payload, headers: { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) },
});
async function request(status, method, url, user, payload, extra) {
  const response = await send(method, url, user, payload, extra);
  assert.equal(response.statusCode, status, `${method} ${url}: ${response.headers["content-type"]?.includes("json") ? response.body : "unexpected response"}`);
  return response.body && response.headers["content-type"]?.includes("json") ? response.json() : response;
}
const appeals = "/api/v1/me/moderation-appeals";
const review = "/api/v1/moderation/appeals";

try {
  const [alice, bob, first, second] = [await fixture("alice"), await fixture("bob"), await fixture("first", true), await fixture("second", true)];
  const bobProfile = `/api/v1/members/${bob.username}`;
  const aliceProfile = `/api/v1/members/${alice.username}`;
  await request(200, "PUT", bobProfile + "/follow", alice);
  await request(200, "PUT", aliceProfile + "/follow", bob);
  const uploadId = randomUUID();
  const file = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#327561" } }).png().toBuffer();
  images.push(uploadId);
  await request(201, "POST", "/api/v1/me/post-media", bob, { image: file.toString("base64") }, { "idempotency-key": uploadId });
  const { id } = await request(201, "POST", "/api/v1/posts", bob, {
    body: "Phase 3F synthetic public post", language: "en", visibility: "public", attachments: [{ id: uploadId }],
  }, duplicate());
  const post = `/api/v1/posts/${id}`;
  const media = `${post}/attachments/${uploadId}/image`;
  await request(200, "GET", media, alice);
  await request(204, "PUT", bobProfile + "/mute", alice);
  assert.equal((await request(200, "GET", bobProfile + "/mute", alice)).muted, true);
  assert.ok(!(await request(200, "GET", "/api/v1/feed?scope=following", alice)).posts.some((item) => item.id === id));
  await request(200, "GET", media, alice);
  await request(204, "DELETE", bobProfile + "/mute", alice);
  const concurrentBlocks = await Promise.all([send("PUT", bobProfile + "/block", alice), send("PUT", bobProfile + "/block", alice)]);
  assert.deepEqual(concurrentBlocks.map(({ statusCode }) => statusCode), [204, 204]);
  const listing = await request(200, "GET", "/api/v1/me/blocked", alice);
  assert.deepEqual(listing.accounts.map((member) => member.id), [bob.id]);
  assert.deepEqual((await request(200, "GET", "/api/v1/me/blocked", bob)).accounts, []);
  await request(404, "GET", `/api/v1/profiles/${bob.username}`, alice);
  await request(404, "GET", `/api/v1/profiles/${alice.username}`, bob);
  await request(200, "GET", `/api/v1/profiles/${bob.username}`);
  await request(404, "GET", media, alice);
  await request(200, "GET", media);
  await request(404, "PUT", bobProfile + "/follow", alice);
  await request(404, "PUT", post + "/reaction", alice, { kind: "like" });
  await request(404, "POST", post + "/comments", alice, { body: "This must not appear.", language: "en" }, duplicate());
  await request(204, "DELETE", `/api/v1/me/blocked/${bob.id}`, alice);
  assert.equal((await request(200, "GET", bobProfile + "/follow", alice)).following, false);
  await request(200, "GET", media, alice);

  await request(204, "PATCH", `/api/v1/moderation/posts/${id}`, first, { version: 1, action: "hide", reason: "Private synthetic reviewer rationale." });
  await request(404, "GET", media, alice);
  await request(200, "GET", media + "?review=true", first);
  const decision = (await request(200, "GET", appeals, bob)).decisions[0];
  assert.ok(decision.eligible);
  assert.ok(!JSON.stringify(decision).includes("Private synthetic"));
  const submit = `/api/v1/moderation/actions/${decision.id}/appeals`;
  await request(404, "POST", submit, alice, { kind: "post", reason: "This member does not own it." });
  const input = { kind: "post", reason: "Please reconsider the context." };
  const submissions = await Promise.all([request(201, "POST", submit, bob, input), request(201, "POST", submit, bob, input)]);
  assert.equal(submissions[0].id, submissions[1].id);
  const appeal = `${review}/${submissions[0].id}`;
  const outcome = { outcome: "overturned", explanation: "The reviewer examined the relevant context." };
  assert.equal((await request(403, "PATCH", appeal, first, outcome)).error.code, "APPEAL_REVIEW_CONFLICT");
  await request(403, "PATCH", appeal, bob, outcome);
  const pending = (await request(200, "GET", review, second)).decisions.find(({ id }) => id === submissions[0].id);
  assert.equal(pending.originalReason, "Private synthetic reviewer rationale.");
  assert.equal(pending.attachments[0].id, uploadId);
  await request(204, "PATCH", appeal, second, outcome);
  await request(409, "PATCH", appeal, second, outcome);
  await request(200, "GET", media, alice);
  const notice = (await request(200, "GET", "/api/v1/me/notifications", bob)).notifications.find(({ kind }) => kind === "appeal_decided");
  assert.equal(notice.appealId, submissions[0].id);
  assert.equal(notice.actor, null);
  assert.equal(notice.postId, null);
  assert.equal((await request(200, "GET", appeals, bob)).decisions[0].appeal.outcome, "overturned");
  console.log("Hosted API and Storage checks passed for block scope, concurrent block and appeal retries, real TOTP reviewers, preserved media, and private appeal notifications.");

  if (process.argv.includes("--browser")) {
    const browserFixture = "supabase/.temp/phase3f-browser.json";
    const waiting = await request(201, "POST", "/api/v1/posts", bob, {
      body: "Phase 3F browser fixture", language: "en", visibility: "public",
    }, duplicate());
    await request(204, "PATCH", `/api/v1/moderation/posts/${waiting.id}`, first, {
      version: 1, action: "hide", reason: "Synthetic browser appeal action.",
    });
    try {
      writeFileSync(browserFixture, JSON.stringify({ email: bob.email, password, other: alice.username, otherName: alice.name }), { mode: 0o600 });
      console.log("Browser fixture ready. Press Enter to remove the synthetic data.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(browserFixture, { force: true });
    }
  }
} finally {
  await app.close();
  if (users.length) {
    const members = users.map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
    sql(`begin; create temporary table safety_fixture_ids on commit drop as
      select u.id from auth.users u join (values ${members}) f(id,email) on u.id=f.id and u.email=f.email;
      delete from feed_data.notifications n where n.appeal_id in (
        select id from feed_data.moderation_appeals where appellant_id in (select id from safety_fixture_ids));
      delete from feed_data.moderation_appeals where appellant_id in (select id from safety_fixture_ids);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from safety_fixture_ids);
      commit;`);
  }
  if (images.length) {
    assert.ifError((await admin.storage.from("post-media").remove(images.flatMap((id) =>
      [`${id}/thumbnail.webp`, `${id}/display.webp`]))).error);
    // Storage paths above were generated by this run. Retire their metadata before deleting Auth fixtures.
    const ids = images.map((id) => `'${id}'::uuid`).join(",");
    sql(`delete from feed_data.post_attachments where id in (${ids}) and author_id in
      (select u.id from auth.users u where u.email='ayinou-safety-bob-${slug}@example.invalid');`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic safety records and objects removed.");
}
