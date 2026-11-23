import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { adminMessages } from "../src/lib/admin-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { accountMessages } from "../src/lib/account-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, login, openAdministration, solveMfa, sql, test, totp } from "./fixtures";

const authUrl = "http://127.0.0.1:55321";
const pathname = "/api/v1/admin/registration";
const policyPath = "/api/v1/registration/policy";
const password = "Disposable-register!23";
const initial = { enabled: true, mode: "public", individualEnabled: true, organizationEnabled: true, referralsEnabled: true };
const reason = "Disposable registration policy rehearsal.";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const client = () => createClient(authUrl, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const candidate = () => {
  const username = "r22_" + randomUUID().replaceAll("-", "").slice(0, 16);
  return { username, email: username + "@example.com" };
};
const signup = ({ email, username }: ReturnType<typeof candidate>, metadata = {}) => client().auth.signUp({
  email, password, options: { data: { public_username: username, ...metadata } },
});

test("R2.2 protects Auth signup, invitation redemption, referral attribution and Founder changes @smoke", async ({ browser, page, makeMember }) => {
  test.setTimeout(100_000);
  const [founder, member] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(founder);
  const { referralCode } = await apiCall(member, "/api/v1/me/referral-code", 200);
  const secret = await enroll(founder);
  const founderClient = client();
  expect((await founderClient.auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
  const { data: factors } = await founderClient.auth.mfa.listFactors();
  const proof = await founderClient.auth.mfa.challengeAndVerify({ factorId: factors!.totp[0].id, code: totp(secret) });
  expect(proof.error).toBeNull();
  const elevated = { ...founder, token: proof.data!.access_token };
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values('${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const workspace = (await apiCall(elevated, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const send = (token: string, method = "GET", payload?: object, ref = workspace, suffix = "") => fetch(api + pathname + suffix, {
      method, headers: { Authorization: "Bearer " + token, "X-Ayinou-Workspace": ref,
        ...(payload && { "Content-Type": "application/json" }) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const update = (expectedRevision: number, changes: Partial<typeof initial>) => ({
      action: "update", expectedRevision, requestId: randomUUID(), reason, value: { ...initial, ...changes },
    });
    const baseline = (await (await send(elevated.token)).json()).revision as number;
    const publicRead = await fetch(api + policyPath);
    expect(publicRead.headers.get("cache-control")).toContain("no-store");
    expect(await publicRead.json()).toEqual(initial);
    expect([401, 403]).toContain((await send(founder.token)).status);
    expect((await send(member.token, "PATCH", update(baseline, { mode: "closed" }))).status).toBe(403);
    expect((await send(elevated.token, "GET", undefined, randomUUID())).status).toBe(404);
    expect((await send(elevated.token, "PATCH", { ...update(baseline, {}), value: { ...initial, rewardsEnabled: true } })).status).toBe(400);

    await inEnglish(guest);
    const visit = await guest.newPage();
    await visit.goto("/register?ref=" + referralCode);
    await expect(visit.getByLabel(accountMessages.en.optionalReferral)).toHaveValue(referralCode);
    expect(await visit.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const ordinary = candidate();
    expect((await signup(ordinary)).error).toBeNull();
    expect(sql(`select count(*) from private.referrals r join auth.users u on u.id=r.referred_user_id where u.email='${ordinary.email}';`)).toBe("0");

    const closing = update(baseline, { mode: "closed" });
    const choice = await Promise.all([closing, { ...closing, requestId: randomUUID() }]
      .map((command) => send(elevated.token, "PATCH", command)));
    expect(choice.map((result) => result.status).sort()).toEqual([200, 409]);
    const receipt = await (choice.find((result) => result.ok)!).json();
    expect(receipt).toMatchObject({ revision: baseline + 1, mode: "closed" });
    const winner = choice.findIndex((result) => result.ok);
    if (winner === 0) expect(await (await send(elevated.token, "PATCH", closing)).json()).toEqual(receipt);
    expect((await signup(candidate(), { signup_path: "organization", referral_code: referralCode })).error).not.toBeNull();
    expect((await signup(candidate())).error).not.toBeNull();
    expect((await client().auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
    await visit.reload();
    await expect(visit.getByText(authMessages.en.registrationUnavailable)).toBeVisible();

    expect((await send(elevated.token, "PATCH", update(baseline + 1, { individualEnabled: false, organizationEnabled: false }))).status).toBe(200);
    expect((await signup(candidate(), { signup_path: "individual" })).error).not.toBeNull();
    expect((await signup(candidate(), { signup_path: "organization" })).error).not.toBeNull();
    await visit.reload();
    await expect(visit.getByText(authMessages.en.registrationUnavailable)).toBeVisible();

    const restricted = update(baseline + 2, { mode: "invitation_only", individualEnabled: false });
    expect((await send(elevated.token, "PATCH", restricted)).status).toBe(200);
    await visit.reload();
    await expect(visit.getByLabel(authMessages.en.registrationInvitation)).toBeVisible();
    await expect(visit.locator('input[name="signup-path"][value="individual"]')).toHaveCount(0);
    const invited = candidate();
    const code = randomBytes(32).toString("hex");
    const invitation = { action: "invite", expectedRevision: baseline + 3, requestId: randomUUID(),
      reason, pathway: "organization", code, email: invited.email };
    const issued = await send(elevated.token, "POST", invitation, workspace, "/invitations");
    expect(issued.status).toBe(200);
    expect(await issued.json()).toMatchObject({ id: invitation.requestId });
    expect((await signup(candidate(), { signup_path: "organization", registration_invitation: code })).error).not.toBeNull();
    expect((await signup(invited, { registration_invitation: code })).error).not.toBeNull();
    expect((await signup(invited, { signup_path: "organization", registration_invitation: code, referral_code: referralCode })).error).toBeNull();
    expect(sql(`select count(*) from private.registration_invitations where id='${invitation.requestId}' and consumed_at is not null;`)).toBe("1");
    expect(sql(`select (not u.raw_user_meta_data ? 'registration_invitation' and not exists(
      select 1 from auth.identities i where i.user_id=u.id and i.identity_data ? 'registration_invitation'))::text
      from auth.users u where u.email='${invited.email}';`)).toBe("true");
    expect(sql(`select count(*) from private.referrals r join auth.users u on u.id=r.referred_user_id where u.email='${invited.email}' and r.confirmed_at is null;`)).toBe("1");

    expect((await send(elevated.token, "PATCH", update(baseline + 3, { organizationEnabled: false, referralsEnabled: false }))).status).toBe(200);
    expect((await signup(candidate(), { signup_path: "organization" })).error).not.toBeNull();
    const independent = candidate();
    expect((await signup(independent, { referral_code: referralCode })).error).toBeNull();
    expect(sql(`select count(*) from private.referrals r join auth.users u on u.id=r.referred_user_id where u.email='${independent.email}';`)).toBe("0");
    const validation = await fetch(api + "/api/v1/referrals/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: referralCode }),
    });
    expect(await validation.json()).toEqual({ valid: false });

    await inEnglish(page.context());
    await login(page, founder);
    await solveMfa(page, secret);
    await openAdministration(page);
    const ui = adminMessages.en.registrationPolicy;
    await page.getByRole("button", { name: ui.title, exact: true }).click();
    await expect(page.getByRole("heading", { name: ui.title, exact: true })).toBeVisible();
    await page.getByLabel(ui.organizationEnabled).check();
    await page.getByLabel(ui.referralsEnabled).check();
    await page.getByLabel(ui.reason, { exact: true }).fill(reason);
    await page.getByRole("button", { name: ui.save }).click();
    await expect(page.getByText(ui.revision + " " + (baseline + 5), { exact: false })).toBeVisible();
    expect(sql(`select count(*) from private.registration_policy_events where revision>${baseline} and actor_id='${founder.id}';`)).toBe("5");
    expect(sql(`select (has_table_privilege('authenticated','private.registration_invitations','select')
      or has_table_privilege('authenticated','private.registration_policy_events','select')
      or has_function_privilege('anon','public.founder_registration_policy_for_api(uuid,uuid,boolean,bigint,uuid,jsonb)','execute'))::text;`)).toBe("false");
    const { session_id: sessionId } = JSON.parse(Buffer.from(elevated.token.split(".")[1], "base64url").toString());
    expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    sql(`delete from auth.sessions where id='${sessionId}';`);
    expect((await send(elevated.token)).status).toBe(401);
  } finally {
    await guest.close();
    sql(`update private.registration_policy set enabled=true,mode='public',
      individual_enabled=true,organization_enabled=true,referrals_enabled=true where singleton;
      delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});

test("R2.2 preserves the reserved Founder signup under closed registration @smoke", async () => {
  const owner = candidate();
  const other = candidate();
  const flow = randomUUID();
  const unlock = randomBytes(32).toString("base64url");
  const authorization = randomBytes(32).toString("base64url");
  try {
    sql(`update private.registration_policy set mode='closed' where singleton;`);
    expect(sql(`select public.f1_prepare_for_api('${flow}','${owner.email}','${owner.username}','${digest(unlock)}');`)).toBe("t");
    sql(`select public.f1_founder_for_api('${flow}','unlock','${digest(unlock)}','${digest(authorization)}',null,null,null);`);
    const form = JSON.parse(sql(`select public.f1_founder_for_api('${flow}','form',null,'${digest(authorization)}',null,null,null);`));
    const proof = digest("r22-founder:" + digest(authorization));
    expect((await signup({ ...owner, username: form.signupUsername })).error).not.toBeNull();
    expect((await signup({ ...other, username: form.signupUsername }, { founder_signup_proof: proof })).error).not.toBeNull();
    expect((await signup({ ...owner, username: form.signupUsername }, { founder_signup_proof: proof })).error).toBeNull();
    expect(sql(`select (not u.raw_user_meta_data ? 'founder_signup_proof' and not exists(
      select 1 from auth.identities i where i.user_id=u.id and i.identity_data ? 'founder_signup_proof'))::text
      from auth.users u where u.email='${owner.email}';`)).toBe("true");
    expect(sql("select count(*) from private.platform_bootstrap;")).toBe("0");
  } finally {
    sql(`update private.registration_policy set mode='public' where singleton;
      delete from private.f1_founder_flow where id='${flow}';
      delete from private.founder_registration where configured_email='${owner.email}';`);
  }
});
