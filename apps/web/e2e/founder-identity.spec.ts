import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { FounderIdentityReceipt, FounderIdentityQueue, FounderReviewCase } from "@ayinou/shared";
import { founderMessages } from "../src/lib/founder-i18n";
import { messages } from "../src/lib/i18n";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, solveMfa, sql, test, totp, type Member } from "./fixtures";

const ownerPath = "/api/v1/me/founder-identity";
const adminPath = "/api/v1/admin/founder-identity";
const actionPath = (path: string, id: string) => path + "/" + id + "/actions";
const version = (expectedVersion: number, requestId = randomUUID()) => ({ expectedVersion, requestId, policyVersion: 1 });
const decision = (action: string, expectedVersion: number, reason: string) => ({
  ...version(expectedVersion), action, reason,
  ...(["grant", "release"].includes(action) ? { noConflict: true } : {}),
});

async function elevate(member: Member) {
  const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const proof = await client.auth.mfa.challengeAndVerify({ factorId: factor.data!.id, code: totp(factor.data!.totp.secret) });
  expect(proof.error).toBeNull();
  sql(`insert into public.role_assignments(user_id,role) values ('${member.id}','administrator');`);
  return { ...member, token: proof.data!.access_token, secret: factor.data!.totp.secret };
}

function setSyntheticPolicy(open: boolean) {
  // sql() rejects non-disposable projects and writes only through the owned Docker container.
  sql(`create or replace function private.founder_identity_policy_open() returns boolean
    language sql immutable set search_path='' as $$ select ${open ? "true" : "false"} $$;`);
}

const assign = (member: Member) => sql(`insert into private.founder_identity_authorities(actor_id,scope,approval_ref,expires_at)
  values ('${member.id}','founder_identity',gen_random_uuid(),now()+interval '1 hour');`);
const openCase = async (founder: Member, member: Member) =>
  await apiCall(founder, adminPath, 200, "POST",
    { username: member.handle, requestId: randomUUID(), reason: "member_request" }) as FounderIdentityReceipt;

const recordProof = (id: string, expired = false) => sql(`
  insert into private.founder_identity_proofs(case_id,subject_id,reviewer_id,policy_version,bound_version,method,confirmed_at,expires_at)
  select id,subject_id,reviewer_id,policy_version,version,'synthetic_identity_and_control',clock_timestamp(),
    clock_timestamp()+interval '${expired ? "0 seconds" : "20 minutes"}'
    from private.founder_identity_cases where id='${id}';
`);

function revokeSession(member: Member) {
  const claims = JSON.parse(Buffer.from(member.token.split(".")[1], "base64url").toString("utf8"));
  expect(claims.session_id).toMatch(/^[a-f0-9-]{36}$/);
  sql(`delete from auth.sessions where id='${claims.session_id}';`);
}

async function publicProfile(member: Member) {
  const profile = await fetch(api + "/api/v1/profiles/" + member.handle);
  expect(profile.status).toBe(200);
  expect(profile.headers.get("cache-control")).toBe("no-store");
  return (await profile.json()).profile;
}

type Administrator = Awaited<ReturnType<typeof elevate>>;
const founderTest = test.extend<{ administrators: { founder: Administrator; ordinaryAdmin: Administrator } }>({
  administrators: async ({ makeMember }, provide) => {
    const [leader, ordinary] = await Promise.all([makeMember(), makeMember()]);
    try {
      const founder = await elevate(leader);
      const ordinaryAdmin = await elevate(ordinary);
      await provide({ founder, ordinaryAdmin });
    } finally {
      // Keep this test's platform roles out of later tests using the same disposable database.
      sql(`insert into private.account_restrictions(user_id,status,reason) values
        ('${leader.id}','suspended','Disposable fixture retired'),
        ('${ordinary.id}','suspended','Disposable fixture retired');
        delete from public.role_assignments where user_id in ('${leader.id}','${ordinary.id}') and role='administrator';`);
    }
  },
});

