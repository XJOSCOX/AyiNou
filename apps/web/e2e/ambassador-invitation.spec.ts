import { apiCall, expect, finishPersonalOnboarding, inEnglish, localClient, login, openAdministration, solveMfa, sql, test, totp } from "./fixtures";
import { adminMessages } from "../src/lib/admin-i18n";
import { ambassadorMessages } from "../src/lib/ambassador-i18n";

const t = ambassadorMessages.en;
const mine = "/api/v1/me/ambassadors";
const adminPath = "/api/v1/admin/ambassadors";

test("the recipient can open the invitation with its message and deadline", async ({ browser, page, signedIn, makeMember }) => {
  const [operator, outsider] = await Promise.all([makeMember({ visible: true }), makeMember()]);
  for (const member of [operator, outsider, signedIn]) finishPersonalOnboarding(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: operator.email, password: operator.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const proof = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data!.id, code: totp(factor.data!.totp.secret),
  });
  expect(proof.error).toBeNull();
  sql(`insert into public.role_assignments(user_id,role) values ('${operator.id}','administrator');`);
  const admin = { ...operator, token: proof.data!.access_token };
  const reason = "Private decision record for the test case.";
  const invitationMessage = "We appreciate your work organizing the community reading circle.";
  const { id } = await apiCall(admin, adminPath, 201, "POST", { username: signedIn.handle, category: "community", reason });
  const body = { version: 1, action: "invite", reason, invitationMessage };
  expect((await apiCall(signedIn, mine, 200)).cases).toEqual([]);

  const staffContext = await browser.newContext();
  try {
    await inEnglish(staffContext);
    const staff = await staffContext.newPage();
    await login(staff, operator);
    await solveMfa(staff, factor.data!.totp.secret);
    await openAdministration(staff);
    const nav = staff.getByRole("navigation", { name: adminMessages.en.administration });
    await nav.getByRole("button", { name: adminMessages.en.navigationPrograms, exact: true }).click();
    const staffCase = staff.getByRole("article").filter({ hasText: "@" + signedIn.handle });
    const actions = staffCase.getByRole("button", { name: t.decisionPanel, exact: true });
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await expect(staffCase.getByRole("button", { name: t.record, exact: true })).toHaveCount(0);
    await actions.press("Enter");
    await expect(actions).toHaveAttribute("aria-expanded", "true");
    await staffCase.getByRole("combobox", { name: t.action, exact: true }).selectOption("revoke");
    await staffCase.getByLabel(t.reason, { exact: true }).fill(reason);
    const confirmation = staffCase.getByRole("checkbox", { name: t.confirmImpact });
    await staffCase.getByRole("button", { name: t.record, exact: true }).click();
    await expect(confirmation).toBeFocused();
    await expect(confirmation).not.toBeChecked();
    await staffCase.getByRole("button", { name: t.cancel, exact: true }).click();
    await expect(actions).toBeFocused();
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await actions.click();
    await expect(staffCase.getByRole("combobox", { name: t.action, exact: true })).toHaveValue("");
    await expect(staffCase.getByLabel(t.reason, { exact: true })).toHaveValue("");
    expect((await apiCall(admin, adminPath, 200)).cases).toEqual(expect.arrayContaining([expect.objectContaining({ id, version: 1, status: "proposed" })]));
  } finally {
    await staffContext.close();
  }

  await apiCall(outsider, adminPath + "/" + id, 403, "PATCH", body);
  await apiCall(admin, adminPath + "/" + id, 204, "PATCH", body);
  await apiCall(admin, adminPath + "/" + id, 409, "PATCH", body);
  expect((await apiCall(outsider, mine, 200)).cases).toEqual([]);
  const { cases } = await apiCall(signedIn, mine, 200);
  expect(cases[0]).toMatchObject({ id, invitationMessage, status: "invited" });
  expect(Date.parse(cases[0].expiresAt)).toBeGreaterThan(Date.parse(cases[0].invitedAt));
  expect(JSON.stringify(cases)).not.toContain(reason);
  expect(cases[0]).not.toHaveProperty("history");
  expect(cases[0].sender).toMatchObject({ displayName: expect.stringMatching(/^Browser Test /) });
  expect(cases[0].sender).not.toHaveProperty("id");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/ambassadors");
  const card = page.locator("details").filter({ hasText: t.invitationTitle });
  await expect(card.locator("summary")).toBeVisible();
  await expect(card.getByText(invitationMessage)).toBeHidden();
  await card.locator("summary").press("Enter");
  await expect(card.getByRole("heading", { name: t.roleTitle })).toBeVisible();
  await expect(card.getByText(invitationMessage)).toBeVisible();
  await expect(card.getByText(t.inviteSender)).toBeVisible();
  await expect(card.getByText(cases[0].sender.displayName, { exact: true })).toBeVisible();
  await expect(card.getByText(t.sentOn)).toBeVisible();
  await expect(card.getByText(t.respondBy)).toBeVisible();
  await expect(card.getByRole("button", { name: t.actions.accept })).toBeEnabled();
  await expect(card.getByRole("button", { name: t.actions.decline })).toBeEnabled();

  sql(`update private.ambassador_cases set invite_expires_at=now()-interval '1 second' where id='${id}';`);
  await page.reload();
  await card.locator("summary").press("Enter");
  await expect(card.getByText(t.statuses.expired, { exact: true })).toBeVisible();
  await expect(card.getByText(t.expiredOn)).toBeVisible();
  await expect(card.getByRole("button", { name: t.actions.accept })).toHaveCount(0);
  await expect(card.getByRole("button", { name: t.actions.decline })).toHaveCount(0);

  sql(`update public.profiles set is_visible=false where user_id='${operator.id}';`);
  expect((await apiCall(signedIn, mine, 200)).cases[0]).toMatchObject({ sender: null, invitationMessage });
  sql(`update private.ambassador_cases set recipient_id=null where id='${id}';`);
  expect(sql(`select invitation_message is null from private.ambassador_cases where id='${id}';`)).toBe("t");
});
