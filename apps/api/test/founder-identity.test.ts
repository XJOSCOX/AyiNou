import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { InstitutionRepository } from "../src/services/institutions.js";
import { InstitutionError } from "../src/services/institutions.js";

const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const member = "/api/v1/me/founder-identity";
const admin = "/api/v1/admin/founder-identity";

test("founder routes fail closed, scope credentials and reject caller-supplied evidence or authority", async (t) => {
  const calls: Record<string, unknown>[] = [];
  const repo: InstitutionRepository = {
    async rpc<T>(_name: string, input: Record<string, unknown>) {
      calls.push(input);
      if (input.p_admin) throw new InstitutionError("FORBIDDEN", 403);
      return { issuanceEnabled: false, cases: [] } as T;
    },
    async accounts() { throw new Error("Unexpected call"); },
    async manage() { throw new Error("Unexpected call"); },
    async publicProfile() { throw new Error("Unexpected call"); },
    async logo() { throw new Error("Unexpected call"); },
  };
  const totpAt = Math.floor(Date.now() / 1000);
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    institutions: repo,
    auth: {
      async verify() { return null; },
      async verifySession(token, privileged) {
        if (token === "recent") return { actor, session, aal2: true, totpAt };
        if (!privileged && token === "password") return { actor, session, aal2: false };
        return null;
      },
    },
  });
  t.after(() => app.close());
  for (const path of [member, admin]) {
    const response = await app.inject({ url: path });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["cache-control"], "private, no-store");
  }
  const response = await app.inject({ url: admin, headers: { authorization: "Bearer password" } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "MFA_REQUIRED");
  assert.equal(calls.length, 0);

  const privileged = { authorization: "Bearer recent" };
  const ordinaryAdmin = await app.inject({ url: admin, headers: privileged });
  assert.equal(ordinaryAdmin.statusCode, 403);
  assert.equal(ordinaryAdmin.json().error.code, "FORBIDDEN");
  assert.deepEqual(calls, [{ p_actor: actor, p_session: session, p_aal2: true, p_totp_at: totpAt, p_admin: true }]);

  const command = { expectedVersion: 3, policyVersion: 1, requestId: id };
  for (const [url, payload] of [
    [admin + "/" + id + "/actions", { ...command, action: "grant", reason: "confirmed" }],
    [admin + "/" + id + "/actions", { ...command, action: "grant", reason: "confirmed", noConflict: true, proof: true }],
    [member + "/" + id + "/actions", { ...command, action: "consent", disclose: true, subjectId: actor }],
    [admin, { username: "new_member", requestId: id, reason: "member_request", founder: true }],
  ] as const) {
    const result = await app.inject({ method: "POST", url, headers: privileged, payload });
    assert.equal(result.statusCode, 400);
    assert.equal(result.headers["cache-control"], "private, no-store");
  }
  assert.equal(calls.length, 1);
});
