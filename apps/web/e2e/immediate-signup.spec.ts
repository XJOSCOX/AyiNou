import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { apiCall, expect, inEnglish, sql, test } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";

const immediate = process.env.AYINOU_E2E_IMMEDIATE_SIGNUP === "true";
const client = () => createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const password = "Disposable-immediate-signup!9";

if (immediate) {
  test("development signup skips email instructions and initializes the profile in the new session", async ({ page, context, makeMember }) => {
    const username = "direct_" + randomUUID().slice(0, 8);
    const email = username + "@example.com";
    await inEnglish(context);
    const referrer = await makeMember();
    const { referralCode } = await apiCall(referrer, "/api/v1/me/referral-code", 200);
    await page.goto("/register?ref=" + referralCode);
    await page.locator('input[name="signup-path"][value="organization"]').check();
    await page.getByLabel(membershipMessages.en.firstName, { exact: true }).fill("Synthetic");
    await page.getByLabel(membershipMessages.en.lastName, { exact: true }).fill("Member");
    await page.locator('input[name="username"]').fill(username.toUpperCase());
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirm-password").fill(password);
    await page.getByRole("combobox").selectOption("ht");
    await page.getByRole("main").getByRole("button", { name: authMessages.ht.register, exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("radio", { name: membershipMessages.ht.haitian, exact: true })).toBeVisible();
    expect(sql(`select p.username||':'||p.display_name||':'||p.preferred_locale
      from public.profiles p join auth.users u on u.id=p.user_id where u.email='${email}';`))
      .toBe(username + ":" + username + ":ht");
    expect(sql(`select count(*) from private.organization_onboarding_intents i join auth.users u on u.id=i.subject_id
      where u.email='${email}' and i.pathway='organization';`)).toBe("1");
    expect(sql(`select count(*) from private.referrals r join auth.users u on u.id=r.referred_user_id
      where u.email='${email}' and r.confirmed_at is not null;`)).toBe("0");
    expect((await apiCall(referrer, "/api/v1/me/referrals", 200)).summary.confirmedCount).toBe(0);
  });

  test("automatic Auth confirmation cannot bypass a username or prove access to a reserved Founder email", async () => {
    const name = "direct_" + randomUUID().slice(0, 8);
    const email = name + "@example.com";
    const reserved = "founding_" + randomUUID().slice(0, 8);
    const digest = createHash("sha256").update(randomUUID()).digest("hex");
    expect(sql(`select public.prepare_founder_registration_for_api('${email}','${reserved}','${digest}');`)).toBe("t");
    try {
      const missing = await client().auth.signUp({
        email, password, options: { data: { staff_provisioned: true } },
      });
      expect(missing.error).not.toBeNull();
      expect(sql(`select count(*) from auth.users where email='${email}';`)).toBe("0");
      const denied = await client().auth.signUp({
        email, password, options: { data: { public_username: reserved } },
      });
      expect(denied.error).not.toBeNull();
      const success = await client().auth.signUp({ email, password, options: { data: { public_username: name } } });
      expect(success.error).toBeNull();
      const id = success.data.user!.id;
      expect(id).toMatch(/^[a-f0-9-]{36}$/);
      expect(sql(`select (email_confirmed_at is not null)::text||':'||private.founder_registration_email_proved(id)::text
        from auth.users where id='${id}';`)).toBe("true:false");
      expect(sql(`select public.founder_registration_status_for_api('${id}');`)).toBe("f");
      const actor = { id, email, password, handle: name, token: success.data.session!.access_token };
      await apiCall(actor, "/api/v1/me/profile/details", 409, "PATCH", { username: reserved });
    } finally {
      sql(`delete from private.founder_registration where reserved_username='${reserved}';`);
    }
  });
}
