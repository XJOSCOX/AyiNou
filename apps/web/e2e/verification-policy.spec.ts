import { randomUUID } from "node:crypto";
import type { RecognitionAdministration, SavedVerificationPolicy, VerificationPolicy } from "@ayinou/shared";
import { verificationCopy } from "../src/lib/verification-policy-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient,
  login, openAdministration, solveMfa, sql, test, totp } from "./fixtures";

const policyPath = "/api/v1/admin/verification-policy";
const recognitionPath = "/api/v1/admin/recognition";
const reason = "Disposable R2.5 recognition and policy audit rehearsal.";
const localized = { en: "Community Service", es: "Servicio comunitario", fr: "Service communautaire", ht: "Sèvis kominotè" };
const details = { name: localized, description: localized, icon: "leaf", color: "#774CB0", awardsEnabled: true, publicEnabled: true };
const identity = { organizationId: null, kind: "identity", evidence: ["https://example.org/identity"] };
const figure = { organizationId: null, kind: "notable_person", evidence: ["https://example.org/figure", "https://example.net/figure"] };

test("R2.5 restricts verification policies and recognition writes, preserving existing cases and member privacy @smoke",
  async ({ makeMember, page, browser }) => {
    test.setTimeout(90_000);
    const [founder, member, other] = await Promise.all([makeMember(), makeMember({ visible: true }), makeMember()]);
    for (const actor of [founder, member, other]) finishPersonalOnboarding(actor);
    sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
      insert into private.platform_admin_audit(subject_id,event,reason)
        values('${founder.id}','first_account_bootstrapped','Disposable Founder provenance');`);
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const secret = await enroll(founder);
    const signIn = await client.auth.signInWithPassword({ email: founder.email, password: founder.password });
    const elevated = await client.auth.mfa.challengeAndVerify({ factorId: (await client.auth.mfa.listFactors()).data!.totp[0].id, code: totp(secret) });
    const actor = { ...founder, token: elevated.data!.access_token };
    const workspace = (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const initial = (await apiCall(member, "/api/v1/me/verification", 201, "POST", identity)).id;

    async function request(path: string, method = "GET", data?: object, token = actor.token, reference = workspace) {
      const response = await fetch(api + path, { method, headers: { Authorization: "Bearer " + token,
        "X-Ayinou-Workspace": reference, ...(data && { "Content-Type": "application/json" }) },
        body: data ? JSON.stringify(data) : undefined });
      return { status: response.status, body: await response.json() };
    }
    async function update(current: SavedVerificationPolicy, changes: Partial<VerificationPolicy>) {
      const input = { value: { ...current.value, ...changes }, expectedRevision: current.revision, requestId: randomUUID(), reason };
      const result = await request(policyPath, "PATCH", input);
      expect(result.status).toBe(200);
      expect(await request(policyPath, "PATCH", input)).toEqual(result);
      return result.body as SavedVerificationPolicy;
    }
    const change = (command: object, requestId = randomUUID(), token = actor.token) =>
      request(recognitionPath, "POST", { command, requestId, reason }, token);

    const recipient = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    await recipient.auth.signInWithPassword({ email: member.email, password: member.password });
    const guest = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const publicBadges = () => guest.rpc("public_recognition_badges", { p_username: member.handle });

    try {
      const defaults = (await request(policyPath)).body as SavedVerificationPolicy;
      expect(Object.values(defaults.value).every(Boolean)).toBe(true);
      expect((await request(policyPath, "GET", undefined, member.token)).status).toBe(403);
      expect((await request(policyPath, "GET", undefined, signIn.data.session!.access_token)).status).toBe(404);
      expect((await request(policyPath, "GET", undefined, actor.token, randomUUID())).status).toBe(404);
      expect((await request("/api/v1/admin/role-assignments")).body.platform).toContainEqual(expect.objectContaining({ role: "founder" }));

      let policy = await update(defaults, { personalIntake: false, organizationIntake: false });
      expect(policy.value.publicFigureIntake).toBe(true);
      expect((await apiCall(other, "/api/v1/me/verification", 409, "POST", identity)).error.code).toBe("POLICY_PAUSED");
      await apiCall(other, "/api/v1/me/verification", 201, "POST", figure);
      expect((await apiCall(member, "/api/v1/me/verification", 200)).applications).toContainEqual(expect.objectContaining({ id: initial, status: "pending" }));
      expect((await request(policyPath, "PATCH", { value: defaults.value, expectedRevision: defaults.revision, requestId: randomUUID(), reason })).status).toBe(409);
      policy = await update(policy, { publicFigureIntake: false, showBlue: false, showGold: false,
        founderBlue: false, founderGold: false, administratorAppointments: false, organizationAssignments: false });
      const blue = "/api/v1/admin/founder-blue-verification/" + initial;
      const evidence = await request(blue);
      expect(evidence.status).toBe(200);
      expect((await request(blue, "POST", { decision: "approve", expectedVersion: evidence.body.revision,
        requestId: randomUUID(), reason, noConflict: true })).body.error.code).toBe("POLICY_PAUSED");
      expect((await request("/api/v1/admin/founder-identity", "POST", {
        username: member.handle, requestId: randomUUID(), reason: "member_request",
      })).body.error.code).toBe("POLICY_PAUSED");
      const organization = sql(`with created as (insert into private.organizations(handle,name,kind,country_code,created_by)
        values('r25-test-organization','Disposable R2.5 organization','nonprofit','HT','${member.id}') returning id)
        select id from created;`);
      expect(organization).toMatch(/^[a-f0-9-]{36}$/);
      sql(`do $$
        begin
          begin
            insert into private.platform_governance_proposals(proposer_id,target_id,kind,governance_version)
            values('${founder.id}','${member.id}','appoint',1);
            raise exception 'administrator appointment was accepted with intake off';
          exception when sqlstate 'RV250' then null; end;
          begin
            insert into private.organization_invitations(organization_id,recipient_id,invited_by,role)
            values('${organization}','${other.id}','${member.id}','editor');
            raise exception 'organization invitation was accepted with intake off';
          exception when sqlstate 'RV250' then null; end;
          begin
            insert into private.verification_applications(applicant_id,organization_id,kind)
            values('${member.id}','${organization}','organization');
            raise exception 'organization application was accepted with intake off';
          exception when sqlstate 'RV250' then null; end;
        end $$;`);
      expect((await apiCall(member, "/api/v1/me/verification", 200)).applications).toContainEqual(expect.objectContaining({ id: initial, status: "pending" }));
      expect((await guest.rpc("verification_presentation")).data).toMatchObject({ showBlue: false, showGold: false, publicFigureIntake: false });
      const audit = await request("/api/v1/admin/audit/policies");
      expect(audit.body.events).toContainEqual(expect.objectContaining({ source: "verification", reason }));

      expect((await change({ action: "create", ...details }, randomUUID(), member.token)).status).toBe(403);
      expect((await change({ action: "create", ...details, name: { ...localized, fr: "Administrateur" } })).status).toBe(400);
      const requestId = randomUUID();
      const created = await change({ action: "create", ...details }, requestId);
      expect(created.status).toBe(200);
      expect(await change({ action: "create", ...details }, requestId)).toEqual(created);
      const badgeId = created.body.badgeId;
      expect((await change({ action: "edit", badgeId, expectedRevision: 1, ...details, publicEnabled: false })).status).toBe(200);
      const award = await change({ action: "award", badgeId, expectedRevision: 2, username: member.handle });
      expect(award.status).toBe(200);
      expect((await change({ action: "award", badgeId, expectedRevision: 2, username: member.handle })).status).toBe(409);
      expect((await publicBadges()).data).toEqual([]);
      expect((await recipient.rpc("set_recognition_visibility", { p_award: award.body.awardId, p_public: true })).data).toBe(true);
      expect((await publicBadges()).data).toEqual([]);
      expect((await change({ action: "edit", badgeId, expectedRevision: 2, ...details })).status).toBe(200);
      expect((await publicBadges()).data).toContainEqual(expect.objectContaining({ id: badgeId }));
      policy = await update(policy, { recognitionPublic: false, recognitionAwards: false });
      expect((await publicBadges()).data).toEqual([]);
      expect((await change({ action: "award", badgeId, expectedRevision: 3, username: other.handle })).status).toBe(409);
      policy = await update(policy, { recognitionPublic: true, recognitionAwards: true });
      expect((await change({ action: "archive", badgeId, expectedRevision: 3 })).status).toBe(200);
      expect((await publicBadges()).data).toEqual([]);
      expect((await change({ action: "award", badgeId, expectedRevision: 4, username: other.handle })).status).toBe(409);
      expect((await change({ action: "reactivate", badgeId, expectedRevision: 4 })).status).toBe(200);
      expect((await publicBadges()).data).toContainEqual(expect.objectContaining({ id: badgeId }));

      const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
      try {
        const viewer = await context.newPage();
        for (const locale of ["en", "fr", "ht", "es"] as const) {
          await context.addCookies([{ name: "ayinou-locale", value: locale, url: `http://127.0.0.1:5400` }]);
          await viewer.emulateMedia({ colorScheme: locale === "fr" || locale === "ht" ? "dark" : "light" });
          await viewer.goto("/members/" + member.handle);
          await expect(viewer.getByText(localized[locale], { exact: false })).toBeVisible();
          expect(await viewer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        }
      } finally { await context.close(); }

      expect((await change({ action: "revoke", awardId: award.body.awardId })).status).toBe(200);
      expect((await publicBadges()).data).toEqual([]);
      const history = (await request(recognitionPath)).body as RecognitionAdministration;
      expect(history.awards).toContainEqual(expect.objectContaining({ id: award.body.awardId, revokedAt: expect.any(String) }));
      expect(history.history.map(({ action }) => action)).toEqual(["revoke", "reactivate", "archive", "edit", "award", "edit", "create"]);
      expect(sql(`select has_table_privilege('authenticated','private.recognition_awards','select');`)).toBe("f");

      await inEnglish(page.context());
      await login(page, founder);
      await solveMfa(page, secret);
      await openAdministration(page);
      await page.getByRole("button", { name: verificationCopy.en.sections.verificationSettings, exact: true }).click();
      await expect(page.getByRole("checkbox", { name: verificationCopy.en.flags.personalIntake })).not.toBeChecked();
      await update(policy, defaults.value);
    } finally {
      sql(`update private.verification_policy set value=private.verification_policy_defaults();
        delete from private.platform_bootstrap where user_id='${founder.id}';`);
    }
  });
