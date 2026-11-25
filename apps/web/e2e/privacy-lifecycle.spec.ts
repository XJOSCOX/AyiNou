import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, enroll, expect, inEnglish, login, solveMfa, sql, test, totp, type Member } from "./fixtures";
import { lifecycleMessages } from "../src/lib/privacy-lifecycle-i18n";
import { privacyMessages } from "../src/lib/privacy-i18n";

const supabase = "http://127.0.0.1:55321";
const collection = "/api/v1/me/privacy-requests";

function allow(member: Member, lifecycle = true) {
  sql(`insert into private.privacy_intake_fixtures(subject_id) values ('${member.id}');
    ${lifecycle ? `insert into private.lifecycle_fixtures(subject_id) values ('${member.id}');` : ""}`);
}

async function withProof(member: Member) {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signed = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  expect(signed.error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.data!.id, code: totp(factor.data!.totp.secret) });
  expect(result.error).toBeNull();
  return { ...member, token: result.data!.access_token };
}

function claims(member: Member) {
  const tokenPayload = JSON.parse(Buffer.from(member.token.split(".")[1], "base64url").toString("utf8"));
  const time = tokenPayload.amr.find((amr: { method: string }) => ["totp", "mfa/totp"].includes(amr.method))?.timestamp;
  expect(tokenPayload.session_id).toMatch(/^[a-f0-9-]{36}$/);
  return { p_actor: member.id, p_session: tokenPayload.session_id, p_aal2: tokenPayload.aal === "aal2", p_totp: time ?? null };
}

function request(member: Member, path: string, input?: object, key = randomUUID(), server = api) {
  return fetch(server + path, {
    method: input ? "POST" : "GET",
    headers: { Authorization: "Bearer " + member.token, ...(input && { "Content-Type": "application/json", "Idempotency-Key": key }) },
    body: input && JSON.stringify(input), signal: AbortSignal.timeout(12_000),
  });
}

async function operate(member: Member, plan: string, action: string, status: number, params: object = {}, direct = false) {
  const key = process.env[direct ? "AYINOU_E2E_SUPABASE_PUBLIC" : "AYINOU_E2E_SUPABASE_SECRET"]!;
  const response = await fetch(supabase + "/rest/v1/rpc/lifecycle_operator_for_api", {
    method: "POST", signal: AbortSignal.timeout(12_000),
    headers: { apikey: key, ...(direct && { Authorization: "Bearer " + member.token }), "Content-Type": "application/json" },
    body: JSON.stringify({ ...claims(member), p_plan: plan, p_action: action, ...params }),
  });
  expect(response.status, action).toBe(status);
  return response.json();
}

function scope(caseId: string, member: Member, role: string) {
  sql(`insert into private.lifecycle_authorities(case_id,actor_id,authority,expires_at)
    values ('${caseId}','${member.id}','${role}',now()+interval '1 hour');`);
}

