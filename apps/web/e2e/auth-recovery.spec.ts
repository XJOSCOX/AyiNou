import { createClient } from "@supabase/supabase-js";
import { accountMessages } from "../src/lib/account-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { passwordSecurityMessages } from "../src/lib/password-security-i18n";
import { enroll, expect, finishPersonalOnboarding, inEnglish, login, sql, test, totp } from "./fixtures";

const t = authMessages.en;
const password = passwordSecurityMessages.en;
const supabase = "http://127.0.0.1:55321";
const mailbox = "http://127.0.0.1:55324/api/v1";

for (const { mfa, restricted } of [{ mfa: false, restricted: false }, { mfa: true, restricted: false }, { mfa: true, restricted: true }]) {
  test(`password recovery uses the verified account and fresh session${restricted ? " while suspended" : ""}${mfa ? " through MFA @smoke" : ""}`, async ({
    page, context, makeMember,
  }) => {
    const [target, other] = await Promise.all([makeMember(), makeMember()]);
    finishPersonalOnboarding(target);
    finishPersonalOnboarding(other);
    const secret = mfa ? await enroll(target) : null;
    if (restricted) sql(`insert into private.account_restrictions(user_id,status,reason)
      values ('${target.id}','suspended','Synthetic recovery restriction');`);
    await inEnglish(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, other);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=verification/);
    await expect(page.locator("main").getByRole("alert")).toContainText(t.sessionNeeded);

    const layout = page.locator("main > div").first();
    const forgot = (await layout.boundingBox())!;
    await page.getByLabel(t.email, { exact: true }).fill(target.email);
    await page.getByRole("button", { name: t.sendReset, exact: true }).press("Enter");
    await expect(page.locator("main").getByRole("status")).toHaveText(t.resetSent);
    let messageId: string | undefined;
    await expect.poll(async () => {
      const { messages } = await (await fetch(mailbox + "/messages", { signal: AbortSignal.timeout(3000) })).json();
      messageId = messages?.find((entry: { To: { Address: string }[] }) => entry.To.some(({ Address }) => Address === target.email))?.ID;
      return !!messageId;
    }).toBe(true);
    const message = await (await fetch(mailbox + "/message/" + messageId)).json();
    const link = new URL(String(message.Text).match(/https?:\/\/[^\s<(]+\/auth\/v1\/verify\?[^\s)>]+/)![0]);
    expect(link.origin).toBe(supabase);
    await page.goto(link.href);
    if (secret) {
      await expect(page).toHaveURL(/\/mfa\?next=\/reset-password/);
      const code = page.getByLabel(accountMessages.en.mfaChallengeCode);
      await expect(code).toBeVisible();
      expect((await layout.boundingBox())!.width).toBeLessThan(forgot.width);
      await code.fill(totp(secret));
      await page.getByRole("button", { name: accountMessages.en.mfaSubmit }).click();
    }
    await expect(page).toHaveURL(/\/reset-password$/);
    expect((await layout.boundingBox())!.width).toBeLessThanOrEqual(forgot.width);
    await page.setViewportSize({ width: 320, height: 820 });

    const bar = page.getByRole("progressbar", { name: password.progress });
    const newPassword = page.getByLabel(t.newPassword, { exact: true });
    const confirmation = page.getByLabel(password.confirm, { exact: true });
    await newPassword.fill("simple");
    await confirmation.fill("simple");
    await expect(bar).toHaveJSProperty("value", 1);
    await page.getByRole("button", { name: t.savePassword }).press("Enter");
    await expect(page.locator("main").getByRole("alert")).toHaveText(password.invalid);
    const updated = "New-Disposable!88";
    await newPassword.fill(updated);
    await expect(bar).toHaveJSProperty("value", 5);
    await confirmation.fill("Wrong-Confirmation!99");
    await page.getByRole("button", { name: t.savePassword }).press("Enter");
    await expect(confirmation).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("main").getByRole("alert")).toHaveText(password.mismatch);
    await confirmation.fill(updated);
    await page.getByRole("button", { name: t.savePassword }).press("Enter");
    await expect(page).toHaveURL(/\/login\?reset=done/);
    await expect(page.locator("main").getByRole("status")).toHaveText(t.resetDone);

    const verifier = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    expect((await verifier.auth.signInWithPassword({ email: target.email, password: target.password })).error?.code)
      .toBe("invalid_credentials");
    expect((await verifier.auth.signInWithPassword({ email: other.email, password: other.password })).error).toBeNull();
    await login(page, { ...target, password: updated });
    await expect(page).toHaveURL(restricted ? /\/account-access/ : secret ? /\/mfa/ : /\/dashboard/);
  });
}
