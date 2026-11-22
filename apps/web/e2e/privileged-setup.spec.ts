import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, openAdministration, solveMfa, sql, test, totp, type Member } from "./fixtures";
import { privilegedSetupMessages } from "../src/lib/privileged-setup-i18n";
import { governanceMessages } from "../src/lib/governance-i18n";

const supabase = "http://127.0.0.1:55321";
const governance = "/api/v1/admin/governance";
const reason = "Disposable appointment with a recorded Founder decision.";

async function prepareFounder(email: string, handle: string) {
  const key = process.env.AYINOU_E2E_SUPABASE_SECRET;
  if (!key || process.env.AYINOU_E2E_SUPABASE_URL !== supabase) throw new Error("Disposable Supabase is required");
  const directory = await mkdtemp(join(tmpdir(), "ayinou-f1-e2e-"));
  const destination = join(directory, "setup.txt");
  try {
    const output = execFileSync(process.execPath, ["scripts/prepare-founder-registration.mjs", destination], {
      encoding: "utf8", env: { ...process.env, AYINOU_FOUNDER_BOOTSTRAP_ENABLED: "true",
        AYINOU_FOUNDER_EMAIL: email, AYINOU_FOUNDER_USERNAME: handle, SUPABASE_URL: supabase, SUPABASE_SECRET_KEY: key },
    });
    const [url, secret] = (await readFile(destination, "utf8")).trim().split("\n");
    expect(url).toMatch(/^\/setup\/f\/[a-f0-9-]{36}$/);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output).not.toContain(secret);
    return { url, secret, key: url.split("/").at(-1)! };
  } finally {
    await rm(destination, { force: true });
    await rmdir(directory);
  }
}
const revise = (expectedVersion: number) => ({ expectedVersion, confirm: true, requestId: randomUUID() });
async function recent(member: Member) {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  if (factor.error) throw factor.error;
  const proof = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id, code: totp(factor.data.totp.secret),
  });
  if (proof.error) throw proof.error;
  return { ...member, token: proof.data.access_token, mfaSecret: factor.data.totp.secret };
}

async function authenticateAgain(member: Member & { mfaSecret: string }): Promise<Member> {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  if (signed.error) throw signed.error;
  const listed = await client.auth.mfa.listFactors();
  if (listed.error) throw listed.error;
  const proof = await client.auth.mfa.challengeAndVerify({ factorId: listed.data.totp[0].id, code: totp(member.mfaSecret) });
  if (proof.error) throw proof.error;
  return { ...member, token: proof.data.access_token };
}

