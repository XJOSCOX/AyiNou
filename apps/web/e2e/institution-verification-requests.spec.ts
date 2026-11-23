import { randomUUID } from "node:crypto";
import { apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";

test("institution and representative verification hide only the action already in review",
  async ({ page, context, makeMember }) => {
    const [owner, representative, outsider] = await Promise.all([makeMember(), makeMember(), makeMember()]);
    const org = randomUUID();
    finishPersonalOnboarding(owner);
    sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
      values ('${org}','pending-${org.slice(0, 8)}','Pending verification fixture','nonprofit','HT','${owner.id}');
      insert into private.organization_memberships(organization_id,user_id,role)
      values ('${org}','${owner.id}','owner'), ('${org}','${representative.id}','editor');`);

    const path = "/api/v1/me/verification";
    const evidence = ["https://program.example.org/about", "https://directory.example.net/profile"];
    const request = (kind: string) => ({ kind, organizationId: org, evidence });
    const first = await apiCall(owner, path, 201, "POST", request("organization"));
    expect((await apiCall(representative, path, 200)).institutionRequests[org])
      .toEqual({ institution: "pending", representative: "available" });
    expect((await apiCall(outsider, path, 200)).institutionRequests).not.toHaveProperty(org);

    await inEnglish(context);
    await login(page, owner);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/institutions/" + org);
    const institutionLink = page.getByRole("link", { name: "Request verification", exact: true });
    const representativeLink = page.getByRole("link", { name: "Authorized representative", exact: true });
    await expect(page.getByText("Institution verification · Pending")).toBeVisible();
    await expect(institutionLink).toHaveCount(0);
    await expect(representativeLink).toBeVisible();

    await page.goto(`/verification?institution=${org}&kind=organization`);
    await expect(page.getByRole("status").filter({ hasText: "Institution verification · Pending" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);

    await apiCall(owner, path, 201, "POST", request("representative"));
    expect((await apiCall(representative, path, 200)).institutionRequests[org].representative).toBe("available");
    await page.goto("/institutions/" + org);
    await expect(page.getByText("Authorized representative · Pending")).toBeVisible();
    await expect(page.getByText("Institution verification · Pending")).toBeVisible();
    await expect(representativeLink).toHaveCount(0);
    await expect(institutionLink).toHaveCount(0);

    await page.goto(`/verification?institution=${org}&kind=representative`);
    await expect(page.getByRole("status").filter({ hasText: "Authorized representative · Pending" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);

    sql(`update private.verification_applications set status='rejected',decided_at=clock_timestamp() where id='${first.id}';`);
    await page.goto("/institutions/" + org);
    await expect(page.getByText("Authorized representative · Pending")).toBeVisible();
    await expect(representativeLink).toHaveCount(0);
    await expect(institutionLink).toBeVisible();
  });
