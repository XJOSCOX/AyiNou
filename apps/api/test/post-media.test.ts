import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { ApiError } from "../src/services/api-error.js";
import { postUploadMaxBytes, safePostImage } from "../src/services/post-image.js";

test("post image decoding strips GPS metadata, rotates images, and bounds both WebP variants", async () => {
  const jpeg = await sharp({ create: { width: 650, height: 1550, channels: 3, background: "#285878" } })
    .withMetadata({ orientation: 6 }).withExifMerge({ IFD3: { GPSLatitude: "18/1 32/1 0/1", GPSLatitudeRef: "N" } }).jpeg().toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif);
  const result = await safePostImage(jpeg);
  assert.equal(result.width, 1440);
  for (const [buffer, maxAxis, maxSize] of [[result.thumbnail, 480, 131_072], [result.display, 1440, 524_288]] as const) {
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, maxAxis);
    assert.ok(metadata.height < metadata.width);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.ok(buffer.length <= maxSize);
  }
  for (const format of ["png", "webp"] as const) {
    const raw = await sharp({ create: { width: 32, height: 64, channels: 4, background: "#093B5177" } }).toFormat(format).toBuffer();
    assert.equal((await safePostImage(raw)).height, 64);
  }
});

test("post images reject malformed, oversized, unsupported, and excessive-dimension inputs", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
  const huge = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#334455" } }).png().toBuffer();
  const tooWide = await sharp({ create: { width: 6001, height: 1, channels: 3, background: "#334455" } }).png().toBuffer();
  for (const [bytes, code] of [
    [Buffer.from("fake"), "INVALID_IMAGE"], [svg, "UNSUPPORTED_IMAGE"], [huge, "INVALID_IMAGE"], [tooWide, "INVALID_IMAGE"],
    [Buffer.alloc(postUploadMaxBytes + 1), "PAYLOAD_TOO_LARGE"],
  ] as const) await assert.rejects(safePostImage(bytes), { code });
});

test("image and notification endpoints enforce auth, project only accessible media, and return safe failures", async () => {
  const actor = randomUUID();
  const post = randomUUID();
  const image = randomUUID();
  const calls: string[] = [];
  let fail = true;
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token, mfa) { return token === "member" && !mfa ? actor : null; } },
    feed: {
      async read() { return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "", rows: [] }; },
      async rpc<T>(token: string | null, name: string) {
        calls.push(name);
        if (name === "can_download_post_media_for_client") return (token === "member") as T;
        if (name === "notifications_for_client") return [] as T;
        if (name === "notification_count_for_client") return 2 as T;
        return undefined as T;
      },
    },
    media: {
      async upload(id, key, bytes) {
        assert.deepEqual([id, key, bytes.toString()], [actor, image, "data"]);
        if (fail) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");
      },
      async download(id, variant) {
        assert.equal(id, image);
        assert.equal(variant, "thumbnail");
        calls.push("download");
        return Buffer.from("webp");
      },
      async cleanup() { return 0; },
    },
  });
  const headers = { authorization: "Bearer member", "idempotency-key": image };
  const url = `/api/v1/posts/${post}/attachments/${image}/image`;
  const upload = { method: "POST", url: "/api/v1/me/post-media", headers, payload: { image: "ZGF0YQ==" } } as const;
  try {
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.ok(!calls.includes("download"));
    assert.equal((await app.inject({ url: `${url}?review=true`, headers })).statusCode, 403);
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/webp");
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    const interrupted = await app.inject(upload);
    assert.equal(interrupted.statusCode, 503);
    assert.equal(interrupted.json().error.code, "STORAGE_UNAVAILABLE");
    assert.equal(interrupted.json().error.requestId, interrupted.headers["x-request-id"]);
    fail = false;
    assert.deepEqual((await app.inject(upload)).json(), { id: image });
    assert.equal((await app.inject("/api/v1/me/notifications")).statusCode, 401);
    assert.deepEqual((await app.inject({ url: "/api/v1/me/notifications", headers })).json(), { notifications: [], nextCursor: null });
    assert.deepEqual((await app.inject({ url: "/api/v1/me/notifications/unread-count", headers })).json(), { count: 2 });
    assert.equal((await app.inject({ url: "/api/v1/me/notification-preferences", method: "PUT", headers,
      payload: { reactions: true, comments: false, replies: true, followers: false, userId: actor } })).statusCode, 400);
  } finally { await app.close(); }
});
