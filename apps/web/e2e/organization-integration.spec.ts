import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, login, logout, sql, test, type Member } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { institutionMessages } from "../src/lib/institution-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";
import { organizationOnboardingMessages } from "../src/lib/organization-onboarding-i18n";
import { organizationSetupMessages } from "../src/lib/organization-setup";

const base = "/api/v1/me/organization-onboarding";
const route = "/organization-onboarding";
const institutions = "/api/v1/institutions";
const supabase = "http://127.0.0.1:55321";
const mailpit = "http://127.0.0.1:55324";
const next = (expectedVersion: number) => ({ expectedVersion, requestId: randomUUID() });
const declaration = { declarationVersion: 1, authorityConfirmed: true };
const setup = organizationSetupMessages.en;
const onboarding = organizationOnboardingMessages.en;
const ui = institutionMessages.en;

function deny(statement: string, state: string) {
  sql(`do $$ begin ${statement}; raise exception 'expected denial'; exception when sqlstate '${state}' then null; end $$;`);
}

function subjectSession(actor: Member) {
  const claims = JSON.parse(Buffer.from(actor.token.split(".")[1], "base64url").toString("utf8"));
  expect(claims.session_id).toMatch(/^[a-f0-9-]{36}$/);
  return claims.session_id as string;
}

async function start(owner: Member) {
  return (await apiCall(owner, base, 200, "PUT", { ...next(0), id: null, stage: "drafting" })).intent as { id: string; version: number };
}

function seedReviewedIdentity(owner: Member, reviewer: Member) {
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${owner.id}','identity','verified','review','${reviewer.id}',now());`);
}

