import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, solveMfa, sql, test, totp, type Member } from "./fixtures";
import { governanceMessages } from "../src/lib/governance-i18n";

const corrections = "/api/v1/me/onboarding-corrections";
const setup = "/api/v1/me/organization-onboarding";
const work = "/api/v1/admin/organization-onboarding";
const governance = "/api/v1/admin/governance";
const invitations = "/api/v1/me/governance-invitations";
const reason = "Disposable case with documented independent review.";
const command = (expectedVersion: number) => ({ expectedVersion, requestId: randomUUID(), confirm: true });
const adminAction = (expectedVersion: number, action: string) => ({ ...command(expectedVersion), action, reason });

async function withMfa(member: Member) {
  const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const secret = factor.data!.totp.secret;
  const proof = await client.auth.mfa.challengeAndVerify({ factorId: factor.data!.id, code: totp(secret) });
  expect(proof.error).toBeNull();
  return { ...member, token: proof.data!.access_token, secret };
}

function grantAdmin(member: Member) {
  sql(`insert into public.role_assignments(user_id,role) values ('${member.id}','administrator');`);
}

function reviewed(member: Member, reviewer: Member) {
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${member.id}','identity','verified','review','${reviewer.id}',now());`);
}

const governanceTest = test.extend<{ admins: [Awaited<ReturnType<typeof withMfa>>, Awaited<ReturnType<typeof withMfa>>] }>({
  admins: async ({ makeMember }, provide) => {
    const members = await Promise.all([makeMember(), makeMember()]);
    const admins = await Promise.all(members.map(withMfa));
    admins.forEach(grantAdmin);
    try {
      await provide([admins[0], admins[1]]);
    } finally {
      const ids = admins.map((admin) => `'${admin.id}'`).join(",");
      sql(`insert into private.account_restrictions(user_id,status,reason)
        select id,'suspended','Disposable O5 fixture cleanup' from auth.users where id in (${ids});
        delete from private.platform_bootstrap where user_id in (${ids});
        delete from public.role_assignments where user_id in (${ids});`);
    }
  },
});

async function draft(member: Member) {
  finishPersonalOnboarding(member);
  const { intent } = await apiCall(member, setup, 200, "PUT", { ...command(0), confirm: undefined, id: null, stage: "drafting" });
  const data = { mode: "new", handle: "o5-" + randomUUID().slice(0, 16), name: "Original organization draft",
    kind: "nonprofit", countryCode: "HT", registrationStatus: "informal_unregistered" };
  const saved = await apiCall(member, setup + "/" + intent.id + "/details", 200, "PUT", {
    ...command(intent.version), confirm: undefined, draft: data,
  });
  return { id: intent.id as string, version: saved.version as number, data };
}

function send(member: Member, path: string, body: object) {
  return fetch(api + path, { method: "POST", headers: { Authorization: "Bearer " + member.token, "Content-Type": "application/json" },
    body: JSON.stringify(body) });
}

