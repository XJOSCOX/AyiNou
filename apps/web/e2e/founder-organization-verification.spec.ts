import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, localClient, login, openAdministration, solveMfa, sql, test, totp } from "./fixtures";

test("Founder can decide their own organization and representative requests and route protected cases", async ({ page, makeMember }) => {
  const [founder, admin, delegate] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  finishPersonalOnboarding(founder);
  async function elevate(member: typeof founder) {
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
    const enrollment = await client.auth.mfa.enroll({ factorType: "totp" });
    if (enrollment.error) throw enrollment.error;
    const secret = enrollment.data.totp.secret;
    const result = await client.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(secret) });
    if (result.error) throw result.error;
    return { ...member, secret, token: result.data.access_token };
  }
  const [actor, other, reviewer] = await Promise.all([elevate(founder), elevate(admin), elevate(delegate)]);
  sql(`insert into private.platform_bootstrap(user_id) values ('${actor.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values ('${actor.id}','first_account_bootstrapped','Disposable founder review test');
    insert into public.role_assignments(user_id,role) values ('${other.id}','administrator');
    insert into private.verification_reviewers(user_id) values ('${reviewer.id}');`);
  try {
    const handle = "founder-review-" + randomUUID().slice(0, 8);
    const org = randomUUID();
    const ministry = randomUUID();
    sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by) values
      ('${org}','${handle}','Founder Review Business','business','HT','${actor.id}'),
      ('${ministry}','${handle}-gov','Protected Ministry','ministry','HT','${actor.id}');
      insert into private.organization_memberships(organization_id,user_id,role)
        values ('${org}','${actor.id}','owner'),('${ministry}','${actor.id}','owner');`);
    const evidence = ["https://example.org/register", "https://example.net/registry"];
    const apply = (organizationId: string, kind: string) =>
      apiCall(actor, "/api/v1/me/verification", 201, "POST", { organizationId, kind, evidence });
    const { id } = await apply(org, "organization");
    const government = await apply(ministry, "government");
    const governmentRepresentative = await apply(ministry, "representative");
    const representative = await apply(org, "representative");
    const assignments = "/api/v1/trust/application-assignments";
    const queue = (await apiCall(actor, assignments, 200)).applications;
    expect(queue).toContainEqual(
      expect.objectContaining({ id, organizationName: "Founder Review Business", canRelease: false }),
    );
    expect(queue).toContainEqual(expect.objectContaining({ id: representative.id, canFounderReview: true, canRelease: false }));
    for (const protectedCase of [government, governmentRepresentative]) {
      expect(queue).toContainEqual(expect.objectContaining({ id: protectedCase.id, canFounderReview: false, canRelease: false }));
    }
    const assign = (application: string, handle: string, status: number) =>
      apiCall(actor, "/api/v1/trust/applications/" + application + "/assignment", status, "PATCH",
        { reviewer: handle, reason: "Request an independent organization review.", assign: true });
    await assign(id, founder.handle, 404);
    await assign(id, reviewer.handle, 204);
    await assign(government.id, reviewer.handle, 204);
    const workspace = (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const otherWorkspace = (await apiCall(other, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const send = (token: string, application: string, ref: string, body?: object) =>
      fetch(api + "/api/v1/admin/founder-blue-verification/" + application, {
        method: body ? "POST" : "GET",
        headers: { Authorization: "Bearer " + token, "X-Ayinou-Workspace": ref, ...(body && { "Content-Type": "application/json" }) },
        body: body ? JSON.stringify(body) : undefined,
      });
    expect((await send(actor.token, government.id, workspace)).status).toBe(404);
    expect((await send(actor.token, governmentRepresentative.id, workspace)).status).toBe(404);
    expect((await send(other.token, representative.id, otherWorkspace)).status).toBe(404);
    expect((await send(other.token, id, otherWorkspace)).status).toBe(404);
    expect((await send(actor.token, id, otherWorkspace)).status).toBe(404);
    const response = await send(actor.token, id, workspace);
    expect(response.status).toBe(200);
    const { revision } = await response.json();
    const body = { expectedVersion: revision, requestId: randomUUID(), reason: "Reviewed the public organization references.",
      noConflict: true, decision: "approve" };
    expect((await send(actor.token, id, workspace, { ...body, expectedVersion: revision + 1 })).status).toBe(409);
    const [first, repeated] = await Promise.all([send(actor.token, id, workspace, body), send(actor.token, id, workspace, body)]);
    expect([first.status, repeated.status]).toEqual([200, 200]);
    expect(await first.json()).toEqual(await repeated.json());
    expect(sql(`select a.status || ':' || o.verification_status || ':' || private.project_organization_verified(o.id)::text
      from private.verification_applications a join private.organizations o on o.id=a.organization_id where a.id='${id}';`))
      .toBe("approved:verified:false");
    expect(sql(`select count(*) from private.verification_reviews where application_id='${id}';`)).toBe("0");
    expect(sql(`select count(*) from private.institution_audit where subject_id='${id}' and event='founder_organization_approved';`)).toBe("1");

    const repEvidence = await send(actor.token, representative.id, workspace);
    expect(repEvidence.status).toBe(200);
    expect((await repEvidence.json()).evidence.sort()).toEqual([...evidence].sort());
    expect((await send(actor.token, representative.id, workspace, body)).status).toBe(409);

    const appealId = randomUUID();
    const originalDecision = randomUUID();
    sql(`update private.verification_applications set status='rejected',decided_at=now() where id='${governmentRepresentative.id}';
      insert into private.verification_reviews(id,application_id,reviewer_id,decision,rationale)
      values ('${originalDecision}','${governmentRepresentative.id}','${other.id}','reject','Synthetic prior decision.');
      insert into private.verification_appeals(id,application_id,decision_id,appellant_id,explanation,reference_urls)
      values ('${appealId}','${governmentRepresentative.id}','${originalDecision}','${actor.id}','Private test appeal context.',array[]::text[]);`);
    const appealPath = "/api/v1/trust/verification-appeals";
    expect((await apiCall(actor, appealPath + "?view=assign", 200)).appeals).toContainEqual(
      expect.objectContaining({ id: appealId, assigned: false }),
    );
    const routeAppeal = { reviewer: reviewer.handle, reason: "Route this case to a separate eligible reviewer." };
    await apiCall(actor, `${appealPath}/${appealId}/assignment`, 204, "PATCH", routeAppeal);
    expect((await apiCall(actor, appealPath + "?view=assign", 200)).appeals.find((item: { id: string }) => item.id === appealId))
      .not.toHaveProperty("explanation");
    await apiCall(actor, `${appealPath}/${appealId}/assignment`, 204, "PATCH", routeAppeal);
    expect(sql(`select count(*) from private.verification_appeal_assignments where appeal_id='${appealId}';`)).toBe("1");

    const handle2 = handle + "-second";
    const org2 = randomUUID();
    sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
      values ('${org2}','${handle2}','Founder Review Second','business','HT','${actor.id}');
      insert into private.organization_memberships(organization_id,user_id,role) values ('${org2}','${actor.id}','owner');`);
    await apply(org2, "organization");
    await inEnglish(page.context());
    await login(page, founder);
    await solveMfa(page, actor.secret);
    await openAdministration(page);
    await page.getByRole("button", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: "Trust and verification" }).click();
    const repItem = page.locator("details").filter({
      has: page.locator("summary", { hasText: "Authorized representative · Founder Review Business" }),
    });
    await repItem.locator("summary").click();
    await repItem.getByRole("button", { name: "Review as Founder" }).click();
    const approveRep = repItem.getByRole("button", { name: "Approve representative verification" });
    const repForm = repItem.locator("form").filter({ has: page.getByRole("button", { name: "Approve representative verification" }) });
    await repForm.getByRole("textbox", { name: "Written reason" }).fill("Reviewed public authorization for this specific representative grant.");
    await repForm.getByRole("checkbox").check();
    await approveRep.click();
    await expect(repItem).toHaveCount(0);
    expect(sql(`select a.status || ':' || (m.verified_at is not null)::text || ':' || m.public_verified_rep::text
      from private.verification_applications a join private.organization_memberships m on m.id=a.membership_id
      where a.id='${representative.id}';`)).toBe("approved:true:false");
    expect(sql(`select count(*) from private.verification_reviews where application_id='${representative.id}';`)).toBe("0");
    expect(sql(`select count(*) from private.a1a_audit_source where resource_ref='${representative.id}'
      and authority='founder' and outcome='approved';`)).toBe("1");

    const item = page.locator("details").filter({ has: page.locator("summary", { hasText: "Founder Review Second" }) });
    await item.locator("summary").click();
    await item.getByRole("button", { name: "Review as Founder" }).click();
    await expect(item.getByRole("link", { name: evidence[0] })).toBeVisible();
    const decision = item.locator("form").filter({ has: page.getByRole("button", { name: "Approve organization verification" }) });
    await decision.getByRole("textbox", { name: "Written reason" }).fill("This test application needs updated information.");
    await decision.getByRole("checkbox").check();
    await decision.getByRole("button", { name: "Reject" }).click();
    await expect(item).toHaveCount(0);
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${actor.id}';`);
  }
});
