import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { registerCommunityNeeds } from "../src/routes/community-needs.js";
import { registerErrorHandling } from "../src/services/api-error.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const path = "/api/v1/me/community-needs";
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const session = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const headers = { authorization: "Bearer member", "idempotency-key": id };
const content = { title: "Library access", description: "", category: "education", area: null, beneficiaries: "", references: [] };

test("needs intake is disabled by default and for a non-disposable backend", async (t) => {
  for (const env of [{}, { AYINOU_COMMUNITY_NEEDS: "synthetic", SUPABASE_URL: "https://example.org" }]) {
    const app = createApp(readConfig({ LOG_LEVEL: "silent", ...env }));
    t.after(() => app.close());
    const result = await app.inject({ url: path, headers });
    assert.equal(result.statusCode, 404);
    assert.equal(result.json().error.code, "COMMUNITY_NEEDS_DISABLED");
    assert.equal(result.headers["cache-control"], "private, no-store");
  }
});

test("needs reject unverified sessions, actor overrides, unsafe references and unconfirmed submission", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  registerErrorHandling(app);
  let args: Record<string, unknown> | undefined;
  const repo = { async rpc(_name: string, input: Record<string, unknown>) { args = input; return { id }; } } as InstitutionRepository;
  app.register((scope) => registerCommunityNeeds(scope, {
    enabled: true, repo, read: async () => {},
    auth: {
      async verify() { return null; },
      async verifySession(token) { return token === "member" ? { actor: id, session, aal2: false } : null; },
    },
  }));
  const input = { communityId: id, content };
  assert.equal((await app.inject({ url: path, headers: { authorization: "Bearer stale" } })).statusCode, 401);
  assert.equal((await app.inject({ url: path, headers: { authorization: "Bearer member" }, method: "POST", payload: input })).statusCode, 400);
  assert.equal((await app.inject({ url: path, headers, method: "POST", payload: { ...input, actor: session } })).statusCode, 400);
  for (const url of ["https://127.0.0.1/a", "http://example.org/a", "https://private.internal/a", "https://public.org/a?token=value", "https://user@public.org/a", "https://public.org/a%0a"]) {
    assert.equal((await app.inject({ url: path, headers, method: "POST", payload: {
      ...input, content: { ...content, references: [{ url, description: "" }] },
    } })).statusCode, 400, url);
  }
  assert.equal((await app.inject({ url: path + "/" + id, headers, method: "PATCH",
    payload: { action: "submit", expectedRevision: 1, confirmed: false },
  })).statusCode, 400);
  assert.equal(args, undefined);
  assert.equal((await app.inject({ url: path, headers, method: "POST", payload: input })).statusCode, 201);
  assert.equal(args!["p_actor"], id);
  assert.equal(args!["p_session"], session);
  assert.equal(args!["p_request"], id);
});
