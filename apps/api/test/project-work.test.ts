import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { FeedRepository } from "../src/services/feed.js";

test("project work requires a bearer subject and forwards only validated operation fields", async () => {
  const project = randomUUID();
  const task = randomUUID();
  const user = randomUUID();
  const calls: { token: string | null; name: string; input?: Record<string, unknown> }[] = [];
  const feed: FeedRepository = {
    async read() { throw new Error("unexpected feed read"); },
    async recommendations() { throw new Error("unexpected recommendation read"); },
    async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
      calls.push({ token, name, input });
      return { id: task } as T;
    },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { feed,
    auth: { async verify(token) { return token === "member" ? user : null; } },
  });
  try {
    const url = "/api/v1/projects/" + project + "/work";
    const headers = { authorization: "Bearer member" };
    const assignment = { action: "task_assign", id: task, version: 2, userId: user };
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url, payload: assignment })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: { ...assignment, actorId: user } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: { ...assignment, version: 0 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: {
      action: "invite", handle: "some_member", role: "owner", key: randomUUID(),
    } })).statusCode, 400);
    assert.deepEqual(calls, []);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: assignment })).statusCode, 200);
    assert.deepEqual(calls, [{
      token: "member", name: "project_operation_for_client",
      input: { p_project: project, p_action: "task_assign", p_data: { id: task, version: 2, userId: user } },
    }]);
  } finally {
    await app.close();
  }
});