test("deletion plans surface ownership and shared data blockers without exposing records @smoke", async ({ makeMember }) => {
  const [candidate, other, intakeOnly] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  allow(candidate); allow(other); allow(intakeOnly, false);
  const caseRow = await apiCall(candidate, collection, 201, "POST", { kind: "deletion" });
  const intakeCase = await apiCall(intakeOnly, collection, 201, "POST", { kind: "deletion" });
  const path = collection + "/" + caseRow.id + "/deletion-";
  expect((await request(intakeOnly, collection + "/" + intakeCase.id + "/deletion-preview")).status).toBe(404);
  expect((await request(other, path + "preview")).status).toBe(404);
  expect((await request(candidate, path + "plan", { caseVersion: 1 })).status).toBe(403);
  const owner = await withProof(candidate);
  const first = await request(owner, path + "preview");
  expect(first.headers.get("cache-control")).toBe("private, no-store");
  expect((await first.json()).state).toBe("preview");

  const org = randomUUID(), logo = randomUUID();
  sql(`insert into private.organizations(id,handle,name,kind,country_code,logo_asset,created_by)
    values ('${org}','test-${org.slice(0, 18)}','Private organization name','ngo','HT','${logo}','${owner.id}');
    insert into private.organization_memberships(organization_id,user_id,role) values ('${org}','${owner.id}','owner');
    insert into public.role_assignments(user_id,role) values ('${owner.id}','administrator');`);
  const group = await apiCall(owner, "/api/v1/communities", 201, "POST", {
    slug: "l34-" + randomUUID().slice(0, 8), kind: "diaspora", name: "Private lifecycle group", rules: "Use test data only.",
    description: "Private group for lifecycle checks.", policy: "private", discussionPublic: false, countryCode: "CA", topic: null,
  });
  const post = await apiCall(other, "/api/v1/posts", 201, "POST", { body: "Other member's original post", visibility: "public", language: "en" });
  const comments = "/api/v1/posts/" + post.id + "/comments";
  const root = await apiCall(owner, comments, 201, "POST", { body: "The subject's root comment", language: "en" });
  const rootId = root.id ?? root.comment?.id;
  expect(rootId).toMatch(/^[a-f0-9-]{36}$/);
  const replyId = randomUUID();
  const actionId = randomUUID();
  sql(`insert into feed_data.comments(id,author_id,post_id,parent_id,body,language)
     values ('${replyId}','${other.id}','${post.id}','${rootId}','Do not disclose this reply','en');
    insert into feed_data.comment_moderation_actions(id,comment_id,actor_id,action,reason)
     values ('${actionId}','${rootId}','${other.id}','hide','Evidence reason must stay restricted');
    insert into feed_data.moderation_appeals(appellant_id,comment_action_id,reason)
     values ('${owner.id}','${actionId}','Private fixture appeal reason');`);
  const proposal = await apiCall(owner, "/api/v1/projects", 201, "POST", {
    kind: "individual", owner: null, association: null, proposal: {
      title: "Owned lifecycle fixture", description: "A personal draft under the ownership contract.", problem: "", solution: "",
      objectives: "", beneficiaries: "", outcomes: "", category: "education", country: "CA",
      department: null, startDate: null, endDate: null, references: [], publishRequested: false,
    },
  });
  const poll = await apiCall(owner, "/api/v1/polls", 201, "POST", {
    title: "Confidential lifecycle poll", description: "Freezes the fixture's own synthetic electorate.", scope: "individual",
    scopeId: null, taskId: null, policy: "advisory", kind: "community", language: "en", audience: "members", eligibility: "active",
    resultPolicy: "after_vote", opensAt: new Date(Date.now() + 180_000).toISOString(),
    closesAt: new Date(Date.now() + 360_000).toISOString(), quorum: null, threshold: null, options: ["One", "Two"], key: randomUUID(),
  });
  const opportunity = randomUUID();
  sql(`insert into private.project_execution(project_id,approved_revision,status) values ('${proposal.id}',1,'active');
    insert into private.project_opportunities(id,project_id,title,description,skills,commitment,remote,capacity)
      values ('${opportunity}','${proposal.id}','Volunteer fixture','Synthetic only','Skills','Commitment',false,2);
    insert into private.project_applications(project_id,opportunity_id,applicant_id,status)
      values ('${proposal.id}','${opportunity}','${owner.id}','accepted'),
        ('${proposal.id}','${opportunity}','${other.id}','accepted');
    insert into private.project_progress_entries(project_id,author_id,kind,visibility,request_key,request_digest,content)
      values ('${proposal.id}','${other.id}','evidence','team','${randomUUID()}',decode(repeat('00',32),'hex'),
        '{"private":"Private project evidence fixture"}');`);
  const option = sql(`select id from private.poll_options where poll_id='${poll.id}' order by id limit 1;`);
  sql(`insert into private.poll_electorate(poll_id,user_id) values ('${poll.id}','${owner.id}');
    insert into private.poll_ballots(poll_id,voter_id,option_id) values ('${poll.id}','${owner.id}','${option}');
    update private.polls set status='closed',finalized_at=now(),electorate_size=1,
      final_result='{"verifiedFixtureCount":1}' where id='${poll.id}';`);
  const pollBefore = sql(`select final_result::text || ':' || electorate_size::text from private.polls where id='${poll.id}';`);
  const attachment = randomUUID();
  sql(`insert into feed_data.post_attachments(id,author_id,post_id,position,state,width,height,thumbnail_bytes,display_bytes,digest)
    values ('${attachment}','${owner.id}','${post.id}',1,'attached',1,1,1,1,decode(repeat('00',32),'hex'));`);
  const isLastAdministrator = sql(`select not exists(select from public.role_assignments
    where role='administrator' and user_id<>'${owner.id}' and private.platform_admin(user_id));`) === "t";
  const response = await request(owner, path + "plan", { caseVersion: 1 });
  expect(response.status).toBe(200);
  const plan = await response.json();
  expect(plan.state).toBe("blocked");
  expect(sql(`select count(*) from pg_class where relnamespace='private'::regnamespace and relname like 'lifecycle_%'
    and relkind='r' and relrowsecurity and not has_table_privilege('authenticated',oid,'select,insert,update,delete')
    and not has_table_privilege('service_role',oid,'select,insert,update,delete');`)).toBe("8");
  expect(sql(`select count(*) from private.lifecycle_plans p cross join lateral jsonb_array_elements(snapshot->'resources') r
    where p.id='${plan.receipt}' and r->>'bucket'='post-media' and r->>'ref'='${attachment}';`)).toBe("2");
  expect(plan.warnings).toEqual(expect.arrayContaining([
    "privileged_role", "institution_owner", "group_owner", "third_party_discussion", "personal_project",
    "shared_media", "voting_integrity", "project_commitment", "protected_evidence",
  ]));
  expect(plan.warnings.includes("last_administrator")).toBe(isLastAdministrator);
  for (const excluded of [org, logo, group.community.id, rootId, replyId, proposal.id, poll.id, option, attachment, other.id,
    "Private organization name", "Do not disclose this reply", "Private project evidence fixture", "option_id"]) {
    if (excluded) expect(JSON.stringify(plan).includes(excluded)).toBe(false);
  }
  expect((await request(owner, path + "confirmation", { caseVersion: 1, planVersion: 1 })).status).toBe(409);
  expect((await request(owner, path + "plan", { caseVersion: 1, p_subject: other.id })).status).toBe(400);
  expect(sql(`select count(*) from feed_data.comments where id in ('${rootId}','${replyId}');`)).toBe("2");
  expect(sql(`select final_result::text || ':' || electorate_size::text from private.polls where id='${poll.id}';`)).toBe(pollBefore);
  expect(sql(`select count(*) from private.poll_ballots where poll_id='${poll.id}' and option_id='${option}';`)).toBe("1");
  expect(sql(`select count(*) from private.project_applications where project_id='${proposal.id}';`)).toBe("2");
  sql(`update feed_data.communities set owner_id='${other.id}' where id='${group.community.id}';`);
  expect((await (await request(owner, path + "preview")).json()).state).toBe("stale");
  expect((await (await request(owner, path + "preview")).json()).warnings).not.toContain("group_owner");
  sql(`delete from public.role_assignments where user_id='${owner.id}' and role='administrator';`);
});

