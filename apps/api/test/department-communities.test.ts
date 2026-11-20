import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("department routes keep scoped input, locale copy and moderator auth separate", async () => {
  const id = randomUUID();
  const actor = randomUUID();
  const room = { id, slug: "grand-anse", kind: "department", departmentCode: "HT-GA", name: "Grand'Anse" };
  const calls: { name: string; token: string | null; input?: Record<string, unknown> }[] = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token, mfa) { return token === "reviewer" || (!mfa && token === "member") ? actor : null; } },
    feed: {
      async read(token, input) { calls.push({ name: "read", token, input }); return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "", rows: [] }; },
      async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
        calls.push({ name, token, input });
        if (name === "department_community_for_client") return room as T;
        if (name === "department_reports_for_client") return [] as T;
        if (name === "can_review_department_for_client") return true as T;
        return id as T;
      },
    },
  });
  const root = "/api/v1/communities/grand-anse";
  const member = { authorization: "Bearer member", "idempotency-key": randomUUID() };
  try {
    const detail = await app.inject(root);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().community.departmentCode, "HT-GA");
    assert.deepEqual(Object.keys(detail.json().content), ["ht", "fr", "en", "es"]);
    assert.ok(detail.json().content.ht.description.includes("Grand'Anse"));
    assert.equal((await app.inject(root + "/posts")).statusCode, 401);
    const posts = await app.inject({ url: root + "/posts?limit=1", headers: member });
    assert.deepEqual(posts.json(), { posts: [], nextCursor: null });
    assert.deepEqual(calls.at(-1)?.input, { p_scope: "community", p_community: "grand-anse", p_limit: 1, p_before_at: null, p_before_id: null });
    assert.equal((await app.inject({ method: "POST", url: root + "/posts", headers: member,
      payload: { body: "Do not accept an audience override.", language: "en", visibility: "public" } })).statusCode, 400);
    const sent = await app.inject({ method: "POST", url: root + "/posts", headers: member,
      payload: { body: "Scoped content", language: "es", topics: ["culture"] } });
    assert.equal(sent.statusCode, 201);
    assert.deepEqual(calls.at(-1), { token: "member", name: "create_department_post_for_client", input: {
      p_key: "grand-anse", p_body: "Scoped content", p_language: "es", p_submission: member["idempotency-key"], p_topics: ["culture"], p_items: [],
    } });
    assert.equal((await app.inject({ url: root + "/moderation", headers: member })).json().error.code, "MFA_REQUIRED");
    const queue = await app.inject({ url: root + "/moderation?target=comments", headers: { authorization: "Bearer reviewer" } });
    assert.equal(queue.statusCode, 200);
    assert.equal(calls.at(-1)?.input?.p_key, "grand-anse");
    assert.equal(calls.at(-1)?.input?.p_target, "comments");
  } finally { await app.close(); }
});
