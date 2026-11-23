import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const config = readConfig({ LOG_LEVEL: "silent" });
const path = "/api/v1/admin/homepage/community-statistics";
const publicPath = "/api/v1/homepage/community-statistics";
const founder = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const workspace = "33333333-3333-4333-8333-333333333333";
const session = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";

function repository(rpc: InstitutionRepository["rpc"]): InstitutionRepository {
  return {
    rpc,
    async publicProfile() { return null; },
    async accounts() { throw new Error("Unexpected account call"); },
    async manage() { throw new Error("Unexpected institution call"); },
    async logo() { throw new Error("Unexpected logo call"); },
  };
}

test("homepage statistics reads only the policy-checked projection and never caches it", async (t) => {
  let result: unknown = { registered: null, haiti: 20, diaspora: null };
  const app = createApp(config, { institutions: repository(async <T>(name: string, input: Record<string, unknown>) => {
    assert.equal(name, "homepage_community_statistics_for_api");
    assert.deepEqual(input, {});
    if (result instanceof Error) throw result;
    return result as T;
  }) });
  t.after(() => app.close());
  const on = await app.inject(publicPath);
  assert.deepEqual(on.json(), { stats: result });
  assert.equal(on.headers["cache-control"], "no-store");

  result = null;
  const off = await app.inject(publicPath);
  assert.deepEqual(off.json(), { stats: null });
  assert.equal(off.headers["cache-control"], "no-store");

  for (const invalid of [undefined, { registered: 5, haiti: 20, diaspora: null, memberId: "private" }, new Error("backend unavailable")]) {
    result = invalid;
    const response = await app.inject(publicPath);
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().error.code, "SERVICE_UNAVAILABLE");
    assert.equal(response.body.includes("memberId") || response.body.includes("backend unavailable"), false);
  }
});

test("homepage writes require a verified Founder and transport only strict inputs to the workspace policy RPC", async (t) => {
  const calls: Record<string, unknown>[] = [];
  const app = createApp(config, {
    institutions: repository(async <T>(rpc: string, input: Record<string, unknown>) => {
      if (rpc === "platform_access_for_api") return { founder: input.p_actor === founder, administrator: true } as T;
      assert.equal(rpc, "founder_homepage_policy_for_api");
      calls.push(input);
      return { key: "homepage.community_statistics.enabled", enabled: false, revision: 2, updatedAt: "2026-11-22T00:00:00Z" } as T;
    }),
    auth: {
      async verify() { return null; },
      async verifySession(token, requireMfa) {
        if (token === "revoked" || (token === "password" && requireMfa)) return null;
        return { actor: token === "administrator" ? other : founder, session, aal2: token !== "password", totpAt: 1_700_000_000 };
      },
    },
  });
  t.after(() => app.close());
  const command = { enabled: false, expectedRevision: 1, reason: "Pause homepage statistics.", requestId };
  const submit = (token: string, payload: object = command, ref = workspace) => app.inject({
    url: path, method: "PATCH", headers: { authorization: `Bearer ${token}`, "x-ayinou-workspace": ref }, payload,
  });
  assert.equal((await app.inject(path)).statusCode, 401);
  assert.equal((await submit("revoked")).statusCode, 401);
  assert.equal((await submit("password")).json().error.code, "MFA_REQUIRED");
  assert.equal((await submit("administrator")).statusCode, 403);
  assert.equal((await submit("founder", command, "invalid-workspace")).statusCode, 404);
  assert.equal((await submit("founder", { ...command, enabled: "false" })).statusCode, 400);
  assert.equal((await submit("founder", { ...command, actor: other })).statusCode, 400);
  assert.equal((await submit("founder", { ...command, reason: " " })).statusCode, 400);
  assert.deepEqual(calls, []);
  const accepted = await submit("founder");
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.headers["cache-control"], "private, no-store");
  assert.deepEqual(calls, [{
    p_actor: founder, p_session: session, p_aal2: true, p_totp: 1_700_000_000,
    p_workspace: workspace, p_enabled: false, p_expected: 1, p_reason: command.reason, p_request: requestId,
  }]);
});
