import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { feedDatabaseError } from "../src/services/feed.js";

test("safety endpoints are caller-bound and privileged appeal decisions require recent MFA", async () => {
  const id = randomUUID();
  const actor = randomUUID();
  const requests: Array<{ token: string | null; name: string; fields: Record<string, unknown> }> = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token, mfa) { return token === "reviewer" || (!mfa && token === "member") ? actor : null; } },
    feed: {
      async read() { return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "v1", rows: [] }; },
      async rpc<T>(token: string | null, name: string, fields: Record<string, unknown> = {}) {
        requests.push({ token, name, fields });
        if (name === "feed_moderation_access") return true as T;
        if (name === "member_appeals_for_client") return [] as T;
        if (name === "decide_moderation_appeal_for_client") throw feedDatabaseError("PSF03");
        return undefined as T;
      },
    },
  });
  const member = { authorization: "Bearer member" };
  const reviewer = { authorization: "Bearer reviewer" };
  const blocks = "/api/v1/members/example/block";
  const decision = `/api/v1/moderation/appeals/${id}`;
  const payload = { outcome: "upheld", explanation: "Synthetic independent decision." };
  try {
    assert.equal((await app.inject({ method: "GET", url: blocks })).statusCode, 404);
    assert.equal((await app.inject({ method: "PUT", url: blocks })).statusCode, 401);
    assert.equal((await app.inject({ method: "PUT", url: blocks, headers: member, payload: { actor } })).statusCode, 400);
    assert.equal(requests.length, 0);
    assert.equal((await app.inject({ method: "PUT", url: blocks, headers: member })).statusCode, 204);
    assert.deepEqual(requests.at(-1), { token: "member", name: "save_member_safety_for_client",
      fields: { p_kind: "block", p_enabled: true, p_username: "example", p_target: null } });
    assert.deepEqual((await app.inject({ method: "GET", url: "/api/v1/me/moderation-appeals", headers: member })).json(),
      { decisions: [], nextCursor: null });
    assert.equal((await app.inject({ method: "PATCH", url: decision, headers: member, payload })).json().error.code, "MFA_REQUIRED");
    assert.equal((await app.inject({ method: "PATCH", url: decision, headers: reviewer, payload: { ...payload, reviewerId: actor } })).statusCode, 400);
    assert.ok(!requests.some(({ name }) => name === "decide_moderation_appeal_for_client"));
    const rejected = await app.inject({ method: "PATCH", url: decision, headers: reviewer, payload });
    assert.equal(rejected.statusCode, 403);
    assert.equal(rejected.json().error.code, "APPEAL_REVIEW_CONFLICT");
    assert.equal(rejected.json().error.requestId, rejected.headers["x-request-id"]);
  } finally { await app.close(); }
});
