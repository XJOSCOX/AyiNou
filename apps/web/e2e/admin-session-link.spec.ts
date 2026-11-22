import { apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, login, openAdministration,
  solveMfa, sql, test } from "./fixtures";
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
      await inEnglish(page.context());
      await login(page, leader);
      await solveMfa(page, secret);
      await page.goto("/admin");
      await expect(page.getByRole("button", { name: adminMessages.en.accounts, exact: true })).toHaveCount(0);
      await openAdministration(page);
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
      sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
      expect((await page.reload())?.status()).toBe(404);
      expect((await page.goto("/admin"))?.status()).toBe(404);
    } finally {
      sql(`delete from public.role_assignments where user_id='${leader.id}' and role='administrator';`);
    }
  });
