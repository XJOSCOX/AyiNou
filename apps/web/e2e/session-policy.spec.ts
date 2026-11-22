import { createClient } from "@supabase/supabase-js";
import { apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test, web, type Member } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { messages } from "../src/lib/i18n";

function client() {
  const endpoint = process.env.AYINOU_E2E_SUPABASE_URL;
  const key = process.env.AYINOU_E2E_SUPABASE_PUBLIC;
  if (endpoint !== "http://127.0.0.1:55321" || !key) throw new Error("Disposable Auth required");
  return createClient(endpoint, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sessionId(token: string) {
  const session = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id;
  if (typeof session !== "string" || !/^[a-f0-9-]{36}$/.test(session)) throw new Error("Missing fixture session");
  return session;
}

async function openSession(member: Member, remember: boolean) {
  const auth = client();
  const signed = await auth.auth.signInWithPassword({ email: member.email, password: member.password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error("Missing fixture session");
  const choice = await auth.rpc("s2a_set_session_preference", { p_remember: remember });
  if (choice.error || !choice.data) throw choice.error ?? new Error("Session preference did not persist");
  return { auth, choice: choice.data, session: signed.data.session };
}

test("S2A applies exact deadline boundaries independently in PostgreSQL @smoke", async ({ makeMember }) => {
  const [founder, administrator, remembered, ordinary] = await Promise.all(Array.from({ length: 4 }, () => makeMember()));
  sql(`insert into private.platform_bootstrap(user_id) values ('${founder.id}');
    insert into private.platform_admin_audit(subject_id,event,reason)
      values ('${founder.id}','first_account_bootstrapped','S2A disposable Founder provenance');
    insert into public.role_assignments(user_id,role) values ('${administrator.id}','administrator');`);
  try {
    for (const [member, remember, hours] of [[founder, true, 6], [administrator, true, 6],
      [remembered, true, 720], [ordinary, false, 12]] as const) {
      const { choice, session } = await openSession(member, remember);
      expect(choice.remembered).toBe(hours === 720);
      const sid = sessionId(session.access_token);
      expect(sql(`with fixture as (select created_at + interval '${hours} hours' as deadline from auth.sessions where id='${sid}')
        select array[
          private.s2a_session_within_policy('${member.id}','${sid}',deadline-interval '1 microsecond'),
          private.s2a_session_within_policy('${member.id}','${sid}',deadline),
          private.s2a_session_within_policy('${member.id}','${sid}',deadline+interval '1 microsecond'),
          private.s2a_session_within_policy('${ordinary.id === member.id ? remembered.id : ordinary.id}','${sid}',deadline-interval '1 microsecond')
        ] from fixture;`)).toBe("{t,f,f,f}");
    }
  } finally {
    sql(`delete from private.platform_bootstrap where user_id='${founder.id}';
      delete from public.role_assignments where user_id='${administrator.id}' and role='administrator';`);
  }
});

test("S2A remembers one session, preserves its start on refresh and enforces expiry across API and RPC @smoke", async ({ makeMember }) => {
  const member = await makeMember();
  const { auth, choice, session } = await openSession(member, true);
  const second = await openSession(member, false);
  const key = sessionId(session.access_token);
  const rotated = await auth.auth.refreshSession();
  if (rotated.error || !rotated.data.session) throw rotated.error ?? new Error("Refresh missing");
  expect(rotated.data.session.refresh_token === session.refresh_token).toBe(false);
  expect(sessionId(rotated.data.session.access_token)).toBe(key);
  expect((await auth.rpc("s2a_set_session_preference", { p_remember: false })).data).toEqual(choice);
  sql(`update auth.sessions set created_at=now()-interval '720 hours 1 second' where id='${key}';`);
  await apiCall({ ...member, token: rotated.data.session.access_token }, "/api/v1/me/platform-access", 401);
  expect((await auth.rpc("account_session_active")).data).toBe(false);
  expect((await auth.rpc("my_projects_for_client")).error?.code).toBe("42501");
  expect((await auth.from("member_private").select("user_id").eq("user_id", member.id)).data).toEqual([]);
  expect((await second.auth.rpc("account_session_active")).data).toBe(true);
  await auth.rpc("s2a_observe_expiry");
  expect(sql(`select count(*) from private.s2a_session_events e join private.s2a_session_policy p on p.audit_ref=e.policy_ref
    where p.session_id='${key}' and e.event='expired';`)).toBe("1");
  await second.auth.auth.signOut({ scope: "local" });
  await apiCall({ ...member, token: second.session.access_token }, "/api/v1/me/platform-access", 401);
});

test("S2A sign-in uses opt-in persistence and expired sessions reauthenticate in the browser @smoke", async ({ makeMember, page, context, browser }) => {
  const [member, alternate] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(member);
  finishPersonalOnboarding(alternate);
  await inEnglish(context);
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  const authCookies = () => context.cookies().then(cookies => cookies.filter(cookie => /-auth-token(?:\.\d+)?$/.test(cookie.name)));
  const sessionOnly = await authCookies();
  expect(sessionOnly.length).toBeGreaterThan(0);
  expect(sessionOnly.every(cookie => cookie.expires === -1)).toBe(true);

  await page.goto("/login");
  const toggle = page.getByRole("checkbox", { name: authMessages.en.rememberDevice });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel("Email", { exact: true }).fill(member.email);
  await page.getByLabel("Password", { exact: true }).fill(member.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await authCookies()).every(cookie => cookie.expires > Date.now() / 1000)).toBe(true);

  const state = await context.storageState();
  await login(page, alternate);
  await expect(page).toHaveURL(/\/dashboard/);
  const replacement = await authCookies();
  expect(replacement.length).toBeGreaterThan(0);
  expect(replacement.every(cookie => cookie.expires === -1)).toBe(true);
  const restarted = await browser.newContext({ storageState: { ...state, cookies: state.cookies.filter(cookie => cookie.expires !== -1) } });
  try {
    const reopened = await restarted.newPage();
    const origin = new URL(page.url()).origin;
    await reopened.goto(origin + "/dashboard");
    await expect(reopened).toHaveURL(/\/dashboard/);
    sql(`update auth.sessions set created_at=now()-interval '720 hours 1 second' where user_id='${member.id}';`);
    await reopened.reload();
    await expect(reopened).toHaveURL(/\/login\?session=ended/);
    await expect(reopened.getByText(authMessages.en.sessionEnded, { exact: true })).toBeVisible();
  } finally {
    await restarted.close();
  }
});

test("S2A reauthentication controls work with the keyboard in all four languages and both themes @smoke", async ({ context, page }) => {
  for (const [index, locale] of (["ht", "fr", "en", "es"] as const).entries()) {
    const width = index % 2 ? 1440 : 320;
    const colorScheme = index % 2 ? "dark" : "light";
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/login?session=ended");
    const control = page.getByRole("checkbox", { name: authMessages[locale].rememberDevice });
    await expect(page.getByRole("status")).toHaveText(authMessages[locale].sessionEnded);
    await expect(control).not.toBeChecked();
    await expect(page.getByRole("button", { name: colorScheme === "dark" ? messages[locale].switchToLight : messages[locale].switchToDark })).toBeVisible();
    await control.focus();
    await page.keyboard.press("Space");
    await expect(control).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
