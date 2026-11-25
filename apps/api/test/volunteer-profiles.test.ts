import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const actor = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const path = "/api/v1/me/volunteer-profile";

test("a non-disposable backend never receives the volunteer fixture permission", async (t) => {
  const repository: InstitutionRepository = {
    async rpc<T>(name: string, input: Record<string, unknown>) {
      assert.equal(name, "c31_volunteer_for_api");
      assert.equal(input.p_actor, actor);
      assert.equal(input.p_session, session);
      assert.equal(input.p_fixture, false);
      assert.equal(input.p_lane, "owner");
      return { intake: false, profile: null } as T;
    },
    async publicProfile() { return null; },
    async accounts() { throw new Error("Unexpected account call"); },
    async manage() { throw new Error("Unexpected management call"); },
    async logo() { throw new Error("Unexpected media call"); },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent", AYINOU_VOLUNTEER_PROFILES: "synthetic" }), { institutions: repository, auth: {
    async verify() { return null; },
    async verifySession() { return { actor, session, aal2: false }; },
  } });
  t.after(() => app.close());
  const headers = { authorization: "Bearer member" };
  assert.equal((await app.inject(path)).statusCode, 401);
  const closed = await app.inject({ url: path, headers });
  assert.equal(closed.headers["cache-control"], "private, no-store");
  assert.deepEqual(closed.json(), { intake: false, profile: null });
  assert.equal((await app.inject({ url: path + "?actor=" + actor, headers })).statusCode, 400);
  assert.equal((await app.inject({ method: "PATCH", url: path, headers,
    payload: { action: "pause", expectedVersion: 1, requestId: actor, actor } })).statusCode, 400);
});
