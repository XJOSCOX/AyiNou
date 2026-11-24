import { apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, openAdministration,
  solveMfa, sql, test, totp, web } from "./fixtures";
import { accountMessages } from "../src/lib/account-i18n";
import { adminMessages } from "../src/lib/admin-i18n";
import { messages } from "../src/lib/i18n";
import { sessionSecurityMessages } from "../src/lib/session-security-i18n";

test("Platform Administration uses an original-session link and hides its direct route from members @smoke",
  async ({ makeMember, page, browser, request }) => {
    const [leader, member] = await Promise.all([makeMember(), makeMember()]);
    finishPersonalOnboarding(leader);
    finishPersonalOnboarding(member);
    const secret = await enroll(leader);
    sql(`insert into public.role_assignments(user_id,role) values('${leader.id}','administrator');`);
    try {
      const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
      const signIn = await client.auth.signInWithPassword({ email: leader.email, password: leader.password });
      expect(signIn.error).toBeNull();
      const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
      expect(factor).toBeDefined();
      const elevated = await client.auth.mfa.challengeAndVerify({ factorId: factor!.id, code: totp(secret) });
      expect(elevated.error).toBeNull();
      const actor = { ...leader, token: elevated.data!.access_token };
      const concurrent = await Promise.all([0, 1].map(() =>
        apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })));
      expect(concurrent[0]).toEqual(concurrent[1]);

      const anonymous = await request.get("/admin");
      expect(anonymous.status()).toBe(404);
      expect(await anonymous.text()).not.toContain(sessionSecurityMessages.en.openAdmin);
      await inEnglish(page.context());
      await login(page, leader);
      await solveMfa(page, secret);
      await page.goto("/admin");
      await expect(page.getByRole("button", { name: adminMessages.en.accounts, exact: true })).toHaveCount(0);
      await openAdministration(page);
      await page.getByRole("button", { name: "Moderation Center", exact: true }).click();
      await expect(page.getByRole("button", { name: adminMessages.en.accounts, exact: true })).toBeVisible();
      const original = new URL(page.url());
      expect(original.search).toBe("");
      const id = original.pathname.split("/")[2];
      const endpoint = "/api/v1/me/private-workflows/" + id + "/admin";
      expect((await request.get(original.href)).status()).toBe(404);
      await apiCall(member, endpoint, 404);
      await apiCall(member, "/api/v1/me/private-workflows", 404, "POST", { kind: "admin_workspace" });
      expect(sql("select has_function_privilege('authenticated','public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)','execute');")).toBe("f");

      for (const [actor, mfa] of [[member, false], [leader, true]] as const) {
        const ctx = await browser.newContext();
        try {
          await inEnglish(ctx);
          const another = await ctx.newPage();
          await login(another, actor);
          if (mfa) await solveMfa(another, secret);
          else {
            await expect(another).toHaveURL(/\/dashboard/);
            const denied = await another.goto("/admin");
            expect(denied?.status()).toBe(404);
            await expect(another.getByRole("heading", { name: messages.en.notFound })).toBeVisible();
          }
          const forbidden = await another.goto(original.href);
          expect(forbidden?.status()).toBe(404);
          expect(forbidden?.headers()["cache-control"]).toMatch(/no-store/);
          expect(forbidden?.headers()["referrer-policy"]).toBe("no-referrer");
          await expect(another.getByRole("heading", { name: sessionSecurityMessages.en.unavailable })).toBeVisible();
        } finally { await ctx.close(); }
      }

      const fresh = await page.reload();
      expect(fresh?.status()).toBe(200);
      sql(`update private.s2b_workflows set created_at=now()-interval '10 minutes',
        expires_at=now()-interval '1 minute' where id='${id}';`);
      expect((await page.reload())?.status()).toBe(404);
      await openAdministration(page);
      expect(page.url()).not.toBe(original.href);
      const cancellable = page.url();
      await page.getByRole("button", { name: sessionSecurityMessages.en.closeWorkspace }).click();
      await expect(page.getByRole("heading", { name: sessionSecurityMessages.en.unavailable })).toBeVisible();
      await expect(page.getByRole("link", { name: sessionSecurityMessages.en.openAdmin })).toBeVisible();
      expect((await page.goto(cancellable))?.status()).toBe(404);
      await openAdministration(page);
      sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
      expect((await page.reload())?.status()).toBe(404);
      expect((await page.goto("/admin"))?.status()).toBe(404);
      sql(`insert into public.role_assignments(user_id,role) values('${leader.id}','administrator');`);
      await openAdministration(page);
      const revoked = new URL(page.url()).pathname.split("/")[2];
      sql(`update private.s2a_session_policy set revoked_at=clock_timestamp() where session_id=
        (select bound_session from private.s2b_workflows where id='${revoked}');`);
      expect((await page.reload())?.status()).toBe(404);
    } finally {
      sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
    }
  });

