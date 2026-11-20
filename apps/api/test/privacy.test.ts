import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { registerPrivacyRoutes } from "../src/routes/privacy.js";
import { registerErrorHandling, requestIdentification } from "../src/services/api-error.js";
import { createPrivacyRepository, type PrivacyRepository } from "../src/services/privacy.js";

const collection = "/api/v1/me/privacy-requests";
const actor = "80f42114-3491-4caf-941c-dde5242e7423";
const session = "423c2072-bb95-4ec3-a9d1-fbfad0771bec";
const key = "85be8e8e-ed35-4594-a01a-2c558c027562";
const headers = { authorization: "Bearer valid", "idempotency-key": key };

test("default, hosted and production configuration cannot enable privacy intake", async (t) => {
  for (const config of [readConfig({ LOG_LEVEL: "silent" }), readConfig({
    LOG_LEVEL: "silent", AYINOU_PRIVACY_INTAKE: "synthetic", SUPABASE_URL: "https://example.invalid",
  }), readConfig({
    LOG_LEVEL: "silent", AYINOU_PRIVACY_INTAKE: "synthetic", NODE_ENV: "production", SUPABASE_URL: "http://127.0.0.1:55321",
  })]) {
    const app = createApp(config, { auth: { async verify() { assert.fail("Disabled route verified a token"); } } });
    t.after(() => app.close());
    const result = await app.inject({ method: "POST", url: collection, headers, payload: { kind: "access" } });
    assert.equal(result.statusCode, 404);
    assert.equal(result.json().error.code, "PRIVACY_DISABLED");
    assert.equal(result.headers["cache-control"], "private, no-store");
  }
});

test("privacy input and disabled reviewer boundary require the expected session and assurance", async (t) => {
  const app = Fastify(requestIdentification());
  t.after(() => app.close());
  registerErrorHandling(app);
  const call = { total: 0 };
  const repository: PrivacyRepository = {
    async list() { assert.fail("unexpected list"); },
    async detail() { assert.fail("unexpected detail"); },
    async command(identity) {
      call.total++;
      assert.deepEqual(identity, { actor, session, aal2: false });
      return { id: key, version: 1, state: "received" };
    },
  };
  app.register((instance) => registerPrivacyRoutes(instance, true, {
    async verify() { assert.fail("session identity is required"); },
    async verifySession(token, review) {
      if (token === "revoked" || (review && token !== "fresh")) return null;
      return { actor, session, aal2: token === "fresh" };
    },
  }, repository, async () => {}));
  const submit = (payload: object, requestHeaders = headers) =>
    app.inject({ method: "POST", url: collection, headers: requestHeaders, payload });
  assert.equal((await submit({ kind: "access" }, { ...headers, authorization: "Bearer revoked" })).statusCode, 401);
  assert.equal((await submit({ kind: "access", actor, aal2: true })).statusCode, 400);
  assert.equal((await submit({ kind: "access", evidence: "x".repeat(600) })).statusCode, 413);
  assert.equal((await submit({ kind: "access" }, { ...headers, "idempotency-key": "bad" })).statusCode, 400);
  const accepted = await submit({ kind: "access" });
  assert.equal(accepted.statusCode, 201);
  assert.deepEqual(accepted.json(), { id: key, state: "received", version: 1 });
  const triage = (token: string) => app.inject({ method: "POST", url: "/api/v1/admin/privacy-requests/" + key + "/triage",
    headers: { authorization: "Bearer " + token }, payload: { state: "approved" } });
  assert.equal((await triage("valid")).json().error.code, "MFA_REQUIRED");
  assert.equal((await triage("fresh")).json().error.code, "PRIVACY_REVIEW_UNAVAILABLE");
  assert.equal(call.total, 1);
});

test("unavailable privacy database returns a safe retryable error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    code: "57014", message: "private schema timeout detail", hint: "internal",
  }), { status: 500, headers: { "Content-Type": "application/json" } }));
  const repository = createPrivacyRepository(readConfig({
    AYINOU_PRIVACY_INTAKE: "synthetic", SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_SECRET_KEY: "fake-key",
  }));
  assert.ok(repository);
  const app = Fastify(requestIdentification());
  t.after(() => app.close());
  registerErrorHandling(app);
  app.register((instance) => registerPrivacyRoutes(instance, true, {
    async verify() { return actor; },
    async verifySession() { return { actor, session, aal2: false }; },
  }, repository, async () => {}));
  const response = await app.inject({ method: "GET", url: collection, headers });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json().error, { code: "SERVICE_UNAVAILABLE", message: "Privacy request service unavailable",
    retryable: true, requestId: response.headers["x-request-id"] });
});
