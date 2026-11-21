import { randomUUID } from "node:crypto";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, login, sql, test, type Member } from "./fixtures";
import { institutionMessages } from "../src/lib/institution-i18n";
import { messages } from "../src/lib/i18n";
import { organizationOnboardingMessages } from "../src/lib/organization-onboarding-i18n";
import { organizationSetupMessages } from "../src/lib/organization-setup";

const base = "/api/v1/me/organization-onboarding";
const claimRefs = ["https://example.org/public-authority", "https://example.net/public-reference"];
const command = (expectedVersion: number) => ({ expectedVersion, requestId: randomUUID() });
const declaration = { declarationVersion: 1, authorityConfirmed: true };
const handle = () => "o4-" + randomUUID().slice(0, 16);
const setupPath = (id: string, action: string) => base + "/" + id + "/" + action;

function setUpProfile(member: Member, reviewer?: Member) {
  finishPersonalOnboarding(member);
  if (reviewer) sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${member.id}','identity','verified','review','${reviewer.id}',now());`);
}

async function start(who: Member) {
  return (await apiCall(who, base, 200, "PUT", { ...command(0), id: null, stage: "drafting" })).intent as { id: string; version: number };
}

async function complete(who: Member, intent: { id: string; version: number }, status: number, evidence?: string[]) {
  return apiCall(who, setupPath(intent.id, "complete"), status, "POST",
    { ...command(intent.version), declaration: { ...declaration, ...(evidence && { evidence }) } });
}

function assertSqlDenial(statement: string, state: string) {
  sql(`do $$ begin ${statement}; raise exception 'expected rejection';
    exception when sqlstate '${state}' then null; end $$;`);
}

