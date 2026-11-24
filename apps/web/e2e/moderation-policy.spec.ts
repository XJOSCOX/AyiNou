import { randomUUID } from "node:crypto";
import type { ModerationPolicyWorkspace, PolicyAuditPage } from "@ayinou/shared";
import { moderationPolicyMessages } from "../src/lib/moderation-policy-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, solveMfa, sql, test, totp, type Member } from "./fixtures";

const path = "/api/v1/admin/moderation-policy";
const features = "/api/v1/moderation/feature-enforcement";
const reason = "Synthetic moderation policy validation";

async function elevate(member: Member) {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing authenticator fixture");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token, secret };
}

async function workspace(actor: Member, kind = "admin_workspace") {
  return (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind })).id as string;
}

async function request<T>(actor: Member, target: string, scope: string, method = "GET", body?: object) {
  const response = await fetch(api + target, {
    method, headers: { Authorization: "Bearer " + actor.token, "X-Ayinou-Workspace": scope,
      ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, data: await response.json() as T };
}

const command = (options: object) => ({ requestId: randomUUID(), reason, confirmed: true, ...options });

test("M2.5 protects policy administration and applies changes only to future decisions @smoke", async ({ makeMember, page, context }) => {
  test.setTimeout(120_000);
  const [owner, staff, delegate, oldSubject, subject] = await Promise.all(
    Array.from({ length: 5 }, () => makeMember({ visible: true })));
  for (const member of [owner, staff, delegate, oldSubject, subject]) finishPersonalOnboarding(member);
  const [founder, admin, mod] = await Promise.all([owner, staff, delegate].map(elevate));
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into public.role_assignments(user_id,role) values('${admin.id}','administrator'),('${mod.id}','moderator');`);
  try {
    const f = await workspace(founder), a = await workspace(admin);
    const original = await request<ModerationPolicyWorkspace>(founder, path, f);
    expect(original.status, JSON.stringify(original.data)).toBe(200);
    expect(original.data.value).toMatchObject({
      administratorMaxMinutes: 129600, moderatorMaxMinutes: 10080, defaultMinutes: 60,
      suspensionPresets: [60, 1440, 4320, 10080, 43200, 129600], notifyStaffGuidance: false,
    });
    const revision = original.data.revision;
    const value = { ...original.data.value, administratorMaxMinutes: 60, moderatorMaxMinutes: 30, defaultMinutes: 15,
      reasonCategories: ["safety", "other"], delegableCapabilities: ["post"],
      repeatViolationGuidance: "Review previous decisions before setting a term.", notifyStaffGuidance: true };
    const update = command({ action: "update", expectedRevision: revision, value });
    expect((await request(admin, path, a, "PATCH", update)).status).toBe(403);
    expect([401, 403]).toContain((await request(owner, path, f, "PATCH", update)).status);
    expect((await request(founder, path, a, "PATCH", update)).status).toBe(403);
    expect((await request(founder, path, f, "PATCH", { ...update, value: { ...value, moderatorMaxMinutes: 10081 } })).status).toBe(400);
    expect((await request(founder, path, f, "PATCH", { ...update, value: { ...value, delegableCapabilities: ["poll_manage"] } })).status).toBe(400);
    const oldSuspension = command({ action: "suspend", minutes: 1440, category: "spam", expected: null });
    const oldAccount = "/api/v1/admin/accounts/" + oldSubject.id;
    const newAccount = "/api/v1/admin/accounts/" + subject.id;
    expect((await request(admin, oldAccount, a, "PATCH", oldSuspension)).status).toBe(200);
    for (const capability of ["post", "media"]) {
      const grant = command({ action: "delegate", subject: mod.id, capabilities: [capability], scope: "platform", scopeId: null, maxMinutes: 120 });
      expect((await request(admin, features, a, "POST", grant)).status).toBe(200);
    }
    const m = await workspace(mod, "moderation_workspace");
    expect((await request(mod, path, m, "PATCH", update)).status).toBe(403);
    expect((await request(mod, "/api/v1/moderation/action-policy", m)).status).toBe(200);
    expect((await request(mod, "/api/v1/moderation/action-policy", a)).status).toBe(403);
    const snapshot = () => sql(`select concat_ws('|',
      (select expires_at from private.m22_account_sanctions where subject_id='${oldSubject.id}'),
      (select string_agg(capability||':'||max_minutes, ',' order by capability) from private.m23_delegations where moderator_id='${mod.id}')); `);
    const before = snapshot();
    const concurrent = await Promise.all([
      request<ModerationPolicyWorkspace>(founder, path, f, "PATCH", update),
      request<ModerationPolicyWorkspace>(founder, path, f, "PATCH", { ...update, requestId: randomUUID() }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([200, 409]);
    const success = concurrent.find(({ status }) => status === 200)!;
    expect(success.data).toMatchObject({ revision: revision + 1, value });
    expect(snapshot()).toBe(before);
    const replay = await request(admin, oldAccount, a, "PATCH", oldSuspension);
    expect(replay.status).toBe(200);
    expect((await request(admin, newAccount, a, "PATCH", command({ ...oldSuspension, requestId: randomUUID(), category: "safety" }))).status).toBe(409);
    expect((await request(admin, newAccount, a, "PATCH", command({ ...oldSuspension, requestId: randomUUID(), minutes: 60 }))).status).toBe(400);
    const restriction = command({ action: "restrict", subject: subject.id, capabilities: ["post"], scope: "platform",
      scopeId: null, category: "safety", minutes: 31 });
    expect((await request(mod, features, m, "POST", restriction)).status).toBe(409);
    expect((await request(mod, features, m, "POST", { ...restriction, minutes: 30, capabilities: ["media"] })).status).toBe(403);
    expect((await request(mod, features, m, "POST", { ...restriction, minutes: 30 })).status).toBe(200);
    expect((await request(admin, features, a, "POST", command({
      action: "delegate", subject: mod.id, capabilities: ["comment"], scope: "platform", scopeId: null, maxMinutes: 10,
    }))).status).toBe(403);
    const audit = await request<PolicyAuditPage>(founder, "/api/v1/admin/audit/policies", f);
    expect(audit.status).toBe(200);
    expect(audit.data.events).toContainEqual(expect.objectContaining({
      source: "moderation", revision: revision + 1, actorId: founder.id, reason,
      changes: expect.arrayContaining([{ key: "moderatorMaxMinutes", before: 10080, after: 30 }]),
    }));
    const restored = await request<ModerationPolicyWorkspace>(founder, path, f, "PATCH",
      command({ action: "restore", expectedRevision: revision + 1, restoreRevision: revision }));
    expect(restored.status, JSON.stringify(restored.data)).toBe(200);
    expect(restored.data).toMatchObject({ revision: revision + 2, value: original.data.value,
      history: [expect.objectContaining({ restoredFrom: revision }), expect.objectContaining({ restoredFrom: null })] });
    expect(snapshot()).toBe(before);
    expect(sql(`select not has_function_privilege('authenticated',
      'public.m25_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb,int)','execute')
      and not has_table_privilege('service_role','private.m25_policy_events','insert');`)).toBe("t");

    await inEnglish(context);
    await login(page, founder);
    await solveMfa(page, founder.secret);
    await page.goto("/admin?section=moderationPolicies");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page).toHaveURL(/\/s\/[^/]+\/admin\?section=moderationPolicies$/);
    await expect(page.getByRole("heading", { name: moderationPolicyMessages.en.title, exact: true })).toBeVisible();
    for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440], ["en", 1280]] as const) {
      await page.setViewportSize({ width, height: 860 });
      await page.getByRole("banner").locator("select").selectOption(locale);
      const copy = moderationPolicyMessages[locale];
      await expect(page.getByRole("heading", { name: copy.title, exact: true })).toBeVisible();
      await expect(page.getByLabel(copy.administratorMaxMinutes, { exact: true })).toHaveValue("129600");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
    const copy = moderationPolicyMessages.en;
    await page.getByLabel(copy.defaultMinutes, { exact: true }).fill("45");
    await page.getByLabel(copy.reason, { exact: true }).fill("Confirm the editable default in the Founder workspace.");
    await page.getByLabel(copy.confirm, { exact: true }).check();
    await page.getByRole("button", { name: copy.save }).click();
    await expect(page.getByRole("status").filter({ hasText: copy.revision })).toContainText(copy.revision + " " + (revision + 3));
    await expect(page.getByLabel(copy.defaultMinutes, { exact: true })).toHaveValue("45");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${founder.id}';
      delete from public.role_assignments where user_id in ('${admin.id}','${mod.id}');`);
  }
});
