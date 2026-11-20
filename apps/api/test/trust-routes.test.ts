import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { feedDatabaseError } from "../src/services/feed.js";

test("trust routes keep identity and subject decisions server-bound", async () => {
  const user = randomUUID();
  const id = randomUUID();
  const calls: string[] = [];
  const app = createApp(readConfig({ LOG_LEVEL: "silent" }), {
    auth: { async verify(token) { return token === "member" ? user : null; } },
    feed: {
      async read() { return []; },
      async recommendations() { return { snapshotId: "", algorithmVersion: "", rows: [] }; },
      async rpc<T>(_token: string | null, name: string) {
        calls.push(name);
        if (name === "assign_verification_appeal_for_client") throw feedDatabaseError("PVT04");
        return id as T;
      },
    },
  });
  const appeals = "/api/v1/me/verification/appeals";
  const headers = { authorization: "Bearer member" };
  try {
    assert.equal((await app.inject(appeals)).statusCode, 401);
    const data = { applicationId: id, explanation: "Test an explicit written reason.", references: ["https://example.invalid/test"] };
    const forged = await app.inject({ method: "POST", url: appeals, headers, payload: { ...data, appellantId: user } });
    assert.equal(forged.statusCode, 400);
    assert.deepEqual(calls, []);
    const sent = await app.inject({ method: "POST", url: appeals, headers, payload: data });
    assert.equal(sent.statusCode, 201);
    assert.deepEqual(sent.json(), { id });
    const report = "/api/v1/institutions/by-handle/sample-institution/impersonation-reports";
    const reportData = { kind: "representative", explanation: data.explanation, references: data.references };
    assert.equal((await app.inject({ method: "POST", url: report, payload: reportData })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: report, headers, payload: { ...reportData, reporterId: user } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: report, headers, payload: { ...reportData, kind: "badge" } })).statusCode, 400);
    const institutionalReport = await app.inject({ method: "POST", url: report, headers, payload: reportData });
    assert.equal(institutionalReport.statusCode, 201);
    assert.equal(calls.at(-1), "submit_institution_impersonation_for_client");
    const result = await app.inject({ method: "PATCH", url: `/api/v1/trust/verification-appeals/${id}/assignment`, headers,
      payload: { reviewer: "test_reviewer", reason: "Written assignment reason." } });
    assert.equal(result.statusCode, 404);
    assert.equal(result.json().error.code, "TRUST_CASE_UNAVAILABLE");
  } finally {
    await app.close();
  }
});
