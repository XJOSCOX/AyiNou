import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

const actor = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const path = "/api/v1/institutions/" + organization + "/opportunities";

test("opportunity RPC scope comes from the session and cannot enable a non-disposable backend", async t => {
  let calls = 0;
  const repository: InstitutionRepository = {
    async rpc<T>(name: string, input: Record<string, unknown>) {
      calls += 1;
      assert.equal(name, "c41_opportunities_for_api");
      assert.equal(input.p_actor, actor);
      assert.equal(input.p_session, session);
      assert.equal(input.p_org, organization);
      assert.equal(input.p_workspace, null);
      assert.equal(input.p_fixture, false);
      assert.equal(input.p_action, "list");
      return { enabled: false, items: [] } as T;
    },
    async publicProfile() { return null; },
    async accounts() { throw new Error("Unexpected account call"); },
    async manage() { throw new Error("Unexpected management call"); },
    async logo() { throw new Error("Unexpected media call"); },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent", AYINOU_PROFESSIONAL_OPPORTUNITIES: "synthetic" }), {
    institutions: repository,
    auth: {
      async verify() { return null; },
      async verifySession() { return { actor, session, aal2: false }; },
    },
  });
  t.after(() => app.close());
  const headers = {authorization:"Bearer member"};
  assert.equal((await app.inject(path)).statusCode, 401);
  assert.equal((await app.inject({ url:path+"?actor="+session, headers })).statusCode, 400);
  const response = await app.inject({url:path,headers});
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.deepEqual(response.json(), {enabled:false,items:[]});
  assert.equal(calls, 1);
});
