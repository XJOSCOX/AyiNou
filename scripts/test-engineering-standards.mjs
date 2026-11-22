import assert from "node:assert/strict";
import { test } from "node:test";
import { changedRoutes, reportSections, verifyAuditIntegration, verifyDeclarations } from "./check-engineering-standards.mjs";

const report = "docs/example_IMPLEMENTATION_REPORT.md";
const route = "POST /api/v1/example";
const contract = route + " 1024 -";
const migration = "supabase/migrations/29990101000000_example.sql";
const authorization = "apps/api/test/example.test.ts";

function input() {
  const files = new Map([
    [report, reportSections.map((name) => "## " + name + "\nSpecific evidence for " + name + ".").join("\n")],
    [migration, "select 1"],
    [authorization, "example fixture"],
  ]);
  return {
    registry: { features: [{
      id: "example", report,
      routes: [{ route, contract, access: "restricted", audit: { kind: "durable", detail: "Receipt commits with mutation." },
        authorization: { file: authorization, denialScenario: "Cross-subject request is denied." } }],
      migrations: [{ file: migration, rlsAndGrants: "Private table is service-only.", authorization: "Current owner checked.",
        compatibility: "Additive table.", validation: "Disposable allow and deny tests.", rolloutAndRollback: "Deploy schema first." }],
    }] },
    routes: [contract], migrations: [migration], reports: [report], read: (file) => files.get(file), exists: (file) => files.has(file), files,
  };
}

test("changed route contracts are detected and generated HEAD companions are skipped", () => {
  assert.deepEqual(changedRoutes("GET /one - -\n", "GET /one 2048 -\nHEAD /one 2048 onSend\nHEAD /two - -\n"), ["GET /one 2048 -", "HEAD /two - -"]);
});

test("restricted routes and migrations require authorization, audit and SQL review evidence", () => {
  const sample = input();
  assert.deepEqual(verifyDeclarations(sample), []);
  assert.ok(verifyDeclarations({ ...sample, routes: [route + " 4096 -"] })[0].includes("add a route audit"));
  sample.registry.features[0].routes[0].audit = { kind: "exception", detail: "N/A" };
  sample.registry.features[0].routes[0].authorization.file = "apps/api/test/missing.test.ts";
  delete sample.registry.features[0].migrations[0].compatibility;
  assert.match(verifyDeclarations(sample).join("\n"), /explicit audit exception.*\n.*authorization test.*\n.*compatibility/);
});

test("an explicit public read exception works and reports still require substantive sections", () => {
  const sample = input();
  sample.registry.features[0].routes[0] = {
    route, contract, access: "public", audit: { kind: "exception", detail: "Read-only public status carries no actor." },
    publicReason: "Only publishes service availability.",
  };
  assert.deepEqual(verifyDeclarations(sample), []);
  sample.files.set(report, "## Scope\nDefined scope.\n## Permissions and audit\nN/A");
  assert.ok(verifyDeclarations(sample).some((line) => line.endsWith("missing or empty section Permissions and audit")));
});

test("unregistered routes, migrations and reports have actionable errors", () => {
  const sample = input();
  sample.registry.features = [];
  assert.equal(verifyDeclarations(sample).length, 3);
});

test("audit integration declarations validate statuses, evidence links and module identity", () => {
  const entry = {
    module: "example", status: "covered", requiredEvents: "Record material changes.", observed: "Native transaction.",
    sources: ["private.example_events"], viewers: "Scoped staff.", excluded: "Evidence payloads.",
    missing: [], tests: ["apps/api/test/example.test.ts"], remediation: "Review retention policy.",
  };
  const exists = (file) => file === "apps/api/test/example.test.ts";
  assert.deepEqual(verifyAuditIntegration({ version: 1, modules: [entry] }, exists), []);
  const invalid = { ...entry, status: "deployed", tests: ["../outside"] };
  assert.equal(verifyAuditIntegration({ version: 1, modules: [invalid, invalid] }, exists).length, 3);
});
