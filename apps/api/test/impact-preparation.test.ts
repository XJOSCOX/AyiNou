import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const founder = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const workspace = "33333333-3333-4333-8333-333333333333";
const session = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";
const path = "/api/v1/admin/impact";

test("disabled Impact services expose only authorized preparation commands", async (t) => {
  const changes: Record<string, unknown>[] = [];
  const institutions: InstitutionRepository = {
    async rpc<T>(rpc: string, input: Record<string, unknown>) {
      if (rpc === "platform_access_for_api") return { founder: input.p_actor === founder, administrator: true } as T;
      assert.equal(rpc, "c24_manage_for_api");
      assert.equal(input.p_actor, founder);
      assert.equal(input.p_session, session);
      assert.equal(input.p_workspace, workspace);
      assert.equal(input.p_lane, "founder");
      if (input.p_action === "overview") return { preparation: { fixtureOperations: true } } as T;
      assert.equal(input.p_action, "configure");
      changes.push(input.p_input as Record<string, unknown>);
      return { version: 1 } as T;
    },
    async publicProfile() { return null; },
    async accounts() { throw new Error("Unexpected account call"); },
    async manage() { throw new Error("Unexpected management call"); },
    async logo() { throw new Error("Unexpected media call"); },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), { institutions, auth: {
    async verify() { return null; },
    async verifySession(token, staff) {
      if (token === "expired" || (staff && token === "password")) return null;
      return { actor: token === "administrator" ? member : founder, session, aal2: token !== "password", totpAt: 1_700_000_000 };
    },
  } });
  t.after(() => app.close());
  const headers = (token: string) => ({ authorization: "Bearer " + token, "x-ayinou-workspace": workspace });
  const common = { requestId, expectedVersion: 0, confirmed: true, reason: "Prepare the next permitted reporting period." };
  const config = { ...common, action: "configure", years: [2025], sectors: ["education"], departments: ["HT-CE"],
    links: true, measurements: true, needs: false };
  assert.equal((await app.inject(path)).statusCode, 401);
  assert.equal((await app.inject({ url: path, headers: headers("administrator") })).statusCode, 403);
  assert.equal((await app.inject({ url: path, headers: headers("expired") })).statusCode, 401);
  assert.equal((await app.inject({ url: path, headers: headers("password") })).json().error.code, "MFA_REQUIRED");
  const current = await app.inject({ url: path, headers: headers("founder") });
  assert.equal(current.headers["cache-control"], "private, no-store");
  assert.deepEqual(current.json(), { preparation: { fixtureOperations: false } });
  const update = (payload: object) => app.inject({ url: path, headers: headers("founder"), method: "PATCH", payload });
  assert.equal((await update({ ...config, enabled: true })).statusCode, 400);
  assert.equal((await update({ ...common, action: "propose_report", year: 2025, scope: "education" })).statusCode, 404);
  assert.equal((await update(config)).statusCode, 200);
  assert.deepEqual(changes, [Object.fromEntries(Object.entries(config).filter(([key]) => key !== "action"))]);
  assert.deepEqual((await app.inject("/api/v1/impact")).json(), { state: "disabled" });
  assert.equal((await app.inject({ url: "/api/v1/private/impact-review", headers: headers("founder") })).statusCode, 404);
});