test("O4 setup gates ownership, supports private declarations and reconciles command receipts @smoke", async ({ makeMember }) => {
  const [owner, other] = await Promise.all([makeMember(), makeMember()]);
  expect((await fetch(api + base + "/setup")).status).toBe(401);
  expect((await fetch(api + base + "/matches?q=test")).status).toBe(401);
  expect(sql("select has_table_privilege('authenticated','private.organization_onboarding_intents','update') or has_function_privilege('authenticated','public.organization_setup_command_for_api(uuid,uuid,boolean,uuid,text,integer,uuid,jsonb)','execute');")).toBe("f");

  const orgHandle = handle();
  const draft = { mode: "new", handle: orgHandle, name: "O4 civic group", kind: "nonprofit",
    countryCode: "HT", registrationStatus: "informal_unregistered" };
  const legacy = { handle: orgHandle, name: draft.name, kind: draft.kind, countryCode: draft.countryCode,
    description: null, website: null, departmentCode: null, contactEmail: null };
  expect((await apiCall(owner, "/api/v1/institutions", 409, "POST", legacy)).error.code).toBe("ORG_SETUP_REQUIRED");
  assertSqlDenial(`perform public.institution_save_for_api('${owner.id}',null,'${JSON.stringify(legacy)}')`, "O4001");

  const initial = await start(owner);
  const edit = setupPath(initial.id, "details");
  const finish = setupPath(initial.id, "complete");
  const draftRequest = { ...command(initial.version), draft };
  expect((await apiCall(owner, edit, 409, "PUT", draftRequest)).error.code).toBe("ORG_SETUP_PROFILE_REQUIRED");
  setUpProfile(owner);
  setUpProfile(other, owner);
  await apiCall(other, edit, 404, "PUT", draftRequest);
  await apiCall(other, finish, 404, "POST", { ...command(initial.version), declaration });
  await apiCall(owner, edit, 400, "PUT", { ...draftRequest, draft: { ...draft, founderVerified: true } });
  expect((await apiCall(owner, edit, 403, "PUT", { ...draftRequest, draft: { ...draft, kind: "ministry" } })).error.code).toBe("ORG_SETUP_PROTECTED");
  const saved = await apiCall(owner, edit, 200, "PUT", draftRequest);
  expect(await apiCall(owner, edit, 200, "PUT", draftRequest)).toEqual(saved);
  expect(await apiCall(owner, base + "/setup", 200)).toMatchObject({ draft, eligible: false, version: saved.version });
  expect(await apiCall(other, base + "/setup", 200)).toMatchObject({ intentId: null, draft: null });
  expect((await complete(owner, { ...initial, version: saved.version }, 403)).error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");

  sql(`insert into public.verification_records(user_id,verification_type,status,source,verified_at)
    values ('${owner.id}','identity','verified','first_account_bootstrap',now());`);
  expect((await complete(owner, { ...initial, version: saved.version }, 403)).error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
  sql(`update public.verification_records set source='review',reviewed_by='${other.id}',publication_held_at=now() where user_id='${owner.id}';`);
  expect((await complete(owner, { ...initial, version: saved.version }, 403)).error.code).toBe("ORG_SETUP_IDENTITY_REQUIRED");
  sql(`update public.verification_records set publication_held_at=null,status='revoked',verified_at=null where user_id='${owner.id}';`);
  await complete(owner, { ...initial, version: saved.version }, 403);
  sql(`update public.verification_records set status='verified',verified_at=now() where user_id='${owner.id}';`);
  await apiCall(owner, finish, 400, "POST", { ...command(saved.version), declaration: { declarationVersion: 1 } });
  expect(sql(`select count(*) from private.organizations where handle='${orgHandle}';`)).toBe("0");
  expect(sql(`select count(*) from private.institution_audit where event='setup_completed' and actor_id='${owner.id}';`)).toBe("0");

  const otherIntent = await start(other);
  const otherSaved = await apiCall(other, setupPath(otherIntent.id, "details"), 200, "PUT", { ...command(otherIntent.version), draft });
  const body = { ...command(saved.version), declaration };
  const otherBody = { ...command(otherSaved.version), declaration };
  const result = await Promise.all([
    fetch(api + finish, { method: "POST", headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    fetch(api + setupPath(otherIntent.id, "complete"), { method: "POST", headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
      body: JSON.stringify(otherBody) }),
  ]);
  expect(result.map((response) => response.status).sort()).toEqual([200, 409]);
  const winner = result[0].ok ? owner : other;
  const loser = result[0].ok ? other : owner;
  const lost = await result.find((response) => !response.ok)!.json();
  expect(lost.error.code).toBe("ORG_SETUP_HANDLE_UNAVAILABLE");
  const created = await result.find((response) => response.ok)!.json();
  const winnerPath = result[0].ok ? finish : setupPath(otherIntent.id, "complete");
  const winnerBody = result[0].ok ? body : otherBody;
  expect(await apiCall(winner, winnerPath, 200, "POST", winnerBody)).toEqual(created);
  expect((await apiCall(winner, winnerPath, 409, "POST", { ...winnerBody, expectedVersion: winnerBody.expectedVersion + 1 })).error.code)
    .toBe("IDEMPOTENCY_CONFLICT");
  const { organizationId } = created.result;
  expect((await apiCall(winner, base, 200)).intent).toBeNull();
  expect((await apiCall(winner, base + "/setup", 200)).result).toMatchObject({ kind: "created", organizationId });
  expect(sql(`select count(*) from private.organization_memberships where organization_id='${organizationId}' and role='owner';`)).toBe("1");
  expect(sql(`select count(*) from private.institution_audit where organization_id='${organizationId}' and request_id='${created.requestId}';`)).toBe("5");
  const publication = await fetch(api + "/api/v1/institutions/by-handle/" + orgHandle);
  expect(publication.status).toBe(200);
  const publicProfile = (await publication.json()).organization;
  expect(publicProfile).toMatchObject({ verificationStatus: "unverified", kind: "nonprofit" });
  expect(JSON.stringify(publicProfile)).not.toContain("registration");
  expect(sql(`select private.project_organization_verified('${organizationId}');`)).toBe("f");
  await apiCall(winner, "/api/v1/institutions/" + organizationId, 403, "PATCH", { kind: "ministry" });

  const register = "/api/v1/institutions/" + organizationId + "/registration";
  await apiCall(loser, register, 403, "PUT", { ...command(1), status: "registered" });
  const correction = { ...command(1), status: "registered" };
  const registered = await apiCall(winner, register, 200, "PUT", correction);
  expect(await apiCall(winner, register, 200, "PUT", correction)).toEqual(registered);
  await apiCall(winner, register, 409, "PUT", { ...command(1), status: "unknown" });
  expect((await apiCall(winner, "/api/v1/institutions/" + organizationId, 200)).registration)
    .toMatchObject({ status: "registered", version: 2 });
  expect(sql(`select verification_status from private.organizations where id='${organizationId}';`)).toBe("unverified");
  expect(sql(`select count(*) from private.institution_audit where organization_id='${organizationId}'
    and request_id='${correction.requestId}' and event='registration_corrected';`)).toBe("1");
  sql(`delete from auth.sessions where user_id='${winner.id}';`);
  await apiCall(winner, register, 401, "PUT", { ...command(2), status: "unknown" });
});

test("O4 claims keep existing authority until two eligible independent reviewers approve", async ({ makeMember }) => {
  const [owner, claimant, reviewer, second] = await Promise.all([makeMember(), makeMember(), makeMember(), makeMember()]);
  setUpProfile(claimant, reviewer);
  await enroll(reviewer);
  await enroll(second);
  sql(`insert into private.verification_reviewers(user_id) values ('${reviewer.id}'),('${second.id}');`);
  const targetId = randomUUID();
  const targetHandle = handle();
  const govHandle = handle();
  const hiddenHandle = handle();
  const verifiedHandle = handle();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,status,verification_status,created_by)
    values ('${targetId}','${targetHandle}','O4 public target','ngo','HT','active','unverified','${owner.id}'),
      (gen_random_uuid(),'${govHandle}','O4 public ministry','ministry','HT','active','unverified','${owner.id}'),
      (gen_random_uuid(),'${hiddenHandle}','O4 archived target','ngo','HT','archived','unverified','${owner.id}'),
      (gen_random_uuid(),'${verifiedHandle}','O4 verified target','ngo','HT','active','verified','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${targetId}','${owner.id}','owner');`);
  const matches = await apiCall(claimant, base + "/matches?q=" + hiddenHandle, 200);
  expect(matches).toEqual([]);
  const visible = await apiCall(claimant, base + "/matches?q=" + targetHandle, 200);
  expect(visible).toEqual([{ handle: targetHandle, name: "O4 public target", kind: "ngo", verificationStatus: "unverified" }]);
  const oldReview = await apiCall(claimant, "/api/v1/me/verification", 409, "POST",
    { kind: "claim", organizationId: targetId, evidence: claimRefs });
  expect(oldReview.error.code).toBe("ORG_SETUP_REQUIRED");
  assertSqlDenial(`perform public.verification_submit_for_api('${claimant.id}','${targetId}','claim',array['${claimRefs[0]}','${claimRefs[1]}'])`, "O4001");

  const started = await start(claimant);
  let version = started.version;
  for (const [target, status] of [[hiddenHandle, 404], [govHandle, 403], [verifiedHandle, 409], [targetHandle, 200]] as const) {
    const receipt = await apiCall(claimant, setupPath(started.id, "details"), 200, "PUT", {
      ...command(version), draft: { mode: "existing", targetHandle: target },
    });
    version = receipt.version;
    const result = await complete(claimant, { id: started.id, version }, status, claimRefs);
    if (status !== 200) continue;
    expect(result.result).toMatchObject({ kind: "claim", organizationId: targetId, reviewStatus: "pending" });
    const application = result.result.applicationId as string;
    expect(sql(`select user_id from private.organization_memberships where organization_id='${targetId}' and revoked_at is null;`)).toBe(owner.id);
    expect(sql(`select count(*) from private.institution_audit where subject_id='${application}' and event='setup_claim_submitted' and declaration_version=1;`)).toBe("1");
    const decide = (actor: Member) => `public.verification_decide_for_api('${actor.id}','${application}','approve','Synthetic reviewed authority',true)`;
    assertSqlDenial("perform " + decide(reviewer), "PVT05");
    sql(`select public.verification_work_for_api('${reviewer.id}','${application}',true);
      select public.verification_work_for_api('${second.id}','${application}',true);`);
    expect(sql("select " + decide(reviewer))).toBe("pending");
    expect(sql(`select user_id from private.organization_memberships where organization_id='${targetId}' and revoked_at is null;`)).toBe(owner.id);
    sql(`update public.verification_records set publication_held_at=now() where user_id='${claimant.id}';`);
    assertSqlDenial("perform " + decide(second), "O4002");
    sql(`update public.verification_records set publication_held_at=null where user_id='${claimant.id}';`);
    expect(sql("select " + decide(second))).toBe("approved");
    expect(sql(`select user_id from private.organization_memberships where organization_id='${targetId}' and revoked_at is null;`)).toBe(claimant.id);
    expect((await apiCall(claimant, base + "/setup", 200)).result).toMatchObject({ reviewStatus: "approved" });
    expect(sql(`select claimed_registration_status from private.organizations where handle='${verifiedHandle}' and verification_status='verified';`)).toBe("unknown");
  }
});

test("O4 draft resumes across sessions and four locales with keyboard and responsive layouts @smoke", async ({ page, makeMember }) => {
  const member = await makeMember();
  setUpProfile(member);
  await inEnglish(page.context());
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/organization-onboarding");
  await page.getByRole("button", { name: organizationOnboardingMessages.en.start }).press("Enter");
  await page.getByLabel(institutionMessages.en.name, { exact: true }).fill("O4 responsive draft");
  await page.getByLabel(institutionMessages.en.handle, { exact: true }).fill(handle());
  await page.getByRole("combobox", { name: institutionMessages.en.kind, exact: true }).selectOption("ngo");
  await page.getByRole("combobox", { name: organizationSetupMessages.en.registration, exact: true }).selectOption("pursuing_registration");
  await page.getByRole("button", { name: organizationSetupMessages.en.saveDraft }).press("Enter");
  await expect(page.getByText(organizationSetupMessages.en.draftSaved)).toBeVisible();
  await page.reload();
  await expect(page.getByText("O4 responsive draft", { exact: true })).toBeVisible();
  for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440], ["en", 2560]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("banner").locator("select").selectOption(locale);
    await expect(page.getByText(organizationSetupMessages[locale].identity, { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: messages.en.switchToDark }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  setUpProfile(member, await makeMember());
  await page.reload();
  await page.getByLabel(organizationSetupMessages.en.authority).check();
  await page.getByRole("button", { name: organizationSetupMessages.en.complete }).press("Enter");
  await expect(page.getByText(organizationSetupMessages.en.created, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: organizationSetupMessages.en.manage }).click();
  await expect(page.getByRole("combobox", { name: organizationSetupMessages.en.registration, exact: true })).toHaveValue("pursuing_registration");
});