test("Workspace MFA renewal stays in administration and opens a private link after confirmation @smoke",
  async ({ makeMember, page, context }) => {
    const leader = await makeMember();
    finishPersonalOnboarding(leader);
    const secret = await enroll(leader);
    sql(`insert into public.role_assignments(user_id,role) values('${leader.id}','administrator');`);
    try {
      await inEnglish(context);
      await login(page, leader);
      await solveMfa(page, secret);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto("/admin");

      const endpoint = "**/api/v1/me/private-workflows";
      await page.route(endpoint, async (route) => {
        if (route.request().method() !== "POST") { await route.fallback(); return; }
        await route.fulfill({
          status: 403, json: { error: { code: "MFA_REQUIRED" } },
          headers: { "access-control-allow-origin": web },
        });
      });
      const open = page.getByRole("button", { name: sessionSecurityMessages.en.openAdmin });
      const prompt = page.getByRole("region", { name: sessionSecurityMessages.en.workspaceMfaTitle });
      const otp = prompt.getByLabel(accountMessages.en.mfaChallengeCode);
      await open.click();
      await expect(prompt).toBeVisible();
      await expect(otp).toBeFocused();
      await expect(page).toHaveURL(/\/admin$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await prompt.getByRole("button", { name: accountMessages.en.cancel }).click();
      await expect(prompt).toHaveCount(0);
      await expect(open).toBeFocused();
      expect((await page.reload())?.status()).toBe(200);

      await page.unroute(endpoint);
      await page.goto("/mfa?next=/admin");
      await expect(page).toHaveURL(/\/admin\?verify=1$/);
      await expect(page.getByRole("heading", { name: adminMessages.en.administration })).toBeVisible();
      await expect(prompt).toBeVisible();
      const confirm = prompt.getByRole("button", { name: accountMessages.en.mfaSubmit });
      await expect(confirm).toBeDisabled();
      await otp.fill(String((Number(totp(secret)) + 100000) % 1000000).padStart(6, "0"));
      await confirm.click();
      await expect(prompt.getByRole("alert")).toHaveText(accountMessages.en.mfaError);
      await otp.fill(totp(secret));
      await confirm.click();
      await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}\/admin$/);
      await expect(page.getByRole("button", { name: sessionSecurityMessages.en.closeWorkspace })).toBeVisible();
    } finally {
      sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
    }
  });

