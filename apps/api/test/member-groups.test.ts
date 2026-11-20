import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("group API preserves public and authenticated projections and rejects extra authority fields", async () => {
  const id = randomUUID();
  const calls: { rpc: string; token: string | null; inputs: unknown }[] = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token) { return token === "member" ? id : null; } },
    feed: {
      async read(token, inputs) { calls.push({ rpc: "read", token, inputs }); return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "", rows: [] }; },
      async rpc<T>(token: string | null, rpc: string, inputs: unknown) {
        calls.push({ rpc, token, inputs });
        if (rpc === "member_groups_for_client") return [{ slug: "group-one" }, { slug: "group-two" }] as T;
        return { id } as T;
      },
    },
  });
  const base = "/api/v1/communities";
  const headers = { authorization: "Bearer member", "idempotency-key": randomUUID() };
  try {
    assert.deepEqual((await app.inject(base + "/groups?kind=diaspora&country=CA&limit=1")).json(),
      { communities: [{ slug: "group-one" }], nextCursor: "group-one" });
    assert.equal(calls.at(-1)?.token, null);
    assert.equal((await app.inject(base + "/groups?mine=true")).statusCode, 401);
    const publicPosts = await app.inject({ url: base + "/group-one/public-posts", headers });
    assert.equal(publicPosts.statusCode, 200);
    assert.equal(calls.at(-1)?.token, null);
    assert.equal((await app.inject({ method: "POST", url: base + "/group-one/management", headers,
      payload: { action: "staff", handle: "valid_handle", role: "owner", reason: "Invalid privilege request." } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: base, headers,
      payload: { name: "Group one", slug: "group-one", kind: "interest", description: "Testing group creation.",
        rules: "A group rule for testing.", policy: "private", discussionPublic: false, topic: "culture", countryCode: null, ownerId: id } })).statusCode, 400);
    const post = await app.inject({ method: "POST", url: base + "/group-one/posts", headers,
      payload: { body: "Group versioned draft.", language: "es", groupVersion: 3 } });
    assert.equal(post.statusCode, 201);
    assert.equal(calls.at(-1)?.rpc, "create_group_post_for_client");
    assert.equal((calls.at(-1)?.inputs as { p_version: number }).p_version, 3);
  } finally {
    await app.close();
  }
});