test("synthetic holds, execution and quarantine recover without writing product records", async ({ makeMember }) => {
  const [subject, reviewer, placer, releaser, simulator, restorer] = await Promise.all(
    Array.from({ length: 6 }, () => makeMember()),
  );
  for (const member of [subject, reviewer, placer, releaser, simulator, restorer]) allow(member);
  const c = await apiCall(subject, collection, 201, "POST", { kind: "closure" });
  const [owner, approver, holdPlacer, holdReleaser, worker, restoreOperator] = await Promise.all(
    [subject, reviewer, placer, releaser, simulator, restorer].map(withProof),
  );
  scope(c.id, approver, "approve"); scope(c.id, holdPlacer, "place_hold"); scope(c.id, holdReleaser, "release_hold");
  scope(c.id, worker, "simulate"); scope(c.id, restoreOperator, "restore"); scope(c.id, owner, "approve");
  const path = collection + "/" + c.id + "/deletion-";
  expect((await request(owner, path + "plan", { caseVersion: 2 })).status).toBe(409);
  const key = randomUUID();
  const replies = await Promise.all([api, "http://127.0.0.1:5301"].map((server) => request(owner, path + "plan", { caseVersion: 1 }, key, server)));
  expect(replies.map((value) => value.status)).toEqual([200, 200]);
  const [plan, duplicate] = await Promise.all(replies.map((value) => value.json()));
  expect(duplicate.receipt).toBe(plan.receipt);
  const id = plan.receipt;
  await operate(approver, id, "approve", 403, {}, true);
  await operate(owner, id, "approve", 403);
  await operate(approver, id, "approve", 409);
  const confirmKey = randomUUID();
  const confirmation = { caseVersion: 1, planVersion: 1 };
  expect((await request(owner, path + "confirmation", confirmation, confirmKey)).status).toBe(200);
  expect((await request(owner, path + "confirmation", confirmation, confirmKey)).status).toBe(200);
  expect((await request(owner, path + "confirmation", confirmation)).status).toBe(409);
  sql(`update private.lifecycle_authorities set conflicted=true where case_id='${c.id}' and actor_id='${approver.id}';`);
  await operate(approver, id, "approve", 403);
  sql(`update private.lifecycle_authorities set conflicted=false where case_id='${c.id}' and actor_id='${approver.id}';`);
  const hold = { p_scope: "subject", p_ref: owner.id, p_reason: "case_evidence" };
  await operate(holdPlacer, id, "place_hold", 400, { ...hold, p_ref: worker.id, p_request: randomUUID() });
  const first = await operate(holdPlacer, id, "place_hold", 200, { ...hold, p_request: randomUUID() });
  const second = await operate(holdPlacer, id, "place_hold", 200, { ...hold, p_request: randomUUID() });
  await operate(holdPlacer, id, "release_hold", 403, { p_hold: first.hold });
  await operate(holdReleaser, id, "release_hold", 200, { p_hold: first.hold });
  await operate(approver, id, "approve", 409);
  expect((await (await request(owner, path + "status")).json()).warnings).toContain("evidence_hold");
  await operate(holdReleaser, id, "release_hold", 200, { p_hold: second.hold });
  await operate(approver, id, "approve", 200);
  await operate(approver, id, "claim", 403, { p_step: "profile_projection" });
  const step = { p_step: "profile_projection" };
  const duplicateClaims = await Promise.all([operate(worker, id, "claim", 200, step), operate(worker, id, "claim", 200, step)]);
  expect(duplicateClaims[0].lease).toBe(duplicateClaims[1].lease);
  const firstLease = { ...step, p_lease: duplicateClaims[0].lease };
  await operate(worker, id, "effect", 409, { ...step, p_lease: randomUUID() });
  await operate(worker, id, "reconcile", 409, firstLease);
  sql(`update private.lifecycle_steps set lease_until=now()-interval '1 second' where plan_id='${id}' and step='profile_projection';`);
  await operate(worker, id, "claim", 409, step);
  expect((await operate(worker, id, "reconcile", 200, step)).status).toBe("retryable");
  const next = await operate(worker, id, "claim", 200, step);
  const liveLease = { ...step, p_lease: next.lease };
  const lateHold = await operate(holdPlacer, id, "place_hold", 200, { ...hold, p_request: randomUUID() });
  await operate(worker, id, "effect", 409, liveLease);
  await operate(holdReleaser, id, "release_hold", 200, { p_hold: lateHold.hold });

  // Inject a SQL transaction failure after applying the simulation marker. The RPC and audit must both roll back.
  const proof = claimsForSql(worker);
  expect(() => sql(`begin; select public.lifecycle_operator_for_api(${proof.join(",")},'${id}','effect',
    null,null,null,null,null,'profile_projection','${liveLease.p_lease}'); select 1/0; commit;`)).toThrow();
  expect(sql(`select fixture_present from private.lifecycle_steps where plan_id='${id}' and step='profile_projection';`)).toBe("t");
  await operate(worker, id, "effect", 200, liveLease);
  await operate(worker, id, "effect", 200, liveLease);
  expect((await (await request(owner, path + "status")).json()).state).toBe("partial");
  await operate(worker, id, "reconcile", 200, liveLease);
  const provider = { p_step: "provider_media" };
  const providerLease = await operate(worker, id, "claim", 200, provider);
  await operate(worker, id, "effect", 200, { ...provider, p_lease: providerLease.lease });
  await operate(worker, id, "reconcile", 200, { ...provider, p_lease: providerLease.lease });
  expect((await (await request(owner, path + "status")).json()).state).toBe("simulated");
  expect(sql(`select count(*) from private.lifecycle_events where plan_id='${id}' and kind='simulated_effect';`)).toBe("2");

  sql(`update private.lifecycle_steps set fixture_present=true where plan_id='${id}';`);
  expect((await (await request(owner, path + "status")).json()).state).toBe("quarantined");
  await operate(approver, id, "restore_release", 409);
  await operate(restoreOperator, id, "restore_reapply", 200);
  expect((await (await request(owner, path + "status")).json()).state).toBe("quarantined");
  await operate(restoreOperator, id, "restore_release", 403);
  await operate(approver, id, "restore_release", 200);
  expect((await (await request(owner, path + "status")).json()).state).toBe("simulated");
  expect(sql(`select count(*) from auth.users where id='${owner.id}';`)).toBe("1");
  expect(sql(`select count(*) from public.profiles where user_id='${owner.id}';`)).toBe("1");
  const session = claims(owner).p_session;
  sql(`delete from auth.sessions where id='${session}';`);
  expect((await request(owner, path + "status")).status).toBe(401);
});

