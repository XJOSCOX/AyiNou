import { randomUUID } from "node:crypto";
import type { ModerationCenterPage } from "@ayinou/shared";
import {
  api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login,
  openAdministration, solveMfa, sql, test, totp, type Member,
} from "./fixtures";
import { adminMessages } from "../src/lib/admin-i18n";
import { moderationCenterMessages } from "../src/lib/moderation-center-i18n";

const endpoint = "/api/v1/admin/moderation-center";
const evidence = "Synthetic confidential report text";

async function elevated(member: Member) {
  const secret = await enroll(member);
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = (await client.auth.mfa.listFactors()).data?.totp[0];
  if (!factor) throw new Error("Missing synthetic factor");
  const result = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (result.error) throw result.error;
  return { ...member, token: result.data.access_token, secret };
}

async function center(member: Member, query: string, expected: number, workspace?: string): Promise<ModerationCenterPage> {
  const response = await fetch(api + endpoint + "?" + query, {
    headers: { Authorization: "Bearer " + member.token, ...(workspace && { "X-Ayinou-Workspace": workspace }) },
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(expected);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(JSON.stringify(result)).not.toContain(evidence);
  return result;
}

test("M2.1 aggregates safe records, rechecks workspace and roles, and keeps native decisions @smoke", async ({ makeMember }) => {
  test.setTimeout(120_000);
  const [founder, admin, moderator, local, author] = await Promise.all(Array.from({ length: 5 }, () => makeMember({ visible: true })));
  for (const member of [founder, admin, moderator, local, author]) finishPersonalOnboarding(member);
  const [lead, staff, mod, scoped] = await Promise.all([founder, admin, moderator, local].map(elevated));
  const [post, scopedPost, report, localReport, authorReport, event, eventReport, project, projectReport, trustReport] =
    Array.from({ length: 10 }, randomUUID);
  const room = sql("select id from feed_data.communities where kind='department' order by slug limit 1;");
  const scope = sql(`select slug from feed_data.communities where id='${room}';`);
  sql(`insert into private.platform_bootstrap(user_id) values ('${lead.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values ('${lead.id}','${lead.id}','first_account_bootstrapped','Local moderation center fixture');
    insert into public.role_assignments(user_id,role) values ('${staff.id}','administrator'),('${mod.id}','moderator');
    insert into feed_data.community_staff(community_id,user_id,role) values ('${room}','${scoped.id}','moderator');
    insert into feed_data.posts(id,author_id,body,language,visibility,status,community_id) values
      ('${post}','${author.id}','${evidence}','en','public','published',null),
      ('${scopedPost}','${author.id}','${evidence}','en','members_only','published','${room}');
    insert into feed_data.content_reports(id,post_id,reporter_id,category,note) values
      ('${report}','${post}','${scoped.id}','spam','${evidence}'),
      ('${localReport}','${scopedPost}','${mod.id}','privacy','${evidence}'),
      ('${authorReport}','${post}','${mod.id}','spam','${evidence}');
    insert into private.account_restrictions(user_id,status,reason) values ('${author.id}','suspended','${evidence}');
    insert into feed_data.events(id,creator_id,request_id,request_hash,title,description,category,format,visibility,status,
      starts_at,ends_at,time_zone,language) values ('${event}','${mod.id}','${event}',decode('01','hex'),'Synthetic workshop',
      'Test event text','education','online','members','published',now()+interval '1 day',now()+interval '25 hours','UTC','en');
    insert into feed_data.event_reports(id,event_id,actor_id,category,note)
      values ('${eventReport}','${event}','${scoped.id}','spam','${evidence}');
    insert into private.community_projects(id,creator_id,owner_user_id,submission_key,request_digest,status,approved_at)
      values ('${project}','${mod.id}','${mod.id}','${project}',decode('02','hex'),'approved',now());
    insert into private.project_reports(id,project_id,reporter_id,category,explanation)
      values ('${projectReport}','${project}','${staff.id}','unsafe','${evidence}');
    insert into private.impersonation_reports(id,reporter_id,subject_id,kind,explanation,reference_urls)
      values ('${trustReport}','${staff.id}','${author.id}','profile','${evidence}','{}');`);
  try {
    const f = (await apiCall(lead, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    const a = (await apiCall(staff, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id;
    await center(lead, "view=overview", 404);
    await center(lead, "view=overview", 404, a);
    await center(admin, "view=overview", 404, a);
    await center(mod, "view=overview", 404, a);
    await center(scoped, "view=reports&scope=" + scope, 404, a);
    await apiCall(mod, "/api/v1/moderation/feed?scope=reports&target=posts", 200);
    await apiCall(scoped, "/api/v1/communities/" + scope + "/moderation?scope=reports&target=posts", 200);
    await apiCall(lead, "/api/v1/admin/accounts/" + staff.id, 409, "PATCH",
      { action: "status", value: "suspended", reason: "Protected fixture account change" });
    const summary = await center(lead, "view=overview", 200, f);
    expect(summary.metrics).toMatchObject({ pendingReports: expect.any(Number), eventReports: expect.any(Number), projectReports: expect.any(Number) });
    expect(summary.metrics!.pendingReports).toBeGreaterThanOrEqual(6);
    expect(summary.metrics!.eventReports).toBeGreaterThanOrEqual(1);
    expect(summary.metrics!.projectReports).toBeGreaterThanOrEqual(1);
    for (const [target, id, domain] of [[event, eventReport, "events"], [project, projectReport, "projects"], [author.id, trustReport, "trust"]]) {
      const visible = await center(lead, "view=reports&status=pending&target=" + target, 200, f);
      expect(visible.rows).toContainEqual(expect.objectContaining({ id, domain }));
    }
    expect((await center(staff, "view=reports&domain=projects&target=" + project, 200, a)).rows).toEqual([]);
    expect((await center(staff, "view=reports&domain=trust&target=" + author.id, 200, a)).rows).toEqual([]);
    expect((await center(lead, "view=reports&from=2020-01-01T00:00:00Z&to=2020-01-03T00:00:00Z", 200, f)).rows).toEqual([]);
    const scopedRows = await center(staff, "view=reports&domain=communities&scope=" + scope, 200, a);
    expect(scopedRows.rows).toContainEqual(expect.objectContaining({ id: localReport, source: "post_report", scopeKey: scope }));
    const query = "view=reports&domain=feed&status=pending&limit=1&target=" + post;
    const first = await center(lead, query, 200, f);
    expect(first.rows).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await center(lead, query + "&cursor=" + first.nextCursor, 200, f);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
    expect([first.rows[0].id, second.rows[0].id]).toEqual(expect.arrayContaining([report, authorReport]));
    await center(staff, query + "&cursor=" + first.nextCursor, 400, a);
    const restrictions = await center(lead, "view=restrictions&domain=accounts&target=" + author.id, 200, f);
    expect(restrictions.rows).toMatchObject([{ id: author.id, status: "suspended", expiresAt: null }]);

    await apiCall(lead, "/api/v1/events/moderation/reports/" + eventReport, 200, "POST", { action: "restricted", reason: evidence });
    const eventHold = await center(staff, "view=restrictions&domain=events&target=" + event, 200, a);
    expect(eventHold.rows).toMatchObject([{ id: event, domain: "events", expiresAt: null }]);
    await apiCall(lead, "/api/v1/moderation/posts/" + post, 204, "PATCH", { version: 1, action: "hide", reason: evidence });
    const hidden = await center(staff, "view=content&status=hidden&target=" + post, 200, a);
    expect(hidden.rows).toMatchObject([{ target: "post", targetId: post, status: "hidden" }]);
    const history = await center(staff, "view=history&action=hide&target=" + post, 200, a);
    expect(history.rows).toMatchObject([{ source: "post_moderation", targetId: post, action: "hide", actorRef: null }]);

    expect(sql(`select not has_table_privilege('authenticated','private.m21_report_source','select')
      and exists(select from pg_proc where proname='m21_moderation_center_for_api'
        and has_function_privilege('service_role',oid,'execute')
        and not has_function_privilege('authenticated',oid,'execute') and not has_function_privilege('anon',oid,'execute'));`)).toBe("t");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${lead.id}';
      delete from public.role_assignments where user_id in ('${staff.id}','${mod.id}');
      delete from feed_data.community_staff where user_id='${scoped.id}';
      delete from private.account_restrictions where user_id='${author.id}';
      delete from feed_data.posts where id in ('${post}','${scopedPost}');
      delete from private.impersonation_reports where id='${trustReport}';
      delete from private.community_projects where id='${project}';
      delete from feed_data.event_reports where id='${eventReport}';
      delete from feed_data.event_audit where event_id='${event}';
      delete from feed_data.events where id='${event}';`);
  }
});

test("M2.1 fits desktop and mobile and keeps navigation usable in four languages", async ({ makeMember, page, context }) => {
  test.setTimeout(120_000);
  const admin = await makeMember();
  finishPersonalOnboarding(admin);
  const secret = await enroll(admin);
  sql(`insert into public.role_assignments(user_id,role) values ('${admin.id}','administrator');`);
  try {
    await inEnglish(context);
    await login(page, admin);
    await solveMfa(page, secret);
    await openAdministration(page);
    await page.getByRole("button", { name: moderationCenterMessages.en.overview, exact: true }).click();
    await expect(page.getByText(moderationCenterMessages.en.hiddenContent, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: moderationCenterMessages.en.content, exact: true }).click();
    await expect(page.getByRole("link", { name: moderationCenterMessages.en.feedTool })).toHaveAttribute("href", "/feed/moderation");

    await page.setViewportSize({ width: 320, height: 850 });
    const select = page.getByRole("banner").getByRole("combobox").last();
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await select.selectOption(locale);
      const t = moderationCenterMessages[locale];
      await page.getByRole("button", { name: adminMessages[locale].navigationSections, exact: true }).press("Enter");
      await page.getByRole("button", { name: t.reports, exact: true }).press("Enter");
      await expect(page.getByRole("heading", { name: t.reports, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: t.filter, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
  } finally {
    sql(`delete from public.role_assignments where user_id='${admin.id}' and role='administrator';`);
  }
});
