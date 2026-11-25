import { randomUUID } from "node:crypto";
import type { FeatureEnforcementCase, NeedPublication, NeedProjectLink, PilotWorkspace } from "@ayinou/shared";
import { needsMessages } from "../src/lib/community-needs-i18n";
import { pilotDepartments } from "@ayinou/shared";
import { pilotLabel } from "../src/lib/community-needs-pilot-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, localClient, inEnglish, login, logout, solveMfa, sql, test, totp, type Member } from "./fixtures";

const pilot = "/api/v1/admin/community-needs-pilot";
const intake = "/api/v1/me/community-needs";
const staff = "/api/v1/private/community-needs-review";
const release = "0000000000000000000000000000000000000016";
const reason = "Synthetic Founder pilot decision and operational check";
const stages = { intake: true, review: true, publication: true, association: true };
const need = {
  title: "Shared reading room access", description: "Residents need access to quiet local study materials.",
  category: "education", area: "Ouest", beneficiaries: "Local learners", references: [],
};

async function elevate(person: Member) {
  const secret = await enroll(person);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: person.email, password: person.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing disposable factor");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...person, token: result.data.access_token, secret };
}

async function request<T>(person: Member | null, path: string, method = "GET", value?: object, workspace?: string, key = randomUUID()) {
  const response = await fetch(api + path, {
    method, signal: AbortSignal.timeout(12000), body: value ? JSON.stringify(value) : undefined,
    headers: {
      ...(person && { Authorization: "Bearer " + person.token }),
      ...(value && { "Content-Type": "application/json" }),
      ...(workspace && { "X-Ayinou-Workspace": workspace }), "Idempotency-Key": key,
    },
  });
  if (path.startsWith(pilot)) expect(response.headers.get("cache-control")).toBe("private, no-store");
  return { status: response.status, body: await response.json() as T };
}

async function expectStatus<T>(result: Promise<{ status: number; body: T }>, status: number) {
  const response = await result;
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  return response.body;
}

const receipt = (action: string, expectedRevision: number, fields = {}) =>
  ({ action, expectedRevision, confirmed: true, reason, requestId: randomUUID(), ...fields });

