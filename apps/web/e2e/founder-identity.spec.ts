import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { FounderIdentityReceipt, FounderIdentityQueue, FounderReviewCase } from "@ayinou/shared";
import { institutionMessages } from "../src/lib/institution-i18n";
import { founderMessages } from "../src/lib/founder-i18n";
import { messages } from "../src/lib/i18n";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, openAdministration, solveMfa, sql, test, totp, web, type Member } from "./fixtures";

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
  const body = open ? "select true" : "select coalesce((private.fv_active_policy()).issuance_enabled,false)";
  sql(`create or replace function private.founder_identity_policy_open() returns boolean
    language sql stable set search_path='' as $$ ${body} $$;`);
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
    const [leader, ordinary] = await Promise.all([makeMember(), makeMember({ visible: true })]);
    try {
      const founder = await elevate(leader);
      const ordinaryAdmin = await elevate(ordinary);
      sql(`insert into private.platform_bootstrap(user_id) values ('${founder.id}');
        insert into private.platform_admin_audit(subject_id,event,reason)
          values ('${founder.id}','first_account_bootstrapped','Disposable verified founding provenance');`);
      await provide({ founder, ordinaryAdmin });
    } finally {
      // Keep this test's platform roles out of later tests using the same disposable database.
      sql(`insert into private.account_restrictions(user_id,status,reason) values
        ('${leader.id}','suspended','Disposable fixture retired'),
        ('${ordinary.id}','suspended','Disposable fixture retired');
        delete from private.platform_bootstrap where user_id='${leader.id}';
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
  const applicationsPath = "/api/v1/me/verification";
  const reviewQueue = "/api/v1/verification/review";
  const evidence = "https://example.org/synthetic-identity";
  const { id: applicationId } = await apiCall(member, applicationsPath, 201, "POST", {
    organizationId: null, kind: "identity", evidence: [evidence],
  });
  const { id: publicFigureId } = await apiCall(member, applicationsPath, 201, "POST", {
    organizationId: null, kind: "notable_person", evidence: ["https://example.org/synthetic-figure", "https://example.net/synthetic-figure"],
  });
  const { id: otherApplicationId } = await apiCall(other, applicationsPath, 201, "POST", {
    organizationId: null, kind: "identity", evidence: [evidence],
  });
  await apiCall(member, reviewQueue + "?status=closed", 403);
  await apiCall(ordinaryAdmin, reviewQueue + "?status=closed", 403);
  sql(`insert into private.verification_reviewers(user_id) values ('${ordinaryAdmin.id}');`);
  expect((await apiCall(ordinaryAdmin, reviewQueue, 200)).applications).toContainEqual(
    expect.objectContaining({ id: applicationId, status: "pending" }));
  await apiCall(ordinaryAdmin, reviewQueue + "/" + applicationId + "/work", 204, "PATCH", { claim: true });
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
  await expect(panel.getByLabel(founderMessages.en.supersessionChoice)).not.toBeChecked();
  await panel.getByLabel(founderMessages.en.supersessionChoice).check();
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
    expect((await apiCall(member, applicationsPath, 200)).applications).toContainEqual(
      expect.objectContaining({ id: applicationId, status: "pending" }));
    const payload = decision("grant", 3, "confirmed");
    const first = await apiCall(founder, review, 200, "POST", payload);
    expect(await apiCall(founder, review, 200, "POST", payload)).toEqual(first);
    await apiCall(founder, review, 409, "POST", { ...payload, expectedVersion: 4 });
    await apiCall(founder, review, 409, "POST", decision("grant", 4, "confirmed"));
    const applications = (await apiCall(member, applicationsPath, 200)).applications;
    expect(applications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: applicationId, status: "closed", decidedAt: expect.any(String), canAppeal: false }),
      expect.objectContaining({ id: publicFigureId, status: "pending" }),
    ]));
    expect((await apiCall(ordinaryAdmin, reviewQueue, 200)).applications.map((app: { id: string }) => app.id))
      .not.toContain(applicationId);
    expect((await apiCall(ordinaryAdmin, reviewQueue + "?status=closed", 200)).applications).toContainEqual(
      expect.objectContaining({ id: applicationId, status: "closed", evidence: [evidence], decidedAt: expect.any(String) }));
    await apiCall(ordinaryAdmin, reviewQueue + "/" + applicationId, 409, "POST", {
      decision: "approve", conflictFree: true, rationale: "Synthetic stale approval must fail.",
    });
    expect(sql(`select a.status || ':' || coalesce(e.action,'missing') || ':' || coalesce(e.reason,'missing')
      from private.verification_applications a left join private.founder_identity_events e on e.id=a.closed_by_founder_event_id
      where a.id='${applicationId}';`)).toBe("closed:grant:confirmed");
    expect(sql(`select status from private.verification_applications where id='${otherApplicationId}';`)).toBe("pending");
    await page.reload();
    await panel.getByText(founderMessages.en.caseHistory, { exact: true }).click();
    await expect(panel.getByText(founderMessages.en.states.granted, { exact: true })).toBeVisible();
    const t = institutionMessages.en;
    await expect(page.getByText(founderMessages.en.supersededMemberNotice)).toBeHidden();
    await page.getByText(t.applicationHistory, { exact: true }).click();
    await expect(page.getByText(founderMessages.en.supersededMemberNotice)).toBeVisible();
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
    expect(discovery.accounts[0]).toHaveProperty("founderVerified", true);
    expect((await apiCall(founder, discoveryPath + "&verified=true", 200)).accounts).toEqual([]);
    expect(sql(`select private.project_identity_state('${member.id}') || ':' ||
      cardinality(private.reviewed_personal_claims('${member.id}'))::text;`)).toBe("required:0");
    expect(sql(`select private.poll_live_eligible(jsonb_populate_record(null::private.polls,
      '{"scope":"individual","creator_id":"${founder.id}","eligibility":"active"}'),'${member.id}')::text || ':' ||
      private.poll_live_eligible(jsonb_populate_record(null::private.polls,
      '{"scope":"individual","creator_id":"${founder.id}","eligibility":"verified"}'),'${member.id}')::text;`)).toBe("true:false");
    await guest.goto("/members/" + member.handle);
    await expect(guest.getByText(founderMessages.en.badge, { exact: true })).toBeVisible();
    const badgeIcon = guest.locator('[data-designation="founderIdentity"] img');
    await expect(badgeIcon).toBeVisible();
    await expect(badgeIcon).toHaveAttribute("src", "/founder-verified.png");
    await expect(badgeIcon).toHaveJSProperty("naturalWidth", 100);

    await apiCall(founder, review, 200, "POST", decision("hold", 4, "account_risk"));
    expect(await publicProfile(member)).not.toHaveProperty("founderVerified");
    const heldDiscovery = (await apiCall(founder, discoveryPath, 200)).accounts;
    expect(heldDiscovery).toEqual([expect.objectContaining({ handle: member.handle })]);
    expect(heldDiscovery[0]).not.toHaveProperty("founderVerified");
    await guest.reload();
    await expect(guest.getByText(founderMessages.en.badge, { exact: true })).toHaveCount(0);
    await expect(badgeIcon).toHaveCount(0);
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
    expect((await apiCall(member, applicationsPath, 200)).applications).toContainEqual(
      expect.objectContaining({ id: applicationId, status: "closed" }));
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
      await openAdministration(staff);
      await staff.getByRole("button", { name: founderMessages.en.adminTitle }).click();
      const workspace = staff.getByRole("region", { name: founderMessages.en.adminTitle });
      await workspace.getByText(founderMessages.en.caseHistory, { exact: true }).click();
      const archived = workspace.getByRole("article").filter({ hasText: "@" + member.handle });
      await expect(archived.getByText("@" + member.handle + " · " + founderMessages.en.states.revoked)).toBeVisible();
      await archived.getByText(founderMessages.en.history, { exact: true }).click();
      await expect(archived.getByText(founderMessages.en.reasons.confirmed, { exact: false })).not.toHaveCount(0);
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


founderTest("founder authority and ordinary review are independent, and supersession respects current consent", async ({
  makeMember, administrators: { founder, ordinaryAdmin },
}) => {
  test.setTimeout(100_000);
  const applicationPath = "/api/v1/me/verification";
  const queue = "/api/v1/verification/review";
  const submit = async (member: Member) => (await apiCall(member, applicationPath, 201, "POST", {
    organizationId: null, kind: "identity", evidence: ["https://example.org/private-reference"],
  })).id as string;
  const claim = (reviewer: Member, application: string, status = 204) =>
    apiCall(reviewer, queue + "/" + application + "/work", status, "PATCH", { claim: true });
  const reviewPayload = (action: "approve" | "reject") => ({
    decision: action, conflictFree: true, rationale: "Disposable independent identity decision.",
  });
  const review = (reviewer: Member, application: string, action: "approve" | "reject" = "approve", status = 200) =>
    apiCall(reviewer, queue + "/" + application, status, "POST", reviewPayload(action));
  const read = async (member: Member, application: string) =>
    (await apiCall(member, applicationPath, 200)).applications.find((item: { id: string }) => item.id === application);

  assign(founder);
  await apiCall(founder, queue, 403);
  sql(`insert into private.verification_reviewers(user_id) values ('${founder.id}'),('${ordinaryAdmin.id}');`);
  const self = await submit(founder);
  await claim(founder, self, 403);
  setSyntheticPolicy(true);
  try {
    for (const scenario of ["declined", "stale", "approved", "race", "rejected", "prior_vote", "restricted"] as const) {
      const member = await makeMember({ visible: true });
      const application = await submit(member);
      const started = await openCase(founder, member);
      const mine = actionPath(ownerPath, started.caseId);
      const grantUrl = actionPath(adminPath, started.caseId);
      await review(founder, application, "approve", 403);
      await claim(founder, application);
      await claim(ordinaryAdmin, application);
      const preVote = scenario === "race" || scenario === "approved" || scenario === "prior_vote";
      if (preVote) {
        expect(await review(founder, application)).toMatchObject({ status: "pending" });
        await review(founder, application, "approve", 409);
      }
      const item = (await apiCall(member, ownerPath, 200)).cases[0];
      const request = { ...version(1), action: "consent", disclose: true };
      const optIn = { ...request, supersession: { applicationId: application, revision: item.regularApplication.revision } };
      if (scenario === "declined") {
        await apiCall(member, mine, 409, "POST", { ...optIn, supersession: { applicationId: application, revision: 99 } });
        await apiCall(member, mine, 404, "POST", { ...optIn, supersession: { applicationId: self, revision: 1 } });
        expect((await apiCall(member, ownerPath, 200)).cases[0].state).toBe("consent_pending");
        await apiCall(member, mine, 200, "POST", request);
        await apiCall(member, mine, 409, "POST", optIn);
      } else {
        const receipt = await apiCall(member, mine, 200, "POST", optIn);
        expect(await apiCall(member, mine, 200, "POST", optIn)).toEqual(receipt);
        await apiCall(member, mine, 409, "POST", request);
      }
      recordProof(started.caseId);
      const payload = decision("grant", 3, "confirmed");
      if (scenario === "stale") expect(await review(founder, application)).toMatchObject({ status: "pending" });
      if (scenario === "approved") expect(await review(ordinaryAdmin, application)).toMatchObject({ status: "approved" });
      if (scenario === "rejected") expect(await review(ordinaryAdmin, application, "reject")).toMatchObject({ status: "rejected" });
      if (scenario === "restricted") {
        sql(`insert into private.account_restrictions(user_id,status,reason)
          values ('${member.id}','suspended','Disposable restricted subject');`);
        await apiCall(founder, grantUrl, 409, "POST", payload);
        expect(sql(`select count(*) from private.founder_identity_events where case_id='${started.caseId}' and action='grant';`)).toBe("0");
        expect(sql(`select status from private.verification_applications where id='${application}';`)).toBe("pending");
        continue;
      }
      if (scenario === "race") {
        const [grant, second] = await Promise.all([
          apiCall(founder, grantUrl, 200, "POST", payload),
          fetch(api + queue + "/" + application, { method: "POST", headers: {
            Authorization: "Bearer " + ordinaryAdmin.token, "Content-Type": "application/json",
          }, body: JSON.stringify(reviewPayload("approve")) }),
        ]);
        expect(grant.auditId).toBeTruthy();
        const status = (await read(member, application)).status;
        expect(["closed", "approved"]).toContain(status);
        expect(second.status).toBe(status === "closed" ? 409 : 200);
      } else {
        await apiCall(founder, grantUrl, 200, "POST", payload);
        const outcome = scenario === "approved" ? "approved" : scenario === "rejected" ? "rejected" : scenario === "prior_vote" ? "closed" : "pending";
        expect(await read(member, application)).toMatchObject({ status: outcome });
      }
      expect(await publicProfile(member)).toMatchObject({ founderVerified: true });
      const finalStatus = (await read(member, application)).status;
      expect(sql(`select cardinality(private.reviewed_personal_claims('${member.id}'));`)).toBe(finalStatus === "approved" ? "1" : "0");
      expect(sql(`select count(*) from private.verification_reviews where application_id='${application}';`))
        .toBe(scenario === "declined" ? "0" : finalStatus === "approved" ? "2" : "1");
      const audit = sql(`select string_agg(s.event||':'||s.reason,',' order by s.event)
        from private.founder_supersession_events s join private.founder_identity_events e on e.id=s.founder_event_id
        where e.case_id='${started.caseId}';`);
      expect(audit).toContain("grant_initiated:founder_confirmed");
      expect(audit).toContain("grant_committed:founder_confirmed");
      expect(audit).toContain("application_resolved:" + (
        scenario === "declined" ? "no_consent" : scenario === "stale" ? "stale_application" :
          finalStatus === "closed" ? "superseded_by_founder_verification" : "application_completed"
      ));
      expect(audit.includes("member_consented:member_opted_in")).toBe(scenario !== "declined");
      if (scenario === "declined") {
        const archived = (await apiCall(member, ownerPath, 200)).cases[0];
        const late = { ...version(archived.version), action: "supersede", applicationId: application,
          revision: archived.regularApplication.revision };
        await apiCall(ordinaryAdmin, mine, 404, "POST", late);
        const receipt = await apiCall(member, mine, 200, "POST", late);
        expect(await apiCall(member, mine, 200, "POST", late)).toEqual(receipt);
        await apiCall(member, mine, 409, "POST", { ...late, revision: late.revision + 1 });
        expect(await read(member, application)).toMatchObject({
          status: "closed", closureReason: "superseded_by_founder_verification",
        });
        expect(sql(`select e.action from private.verification_applications a
          join private.founder_identity_events e on e.id=a.closed_by_founder_event_id where a.id='${application}';`)).toBe("grant");
      }
    }
  } finally {
    setSyntheticPolicy(false);
  }
});


founderTest("formal Founder provenance gives routine admin authority and reserves Founder issuance @smoke", async ({
  page, makeMember, administrators: { founder, ordinaryAdmin },
}) => {
  const reason = "Synthetic routine authority and protected role test.";
  const accessPath = "/api/v1/me/platform-access";
  const action = (actor: Member, subject: Member, request: object, status: number) =>
    apiCall(actor, "/api/v1/admin/accounts/" + subject.id, status, "PATCH", { ...request, reason });

  sql(`delete from public.role_assignments where user_id='${founder.id}' and role='administrator';`);
  expect(await apiCall(founder, accessPath, 200)).toMatchObject({ founder: true, administrator: true, reviewer: false });
  expect(await apiCall(ordinaryAdmin, accessPath, 200)).toMatchObject({ founder: false, administrator: true, reviewer: false });
  await apiCall(founder, "/api/v1/admin/overview", 200);
  await apiCall(ordinaryAdmin, "/api/v1/admin/overview", 200);
  const member = await makeMember();
  await action(founder, member, { action: "status", value: "suspended" }, 204);
  await action(ordinaryAdmin, member, { action: "status", value: "active" }, 204);
  expect(sql(`select count(*) from private.platform_admin_audit where subject_id='${member.id}'
    and event in ('account_suspended','account_reinstated');`)).toBe("2");
  await action(ordinaryAdmin, founder, { action: "status", value: "suspended" }, 409);
  await action(ordinaryAdmin, founder, { action: "revoke", value: "founder" }, 400);
  await action(ordinaryAdmin, member, { action: "grant", value: "founder" }, 400);
  expect(sql(`select count(*) from private.platform_admin_audit where subject_id='${founder.id}' and event='account_suspended';`)).toBe("0");

  assign(ordinaryAdmin);
  const { caseId } = await openCase(ordinaryAdmin, member);
  await apiCall(member, actionPath(ownerPath, caseId), 200, "POST", { ...version(1), action: "consent", disclose: true });
  setSyntheticPolicy(true);
  try {
    recordProof(caseId);
    expect((await apiCall(ordinaryAdmin, adminPath, 200)).canIssue).toBe(false);
    await apiCall(ordinaryAdmin, actionPath(adminPath, caseId), 403, "POST", decision("grant", 3, "confirmed"));
    expect(sql(`select count(*) from private.founder_identity_events where case_id='${caseId}' and action='grant';`)).toBe("0");

    assign(founder);
    const subject = await openCase(founder, ordinaryAdmin);
    const memberAction = actionPath(ownerPath, subject.caseId);
    const founderAction = actionPath(adminPath, subject.caseId);
    await apiCall(ordinaryAdmin, memberAction, 200, "POST", { ...version(1), action: "consent", disclose: true });
    recordProof(subject.caseId);
    await apiCall(founder, founderAction, 200, "POST", decision("grant", 3, "confirmed"));
    expect(await apiCall(ordinaryAdmin, accessPath, 200)).toMatchObject({ founder: false, administrator: true, founderVerified: true });

    await inEnglish(page.context());
    await page.goto("/members/" + ordinaryAdmin.handle);
    const green = page.locator('[data-designation="administrator"]');
    const gold = page.locator('[data-designation="founderIdentity"]');
    const blue = page.locator('[data-designation="identity"]');
    await expect(green).toHaveCSS("color", "rgb(23, 98, 73)");
    await expect(green.locator("img")).toHaveAttribute("src", "/admin.png");
    await expect(green.locator("img")).toHaveJSProperty("naturalWidth", 100);
    await expect(gold).toHaveCSS("color", "rgb(121, 80, 6)");
    await expect(page.locator('[data-designation="founder"]')).toHaveCount(0);

    const separateReviewer = await elevate(await makeMember());
    try {
      const application = (await apiCall(ordinaryAdmin, "/api/v1/me/verification", 201, "POST", {
        organizationId: null, kind: "identity", evidence: ["https://example.org/synthetic-independent-review"],
      })).id;
      const review = "/api/v1/verification/review/" + application;
      sql(`insert into private.verification_reviewers(user_id) values ('${founder.id}'),('${separateReviewer.id}');`);
      for (const reviewer of [founder, separateReviewer]) {
        await apiCall(reviewer, review + "/work", 204, "PATCH", { claim: true });
        expect(await apiCall(reviewer, review, 200, "POST", {
          decision: "approve", conflictFree: true, rationale: "Synthetic independent identity decision.",
        })).toMatchObject({ status: reviewer.id === founder.id ? "pending" : "approved" });
      }

      await page.reload();
      await expect(green).toBeVisible();
      await expect(blue).toHaveCSS("color", "rgb(25, 86, 165)");
      await expect(blue.locator("img")).toHaveAttribute("src", "/verified.png");
      await expect(blue.locator("img")).toHaveJSProperty("naturalWidth", 100);
      await expect(gold).toBeHidden();
      await page.getByText(founderMessages.en.verificationDetails, { exact: true }).click();
      await expect(gold).toBeVisible();

      await apiCall(founder, founderAction, 200, "POST", decision("revoke", 4, "account_risk"));
      await page.reload();
      await expect(green).toBeVisible();
      await expect(blue).toBeVisible();
      await expect(gold).toHaveCount(0);

      sql(`delete from public.role_assignments where user_id='${ordinaryAdmin.id}' and role='administrator';`);
      await page.reload();
      await expect(green).toHaveCount(0);
      await expect(blue).toBeVisible();
    } finally {
      sql(`delete from public.role_assignments where user_id='${separateReviewer.id}' and role='administrator';
        delete from private.verification_reviewers where user_id='${separateReviewer.id}';`);
    }
  } finally {
    setSyntheticPolicy(false);
  }
  expect(sql(`select private.platform_founder('${founder.id}')::text || ':' ||
    private.platform_admin('${founder.id}')::text from (select 1) only_row;`)).toBe("true:true");
  sql(`insert into private.account_restrictions(user_id,status,reason)
    values ('${founder.id}','suspended','Disposable Auth containment')
    on conflict(user_id) do update set status=excluded.status,reason=excluded.reason;`);
  expect(sql(`select private.platform_founder('${founder.id}')::text || ':' || private.platform_admin('${founder.id}')::text;`))
    .toBe("true:false");
  await apiCall(founder, "/api/v1/admin/overview", 401);
  sql(`delete from private.account_restrictions where user_id='${founder.id}';`);
});

founderTest("the recognized Founder opens consent without a manual assignment or member application", async ({
  page, makeMember, administrators: { founder },
}) => {
  const member = await makeMember();
  finishPersonalOnboarding(founder);
  await inEnglish(page.context());
  await login(page, founder);
  await solveMfa(page, founder.secret);
  await openAdministration(page);
  const t = founderMessages.en;
  const tab = page.getByRole("button", { name: t.adminTitle, exact: true });
  const panel = page.getByRole("region", { name: t.adminTitle, exact: true });
  await tab.click();
  expect(sql(`select count(*) from private.founder_identity_authorities where actor_id='${founder.id}';`)).toBe("0");
  await expect(panel.getByLabel(t.username)).toBeVisible();
  await expect(panel.getByText(t.openHelp)).toBeVisible();
  await expect(panel.getByText(t.disabled)).toBeVisible();
  expect(sql(`select count(*) from private.verification_applications where applicant_id='${member.id}';`)).toBe("0");
  await panel.getByLabel(t.username).fill(member.handle);
  await panel.getByRole("button", { name: t.open, exact: true }).click();
  await expect(panel.getByText("@" + member.handle + " · " + t.states.consent_pending)).toBeVisible();
  const { cases } = await apiCall(member, ownerPath, 200) as FounderIdentityQueue;
  expect(cases[0]).toMatchObject({ state: "consent_pending", consented: false });
  expect(sql(`select count(*) from private.verification_applications where applicant_id='${member.id}';`)).toBe("0");
});

founderTest("Founder identity hides empty member panels and reports a missing migration only in administration",
  async ({ page, browser, makeMember, administrators: { founder } }) => {
    const member = await makeMember();
    finishPersonalOnboarding(member);
    finishPersonalOnboarding(founder);
    await inEnglish(page.context());
    await login(page, member);
    await expect(page).toHaveURL(/\/dashboard/);

    async function openVerification(current: typeof page, status: number) {
      const response = current.waitForResponse((result) => result.url() === api + ownerPath && result.request().method() === "GET");
      await current.goto("/verification");
      expect((await response).status()).toBe(status);
      await expect(current.getByRole("region", { name: founderMessages.en.title, exact: true })).toHaveCount(0);
      await expect(current.getByText(founderMessages.en.badgeMeaning)).toHaveCount(0);
    }

    await openVerification(page, 200);
    const rpc = "public.founder_identity_read_for_api(uuid,uuid,boolean,bigint,boolean)";
    const workspaceRpc = "public.founder_identity_workspace_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,text,integer,integer,uuid,text,boolean,text)";
    sql(`alter function ${rpc} rename to founder_identity_read_disposable;
      alter function ${workspaceRpc} rename to founder_identity_workspace_disposable;
      notify pgrst, 'reload schema';`);
    try {
      await expect.poll(async () => {
        const response = await fetch(api + ownerPath, { headers: { Authorization: "Bearer " + member.token } });
        return [response.status, (await response.json()).error?.code];
      }).toEqual([503, "FOUNDER_IDENTITY_NOT_DEPLOYED"]);

      await openVerification(page, 503);
      const adminPage = await browser.newPage();
      try {
        await inEnglish(adminPage.context());
        await login(adminPage, founder);
        await solveMfa(adminPage, founder.secret);
        await openVerification(adminPage, 503);
        await openAdministration(adminPage);
        await adminPage.getByRole("button", { name: founderMessages.en.adminTitle, exact: true }).click();
        const tab = adminPage.getByRole("region", { name: founderMessages.en.adminTitle, exact: true });
        await expect(tab.getByRole("status")).toHaveText(founderMessages.en.notDeployed);
        await expect(tab.getByText(founderMessages.en.badgeMeaning)).toHaveCount(0);
      } finally {
        await adminPage.close();
      }
    } finally {
      sql(`alter function ${rpc.replace("founder_identity_read_for_api", "founder_identity_read_disposable")}
        rename to founder_identity_read_for_api;
        alter function ${workspaceRpc.replace("founder_identity_workspace_for_api", "founder_identity_workspace_disposable")}
          rename to founder_identity_workspace_for_api;
        notify pgrst, 'reload schema';`);
      await expect.poll(async () => {
        const response = await fetch(api + ownerPath, { headers: { Authorization: "Bearer " + member.token } });
        return response.status;
      }).toBe(200);
    }
  });

founderTest("Founder grants gold after account confirmation with or without member MFA @smoke",
  async ({ page, makeMember, administrators: { founder, ordinaryAdmin } }) => {
    test.setTimeout(100_000);
    const members = [await makeMember({ visible: true }), await makeMember({ visible: true })];
    const auditSession = (member: Member) => {
      const id: string = JSON.parse(Buffer.from(member.token.split(".")[1], "base64url").toString()).session_id;
      expect(id).toMatch(/^[a-f0-9-]{36}$/);
      return id;
    };
    const adminWorkspace = async (actor: Member) => (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", {
      kind: "admin_workspace",
    })).id as string;
    const [workspace, otherWorkspace] = await Promise.all([adminWorkspace(founder), adminWorkspace(ordinaryAdmin)]);
    async function run(actor: Member, path: string, status: number, body?: object, ref = workspace) {
      const response = await fetch(api + path, {
        method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + actor.token, "X-Ayinou-Workspace": ref,
          ...(body && { "Content-Type": "application/json" }) }, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      expect(response.status, JSON.stringify(data)).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      return data;
    }
    const policy = randomUUID();
    let claimTarget = "";
    const reviewPath = "/api/v1/verification/founder-appeals";
    function proofPolicy(open: boolean) {
      if (!open) {
        sql(`update private.fv_development_policies set stopped_at=clock_timestamp(),stop_approval_ref=gen_random_uuid()
          where id='${policy}';
          delete from private.verification_reviewers where user_id='${ordinaryAdmin.id}';`);
        return;
      }
      sql(`insert into private.fv_development_policies(id,approval_ref,approved_by,case_policy,methods,
        proof_enabled,issuance_enabled,starts_at,expires_at)
        values('${policy}',gen_random_uuid(),'${founder.id}',1,array['in_person_identity_check','live_video_identity_check'],
          true,true,clock_timestamp(),clock_timestamp()+interval '1 hour');
        insert into private.fv_development_members(policy_id,user_id)
          values('${policy}','${members[0].id}'),('${policy}','${members[1].id}');
        insert into private.verification_reviewers(user_id) values('${ordinaryAdmin.id}');`);
    }
    expect((await run(founder, adminPath, 200)).liveProofEnabled).toBe(false);
    await run(ordinaryAdmin, adminPath, 404);
    await run(ordinaryAdmin, adminPath, 403, undefined, otherWorkspace);
    await run(founder, adminPath, 403, { username: founder.handle, requestId: randomUUID(), reason: "member_request" });
    expect(sql(`select count(*) from private.founder_identity_authorities where actor_id='${founder.id}';`)).toBe("0");

    // The closed gates permit a consent request but prohibit receipt creation and actual issuance.
    try {
      for (const [i, target] of members.entries()) {
        const application = !i ? (await apiCall(target, "/api/v1/me/verification", 201, "POST", {
          organizationId: null, kind: "identity", evidence: ["https://example.org/restricted-founder-fixture"],
        })).id as string : null;
        const open = () => run(founder, adminPath, 200, { username: target.handle, requestId: randomUUID(), reason: "member_request" });
        const accept = (path: string, expected: number) => apiCall(target, path, 200, "POST", {
          ...version(expected), action: "consent", disclose: true,
          ...(application && { supersession: { applicationId: application, revision: 1 } }),
        });
        let opened = await open();
        let mine = actionPath(ownerPath, opened.caseId);
        let consent = await accept(mine, opened.version);
        if (!i) {
          await apiCall(target, mine, 409, "POST", { ...version(consent.version), action: "account_control_challenge" });
          proofPolicy(true);
          const outside = await makeMember({ visible: true });
          const outsideOpened = await run(founder, adminPath, 200, {
            username: outside.handle, requestId: randomUUID(), reason: "member_request",
          });
          const outsidePath = actionPath(ownerPath, outsideOpened.caseId);
          const outsideConsent = await apiCall(outside, outsidePath, 200, "POST", {
            ...version(outsideOpened.version), action: "consent", disclose: true,
          });
          await apiCall(outside, outsidePath, 409, "POST", {
            ...version(outsideConsent.version), action: "account_control_challenge",
          });
          expect(sql(`select count(*) from private.founder_identity_controls where case_id='${outsideOpened.caseId}';`)).toBe("0");
          const earlier = await apiCall(target, mine, 200, "POST", {
            ...version(consent.version), action: "account_control_challenge",
          });
          await apiCall(target, mine, 200, "POST", { ...version(consent.version), action: "withdraw" });
          opened = await open();
          mine = actionPath(ownerPath, opened.caseId);
          consent = await accept(mine, opened.version);
          await apiCall(target, mine, 409, "POST", {
            ...version(consent.version), action: "account_control", challenge: earlier.challenge, confirmed: true,
          });
        }
        const issue = actionPath(adminPath, opened.caseId);
        await apiCall(target, mine, 400, "POST", { ...version(consent.version), action: "account_control" });
        const snapshot = i ? await elevate(target) : target;
        if (i) sql(`delete from public.role_assignments where user_id='${target.id}' and role='administrator';`);
        await run(founder, issue, 409, { ...version(consent.version), action: "attest",
          basis: "in_person_identity_check", noConflict: true });
        const begin = () => apiCall(snapshot, mine, 200, "POST", {
          ...version(consent.version), action: "account_control_challenge",
        });
        const complete = (challenge: string) => ({ ...version(consent.version), action: "account_control", challenge, confirmed: true });
        const issued = await begin();
        let receipt: FounderIdentityReceipt;
        if (!i) {
          expect(sql(`select count(*) from auth.mfa_factors where user_id='${target.id}';`)).toBe("0");
          const alternateClient = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data } = await alternateClient.auth.signInWithPassword({ email: target.email, password: target.password });
          expect(data.session).not.toBeNull();
          const otherSession = { ...target, token: data.session!.access_token };
          await apiCall(otherSession, mine, 409, "POST", complete(issued.challenge));
          await apiCall(ordinaryAdmin, mine, 404, "POST", complete(issued.challenge));
          await apiCall(snapshot, actionPath(ownerPath, randomUUID()), 404, "POST", complete(issued.challenge));
          await apiCall(snapshot, mine, 400, "POST", { ...complete(issued.challenge), confirmed: false });
          await apiCall(snapshot, mine, 409, "POST", { ...complete(issued.challenge), expectedVersion: consent.version - 1 });
          const initial = auditSession(snapshot);
          sql(`update private.s2a_session_policy set revoked_at=clock_timestamp() where session_id='${initial}';`);
          await apiCall(snapshot, mine, 401, "POST", complete(issued.challenge));
          sql(`update private.s2a_session_policy set revoked_at=null where session_id='${initial}';
            update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${initial}';`);
          await apiCall(snapshot, mine, 401, "POST", complete(issued.challenge));
          sql(`update auth.sessions set not_after=null where id='${initial}';
            update private.fv_member_challenges set issued_at=clock_timestamp()-interval '2 minutes',
              expires_at=clock_timestamp()-interval '1 minute' where case_id='${opened.caseId}';`);
          await apiCall(snapshot, mine, 409, "POST", complete(issued.challenge));
          finishPersonalOnboarding(target);
          await page.setViewportSize({ width: 320, height: 860 });
          await inEnglish(page.context());
          await login(page, target);
          await expect(page).toHaveURL(/\/dashboard/);
          for (const locale of ["ht", "fr", "es", "en"] as const) {
            await page.context().addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
            await page.goto("/verification");
            const labels = founderMessages[locale];
            const controlButton = page.getByRole("button", { name: labels.actions.account_control, exact: true });
            await expect(controlButton).toBeVisible();
            await controlButton.focus();
            await page.keyboard.press("Enter");
            await expect(page.getByText(labels.liveProof.sessionHelp)).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
          }
          await page.getByRole("checkbox", { name: founderMessages.en.liveProof.sessionDeclaration }).check();
          const confirmed = page.waitForResponse(response => response.url().endsWith(mine) && response.request().method() === "POST");
          const dialog = page.locator("form").filter({ has: page.getByRole("checkbox", { name: founderMessages.en.liveProof.sessionDeclaration }) });
          await dialog.getByRole("button", { name: founderMessages.en.confirm, exact: true }).click();
          const response = await confirmed;
          expect(response.status()).toBe(200);
          receipt = await response.json();
        } else {
          const control = complete(issued.challenge);
          const result = await Promise.all([control, { ...control, requestId: randomUUID() }].map(body => fetch(api + mine, {
            method: "POST", headers: { Authorization: "Bearer " + snapshot.token, "Content-Type": "application/json" }, body: JSON.stringify(body),
          })));
          expect(result.map(response => response.status).sort()).toEqual([200, 409]);
          receipt = await result.find(response => response.ok)!.json();
          await apiCall(snapshot, mine, 409, "POST", { ...control, expectedVersion: receipt.version });
        }
        await run(ordinaryAdmin, issue, 403, { ...version(receipt.version), action: "attest",
          basis: "in_person_identity_check", noConflict: true }, otherWorkspace);
        const attestation = { ...version(receipt.version), action: "attest",
          basis: i ? "live_video_identity_check" : "in_person_identity_check", noConflict: true };
        await run(founder, issue, 400, { ...attestation, basis: "forged_method" });
        const reviewed = await run(founder, issue, 200, attestation);
        expect(await run(founder, issue, 200, attestation)).toEqual(reviewed);
        const grant = decision("grant", reviewed.version, "confirmed");
        await apiCall(founder, issue, 403, "POST", grant);
        await run(founder, issue, 404, grant, otherWorkspace);
        if (!i) {
          const subjectSession = sql(`select subject_session from private.founder_identity_controls where case_id='${opened.caseId}' and case_version=${receipt.version};`);
          sql(`update private.s2a_session_policy set revoked_at=now() where session_id='${subjectSession}';`);
          try { await run(founder, issue, 409, grant); }
          finally { sql(`update private.s2a_session_policy set revoked_at=null where session_id='${subjectSession}';`); }
        }
        await run(ordinaryAdmin, issue, 403, grant, otherWorkspace);
        const granted = await run(founder, issue, 200, grant);
        expect(await run(founder, issue, 200, grant)).toEqual(granted);
        expect((await publicProfile(target)).founderVerified).toBe(true);
        expect(sql(`select private.personal_identity_provenance('${target.id}');`)).toBe("{founder}");
        expect(sql(`select private.project_identity_state('${target.id}') || ':' ||
          private.organization_setup_identity_eligible('${target.id}')::text || ':' ||
          has_table_privilege('authenticated','private.founder_identity_controls','SELECT,INSERT')::text;`)).toBe("required:false:false");
        expect(sql(`select count(*) from public.verification_records where user_id='${target.id}';`)).toBe("0");
        expect(sql(`select count(*) from private.founder_identity_events where case_id='${opened.caseId}'
          and action in ('account_control','attest','grant');`)).toBe("3");
        if (application) {
          expect((await apiCall(snapshot, "/api/v1/me/verification", 200)).applications)
            .toContainEqual(expect.objectContaining({ id: application, status: "closed", closureReason: "superseded_by_founder_verification" }));
          expect(sql(`select count(*) from private.verification_reviews where application_id='${application}';`)).toBe("0");
        }
        finishPersonalOnboarding(target);
        const organization = "/api/v1/me/organization-onboarding";
        const intent = (await apiCall(snapshot, organization, 200, "PUT", {
          id: null, expectedVersion: 0, requestId: randomUUID(), stage: "drafting",
        })).intent;
        const setupPath = organization + "/" + intent.id;
        const draft = i ? { mode: "existing", targetHandle: claimTarget }
          : { mode: "new", name: "Disposable gold owner", handle: "fv-" + randomUUID().slice(0, 12),
              kind: "ngo", countryCode: "HT", registrationStatus: "informal_unregistered" };
        const saved = await apiCall(snapshot, setupPath + "/details", 200, "PUT", {
          expectedVersion: intent.version, requestId: randomUUID(), draft,
        });
        expect((await apiCall(snapshot, organization + "/setup", 200)).eligible).toBe(!i);
        const completion = await apiCall(snapshot, setupPath + "/complete", i ? 403 : 200, "POST", {
          expectedVersion: saved.version, requestId: randomUUID(),
          declaration: { authorityConfirmed: true, declarationVersion: 1 },
        });
        if (!i) {
          expect(completion).toMatchObject({ result: { kind: "created" } });
          claimTarget = sql(`select handle from private.organizations where id='${completion.result.organizationId}';`);
          expect(claimTarget).toMatch(/^fv-/);
          const correction = await apiCall(snapshot, mine, 200, "POST", { ...version(granted.version), action: "correction" });
          const appeals = (await apiCall(snapshot, ownerPath, 200)).cases[0];
          expect(appeals).toMatchObject({ state: "held", appealStatus: "pending" });
          const appeal = appeals.appealRef as string;
          const reviewRef = (await apiCall(ordinaryAdmin, "/api/v1/me/private-workflows", 200, "POST", {
            kind: "verification_workspace",
          })).id as string;
          expect(await run(ordinaryAdmin, reviewPath, 200, undefined, reviewRef)).toEqual([]);
          await run(founder, reviewPath, 404, undefined, workspace);
          expect(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='private' and c.relname in ('fv_development_policies','fv_development_members','fv_founder_appeals','fv_member_challenges')
              and c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'SELECT')
              and not has_table_privilege('service_role',c.oid,'INSERT');`)).toBe("4");
          expect(() => sql(`select private.fv_assign_appeal('${appeal}','${founder.id}',gen_random_uuid());`)).toThrow();
          sql(`select private.fv_assign_appeal('${appeal}','${ordinaryAdmin.id}',gen_random_uuid());`);
          const assigned = await run(ordinaryAdmin, reviewPath, 200, undefined, reviewRef);
          expect(assigned).toEqual([expect.objectContaining({ id: appeal, status: "held" })]);
          expect(JSON.stringify(assigned)).not.toMatch(/subject_session|founder_identity_proofs/);
          await run(founder, issue, 409, decision("release", correction.version, "confirmed"));
          const disposition = { action: "revoke", requestId: randomUUID(), noConflict: true };
          await run(ordinaryAdmin, reviewPath + "/" + appeal, 404, disposition, otherWorkspace);
          const completed = await run(ordinaryAdmin, reviewPath + "/" + appeal, 200, disposition, reviewRef);
          expect(await run(ordinaryAdmin, reviewPath + "/" + appeal, 200, disposition, reviewRef)).toEqual(completed);
          expect((await apiCall(snapshot, ownerPath, 200)).cases[0]).toMatchObject({ state: "revoked", appealStatus: "revoked" });
          expect((await publicProfile(target)).founderVerified).toBeUndefined();
          continue;
        }
        expect(completion.error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
        const held = await run(founder, issue, 200, decision("hold", granted.version, "account_risk"));
        expect((await publicProfile(target)).founderVerified).toBeUndefined();
        expect(sql(`select private.personal_identity_provenance('${target.id}');`)).toBe("{}");
        await run(founder, issue, 200, decision("revoke", held.version, "account_risk"));
      }
      const session = auditSession(founder);
      sql(`update auth.sessions set created_at=clock_timestamp()-interval '6 hours 1 minute' where id='${session}';`);
      await run(founder, adminPath, 401);
      sql(`update auth.sessions set created_at=clock_timestamp() where id='${session}';
        update private.s2a_session_policy set revoked_at=clock_timestamp() where session_id='${session}';`);
      await run(founder, adminPath, 401);
    } finally { proofPolicy(false); }
  });
