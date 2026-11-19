import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";

test("platform administration checks the live role and MFA, and derives the actor from the token", async () => {
  const admin = "11111111-1111-4111-8111-111111111111";
  const member = "22222222-2222-4222-8222-222222222222";
  const calls: Record<string, unknown>[] = [];
  const institutions: InstitutionRepository = {
    async rpc<T>(name: string, input: Record<string, unknown>) {
      if (name === "platform_access_for_api") return { administrator: input.p_actor === admin } as T;
      assert.equal(name, "admin_account_action_for_api");
      calls.push(input);
      return undefined as T;
    },
    async publicProfile() { return null; },
    async accounts() { throw new Error("Unexpected account lookup"); },
    async manage() { throw new Error("Unexpected institution lookup"); },
    async logo() { throw new Error("Unexpected logo upload"); },
  };
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    institutions,
    auth: {
      async verify(token, requireMfa) {
        if (token === "mfa") return admin;
        if (requireMfa) return null;
        if (token === "member") return member;
        if (token === "password") return admin;
        return null;
      },
    },
  });
  const payload = { action: "status", value: "suspended", reason: "Example administrative review" };
  const submit = (token: string, input = payload) => app.inject({
    method: "PATCH", url: `/api/v1/admin/accounts/${member}`, headers: { authorization: `Bearer ${token}` }, payload: input,
  });
  try {
    assert.equal((await submit("revoked")).statusCode, 401);
    assert.equal((await submit("member")).json().error.code, "FORBIDDEN");
    assert.equal((await submit("password")).json().error.code, "MFA_REQUIRED");
    const injected = { ...payload, actor: member };
    assert.equal((await submit("mfa", injected)).statusCode, 400);
    assert.equal(calls.length, 0);
    const accepted = await submit("mfa");
    assert.equal(accepted.statusCode, 204);
    assert.equal(accepted.headers["cache-control"], "private, no-store");
    assert.deepEqual(calls, [{
      p_actor: admin, p_subject: member, p_action: payload.action, p_value: payload.value, p_reason: payload.reason,
    }]);
  } finally {
    await app.close();
  }
});
