import { randomUUID } from "node:crypto";
import { opportunityActivationStages } from "@ayinou/shared";
import { activationCopy } from "../src/lib/activation-i18n";
import { opportunityActivationCopy } from "../src/lib/opportunity-activation-i18n";
import { enroll, expect, finishPersonalOnboarding, login, solveMfa, sql, test, web } from "./fixtures";
import { activationReason, callActivation } from "./opportunity-activation-fixtures";

test("C4.6 Founder reads ten precise readiness states with hosted-equivalent gates closed", async ({ page, context, makeMember }) => {
  test.setTimeout(90000);
  const founder = await makeMember(), member = await makeMember();
  [founder, member].forEach(finishPersonalOnboarding);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  try {
    const unauthorized = { capability: "drafts", action: "enable", configuration: "0".repeat(64),
      expectedVersion: 0, requestId: randomUUID(), reason: activationReason, confirmed: true };
    expect((await callActivation(undefined)).status).toBe(401);
    expect((await callActivation(member, randomUUID())).status).toBe(403);
    expect((await callActivation(member, randomUUID(), unauthorized)).status).toBe(403);
    expect((await callActivation(founder, randomUUID(), unauthorized)).status).toBe(403);
    expect(sql(`select count(*)=3 and bool_and(relrowsecurity and
      not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') and
      not has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE'))
      from pg_class where relnamespace='private'::regnamespace and relkind='r' and relname like 'c46_%';`)).toBe("t");
    expect(sql(`select not has_function_privilege('anon','public.c46_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','EXECUTE')
      and not has_function_privilege('authenticated','public.c46_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','EXECUTE')
      and has_function_privilege('service_role','public.c46_activation_for_api(uuid,uuid,boolean,bigint,uuid,boolean,text,jsonb)','EXECUTE');`)).toBe("t");
    const secret = await enroll(founder);
    await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
    await login(page, founder);
    await solveMfa(page, secret);
    await page.goto("/admin?section=opportunitySettings");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page.getByRole("button", { name: opportunityActivationCopy("en")("open"), exact: true })).toBeVisible();

    for (const locale of ["en", "ht", "fr", "es"] as const) {
      const width = locale === "en" ? 1440 : 390;
      const t = opportunityActivationCopy(locale), a = activationCopy(locale);
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.setViewportSize({ width, height: 920 });
      await page.reload();
      const show = page.getByRole("button", { name: t("open"), exact: true });
      await expect(show).toHaveAttribute("aria-expanded", "false");
      const request = page.waitForResponse(res => res.url().endsWith("/opportunity-settings/activation") && res.request().method() === "GET");
      await show.press("Enter");
      const response = await request;
      expect(response.status()).toBe(200);
      const panel = await response.json();
      expect(panel.stages).toHaveLength(10);
      expect(panel.stages.every((stage: { status: string }) => stage.status === "disabled")).toBe(true);
      expect(panel.history).toEqual([]);
      for (const stage of opportunityActivationStages) {
        await expect(page.getByRole("heading", { name: t(stage), exact: true })).toBeVisible();
      }
      const controls = page.locator("#opportunity-activation");
      await expect(controls.getByRole("button", { name: a("enable"), exact: true })).toHaveCount(10);
      expect(await controls.getByRole("button", { name: a("enable"), exact: true }).evaluateAll(items =>
        items.every(item => item instanceof HTMLButtonElement && item.disabled))).toBe(true);
      const publication = controls.getByRole("listitem").filter({ has: page.getByRole("heading", { name: t("publication"), exact: true }) });
      await publication.locator("summary").filter({ hasText: t("requirementDetails") }).click();
      await expect(publication.getByText(t("reviewerMissing"), { exact: true })).toBeVisible();
      await expect(publication.getByText(a("dependencyMissing"), { exact: true })).toBeVisible();
      const dark = page.getByRole("button", { name: /Switch to dark theme|Cambiar al tema oscuro/ });
      if ((locale === "en" || locale === "es") && await dark.isVisible()) await dark.press("Enter");
      expect(await page.locator("body").evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(width);
    }
  } finally {
    sql("delete from private.platform_bootstrap;");
  }
});
