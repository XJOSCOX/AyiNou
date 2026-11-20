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
const password = `Synthetic-Groups!9-${randomUUID()}`;
const base = "/api/v1/communities";
const inbox = "/api/v1/me/community-invitations";
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
  const email = `ayinou-group-${label}-${slug}@example.invalid`;
  const username = `grp_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Group ${label} ${slug}`, is_visible: true, username }).eq("user_id", id)).error);
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


const tags = ["public", "approval", "private", "limit1", "limit2", "browser"];
const slugs = tags.map((tag) => `check-${tag}-${slug}`);
const settings = (name, policy, discussionPublic = false) => ({
  name: `Synthetic ${name} ${slug}`, description: "Only used by the phase 4B hosted check.",
  rules: "Synthetic members must follow the test rules.", policy, discussionPublic, countryCode: null, topic: "culture",
});
const input = (name, policy, discussionPublic = false) => ({
  ...settings(name, policy, discussionPublic), slug: `check-${name}-${slug}`, kind: "interest",
});
const route = (tag) => `${base}/check-${tag}-${slug}`;
const reason = "Recorded synthetic test decision.";
const decision = (url, user, action, extra) => request(200, "POST", url + "/management", user, { action, reason, ...extra });

try {
  const initial = (await request(200, "GET", base)).communities;
  assert.equal(initial.length, 10);
  const owner = await fixture("owner", true);
  const member = await fixture("member");
  const moderator = await fixture("review", true);
  const observer = await fixture("guest");
  const operator = await fixture("operator", true);
  query(`insert into public.role_assignments(user_id,role) select id,'administrator' from auth.users where id='${operator.id}' and email='${operator.email}';`);

  const key = nonce();
  const publicRoom = route("public");
  const approvalRoom = route("approval");
  const privateRoom = route("private");
  const create = (name, policy, headers = nonce()) => request(201, "POST", base, owner, input(name, policy), headers);
  const replays = await Promise.all([create("public", "public", key), create("public", "public", key)]);
  assert.equal(replays[0].community.id, replays[1].community.id);
  await request(409, "POST", base, owner, { ...input("public", "public"), description: "A changed submission body." }, key);
  await request(422, "POST", base, owner, { ...input("public", "public"), slug: "ht-nord", name: "Nórd" }, nonce());
  await create("approval", "approval");
  await create("private", "private");
  await create("limit1", "private");
  await create("limit2", "private");
  await request(409, "POST", base, owner, input("limit3", "private"), nonce());

  const result = await request(200, "GET", `${base}/groups?search=${slug}&limit=1`);
  assert.equal(result.communities.length, 1);
  assert.ok(result.nextCursor);
  const next = await request(200, "GET", `${base}/groups?search=${slug}&limit=1&cursor=${result.nextCursor}`);
  assert.equal(next.communities.length, 1);
  assert.equal(next.nextCursor, null);
  await request(404, "GET", privateRoom, observer);
  await request(404, "GET", privateRoom + "/public-posts");
  await request(404, "POST", privateRoom + "/join", observer);
  const concurrent = await Promise.all([request(200, "POST", publicRoom + "/join", member), request(200, "POST", publicRoom + "/join", member)]);
  assert.ok(concurrent.every(({ community }) => community.joined && !community.directoryVisible));
  assert.equal((await request(200, "POST", approvalRoom + "/join", member)).community.requestStatus, "pending");
  await request(403, "GET", approvalRoom + "/posts", member);
  await request(403, "POST", approvalRoom + "/management", member, { action: "approve", handle: member.username, reason });
  assert.equal((await request(200, "GET", approvalRoom + "/management/requests", owner)).entries[0].handle, member.username);
  const approvals = await Promise.all([send("POST", approvalRoom + "/management", owner, { action: "approve", handle: member.username, reason }),
    send("POST", approvalRoom + "/management", owner, { action: "approve", handle: member.username, reason })]);
  assert.deepEqual(approvals.map(({ statusCode }) => statusCode).sort(), [200, 409]);

  await request(409, "DELETE", privateRoom + "/membership", owner);
  const invitation = (await decision(privateRoom, owner, "invite", { handle: member.username })).invitationId;
  const repeated = (await decision(privateRoom, owner, "invite", { handle: member.username })).invitationId;
  assert.equal(invitation, repeated);
  const memberInbox = (await request(200, "GET", inbox, member)).invitations;
  assert.deepEqual(Object.keys(memberInbox[0]).sort(), ["expiresAt", "id", "name", "purpose"]);
  assert.equal(memberInbox[0].id, invitation);
  assert.deepEqual((await request(200, "GET", inbox, observer)).invitations, []);
  await request(404, "PATCH", `${inbox}/${invitation}`, observer, { accept: true });
  await request(204, "PATCH", `${inbox}/${invitation}`, member, { accept: true });
  await request(204, "PATCH", `${inbox}/${invitation}`, member, { accept: true });

  const reviewInvite = (await decision(privateRoom, owner, "invite", { handle: moderator.username })).invitationId;
  await request(204, "PATCH", `${inbox}/${reviewInvite}`, moderator, { accept: true });
  await decision(privateRoom, owner, "staff", { handle: moderator.username, role: "moderator" });
  await request(403, "GET", approvalRoom + "/moderation", moderator);
  await request(403, "POST", privateRoom + "/management", moderator, { action: "staff", handle: moderator.username, role: "administrator", reason });

  const attachment = randomUUID();
  imageIds.push(attachment);
  const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#325983" } }).png().toBuffer();
  await request(201, "POST", "/api/v1/me/post-media", member, { image: image.toString("base64") }, { "idempotency-key": attachment });
  const privatePost = await request(201, "POST", privateRoom + "/posts", member,
    { body: "Private group fixture post.", language: "es", groupVersion: 1, attachments: [{ id: attachment, alt: "Private test image" }] }, nonce());
  const postUrl = `/api/v1/posts/${privatePost.id}`;
  const imageUrl = `${postUrl}/attachments/${attachment}/image`;
  await request(404, "GET", postUrl, observer);
  await request(404, "GET", imageUrl);
  assert.equal((await request(200, "GET", imageUrl, owner)).headers["content-type"], "image/webp");
  await request(201, "POST", postUrl + "/comments", owner, { body: "Private room comment.", language: "ht", parentId: null }, nonce());
  await request(404, "GET", postUrl + "/comments", observer);
  await request(204, "POST", postUrl + "/reports", owner, { category: "other", note: reason });
  const reportQueue = await request(200, "GET", privateRoom + "/moderation", moderator);
  const report = reportQueue.reports.find((entry) => entry.postId === privatePost.id);
  assert.ok(report);
  await request(204, "PATCH", `${privateRoom}/moderation/posts/${privatePost.id}`, moderator, { version: report.version, action: "hide", reason });
  const hidden = await request(200, "GET", appealPath, member);
  const original = hidden.decisions.find((item) => item.eligible);
  assert.ok(original);
  const submitted = await request(201, "POST", `/api/v1/moderation/actions/${original.id}/appeals`, member, { kind: "post", reason });
  await request(403, "GET", "/api/v1/moderation/appeals", moderator);
  const review = await request(200, "GET", "/api/v1/moderation/appeals", operator);
  assert.ok(review.decisions.some((entry) => entry.id === submitted.id));
  await request(204, "PATCH", `/api/v1/moderation/appeals/${submitted.id}`, operator,
    { outcome: "overturned", explanation: "Independent reviewer restores this synthetic fixture." });

  const oldPost = await request(201, "POST", publicRoom + "/posts", member,
    { body: "Previously members only.", language: "fr", groupVersion: 1 }, nonce());
  const open = await request(200, "PATCH", publicRoom + "/settings", owner, { ...settings("public", "public", true), version: 1 });
  await request(409, "POST", publicRoom + "/posts", member, { body: "Stale policy.", language: "fr", groupVersion: 1 }, nonce());
  const opened = await request(201, "POST", publicRoom + "/posts", member,
    { body: "Public reading fixture.", language: "en", groupVersion: open.community.version }, nonce());
  const guestRead = await request(200, "GET", publicRoom + "/public-posts");
  assert.deepEqual(guestRead.posts.map(({ id }) => id), [opened.id]);
  await request(404, "GET", `/api/v1/posts/${oldPost.id}`);
  await request(200, "GET", `/api/v1/posts/${opened.id}`);
  for (const scope of ["feed", "mine", "following", "for_you"]) {
    const page = await request(200, "GET", `/api/v1/feed?scope=${scope}`, member);
    assert.ok(page.posts.every((post) => ![privatePost.id, oldPost.id, opened.id].includes(post.id)));
  }
  const closed = await request(200, "PATCH", publicRoom + "/settings", owner, { ...settings("public", "private"), version: open.community.version });
  assert.equal(closed.community.policy, "private");
  await request(404, "GET", `/api/v1/posts/${opened.id}`);
  await request(200, "PATCH", publicRoom + "/settings", owner, { ...settings("public", "public", true), version: closed.community.version });
  assert.deepEqual((await request(200, "GET", publicRoom + "/public-posts")).posts, []);

  const offer = (await decision(privateRoom, owner, "transfer", { handle: moderator.username })).invitationId;
  await request(204, "PATCH", `${inbox}/${offer}`, moderator, { accept: true });
  assert.equal((await request(200, "GET", privateRoom, moderator)).community.role, "owner");
  await decision(privateRoom, moderator, "remove", { handle: member.username });
  await request(204, "PATCH", `${inbox}/${invitation}`, member, { accept: true });
  await request(404, "GET", privateRoom, member);
  await request(404, "GET", imageUrl, member);
  assert.deepEqual((await request(200, "GET", base)).communities, initial);
  console.log("Hosted group privacy, concurrent writes, real MFA governance and appeals, media, and feed isolation passed.");

  if (process.argv.includes("--browser")) {
    const file = "supabase/.temp/phase4b-browser.json";
    try {
      writeFileSync(file, JSON.stringify({ email: observer.email, password, slug, publicSlug: slugs[0], privateSlug: slugs[2] }),
        { mode: 0o600, flag: "wx" });
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
    const knownSlugs = slugs.map((item) => `'${item}'`).join(",");
    query(`begin; create temporary table group_fixture_ids on commit drop as
      select u.id from auth.users u join (values ${identities}) f(id,email) on u.id=f.id and u.email=f.email;
      create temporary table group_fixture_rooms on commit drop as
      select c.id from feed_data.communities c join feed_data.group_creations gc on gc.community_id=c.id
        where c.slug in (${knownSlugs}) and gc.creator_id in (select id from group_fixture_ids);
      delete from feed_data.notifications n where n.appeal_id in (
        select id from feed_data.moderation_appeals where appellant_id in (select id from group_fixture_ids));
      delete from feed_data.moderation_appeals where appellant_id in (select id from group_fixture_ids);
      delete from feed_data.community_staff_audit where community_id in (select id from group_fixture_rooms);
      delete from feed_data.post_attachments where id in (${imageIds.length ? imageIds.map((id) => `'${id}'`).join(",") : "null"});
      delete from feed_data.posts where community_id in (select id from group_fixture_rooms)
        and author_id in (select id from group_fixture_ids);
      delete from feed_data.communities where id in (select id from group_fixture_rooms);
      delete from feed_data.read_limits where subject in (select 'member:'||id::text from group_fixture_ids);
      commit;`);
  }
  for (const { id, email } of users) {
    const record = await admin.auth.admin.getUserById(id);
    assert.ifError(record.error);
    assert.equal(record.data.user.email, email);
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log("Known synthetic accounts, groups, and image objects removed.");
}