test("O7 organization signup continues through independent review, receipt reconciliation and representation @smoke",
  async ({ page, context, browser, makeMember }) => {
    test.setTimeout(100_000);
    const [referrer, representative, other, reviewerA, reviewerB] = await Promise.all(Array.from({ length: 5 }, () => makeMember()));
    const { referralCode } = await apiCall(referrer, "/api/v1/me/referral-code", 200);
    const email = `o7-${randomUUID()}@example.com`;
    const password = "Disposable-journey!9";
    const handle = "o7-member-" + randomUUID().slice(0, 8);
    const orgHandle = "o7-" + randomUUID().slice(0, 16);
    const name = "O7 community association";
    const member = membershipMessages.en;
    await inEnglish(context);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/register");
    await page.locator('input[name="signup-path"][value="organization"]').check();
    await page.getByLabel(member.firstName, { exact: true }).fill("Ana");
    await page.getByLabel(member.lastName, { exact: true }).fill("Fixture");
    await page.locator('input[name="username"]').fill(handle.replaceAll("-", "_"));
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirm-password").fill(password);
    await page.locator('input[autocomplete="off"]').last().fill(referralCode);
    await page.getByRole("main").getByRole("button", { name: authMessages.en.register, exact: true }).press("Enter");
    await expect(page).toHaveURL(/\/verify-email/);

    let mailId = "";
    await expect.poll(async () => {
      const response = await fetch(mailpit + "/api/v1/messages", { signal: AbortSignal.timeout(3000) });
      const body = await response.json();
      mailId = body.messages?.find((entry: { To: { Address: string }[] }) => entry.To.some((item) => item.Address === email))?.ID ?? "";
      return mailId !== "";
    }).toBe(true);
    const mail = await (await fetch(mailpit + "/api/v1/message/" + mailId)).json();
    const url = new URL(String(mail.Text).match(/https?:\/\/[^\s<(]+\/auth\/v1\/verify\?[^\s)>]+/)![0]);
    expect(url.origin).toBe(supabase);
    await page.goto(url.href);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("radio", { name: member.haitian, exact: true }).check();
    await page.getByRole("button", { name: member.continue, exact: true }).click();
    await page.getByRole("button", { name: member.skip, exact: true }).click();
    // The personal handle uses underscores while the organization handle uses hyphens.
    await expect(page.locator('input[name="username"]')).toHaveValue(handle.replaceAll("-", "_"));
    await page.getByRole("button", { name: member.continue, exact: true }).click();
    await page.getByRole("button", { name: member.skip, exact: true }).click();
    await page.getByRole("link", { name: onboarding.resume, exact: true }).click();
    await page.getByRole("button", { name: onboarding.start, exact: true }).click();
    const handleInput = page.locator('form input[name="handle"]');
    await expect(handleInput).toBeEnabled();
    await handleInput.fill(orgHandle);
    await page.getByRole("combobox", { name: ui.kind, exact: true }).selectOption("nonprofit");
    await page.getByRole("combobox", { name: setup.registration, exact: true }).selectOption("informal_unregistered");
    const nameInput = page.locator('form input[name="name"]');
    await nameInput.fill(name);
    await expect(nameInput).toHaveValue(name);
    await expect(handleInput).toHaveValue(orgHandle);
    await page.getByRole("button", { name: setup.saveDraft, exact: true }).press("Enter");
    await expect(page.getByText(setup.draftSaved)).toBeVisible();
    await logout(page);

    const signedIn = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await inEnglish(signedIn);
      const resumed = await signedIn.newPage();
      await login(resumed, { email, password });
      await expect(resumed).toHaveURL(/\/dashboard/);
      await resumed.goto(route);
      await expect(resumed.getByText(name, { exact: true })).toBeVisible();
      await expect(resumed.getByText(orgHandle, { exact: true })).toBeVisible();
      await expect(resumed.getByText(setup.identity, { exact: false })).toBeVisible();

      const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, { auth: {
        autoRefreshToken: false, persistSession: false, detectSessionInUrl: false,
      } });
      const signed = await client.auth.signInWithPassword({ email, password });
      expect(signed.error).toBeNull();
      const owner: Member = { id: signed.data.user!.id, token: signed.data.session!.access_token, email, password, handle };
      expect(sql(`select count(*) from auth.users where email='${email}' and id='${owner.id}' and email_confirmed_at is not null;`)).toBe("1");
      expect(sql(`select count(*) from private.referrals where referred_user_id='${owner.id}' and referring_user_id='${referrer.id}'
        and confirmed_at is not null;`)).toBe("1");
      const { intentId, version } = await apiCall(owner, base + "/setup", 200);
      const finish = base + "/" + intentId + "/complete";
      const pending = next(version);
      const pendingBody = { ...pending, declaration };
      expect((await apiCall(owner, finish, 403, "POST", pendingBody)).error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
      deny(`perform public.organization_setup_command_for_api('${owner.id}','${subjectSession(owner)}',false,
        '${intentId}','complete',${version},'${pending.requestId}','${JSON.stringify(declaration)}')`, "O4002");
      expect(sql(`select count(*) from private.organization_onboarding_receipts where request_id='${pending.requestId}';`)).toBe("0");

      await Promise.all([enroll(reviewerA), enroll(reviewerB)]);
      sql(`insert into private.verification_reviewers(user_id) values ('${reviewerA.id}'),('${reviewerB.id}');`);
      const application = sql(`select public.verification_submit_for_api('${owner.id}',null,'identity',array['https://example.org/o7-synthetic-identity']::text[]);`);
      const approve = (r: Member) =>
        `public.verification_decide_for_api('${r.id}','${application}','approve','Disposable independent identity decision',true)`;
      sql(`select public.verification_work_for_api('${reviewerA.id}','${application}',true);
        select public.verification_work_for_api('${reviewerB.id}','${application}',true);`);
      expect(sql("select " + approve(reviewerA))).toBe("pending");
      await apiCall(owner, finish, 403, "POST", pendingBody);
      expect(sql("select " + approve(reviewerB))).toBe("approved");

      await resumed.reload();
      let committed: { requestId: string; result: { organizationId: string }; version: number } | undefined;
      let sent: { expectedVersion: number; declaration: typeof declaration; requestId: string } | undefined;
      await resumed.route(api + finish, async (request) => {
        sent = request.request().postDataJSON();
        const response = await request.fetch();
        expect(response.ok()).toBe(true);
        committed = await response.json();
        await request.abort();
      }, { times: 1 });
      await resumed.getByLabel(setup.authority).check();
      await resumed.getByRole("button", { name: setup.complete, exact: true }).press("Enter");
      const retry = resumed.getByRole("button", { name: onboarding.retry, exact: true });
      await expect(retry).toBeVisible();
      await retry.press("Enter");
      await expect(resumed.getByText(setup.created, { exact: true })).toBeVisible();
      expect(committed).toBeDefined();
      const id = committed!.result.organizationId;
      expect(await apiCall(owner, finish, 200, "POST", sent!)).toEqual(committed);
      await apiCall(owner, finish, 409, "POST", { ...sent!, expectedVersion: sent!.expectedVersion + 1 });
      const events = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('event',event,'actor',actor_id,'version',case_version)
        order by event) from private.institution_audit where organization_id='${id}' and request_id='${committed!.requestId}';`));
      expect(events).toEqual(["organization_created", "setup_authority_declared", "setup_completed", "setup_owner_granted",
        "setup_registration_declared"].map((event) => ({ event, actor: owner.id, version: committed!.version })));
      expect(sql(`select count(*) from private.organization_onboarding_receipts where request_id='${committed!.requestId}';`)).toBe("1");
      const projection = await (await fetch(api + institutions + "/by-handle/" + orgHandle)).json();
      expect(projection.organization).toMatchObject({ verificationStatus: "unverified" });
      expect(JSON.stringify(projection)).not.toMatch(/registration|authorityConfirmed|ownerGrant/);
      expect((await apiCall(owner, institutions + "/" + id, 200)).registration.status).toBe("informal_unregistered");

      await resumed.getByRole("banner").locator("summary").filter({ hasText: ui.switchAccount }).click();
      await resumed.getByRole("link", { name, exact: true }).click();
      await expect(resumed.getByRole("heading", { name, exact: true })).toBeVisible();
      const invitation = await apiCall(owner, institutions + "/" + id + "/invitations", 201, "POST",
        { username: representative.handle, role: "editor", termDays: 7 });
      const accept = "/api/v1/institution-invitations/" + invitation.id + "/accept";
      await apiCall(other, accept, 403, "POST", {});
      await apiCall(representative, accept, 204, "POST", {});
      await apiCall(representative, accept, 409, "POST", {});
      expect((await apiCall(representative, "/api/v1/me/institution-accounts", 200)).organizations)
        .toEqual([expect.objectContaining({ id, role: "editor" })]);
      expect(sql(`select count(*) from private.institution_audit where subject_id='${invitation.id}' and organization_id='${id}'
        and actor_id='${representative.id}' and event='invitation_accepted';`)).toBe("1");

      sql(`select public.verification_decide_for_api('${reviewerB.id}','${application}','revoke','Synthetic decision withdrawn',true);`);
      expect((await apiCall(owner, institutions + "/" + id, 200)).role).toBe("owner");
      expect((await apiCall(owner, institutions + "/" + id + "/registration", 403, "PUT",
        { ...next(1), status: "registered" })).error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
      expect(sql(`select count(*) from private.organization_memberships where organization_id='${id}' and revoked_at is null;`)).toBe("2");
    } finally {
      await signedIn.close();
    }
  });

test("O7 rejects proof and invitations that expire inside an open transaction @smoke", async ({ makeMember }) => {
  const [owner, recipient] = await Promise.all([makeMember(), makeMember()]);
  const org = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${org}','o7-${org.slice(0, 12)}','Timed invitation test','ngo','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${org}','${owner.id}','owner');`);
  const invitation = (await apiCall(owner, institutions + "/" + org + "/invitations", 201, "POST",
    { username: recipient.handle, role: "editor", termDays: 1 })).id;
  const session = subjectSession(recipient);
  const key = randomUUID();
  sql(`begin;
    update private.organization_invitations set expires_at=clock_timestamp()+interval '250 milliseconds' where id='${invitation}';
    update auth.sessions set not_after=clock_timestamp()+interval '250 milliseconds' where id='${session}';
    select pg_sleep(0.35);
    do $$ begin
      if transaction_timestamp()>=(select expires_at from private.organization_invitations where id='${invitation}')
        then raise exception 'fixture must start before expiry'; end if;
      begin
        perform public.institution_resolve_invite_for_api('${recipient.id}','${invitation}',true);
        raise exception 'expired invitation accepted';
      exception when sqlstate '55000' then null; end;
      begin
        perform public.organization_intent_command_for_api('${recipient.id}','${session}',false,null,'save','drafting',0,'${key}');
        raise exception 'expired session accepted';
      exception when sqlstate 'O2001' then null; end;
    end $$;
    commit;`);
  expect(sql(`select state from private.organization_invitations where id='${invitation}';`)).toBe("pending");
  expect(sql(`select count(*) from private.institution_audit where subject_id='${invitation}' and event='invitation_accepted';`)).toBe("0");
  expect(sql(`select count(*) from private.organization_memberships where organization_id='${org}' and user_id='${recipient.id}';`)).toBe("0");
  expect(sql(`select count(*) from private.organization_onboarding_receipts where request_id='${key}';`)).toBe("0");
  await apiCall(recipient, base, 401);
});