governanceTest("O5 assisted corrections enforce scoped consent, exact replay and protected dependencies @smoke", async ({ admins, makeMember }) => {
  const [admin, otherAdmin] = admins;
  const [owner, outsider] = await Promise.all([makeMember(), makeMember()]);
  const initial = await draft(owner);
  expect(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and (c.relname='onboarding_corrections' or c.relname like 'platform_governance%' or c.relname='platform_claim_approval_holds')
    and c.relkind='r' and c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'select');`)).toBe("6");
  expect(sql("select has_function_privilege('authenticated','public.o5_correction_command_for_api(uuid,uuid,boolean,bigint,uuid,text,integer,uuid,jsonb)','execute');")).toBe("f");
  const requested = { ...command(initial.version), intentId: initial.id, kind: "details", change: { ...initial.data, name: "Confirmed organization name" } };
  expect((await fetch(api + corrections)).status).toBe(401);
  await apiCall(outsider, corrections, 404, "POST", requested);
  await apiCall(owner, work + "/corrections", 403);
  expect((await apiCall(outsider, corrections, 200)).cases).toEqual([]);
  const unrelated = await makeMember();
  await apiCall(await withMfa(unrelated), work + "/corrections", 403);
  await apiCall(owner, corrections, 400, "POST", { ...requested, confirm: false });
  const open = await apiCall(owner, corrections, 200, "POST", requested);
  expect(await apiCall(owner, corrections, 200, "POST", requested)).toEqual(open);
  await apiCall(owner, corrections, 409, "POST", { ...requested, change: { ...requested.change, name: "Different input" } });
  const previewPath = work + "/" + open.id + "/correction-preview";
  const actionPath = work + "/" + open.id + "/corrections";
  const preview = await apiCall(admin, previewPath, 200);
  expect(preview).toMatchObject({ canAssign: true, canApply: false, currentIntentVersion: initial.version });
  expect(JSON.stringify(preview)).not.toContain(requested.change.name);
  await apiCall(admin, actionPath, 403, "POST", adminAction(open.version, "apply"));
  const assigned = await apiCall(admin, actionPath, 200, "POST", adminAction(open.version, "assign"));
  await apiCall(otherAdmin, actionPath, 404, "POST", adminAction(assigned.version, "apply"));
  await apiCall(admin, actionPath, 409, "POST", adminAction(open.version, "apply"));
  const apply = adminAction(assigned.version, "apply");
  const applied = await apiCall(admin, actionPath, 200, "POST", apply);
  expect(applied.state).toBe("applied");
  expect(await apiCall(admin, actionPath, 200, "POST", apply)).toEqual(applied);
  expect((await apiCall(owner, setup + "/setup", 200)).draft).toEqual(requested.change);

  const next = { ...command(applied.intentVersion), intentId: initial.id, kind: "cancel" };
  const withdrawn = await apiCall(owner, corrections, 200, "POST", next);
  await apiCall(outsider, corrections + "/" + withdrawn.id + "/withdraw", 404, "POST", command(withdrawn.version));
  await apiCall(owner, corrections + "/" + withdrawn.id + "/withdraw", 200, "POST", command(withdrawn.version));
  await apiCall(admin, work + "/" + withdrawn.id + "/corrections", 409, "POST", adminAction(withdrawn.version + 1, "apply"));

  sql(`insert into private.organizations(handle,name,kind,country_code,created_by)
    values ('o5-owned-${randomUUID().slice(0, 8)}','Protected organization','nonprofit','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role,granted_by)
    select id,'${owner.id}','owner','${owner.id}' from private.organizations where created_by='${owner.id}';
    insert into private.community_projects(creator_id,organization_id,submission_key,request_digest)
      select '${owner.id}',id,gen_random_uuid(),sha256('project') from private.organizations where created_by='${owner.id}';
    insert into private.polls(creator_id,request_key,request_digest,scope,kind,policy,audience,eligibility,result_policy,title,description,language,opens_at,closes_at)
      values ('${owner.id}',gen_random_uuid(),sha256('poll'),'individual','community','advisory','members','active','after_close',
        'O5 protected poll','Disposable poll','en',now(),now()+interval '1 day');`);
  const protectedCase = await apiCall(owner, corrections, 200, "POST", { ...next, requestId: randomUUID() });
  const protectedPath = work + "/" + protectedCase.id + "/corrections";
  const assignedProtected = await apiCall(admin, protectedPath, 200, "POST", adminAction(protectedCase.version, "assign"));
  const result = await apiCall(admin, protectedPath, 200, "POST", adminAction(assignedProtected.version, "apply"));
  expect(result).toMatchObject({ state: "protected", intentVersion: applied.intentVersion });
  expect(result.blockers).toEqual(expect.arrayContaining(["ownership", "projects", "polls"]));
  expect((await apiCall(owner, setup + "/setup", 200)).draft).toEqual(requested.change);
  expect(sql(`select count(*) from private.organization_memberships where user_id='${owner.id}' and revoked_at is null;`)).toBe("1");
  expect(sql(`select count(*) from private.platform_governance_events where resource_id='${open.id}' and action='applied';`)).toBe("1");
  expect(sql(`select count(*) from private.community_projects where creator_id='${owner.id}';`)).toBe("1");
  expect(sql(`select count(*) from private.polls where creator_id='${owner.id}';`)).toBe("1");
});

governanceTest("O5 serializes a correction and organization completion against the same revision @smoke", async ({ admins: [admin, reviewer], makeMember }) => {
  const owner = await makeMember();
  const current = await draft(owner);
  reviewed(owner, reviewer);
  const request = await apiCall(owner, corrections, 200, "POST", { ...command(current.version), intentId: current.id, kind: "cancel" });
  const path = work + "/" + request.id + "/corrections";
  const assigned = await apiCall(admin, path, 200, "POST", adminAction(request.version, "assign"));
  const [correction, finished] = await Promise.all([
    send(admin, path, adminAction(assigned.version, "apply")),
    send(owner, setup + "/" + current.id + "/complete", { ...command(current.version), confirm: undefined,
      declaration: { declarationVersion: 1, authorityConfirmed: true } }),
  ]);
  expect([correction.status, finished.status].sort()).toEqual([200, 409]);
  expect(sql(`select count(*) from private.organizations where handle='${current.data.handle}';`)).toBe(finished.ok ? "1" : "0");
});

governanceTest("O5 independent decisions and target acceptance confer no execution or administrator authority @smoke", async ({ admins: [admin, second], makeMember }) => {
  const raw = await makeMember();
  const target = await withMfa(raw);
  reviewed(target, second);
  const state = await apiCall(admin, governance, 200);
  expect(state).toMatchObject({ mode: "bootstrap", executionEnabled: false, recoveryEnabled: false, authorities: [] });
  const make = (kind: string, target: string | null) => ({ ...command(state.version), kind, target, reason });
  await apiCall(admin, governance + "/proposals", 403, "POST", make("appoint", admin.id));
  const direct = await apiCall(admin, "/api/v1/admin/accounts/" + target.id, 409, "PATCH",
    { action: "grant", value: "administrator", reason });
  expect(direct.error.code).toBe("GOVERNANCE_REQUIRED");
  await apiCall(admin, governance + "/proposals", 403, "POST", make("appoint", target.id));
  sql(`insert into private.platform_bootstrap(user_id) values ('${admin.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values ('${admin.id}','first_account_bootstrapped','Disposable O5 founding provenance');`);
  const legacyId = sql(`insert into private.platform_governance_proposals(proposer_id,target_id,kind,governance_version)
    values ('${admin.id}','${target.id}','appoint',${state.version}) returning id;`).split(/\r?\n/)[0];
  const created = (await apiCall(admin, governance, 200)).proposals.find((item: { id: string }) => item.id === legacyId);
  expect(created).toMatchObject({ state: "pending", accepted: false });
  expect(created.authorizationMode).toBeUndefined();
  const path = governance + "/proposals/" + created.id + "/actions";
  const approval = { ...adminAction(created.version, "approve"), noConflict: true };
  await apiCall(admin, path, 403, "POST", approval);
  await apiCall(target, path, 403, "POST", approval);
  await apiCall(second, path, 400, "POST", { ...approval, noConflict: false });
  const approved = await apiCall(second, path, 200, "POST", approval);
  expect(approved.state).toBe("awaiting_acceptance");
  expect(await apiCall(second, path, 200, "POST", approval)).toEqual(approved);
  expect((await apiCall(target, invitations, 200)).proposals).toEqual([expect.objectContaining({ id: created.id })]);
  expect((await apiCall(admin, invitations, 200)).proposals).toEqual([]);
  const acceptPath = invitations + "/" + created.id + "/accept";
  await apiCall(raw, acceptPath, 401, "POST", command(approved.version));
  const accepted = await apiCall(target, acceptPath, 200, "POST", command(approved.version));
  expect(accepted).toMatchObject({ state: "execution_closed", accepted: true });
  await apiCall(admin, path, 403, "POST", adminAction(accepted.version, "execute"));
  expect(sql(`select count(*) from public.role_assignments where user_id='${target.id}' and role='administrator';`)).toBe("0");
  expect(sql(`select count(*) from private.platform_governance_events where resource_id='${created.id}' and action in ('approve','accept');`)).toBe("2");
  const transition = await apiCall(admin, governance + "/proposals", 200, "POST", make("distributed", null));
  sql(`update private.platform_governance_proposals set expires_at=created_at+interval '1 millisecond' where id='${transition.id}';`);
  await apiCall(second, governance + "/proposals/" + transition.id + "/actions", 409, "POST",
    { ...adminAction(transition.version, "approve"), noConflict: true });
  const distributed = await apiCall(admin, governance + "/proposals", 200, "POST", make("distributed", null));
  const change = governance + "/proposals/" + distributed.id + "/actions";
  const approveChange = { ...adminAction(distributed.version, "approve"), noConflict: true };
  const decision = await apiCall(second, change, 200, "POST", approveChange);
  expect(await apiCall(second, change, 200, "POST", approveChange)).toEqual(decision);
  sql(`insert into private.platform_governance_authorities(user_id,scope,approval_ref,expires_at)
    values ('${admin.id}','governance_transition',gen_random_uuid(),now()+interval '1 hour');`);
  const denied = await apiCall(admin, change, 409, "POST", adminAction(decision.version, "execute"));
  expect(denied.error.code).toBe("GOVERNANCE_REQUIRED");
  expect((await apiCall(admin, governance, 200)).mode).toBe("bootstrap");
  sql(`delete from public.role_assignments where user_id='${second.id}' and role='administrator';`);
  await apiCall(second, governance, 403);
  sql(`do $$ begin delete from auth.mfa_factors where user_id='${admin.id}'; raise exception 'last MFA deletion succeeded';
    exception when sqlstate '55000' then null; end $$;`);
});

governanceTest("O5 governance controls remain accessible on narrow screens in four languages @smoke", async ({ admins: [admin], context, page }) => {
  finishPersonalOnboarding(admin);
  await inEnglish(context);
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, admin);
  await solveMfa(page, admin.secret);
  await page.goto("/admin");
  const select = page.getByRole("banner").getByRole("combobox").last();
  for (const locale of ["en", "ht", "fr", "es"] as const) {
    await select.selectOption(locale);
    const message = governanceMessages[locale];
    const tab = page.getByRole("button", { name: message.governance, exact: true });
    await expect(tab).toBeVisible();
    if (await tab.getAttribute("aria-pressed") !== "true") {
      await tab.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.getByText(message.closed)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

governanceTest("O5 confines claim triage and emergency holds to the existing independent review @smoke", async ({ admins: [admin, reviewer], makeMember }) => {
  const [owner, claimant, reporter, second] = await Promise.all([makeMember(), makeMember(), makeMember(), makeMember()]);
  const voter = await withMfa(second);
  finishPersonalOnboarding(claimant);
  reviewed(claimant, reviewer);
  const organization = randomUUID();
  const targetHandle = "o5-claim-" + randomUUID().slice(0, 8);
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${organization}','${targetHandle}','O5 claim organization','ngo','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${organization}','${owner.id}','owner');
    insert into private.verification_reviewers(user_id) values ('${reviewer.id}'),('${voter.id}');`);
  const { intent } = await apiCall(claimant, setup, 200, "PUT", { expectedVersion: 0, requestId: randomUUID(), id: null, stage: "drafting" });
  const draft = await apiCall(claimant, setup + "/" + intent.id + "/details", 200, "PUT",
    { expectedVersion: intent.version, requestId: randomUUID(), draft: { mode: "existing", targetHandle } });
  const claim = await apiCall(claimant, setup + "/" + intent.id + "/complete", 200, "POST", {
    expectedVersion: draft.version, requestId: randomUUID(), declaration: { declarationVersion: 1, authorityConfirmed: true,
      evidence: ["https://example.org/o5-claim-authority", "https://example.net/o5-evidence"] },
  });
  const application = claim.result.applicationId;
  const own = await apiCall(claimant, corrections, 200);
  const request = await apiCall(claimant, corrections, 200, "POST",
    { ...command(own.claimIntent.version), intentId: own.claimIntent.id, kind: "claim_triage" });
  const path = work + "/" + request.id;
  const preview = await apiCall(admin, path + "/correction-preview", 200);
  expect(preview.triage).toContain("reviewer_needed");
  expect(JSON.stringify(preview)).not.toContain("o5-evidence");
  const assigned = await apiCall(admin, path + "/corrections", 200, "POST", adminAction(request.version, "assign"));
  const triage = await apiCall(admin, path + "/corrections", 200, "POST", adminAction(assigned.version, "apply"));
  expect(triage.state).toBe("protected");

  const recordReport = (outcome: "pending" | "substantiated") => {
    const report = randomUUID();
    sql(`insert into private.impersonation_reports(id,reporter_id,organization_id,kind,explanation,reference_urls,outcome,rationale,decided_at)
      values ('${report}','${reporter.id}','${organization}','institution','Disposable test report','{}','${outcome}',
        ${outcome === "pending" ? "null,null" : "'Synthetic substantiation',now()"});`);
    return report;
  };
  const holdPath = governance + "/claim-holds/";
  const place = (reportId: string) => ({ ...adminAction(0, "place"), noConflict: true, reportId });
  await apiCall(admin, holdPath + application, 404, "POST", place(recordReport("pending")));
  const placement = place(recordReport("substantiated"));
  const hold = await apiCall(admin, holdPath + application, 200, "POST", placement);
  expect(await apiCall(admin, holdPath + application, 200, "POST", placement)).toEqual(hold);
  expect((await apiCall(claimant, corrections, 200)).holdUntil).toBe(hold.expiresAt);
  expect((await apiCall(reporter, corrections, 200)).holdUntil).toBeNull();
  const release = { ...adminAction(hold.version, "release"), noConflict: true };
  await apiCall(admin, holdPath + hold.id, 403, "POST", release);
  sql(`select public.verification_work_for_api('${reviewer.id}','${application}',true);
    select public.verification_work_for_api('${voter.id}','${application}',true);`);
  const decide = (actor: Member) => send(actor, "/api/v1/verification/review/" + application, {
    decision: "approve", rationale: "Disposable reviewed evidence", conflictFree: true,
  });
  const held = await Promise.all([decide(reviewer), decide(voter)]);
  expect(held.map((response) => response.status)).toEqual([409, 409]);
  for (const response of held) expect((await response.json()).error.code).toBe("CLAIM_APPROVAL_HELD");
  expect(sql(`select user_id from private.organization_memberships where organization_id='${organization}' and revoked_at is null;`)).toBe(owner.id);
  expect((await apiCall(reviewer, holdPath + hold.id, 200, "POST", release)).state).toBe("released");

  const expiring = await apiCall(admin, holdPath + application, 200, "POST", place(recordReport("substantiated")));
  sql(`update private.platform_claim_approval_holds set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='${expiring.id}';`);
  expect((await apiCall(claimant, corrections, 200)).holdUntil).toBeNull();
  const decisions = await Promise.all([decide(reviewer), decide(voter)]);
  expect(decisions.map((response) => response.status)).toEqual([200, 200]);
  expect((await Promise.all(decisions.map(async (response) => (await response.json()).status))).sort()).toEqual(["approved", "pending"]);
  expect(sql(`select user_id from private.organization_memberships where organization_id='${organization}' and revoked_at is null;`)).toBe(claimant.id);
});
