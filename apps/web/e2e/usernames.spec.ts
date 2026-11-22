import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, sql, test, totp } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { usernameMessages } from "../src/lib/username-i18n";

const supabaseUrl = "http://127.0.0.1:55321";
const path = "/api/v1/usernames/availability";
const signup = (username?: string) => {
  const client = createClient(supabaseUrl, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const email = "u1-" + randomUUID() + "@example.com";
  return client.auth.signUp({ email, password: "Disposable-username!9", options: {
    data: { display_name: "Jean Pierre", ...(username !== undefined && { public_username: username }) },
  } });
};
async function availability(username: string) {
  const response = await fetch(api + path + "?" + new URLSearchParams({ username }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

test("U1 SQL enforces reservation privacy, moderated names and concurrent Auth signup @smoke", async () => {
  const claim = "claim_" + randomUUID().slice(0, 8);
  expect(await availability("f_0_u_n_d_e_r")).toEqual({ status: "reserved" });
  expect(await availability("s1eghe1l")).toEqual({ status: "blocked" });
  expect(await availability("supporter_marie")).toEqual({ status: "available" });
  expect(await availability("1marie")).toEqual({ status: "invalid" });
  expect(await availability("mаrie")).toEqual({ status: "invalid" });
  expect(await availability("marie😊")).toEqual({ status: "invalid" });
  expect(await availability(claim)).toEqual({ status: "available" });
  const results = await Promise.all([signup(claim), signup(claim.toUpperCase())]);
  const winners = results.filter((result) => !result.error);
  expect(winners).toHaveLength(1);
  const firstId = winners[0].data.user!.id;
  expect(firstId).toMatch(/^[a-f0-9-]{36}$/);
  expect(winners[0].data.session).toBeNull();
  expect(await availability(claim)).toEqual({ status: "unavailable" });
  expect(sql(`select count(*) from public.profiles where username='${claim}';`)).toBe("0");
  expect((await signup()).error).not.toBeNull();
  expect((await signup("administrator")).error).not.toBeNull();
  expect((await signup("mаrie")).error).not.toBeNull();
  expect((await signup("s1eghe1l")).error).not.toBeNull();

  sql(`update private.username_signup_leases set expires_at=now()-interval '1 second' where user_id='${firstId}';`);
  expect(await availability(claim)).toEqual({ status: "available" });
  const second = await signup(claim);
  expect(second.error).toBeNull();
  const secondId = second.data.user!.id;
  expect(secondId).toMatch(/^[a-f0-9-]{36}$/);
  // Simulate both email confirmations in database time order. The late account can
  // finish onboarding with a different handle without claiming the newer lease.
  sql(`update auth.users set email_confirmed_at=now() where id='${firstId}';
       update auth.users set email_confirmed_at=now() where id='${secondId}';`);
  expect(sql(`select user_id from public.profiles where username='${claim}';`)).toBe(secondId);
  expect(sql(`select string_agg(event,',' order by id) from private.username_events
    where subject_id in ('${firstId}','${secondId}');`)).toBe("reserved,expired,reserved,assigned");
  expect(sql(`select has_column_privilege('authenticated','public.profiles','username','update')
    or has_table_privilege('authenticated','private.username_events','select')
    or has_table_privilege('service_role','private.username_signup_leases','insert')
    or has_function_privilege('anon','public.username_availability_for_api(text)','execute')
    or has_function_privilege('authenticated','public.username_availability_for_api(text)','execute');`)).toBe("f");
});

test("U1 changes retain private UUID relationships, canonical links and grandfathered names", async ({ page, context, makeMember }) => {
  const [actor, other] = [await makeMember({ visible: true }), await makeMember({ visible: true })];
  finishPersonalOnboarding(actor);
  finishPersonalOnboarding(other);
  const next = "renamed_" + randomUUID().slice(0, 8);
  const endpoint = "/api/v1/me/profile/details";
  await apiCall(actor, endpoint, 200, "PATCH", { displayName: "Jean Pierre" });
  await apiCall(other, endpoint, 200, "PATCH", { displayName: "Jean Pierre" });
  await apiCall(actor, endpoint, 400, "PATCH", { username: "a_d_m_1_n" });
  await apiCall(actor, endpoint, 400, "PATCH", { username: "nеw_handle" });
  await apiCall(actor, endpoint, 409, "PATCH", { username: other.handle.toUpperCase() });
  const changed = await apiCall(actor, endpoint, 200, "PATCH", { username: next.toUpperCase() });
  expect(changed.profile).toMatchObject({ userId: actor.id, username: next, displayName: "Jean Pierre" });
  expect((await apiCall(other, "/api/v1/profiles/" + actor.handle, 200)).profile.username).toBe(next);
  await inEnglish(context);
  await page.goto("/members/" + actor.handle);
  await expect(page).toHaveURL("/members/" + next);
  await apiCall(other, endpoint, 409, "PATCH", { username: actor.handle });

  // Invalid attempts and harmless repeated writes must leave the committed audit unchanged.
  await apiCall(actor, endpoint, 200, "PATCH", { username: next });
  expect(sql(`select count(*) from private.username_events where subject_id='${actor.id}' and event='changed';`)).toBe("1");
  await apiCall(actor, endpoint, 200, "PATCH", { discoverable: false });
  expect(await availability(next)).toEqual({ status: "unavailable" });
  expect(await availability(actor.handle)).toEqual({ status: "unavailable" });
  await apiCall(other, "/api/v1/profiles/" + actor.handle, 404);
  sql(`insert into private.account_restrictions(user_id,status,reason) values ('${actor.id}','suspended','Disposable U1 fixture');`);
  await apiCall(actor, endpoint, 401, "PATCH", { username: "denied_" + randomUUID().slice(0, 8) });

  const legacy = "1old_" + randomUUID().slice(0, 8);
  // A pre-migration fixture injected with the U1 guard skipped only within this transaction.
  sql(`begin; alter table public.profiles disable trigger u1_username_guard;
    update public.profiles set username='${legacy}' where user_id='${other.id}';
    alter table public.profiles enable trigger u1_username_guard; commit;`);
  expect((await apiCall(other, endpoint, 200, "PATCH", { username: legacy, displayName: "Jéan Pierre" })).profile.username).toBe(legacy);
});

test("U1 signup ignores obsolete availability responses and keeps keyboard controls usable", async ({ page, context }) => {
  await inEnglish(context);
  await page.setViewportSize({ width: 320, height: 900 });
  const t = usernameMessages.en;
  await page.route(api + path + "*", async (route) => {
    const candidate = new URL(route.request().url()).searchParams.get("username");
    if (candidate === "older_result") {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.fulfill({ json: { status: "taken" } }).catch(() => {});
    } else await route.fulfill({ json: { status: "available" } });
  });
  await page.goto("/register");
  const input = page.getByLabel(t.choose);
  const pending = page.waitForRequest((request) => request.url().includes("older_result"));
  await input.fill("older_result");
  await pending;
  await input.fill("newer_result");
  await expect(page.getByRole("status").filter({ hasText: t.available })).toBeVisible();
  await expect(page.getByText(t.taken, { exact: true })).toHaveCount(0);
  await expect(page.getByText("@newer_result", { exact: true })).toBeVisible();
  await input.press("Tab");
  await expect(page.getByLabel(authMessages.en.email, { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.goto("/");
  expect(sql("select count(*) from private.username_signup_leases where username='newer_result';")).toBe("0");
});

test("U1 staff corrections bind a recent administrator session to one durable outcome", async ({ makeMember }) => {
  const administrator = await makeMember();
  const member = await makeMember({ visible: true });
  const route = "/api/v1/admin/usernames/review";
  const held = "hold_" + randomUUID().slice(0, 8);
  const request = { requestId: randomUUID(), action: "hold", username: held, reason: "impersonation" };
  await apiCall(member, route, 403, "POST", request);
  const client = createClient(supabaseUrl, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: administrator.email, password: administrator.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  if (factor.error) throw factor.error;
  const challenge = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id, code: totp(factor.data.totp.secret),
  });
  if (challenge.error) throw challenge.error;
  const privileged = { ...administrator, token: challenge.data.access_token };
  await apiCall(privileged, route, 403, "POST", request);
  sql(`insert into public.role_assignments(user_id,role) values ('${administrator.id}','administrator');`);
  try {
    await apiCall(administrator, route, 401, "POST", request);
    const receipt = await apiCall(privileged, route, 200, "POST", request);
    expect(receipt).toMatchObject({ event: "safety_hold" });
    expect(await apiCall(privileged, route, 200, "POST", request)).toEqual(receipt);
    await apiCall(privileged, route, 409, "POST", { ...request, reason: "abuse" });
    expect(await availability(held)).toEqual({ status: "unavailable" });
    expect((await apiCall(privileged, route, 200, "POST", {
      ...request, action: "release", requestId: randomUUID(), reason: "false_positive",
    })).event).toBe("safety_release");
    expect((await apiCall(privileged, route, 200, "POST", {
      ...request, action: "appeal_reviewed", requestId: randomUUID(), reason: "false_positive",
    })).event).toBe("appeal_reviewed");
    expect(await availability(held)).toEqual({ status: "available" });

    const replacement = "corrected_" + randomUUID().slice(0, 8);
    const correct = { ...request, action: "correct", requestId: randomUUID(), username: member.handle, replacement };
    const corrected = await apiCall(privileged, route, 200, "POST", correct);
    expect(corrected.event).toBe("administrative_correction");
    expect(await apiCall(privileged, route, 200, "POST", correct)).toEqual(corrected);
    expect((await apiCall(member, "/api/v1/me/profile", 200)).profile.userId).toBe(member.id);
    await apiCall(member, "/api/v1/profiles/" + member.handle, 404);
    expect(sql(`select count(*) from private.username_events
      where request_id in ('${request.requestId}','${correct.requestId}') and actor_id='${administrator.id}';`)).toBe("2");
    expect(sql("select has_function_privilege('authenticated','public.review_username_for_api(uuid,uuid,bigint,uuid,text,text,text,text)','execute');")).toBe("f");
  } finally {
    sql(`delete from public.role_assignments where user_id='${administrator.id}' and role='administrator';`);
  }
});