test("F1.1 clean installation appoints the first Administrator through the Founder and the named member @smoke",
  async ({ page, context, makeMember }) => {
    test.setTimeout(100_000);
    const handle = "private_" + randomUUID().slice(0, 8);
    const email = handle + "@example.com";
    const password = "Disposable-founder!92";
    const { key, url, secret } = await prepareFounder(email, handle);
    const endpoint = "/api/v1/setup/founder/" + key;
    const t = privilegedSetupMessages.en;
    const provisioned = [await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    const [reviewer, candidate, outsider, secondTarget] = await Promise.all(provisioned.map(recent));
    let founderId: string | undefined;
    try {
      expect(sql(`select has_table_privilege('authenticated','private.f1_appointment','select')::text;`)).toBe("false");
      sql(`update private.founder_registration set expires_at=now()-interval '1 minute' where singleton;`);
      await apiCall(outsider, endpoint, 404, "POST", { action: "unlock", secret });
      sql(`update private.founder_registration set expires_at=now()+interval '30 minutes' where singleton;`);
      await page.goto(url);
      for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440]] as const) {
        await context.addCookies([{ name: "ayinou-locale", value: locale, url: new URL(url, page.url()).origin }]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        const input = page.getByLabel(privilegedSetupMessages[locale].secret);
        await input.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: privilegedSetupMessages[locale].unlock })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await inEnglish(context);
      await page.goto(url);
      await expect(page.getByLabel(t.password, { exact: true })).toHaveCount(0);
      await page.getByLabel(t.secret).fill(randomBytes(32).toString("base64url"));
      await page.getByRole("button", { name: t.unlock }).click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(t.failed);
      await page.getByLabel(t.secret).fill(secret);
      await page.getByRole("button", { name: t.unlock }).click();
      await expect(page.getByLabel(t.password, { exact: true })).toBeVisible();
      expect((await fetch(api + endpoint)).status).toBe(404);
      const temporary = (await context.cookies()).find((cookie) => cookie.name === "ayinou-f1-" + key);
      expect(temporary?.httpOnly).toBe(true);
      await page.getByLabel(t.password, { exact: true }).fill(password);
      await page.getByLabel(t.confirmPassword, { exact: true }).fill(password);
      await page.getByRole("button", { name: t.register }).click();
      await expect(page.getByRole("status").filter({ hasText: t.email })).toBeVisible();
      expect(sql(`select (email_confirmed_at is null)::text from auth.users where email='${email}';`)).toBe("true");
      let mail = "";
      await expect.poll(async () => {
        const response = await fetch("http://127.0.0.1:55324/api/v1/messages");
        const data = await response.json();
        mail = data.messages.find((item: { To: { Address: string }[] }) =>
          item.To.some((address) => address.Address === email))?.ID ?? "";
        return !!mail;
      }).toBe(true);
      const message = await (await fetch("http://127.0.0.1:55324/api/v1/message/" + mail)).json();
      const confirmation = new URL(String(message.Text).match(/https?:\/\/[^\s<(]+\/auth\/v1\/verify\?[^\s)>]+/)![0]);
      expect(confirmation.origin).toBe(supabase);
      await page.goto(confirmation.href);
      await expect(page).toHaveURL(new RegExp(url + "$"));
      founderId = sql(`select id from auth.users where email='${email}';`);
      expect(founderId).toMatch(/^[a-f0-9-]{36}$/);
      const leader = await recent({ id: founderId, email, password, handle, token: "" });
      await apiCall(outsider, endpoint, 404, "POST", { action: "claim", authorization: temporary!.value });
      await apiCall(leader, endpoint, 200, "POST", { action: "claim", authorization: temporary!.value });
      await apiCall(leader, endpoint, 404, "POST", { action: "claim", authorization: temporary!.value });
      expect(sql(`select username from public.profiles where user_id='${founderId}';`)).toBe(handle);
      expect((await apiCall(leader, "/api/v1/me/platform-access", 200)).founder).toBe(true);

      sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
          values ('${candidate.id}','identity','verified','review','${reviewer.id}',now()),
                 ('${secondTarget.id}','identity','verified','review','${reviewer.id}',now());`);
      const { version, administrators } = await apiCall(leader, governance, 200);
      expect(administrators).toEqual([expect.objectContaining({ id: leader.id, founding: true })]);
      const propose = (target: string) => apiCall(leader, governance + "/proposals", 200, "POST",
        { ...revise(version), kind: "appoint", target, reason });
      const proposal = await propose(candidate.id);
      expect(proposal).toMatchObject({ authorizationMode: "founder_direct", state: "awaiting_acceptance", accepted: false });
      const createPath = "/api/v1/admin/appointments/" + proposal.id + "/invitation";
      await apiCall(reviewer, createPath, 404, "POST");
      const issued = await apiCall(leader, createPath, 200, "POST");
      const invitation = "/api/v1/administrator-activation/" + issued.flowId;
      expect(issued.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      await apiCall(outsider, invitation, 404);
      expect(await apiCall(candidate, invitation, 200)).toMatchObject({ ready: true, authorizationMode: "founder_direct" });
      const approve = { ...revise(proposal.version), action: "approve", reason, noConflict: true };
      await apiCall(leader, governance + "/proposals/" + proposal.id + "/actions", 403, "POST", approve);
      await apiCall(candidate, "/api/v1/me/governance-invitations/" + proposal.id + "/accept", 403, "POST", revise(proposal.version));
      await apiCall(candidate, invitation, 400, "POST", { code: issued.code, accept: false });
      await apiCall(provisioned[1], invitation, 404, "POST", { code: issued.code, accept: true });
      expect((await apiCall(candidate, "/api/v1/me/platform-access", 200)).administrator).toBe(false);
      const accept = { code: issued.code, accept: true };
      await apiCall(candidate, invitation, 404, "POST", { ...accept, code: randomBytes(32).toString("base64url") });
      await apiCall(outsider, invitation, 404, "POST", accept);
      const privatePage = "/activate/a/" + issued.flowId;
      await context.clearCookies();
      await inEnglish(context);
      await page.goto(privatePage);
      await expect(page.getByRole("heading", { name: t.unavailable })).toBeVisible();
      finishPersonalOnboarding(candidate);
      await login(page, candidate);
      await solveMfa(page, candidate.mfaSecret);
      for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440], ["en", 1440]] as const) {
        await context.addCookies([{ name: "ayinou-locale", value: locale, url: new URL(page.url()).origin }]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(privatePage);
        await expect(page.getByText(governanceMessages[locale].founderAuthorized, { exact: true })).toBeVisible();
        await page.getByLabel(privilegedSetupMessages[locale].secret).focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("checkbox", { name: privilegedSetupMessages[locale].accept })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      const outcomes = await Promise.all([0, 1].map(() => fetch(api + invitation, {
        method: "POST", headers: { Authorization: "Bearer " + candidate.token, "Content-Type": "application/json" },
        body: JSON.stringify(accept),
      })));
      const statuses = outcomes.map((response) => response.status).sort();
      expect([[200, 401], [200, 404]]).toContainEqual(statuses);
      await apiCall(candidate, "/api/v1/me/platform-access", 401);
      await apiCall(candidate, invitation, 404, "POST", accept);
      const administrator = await authenticateAgain(candidate);
      await apiCall(administrator, invitation, 404, "POST", accept);
      expect((await apiCall(administrator, "/api/v1/me/platform-access", 200))).toMatchObject({ administrator: true, founder: false });
      expect(await apiCall(administrator, invitation, 200)).toMatchObject({ ready: false, state: "activated" });
      await page.reload();
      await expect(page).toHaveURL(/\/login\?session=ended/);
      await login(page, candidate);
      await solveMfa(page, candidate.mfaSecret);
      await page.goto(privatePage);
      await expect(page.getByText(governanceMessages.en.activated, { exact: true })).toBeVisible();
      await openAdministration(page);
      await expect(page.locator("header [data-designation=administrator]").first()).toBeVisible();
      expect(sql(`select count(*) from private.f1_events where workflow='${issued.flowId}' and event in ('accepted','activated');`)).toBe("2");
      expect(sql(`select count(*) from private.platform_governance_events grant_event
        join private.platform_governance_events decision_receipt on decision_receipt.id=(grant_event.outcome->>'authorizationReceiptId')::uuid
        join private.platform_governance_proposals proposal on proposal.id=grant_event.resource_id
        join private.f1_appointment invitation on invitation.proposal_id=proposal.id
        join public.role_assignments role on role.user_id=invitation.target_id and role.role='administrator'
        join private.platform_admin_audit audit on audit.subject_id=role.user_id and audit.event='role_granted'
        where proposal.id='${proposal.id}' and grant_event.action='activate' and grant_event.version=proposal.version
          and grant_event.actor_id=invitation.target_id and grant_event.outcome->>'invitationId'=invitation.id::text
          and decision_receipt.actor_id=invitation.founder_id and audit.reason=decision_receipt.reason
          and proposal.approver_id is null and proposal.approved_at is null and invitation.code_hash is null;`)).toBe("1");
      await apiCall(administrator, "/api/v1/admin/overview", 200);
      expect(sql(`select count(*) > 0 from private.s2a_session_events where user_id='${candidate.id}' and event='privileged_mfa';`)).toBe("t");
      expect(sql(`select count(*) from private.s2a_session_events where user_id='${candidate.id}' and event='promotion';`)).toBe("1");
      await apiCall(administrator, governance + "/proposals", 403, "POST",
        { ...revise(version), kind: "appoint", target: secondTarget.id, reason });

      const another = await propose(secondTarget.id);
      const revoke = "/api/v1/admin/appointments/" + another.id + "/invitation";
      const pending = await apiCall(leader, revoke, 200, "POST");
      await apiCall(leader, revoke, 200, "DELETE");
      expect(await apiCall(secondTarget, "/api/v1/administrator-activation/" + pending.flowId, 200)).toMatchObject({ state: "unavailable" });
      await apiCall(secondTarget, "/api/v1/administrator-activation/" + pending.flowId, 404, "POST", { code: pending.code, accept: true });
      sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
        values ('${outsider.id}','identity','verified','review','${reviewer.id}',now());`);
      const expiring = await propose(outsider.id);
      const expiringIssue = await apiCall(leader, "/api/v1/admin/appointments/" + expiring.id + "/invitation", 200, "POST");
      sql(`update private.f1_appointment set expires_at=now()-interval '1 minute' where id='${expiringIssue.flowId}';`);
      await apiCall(outsider, "/api/v1/administrator-activation/" + expiringIssue.flowId, 404, "POST",
        { code: expiringIssue.code, accept: true });
      expect(await apiCall(outsider, "/api/v1/administrator-activation/" + expiringIssue.flowId, 200)).toMatchObject({ state: "expired" });
      expect(sql(`select count(*) from private.f1_events where workflow='${expiringIssue.flowId}' and event='expired';`)).toBe("1");
    } finally {
      sql(`delete from private.f1_founder_flow where id='${key}';
        delete from private.founder_registration where reserved_username='${handle}';
        ${founderId && /^[a-f0-9-]{36}$/.test(founderId) ? "delete from private.platform_bootstrap where user_id='" + founderId + "';" : ""}
        delete from public.role_assignments where user_id in ('${reviewer.id}','${candidate.id}') and role='administrator';`);
    }
  });

