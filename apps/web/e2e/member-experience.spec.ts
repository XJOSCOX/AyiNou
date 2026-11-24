import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminMessages } from "../src/lib/admin-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, login, openAdministration, solveMfa, sql, test, totp } from "./fixtures";

const path = "/api/v1/admin/member-experience";
const details = "/api/v1/me/profile/details";
const note = "Disposable member policy and privacy rehearsal.";
const endpoint = "http://127.0.0.1:55321";
const authClient = () => createClient(endpoint, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

test("R2.3 enforces individual onboarding and profile privacy, preserves data and audits Founder settings", async ({ page, browser, makeMember }) => {
  test.setTimeout(100_000);
  const [founder, member, legacy] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  finishPersonalOnboarding(founder);
  sql(`delete from private.member_onboarding_cohort where user_id='${legacy.id}';
    insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(subject_id,event,reason) values('${founder.id}','first_account_bootstrapped','Disposable verification of founding provenance');`);
  const secret = await enroll(founder);
  const client = authClient();
  expect((await client.auth.signInWithPassword({ email: founder.email, password: founder.password })).error).toBeNull();
  const { data: factors } = await client.auth.mfa.listFactors();
  const proof = await client.auth.mfa.challengeAndVerify({ factorId: factors!.totp[0].id, code: totp(secret) });
  expect(proof.error).toBeNull();
  const actor = { ...founder, token: proof.data!.access_token };
  const guest = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const put = (memberDetails: object, status = 200) => apiCall(member, details, status, "PATCH", memberDetails);

  try {
    const workspace = (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const request = (method: string, body?: object, token = actor.token, ref = workspace, target = path) => fetch(api + target, {
      method, headers: { Authorization: "Bearer " + token, "X-Ayinou-Workspace": ref,
        ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const defaults = await (await request("GET")).json();
    expect(defaults.value).toMatchObject({ onboardingEnabled: true, requireCompletion: false, requireCountry: false,
      requireDepartment: false, requireInterests: false, requireLanguage: true, allowSkip: true, showProgress: true,
      profilesEnabled: true, publicProfiles: true, privateProfiles: true, profileEdits: true, profilePictures: true,
      profileBiographies: true, displayCountry: true, displayDepartment: true, displayInterests: true });
    expect((await request("GET", undefined, member.token)).ok).toBe(false);
    expect((await request("GET", undefined, actor.token, randomUUID())).ok).toBe(false);
    const command = (revision: number, flags: object) => ({
      value: { ...defaults.value, ...flags }, expectedRevision: revision, requestId: randomUUID(), reason: note,
    });
    const rule = { requireCompletion: true, requireCountry: true, requireDepartment: true, requireInterests: true, allowSkip: false, showProgress: false };
    const first = command(defaults.revision, rule);
    const choices = await Promise.all([request("PATCH", first), request("PATCH", { ...first, requestId: randomUUID() })]);
    expect(choices.map((response) => response.status).sort()).toEqual([200, 409]);
    const revision = defaults.revision + 1;
    const updates = (await (await request("GET")).json()).value;
    expect(updates).toMatchObject(rule);
    expect((await apiCall(member, "/api/v1/feed", 403)).error.code).toBe("ONBOARDING_REQUIRED");
    await apiCall(legacy, "/api/v1/feed", 200);
    await apiCall(member, "/api/v1/me/profile", 200);

    await inEnglish(guest);
    const signupFlow = await guest.newPage();
    await login(signupFlow, member);
    await expect(signupFlow).toHaveURL(/\/onboarding$/);
    await expect(signupFlow.getByRole("heading", { name: authMessages.en.onboardingTitle })).toBeVisible();
    await expect(signupFlow.locator('[aria-current="step"]')).toHaveCount(0);
    expect(await signupFlow.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const names = { firstName: "Private", lastName: "Member", membershipCategory: "haitian", onboardingStep: 1 };
    expect((await put(names, 400)).error.code).toBe("ONBOARDING_DETAILS_REQUIRED");
    expect((await put({ ...names, preferredLocale: "fr" })).profile.onboardingStep).toBe(1);
    expect((await put({ onboardingStep: 2, skipOptional: true }, 400)).error.code).toBe("ONBOARDING_DETAILS_REQUIRED");
    expect((await put({ onboardingStep: 2, residenceCountryCode: "HT" }, 400)).error.code).toBe("ONBOARDING_DETAILS_REQUIRED");
    expect((await put({ onboardingStep: 2, residenceCountryCode: "HT", residenceDepartmentCode: "HT-OU" })).profile.onboardingStep).toBe(2);
    await signupFlow.reload();
    await expect(signupFlow.getByRole("heading", { name: authMessages.en.onboardingTitle })).toBeVisible();
    await expect(signupFlow.getByText(membershipMessages.en.biography, { exact: true })).toBeVisible();
    expect((await put({ onboardingStep: 3, discoverable: true, biography: "A public biography." })).profile.onboardingStep).toBe(3);
    expect((await put({ onboardingStep: 4, interests: [] }, 400)).error.code).toBe("ONBOARDING_DETAILS_REQUIRED");
    expect((await put({ onboardingStep: 4, interests: ["education"] })).profile.onboardingStep).toBe(4);
    await apiCall(member, "/api/v1/feed", 200);

    const publicRead = async () => {
      const result = await fetch(api + "/api/v1/profiles/" + member.handle);
      return { status: result.status, body: await result.json() };
    };
    expect((await publicRead()).body.profile).toMatchObject({ countryCode: null, departmentCode: null, interests: null });
    await put({ showCountry: true, showDepartment: true, showInterests: true });
    expect((await publicRead()).body.profile).toMatchObject({
      countryCode: "HT", departmentCode: "HT-OU", interests: ["education"], biography: "A public biography.",
    });
    expect(JSON.stringify((await publicRead()).body)).not.toContain(member.email);
    expect((await request("PATCH", command(revision, { ...rule, displayCountry: false, displayDepartment: false,
      displayInterests: false, profileBiographies: false, profilePictures: false, profileEdits: false }))).status).toBe(200);
    expect((await publicRead()).body.profile).toMatchObject({ countryCode: null, departmentCode: null, interests: null, biography: null });
    expect((await apiCall(member, "/api/v1/me/profile", 200)).profile).toMatchObject({
      residenceCountryCode: "HT", residenceDepartmentCode: "HT-OU", interests: ["education"], biography: "A public biography.", showCountry: true,
    });
    expect((await put({ biography: "Replacement" }, 403)).error.code).toBe("PROFILE_POLICY_DISABLED");
    await put({ discoverable: false, showCountry: false });
    expect((await publicRead()).status).toBe(404);
    expect((await request("PATCH", command(revision + 1, { publicProfiles: false }))).status).toBe(200);
    expect((await put({ discoverable: true }, 403)).error.code).toBe("PROFILE_POLICY_DISABLED");
    expect((await publicRead()).status).toBe(404);

    await inEnglish(page.context());
    await login(page, founder);
    await solveMfa(page, secret);
    await openAdministration(page);
    const t = adminMessages.en;
    await page.getByRole("button", { name: t.navigationSettings, exact: true }).click();
    const settings = page.getByRole("region", { name: t.navigationSettings });
    await settings.getByRole("button", { name: t.memberExperience.title, exact: true }).click();
    const publicOption = page.getByRole("checkbox", { name: t.memberExperience.flags.publicProfiles });
    await expect(publicOption).not.toBeChecked();
    await publicOption.check();
    await page.getByLabel(t.registrationPolicy.reason).fill(note);
    await page.getByRole("button", { name: t.memberExperience.save }).click();
    await expect(page.getByText(t.registrationPolicy.revision + " " + (revision + 3), { exact: true })).toBeVisible();
    expect((await publicRead()).status).toBe(404);
    const history = await (await request("GET", undefined, actor.token, workspace, "/api/v1/admin/audit/policies")).json();
    expect(history.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "member_experience", actorId: founder.id, reason: note }),
    ]));
  } finally {
    await guest.close();
    sql(`update private.member_experience_policy set value=private.member_experience_defaults() where singleton;
      delete from private.platform_bootstrap where user_id='${founder.id}';`);
  }
});
