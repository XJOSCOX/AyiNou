import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { FeedRepository } from "../src/services/feed.js";

test("project progress separates public reads from private commands and scopes image upload", async () => {
  const project = randomUUID(), actor = randomUUID(), entry = randomUUID();
  const calls: { token: string | null; name: string; input?: Record<string, unknown> }[] = [];
  const feed: FeedRepository = {
    async read() { throw new Error("unexpected feed read"); },
    async recommendations() { throw new Error("unexpected recommendation read"); },
    async rpc<T>(token: string | null, name: string, input?: Record<string, unknown>) {
      calls.push({ token, name, input });
      if (name === "project_progress_media_for_client") return Buffer.from("synthetic-webp").toString("base64") as T;
      return { id: entry } as T;
    },
  };
  const uploads: [string, string, string, number, string][] = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { feed,
    auth: { async verify(token) { return token === "member" ? actor : null; } },
    media: { async upload() {}, async download() { return Buffer.alloc(0); }, async cleanup() { return 0; },
      async uploadProjectProgress(user, projectId, entryId, version, buffer) {
        uploads.push([user, projectId, entryId, version, buffer.toString()]);
        return version + 1;
      },
    },
  });
  try {
    const url = "/api/v1/projects/" + project + "/progress";
    const imageUrl = url + "/entries/" + entry + "/image";
    const headers = { authorization: "Bearer member" };
    const payload = { action: "entry_submit", id: entry, version: 2 };
    assert.equal((await app.inject({ method: "GET", url: url + "/work" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: url + "/entries", payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: url + "/entries", headers, payload: { ...payload, reviewer: actor } })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: url + "/work", headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: url + "/entries", headers, payload })).statusCode, 200);
    const read = await app.inject({ method: "GET", url: imageUrl });
    assert.equal(read.headers["content-type"], "image/webp");
    assert.equal(read.headers["cache-control"], "private, no-store");
    assert.deepEqual(calls, [
      { token: null, name: "project_progress_for_client", input: { p_id: project, p_internal: false } },
      { token: "member", name: "project_progress_for_client", input: { p_id: project, p_internal: true } },
      { token: "member", name: "project_progress_entry_for_client", input: { p_id: project, p_action: "entry_submit", p_data: { id: entry, version: 2 } } },
      { token: null, name: "project_progress_media_for_client", input: { p_id: project, p_entry: entry } },
    ]);
    const upload = { version: 2, image: Buffer.from("candidate-image").toString("base64") };
    assert.equal((await app.inject({ method: "PUT", url: imageUrl, payload: upload })).statusCode, 401);
    assert.deepEqual((await app.inject({ method: "PUT", url: imageUrl, headers, payload: upload })).json(), { version: 3 });
    assert.deepEqual(uploads, [[actor, project, entry, 2, "candidate-image"]]);
  } finally {
    await app.close();
  }
});