founderTest("founder lifecycle isolates access, proof, consent and public provenance @smoke",
  async ({ page, browser, makeMember, administrators: { founder, ordinaryAdmin } }) => {
  test.setTimeout(100_000);
  const [member, other, contested] = await Promise.all([makeMember({ visible: true }), makeMember(), makeMember()]);
  const claims = JSON.parse(Buffer.from(founder.token.split(".")[1], "base64url").toString("utf8"));
  expect(sql(`select private.founder_identity_authority('${founder.id}','${claims.session_id}',true,
    extract(epoch from now()-interval '16 minutes')::bigint) is null;`)).toBe("t");

  await apiCall(ordinaryAdmin, adminPath, 403);
  await apiCall(ordinaryAdmin, adminPath, 403, "POST", { username: member.handle, requestId: randomUUID(), reason: "member_request" });
  await apiCall(member, adminPath, 403);
  assign(founder);
  await apiCall(founder, adminPath, 403, "POST", { username: founder.handle, requestId: randomUUID(), reason: "member_request" });
  const { caseId } = await openCase(founder, member);
  const mine = actionPath(ownerPath, caseId);
  const review = actionPath(adminPath, caseId);
  const opened = await apiCall(founder, adminPath, 200) as FounderIdentityQueue<FounderReviewCase>;
  expect(opened.issuanceEnabled).toBe(false);
  expect(opened.cases[0]).toMatchObject({ state: "consent_pending", consented: false, version: 1 });
  expect(opened.cases[0]).not.toHaveProperty("subjectId");
  expect(sql("select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'founder_identity_%' and c.relkind='r';")).toBe("t");
  expect(sql("select has_table_privilege('service_role','private.founder_identity_proofs','insert') or has_function_privilege('authenticated','public.founder_identity_public_for_api(uuid)','execute');")).toBe("f");
  await apiCall(other, mine, 404, "POST", { ...version(1), action: "consent", disclose: true });
  expect((await apiCall(other, ownerPath, 200)).cases).toEqual([]);
  await apiCall(founder, review, 409, "POST", decision("grant", 1, "confirmed"));
  await apiCall(founder, review, 400, "POST", { ...decision("grant", 1, "confirmed"), approvedProof: true });

  await inEnglish(page.context());
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/verification");
  const panel = page.getByRole("region", { name: founderMessages.en.title, exact: true });
  await expect(panel.getByText(founderMessages.en.states.consent_pending)).toBeVisible();
  for (const locale of ["ht", "fr", "es", "en"] as const) {
    const language = page.getByRole("banner").locator("select");
    await language.selectOption(locale);
    await expect(page.getByRole("region", { name: founderMessages[locale].title, exact: true })
      .getByText(founderMessages[locale].disabled)).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 810 });
  const dark = page.getByRole("button", { name: messages.en.switchToDark });
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await panel.getByLabel(founderMessages.en.publicChoice).check();
  await panel.getByRole("button", { name: founderMessages.en.actions.consent }).click();
  await panel.getByRole("button", { name: founderMessages.en.confirm }).click();
  await expect(panel.getByText(founderMessages.en.states.proof_pending)).toBeVisible();
  expect(() => recordProof(caseId)).toThrow();
  await apiCall(founder, review, 409, "POST", decision("grant", 2, "confirmed"));
  const expired = await makeMember();
  const expiredClaims = JSON.parse(Buffer.from(expired.token.split(".")[1], "base64url").toString("utf8"));
  sql(`update auth.sessions set not_after=now()-interval '1 minute' where id='${expiredClaims.session_id}';`);
  await apiCall(expired, ownerPath, 401);
  revokeSession(other);
  await apiCall(other, ownerPath, 401);

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await inEnglish(guestContext);
  const guest = await guestContext.newPage();
  try {
    setSyntheticPolicy(true);
    expect(() => recordProof(caseId, true)).toThrow();
    recordProof(caseId);
    await apiCall(founder, review, 409, "POST", decision("grant", 2, "confirmed"));
    const payload = decision("grant", 3, "confirmed");
    const first = await apiCall(founder, review, 200, "POST", payload);
    expect(await apiCall(founder, review, 200, "POST", payload)).toEqual(first);
    await apiCall(founder, review, 409, "POST", { ...payload, expectedVersion: 4 });
    await apiCall(founder, review, 409, "POST", decision("grant", 4, "confirmed"));
    expect(await publicProfile(member)).toMatchObject({ founderVerified: true });
    expect(sql(`select private.organization_setup_founder_candidate('${member.id}')::text || ':' ||
      private.organization_setup_identity_eligible('${member.id}')::text;`)).toBe("true:false");
    finishPersonalOnboarding(member);
    const organizationPath = "/api/v1/me/organization-onboarding";
    const intent = (await apiCall(member, organizationPath, 200, "PUT", {
      id: null, expectedVersion: 0, requestId: randomUUID(), stage: "drafting",
    })).intent;
    const organizationDraft = await apiCall(member, organizationPath + "/" + intent.id + "/details", 200, "PUT", {
      expectedVersion: intent.version, requestId: randomUUID(), draft: {
        mode: "new", name: "Synthetic founder eligibility", handle: "fv-" + randomUUID().slice(0, 12),
        kind: "ngo", countryCode: "HT", registrationStatus: "informal_unregistered",
      },
    });
    const refused = await apiCall(member, organizationPath + "/" + intent.id + "/complete", 403, "POST", {
      expectedVersion: organizationDraft.version, requestId: randomUUID(),
      declaration: { authorityConfirmed: true, declarationVersion: 1 },
    });
    expect(refused.error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
    const discoveryPath = "/api/v1/discover/people?q=" + member.handle;
    const discovery = await apiCall(founder, discoveryPath, 200);
    expect(discovery.accounts).toEqual([expect.objectContaining({ handle: member.handle })]);
    expect(discovery.accounts[0]).not.toHaveProperty("founderVerified");
    expect((await apiCall(founder, discoveryPath + "&verified=true", 200)).accounts).toEqual([]);
    expect(sql(`select private.project_identity_state('${member.id}') || ':' ||
      cardinality(private.reviewed_personal_claims('${member.id}'))::text;`)).toBe("required:0");
    expect(sql(`select private.poll_live_eligible(jsonb_populate_record(null::private.polls,
      '{"scope":"individual","creator_id":"${founder.id}","eligibility":"active"}'),'${member.id}')::text || ':' ||
      private.poll_live_eligible(jsonb_populate_record(null::private.polls,
      '{"scope":"individual","creator_id":"${founder.id}","eligibility":"verified"}'),'${member.id}')::text;`)).toBe("true:false");
    await guest.goto("/members/" + member.handle);
    await expect(guest.getByText(founderMessages.en.badge, { exact: true })).toBeVisible();

    await apiCall(founder, review, 200, "POST", decision("hold", 4, "account_risk"));
    expect(await publicProfile(member)).not.toHaveProperty("founderVerified");
    expect((await apiCall(founder, discoveryPath, 200)).accounts).toEqual(discovery.accounts);
    await guest.reload();
    await expect(guest.getByText(founderMessages.en.badge, { exact: true })).toHaveCount(0);
    await apiCall(founder, review, 409, "POST", decision("release", 5, "confirmed"));
    recordProof(caseId);
    await apiCall(founder, review, 200, "POST", decision("release", 6, "confirmed"));
    await apiCall(member, mine, 200, "POST", { ...version(7), action: "visibility", disclose: false });
    expect(await publicProfile(member)).not.toHaveProperty("founderVerified");
    await apiCall(member, mine, 200, "POST", { ...version(8), action: "visibility", disclose: true });
    expect(await publicProfile(member)).toMatchObject({ founderVerified: true });
    await apiCall(founder, review, 200, "POST", decision("revoke", 9, "account_risk"));
    expect(await publicProfile(member)).not.toHaveProperty("founderVerified");
    await apiCall(member, mine, 200, "POST", { ...version(10), action: "correction" });
    expect((await apiCall(member, ownerPath, 200)).cases[0]).toMatchObject({ correctionPending: true, state: "revoked" });
    expect(sql(`select count(*) from private.founder_identity_grants where case_id='${caseId}';`)).toBe("1");
    expect(sql(`select count(*) from private.founder_identity_events e join private.founder_identity_cases c
      on c.id=e.case_id where c.id='${caseId}' and e.case_version<=c.version;`)).toBe("11");

    const contestedCase = await openCase(founder, contested);
    const contestedReview = actionPath(adminPath, contestedCase.caseId);
    const contestedMine = actionPath(ownerPath, contestedCase.caseId);
    await apiCall(contested, contestedMine, 200, "POST", { ...version(1), action: "consent", disclose: true });
    recordProof(contestedCase.caseId);
    await apiCall(founder, contestedReview, 200, "POST", decision("conflict", 3, "conflict"));
    await apiCall(founder, contestedReview, 409, "POST", decision("grant", 4, "confirmed"));

    for (const competing of ["hold", "revoke", "withdraw"] as const) {
      const subject = await makeMember({ visible: true });
      const started = await openCase(founder, subject);
      const adminAction = actionPath(adminPath, started.caseId);
      const memberAction = actionPath(ownerPath, started.caseId);
      await apiCall(subject, memberAction, 200, "POST", { ...version(1), action: "consent", disclose: true });
      recordProof(started.caseId);
      const competingActor = competing === "withdraw" ? subject : founder;
      const competingPath = competing === "withdraw" ? memberAction : adminAction;
      const opposing = competing === "withdraw" ? { ...version(3), action: "withdraw" } : decision(competing, 3, "account_risk");
      const submit = (who: Member, path: string, body: object) => fetch(api + path, {
        method: "POST", headers: { Authorization: "Bearer " + who.token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const [grant, second] = await Promise.all([
        submit(founder, adminAction, decision("grant", 3, "confirmed")), submit(competingActor, competingPath, opposing),
      ]);
      expect([grant.status, second.status].sort()).toEqual([200, 409]);
      expect(sql(`select count(*) from private.founder_identity_events where case_id='${started.caseId}' and case_version=4;`)).toBe("1");
      if (grant.ok) await apiCall(competingActor, competingPath, 200, "POST", { ...opposing, expectedVersion: 4 });
      expect(await publicProfile(subject)).not.toHaveProperty("founderVerified");
      await apiCall(founder, adminAction, 409, "POST", decision("grant", 5, "confirmed"));
    }

    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await inEnglish(staffContext);
      const staff = await staffContext.newPage();
      await login(staff, founder);
      await solveMfa(staff, founder.secret);
      await staff.goto("/admin");
      await staff.getByRole("button", { name: founderMessages.en.adminTitle }).click();
      const workspace = staff.getByRole("region", { name: founderMessages.en.adminTitle });
      await expect(workspace.getByText("@" + member.handle + " · " + founderMessages.en.states.revoked)).toBeVisible();
      await expect(workspace.getByText(founderMessages.en.correctionPending)).toBeVisible();
    } finally {
      await staffContext.close();
    }
    sql(`update private.founder_identity_authorities set revoked_at=now() where actor_id='${founder.id}';`);
    await apiCall(founder, adminPath, 403);
  } finally {
    setSyntheticPolicy(false);
    await guestContext.close();
  }
});
