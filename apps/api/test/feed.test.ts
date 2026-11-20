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
      if (name === "list_comment_reports_for_client") return [] as T;
      if (name === "list_comments_for_client") return [first, second] as T;
      if (name === "search_discovery_for_client") return [
        { id: "member:example", kind: "member", handle: "example", name: "Example", verified: false, following: false, self: false },
        { id: "member:second", kind: "member", handle: "second", name: "Second", verified: false, following: false, self: false },
      ] as T;
      if (name === "write_follow_for_client") {
        return (input?.p_key === "private_account" ? { error: "PFR04" }
          : { following: input?.p_follow, followerCount: 1, followingCount: 0, canFollow: true, verified: false }) as T;
      }
      if (name === "write_engagement_for_client") {
        if (input?.p_operation === "edit") return { error: "PFR09" } as T;
        return { id: first.id } as T;
      }
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

test("discovery validates shape, cursors and session-bound follow writes", async () => {
  const { app, calls } = fixture();
  try {
    const discovery = "/api/v1/discover/people";
    const headers = { authorization: "Bearer member" };
    assert.equal((await app.inject(discovery)).statusCode, 401);
    assert.equal((await app.inject({ url: `${discovery}?q=x`, headers })).statusCode, 400);
    assert.equal((await app.inject({ url: `${discovery}?category=education`, headers })).statusCode, 400);
    const page = await app.inject({ url: `${discovery}?q=Example&limit=1`, headers });
    assert.equal(page.json().nextCursor, "example");
    assert.equal(page.json().accounts.length, 1);
    assert.equal(calls.at(-1)?.input?.p_search, "Example");
    const target = "/api/v1/members/example/follow";
    assert.equal((await app.inject({ method: "PUT", url: target })).statusCode, 401);
    assert.equal((await app.inject({ method: "PUT", url: target, headers, payload: { follower: other } })).statusCode, 400);
    assert.equal((await app.inject({ method: "PUT", url: target, headers })).json().following, true);
    assert.deepEqual(calls.at(-1), { token: "member", name: "write_follow_for_client",
      input: { p_kind: "member", p_key: "example", p_follow: true } });
    const unavailable = await app.inject({ method: "PUT", url: "/api/v1/members/private_account/follow", headers });
    assert.equal(unavailable.statusCode, 404);
    assert.equal(unavailable.json().error.requestId, unavailable.headers["x-request-id"]);
    assert.equal((await app.inject("/api/v1/feed?scope=following")).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/v1/feed?scope=following", headers })).statusCode, 200);
    assert.equal(calls.at(-1)?.input?.p_scope, "following");
  } finally {
    await app.close();
  }
});

test("engagement routes validate payloads, keep cursor precision, and normalize database errors", async () => {
  const { app, first, calls } = fixture();
  try {
    const path = `/api/v1/posts/${first.id}/comments`;
    const key = randomUUID();
    const source = { body: "  Original comment.  ", language: "ht" };
    const headers = { authorization: "Bearer member", "idempotency-key": key };
    assert.equal((await app.inject({ method: "POST", url: path, payload: source })).statusCode, 401);
    const tooLong = await app.inject({ method: "POST", url: path, headers, payload: { ...source, body: "à".repeat(1001) } });
    assert.equal(tooLong.statusCode, 422);
    assert.equal(tooLong.json().error.code, "INVALID_CONTENT");
    assert.equal((await app.inject({ method: "POST", url: path, headers, payload: { ...source, authorId: other } })).statusCode, 400);
    assert.equal(calls.length, 0);
    const saved = await app.inject({ method: "POST", url: path, headers, payload: source });
    assert.equal(saved.statusCode, 201);
    assert.deepEqual(calls.at(-1), { token: "member", name: "write_engagement_for_client", input: {
      p_operation: "create", p_id: first.id, p_parent: null, p_body: source.body, p_language: "ht", p_submission: key,
    } });
    const page = await app.inject(`${path}?limit=1`);
    assert.equal(page.json().comments[0].id, first.id);
    await app.inject(`${path}?cursor=${page.json().nextCursor}`);
    assert.equal(calls.at(-1)?.input?.p_after_at, first.createdAt);
    const stale = await app.inject({ method: "PATCH", url: `/api/v1/comments/${first.id}`, headers, payload: { ...source, version: 1 } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, "CONFLICT");
    assert.equal(stale.json().error.requestId, stale.headers["x-request-id"]);
    const reaction = `/api/v1/comments/${first.id}/reaction`;
    assert.equal((await app.inject({ method: "PUT", url: reaction, headers, payload: { kind: "love", count: 10 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "PUT", url: reaction, headers, payload: { kind: "love" } })).statusCode, 200);
    assert.equal(calls.at(-1)?.input?.p_operation, "comment_reaction");
    const moderation = "/api/v1/moderation/feed?target=comments";
    assert.equal((await app.inject({ url: moderation, headers })).json().error.code, "MFA_REQUIRED");
    assert.equal((await app.inject({ url: moderation, headers: { authorization: "Bearer elevated" } })).statusCode, 200);
    assert.equal(calls.at(-1)?.name, "list_comment_reports_for_client");
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
