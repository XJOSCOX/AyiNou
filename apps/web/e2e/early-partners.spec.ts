import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, openAdministration, solveMfa, sql, test, totp, type Member } from "./fixtures";
import { earlyPartnerMessages } from "../src/lib/early-partner-i18n";
import { messages } from "../src/lib/i18n";

const adminPath = "/api/v1/admin/early-partners";
const orgPath = (id: string) => "/api/v1/institutions/" + id + "/early-partner";
const reason = "Synthetic pilot eligibility review.";
const digest = "8".repeat(64);
const command = (expectedVersion: number, action: string) => ({ expectedVersion, action, requestId: randomUUID(), confirm: true });
const review = (enrollmentId: string, version: number, action: string) => ({ ...command(version, action), enrollmentId, reason });

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

function program(first: Member, second: Member, synthetic = true, capacity = 2) {
  const id = randomUUID();
  sql(`insert into private.early_partner_programs(id,slug,version,title,purpose,terms_version,terms_digest,eligible_kinds,features,
    capacity,starts_at,ends_at,provisioned_by,approval_reference,synthetic)
    values ('${id}','pilot-${id}',1,'Synthetic onboarding pilot','Practice onboarding and feedback with fictional data.',1,'${digest}',
      '{nonprofit,ngo}','{pilot_feedback,guided_onboarding}',${capacity},now()-interval '1 hour',now()+interval '2 days',
      '${first.id}',gen_random_uuid(),${synthetic});
    insert into private.early_partner_operators(program_id,user_id,scope,granted_by,approval_reference,expires_at) values
    ('${id}','${first.id}','nominate','${second.id}',gen_random_uuid(),now()+interval '1 day'),
    ('${id}','${first.id}','review','${second.id}',gen_random_uuid(),now()+interval '1 day'),
    ('${id}','${second.id}','review','${first.id}',gen_random_uuid(),now()+interval '1 day');`);
  return id;
}

function syntheticGate(ids: string[]) {
  sql(`create or replace function private.early_partner_synthetic_gate(p_program uuid) returns boolean
    language sql stable set search_path='' as $$ select p_program=any(array[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]) $$;`);
}

function institute(owner: Member, kind = "nonprofit") {
  const id = randomUUID();
  const handle = "o6-" + id.slice(0, 12);
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${id}','${handle}','Pilot fixture organization','${kind}','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${id}','${owner.id}','owner');`);
  return { id, handle };
}

function send(who: Member, path: string, input: object) {
  return fetch(api + path, { method: "POST", headers: { Authorization: "Bearer " + who.token, "Content-Type": "application/json" },
    body: JSON.stringify(input), signal: AbortSignal.timeout(12_000) });
}

type Admin = Awaited<ReturnType<typeof withMfa>>;
const pilotTest = test.extend<{ operators: [Admin, Admin] }>({
  operators: async ({ makeMember }, provide) => {
    const [a, b] = await Promise.all([makeMember(), makeMember()]);
    try {
      const [first, second] = await Promise.all([withMfa(a), withMfa(b)]);
      sql(`insert into public.role_assignments(user_id,role) values ('${first.id}','administrator'),('${second.id}','administrator');`);
      await provide([first, second]);
    } finally {
      syntheticGate([]);
      sql(`insert into private.account_restrictions(user_id,status,reason) values
        ('${a.id}','suspended','Disposable O6 operator retirement'),('${b.id}','suspended','Disposable O6 operator retirement');
        delete from public.role_assignments where user_id in ('${a.id}','${b.id}') and role='administrator';`);
    }
  },
});

const nominate = (programId: string, organizationId: string) => ({ ...command(1, "nominate"), programId, organizationId, reason });
const accept = (enrollmentId: string, version: number) => ({ ...command(version, "accept"), enrollmentId, termsVersion: 1, termsDigest: digest });

