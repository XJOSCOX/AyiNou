import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

test("institution routes reject acting identities and require elevated reviewer sessions", async () => {
  const actor = "11111111-1111-4111-8111-111111111111";
  const institutionId = "22222222-2222-4222-8222-222222222222";
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const institutions: InstitutionRepository = {
    async rpc<T>(name: string, input: Record<string, unknown>) {
      calls.push({ name, input });
      return (name === "verification_queue_for_api" ? [] : institutionId) as T;
    },
    async publicProfile() { return null; },
    async accounts() { return { canReview: false, organizations: [], invitations: [] }; },
    async manage() { throw Error("Unexpected call"); },
    async logo() { throw Error("Unexpected call"); },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    institutions,
    auth: { async verify(token, elevated) { return token === "elevated" || token === "regular" && !elevated ? actor : null; } },
  });
  const headers = { authorization: "Bearer regular" };
  try {
    assert.equal((await app.inject("/api/v1/me/institution-accounts")).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/v1/verification/review", headers })).statusCode, 403);
    assert.equal(calls.length, 0);
    const scope = await app.inject({ url: "/api/v1/verification/review", headers: { authorization: "Bearer elevated" } });
    assert.equal(scope.statusCode, 200);
    assert.deepEqual(calls.pop(), { name: "verification_queue_for_api", input: { p_actor: actor, p_status: "pending" } });
    const payload = { handle: "municipality-test", name: "Test municipality", kind: "municipality", countryCode: "HT",
      description: null, departmentCode: null, contactEmail: null, website: null };
    const url = "/api/v1/institutions";
    for (const field of [{ userId: institutionId }, { status: "verified" }, { role: "owner" }]) {
      assert.equal((await app.inject({ method: "POST", url, headers, payload: { ...payload, ...field } })).statusCode, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await app.inject({ method: "POST", url, headers, payload })).statusCode, 201);
    assert.deepEqual(calls.pop(), { name: "institution_save_for_api", input: { p_actor: actor, p_org: null, p_input: payload } });
    const review = await app.inject({ method: "POST", url: "/api/v1/me/verification", headers,
      payload: { kind: "government", organizationId: institutionId, evidence: ["http://example.invalid/private"] } });
    assert.equal(review.statusCode, 400);
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});
