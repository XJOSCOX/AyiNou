import { randomUUID } from "node:crypto";
import type { ActiveSessionList, PrivateFlow } from "@ayinou/shared";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, localClient, login, enroll, sql,
  solveMfa, test, totp, web, type Member } from "./fixtures";
import { sessionSecurityMessages } from "../src/lib/session-security-i18n";

const sessions = "/api/v1/me/sessions";
const privateFlows = "/api/v1/me/private-workflows";
const intents = "/api/v1/me/organization-onboarding";
const endpoint = (flow: PrivateFlow) => privateFlows + "/" + flow.id + "/" + flow.step;
const path = (flow: PrivateFlow) => "/s/" + flow.id + "/" + flow.step;
const getSessions = (actor: Member): Promise<ActiveSessionList> => apiCall(actor, sessions, 200);
const open = (actor: Member, kind: PrivateFlow["kind"]): Promise<PrivateFlow> =>
  apiCall(actor, privateFlows, 200, "POST", { kind });

function sessionId(token: string): string {
  const sid: unknown = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id;
  if (typeof sid !== "string" || !/^[a-f0-9-]{36}$/.test(sid)) throw new Error("Missing fixture session");
  return sid;
}

async function device(member: Member, secret?: string) {
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  const signed = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  if (signed.error || !signed.data.session) throw new Error("Fixture could not sign in");
  let token = signed.data.session.access_token;
  if (secret) {
    const factors = await client.auth.mfa.listFactors();
    const factorId = factors.data?.totp[0]?.id;
    if (!factorId) throw new Error("Fixture factor missing");
    const challenge = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    if (challenge.error) throw new Error("Fixture MFA failed");
    token = challenge.data.access_token;
  }
  return { actor: { ...member, token }, client, sid: sessionId(token) };
}

