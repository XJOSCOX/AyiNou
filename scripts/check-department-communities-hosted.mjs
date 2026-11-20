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
const imageIds = [];
const slug = randomUUID().slice(0, 8);
const password = `Synthetic-Departments!9-${randomUUID()}`;
const nord = "/api/v1/communities/nord";
const west = "/api/v1/communities/ouest";
const appealPath = "/api/v1/me/moderation-appeals";

function query(statement) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--remote", "--yes", statement],
    { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function fixture(label, mfa = false) {
  const email = `ayinou-dept-${label}-${slug}@example.invalid`;
  const username = `dept_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Department ${label} ${slug}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const token = login.data.session.access_token;
  Object.assign(user, { client, token, lowToken: token });
  if (mfa) {
    const enrollment = await client.auth.mfa.enroll({ factorType: "totp" });
    assert.ifError(enrollment.error);
    const challenge = await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret),
    });
    assert.ifError(challenge.error);
    user.token = challenge.data.access_token;
  }
  return user;
}

const nonce = () => ({ "idempotency-key": randomUUID() });
const send = (method, url, user, payload, extra = {}) => app.inject({
  method, url, payload, headers: { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) },
});
async function request(status, method, url, user, payload, extra) {
  const response = await send(method, url, user, payload, extra);
  assert.equal(response.statusCode, status, `${method} ${url}: ${response.headers["content-type"]?.includes("json") ? response.body : "unexpected response"}`);
  return response.body && response.headers["content-type"]?.includes("json") ? response.json() : response;
}

try {
  const catalog = (await request(200, "GET", "/api/v1/communities")).communities;
  assert.equal(catalog.length, 10);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, 10);
  assert.equal(catalog.find(({ slug }) => slug === "grand-anse").name, "Grand'Anse");
  const detail = await request(200, "GET", nord);
  assert.deepEqual(Object.keys(detail.content), ["ht", "fr", "en", "es"]);
  assert.ok(Object.values(detail.content).every((entry) => entry.description.includes("Nord") && entry.rules.length === 3));
  const author = await fixture("author");
  const reader = await fixture("reader");
  const moderator = await fixture("moderator", true);
  const operator = await fixture("operator", true);
  query(`insert into public.role_assignments(user_id,role) select id,'administrator' from auth.users where id='${operator.id}' and email='${operator.email}';`);
  assert.deepEqual((await request(200, "GET", "/api/v1/me/communities", author)).communities, []);
  await request(403, "GET", nord + "/posts", author);
  await request(403, "POST", nord + "/posts", author, { body: "Account must join first.", language: "en" }, nonce());
  const joins = await Promise.all([request(200, "POST", nord + "/join", author), request(200, "POST", nord + "/join", author)]);
  assert.ok(joins.every(({ community }) => community.joined && !community.directoryVisible));
  await request(200, "POST", west + "/join", author);
  assert.equal((await request(200, "GET", "/api/v1/me/communities", author)).communities.length, 2);
  await request(200, "POST", west + "/join", reader);
  const attachment = randomUUID();
  imageIds.push(attachment);
  const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#2b6653" } }).png().toBuffer();
  await request(201, "POST", "/api/v1/me/post-media", author, { image: image.toString("base64") }, { "idempotency-key": attachment });
  const input = { body: `Synthetic Nord discussion ${slug}`, language: "ht", topics: ["culture"], attachments: [{ id: attachment, alt: "Test image" }] };
  const submission = nonce();
  const submitted = await Promise.all([request(201, "POST", nord + "/posts", author, input, submission),
    request(201, "POST", nord + "/posts", author, input, submission)]);
  assert.equal(submitted[0].id, submitted[1].id);
  await request(409, "POST", west + "/posts", author, input, submission);
  const post = `/api/v1/posts/${submitted[0].id}`;
  const media = `${post}/attachments/${attachment}/image`;
  await request(404, "GET", post);
  await request(404, "GET", post, reader);
  await request(404, "GET", media, reader);
  await request(403, "GET", nord + "/members", reader);
  assert.ok((await reader.client.storage.from("post-media").download(`${attachment}/thumbnail.webp`)).error);
  await request(200, "POST", nord + "/join", reader);
  assert.deepEqual((await request(200, "GET", nord + "/members", reader)).accounts, []);
  await request(200, "PATCH", nord + "/membership", author, { directoryVisible: true });
  const members = (await request(200, "GET", nord + "/members", reader)).accounts;
  assert.equal(members.find(({ handle }) => handle === author.username).kind, "member");
  assert.ok(!JSON.stringify(members).includes(author.email));
  await request(200, "GET", media, reader);
  const westPost = await request(201, "POST", west + "/posts", author, { body: "Synthetic Ouest discussion", language: "es" }, nonce());
  const newer = await request(201, "POST", nord + "/posts", author, { body: "Second synthetic Nord discussion", language: "fr" }, nonce());
  const page = await request(200, "GET", nord + "/posts?limit=1", reader);
  assert.equal(page.posts[0].id, newer.id);
  assert.ok(page.nextCursor);
  assert.deepEqual((await request(200, "GET", nord + "/posts?limit=1&cursor=" + page.nextCursor, reader)).posts.map(({ id }) => id), [submitted[0].id]);
  await request(200, "PUT", `/api/v1/members/${author.username}/follow`, reader);
  for (const scope of ["feed", "following", "for_you"]) {
    const timeline = await request(200, "GET", `/api/v1/feed?scope=${scope}`, reader);
    assert.ok(timeline.posts.every((item) => ![submitted[0].id, westPost.id, newer.id].includes(item.id)));
  }
  const comment = await request(201, "POST", post + "/comments", reader, { body: "Synthetic local comment", language: "es" }, nonce());
  await request(201, "POST", post + "/comments", author, { body: "Synthetic local reply", language: "fr", parentId: comment.id }, nonce());
  await request(200, "PUT", post + "/reaction", reader, { kind: "support" });
  await request(204, "POST", post + "/reports", reader, { category: "other", note: "Synthetic room report" });
  await request(204, "POST", `/api/v1/comments/${comment.id}/reports`, author, { category: "other", note: "Synthetic comment report" });
  await request(403, "PATCH", nord + "/staff", reader, { username: reader.username, role: "moderator", reason: "Unauthorized role change." });
  await request(204, "PATCH", nord + "/staff", operator, { username: moderator.username, role: "moderator", reason: "Synthetic staff assignment." });
  // Once TOTP is enrolled, the live-session verifier rejects this old AAL1 token before checking the room.
  await request(401, "GET", nord + "/moderation", { ...moderator, token: moderator.lowToken });
  await request(403, "GET", west + "/moderation", moderator);
  await request(403, "GET", "/api/v1/moderation/feed", moderator);
  assert.ok((await request(200, "GET", nord + "/moderation?target=comments", moderator)).reports.some(({ commentId }) => commentId === comment.id));
  await request(404, "PATCH", nord + "/moderation/posts/" + westPost.id, moderator, { version: 1, action: "hide", reason: "Wrong room fixture." });
  await request(204, "PATCH", nord + "/moderation/posts/" + submitted[0].id, moderator, { version: 1, action: "hide", reason: "Synthetic room moderation." });
  await request(404, "GET", media, reader);
  await request(200, "GET", media + "?review=true", moderator);
  const decision = (await request(200, "GET", appealPath, author)).decisions.find((item) => item.eligible);
  assert.ok(decision);
  const appeal = await request(201, "POST", `/api/v1/moderation/actions/${decision.id}/appeals`, author,
    { kind: "post", reason: "Please review this local synthetic post." });
  await request(204, "PATCH", `/api/v1/moderation/appeals/${appeal.id}`, operator,
    { outcome: "overturned", explanation: "Independent fixture review restores the post." });
  await request(200, "GET", media, reader);
  await request(200, "DELETE", nord + "/membership", reader);
  await request(404, "GET", media, reader);
  const alerts = (await request(200, "GET", "/api/v1/me/notifications", reader)).notifications;
  assert.ok(alerts.every(({ postId }) => postId !== submitted[0].id));
  console.log("Hosted official catalog, concurrent joins and posts, directory/privacy, paging, isolated global feeds, scoped real-TOTP moderation, media and appeals passed.");

  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase4a-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: reader.email, password, text: input.body }), { mode: 0o600 });
      console.log("Browser fixture ready. Press Enter to remove the synthetic records.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(file, { force: true });
    }
  }
} finally {
  await app.close();
  if (imageIds.length) assert.ifError((await admin.storage.from("post-media").remove(
    imageIds.flatMap((id) => [`${id}/thumbnail.webp`, `${id}/display.webp`]))).error);
  if (users.length) {
    const identities = users.map(({ id, email }) => `('${id}'::uuid,'${email}')`).join(",");
    query(`begin; create temporary table department_fixture_ids on commit drop as
      select u.id from auth.users u join (values ${identities}) f(id,email) on u.id=f.id and u.email=f.email;
      delete from feed_data.notifications n where n.appeal_id in (
        select id from feed_data.moderation_appeals where appellant_id in (select id from department_fixture_ids));
      delete from feed_data.moderation_appeals where appellant_id in (select id from department_fixture_ids);
      delete from feed_data.community_staff_audit where actor_id in (select id from department_fixture_ids)
        and target_id in (select id from department_fixture_ids);
      delete from feed_data.post_attachments where author_id in (select id from department_fixture_ids);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from department_fixture_ids);
      commit;`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic accounts and image objects removed.");
}