test("F1.1 keeps legacy approval and fails closed on authority or eligibility changes @smoke", async ({ makeMember }) => {
  test.setTimeout(100_000);
  const raw = await Promise.all(Array.from({ length: 6 }, () => makeMember()));
  const [leader, admin, moderator, candidate, legacyTarget, blocked] = await Promise.all(raw.map(recent));
  sql(`insert into private.platform_bootstrap(user_id) values ('${leader.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values ('${leader.id}','first_account_bootstrapped','Disposable F1.1 trusted Founder');
    insert into public.role_assignments(user_id,role) values ('${admin.id}','administrator'),('${moderator.id}','moderator');
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values ('${candidate.id}','identity','verified','review','${admin.id}',now()),
             ('${legacyTarget.id}','identity','verified','review','${admin.id}',now()),
             ('${blocked.id}','identity','verified','review','${admin.id}',now());`);
  try {
    const { version } = await apiCall(leader, governance, 200);
    const proposePath = governance + "/proposals";
    const proposalBody = (target: string) => ({ ...revise(version), kind: "appoint", target, reason });
    for (const actor of [admin, moderator, candidate]) {
      await apiCall(actor, proposePath, 403, "POST", proposalBody(actor.id));
    }
    await apiCall(admin, "/api/v1/admin/accounts/" + candidate.id, 400, "PATCH", { action: "grant", value: "founder", reason });
    await apiCall(leader, proposePath, 403, "POST", proposalBody(leader.id));
    await apiCall(leader, proposePath, 400, "POST", { ...proposalBody(candidate.id), authorizationMode: "founder_direct" });
    const send = (path: string, body?: object) => fetch(api + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + leader.token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const body = proposalBody(candidate.id);
    const requests = [body, proposalBody(candidate.id)];
    const competing = await Promise.all(requests.map((request) => send(proposePath, request)));
    expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);
    const proposal = await competing.find((response) => response.ok)!.json();
    expect(await apiCall(leader, proposePath, 200, "POST", requests[competing.findIndex((response) => response.ok)])).toEqual(proposal);
    const issuePath = "/api/v1/admin/appointments/" + proposal.id + "/invitation";
    const issues = await Promise.all([send(issuePath), send(issuePath)]);
    expect(issues.map((response) => response.status).sort()).toEqual([200, 404]);
    const issued = await issues.find((response) => response.ok)!.json();
    const activation = "/api/v1/administrator-activation/" + issued.flowId;
    const claims = JSON.parse(Buffer.from(candidate.token.split(".")[1], "base64url").toString());
    expect(() => sql(`select public.f1_appointment_for_api('${candidate.id}','${claims.session_id}',true,
      extract(epoch from now())::bigint-901,'${issued.flowId}','activate',null);`)).toThrow();
    await apiCall(candidate, activation, 200, "POST", { code: issued.code, accept: true });
    await apiCall(admin, "/api/v1/admin/overview", 200);
    await apiCall(candidate, "/api/v1/admin/overview", 401);
    const promoted = await authenticateAgain(candidate);
    await apiCall(promoted, "/api/v1/admin/overview", 200);
    await apiCall(promoted, "/api/v1/admin/founder-identity", 403);
    await apiCall(promoted, "/api/v1/admin/privacy-requests/queue", 403);
    sql(`delete from public.role_assignments where user_id='${candidate.id}' and role='administrator';`);
    await apiCall(promoted, "/api/v1/admin/overview", 403);

    const legacy = randomUUID();
    sql(`insert into private.platform_governance_proposals(id,proposer_id,target_id,kind,governance_version)
      values ('${legacy}','${leader.id}','${legacyTarget.id}','appoint',${version});
      insert into private.platform_governance_events(scope,resource_id,actor_id,subject_id,action,version,reason,outcome)
      values ('proposal','${legacy}','${leader.id}','${legacyTarget.id}','propose',1,'${reason}','{}');`);
    const oldIssue = await apiCall(leader, "/api/v1/admin/appointments/" + legacy + "/invitation", 200, "POST");
    const oldActivation = "/api/v1/administrator-activation/" + oldIssue.flowId;
    expect(await apiCall(legacyTarget, oldActivation, 200)).toEqual({ ready: false });
    await apiCall(legacyTarget, oldActivation, 404, "POST", { code: oldIssue.code, accept: true });
    await apiCall(admin, governance + "/proposals/" + legacy + "/actions", 200, "POST",
      { ...revise(1), action: "approve", noConflict: true, reason });
    expect(await apiCall(legacyTarget, oldActivation, 200)).toEqual({ ready: true });
    await apiCall(legacyTarget, oldActivation, 200, "POST", { code: oldIssue.code, accept: true });

    const outstanding = await apiCall(leader, proposePath, 200, "POST", proposalBody(blocked.id));
    const invitation = await apiCall(leader, "/api/v1/admin/appointments/" + outstanding.id + "/invitation", 200, "POST");
    const endpoint = "/api/v1/administrator-activation/" + invitation.flowId;
    const consent = { code: invitation.code, accept: true };
    sql(`update public.verification_records set status='revoked',verified_at=null where user_id='${blocked.id}' and verification_type='identity';`);
    await apiCall(blocked, endpoint, 404, "POST", consent);
    sql(`update public.verification_records set status='verified',verified_at=now() where user_id='${blocked.id}' and verification_type='identity';
      insert into private.account_restrictions(user_id,status,reason) values ('${leader.id}','suspended','Disposable Founder suspension');`);
    await apiCall(leader, proposePath, 401, "POST", proposalBody(blocked.id));
    expect(await apiCall(blocked, endpoint, 200)).toMatchObject({ ready: false, state: "unavailable" });
    await apiCall(blocked, endpoint, 404, "POST", consent);
    expect((await apiCall(blocked, "/api/v1/me/platform-access", 200)).administrator).toBe(false);
    expect(sql(`select count(*) from private.f1_events where workflow='${invitation.flowId}' and event in ('accepted','activated');`)).toBe("0");
    expect(sql("select private.founder_identity_policy_open();")).toBe("f");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${leader.id}';
      delete from public.role_assignments where user_id in ('${admin.id}','${moderator.id}','${candidate.id}','${legacyTarget.id}');`);
  }
});