test("S2B lists only own sessions and revokes selected and all other sessions without breaking the current device @smoke", async ({ makeMember, page }) => {
  const [member, other] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(member);
  const first = await device(member);
  const second = await device(member);
  const third = await device(member);
  await second.client.rpc("s2a_set_session_preference", { p_remember: true });
  const result = await getSessions(first.actor);
  expect(result.sessions).toHaveLength(4);
  const current = result.sessions.find((item) => item.current);
  expect(current?.id).not.toBe(first.sid);
  const target = result.sessions.find((item) => item.remembered);
  if (!target) throw new Error("Remembered session not in own inventory");
  await apiCall(other, sessions + "/revoke", 404, "POST", { target: target.id, requestId: randomUUID() });
  await apiCall(first.actor, sessions + "/revoke", 404, "POST", { target: current?.id, requestId: randomUUID() });
  const command = { target: target.id, requestId: randomUUID() };
  const concurrent = await Promise.all([0, 1].map(() => apiCall(first.actor, sessions + "/revoke", 200, "POST", command)));
  expect(concurrent).toEqual([{ affected: 1 }, { affected: 1 }]);
  expect((await second.client.rpc("account_session_active")).data).toBe(false);
  expect((await second.client.rpc("my_projects_for_client")).error?.code).toBe("42501");
  expect((await second.client.rpc("poll_nominations_for_client")).error?.code).toBe("42501");
  expect((await second.client.from("member_private").select("user_id").eq("user_id", member.id)).data).toEqual([]);
  const rotated = await second.client.auth.refreshSession();
  expect(rotated.error).toBeNull();
  expect(sessionId(rotated.data.session!.access_token)).toBe(second.sid);
  await apiCall({ ...second.actor, token: rotated.data.session!.access_token }, sessions, 401);
  await apiCall(third.actor, sessions, 200);
  await apiCall(first.actor, sessions + "/revoke", 200, "POST", { target: null, requestId: randomUUID() });
  await apiCall(third.actor, sessions, 401);
  expect((await getSessions(first.actor)).sessions.map(({ id }) => id)).toEqual([current?.id]);
  expect(sql(`select count(*) from private.s2b_security_events where actor_id='${member.id}'
    and action in ('session_revoked','other_sessions_revoked');`)).toBe("2");

  await inEnglish(page.context());
  await page.setViewportSize({ width: 320, height: 900 });
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings");
  const t = sessionSecurityMessages.en;
  await expect(page.getByRole("heading", { name: t.active })).toBeVisible();
  await expect(page.getByText(t.current, { exact: true })).toBeVisible();
  const logout = page.getByRole("button", { name: t.others, exact: true });
  await logout.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.getByText(t.revoked, { exact: true })).toBeVisible();
  await expect(page.getByText(t.other, { exact: true })).toHaveCount(0);
  await apiCall(first.actor, sessions, 401);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("S2B denies an exact copied organization link to signed-out visitors and other accounts @smoke", async ({ makeMember, page, browser, request }) => {
  const [owner, unrelated] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(owner);
  finishPersonalOnboarding(unrelated);
  const { intent } = await apiCall(owner, intents, 200, "PUT", {
    id: null, expectedVersion: 0, requestId: randomUUID(), stage: "drafting",
  });
  const flow = await open(owner, "organization_draft");
  const otherDevice = await device(owner);
  expect(await apiCall(otherDevice.actor, endpoint(flow), 200)).toEqual(flow);
  const cancel = { action: "cancel", expectedVersion: flow.version, requestId: randomUUID() };
  await apiCall(unrelated, endpoint(flow), 404);
  await apiCall(unrelated, endpoint(flow), 404, "POST", cancel);
  await apiCall(unrelated, intents + "/" + intent.id + "/change-path", 404, "POST", {
    expectedVersion: intent.version, requestId: randomUUID(),
  });
  expect(sql("select has_function_privilege('authenticated','public.s2b_workflow_for_api(uuid,uuid,boolean,bigint,text,text,uuid,text,integer,uuid)','execute') or has_table_privilege('authenticated','private.s2b_workflows','select');")).toBe("f");
  expect(sql(`select public.s2b_workflow_for_api('${unrelated.id}','${sessionId(unrelated.token)}',false,null,'read',null,'${flow.id}','resume',null,null) is null;`)).toBe("t");

  const address = web + path(flow);
  const anonymous = await request.get(address);
  expect(anonymous.status()).toBe(404);
  await inEnglish(page.context());
  await login(page, owner);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/organization-onboarding");
  await page.getByRole("button", { name: sessionSecurityMessages.en.createLink }).click();
  await expect(page).toHaveURL(address);
  await expect(page.getByRole("link", { name: sessionSecurityMessages.en.resume, exact: true })).toBeVisible();
  const differentContext = await browser.newContext();
  try {
    await inEnglish(differentContext);
    const otherPage = await differentContext.newPage();
    await login(otherPage, unrelated);
    await expect(otherPage).toHaveURL(/\/dashboard/);
    const denied = await otherPage.goto(address);
    expect(denied?.status()).toBe(404);
    expect(denied?.headers()["cache-control"]).toMatch(/no-store/);
    expect(denied?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(otherPage.getByRole("heading", { name: sessionSecurityMessages.en.unavailable })).toBeVisible();
    await expect(otherPage.getByRole("link", { name: sessionSecurityMessages.en.resume, exact: true })).toHaveCount(0);
  } finally { await differentContext.close(); }
  await page.getByRole("link", { name: sessionSecurityMessages.en.resume, exact: true }).click();
  await expect(page).toHaveURL(/\/organization-onboarding$/);
  await apiCall(otherDevice.actor, endpoint(flow), 200, "POST", cancel);
  await apiCall(owner, endpoint(flow), 404);
  await apiCall(otherDevice.actor, endpoint(flow), 200, "POST", cancel);
  expect(sql(`select count(*) from private.s2b_security_events where scope_ref='${flow.id}' and action='workflow_cancelled';`)).toBe("1");
});

test("S2B closes organization links on scope changes, expiry, account restriction and domain cancellation @smoke", async ({ makeMember }) => {
  const owner = await makeMember();
  const { intent } = await apiCall(owner, intents, 200, "PUT", {
    id: null, expectedVersion: 0, requestId: randomUUID(), stage: "drafting",
  });
  const organization = randomUUID();
  const handle = "s2b-" + organization.slice(0, 12);
  sql(`insert into private.organizations(id,handle,name,kind,country_code,created_by)
      values('${organization}','${handle}','S2B fixture','ngo','HT','${owner.id}');
    update private.organization_onboarding_intents set setup_draft=jsonb_build_object('mode','existing','targetHandle','${handle}')
      where id='${intent.id}';`);
  const flow = await open(owner, "organization_draft");
  sql(`insert into private.organization_memberships(organization_id,user_id,role) values('${organization}','${owner.id}','owner');`);
  await apiCall(owner, endpoint(flow), 404);
  sql(`delete from private.organization_memberships where organization_id='${organization}';
    update private.organizations set status='archived' where id='${organization}';`);
  await apiCall(owner, endpoint(flow), 404);
  sql(`update private.organizations set status='active' where id='${organization}';
    update private.s2b_workflows set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='${flow.id}';`);
  await apiCall(owner, endpoint(flow), 404);
  const replacement = await open(owner, "organization_draft");
  expect(replacement.id).not.toBe(flow.id);
  sql(`insert into private.account_restrictions(user_id,status,reason) values('${owner.id}','suspended','Disposable S2B test');`);
  await apiCall(owner, endpoint(replacement), 404);
  sql(`delete from private.account_restrictions where user_id='${owner.id}';`);
  await apiCall(owner, intents + "/" + intent.id + "/change-path", 200, "POST", {
    expectedVersion: intent.version, requestId: randomUUID(),
  });
  await apiCall(owner, endpoint(replacement), 404);
  expect(sql(`select state from private.s2b_workflows where id='${replacement.id}';`)).toBe("cancelled");
});

test("S2B privileged confirmation binds to one fresh-MFA session and completes exactly once @smoke", async ({ makeMember }) => {
  const [member, unrelated] = await Promise.all([makeMember(), makeMember()]);
  const secret = await enroll(member);
  sql(`insert into public.role_assignments(user_id,role) values('${member.id}','administrator');`);
  const original = await device(member, secret);
  const different = await device(member, secret);
  const flow = await open(original.actor, "revoke_other_sessions");
  const command = { action: "complete", expectedVersion: flow.version, requestId: randomUUID() };
  await apiCall(unrelated, endpoint(flow), 404);
  await apiCall(different.actor, endpoint(flow), 404);
  await apiCall(different.actor, endpoint(flow), 404, "POST", command);
  await apiCall(original.actor, sessions + "/revoke", 404, "POST", { target: null, requestId: randomUUID() });
  expect(sql(`select public.s2b_workflow_for_api('${member.id}','${original.sid}',true,
    floor(extract(epoch from clock_timestamp()))::bigint-901,'read',null,'${flow.id}','confirm',null,null) is null;`)).toBe("t");
  sql(`update auth.sessions set created_at=now()-interval '6 hours 1 second' where id='${original.sid}';`);
  await apiCall(original.actor, endpoint(flow), 404);
  sql(`update auth.sessions set created_at=now()-interval '1 minute' where id='${original.sid}';
    delete from public.role_assignments where user_id='${member.id}' and role='administrator';`);
  await apiCall(original.actor, endpoint(flow), 404);
  sql(`insert into public.role_assignments(user_id,role) values('${member.id}','administrator');
    update private.s2b_workflows set created_at=now()-interval '10 minutes',expires_at=now()-interval '1 minute' where id='${flow.id}';`);
  await apiCall(original.actor, endpoint(flow), 404);
  await apiCall(original.actor, endpoint(flow), 404, "POST", command);
  const ready = await open(original.actor, "revoke_other_sessions");
  const confirm = { ...command, requestId: randomUUID() };
  const [left, right] = await Promise.all([0, 1].map(() => apiCall(original.actor, endpoint(ready), 200, "POST", confirm)));
  expect(left).toEqual(right);
  expect(left.state).toBe("completed");
  await apiCall(original.actor, endpoint(ready), 404);
  await apiCall(original.actor, endpoint(ready), 404, "POST", { ...confirm, requestId: randomUUID() });
  await apiCall(different.actor, sessions, 401);
  expect((await getSessions(original.actor)).sessions).toHaveLength(1);
  expect(sql(`select count(*) from private.s2b_security_events where scope_ref='${ready.id}'
    and action='workflow_completed' and mfa_verified_at is not null;`)).toBe("1");
  sql(`delete from public.role_assignments where user_id='${member.id}' and role='administrator';`);
});

test("S2B treats trusted Founder provenance as privileged and denies a revoked original session @smoke", async ({ makeMember }) => {
  const member = await makeMember();
  const secret = await enroll(member);
  sql(`insert into private.platform_bootstrap(user_id) values('${member.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values('${member.id}','first_account_bootstrapped','S2B disposable Founder provenance');`);
  try {
    const original = await device(member, secret);
    const replacement = await device(member, secret);
    expect((await getSessions(original.actor)).privileged).toBe(true);
    const flow = await open(original.actor, "revoke_other_sessions");
    const originalRef = (await getSessions(original.actor)).sessions.find(({ current }) => current)?.id;
    expect(originalRef).toBeTruthy();
    await apiCall(replacement.actor, sessions + "/revoke", 200, "POST", { target: originalRef, requestId: randomUUID() });
    await apiCall(original.actor, endpoint(flow), 404);
    await apiCall(original.actor, endpoint(flow), 404, "POST", { action: "complete", expectedVersion: flow.version, requestId: randomUUID() });
    const replacementFlow = await open(replacement.actor, "revoke_other_sessions");
    sql(`delete from private.platform_bootstrap where user_id='${member.id}';`);
    await apiCall(replacement.actor, endpoint(replacementFlow), 404);
    expect((await getSessions(replacement.actor)).privileged).toBe(false);
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${member.id}';`);
  }
});

test("S2B leadership settings completes a private confirmation in the initiating browser @smoke", async ({ makeMember, page }) => {
  const member = await makeMember();
  finishPersonalOnboarding(member);
  const secret = await enroll(member);
  sql(`insert into public.role_assignments(user_id,role) values('${member.id}','administrator');`);
  try {
    const otherDevice = await device(member, secret);
    await inEnglish(page.context());
    await login(page, member);
    await solveMfa(page, secret);
    await page.goto("/settings");
    const t = sessionSecurityMessages.en;
    await page.getByRole("button", { name: t.others, exact: true }).click();
    await page.getByRole("button", { name: t.continue, exact: true }).click();
    await expect(page).toHaveURL(/\/s\/[a-f0-9-]{36}\/confirm$/);
    await expect(page.getByRole("heading", { name: t.confirmOthers })).toBeVisible();
    await page.getByRole("button", { name: t.others, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: t.completed })).toBeVisible();
    await apiCall(otherDevice.actor, sessions, 401);
    const denied = await page.reload();
    expect(denied?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: t.unavailable })).toBeVisible();
  } finally {
    sql(`delete from public.role_assignments where user_id='${member.id}' and role='administrator';`);
  }
});

test("S2B session controls and unavailable screens fit four languages in light and dark @smoke", async ({ makeMember, page, context }) => {
  const member = await makeMember();
  finishPersonalOnboarding(member);
  await inEnglish(context);
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  for (const [index, locale] of (["ht", "fr", "en", "es"] as const).entries()) {
    const width = index % 2 ? 1440 : 320;
    const theme = index % 2 ? "dark" : "light";
    const t = sessionSecurityMessages[locale];
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: t.active })).toBeVisible();
    await expect(page.getByText(t.current, { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const denied = await page.goto("/s/" + randomUUID() + "/resume?next=https%3A%2F%2Fexample.invalid");
    expect(denied?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: t.unavailable })).toBeVisible();
    await expect(page.getByRole("link", { name: t.back, exact: true })).toHaveAttribute("href", "/settings");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
