import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { registerPrivacyLifecycleRoutes } from "../src/routes/privacy-lifecycle.js";
import { registerErrorHandling, requestIdentification } from "../src/services/api-error.js";

const caseId = "423c2072-bb95-4ec3-a9d1-fbfad0771bec";
const base = "/api/v1/me/privacy-requests/" + caseId + "/deletion-";
const token = { authorization: "Bearer test", "idempotency-key": "85be8e8e-ed35-4594-a01a-2c558c027562" };
const verified = { actor: caseId, session: caseId, aal2: true, totpAt: 1 };

test("real lifecycle routes are disabled even if a hosted config requests synthetic mode", async (t) => {
  const configurations = [readConfig({ LOG_LEVEL: "silent" }), readConfig({
    LOG_LEVEL: "silent", SUPABASE_URL: "https://example.invalid", AYINOU_PRIVACY_INTAKE: "synthetic",
    AYINOU_PRIVACY_LIFECYCLE: "synthetic",
  }), readConfig({
    LOG_LEVEL: "silent", SUPABASE_URL: "http://127.0.0.1:55321", AYINOU_PRIVACY_INTAKE: "synthetic",
    AYINOU_PRIVACY_LIFECYCLE: "synthetic", NODE_ENV: "production",
  })];
  for (const configuration of configurations) {
    const app = createApp(configuration);
    t.after(() => app.close());
    const result = await app.inject({ method: "POST", url: base + "plan", headers: token, payload: { caseVersion: 1 } });
    assert.equal(result.statusCode, 404);
    assert.equal(result.json().error.code, "LIFECYCLE_DISABLED");
    assert.equal(result.headers["cache-control"], "private, no-store");
  }
});

test("lifecycle accepts only subject commands and server-verified proof", async (t) => {
  const app = Fastify(requestIdentification());
  registerErrorHandling(app);
  t.after(() => app.close());
  app.register((instance) => registerPrivacyLifecycleRoutes(instance, async (actor, id, command) => {
    assert.deepEqual(actor, verified);
    assert.equal(id, caseId);
    assert.deepEqual(command, { action: "plan", caseVersion: 1, key: token["idempotency-key"] });
    return { state: "review_required", caseVersion: 1, planVersion: 1, receipt: caseId, warnings: [], confirmed: false, verifiedSteps: 0 };
  }, {
    async verify() { return caseId; },
    async verifySession(bearer, proof) { return proof && bearer !== "test" ? null : verified; },
  }, async () => {}));
  const call = (payload: object, headers: Record<string, string> = token) =>
    app.inject({ method: "POST", url: base + "plan", headers, payload });
  assert.equal((await call({ caseVersion: 1, disposition: "erase" })).statusCode, 400);
  assert.equal((await call({ caseVersion: 1 }, { ...token, authorization: "Bearer no-proof" })).json().error.code, "MFA_REQUIRED");
  assert.equal((await call({ caseVersion: 1 })).json().state, "review_required");
  assert.equal((await app.inject({ method: "POST", url: base + "execute", headers: token })).statusCode, 404);
});
