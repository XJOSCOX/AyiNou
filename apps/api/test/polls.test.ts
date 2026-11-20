import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { ApiError } from "../src/services/api-error.js";
import type { FeedRepository } from "../src/services/feed.js";

test("poll routes bind private reads and writes to the authenticated session", async () => {
  const actor = randomUUID(), lateActor = randomUUID(), poll = randomUUID(), choice = randomUUID();
  const calls: unknown[] = [];
  let closed = false;
  const feed: FeedRepository = {
    async read() { throw new Error("unexpected feed read"); },
    async recommendations() { throw new Error("unexpected recommendation read"); },
    async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
      calls.push({ token, name, input });
      if (closed && token === "late-member" && name === "poll_vote_for_client") {
        throw new ApiError(409, "POLL_CLOSED", "Voting closed");
      }
      return (name === "poll_vote_for_client" ? { optionId: choice } : { ownBallot: choice, results: null }) as T;
    },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    feed, auth: { async verify(token) { return token === "member" ? actor : token === "late-member" ? lateActor : null; } },
  });
  const url = "/api/v1/polls/" + poll;
  const headers = { authorization: "Bearer member" };
  try {
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: url + "/ballot", headers, payload: { optionId: choice, voterId: actor } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: url + "/transition", headers,
      payload: { action: "publish", version: 1, tally: 10 } })).statusCode, 400);
    const detail = await app.inject({ url, headers });
    assert.equal(detail.statusCode, 200);
    assert.ok(Math.abs(Date.now() - detail.json().serverNow) < 10_000);
    const results = await app.inject({ url: url + "/results", headers });
    assert.equal(results.statusCode, 409);
    assert.equal(results.headers["cache-control"], "private, no-store");
    assert.deepEqual((await app.inject({ url: url + "/ballot", headers })).json(), { optionId: choice });
    const vote = await app.inject({ method: "POST", url: url + "/ballot", headers, payload: { optionId: choice } });
    assert.equal(vote.statusCode, 200);
    assert.deepEqual(vote.json(), { optionId: choice });
    closed = true;
    const late = await app.inject({ method: "POST", url: url + "/ballot", headers: { authorization: "Bearer late-member" }, payload: { optionId: choice } });
    assert.equal(late.statusCode, 409);
    assert.equal(late.json().error.code, "POLL_CLOSED");
    assert.deepEqual((await app.inject({ method: "POST", url: url + "/ballot", headers, payload: { optionId: choice } })).json(), { optionId: choice });
    assert.deepEqual(calls, [
      { token: "member", name: "poll_detail_for_client", input: { p_id: poll } },
      { token: "member", name: "poll_detail_for_client", input: { p_id: poll } },
      { token: "member", name: "poll_detail_for_client", input: { p_id: poll } },
      { token: "member", name: "poll_vote_for_client", input: { p_id: poll, p_option: choice } },
      { token: "late-member", name: "poll_vote_for_client", input: { p_id: poll, p_option: choice } },
      { token: "member", name: "poll_vote_for_client", input: { p_id: poll, p_option: choice } },
    ]);
  } finally {
    await app.close();
  }
});
