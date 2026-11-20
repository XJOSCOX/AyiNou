import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("community recommendations bind pagination and writes to the authenticated caller", async () => {
  const id = randomUUID();
  const snapshot = randomUUID();
  const cards = [id, randomUUID()].map((communityId, index) => ({
    community: { id: communityId, slug: `group-${index}` }, recentPublicActivity: false, reason: "interest", position: index + 1,
  }));
  const calls: Array<{ token: string | null; rpc: string; inputs: Record<string, unknown> }> = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token) { return token === "member" ? id : null; } },
    feed: {
      async read() { return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "", rows: [] }; },
      async rpc<T>(token: string | null, rpc: string, inputs: Record<string, unknown> = {}) {
        calls.push({ token, rpc, inputs });
        if (rpc === "read_community_recommendations_for_client") return { snapshotId: snapshot, algorithmVersion: "v1", rows: cards } as T;
        return null as T;
      },
    },
  });
  const root = "/api/v1/communities";
  const url = root + "/recommendations/list";
  const headers = { authorization: "Bearer member" };
  try {
    assert.equal((await app.inject(url)).statusCode, 401);
    assert.equal((await app.inject({ url: url + "?cursor=bad", headers })).statusCode, 400);
    const result = await app.inject({ url: url + "?kind=interest&topic=education&limit=1", headers });
    assert.equal(result.statusCode, 200);
    const data = result.json();
    assert.deepEqual(data.recommendations, [{ community: cards[0].community, reason: "interest", recentPublicActivity: false }]);
    assert.ok(data.nextCursor);
    assert.equal((await app.inject({ url: url + `?kind=interest&topic=education&limit=1&cursor=${data.nextCursor}`, headers })).statusCode, 200);
    assert.equal(calls.at(-1)?.token, "member");
    assert.equal(calls.at(-1)?.inputs.p_snapshot, snapshot);
    assert.equal(calls.at(-1)?.inputs.p_after, 1);
    const feedback = root + `/${id}/recommendation-feedback`;
    assert.equal((await app.inject({ method: "POST", url: feedback, headers, payload: { action: "hide", userId: id } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: feedback, headers, payload: { action: "hide" } })).statusCode, 204);
    assert.deepEqual(calls.at(-1), { token: "member", rpc: "save_community_recommendation_feedback_for_client",
      inputs: { p_id: id, p_action: "hide" } });
  } finally {
    await app.close();
  }
});
