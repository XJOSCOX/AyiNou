import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";
import { institutionMessages } from "../src/lib/institution-i18n";

const path = "/api/v1/me/verification";
const identity = { organizationId: null, kind: "identity", evidence: ["https://example.org/identity"] };
const publicFigure = { organizationId: null, kind: "notable_person", evidence: ["https://example.org/figure", "https://example.net/figure"] };

test("personal verification allows one pending request and blocks already-verified requests @smoke",
  async ({ page, context, makeMember }) => {
    const member = await makeMember();
    const reviewer = await makeMember();
    const concurrent = await Promise.all([identity, publicFigure].map(body => fetch(api + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + member.token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })));
    expect(concurrent.map(response => response.status).sort()).toEqual([201, 409]);
    const { id } = await concurrent.find(response => response.ok)!.json();
    expect((await concurrent.find(response => !response.ok)!.json()).error.code).toBe("VERIFICATION_REQUEST_PENDING");
    expect((await apiCall(member, path, 200)).personalRequests).toEqual({ identity: "pending", notable_person: "pending" });
    expect(sql(`select count(*) from private.institution_audit where actor_id='${member.id}'
      and event='application_submitted';`)).toBe("1");

    finishPersonalOnboarding(member);
    await inEnglish(context);
    await login(page, member);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/verification");
    const labels = institutionMessages.en;
    const type = page.getByLabel(labels.applicationType);
    const submit = page.getByRole("button", { name: labels.submit, exact: true });
    const pending = page.getByRole("status").filter({ hasText: labels.personalRequestPendingTitle });
    await expect(pending).toContainText(labels.personalRequestPending);
    await expect(submit).toHaveCount(0);
    await expect(page.getByLabel(labels.evidence)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const applicationsLink = page.getByRole("link", { name: labels.viewMyApplications });
    await applicationsLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#my-verification-applications$/);
    await expect(page.locator("#my-verification-applications")).toBeFocused();
    await type.selectOption("notable_person");
    await expect(pending).toBeVisible();
    await expect(submit).toHaveCount(0);

    // Rehearse a completed historical decision without requiring another reviewer UI flow.
    sql(`update private.verification_applications set status='rejected',decided_at=clock_timestamp() where id='${id}';`);
    await page.reload();
    await expect(submit).toBeEnabled();
    const accepted = await apiCall(member, path, 201, "POST", identity);
    sql(`update private.verification_applications set status='approved',decided_at=clock_timestamp() where id='${accepted.id}';
      insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values ('${member.id}','identity','verified','review','${reviewer.id}',clock_timestamp());`);
    const redundant = await apiCall(member, path, 409, "POST", identity);
    expect(redundant.error.code).toBe("VERIFICATION_ALREADY_VERIFIED");
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: labels.personalAlreadyVerifiedTitle }))
      .toContainText(labels.personalAlreadyVerified);
    await expect(submit).toHaveCount(0);
    await type.selectOption("notable_person");
    await expect(submit).toBeEnabled();
    await apiCall(member, path, 201, "POST", publicFigure);
  });
