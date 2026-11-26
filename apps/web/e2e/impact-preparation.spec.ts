import { randomUUID } from "node:crypto";
import { impactDepartments, type ImpactOverview } from "@ayinou/shared";
import { api, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, solveMfa, sql, test, totp, web } from "./fixtures";
import { impactPreparationCopy } from "../src/lib/impact-preparation-copy";

const settings = "/api/v1/admin/impact";
const note = "Prepare limited administrative preferences for the disposable rehearsal.";
const receipt = (action: string, expectedVersion: number, fields: object = {}) =>
  ({ action, expectedVersion, ...fields, requestId: randomUUID(), reason: note, confirmed: true });

test("Founder preparation stays available with every live C2 gate closed", async ({ page, context, signedIn, makeMember }) => {
  test.setTimeout(120_000);
  const founder = await makeMember();
  finishPersonalOnboarding(founder);
  finishPersonalOnboarding(signedIn);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  const key = await enroll(founder);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
  const passwordSession = (await client.auth.getSession()).data.session!;
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Disposable factor missing");
  const mfa = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(key) });
  if (mfa.error) throw mfa.error;
  const token = mfa.data.access_token;
  async function call<T>(path: string, status: number, access?: string, workspace?: string, body?: object, method?: string) {
    const response = await fetch(api + path, { method: method ?? (body ? "PATCH" : "GET"),
      signal: AbortSignal.timeout(10_000), body: body && JSON.stringify(body), headers: {
        ...(access && { Authorization: "Bearer " + access }), ...(workspace && { "X-Ayinou-Workspace": workspace }),
        ...(body && { "Content-Type": "application/json" }),
      } });
    const result = await response.json();
    expect(response.status, path + " " + JSON.stringify(result)).toBe(status);
    return result as T;
  }

  try {
    const { id } = await call<{ id: string }>("/api/v1/me/private-workflows", 200, token, undefined, { kind: "admin_workspace" }, "POST");
    await call(settings, 401);
    await call(settings, 403, signedIn.token, id);
    await call(settings, 401, passwordSession.access_token, id);
    await call(settings, 403, token, randomUUID());
    const initial = await call<ImpactOverview>(settings, 200, token, id);
    expect(initial.settings).toBeNull();
    expect(initial.catalog.map((item) => item.status)).toEqual(["draft","draft"]);
    expect(initial.preparation).toEqual({ fixtureOperations: false, appointments: [], rosterHistory: [], plans: [] });
    const prepared = { years: [2025], sectors: ["education"], departments: impactDepartments, measurements: true, needs: false, links: true };
    await call(settings, 400, token, id, receipt("configure", 0, { ...prepared, enabled: true }));
    await call(settings, 400, token, id, receipt("configure", 0, { ...prepared, departments: ["HT-CE", "HT-CE"] }));
    const save = receipt("configure", 0, prepared);
    expect(await call(settings, 200, token, id, save)).toEqual({ version: 1 });
    expect(await call(settings, 200, token, id, save)).toEqual({ version: 1 });
    await call(settings, 409, token, id, receipt("configure", 0, prepared));
    await call(settings, 400, token, id, receipt("plan_reviewer", 0, { role: "governance", scope: "HT-CE", slots: 2 }));
    const staffing = receipt("plan_reviewer", 0, { role: "challenge", scope: "HT-CE", slots: 2 });
    await call(settings, 200, token, id, staffing);
    await call(settings, 409, token, id, receipt("plan_reviewer", 0, { role: "challenge", scope: "HT-CE", slots: 1 }));
    const school = initial.catalog.find((item) => item.code === "school_desks")!;
    const { code, sector, names, descriptions, methods, units, unit, methodologyCode, classification, privacy, aggregatable } = school;
    await call(settings, 200, token, id, receipt("define", school.version, {
      code, sector, names, descriptions, methods, units, unit, methodologyCode, classification, privacy, aggregatable,
    }));
    await call(settings, 404, token, id, receipt("grant", 0, { target: signedIn.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }));
    await call(settings, 404, token, id, receipt("propose_report", 0, { year: 2025, scope: "education" }));
    await call("/api/v1/private/impact-review", 404, token, id, receipt("approve_definition", 2, { code, methodReviewed: true }));
    await call("/api/v1/private/project-outcome-review/notices", 404, token);
    await call("/api/v1/private/project-outcome-publication/availability", 404, token);
    expect(await call("/api/v1/impact", 200)).toMatchObject({ state: "disabled" });
    const saved = await call<ImpactOverview>(settings, 200, token, id);
    expect(saved.settings).toMatchObject({ version: 1, enabled: false, departments: [...impactDepartments].sort() });
    expect(saved.preparation?.plans).toEqual([{ role: "challenge", scope: "HT-CE", slots: 2, version: 1 }]);
    expect(saved.preparation?.appointments).toEqual([]);
    sql(`insert into private.c22_authority(department,actor,lane,version,state,expires_at)
       values('HT-CE','${signedIn.id}','initial',1,'active',now()-interval '1 day');
      insert into private.c23_grants(department,actor,generation,expires_at,revoked_at)
       values('HT-OU','${signedIn.id}',1,now()+interval '1 day',now());`);
    const roster = await call<ImpactOverview>(settings, 200, token, id);
    expect(roster.preparation?.appointments).toEqual([
      expect.objectContaining({ scope: "HT-CE", role: "initial", status: "expired" }),
      expect.objectContaining({ scope: "HT-OU", role: "publication", status: "revoked" }),
    ]);
    sql(`delete from private.c22_authority where actor='${signedIn.id}';
      delete from private.c23_grants where actor='${signedIn.id}';`);
    expect(saved.catalog.find((item) => item.code === code && item.version === 2)?.status).toBe("draft");
    expect(sql(`select count(*)=3 and bool_and(actor='${founder.id}' and workspace='${id}') from private.c24_events;`)).toBe("t");
    expect(sql(`select not private.c24_enabled() and not exists(select from private.c24_governors)
      and not exists(select from private.c24_releases)
      and not has_function_privilege('authenticated','public.c24_manage_for_api(uuid,uuid,boolean,bigint,uuid,text,text,jsonb)','execute')
      and not has_function_privilege('service_role','private.c26_readiness(boolean)','execute');`)).toBe("t");
    sql(`update private.s2b_workflows set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id='${id}';`);
    await call(settings, 403, token, id);

    await inEnglish(context);
    await login(page, founder);
    await solveMfa(page, key);
    await page.goto("/admin?section=impactSettings");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    for (const locale of ["en","ht","fr","es"] as const) {
      const copy = impactPreparationCopy(locale);
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      const width = locale === "en" ? 1440 : 390;
      await page.setViewportSize({ width, height: 900 });
      if (locale !== "en") await page.reload();
      await expect(page.getByText(copy.prepared, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.disabled, { exact: true })).toBeVisible();
      const reviewerTab = page.getByRole("navigation").getByRole("button", { name: copy.reviewersTab, exact: true });
      await reviewerTab.click();
      await expect(page.getByText(copy.noAppointments, { exact: true })).toBeVisible();
      await page.getByRole("navigation").getByRole("button", { name: copy.reportingTab, exact: true }).click();
      await expect(page.getByText(copy.editPreferences, { exact: true })).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(width);
      if (locale === "en") {
        await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
        await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
        await expect(page.getByText(copy.prepared, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
      }
    }
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});