test("O7 private catalog, restricted routes and competing intent commands agree", async ({ makeMember }) => {
  const [actor, other] = await Promise.all([makeMember(), makeMember()]);
  const resource = randomUUID();
  const privateRoutes = [base, base + "/setup", base + "/matches?q=sample", "/api/v1/me/founder-identity",
    "/api/v1/admin/founder-identity", "/api/v1/me/onboarding-corrections", "/api/v1/admin/governance",
    "/api/v1/me/governance-invitations", "/api/v1/admin/early-partners", institutions + "/" + resource + "/early-partner"];
  const anonymous = await Promise.all(privateRoutes.map((path) => fetch(api + path, { signal: AbortSignal.timeout(5000) })));
  expect(anonymous.map((response) => response.status)).toEqual(privateRoutes.map(() => 401));

  const inventory = JSON.parse(sql(`select jsonb_build_object(
    'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r'
      and c.relname ~ '^(organization_signup_choices|organization_onboarding_|founder_identity_|onboarding_corrections|platform_governance|platform_claim_approval_holds|early_partner_)'),
    'exposed',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r'
      and c.relname ~ '^(organization_signup_choices|organization_onboarding_|founder_identity_|onboarding_corrections|platform_governance|platform_claim_approval_holds|early_partner_)'
      and (not c.relrowsecurity or exists (select 1 from unnest(array['anon','authenticated','service_role']) role
        where has_table_privilege(role,c.oid,'select,insert,update,delete')))),
    'rpc',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname ~ '^(organization_intent|organization_setup|institution_registration|founder_identity|o5_|early_partner_).*_for_api$'),
    'unsafeRpc',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname ~ '^(organization_intent|organization_setup|institution_registration|founder_identity|o5_|early_partner_).*_for_api$'
      and (not p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false)
        or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
        or not has_function_privilege('service_role',p.oid,'execute'))),
    'founder',private.founder_identity_policy_open(),'liveProof',private.founder_identity_live_proof_enabled(),
    'parity',private.organization_setup_founder_parity_enabled(),
    'pilot',private.early_partner_synthetic_gate(null));`));
  expect(inventory).toEqual({ tables: 20, exposed: 0, rpc: 17, unsafeRpc: 0, founder: false, liveProof: false, parity: false, pilot: false });

  const current = await start(actor);
  const save = { ...next(current.version), id: current.id, stage: "awaiting_identity" };
  const cancel = next(current.version);
  const path = base + "/" + current.id + "/change-path";
  await apiCall(other, path, 404, "POST", cancel);
  const headers = { Authorization: "Bearer " + actor.token, "Content-Type": "application/json" };
  const writes = await Promise.all([
    fetch(api + base, { method: "PUT", headers, body: JSON.stringify(save) }),
    fetch(api + path, { method: "POST", headers, body: JSON.stringify(cancel) }),
  ]);
  expect(writes.map((response) => response.status).sort()).toEqual([200, 409]);
  const won = writes[0].ok ? save : cancel;
  const lost = writes[0].ok ? cancel : save;
  expect(await apiCall(actor, writes[0].ok ? base : path, 200, writes[0].ok ? "PUT" : "POST", won))
    .toMatchObject({ intent: { version: current.version + 1 }, requestId: won.requestId });
  expect(sql(`select count(*) from private.organization_onboarding_receipts where request_id in ('${won.requestId}','${lost.requestId}');`)).toBe("1");
  sql(`delete from auth.sessions where id='${subjectSession(actor)}';`);
  await apiCall(actor, writes[0].ok ? base : path, 401, writes[0].ok ? "PUT" : "POST", won);
});

