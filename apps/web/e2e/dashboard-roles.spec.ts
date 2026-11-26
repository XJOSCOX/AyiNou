import { expect, test } from "./fixtures";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, enroll, finishPersonalOnboarding, login, solveMfa, sql, totp, web } from "./fixtures";

test("member dashboard uses private counts and saves its layout @smoke", async ({ page, signedIn }) => {
  await expect(page.getByRole("heading", { name: "Welcome, Browser Test", exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Saved posts 0/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explore AyiNou" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Platform administration/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Customize dashboard" }).click();
  const layout = page.getByRole("region", { name: "Customize dashboard" });
  await layout.getByRole("checkbox", { name: "Upcoming events" }).uncheck();
  await layout.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText("Dashboard saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Customize dashboard" }).click();
  await expect(page.getByRole("region", { name: "Customize dashboard" }).getByRole("checkbox", { name: "Upcoming events" })).not.toBeChecked();

  // A UI-only Founder role spoof must not change the member dashboard or grant API authority.
  await page.route("**/api/v1/me/platform-access", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      administrator: true, reviewer: true, founder: true, founderVerified: false,
    }) });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your community" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Founder workspace" })).toHaveCount(0);
  for (const [locale, heading] of [["ht","Dekouvri AyiNou"],["fr","Explorer AyiNou"],["es","Explorar AyiNou"],["en","Explore AyiNou"]]) {
    await page.context().addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.reload();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.getByRole("heading", { name: "Explore AyiNou" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();

  const samples = await Promise.all(Array.from({length: 8}, async () => {
    const start = performance.now();
    const response = await fetch(api + "/api/v1/me/dashboard", { headers: { Authorization: `Bearer ${signedIn.token}` } });
    const body = await response.text();
    expect(response.status).toBe(200);
    return { ms: Math.round(performance.now()-start), bytes: Buffer.byteLength(body) };
  }));
  console.log("D1 disposable concurrent summary:", JSON.stringify({ requests:samples.length,
    maxMs:Math.max(...samples.map((sample)=>sample.ms)), maxBytes:Math.max(...samples.map((sample)=>sample.bytes)) }));
  expect(signedIn.id).toBeTruthy();
});

test("Founder dashboard settings and announcements enforce authority and history", async ({ page, makeMember }) => {
  test.setTimeout(100_000);
  const [founder, member] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(founder);
  finishPersonalOnboarding(member);
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
    values('${founder.id}','first_account_bootstrapped','Disposable D1 Founder verification');`);
  const secret = await enroll(founder);
  const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
  const factors = await client.auth.mfa.listFactors();
  const factorId = factors.data!.totp[0].id;
  const proof = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
  expect(proof.error).toBeNull();
  const actor = { ...founder, token: proof.data!.access_token };
  const path = "/api/v1/admin/dashboard-settings";
  const note = "Disposable D1 dashboard configuration test.";
  try {
    expect((await fetch(api + path, { headers: { Authorization: `Bearer ${member.token}` } })).status).toBe(403);
    const workspace = (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const request = (method: string, body?: object, bearer = actor.token, ref = workspace) => fetch(api + path, {
      method,
      headers: { Authorization: `Bearer ${bearer}`, "X-Ayinou-Workspace": ref,
        ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect((await request("GET", undefined, actor.token, randomUUID())).ok).toBe(false);
    const first = await request("GET");
    expect(first.status).toBe(200);
    const defaults = await first.json();
    expect(defaults.itemLimit).toBe(3);
    const command = { action: "configure", expectedVersion: defaults.revision, requestId: randomUUID(),
      reason: note, confirmed: true, available: defaults.available,
      defaultOrder: defaults.defaultOrder, defaultHidden: defaults.defaultHidden,
      itemLimit: 4, announcementsEnabled: true, statisticsEnabled: false, featuredPolicy: "latest" };
    const update = await request("PATCH", command);
    expect(update.status).toBe(200);
    expect((await update.json()).revision).toBe(defaults.revision + 1);
    expect((await request("PATCH", command)).status).toBe(200);
    const stale = await request("PATCH", { ...command, requestId: randomUUID() });
    expect(stale.status, await stale.text()).toBe(409);
    const title = Object.fromEntries(["en","ht","fr","es"].map((locale) => [locale, "D1 test notice"]));
    const body = Object.fromEntries(["en","ht","fr","es"].map((locale) => [locale, "Disposable member notice for dashboard testing."]));
    const announcement = { action: "publish", expectedVersion: 0, requestId: randomUUID(),
      reason: note, confirmed: true, category: "notice", title, body,
      publishedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const created = await request("PATCH", announcement);
    expect(created.status).toBe(200);
    const id = (await created.json()).id;
    const summary = await apiCall(member, "/api/v1/me/dashboard", 200);
    expect(summary.announcements.some((notice: { id: string }) => notice.id === id)).toBe(true);
    const withdraw = { action: "withdraw", expectedVersion: 1, requestId: randomUUID(),
      reason: note, confirmed: true, id };
    expect((await request("PATCH", withdraw)).status).toBe(200);
    expect((await apiCall(member, "/api/v1/me/dashboard", 200)).announcements).toEqual([]);
    expect(sql("select count(*) from private.d1_dashboard_audit where action in ('configure','publish','withdraw');")).toBe("3");
    expect(sql("select count(*) from private.d1_dashboard_announcements where withdrawn_at is not null;")).toBe("1");
    await page.context().addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
    await login(page, founder);
    await solveMfa(page, secret);
    await page.goto("/admin?section=dashboardSettings");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Available sections" })).toBeVisible();
    for (const [locale, heading] of [["ht","Paramèt tablodbò"],["fr","Paramètres du tableau de bord"],
      ["es","Configuración del panel"],["en","Dashboard settings"]]) {
      await page.context().addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.reload();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});