test("C1.6 Founder preparation, attested activation, atomic capacity, and pause remain independent @smoke", async ({ makeMember, page, context }) => {
  test.setTimeout(185000);
  const [owner, adminUser, first, second, outsider, triageUser, evidenceUser, publicationUser, linkUser, challengeUser] =
    await Promise.all(Array.from({ length: 10 }, () => makeMember({ visible: true })));
  for (const person of [owner, adminUser, first, second, outsider, triageUser, evidenceUser, publicationUser, linkUser, challengeUser]) {
    finishPersonalOnboarding(person);
  }
  const [founder, admin, triager, reviewer, publisher] = await Promise.all([owner, adminUser, triageUser, evidenceUser, publicationUser].map(elevate));
  await Promise.all([linkUser, challengeUser].map(enroll));
  const room = sql("select id from feed_data.communities where slug='ouest';");
  const otherRoom = sql("select id from feed_data.communities where slug='centre';");
  expect(sql(`select count(*)=5 and bool_and(c.relrowsecurity)
    and not bool_or(has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('service_role',c.oid,'INSERT'))
    from pg_class c where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relname like 'c16_%';`)).toBe("t");
  expect(sql(`select not has_function_privilege('authenticated','public.c16_pilot_for_api(uuid,uuid,boolean,bigint,uuid,text,jsonb,integer,text)','EXECUTE')
    and not has_function_privilege('anon','public.c16_runtime_for_api(text)','EXECUTE')
    and not public.c16_runtime_for_api('${release}');`)).toBe("t");

  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable pilot Founder provenance');
    insert into public.role_assignments(user_id,role) values('${admin.id}','administrator');
    insert into private.verification_reviewers(user_id) values('${reviewer.id}'),('${publicationUser.id}'),('${linkUser.id}'),('${challengeUser.id}');
    insert into feed_data.community_memberships(community_id,user_id)
      values('${room}','${first.id}'),('${room}','${second.id}'),('${room}','${triager.id}'),('${otherRoom}','${outsider.id}');
    insert into feed_data.community_staff(community_id,user_id,role) values('${room}','${triager.id}','moderator');`);
  try {
    const f = String((await apiCall(founder, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id);
    const a = String((await apiCall(admin, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id);
    const rw = String((await apiCall(reviewer, "/api/v1/me/private-workflows", 200, "POST", { kind: "verification_workspace" })).id);
    const command = (body: object, status = 200) => expectStatus(request<PilotWorkspace>(founder, pilot, "PATCH", body, f), status);
    const read = () => expectStatus(request<PilotWorkspace>(founder, pilot, "GET", undefined, f), 200);
    const config = receipt("configure", 0, { durationDays: 7, capacity: 10, stages });
    const firstDashboard = await read();
    expect(firstDashboard).toMatchObject({ status: "unconfigured", ready: false, activeParticipants: 0 });
    expect(firstDashboard.requirements.privacy).toBe("pending");
    expect(firstDashboard).toMatchObject({ runtimeRelease: release, policyRelease: null, releaseMatches: false });
    expect(Object.values(firstDashboard.operationalEvidence ?? {})).toEqual(Array(6).fill({
      status: "missing", operator: null, verifiedAt: null, expiresAt: null, revokedAt: null,
    }));
    await expectStatus(request(null, pilot), 401);
    await expectStatus(request(admin, pilot, "GET", undefined, a), 403);
    await expectStatus(request(founder, pilot, "GET", undefined, a), 403);
    expect([401, 403]).toContain((await request(owner, pilot, "PATCH", config, f)).status);
    const direct = await localClient("AYINOU_E2E_SUPABASE_PUBLIC").rpc("c16_pilot_for_api", {
      p_actor: founder.id, p_session: randomUUID(), p_aal2: true, p_totp: Math.floor(Date.now() / 1000),
      p_workspace: f, p_release: release, p_command: config, p_before: null, p_query: null,
    });
    expect(direct.error).not.toBeNull();
    await expectStatus(request(first, intake), 404);
    expect(await command(config)).toMatchObject({ revision: 1, status: "prepared", ready: false });
    expect(await command(config)).toMatchObject({ revision: 1 });
    await command(receipt("configure", 0, { durationDays: 7, capacity: 2, stages }), 409);
    await command(receipt("configure", 1, { durationDays: 7, capacity: 11, stages }), 400);
    await command(receipt("configure", 1, { durationDays: 7, capacity: 1, stages, communityId: otherRoom }), 400);
    const competing = await Promise.all([1, 2].map(() =>
      request(founder, pilot, "PATCH", receipt("configure", 1, { durationDays: 7, capacity: 1, stages }), f)));
    expect(competing.map((result) => result.status).sort()).toEqual([200, 409]);
    await command(receipt("enroll", 2, { target: outsider.id, days: 5 }), 403);
    await expectStatus(request(first, pilot, "PATCH", receipt("enroll", 2, { target: first.id, days: 5 }), f), 403);
    await command(receipt("enroll", 2, { target: first.id, days: 6 }));
    await command(receipt("enroll", 3, { target: second.id, days: 6 }));
    await command(receipt("activate", 4, { requirements: { privacy: "verified" } }), 400);
    await command(receipt("activate", 4), 409);
    expect(sql(`select public.c16_runtime_for_api('${release}') and not public.c16_runtime_for_api(repeat('f',40));`)).toBe("t");

    for (const [person, role] of [[triager, "triage"], [reviewer, "review"], [publicationUser, "review"], [linkUser, "review"], [challengeUser, "review"]] as const) {
      await expectStatus(request(founder, staff, "POST", {
        action: "grant", target: person.id, communityId: room, role, confirmed: true, note: reason, requestId: randomUUID(),
      }, f), 200);
    }
    await command(receipt("activate", 4), 409);
    // Simulate independent operational attestations only in the disposable database.
    sql(`insert into private.c16_evidence(requirement,community_id,release,evidence_reference,attested_by,verified_at,valid_until)
      select k,'${room}','${release}','disposable-attestation-'||k,'${admin.id}',now(),now()+interval '2 days'
      from unnest(array['privacy','support','databaseRecovery','storageRecovery','release','launchBlockers']) k;`);
    const verified = await read();
    expect(verified.operationalEvidence?.privacy).toMatchObject({
      status: "verified", operator: expect.any(String), verifiedAt: expect.any(String), expiresAt: expect.any(String), revokedAt: null,
    });
    expect(JSON.stringify(verified)).not.toContain("disposable-attestation");
    expect(verified).toMatchObject({ runtimeRelease: release, policyRelease: release, releaseMatches: true });
    expect(verified).toMatchObject({ ready: true, reviewers: firstDashboard.reviewers + 4, triagers: firstDashboard.triagers + 1, activeParticipants: 2 });
    const active = await command(receipt("activate", 4));
    expect(active.status).toBe("active");
    const tw = String((await apiCall(triager, "/api/v1/me/private-workflows", 200, "POST", { kind: "moderation_workspace" })).id);
    await expectStatus(request(outsider, intake, "POST", { communityId: otherRoom, content: need }), 409);
    await expectStatus(request(first, intake, "POST", { communityId: otherRoom, content: need }), 403);
    await expectStatus(request(triager, intake, "POST", { communityId: room, content: need }), 403);
    const restrictionPath = "/api/v1/moderation/feature-enforcement";
    const restriction = {
      action: "restrict", subject: first.id, capabilities: ["community_need_submit"], scope: "community",
      scopeId: room, minutes: 60, category: "safety", reason, confirmed: true, requestId: randomUUID(),
    };
    const { records: [applied] } = await expectStatus(
      request<{ records: FeatureEnforcementCase[] }>(admin, restrictionPath, "POST", restriction, a), 200);
    expect(applied).toMatchObject({ capability: "community_need_submit", authority: "administrator", scopeId: room });
    await expectStatus(request(first, intake, "POST", { communityId: room, content: need }), 403);
    expect(sql(`select not private.c16_participant('${first.id}','${room}')
      and not exists(select from private.c11_needs where author_id='${first.id}')
      and (select count(*)=1 from private.m23_events where request_id='${restriction.requestId}'
        and subject_id='${first.id}' and scope_id='${room}' and action='restrict');`)).toBe("t");
    await inEnglish(context);
    await login(page, first);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/communities/intake/needs");
    await expect(page.getByText(needsMessages.en.closed, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: needsMessages.en.newNeed, exact: true })).toHaveCount(0);
    await logout(page);
    await expectStatus(request(admin, restrictionPath, "POST", {
      ...restriction, action: "revoke", reference: applied.id, version: applied.version, minutes: null, requestId: randomUUID(),
    }, a), 200);
    expect(sql(`select private.c16_participant('${first.id}','${room}')
      and (select count(*)=2 from private.m23_events where case_id='${applied.id}');`)).toBe("t");
    const candidates = await Promise.all([first, second].map(async (person) => ({
      person, id: (await expectStatus(request<{ id: string }>(person, intake, "POST", { communityId: room, content: need }), 201)).id,
    })));
    const submissions = await Promise.all(candidates.map(({ person, id }) =>
      request(person, intake + "/" + id, "PATCH", { action: "submit", expectedRevision: 1, confirmed: true })));
    expect(submissions.map(({ status }) => status).sort()).toEqual([200, 409]);
    const won = candidates[submissions.findIndex(({ status }) => status === 200)];
    const waiting = candidates.find((entry) => entry.id !== won.id)!;
    expect((await read()).metrics?.weekly).toBe(1);
    const action = (person: Member, lane: string, workspace: string, actionName: string, version: number, status: number, more = {}) =>
      expectStatus(request(person, staff + "/" + won.id + "?lane=" + lane, "PATCH",
        { action: actionName, expectedRevision: version, requestId: randomUUID(), confirmed: true, note: reason, ...more }, workspace), status);
    await action(admin, "admin", a, "assign_triage", 0, 200, { target: triager.id });
    await action(triager, "triage", tw, "refer", 1, 200);
    await action(admin, "admin", a, "assign_review", 2, 200, { target: reviewer.id });
    await action(reviewer, "review", rw, "accept", 3, 200, { conflictFree: true });
    await action(reviewer, "review", rw, "request_information", 4, 200, { summary: "clarify_scope" });
    const paused = await command(receipt("pause", 5));
    expect(paused).toMatchObject({ status: "paused", endsAt: active.endsAt });
    await expectStatus(request(first, intake, "POST", { communityId: room, content: need }), 409);
    await expectStatus(request(waiting.person, intake + "/" + waiting.id, "PATCH", { action: "submit", expectedRevision: 1, confirmed: true }), 409);
    expect(await expectStatus(request<{ intakeStatus: string }>(won.person, intake + "/" + won.id), 200)).toMatchObject({ intakeStatus: "closed" });
    await action(admin, "admin", a, "assign_review", 5, 409, { target: publicationUser.id });
    await expectStatus(request(won.person, intake + "/" + won.id + "/review", "PATCH", {
      action: "correct", expectedRevision: 5, expectedEvidenceRevision: 2, requestId: randomUUID(), confirmed: true,
      content: { ...need, beneficiaries: "Learners seeking access to study material" },
    }), 200);
    await expectStatus(request(won.person, intake + "/" + won.id + "/publication", "PATCH",
      { action: "request", requestId: randomUUID(), expectedRevision: 0, expectedEvidenceRevision: 3, finding: randomUUID(),
        audience: "community", attribution: false, confirmed: true, content: { ...need, references: undefined } }), 409);
    sql(`update private.c16_evidence set revoked_at=now() where requirement='storageRecovery';`);
    await command(receipt("resume", 6), 409);
    expect(sql("select private.c16_dashboard(release,null,null)->'operationalEvidence'->'storageRecovery'->>'status' from private.c16_policy;")).toBe("revoked");
    sql(`insert into private.c16_evidence(requirement,community_id,release,evidence_reference,attested_by,verified_at,valid_until)
      values('storageRecovery','${room}','${release}','replacement-disposable-recovery','${admin.id}',now(),now()+interval '2 days');`);
    expect(await command(receipt("resume", 6))).toMatchObject({ status: "active", endsAt: active.endsAt });
    await action(reviewer, "review", rw, "supported", 6, 200, { summary: "evidence_matches" });
    const article = intake + "/" + won.id + "/publication";
    const readyToPublish = await expectStatus(request<NeedPublication>(won.person, article), 200);
    const publication = await expectStatus(request<NeedPublication>(won.person, article, "PATCH", {
      action: "request", requestId: randomUUID(), expectedRevision: 0, expectedEvidenceRevision: readyToPublish.evidenceRevision,
      finding: readyToPublish.finding, confirmed: true, audience: "community", attribution: false,
      content: { ...need, references: undefined },
    }), 200);
    const publicationPath = "/api/v1/private/community-need-publications/" + publication.id;
    await expectStatus(request(admin, publicationPath + "?lane=admin", "PATCH", {
      action: "assign", requestId: randomUUID(), expectedRevision: 1, confirmed: true, target: publisher.id, note: reason,
    }, a), 200);
    const pw = String((await apiCall(publisher, "/api/v1/me/private-workflows", 200, "POST", { kind: "verification_workspace" })).id);
    const approve = { action: "approve", requestId: randomUUID(), expectedRevision: 2, confirmed: true, note: reason };
    expect(await command(receipt("pause", 7))).toMatchObject({ status: "paused" });
    await expectStatus(request(publisher, publicationPath + "?lane=review", "PATCH", approve, pw), 409);
    expect(await command(receipt("resume", 8))).toMatchObject({ status: "active" });
    await expectStatus(request(publisher, publicationPath + "?lane=review", "PATCH", approve, pw), 200);

    const directory = "/api/v1/private/communities/" + room + "/needs/" + publication.id;
    await expectStatus(request(waiting.person, directory), 200);
    const project = randomUUID();
    sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values('${waiting.person.id}','identity','verified','review','${founder.id}',now());
      insert into private.community_projects(id,creator_id,owner_user_id,association_id,submission_key,request_digest)
      values('${project}','${waiting.person.id}','${waiting.person.id}','${room}',gen_random_uuid(),decode('00','hex'));
      insert into private.project_revisions(project_id,revision,author_id,proposal)
      values('${project}',1,'${waiting.person.id}','{"title":"An Ouest reading space","category":"education","objectives":"Provide quiet space for studying."}');`);
    const links = "/api/v1/private/need-project-links";
    const requestLink = { project, publication: publication.id, projectVersion: 1, confirmed: true, requestId: randomUUID(), reason };
    const link = await expectStatus(request<NeedProjectLink>(waiting.person, links, "POST", requestLink), 200);
    await command(receipt("pause", 9));
    await expectStatus(request(waiting.person, directory), 404);
    await expectStatus(request(won.person, links + "/" + link.id, "PATCH", {
      action: "consent", expectedRevision: 1, confirmed: true, requestId: randomUUID(),
    }), 409);
    await expectStatus(request(won.person, links + "/" + link.id, "PATCH", {
      action: "decline", expectedRevision: 1, confirmed: true, requestId: randomUUID(),
    }), 200);
    await command(receipt("configure", 10, { capacity: 1, durationDays: 7, stages: { ...stages, association: false } }));
    await command(receipt("resume", 11));
    await expectStatus(request(waiting.person, directory), 200);
    await expectStatus(request(waiting.person, links, "POST", { ...requestLink, requestId: randomUUID() }), 409);
    sql(`update private.c16_enrollment set until_at=now()-interval '1 second' where user_id='${waiting.person.id}';`);
    await expectStatus(request(waiting.person, intake, "POST", { communityId: room, content: need }), 403);
    await expectStatus(request(waiting.person, intake + "/" + waiting.id), 200);
    expect(sql(`select count(*)=12 and (select count(*) from private.c16_cases where submitted_at is not null)=1 from private.c16_history;`)).toBe("t");
    expect(sql("select not (exists(select from private.c11_intake_fixture) or exists(select from private.c12_fixture) or exists(select from private.c13_fixture) or exists(select from private.c14_fixture));")).toBe("t");

    sql("update private.c16_evidence set verified_at=now()-interval '2 days', valid_until=now()-interval '1 day' where requirement='privacy';");
    expect(sql("select private.c16_dashboard(release,null,null)->'operationalEvidence'->'privacy'->>'status' from private.c16_policy;")).toBe("expired");
    await inEnglish(context);
    await login(page, owner);
    await solveMfa(page, founder.secret);
    await page.goto("/admin?section=communityNeedsPilot");
    const open = page.getByRole("button", { name: "Open administration", exact: true });
    await open.click();
    await expect(page).toHaveURL(/\/s\/[^/]+\/admin\?section=communityNeedsPilot$/);
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await page.setViewportSize({ width: locale === "en" ? 1300 : 390, height: 844 });
      await page.getByRole("banner").locator("select").selectOption(locale);
      await expect(page.getByRole("heading", { name: pilotLabel(locale, "title"), exact: true })).toBeVisible();
      await expect(page.getByLabel(pilotLabel(locale, "department"), { exact: true }).locator("option")).toHaveCount(10);
      await expect(page.getByRole("heading", { name: pilotLabel(locale, "staff"), exact: true })).toBeVisible();
      await expect(page.getByText(pilotLabel(locale, "decisionBlocked"), { exact: true })).toBeVisible();
      await expect(page.getByText(pilotLabel(locale, "privacyEvidence"), { exact: true })).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(locale === "en" ? 1300 : 390);
    }
  } finally {
    sql("delete from private.c16_cases; delete from private.c16_evidence; delete from private.c16_enrollment; delete from private.c16_history; delete from private.c16_policy; delete from private.platform_bootstrap;");
  }
});

