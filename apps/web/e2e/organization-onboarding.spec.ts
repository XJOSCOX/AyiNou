import { randomUUID } from "node:crypto";
import { api, apiCall, expect, inEnglish, login, logout, sql, test } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";
import en from "../src/messages/organization-onboarding/en.json";
import ht from "../src/messages/organization-onboarding/ht.json";
import fr from "../src/messages/organization-onboarding/fr.json";
import es from "../src/messages/organization-onboarding/es.json";

const path = "/api/v1/me/organization-onboarding";
const route = "/organization-onboarding";
const mailpit = "http://127.0.0.1:55324";

for (const kind of ["individual", "organization"] as const) {
  test(`personal signup and email confirmation through the ${kind} choice @smoke`, async ({ page, context, browser, makeMember }) => {
    const referrer = await makeMember();
    const { referralCode } = await apiCall(referrer, "/api/v1/me/referral-code", 200);
    await inEnglish(context);
    await page.setViewportSize({ width: kind === "organization" ? 320 : 1440, height: 900 });
    await page.goto("/register");
    await expect(page.locator('input[name="signup-path"][value="individual"]')).toBeChecked();
    for (const [locale, message] of Object.entries({ ht, fr, es, en })) {
      await page.getByRole("combobox").last().selectOption(locale);
      await expect(page.getByText(message.choice, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(kind === "organization" ? 320 : 1440);
    }
    const email = `o2-${randomUUID()}@example.com`;
    const password = "Disposable-signup!9";
    const m = membershipMessages.en;
    const t = authMessages.en;
    await page.locator(`input[name="signup-path"][value="${kind}"]`).check();
    await page.getByLabel(m.firstName, { exact: true }).fill("Ada");
    await page.getByLabel(m.lastName, { exact: true }).fill("Fixture");
    await page.locator("#display-name").fill("O2 Fixture");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirm-password").fill(password);
    await page.locator('input[autocomplete="off"]').last().fill(referralCode);
    await page.getByRole("main").getByRole("button", { name: t.register, exact: true }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    let messageId: string | undefined;
    await expect.poll(async () => {
      const response = await fetch(mailpit + "/api/v1/messages", { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return false;
      const { messages } = await response.json();
      messageId = messages?.find((item: { To: { Address: string }[] }) => item.To.some((to) => to.Address === email))?.ID;
      return !!messageId;
    }).toBe(true);
    const message = await (await fetch(mailpit + "/api/v1/message/" + messageId)).json();
    const link = String(message.Text).match(/https?:\/\/[^\s<(]+\/auth\/v1\/verify\?[^\s)>]+/);
    expect(link).not.toBeNull();
    const verification = new URL(link![0]);
    expect(verification.origin).toBe("http://127.0.0.1:55321");
    await page.goto(verification.href);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("radio", { name: m.haitian, exact: true }).check();
    await page.getByRole("button", { name: m.continue, exact: true }).click();
    await page.reload();
    await expect(page.locator('[aria-current="step"]')).toHaveText(m.location);
    await page.getByRole("button", { name: m.skip, exact: true }).click();
    await page.getByLabel(/username/i).fill("o2_" + randomUUID().slice(0, 8));
    await page.getByRole("button", { name: m.continue, exact: true }).click();
    await page.getByRole("button", { name: m.skip, exact: true }).click();
    await page.getByRole("link", { name: en.resume, exact: true }).click();
    const member = sql(`select id from auth.users where email='${email}' and email_confirmed_at is not null;`);
    expect(member).toMatch(/^[a-z0-9-]{36}$/);
    expect(sql(`select count(*) from private.referrals where referred_user_id='${member}' and confirmed_at is not null;`)).toBe("1");
    expect(sql(`select count(*) from private.organizations where created_by='${member}';`)).toBe("0");
    expect(sql(`select count(*) from private.verification_applications where applicant_id='${member}';`)).toBe("0");

    if (kind === "individual") {
      await expect(page.getByText(en.pending, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: en.start })).toBeVisible();
      expect(sql(`select count(*) from private.organization_onboarding_intents where subject_id='${member}';`)).toBe("0");
      return;
    }

    await expect(page.getByText(en.selected, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: en.start }).click();
    await expect(page.getByText(en.drafting, { exact: true })).toBeVisible();
    await page.route(api + path, async (intercept) => {
      if (intercept.request().method() !== "PUT") return intercept.fallback();
      const committed = await intercept.fetch();
      expect(committed.ok()).toBe(true);
      await intercept.abort();
    }, { times: 1 });
    await page.getByRole("button", { name: en.save }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(en.failed);
    await page.getByRole("button", { name: en.retry, exact: true }).click();
    await expect(page.getByText(en.awaiting_identity, { exact: true })).toBeVisible();
    expect(sql(`select version from private.organization_onboarding_intents where subject_id='${member}';`)).toBe("3");

    await logout(page);
    const otherBrowser = await browser.newContext();
    try {
      await inEnglish(otherBrowser);
      const resume = await otherBrowser.newPage();
      await login(resume, { email, password });
      await expect(resume).toHaveURL(/\/dashboard/);
      await resume.goto(route);
      await expect(resume.getByText(en.awaiting_identity, { exact: true })).toBeVisible();
      await resume.getByRole("button", { name: en.cancelPath, exact: true }).click();
      await expect(resume.getByText(en.confirm)).toBeVisible();
      await resume.getByRole("button", { name: en.cancelPath, exact: true }).click();
      await expect(resume.getByText(en.cancelled)).toBeVisible();
      await resume.reload();
      await expect(resume.getByRole("button", { name: en.start })).toBeVisible();
      expect(sql(`select pathway || ':' || stage from private.organization_onboarding_intents where subject_id='${member}';`)).toBe("individual:cancelled");
      await logout(resume);
      await login(resume, referrer);
      await expect(resume).toHaveURL(/\/dashboard/);
      await resume.goto(route);
      await expect(resume.getByRole("link", { name: en.personalFirst })).toBeVisible();
      await expect(resume.getByText(en.pending, { exact: true })).toHaveCount(0);
    } finally {
      await otherBrowser.close();
    }
  });
}

test("organization intent is private, revocable, idempotent and versioned @smoke", async ({ makeMember }) => {
  const [owner, other] = await Promise.all([makeMember(), makeMember()]);
  expect((await fetch(api + path)).status).toBe(401);
  expect((await fetch(api + path, { headers: { Authorization: "Bearer expired" } })).status).toBe(401);
  const initial = { id: null, expectedVersion: 0, requestId: randomUUID(), stage: "drafting" };
  await apiCall(owner, path, 400, "PUT", { ...initial, verified: true });
  await apiCall(owner, path, 400, "PUT", { ...initial, stage: "completed" });
  const first = await Promise.all([apiCall(owner, path, 200, "PUT", initial), apiCall(owner, path, 200, "PUT", initial)]);
  expect(first[0]).toEqual(first[1]);
  expect((await apiCall(owner, path, 409, "PUT", { ...initial, stage: "awaiting_identity" })).error.code).toBe("IDEMPOTENCY_CONFLICT");
  const { id, version } = first[0].intent;
  const cancel = { expectedVersion: version, requestId: randomUUID() };
  const cancelPath = path + "/" + id + "/change-path";
  await apiCall(other, cancelPath, 404, "POST", cancel);
  expect((await apiCall(other, path, 200)).intent).toBeNull();
  expect(sql(`select private.project_identity_state('${owner.id}');`)).not.toBe("verified");
  expect(sql(`select count(*) from private.organization_memberships where user_id='${owner.id}';`)).toBe("0");
  const responses = await Promise.all([1, 2].map(() => fetch(api + path, {
    method: "PUT",
    headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" },
    body: JSON.stringify({ id, expectedVersion: version, stage: "awaiting_identity", requestId: randomUUID() }),
  })));
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await responses.find((response) => response.status === 409)!.json()).error.code).toBe("STALE_VERSION");
  expect((await apiCall(owner, cancelPath, 409, "POST", cancel)).error.code).toBe("STALE_VERSION");

  expect(sql("select has_table_privilege('authenticated','private.organization_onboarding_intents','select');")).toBe("f");
  expect(sql("select has_function_privilege('authenticated','public.organization_intent_for_api(uuid,uuid,boolean)','execute');")).toBe("f");
  const organization = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${organization}','o2-${organization.slice(0, 12)}','O2 fixture','ngo','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${organization}','${owner.id}','owner');`);
  const blocked = await apiCall(owner, cancelPath, 409, "POST", { ...cancel, expectedVersion: version + 1 });
  expect(blocked.error.code).toBe("DEPENDENCY_BLOCKED");
  expect(sql(`select count(*) from private.organization_memberships where organization_id='${organization}' and revoked_at is null;`)).toBe("1");
  sql(`delete from auth.sessions where user_id='${owner.id}';`);
  await apiCall(owner, path, 401);
});
