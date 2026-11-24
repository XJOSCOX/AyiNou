import { randomUUID } from "node:crypto";
import type { AdminAccount, MemberAccountEnforcement, ModerationCenterPage } from "@ayinou/shared";
import { suspensionMinutes } from "@ayinou/shared";
import { api, apiCall, enroll, expect, finishPersonalOnboarding, inEnglish, localClient, login, sql, test, totp, type Member } from "./fixtures";
import { enforcementAppealMessages } from "../src/lib/enforcement-appeal-i18n";

const reason = "Synthetic private narrative for account enforcement";
const commands = "/api/v1/admin/accounts/";
type Receipt = { eventId: string; reference: string };

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

async function request<T>(actor: Member, path: string, status: number, workspace?: string, body?: object): Promise<T> {
  const response = await fetch(api + path, {
    method: body ? "PATCH" : "GET",
    headers: { Authorization: "Bearer " + actor.token, ...(workspace && { "X-Ayinou-Workspace": workspace }),
      ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result;
}

async function notice(actor: Member): Promise<MemberAccountEnforcement> {
  const key = process.env.AYINOU_E2E_SUPABASE_PUBLIC;
  if (!key || process.env.AYINOU_E2E_SUPABASE_URL !== "http://127.0.0.1:55321") throw new Error("Disposable stack required");
  const response = await fetch("http://127.0.0.1:55321/rest/v1/rpc/m22_my_account_enforcement", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + actor.token, "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  expect(response.ok, JSON.stringify(result)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(reason);
  return result;
}

const command = (fields: object) => ({ confirmed: true, expected: null, requestId: randomUUID(), reason, ...fields });
const workspace = async (actor: Member) =>
  (await apiCall(actor, "/api/v1/me/private-workflows", 200, "POST", { kind: "admin_workspace" })).id as string;
const adminRow = async (actor: Member, scope: string, subject: Member) =>
  (await request<{ accounts: AdminAccount[] }>(actor, commands.slice(0, -1) + "?q=" + subject.id, 200, scope)).accounts[0];

test("M2.2 protects account authority, sessions, legacy history, and limits episodes @smoke", async ({ makeMember, page, context }) => {
  test.setTimeout(150_000);
  const [owner, delegate, moderator, ...members] = await Promise.all(
    Array.from({ length: 12 }, () => makeMember({ visible: true })));
  for (const member of [owner, delegate, moderator, ...members]) finishPersonalOnboarding(member);
  const [founder, admin, mod] = await Promise.all([owner, delegate, moderator].map(elevate));
  const legacy = members[7], banned = members[8];
  sql(`insert into private.platform_bootstrap(user_id) values('${founder.id}');
    insert into private.platform_admin_audit(actor_id,subject_id,event,reason)
      values('${founder.id}','${founder.id}','first_account_bootstrapped','Synthetic Founder provenance');
    insert into public.role_assignments(user_id,role) values('${admin.id}','administrator'),('${mod.id}','moderator');
    insert into private.account_restrictions(user_id,status,reason) values('${legacy.id}','banned','${reason}');`);
  try {
    const f = await workspace(founder), a = await workspace(admin);
    const suspend = command({ action: "suspend", minutes: 60, category: "safety" });
    const ban = command({ action: "ban", category: "integrity" });
    const path = commands + banned.id;
    await request(admin, path, 403, a, ban);
    await request(mod, path, 403, a, ban);
    await request(founder, path, 403, a, ban);
    await request(founder, path, 403, undefined, ban);
    await request(founder, path, 400, f, { ...ban, confirmed: false });
    await request(founder, commands + admin.id, 409, f, suspend);
    await request(admin, path, 403, a, { action: "status", value: "banned", reason });
    await request(founder, path, 403, f, { action: "status", value: "suspended", reason });
    expect(sql(`select not has_function_privilege('authenticated',
      'public.m22_enforce_account_for_api(uuid,uuid,boolean,bigint,uuid,uuid,text,uuid,uuid,uuid,int,text,text,boolean)','execute')
      and not has_table_privilege('service_role','private.m22_account_events','insert');`)).toBe("t");
    const legacyRow = await adminRow(founder, f, legacy);
    expect(legacyRow.enforcement).toMatchObject({ expiresAt: null, kind: "banned", legacy: true });
    await request(admin, commands + legacy.id, 403, a, command({ action: "lift_legacy", reference: legacy.id }));

    const receipts: Receipt[] = [];
    for (const [index, minutes] of [...suspensionMinutes, 91].entries()) {
      const subject = members[index];
      const input = command({ action: "suspend", minutes, category: "safety" });
      const receipt = await request<Receipt>(admin, commands + subject.id, 200, a, input);
      receipts.push(receipt);
      const replay = await request<Receipt>(admin, commands + subject.id, 200, a, input);
      expect(replay).toEqual(receipt);
      expect(sql(`select extract(epoch from expires_at-started_at)::int from private.m22_account_sanctions
        where id='${receipt.reference}';`)).toBe(String(minutes * 60));
    }

    await request(admin, commands + members[0].id, 400, a, { ...suspend, minutes: 129601 });
    await request(admin, commands + members[0].id, 409, a, suspend);
    const subject = members[0];
    const active = await adminRow(admin, a, subject);
    expect(active.enforcement).toMatchObject({ kind: "suspended", category: "safety", status: "active" });
    const extended = await request<Receipt>(admin, commands + subject.id, 200, a, command({
      action: "extend", expected: active.restrictionRevision, reference: receipts[0].reference, minutes: 1440,
    }));
    expect(extended.reference).toBe(receipts[0].reference);
    const revision = (await adminRow(admin, a, subject)).restrictionRevision;
    await request(admin, commands + subject.id, 409, a, command({
      action: "extend", expected: revision, reference: receipts[0].reference, minutes: 129600,
    }));
    await apiCall(subject, "/api/v1/me/profile", 401);
    expect((await notice(subject)).notices).toMatchObject([{ reference: receipts[0].reference, status: "active" }]);
    sql(`update auth.users set banned_until=now()+interval '1 hour' where id='${subject.id}';`);
    await request(admin, commands + subject.id, 200, a, command({
      action: "lift", expected: revision, reference: receipts[0].reference,
    }));
    expect(sql(`select not private.institution_actor('${subject.id}');`)).toBe("t");
    sql(`update auth.users set banned_until=null where id='${subject.id}';`);
    await apiCall(subject, "/api/v1/me/profile", 401);
    const released = await adminRow(admin, a, subject);
    await request(admin, commands + subject.id, 409, a, command({
      action: "suspend", category: "safety", minutes: 60, expected: released.restrictionRevision,
    }));
    const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const fresh = await client.auth.signInWithPassword({ email: subject.email, password: subject.password });
    expect(fresh.error).toBeNull();
    await apiCall({ ...subject, token: fresh.data.session!.access_token }, "/api/v1/me/profile", 200);

    const timed = members[1], timedId = receipts[1].reference;
    expect(sql(`select (select count(*) from private.m22_effective_sanctions(subject_id,expires_at-interval '1 microsecond'))=1
      and (select count(*) from private.m22_effective_sanctions(subject_id,expires_at))=0
      from private.m22_account_sanctions where id='${timedId}';`)).toBe("t");
    sql(`update private.m22_account_sanctions set started_at=now()-interval '2 hours',expires_at=now()-interval '1 second'
      where id='${timedId}';`);
    expect(sql(`select private.institution_actor('${timed.id}');`)).toBe("t");
    // Move the synthetic session to before expiry so it represents a session held while restricted.
    const timedSession = JSON.parse(Buffer.from(timed.token.split(".")[1], "base64url").toString()).session_id as string;
    sql(`update auth.sessions set created_at=now()-interval '1 minute' where id='${timedSession}' and user_id='${timed.id}';`);
    await apiCall(timed, "/api/v1/me/profile", 401);
    const historyPath = "/api/v1/admin/moderation-center?view=history&action=restriction_expired&target=" + timed.id;
    const expired = await request<ModerationCenterPage>(admin, historyPath, 200, a);
    expect(expired.rows).toMatchObject([{ action: "restriction_expired", caseReference: timedId }]);
    expect((await request<ModerationCenterPage>(admin, historyPath, 200, a)).rows).toEqual(expired.rows);

    const permanent = await request<Receipt>(founder, path, 200, f, ban);
    const bannedRow = await adminRow(founder, f, banned);
    expect(bannedRow.enforcement).toMatchObject({ kind: "banned", expiresAt: null });
    const liftBan = command({ action: "lift", expected: bannedRow.restrictionRevision, reference: permanent.reference });
    await request(admin, path, 403, a, liftBan);

    await inEnglish(context);
    await login(page, banned);
    await expect(page).toHaveURL(/\/account-access$/);
    await expect(page.getByRole("listitem").getByText(permanent.reference, { exact: true })).toBeVisible();
    const select = page.getByRole("combobox").last();
    for (const locale of ["en", "ht", "fr", "es"] as const) {
      await select.selectOption(locale);
      await expect(page.getByRole("heading", { name: enforcementAppealMessages[locale].title, exact: true })).toBeVisible();
    }
    await request(founder, path, 200, f, liftBan);
    await request(founder, commands + legacy.id, 200, f, command({ action: "lift_legacy", reference: legacy.id }));
    expect(sql(`select (before_state->>'reason') is not null from private.m22_account_events
      where subject_id='${legacy.id}' and action='ban_lifted';`)).toBe("t");
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${owner.id}';
      delete from public.role_assignments where user_id in ('${delegate.id}','${moderator.id}');`);
  }
});