test("O7 registration declarations stay private across similar names, restrictions and kind corrections", async ({ makeMember }) => {
  const [owner, reviewer] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(owner);
  seedReviewedIdentity(owner, reviewer);
  const marker = randomUUID().slice(0, 9);
  const created: { id: string; handle: string }[] = [];
  for (const [index, status] of ["pursuing_registration", "registered", "unknown"].entries()) {
    const intent = await start(owner);
    const handle = `o7-${marker}-${index}`;
    const path = base + "/" + intent.id;
    const saved = await apiCall(owner, path + "/details", 200, "PUT", {
      ...next(intent.version), draft: { mode: "new", name: "O7 Similar " + marker, handle: handle.toUpperCase(), kind: "ngo",
        countryCode: "HT", registrationStatus: status },
    });
    const completion = await apiCall(owner, path + "/complete", 200, "POST", { ...next(saved.version), declaration });
    const id = completion.result.organizationId;
    created.push({ id, handle });
    expect(completion.result.handle).toBe(handle);
    expect((await apiCall(owner, institutions + "/" + id, 200)).registration).toMatchObject({ status, version: 1 });
    const profile = await (await fetch(api + institutions + "/by-handle/" + handle)).json();
    expect(profile.organization).toMatchObject({ verificationStatus: "unverified" });
    expect(JSON.stringify(profile)).not.toContain("registration");
  }
  const duplicate = await start(owner);
  const saved = await apiCall(owner, base + "/" + duplicate.id + "/details", 200, "PUT", {
    ...next(duplicate.version), draft: { mode: "new", name: "O7 Similar " + marker, handle: created[0].handle.toUpperCase(), kind: "ngo",
      countryCode: "HT", registrationStatus: "unknown" },
  });
  const rejected = next(saved.version);
  expect((await apiCall(owner, base + "/" + duplicate.id + "/complete", 409, "POST", { ...rejected, declaration })).error.code)
    .toBe("ORG_SETUP_HANDLE_UNAVAILABLE");
  expect(sql(`select count(*) from private.institution_audit where request_id='${rejected.requestId}';`)).toBe("0");
  const matches = await apiCall(owner, base + "/matches?q=" + encodeURIComponent("O7 Similar " + marker), 200);
  expect(matches).toHaveLength(3);

  const legacy = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
    values ('${legacy}','o7-legacy-${marker}','Legacy unknown institution','ngo','HT','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${legacy}','${owner.id}','owner');`);
  expect((await apiCall(owner, institutions + "/" + legacy, 200)).registration).toMatchObject({ status: "unknown", version: 0 });
  await apiCall(owner, institutions + "/" + legacy, 200, "PATCH", { kind: "nonprofit" });
  await apiCall(owner, institutions + "/" + legacy, 403, "PATCH", { kind: "ministry" });
  sql(`update private.organizations set status='restricted' where id='${created[0].id}';`);
  await apiCall(owner, institutions + "/" + created[0].id, 403);
  expect((await fetch(api + institutions + "/by-handle/" + created[0].handle)).status).toBe(404);
});
