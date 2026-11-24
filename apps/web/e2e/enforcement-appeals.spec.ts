import { randomUUID } from "node:crypto";
import type { EnforcementAppeal, MemberEnforcementAppeals, StaffEnforcementAppeals } from "@ayinou/shared";
import { enforcementAppealMessages } from "../src/lib/enforcement-appeal-i18n";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, sql, test, totp, type Member } from "./fixtures";

const memberPath = "/api/v1/me/enforcement-appeals";
const staffPath = "/api/v1/moderation/enforcement-appeals";
const privateText = "Synthetic appeal explanation that must stay private.";
const decisionText = "Synthetic written findings after independent review.";

async function elevate(member: Member) {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing test factor");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token };
}

async function request(actor: Member, path: string, expected: number, method = "GET", body?: object, workspace?: string) {
  const response = await fetch(api + path, {
    method, headers: { Authorization: "Bearer " + actor.token, ...(workspace && { "X-Ayinou-Workspace": workspace }),
      ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(expected);
  return data;
}

const workspace = async (actor: Member, kind = "admin_workspace") =>
  (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind })).id as string;

const newAppeal = (domain: string, reference: string) =>
  ({ action: "submit", domain, reference, requestId: randomUUID(), reason: privateText });
const staffAction = (actor: Member, lane: "admin" | "review", binding: string, item: EnforcementAppeal,
  action: string, status = 200, reviewer?: string): Promise<EnforcementAppeal> =>
  request(actor, staffPath + "?lane=" + lane, status, "POST", {
    id: item.id, revision: item.revision, requestId: randomUUID(), action, reason: decisionText, ...(reviewer && { reviewer }),
  }, binding);

const sanction = (actor: Member, binding: string, subject: Member, action: "suspend" | "ban") =>
  request(actor, "/api/v1/admin/accounts/" + subject.id, 200, "PATCH", {
    action, confirmed: true, expected: null, requestId: randomUUID(), reason: decisionText, category: "safety",
    ...(action === "suspend" ? { minutes: 60 } : {}),
  }, binding);
const eventForm = () => ({
  version: null, request: randomUUID(), organizationId: null, communityId: null, projectId: null, title: "M2.4 fixture event",
  description: "Public event fixture with a private venue", category: "education", format: "hybrid", visibility: "public",
  startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 90_000_000).toISOString(),
  timeZone: "America/Port-au-Prince", country: "HT", department: "HT-OU", locality: "Port-au-Prince",
  venue: "Private venue fixture", meetingUrl: "https://example.com/m24-private-link", coverUrl: null, capacity: null, language: "en",
});