function claimsForSql(member: Member) {
  const proof = claims(member);
  expect(Number.isInteger(proof.p_totp)).toBe(true);
  return [`'${proof.p_actor}'`, `'${proof.p_session}'`, String(proof.p_aal2), String(proof.p_totp)];
}

test("the lifecycle workspace supports safe planning and confirmation in four languages", async ({ page, context, makeMember }) => {
  const owner = await makeMember();
  allow(owner);
  const secret = await enroll(owner);
  await inEnglish(context);
  await login(page, owner);
  await solveMfa(page, secret);
  await page.goto("/settings/privacy-requests");
  const t = privacyMessages.en;
  const l = lifecycleMessages.en;
  await page.getByRole("combobox", { name: t.kind }).selectOption("deletion");
  await page.getByRole("button", { name: t.submit }).click();
  await page.getByRole("button", { name: t.details }).click();
  await expect(page.getByText(l.state.preview, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: l.save }).click();
  await page.getByRole("button", { name: l.confirm }).click();
  await expect(page.getByRole("button", { name: l.confirm })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const locale of ["ht", "fr", "es", "en"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: "http://127.0.0.1:5400" }]);
    await page.reload();
    await page.getByRole("button", { name: privacyMessages[locale].details }).click();
    await expect(page.getByText(lifecycleMessages[locale].state.review_required, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