test("Administration renews expired links automatically and keeps Accounts selected @smoke", async ({ makeMember, page }) => {
  const leader = await makeMember();
  finishPersonalOnboarding(leader);
  const secret = await enroll(leader);
  sql(`insert into public.role_assignments(user_id,role) values('${leader.id}','administrator');`);
  try {
    await inEnglish(page.context());
    await login(page, leader);
    await solveMfa(page, secret);
    await page.clock.install();
    await openAdministration(page);

    const accountsEndpoint = "**/api/v1/admin/accounts?*";
    await page.route(accountsEndpoint, (route) => route.fulfill({
      status: 403, json: { error: { code: "MFA_REQUIRED" } },
      headers: { "access-control-allow-origin": web },
    }));
    const t = adminMessages.en;
    const navigation = page.getByRole("navigation", { name: t.administration });
    const filter = navigation.getByRole("searchbox", { name: t.navigationSearch });
    await navigation.getByRole("button", { name: t.navigationMembers, exact: true }).click();
    await expect(navigation.getByRole("button", { name: "Trust and verification", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Trust and verification", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: t.navigationPrograms, exact: true }).click();
    await expect(navigation.getByRole("button", { name: "Founding Ambassadors", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Founding Ambassadors", exact: true })).toBeVisible();

    const accounts = navigation.getByRole("button", { name: t.accounts, exact: true });
    await filter.fill(t.accounts);
    await expect(navigation.getByRole("button", { name: t.overview, exact: true })).toHaveCount(0);
    await accounts.click();
    await expect(filter).toHaveValue("");
    const renew = page.getByRole("link", { name: adminMessages.en.verifyNow });
    await expect(renew).toHaveAttribute("href", "/admin?verify=1&section=accounts");
    await page.unroute(accountsEndpoint);
    await renew.click();
    await expect(page).toHaveURL(/\/admin\?verify=1&section=accounts$/);
    const prompt = page.getByRole("region", { name: sessionSecurityMessages.en.workspaceMfaTitle });
    await prompt.getByLabel(accountMessages.en.mfaChallengeCode).fill(totp(secret));
    await prompt.getByRole("button", { name: accountMessages.en.mfaSubmit }).click();
    await expect(page).toHaveURL(/\/s\/[a-f0-9-]{36}\/admin\?section=accounts$/);
    await expect(accounts).toHaveAttribute("aria-pressed", "true");

    async function expireCurrentWorkspace() {
      await page.clock.setSystemTime(new Date());
      const id = new URL(page.url()).pathname.split("/")[2];
      sql(`update private.s2b_workflows set expires_at=now()+interval '30 seconds' where id='${id}';`);
      expect((await page.reload())?.status()).toBe(200);
      await expect(accounts).toHaveAttribute("aria-pressed", "true");
      sql(`update private.s2b_workflows set created_at=now()-interval '10 minutes',
        expires_at=now()-interval '1 minute' where id='${id}';`);
      await page.clock.fastForward(31_000);
      return id;
    }

    const freshLink = await expireCurrentWorkspace();
    await expect(page).toHaveURL(/\/s\/[a-f0-9-]{36}\/admin\?section=accounts$/);
    await expect(page).not.toHaveURL(new RegExp(freshLink));
    await expect(accounts).toHaveAttribute("aria-pressed", "true");

    const openEndpoint = "**/api/v1/me/private-workflows";
    await page.route(openEndpoint, (route) => route.request().method() === "POST"
      ? route.fulfill({ status: 403, json: { error: { code: "MFA_REQUIRED" } }, headers: { "access-control-allow-origin": web } })
      : route.fallback());
    const staleLink = await expireCurrentWorkspace();
    await expect(prompt.getByLabel(accountMessages.en.mfaChallengeCode)).toBeFocused();
    await expect(page.getByRole("button", { name: sessionSecurityMessages.en.openAdmin })).toHaveCount(0);
    await page.unroute(openEndpoint);
    await prompt.getByLabel(accountMessages.en.mfaChallengeCode).fill(totp(secret));
    await prompt.getByRole("button", { name: accountMessages.en.mfaSubmit }).click();
    await expect(page).toHaveURL(/\/s\/[a-f0-9-]{36}\/admin\?section=accounts$/);
    await expect(page).not.toHaveURL(new RegExp(staleLink));
    await expect(accounts).toHaveAttribute("aria-pressed", "true");
  } finally {
    sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
  }
});

test("Assigned verification review gets its own workspace and ordinary admin authority is insufficient @smoke", async ({ makeMember, page }) => {
  const [reviewer, leader] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(reviewer);
  finishPersonalOnboarding(leader);
  const reviewMfa = await enroll(reviewer);
  const leaderMfa = await enroll(leader);
  sql(`insert into private.verification_reviewers(user_id) values('${reviewer.id}');
    insert into public.role_assignments(user_id,role) values('${leader.id}','administrator');`);
  try {
    await inEnglish(page.context());
    await login(page, reviewer);
    await solveMfa(page, reviewMfa);
    expect((await page.goto("/admin"))?.status()).toBe(404);
    for (const [index, locale] of (["ht", "fr", "es", "en"] as const).entries()) {
      const width = index % 2 ? 1440 : 320;
      await page.setViewportSize({ width, height: 900 });
      await page.context().addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.goto("/verification/review");
      const control = page.getByRole("button", { name: sessionSecurityMessages[locale].openReview, exact: true });
      await control.focus();
      await expect(control).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/s\/[a-f0-9-]{36}\/review$/);
    const address = page.url();
    sql(`delete from private.verification_reviewers where user_id='${reviewer.id}';`);
    expect((await page.reload())?.status()).toBe(404);
    await login(page, leader);
    await solveMfa(page, leaderMfa);
    expect((await page.goto("/verification/review"))?.status()).toBe(404);
    expect((await page.goto(address))?.status()).toBe(404);
  } finally {
    sql(`delete from private.verification_reviewers where user_id='${reviewer.id}';
      delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
  }
});