test("M2.4 independent appeals preserve decision authority and unrelated sanctions @smoke", async ({ makeMember, page, context }) => {
  test.setTimeout(150_000);
  const [f, a, r, suspended, banned, limited, expired, organizer, reporter, outsider] = await Promise.all(
    Array.from({ length: 10 }, () => makeMember({ visible: true })));
  for (const member of [f, a, r, suspended, banned, limited, expired, organizer, reporter, outsider]) finishPersonalOnboarding(member);
  const [founder, admin, reviewer, organizerMod, reporterMod] = await Promise.all([f, a, r, organizer, reporter].map(elevate));
  sql(`insert into private.platform_bootstrap(user_id) values('${f.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${f.id}','${f.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into public.role_assignments(user_id,role) values('${a.id}','administrator'),
      ('${organizer.id}','moderator'),('${reporter.id}','moderator');
    insert into private.verification_reviewers(user_id) values('${r.id}'),('${a.id}'),('${f.id}'),('${reporter.id}');`);
  try {
    const [fw, aw, rw, issuerReview] = await Promise.all([
      workspace(founder), workspace(admin), workspace(reviewer, "verification_workspace"), workspace(admin, "verification_workspace"),
    ]);
    const account = await sanction(admin, aw, suspended, "suspend");
    const protectedBan = await sanction(founder, fw, banned, "ban");
    const aged = await sanction(admin, aw, expired, "suspend");
    sql(`update private.m22_account_sanctions set started_at=now()-interval '14 days',expires_at=now()-interval '13 days'
      where id='${aged.reference}';`);
    await request(expired, memberPath, 410, "POST", newAppeal("account", aged.reference));
    await request(outsider, memberPath, 404, "POST", newAppeal("account", account.reference));
    await apiCall(suspended, "/api/v1/me/profile", 401);

    const details: MemberEnforcementAppeals = await request(suspended, memberPath, 200);
    expect(details.decisions).toMatchObject([{ id: account.reference, canAppeal: true, kind: "suspended" }]);
    expect(JSON.stringify(details)).not.toContain(decisionText);
    const input = newAppeal("account", account.reference);
    const same = await Promise.all([request(suspended, memberPath, 200, "POST", input), request(suspended, memberPath, 200, "POST", input)]);
    expect(same[0]).toEqual(same[1]);
    let appeal: EnforcementAppeal = same[0];
    await request(suspended, memberPath, 409, "POST", newAppeal("account", account.reference));
    await request(outsider, memberPath, 404, "POST", { action: "withdraw", reference: appeal.id, revision: appeal.revision, requestId: randomUUID() });
    await staffAction(admin, "admin", aw, appeal, "assign", 403, admin.id);
    await staffAction(founder, "admin", fw, appeal, "assign", 403, admin.id);
    expect((await request(admin, staffPath + "?lane=review", 200, "GET", undefined, issuerReview)).cases).toEqual([]);
    expect(JSON.stringify(await request(admin, staffPath + "?lane=admin", 200, "GET", undefined, aw))).not.toContain(privateText);
    await request(reviewer, staffPath + "?lane=review", 403, "GET", undefined, aw);
    appeal = await staffAction(admin, "admin", aw, appeal, "assign", 200, reviewer.id);
    const assigned: StaffEnforcementAppeals = await request(reviewer, staffPath + "?lane=review", 200, "GET", undefined, rw);
    expect(assigned.cases[0].history).toContainEqual(expect.objectContaining({ action: "submit", narrative: privateText }));
    appeal = await staffAction(reviewer, "review", rw, appeal, "return");
    await request(suspended, memberPath, 409, "POST", { action: "correct", reference: appeal.id, revision: appeal.revision - 1,
      requestId: randomUUID(), reason: privateText });
    appeal = await request(suspended, memberPath, 200, "POST", { action: "correct", reference: appeal.id,
      revision: appeal.revision, requestId: randomUUID(), reason: privateText + " Details." });
    await apiCall(suspended, "/api/v1/me/profile", 401);
    await staffAction(reviewer, "review", rw, appeal, "overturn");
    await apiCall(suspended, "/api/v1/me/profile", 401);
    const renewed = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const { data: fresh } = await renewed.auth.signInWithPassword({ email: suspended.email, password: suspended.password });
    await apiCall({ ...suspended, token: fresh.session!.access_token }, "/api/v1/me/profile", 200);
    expect((await request(suspended, memberPath, 200)).notices).toContainEqual(expect.objectContaining({ action: "overturned" }));

    let banAppeal: EnforcementAppeal = await request(banned, memberPath, 200, "POST", newAppeal("account", protectedBan.reference));
    await staffAction(admin, "admin", aw, banAppeal, "assign", 403, founder.id);
    banAppeal = await staffAction(admin, "admin", aw, banAppeal, "assign", 200, reviewer.id);
    banAppeal = await staffAction(reviewer, "review", rw, banAppeal, "overturn");
    expect(banAppeal.status).toBe("protected_pending");
    await staffAction(admin, "admin", aw, banAppeal, "release", 403);
    expect(sql(`select revoked_at is null from private.m22_account_sanctions where id='${protectedBan.reference}';`)).toBe("t");
    await inEnglish(context);
    await login(page, banned);
    await expect(page).toHaveURL(/\/account-access$/);
    const languages = page.getByRole("combobox").last();
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await languages.selectOption(locale);
      await expect(page.getByRole("heading", { name: enforcementAppealMessages[locale].title, exact: true })).toBeVisible();
      await expect(page.getByText(enforcementAppealMessages[locale].protected_pending, { exact: false }).first()).toBeVisible();
    }
    await staffAction(founder, "admin", fw, banAppeal, "release");
    expect(sql(`select revoked_at is not null from private.m22_account_sanctions where id='${protectedBan.reference}';`)).toBe("t");

    const feature = await request(admin, "/api/v1/moderation/feature-enforcement", 200, "POST", {
      subject: limited.id, requestId: randomUUID(), action: "restrict", capabilities: ["post", "follow"],
      scope: "platform", scopeId: null, minutes: 120, category: "integrity", reason: decisionText, confirmed: true,
    }, aw);
    const posting = feature.records.find((item: { capability: string }) => item.capability === "post").id;
    let featureAppeal: EnforcementAppeal = await request(limited, memberPath, 200, "POST", newAppeal("feature", posting));
    featureAppeal = await staffAction(admin, "admin", aw, featureAppeal, "assign", 200, reviewer.id);
    await staffAction(reviewer, "review", rw, featureAppeal, "overturn");
    await apiCall(limited, "/api/v1/posts", 201, "POST", { body: "Posting restored", visibility: "public", language: "en" });
    await apiCall(limited, "/api/v1/members/" + outsider.handle + "/follow", 403, "PUT");
    const followAppeal = await request(limited, memberPath, 200, "POST", newAppeal("feature", feature.records.find((item: { capability: string }) => item.capability === "follow").id));
    await request(limited, memberPath, 200, "POST", { action: "withdraw", reference: followAppeal.id, revision: followAppeal.revision, requestId: randomUUID() });

    const draft = (await apiCall(organizerMod, "/api/v1/events", 200, "POST", eventForm())).event;
    const eventPath = "/api/v1/events/" + draft.id;
    await apiCall(organizerMod, eventPath + "/status", 200, "POST", { status: "published", version: draft.version });
    await apiCall(reporterMod, eventPath + "/report", 200, "POST", { category: "other", note: "Private reporter evidence" });
    const report = sql(`select id from feed_data.event_reports where event_id='${draft.id}';`);
    const eventModeration = "/api/v1/events/moderation/reports/" + report;
    const moderation = { action: "restricted", reason: decisionText };
    await apiCall(organizerMod, eventModeration, 403, "POST", moderation);
    await apiCall(reporterMod, eventModeration, 403, "POST", moderation);
    await apiCall(admin, eventModeration, 200, "POST", moderation);
    await apiCall(outsider, eventPath, 404);
    const eventRecord: MemberEnforcementAppeals = await request(organizerMod, memberPath + "?event=" + draft.id, 200);
    expect(eventRecord.decisions).toMatchObject([{ kind: "event_restriction", canAppeal: true }]);
    expect(JSON.stringify(eventRecord)).not.toMatch(/Private reporter evidence|private-link|Private venue/);
    expect(eventRecord.notices).toContainEqual(expect.objectContaining({ action: "event_restricted" }));
    let eventAppeal: EnforcementAppeal = await request(organizerMod, memberPath, 200, "POST", newAppeal("event", eventRecord.decisions[0].id));
    await staffAction(admin, "admin", aw, eventAppeal, "assign", 403, reporter.id);
    eventAppeal = await staffAction(admin, "admin", aw, eventAppeal, "assign", 200, reviewer.id);
    await staffAction(reviewer, "review", rw, eventAppeal, "overturn");
    await apiCall(outsider, eventPath, 200);
    expect(sql(`select count(*) from feed_data.event_audit where event_id='${draft.id}' and report_id='${report}'
      and action in ('restricted','restored');`)).toBe("2");
    expect(sql(`select count(*) from private.a1a_audit_source where source='enforcement_appeal'
      and new_state->>'caseReference'='${eventAppeal.id}';`)).toBe("4");
    const canceled = (await apiCall(organizerMod, "/api/v1/events", 200, "POST", eventForm())).event;
    const canceledPath = "/api/v1/events/" + canceled.id;
    await apiCall(organizerMod, canceledPath + "/status", 200, "POST", { status: "published", version: canceled.version });
    await apiCall(reporterMod, canceledPath + "/report", 200, "POST", { category: "other", note: "" });
    const canceledReport = sql(`select id from feed_data.event_reports where event_id='${canceled.id}';`);
    await apiCall(admin, "/api/v1/events/moderation/reports/" + canceledReport, 200, "POST", moderation);
    const restrictedEvent = (await apiCall(organizerMod, canceledPath, 200)).event;
    await apiCall(organizerMod, canceledPath + "/status", 200, "POST", { status: "canceled", version: restrictedEvent.version });
    const canceledDecision = sql(`select moderation_decision_id from feed_data.events where id='${canceled.id}';`);
    let canceledAppeal = await request(organizerMod, memberPath, 200, "POST", newAppeal("event", canceledDecision));
    canceledAppeal = await staffAction(admin, "admin", aw, canceledAppeal, "assign", 200, reviewer.id);
    expect(await staffAction(reviewer, "review", rw, canceledAppeal, "overturn")).toMatchObject({ enforcementChanged: false });
    expect(sql(`select status='canceled' and moderated_at is not null from feed_data.events where id='${canceled.id}';`)).toBe("t");

    const org = sql(`with m as (insert into private.organizations(handle,name,kind,country_code,created_by)
      values('m24-${randomUUID().slice(0,8)}','Protected conflict fixture','nonprofit','HT','${organizer.id}') returning id)
      select id from m;`);
    sql(`insert into private.organization_memberships(organization_id,user_id,role)
      values('${org}','${organizer.id}','owner'),('${org}','${founder.id}','editor');`);
    const high = await request(founder, "/api/v1/moderation/feature-enforcement", 200, "POST", {
      subject: organizer.id, requestId: randomUUID(), action: "restrict", capabilities: ["organization_manage"],
      scope: "organization", scopeId: org, minutes: 120, category: "integrity", reason: decisionText, confirmed: true,
    }, fw);
    let protectedAppeal = await request(organizerMod, memberPath, 200, "POST", newAppeal("feature", high.records[0].id));
    protectedAppeal = await staffAction(admin, "admin", aw, protectedAppeal, "assign", 200, reviewer.id);
    protectedAppeal = await staffAction(reviewer, "review", rw, protectedAppeal, "overturn");
    await staffAction(founder, "admin", fw, protectedAppeal, "release", 403);
    expect((await request(organizerMod, memberPath, 200)).appeals).toContainEqual(expect.objectContaining({
      id: protectedAppeal.id, status: "protected_pending",
    }));
    const center = await request(admin, "/api/v1/admin/moderation-center?view=history&action=appeal_overturn", 200, "GET", undefined, aw);
    expect(center.rows).toContainEqual(expect.objectContaining({ caseReference: eventAppeal.id, action: "appeal_overturn" }));
    expect(JSON.stringify(center)).not.toMatch(/Private reporter evidence|Synthetic written findings/);
    const exposed = await localClient("AYINOU_E2E_SUPABASE_PUBLIC").rpc("m24_staff_appeals");
    expect(exposed.error).not.toBeNull();
    expect(sql("select count(*) from pg_proc where proname='m24_staff_decision' and has_function_privilege('authenticated',oid,'execute');")).toBe("0");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${f.id}';
      delete from public.role_assignments where user_id in ('${a.id}','${organizer.id}','${reporter.id}');
      delete from private.verification_reviewers where user_id in ('${r.id}','${a.id}','${f.id}','${reporter.id}');`);
  }
});
