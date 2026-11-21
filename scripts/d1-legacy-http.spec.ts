import { api, apiCall, expect, sql, test } from "./fixtures";

// Copied into a disposable checkout of the pre-O2 API for D1's backward-compatibility exercise.
test("legacy API reads and updates an owned institution but cannot bypass O4", async ({ makeMember }) => {
  const actor = await makeMember();
  const org = "d1000000-0000-4000-8000-000000000003";
  const path = "/api/v1/institutions";
  const reject = async (endpoint: string, data: object) => {
    const response = await fetch(api + endpoint, {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: "Bearer " + actor.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    expect([403, 409, 503]).toContain(response.status);
  };

  await reject(path, {
    handle: "d1-old-forbidden", name: "D1 old forbidden", kind: "nonprofit",
    description: null, countryCode: "HT", departmentCode: null, website: null, contactEmail: null,
  });
  await reject("/api/v1/me/verification", {
    organizationId: org, kind: "claim", evidence: ["https://example.org/d1-disposable"],
  });
  expect(sql("select count(*) from private.organizations where handle='d1-old-forbidden';")).toBe("0");
  expect(sql(`select count(*) from private.verification_applications where organization_id='${org}' and applicant_id='${actor.id}';`)).toBe("0");

  const owned = sql(`insert into private.organizations(handle,name,kind,country_code,created_by)
    values ('d1-old-owner','D1 old owner','nonprofit','HT','${actor.id}') returning id;`).split("\n")[0].trim();
  expect(owned).toMatch(/^[0-9a-f-]{36}$/);
  sql(`insert into private.organization_memberships(organization_id,user_id,role) values ('${owned}','${actor.id}','owner');`);
  await apiCall(actor, path + "/" + owned, 200);
  await apiCall(actor, path + "/" + owned, 200, "PATCH", { description: "D1 compatible owner update" });
  expect(sql(`select count(*) from private.institution_audit where organization_id='${owned}' and actor_id='${actor.id}' and event='organization_updated';`)).toBe("1");
});