test("nationwide department policies isolate cohorts, live quotas and emergency decisions", async ({ makeMember, page, context }) => {
  test.setTimeout(150000);
  const [owner, triageAccount, ...rest] = await Promise.all(Array.from({ length: 9 }, () => makeMember({ visible: true })));
  const reviewers = rest.slice(0, 4);
  const [first, second, outsider] = rest.slice(4);
  for (const person of [owner, triageAccount, ...rest]) finishPersonalOnboarding(person);
  const founder = await elevate(owner);
  await Promise.all([triageAccount, ...reviewers].map(enroll));
  const departments = ["ouest", "centre", "nord"] as const;
  const rooms = departments.map((slug) => sql(`select id from feed_data.communities where slug='${slug}';`));
  const [ouest, centre, nord] = rooms;
  sql(`insert into private.platform_bootstrap(user_id) values ('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
    values ('${founder.id}','${founder.id}','first_account_bootstrapped','Disposable nationwide Founder provenance');
    insert into private.verification_reviewers(user_id)
    select id from unnest(array[${reviewers.map((p) => "'" + p.id + "'::uuid").join(",")}]) id;
    insert into feed_data.community_memberships(community_id,user_id)
    select room, actor from unnest(array['${ouest}'::uuid,'${centre}'::uuid,'${nord}'::uuid]) room
    cross join unnest(array['${first.id}'::uuid,'${triageAccount.id}'::uuid]) actor;
    insert into feed_data.community_memberships(community_id,user_id) values ('${centre}','${second.id}');
    insert into feed_data.community_staff(community_id,user_id,role)
    select room,'${triageAccount.id}','moderator'
    from unnest(array['${ouest}'::uuid,'${centre}'::uuid,'${nord}'::uuid]) room;`);
  try {
    const workspace = String((await apiCall(founder, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id);
    const pathFor = (scope: string) => pilot + "?department=" + scope;
    const command = (scope: string, body: object, status = 200) =>
      expectStatus(request<PilotWorkspace>(founder, pathFor(scope), "PATCH", body, workspace), status);
    const draft = (actor: Member, communityId: string, status = 201) =>
      expectStatus(request<{ id: string }>(actor, intake, "POST", { communityId, content: need }), status);
    const submit = (actor: Member, id: string, status: number) =>
      expectStatus(request(actor, intake + "/" + id, "PATCH", { action: "submit", expectedRevision: 1, confirmed: true }), status);
    const baseline = await expectStatus(request<PilotWorkspace>(founder, pathFor("ouest"), "GET", undefined, workspace), 200);
    expect(baseline.departments?.map(({ slug }) => slug).sort()).toEqual([...pilotDepartments].sort());
    expect(baseline.departments?.every(({ pausable }) => !pausable)).toBe(true);
    await expectStatus(request(first, pathFor("centre"), "GET", undefined, workspace), 403);
    await expectStatus(request(first, pathFor("centre"), "PATCH", receipt("pause_nationwide", 0), workspace), 403);
    const configuration = receipt("configure", 0, { stages, eligible: true, verifiedIdentity: false, maxParticipants: 1,
      capacity: 1, durationDays: 7 });
    for (const [index, scope] of departments.entries()) {
      const configured = await command(scope, { ...configuration, requestId: randomUUID(), capacity: index + 1 });
      expect(configured).toMatchObject({ revision: 1, status: "prepared", scope, capacity: index + 1, maxParticipants: 1 });
      await command(scope, receipt("enroll", 1, { target: first.id, days: 5 }));
    }
    await command("centre", receipt("enroll", 2, { target: second.id, days: 5 }), 409);
    await command("centre", receipt("activate", 2), 409);

    // Staff and operational-evidence seeds are confined to the isolated database.
    // Give one reviewer no Centre grant and prove the partial roster cannot activate it.
    sql(`insert into private.c12_authority(community_id,actor_id,lane,granted_by,until_at)
      select c.id,a.actor,'review','${founder.id}',now()+interval '10 days'
      from feed_data.communities c
      cross join unnest(array[${reviewers.map((p) => "'" + p.id + "'::uuid").join(",")}]) with ordinality a(actor,idx)
      where c.id in ('${ouest}','${centre}','${nord}') and (c.id<>'${centre}' or a.idx<4);
      insert into private.c12_authority(community_id,actor_id,lane,granted_by,until_at)
      select id,'${triageAccount.id}','triage','${founder.id}',now()+interval '10 days'
      from feed_data.communities where id in ('${ouest}','${centre}','${nord}');
      insert into private.c16_evidence(requirement,community_id,release,evidence_reference,attested_by,verified_at,valid_until)
      select k,c.id,'${release}','synthetic-department-evidence-'||k,'${outsider.id}',now(),now()+interval '2 days'
      from feed_data.communities c cross join unnest(array['privacy','support','databaseRecovery','storageRecovery','release','launchBlockers']) k
      where c.id in ('${ouest}','${centre}','${nord}');`);
    await command("centre", receipt("activate", 2), 409);
    await expectStatus(request(founder, staff, "POST", {
      action: "grant", role: "review", target: reviewers[3].id, communityId: centre,
      confirmed: true, note: reason, requestId: randomUUID(),
    }, workspace), 200);
    for (const scope of departments) {
      expect(await command(scope, receipt("activate", 2))).toMatchObject({ revision: 3, status: "active", activeParticipants: 1 });
    }
    expect(sql(`select private.c18_live('${centre}','intake','${release}')
      and not private.c18_live('${centre}','intake',repeat('f',40))
      and not private.c18_live('${centre}','intake',null);`)).toBe("t");
    await draft(second, ouest, 403);
    const [westDraft, centreDraft, northDraft] = await Promise.all(rooms.map((room) => draft(first, room)));
    await submit(first, westDraft.id, 200);
    await draft(first, ouest, 409);
    await submit(first, centreDraft.id, 200);
    await submit(first, northDraft.id, 200);

    const batch = receipt("pause_selected", 3, { departments: ["ouest", "centre"] });
    await command("ouest", batch);
    await command("ouest", batch);
    await command("nord", batch, 409);
    await draft(first, centre, 409);
    await draft(first, nord);
    await expectStatus(request(first, intake + "/" + centreDraft.id), 200);
    await expectStatus(request(second, intake + "/" + centreDraft.id), 404);
    const north = await expectStatus(request<PilotWorkspace>(founder, pathFor("nord"), "GET", undefined, workspace), 200);
    expect(north).toMatchObject({ revision: 3, status: "active", metrics: { weekly: 1 } });
    expect(north.history.every((event) => event.decisionScope !== "selected")).toBe(true);
    await command("ouest", receipt("resume", 4));
    await command("centre", receipt("pause_nationwide", 4));
    expect(sql(`select count(*)=2 from private.c16_history where decision_scope='nationwide';`)).toBe("t");
    await draft(first, nord, 409);
    sql(`update private.c16_evidence set revoked_at=now()
      where requirement='storageRecovery' and community_id='${centre}';`);
    await command("centre", receipt("resume", 4), 409);
    await command("nord", receipt("resume", 4));
    expect(sql(`select count(*)=2 from private.c16_history where decision_scope='selected';`)).toBe("t");
    await draft(first, nord);

    await inEnglish(context);
    await login(page, owner);
    await solveMfa(page, founder.secret);
    await page.goto("/admin?section=communityNeedsPilot");
    await page.getByRole("button", { name: "Open administration", exact: true }).click();
    await expect(page.getByRole("heading", { name: pilotLabel("en", "title"), exact: true })).toBeVisible();
    await page.getByLabel(pilotLabel("en", "department"), { exact: true }).selectOption("sud-est");
    await expect(page.getByText(pilotLabel("en", "unconfigured"), { exact: true })).toBeVisible();
  } finally {
    sql("delete from private.c16_cases; delete from private.c16_evidence; delete from private.c16_enrollment; delete from private.c16_history; delete from private.c16_policy; delete from private.platform_bootstrap;");
  }
});
