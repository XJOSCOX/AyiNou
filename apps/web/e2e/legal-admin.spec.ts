import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { api, expect, inEnglish, login, openAdministration, solveMfa, sql, test, totp, type Member } from "./fixtures";

const supabase = "http://127.0.0.1:55321";

async function recentMfa(member: Member) {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.data!.id,
    code: totp(factor.data!.totp.secret) });
  expect(verified.error).toBeNull();
  return { token: verified.data!.access_token, secret: factor.data!.totp.secret };
}

test("legal controls stay draft-safe, restricted and audit-free without approved releases @smoke", async ({ page, makeMember }) => {
  const [admin, other] = await Promise.all([makeMember(), makeMember()]);
  const { token, secret } = await recentMfa(admin);
  sql(`insert into public.role_assignments(user_id,role) values ('${admin.id}','administrator');`);
  expect(sql("select count(*) from private.legal_policy_settings where enabled or state <> 'draft' or release_version is not null;")).toBe("0");
  expect(sql("select enabled::text || ':' || suspended::text from private.legal_publication_settings;")).toBe("false:false");
  expect(sql("select has_table_privilege('authenticated','private.legal_policy_settings','select')::text;")).toBe("false");
  const publicStatus = await fetch(api + "/api/v1/legal/availability");
  expect(publicStatus.status).toBe(200);
  expect(await publicStatus.json()).toEqual({ enabled: false, policies: [] });

  const get = (bearer: string) => fetch(api + "/api/v1/admin/legal", { headers: { Authorization: `Bearer ${bearer}` } });
  expect((await get(other.token)).status).toBe(403);
  expect([401, 403]).toContain((await get(admin.token)).status);
  const allowed = await get(token);
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("cache-control")).toBe("private, no-store");
  const state = await allowed.json();
  expect(state.global.enabled).toBe(false);
  expect(state.policies).toHaveLength(9);
  expect(state.policies.every((policy: { eligible: boolean }) => !policy.eligible)).toBe(true);
  expect(Object.values(state.acceptance).every((value) => value === false)).toBe(true);

  const action = await fetch(api + "/api/v1/admin/legal/actions", { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "policy", policyId: "terms", action: "enable", expectedRevision: 0,
      reason: "Approval evidence is unavailable", requestId: randomUUID(), confirm: "CHANGE LEGAL AVAILABILITY" }) });
  expect(action.status).toBe(409);
  expect((await action.json()).error.code).toBe("LEGAL_APPROVAL_REQUIRED");
  expect(sql("select count(*) from private.legal_publication_audit;")).toBe("0");

  await inEnglish(page.context());
  await login(page, admin);
  await expect(page).toHaveURL(/\/mfa/);
  await solveMfa(page, secret);
  await openAdministration(page);
  await page.getByRole("button", { name: "Legal & Policies" }).click();
  await expect(page.getByText("Early Partner")).toBeVisible();
  await expect(page.getByText("No approved release").first()).toBeVisible();
  await page.goto("/legal");
  await expect(page.getByText("Approved and published policies will appear here when available.")).toBeVisible();
  sql(`delete from public.role_assignments where user_id='${admin.id}' and role='administrator';`);
});

test("legal setting RPC serializes versioned changes, replay and emergency suspension", async ({ makeMember }) => {
  const admin = await makeMember();
  await recentMfa(admin);
  sql(`insert into public.role_assignments(user_id,role) values ('${admin.id}','administrator');
    update private.legal_policy_settings set state='approved',release_version='1.0.0',
      release_digest=repeat('a',64),legal_approval_ref='disposable-legal',owner_approval_ref='disposable-owner',
      publication_authority_ref='disposable-authority',effective_at=now()-interval '1 day'
      where policy_id='terms';`);
  const invoke = (action: string, expected: number, request = randomUUID()) =>
    sql(`select public.admin_legal_action_for_api('${admin.id}','policy','terms','${action}',${expected},
      'Disposable test of legal publication control','${request}');`);
  const request = randomUUID();
  expect(JSON.parse(invoke("enable", 0, request))).toEqual({ revision: 1, enabled: true });
  expect(JSON.parse(invoke("enable", 0, request))).toEqual({ revision: 1, enabled: true });
  expect(() => invoke("enable", 0)).toThrow();
  expect(() => invoke("disable", 0)).toThrow();
  expect(sql("select count(*) from private.legal_publication_audit;")).toBe("1");
  expect(JSON.parse(invoke("suspend", 1))).toEqual({ revision: 2, enabled: false });
  expect(sql("select state from private.legal_policy_settings where policy_id='terms';")).toBe("suspended");
  expect(JSON.parse(invoke("restore", 2))).toEqual({ revision: 3, enabled: true });
  expect(sql("select release_digest from private.legal_policy_settings where policy_id='terms';")).toBe("a".repeat(64));
  expect(sql("select string_agg(previous_state || '>' || next_state,',' order by occurred_at,id) from private.legal_publication_audit;")).toContain("published>suspended");
  expect(sql("select count(*) from private.legal_publication_audit;")).toBe("3");
  // A fabricated database record cannot pass the immutable release registry gate.
  expect(await (await fetch(api + "/api/v1/legal/availability")).json()).toEqual({ enabled: false, policies: [] });
  sql(`delete from public.role_assignments where user_id='${admin.id}' and role='administrator';`);
});
