import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const password = `Synthetic-Media!9-${randomUUID()}`;

async function fixture(label) {
  const email = `ayinou-media-${label}-${slug}@example.invalid`;
  const username = `media_${label}_${slug}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  const user = { id, email, username };
  users.push(user);
  assert.ifError((await admin.rpc("initialize_member_for_api", { p_user_id: id })).error);
  assert.ifError((await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" })).error);
  assert.ifError((await admin.from("profiles").update({ display_name: `Phase 3E ${label}`, is_visible: true, username }).eq("user_id", id)).error);
  assert.ifError((await admin.from("user_settings").upsert({ user_id: id, discoverable: true })).error);
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return Object.assign(user, { client, token: login.data.session.access_token });
}

const send = (method, url, user, payload, extra = {}) => app.inject({
  method, url, payload, headers: { ...extra, ...(user ? { authorization: `Bearer ${user.token}` } : {}) },
});

async function expectStatus(status, ...args) {
  const response = await send(...args);
  assert.equal(response.statusCode, status, `${args[0]} ${args[1]}: ${response.headers["content-type"]?.includes("json") ? response.body : "unexpected response"}`);
  return response;
}

const notificationUrl = "/api/v1/me/notifications";
const preferencesUrl = "/api/v1/me/notification-preferences";
const prefs = { reactions: true, comments: true, replies: true, followers: true };
const unread = async (user) => (await expectStatus(200, "GET", `${notificationUrl}/unread-count`, user)).json().count;

async function upload(user, bytes) {
  const id = randomUUID();
  images.push(id);
  const headers = { "idempotency-key": id };
  const payload = { image: bytes.toString("base64") };
  assert.deepEqual((await expectStatus(201, "POST", "/api/v1/me/post-media", user, payload, headers)).json(), { id });
  return { id, headers, payload };
}

try {
  const author = await fixture("author");
  const reader = await fixture("reader");
  const input = await sharp({ create: { width: 780, height: 520, channels: 3, background: "#327767" } }).jpeg().toBuffer();
  const photo = await upload(author, input);
  await expectStatus(201, "POST", "/api/v1/me/post-media", author, photo.payload, photo.headers);
  await expectStatus(404, "POST", "/api/v1/me/post-media", reader, photo.payload, photo.headers);
  const bucket = reader.client.storage.from("post-media");
  assert.ok((await bucket.download(`${photo.id}/thumbnail.webp`)).error);
  assert.ok((await bucket.upload(`${photo.id}/thumbnail.webp`, input, { contentType: "image/webp", upsert: true })).error);

  let body = { body: `Synthetic media ${slug}`, language: "es", visibility: "private", attachments: [{ id: photo.id, alt: "A synthetic image" }] };
  const submission = { "idempotency-key": randomUUID() };
  await expectStatus(404, "POST", "/api/v1/posts", reader, body, submission);
  const results = await Promise.all([1, 2].map(() => expectStatus(201, "POST", "/api/v1/posts", author, body, submission)));
  const { id } = results[0].json();
  assert.equal(results[1].json().id, id);
  const post = `/api/v1/posts/${id}`;
  const image = `${post}/attachments/${photo.id}/image`;
  await expectStatus(404, "GET", image, reader);
  await expectStatus(404, "GET", image);
  const display = await expectStatus(200, "GET", `${image}?variant=display`, author);
  const meta = await sharp(display.rawPayload).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 780);
  assert.equal(meta.exif, undefined);
  assert.equal(display.headers["cache-control"], "private, no-store");
  const draft = (await expectStatus(200, "GET", post, author)).json().post;
  assert.deepEqual(draft.attachments, [{ id: photo.id, width: 780, height: 520, alt: "A synthetic image" }]);
  const thumb2 = await upload(author, input);
  body = { ...body, visibility: "members_only", attachments: [{ id: thumb2.id, alt: "Second" }, ...body.attachments] };
  const competing = await Promise.all([send("PATCH", post, author, { ...body, version: 1 }), send("PATCH", post, author, { ...body, version: 1 })]);
  assert.deepEqual(competing.map(({ statusCode }) => statusCode).sort(), [204, 409]);
  assert.deepEqual((await expectStatus(200, "GET", post, reader)).json().post.attachments.map(({ id: key }) => key), [thumb2.id, photo.id]);
  await expectStatus(404, "GET", image);
  const thumb = await expectStatus(200, "GET", image, reader);
  assert.equal((await sharp(thumb.rawPayload).metadata()).width, 480);

  assert.deepEqual((await expectStatus(200, "GET", preferencesUrl, author)).json(), prefs);
  const reaction = `${post}/reaction`;
  const follow = `/api/v1/members/${author.username}/follow`;
  await expectStatus(200, "PUT", reaction, author, { kind: "like" });
  await expectStatus(200, "PUT", reaction, reader, { kind: "like" });
  await expectStatus(200, "PUT", reaction, reader, { kind: "love" });
  await expectStatus(200, "DELETE", reaction, reader);
  await expectStatus(200, "PUT", reaction, reader, { kind: "celebrate" });
  await expectStatus(200, "PUT", follow, reader);
  await expectStatus(200, "DELETE", follow, reader);
  await expectStatus(200, "PUT", follow, reader);
  const commentInput = { body: "Phase 3E synthetic comment", language: "ht" };
  const commentHeaders = { "idempotency-key": randomUUID() };
  const comment = (await expectStatus(201, "POST", `${post}/comments`, reader, commentInput, commentHeaders)).json().id;
  assert.equal((await expectStatus(201, "POST", `${post}/comments`, reader, commentInput, commentHeaders)).json().id, comment);
  assert.equal(await unread(author), 3);
  assert.equal(await unread(reader), 0);
  const first = (await expectStatus(200, "GET", `${notificationUrl}?limit=1`, author)).json();
  assert.equal(first.notifications.length, 1);
  assert.ok(first.nextCursor);
  const { notifications } = (await expectStatus(200, "GET", `${notificationUrl}?cursor=${first.nextCursor}`, author)).json();
  assert.equal(notifications.length, 2);
  const idPath = `${notificationUrl}/${first.notifications[0].id}`;
  await expectStatus(404, "PATCH", idPath, reader, { read: true });
  await expectStatus(204, "PATCH", idPath, author, { read: true });
  assert.equal(await unread(author), 2);
  assert.deepEqual((await expectStatus(200, "PUT", preferencesUrl, author, { ...prefs, comments: false })).json(), { ...prefs, comments: false });
  await expectStatus(201, "POST", `${post}/comments`, reader, commentInput, { "idempotency-key": randomUUID() });
  assert.equal(await unread(author), 2);
  await expectStatus(204, "POST", `${notificationUrl}/read-all`, author);
  assert.equal(await unread(author), 0);
  await expectStatus(200, "GET", `${post}/comments/${comment}`, author);
  await expectStatus(204, "DELETE", `/api/v1/comments/${comment}?version=1`, reader);
  await expectStatus(404, "GET", `${post}/comments/${comment}`, author);
  const stale = (await expectStatus(200, "GET", notificationUrl, author)).json().notifications.find(({ id }) => id === first.notifications[0].id);
  assert.equal(stale.available, false);
  assert.equal(stale.postId, null);
  assert.equal(stale.actor, null);
  await expectStatus(204, "DELETE", `${post}?version=2`, author);
  await expectStatus(404, "GET", image, author);
  console.log("Hosted private storage, WebP delivery, ownership, concurrent post creation and editing, notification paging, deduplication, preferences, and stale-target checks passed.");

  if (process.argv.includes("--browser")) {
    const previewImage = "supabase/.temp/phase3e-browser-image.jpg";
    const fixtureFile = "supabase/.temp/phase3e-browser.json";
    writeFileSync(previewImage, input);
    await expectStatus(200, "DELETE", follow, reader);
    const preview = await upload(author, input);
    const browserPost = (await expectStatus(201, "POST", "/api/v1/posts", author, {
      body: "Phase 3E browser preview — synthetic", language: "en", visibility: "public",
      attachments: [{ id: preview.id, alt: "Synthetic green test image" }],
    }, { "idempotency-key": randomUUID() })).json().id;
    await expectStatus(200, "PUT", `/api/v1/posts/${browserPost}/reaction`, reader, { kind: "like" });
    try {
      writeFileSync(fixtureFile, JSON.stringify({ email: author.email, password, post: browserPost, image: previewImage }), { mode: 0o600 });
      console.log("Browser fixture ready. Press Enter to clean up the fixtures.");
      await new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve); });
    } finally {
      process.stdin.pause();
      rmSync(fixtureFile, { force: true });
      rmSync(previewImage, { force: true });
    }
  }
} finally {
  await app.close();
  try {
    if (images.length) assert.ifError((await admin.storage.from("post-media").remove(images.flatMap((id) =>
      [`${id}/thumbnail.webp`, `${id}/display.webp`]))).error);
  } finally {
    for (const { id, email } of users) {
      const record = await admin.auth.admin.getUserById(id);
      assert.ifError(record.error);
      assert.equal(record.data.user.email, email);
      assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  }
  console.log("Synthetic accounts and their known Storage objects were removed.");
}
