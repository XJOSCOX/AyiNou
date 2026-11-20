import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { FeedRepository } from "../src/services/feed.js";
import type { FeedPost } from "@ayinou/shared";

const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const body = { body: "  Posted text.  ", language: "es", visibility: "public" };

function fixture() {
  const first: FeedPost = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", body: "First post", language: "es", visibility: "public",
    status: "published", createdAt: "2026-11-20T01:00:00.0123+00:00", publishedAt: "2026-11-20T01:00:00.0123+00:00",
    editedAt: null, own: false, version: 1, author: null,
  };
  const second = { ...first, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", body: "Second post" };
  const calls: { token: string | null; name: string; input?: Record<string, unknown> }[] = [];
  const feed: FeedRepository = {
    async read(token, input) {
      calls.push({ token, name: "read", input });
      return input.p_before_id ? [second] : [first, second];
    },
    async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
      calls.push({ token, name, input });
      if (name === "feed_moderation_access") return (token !== "other") as T;
      if (name === "list_feed_reports_for_client") return [] as T;
      return first.id as T;
    },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { feed,
    auth: { async verify(token, mfa) {
      if (token === "elevated") return actor;
      if (!mfa && token === "member") return actor;
      if (!mfa && token === "other") return other;
      return null;
    } },
  });
  return { app, first, second, calls };
}

test("post creation validates requests, preserves source text and forwards only the verified token", async () => {
  const { app, first, calls } = fixture();
  try {
    const key = randomUUID();
    const url = "/api/v1/posts";
    const headers = { authorization: "Bearer member", "idempotency-key": key };
    const submit = (payload: object, auth = headers) => app.inject({ method: "POST", url, headers: auth, payload });
    for (const extra of [{ status: "published" }, { actor: other }, { language: "de" }]) {
      assert.equal((await submit({ ...body, ...extra })).statusCode, 400);
    }
    const bad = await submit({ ...body, body: " \n " });
    assert.equal(bad.statusCode, 422);
    assert.equal(bad.json().error.code, "INVALID_CONTENT");
    assert.equal(bad.json().error.requestId, bad.headers["x-request-id"]);
    assert.equal((await submit(body, { ...headers, authorization: "Bearer expired" })).statusCode, 401);
    const large = await submit({ ...body, body: "a".repeat(17_000) });
    assert.equal(large.statusCode, 413);
    assert.equal(large.json().error.code, "PAYLOAD_TOO_LARGE");
    assert.equal(calls.length, 0);
    const created = await submit(body);
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.json(), { id: first.id });
    assert.deepEqual(calls, [{ token: "member", name: "create_post_for_client",
      input: { p_body: body.body, p_language: "es", p_visibility: "public", p_submission: key } }]);
  } finally {
    await app.close();
  }
});

test("feed pagination preserves timestamp precision and limits anonymous clients independently of users", async () => {
  const { app, first, second, calls } = fixture();
  try {
    const firstPage = await app.inject("/api/v1/feed?limit=1");
    const nextCursor = firstPage.json().nextCursor;
    assert.equal(firstPage.json().posts[0].id, first.id);
    const next = await app.inject(`/api/v1/feed?limit=1&cursor=${nextCursor}`);
    assert.equal(next.json().posts[0].id, second.id);
    assert.equal(next.json().nextCursor, null);
    assert.equal(calls.at(-1)?.input?.p_before_at, first.createdAt);
    assert.equal(calls.at(-1)?.input?.p_before_id, first.id);
    assert.equal((await app.inject("/api/v1/feed?scope=mine")).statusCode, 401);
    assert.equal((await app.inject("/api/v1/feed?cursor=bad")).statusCode, 400);
    for (let i = 3; i < 90; i++) assert.equal((await app.inject("/api/v1/feed")).statusCode, 200);
    const limited = await app.inject("/api/v1/feed");
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
    assert.equal(limited.json().error.retryable, true);
    assert.equal((await app.inject({ url: "/api/v1/feed", headers: { authorization: "Bearer member" } })).statusCode, 200);
  } finally {
    await app.close();
  }
});

test("moderation requires a current assigned role and MFA", async () => {
  const { app, calls } = fixture();
  try {
    const url = "/api/v1/moderation/feed";
    const read = (token: string) => app.inject({ url, headers: { authorization: `Bearer ${token}` } });
    assert.equal((await read("other")).json().error.code, "FORBIDDEN");
    assert.equal((await read("member")).json().error.code, "MFA_REQUIRED");
    assert.equal((await read("elevated")).statusCode, 200);
    assert.deepEqual(calls.map(({ name }) => name),
      ["feed_moderation_access", "feed_moderation_access", "feed_moderation_access", "list_feed_reports_for_client"]);
  } finally {
    await app.close();
  }
});