pilotTest("O6 enforces the synthetic gate, independent review, live owner consent and scoped feedback @smoke",
  async ({ operators: [first, second], makeMember, page, context }) => {
    test.setTimeout(75_000);
    const [ownerAccount, delegateAccount, outsider, unaffiliatedAdmin] = await Promise.all([makeMember(), makeMember(), makeMember(), makeMember()]);
    const owner = await withMfa(ownerAccount);
    const delegate = await withMfa(delegateAccount);
    const org = institute(owner);
    const other = institute(outsider);
    const government = institute(outsider, "ministry");
    const currentProgram = program(first, second, true, 1);
    const realProgram = program(first, second, false);
    sql(`insert into private.organization_memberships(organization_id,user_id,role)
      values ('${org.id}','${delegate.id}','administrator');`);
    const unscoped = await withMfa(unaffiliatedAdmin);
    sql(`insert into public.role_assignments(user_id,role) values ('${unscoped.id}','administrator');`);
    expect((await fetch(api + adminPath)).status).toBe(401);
    try {
      await apiCall(unscoped, adminPath, 403);
    } finally {
      sql(`delete from public.role_assignments where user_id='${unscoped.id}' and role='administrator';`);
    }
    await apiCall(outsider, adminPath, 403, "POST", nominate(currentProgram, org.id));
    await apiCall(outsider, orgPath(org.id), 404);
    await apiCall(owner, orgPath(other.id), 404);
    expect(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'early_partner_%' and c.relkind='r' and c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'select');")).toBe("5");
    expect(sql("select has_function_privilege('authenticated','public.early_partner_command_for_api(uuid,uuid,boolean,bigint,boolean,uuid,uuid,uuid,text,integer,uuid,jsonb)','execute');")).toBe("f");
    expect((await apiCall(first, adminPath, 200)).operational).toBe(false);
    expect((await apiCall(first, adminPath, 409, "POST", nominate(currentProgram, org.id))).error.code).toBe("EARLY_PARTNER_CLOSED");
    syntheticGate([currentProgram, realProgram]);
    expect((await apiCall(first, adminPath, 409, "POST", nominate(realProgram, org.id))).error.code).toBe("EARLY_PARTNER_CLOSED");
    expect((await apiCall(first, adminPath, 409, "POST", nominate(currentProgram, government.id))).error.code).toBe("EARLY_PARTNER_INELIGIBLE");

    const nominateBody = nominate(currentProgram, org.id);
    const enrolled = await apiCall(first, adminPath, 200, "POST", nominateBody);
    expect(await apiCall(first, adminPath, 200, "POST", nominateBody)).toEqual(enrolled);
    await apiCall(first, adminPath, 409, "POST", { ...nominateBody, reason: "Different nomination reason" });
    await apiCall(first, adminPath, 409, "POST", nominate(currentProgram, org.id));
    expect((await apiCall(owner, orgPath(org.id), 200)).enrollments).toEqual([]);
    await apiCall(first, adminPath, 403, "POST", review(enrolled.id, enrolled.revision, "offer"));
    const offer = await apiCall(second, adminPath, 200, "POST", review(enrolled.id, enrolled.revision, "offer"));
    const secondNomination = await apiCall(first, adminPath, 200, "POST", nominate(currentProgram, other.id));
    const full = await apiCall(second, adminPath, 409, "POST", review(secondNomination.id, secondNomination.revision, "offer"));
    expect(full.error.code).toBe("EARLY_PARTNER_FULL");
    expect(JSON.stringify(await apiCall(owner, orgPath(org.id), 200))).not.toContain(reason);
    await apiCall(outsider, orgPath(org.id), 403, "POST", accept(enrolled.id, offer.revision));
    await apiCall(delegate, orgPath(org.id), 403, "POST", accept(enrolled.id, offer.revision));
    const mismatch = await apiCall(owner, orgPath(org.id), 409, "POST", { ...accept(enrolled.id, offer.revision), termsVersion: 2 });
    expect(mismatch.error.code).toBe("STALE_VERSION");

    const original = accept(enrolled.id, offer.revision);
    const repeated = await Promise.all([send(owner, orgPath(org.id), original), send(owner, orgPath(org.id), original)]);
    expect(repeated.map((response) => response.status)).toEqual([200, 200]);
    const receipts = await Promise.all(repeated.map((response) => response.json()));
    expect(receipts[0]).toMatchObject({ state: "active", synthetic: true });
    expect(receipts[0]).toEqual(receipts[1]);
    const active = receipts[0];
    expect(sql(`select count(*) from private.early_partner_events where enrollment_id='${enrolled.id}' and action='accept';`)).toBe("1");

    const feedback = { ...command(active.revision, "feedback"), enrollmentId: enrolled.id, feature: "guided_onboarding",
      category: "usability", description: "Fictional onboarding example." };
    await apiCall(outsider, orgPath(other.id), 404, "POST", feedback);
    await apiCall(delegate, orgPath(org.id), 400, "POST", { ...feedback, patientId: randomUUID() });
    const submitted = await apiCall(delegate, orgPath(org.id), 200, "POST", feedback);
    const resolved = await apiCall(second, adminPath, 200, "POST", {
      ...review(enrolled.id, submitted.revision, "resolve"), feedbackId: submitted.id,
    });
    expect(resolved.state).toBe("resolved");
    expect((await apiCall(owner, orgPath(org.id), 200)).feedback[0].resolution).toBe(reason);
    expect((await apiCall(outsider, orgPath(other.id), 200)).feedback).toEqual([]);

    const opt = await apiCall(owner, orgPath(org.id), 200, "POST", { ...command(active.revision, "opt_in"), enrollmentId: enrolled.id });
    const publicProfile = await fetch(api + "/api/v1/institutions/by-handle/" + org.handle);
    expect(publicProfile.ok).toBe(true);
    const profile = await publicProfile.json();
    expect(JSON.stringify(profile)).not.toMatch(/earlyPartner|Fictional onboarding|Synthetic onboarding pilot/);
    expect(profile).toMatchObject({ organization: { verificationStatus: "unverified" } });
    expect(sql(`select private.project_identity_state('${owner.id}') || ':' ||
      private.poll_live_eligible(jsonb_populate_record(null::private.polls,
       '{"scope":"individual","creator_id":"${first.id}","eligibility":"verified"}'),'${owner.id}')::text;`)).toBe("required:false");
    expect(sql(`select 'partner_obligations'=any(private.o5_correction_blockers(
      jsonb_populate_record(null::private.organization_onboarding_intents,'{"subject_id":"${owner.id}"}')));`)).toBe("t");

    finishPersonalOnboarding(owner);
    await inEnglish(context);
    await login(page, owner);
    await solveMfa(page, owner.secret);
    await page.goto("/institutions/" + org.id);
    for (const [locale, width] of [["en",1440],["ht",320],["fr",768],["es",320]] as const) {
      await page.setViewportSize({ width, height: 860 });
      await page.getByRole("banner").locator("select").selectOption(locale);
      const t = earlyPartnerMessages[locale];
      const summary = page.getByText(t.title, { exact: true });
      await expect(summary).toBeVisible();
      if (await summary.locator("..").getAttribute("open") === null) await summary.press("Enter");
      const view = page.getByRole("region", { name: t.title, exact: true });
      await expect(view.getByText(t.closed, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByRole("banner").locator("select").selectOption("en");
    await page.getByRole("button", { name: messages.en.switchToDark }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const alternate = institute(owner);
    sql(`update private.organizations set name='Alternate pilot workspace' where id='${alternate.id}';`);
    const switcher = page.getByRole("banner").locator("summary").filter({ hasText: "Switch account" });
    await switcher.click();
    await page.getByRole("link", { name: "Alternate pilot workspace" }).click();
    await expect(page).toHaveURL(new RegExp(alternate.id + "$"));
    await page.getByText(earlyPartnerMessages.en.title, { exact: true }).press("Enter");
    const alternateView = page.getByRole("region", { name: earlyPartnerMessages.en.title });
    await expect(alternateView.getByText(earlyPartnerMessages.en.none)).toBeVisible();
    await expect(alternateView.getByText(feedback.description)).toHaveCount(0);

    const withdraw = await apiCall(owner, orgPath(org.id), 200, "POST", {
      ...command(opt.revision, "withdraw"), enrollmentId: enrolled.id,
    });
    expect(withdraw.state).toBe("withdrawn");
    expect((await apiCall(owner, orgPath(org.id), 200)).enrollments[0]).toMatchObject({ optedIn: false, canFeedback: false });
    await apiCall(delegate, orgPath(org.id), 409, "POST", { ...feedback, requestId: randomUUID(), expectedVersion: withdraw.revision });
    const claims = JSON.parse(Buffer.from(delegate.token.split(".")[1], "base64url").toString("utf8"));
    sql(`update auth.sessions set not_after=now()-interval '1 minute' where id='${claims.session_id}';`);
    await apiCall(delegate, orgPath(org.id), 401);
  });

pilotTest("O6 serializes acceptance and suspension and rechecks expiry and organization authority @smoke", async ({
  operators: [first, second], makeMember, page, context,
}) => {
  const [subject, alternate] = await Promise.all([makeMember(), makeMember()]);
  const owner = await withMfa(subject);
  const org = institute(owner);
  const expiredOrg = institute(owner);
  const liveOrg = institute(owner);
  const programId = program(first, second, true, 4);
  syntheticGate([programId]);

  async function offerFor(id: string) {
    const nomination = await apiCall(first, adminPath, 200, "POST", nominate(programId, id));
    return apiCall(second, adminPath, 200, "POST", review(nomination.id, nomination.revision, "offer"));
  }

  const offer = await offerFor(org.id);
  const races = await Promise.all([
    send(owner, orgPath(org.id), accept(offer.id, offer.revision)),
    send(owner, orgPath(org.id), { ...accept(offer.id, offer.revision), requestId: randomUUID() }),
    send(second, adminPath, review(offer.id, offer.revision, "suspend")),
  ]);
  expect(races.map((response) => response.status).sort()).toEqual([200, 409, 409]);
  expect(sql(`select count(*) from private.early_partner_events where enrollment_id='${offer.id}' and action in ('suspend','accept');`)).toBe("1");

  const expired = await offerFor(expiredOrg.id);
  sql(`update private.early_partner_enrollments set offer_until=now()-interval '1 second' where id='${expired.id}';`);
  expect((await apiCall(owner, orgPath(expiredOrg.id), 200)).enrollments[0].state).toBe("expired");
  await apiCall(owner, orgPath(expiredOrg.id), 409, "POST", accept(expired.id, expired.revision));
  expect((await apiCall(second, adminPath, 200, "POST", review(expired.id, expired.revision, "expire"))).state).toBe("expired");

  const live = await offerFor(liveOrg.id);
  const active = await apiCall(owner, orgPath(liveOrg.id), 200, "POST", accept(live.id, live.revision));
  expect((await apiCall(owner, orgPath(liveOrg.id), 200)).enrollments[0].canFeedback).toBe(true);
  sql(`update private.early_partner_enrollments set acceptance_valid_until=now()-interval '1 second' where id='${live.id}';`);
  expect((await apiCall(owner, orgPath(liveOrg.id), 200)).enrollments[0].canFeedback).toBe(false);
  const revoked = await apiCall(second, adminPath, 200, "POST", review(live.id, active.revision, "revoke_feedback"));
  expect(revoked.revision).toBe(active.revision + 1);

  const contested = institute(owner);
  const nomination = await apiCall(first, adminPath, 200, "POST", nominate(programId, contested.id));
  sql(`insert into private.organization_memberships(organization_id,user_id,role)
    values ('${contested.id}','${second.id}','editor');`);
  await apiCall(second, adminPath, 403, "POST", review(nomination.id, nomination.revision, "offer"));
  sql(`update private.organization_memberships set revoked_at=now()
    where organization_id='${liveOrg.id}' and user_id='${owner.id}';
    insert into private.organization_memberships(organization_id,user_id,role) values ('${liveOrg.id}','${alternate.id}','owner');`);
  await apiCall(owner, orgPath(liveOrg.id), 404);
  expect((await apiCall(alternate, orgPath(liveOrg.id), 200)).enrollments[0]).toMatchObject({ canFeedback: false, sameOwner: false });

  finishPersonalOnboarding(first);
  await inEnglish(context);
  await login(page, first);
  await solveMfa(page, first.secret);
  await openAdministration(page);
  const t = earlyPartnerMessages.en;
  await page.getByRole("button", { name: t.title, exact: true }).click();
  const view = page.getByRole("region", { name: t.title });
  await view.getByLabel(t.program).selectOption(programId);
  await expect(view.getByText(t.closed, { exact: true })).toBeVisible();
  await expect(view.getByText(t.capacity, { exact: false })).toContainText("/ 4");
  await expect(view.getByText(t.activity, { exact: true })).toBeVisible();
});
