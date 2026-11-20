import { randomUUID } from "node:crypto";
import { privacyRequestKinds } from "@ayinou/shared";
import { createClient } from "@supabase/supabase-js";
import { api, expect, login, logout, sql, test, totp, type Member } from "./fixtures";
import { privacyMessages } from "../src/lib/privacy-i18n";
import { errorMessages } from "../src/lib/error-i18n";

const collection = "/api/v1/me/privacy-requests";
const workspace = "/settings/privacy-requests";
const secondary = "http://127.0.0.1:5301";

function allow(member: Member) {
  sql("insert into private.privacy_intake_fixtures(subject_id) values ('" + member.id + "');");
}

function request(member: Member | null, path = collection, body?: object, key = randomUUID(), origin = api) {
  return fetch(origin + path, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(10_000),
    headers: {
      ...(member && { Authorization: "Bearer " + member.token }),
      ...(body && { "Content-Type": "application/json", "Idempotency-Key": key }),
    },
    body: body && JSON.stringify(body),
  });
}

test("privacy gates, database privileges and concurrent versioned transitions @smoke", async ({ makeMember }) => {
  const [owner, other, disabled] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  allow(owner);
  allow(other);
  expect((await request(null)).status).toBe(401);
  const offline = await request(disabled, collection, { kind: "deletion" });
  expect(offline.status).toBe(404);
  expect((await offline.json()).error.code).toBe("PRIVACY_DISABLED");
  expect(sql("select count(*) from private.privacy_cases where subject_id='" + disabled.id + "'")).toBe("0");
  expect(sql(`select count(*) from pg_class where relnamespace='private'::regnamespace
    and relname in ('privacy_intake_fixtures','privacy_cases','privacy_case_events','privacy_case_assignments','privacy_case_commands')
    and relkind='r' and relrowsecurity
    and not has_table_privilege('authenticated',oid,'insert,select,update,delete')
    and not has_table_privilege('service_role',oid,'insert,select,update,delete');`)).toBe("5");
  expect(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace
    and proname in ('privacy_cases_for_api','privacy_case_command_for_api')
    and prosecdef and proconfig @> array['search_path=""']
    and not has_function_privilege('authenticated',oid,'execute')
    and not has_function_privilege('anon',oid,'execute') and has_function_privilege('service_role',oid,'execute');`)).toBe("2");
  const direct = await fetch("http://127.0.0.1:55321/rest/v1/rpc/privacy_cases_for_api", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token,
      apikey: process.env.AYINOU_E2E_SUPABASE_PUBLIC! },
    body: JSON.stringify({ p_actor: other.id, p_session: randomUUID(), p_aal2: true, p_id: null, p_after: null }),
  });
  expect(direct.status).toBe(403);
  const disabledSession = JSON.parse(Buffer.from(disabled.token.split(".")[1], "base64url").toString("utf8")).session_id;
  expect(disabledSession).toMatch(/^[a-f0-9-]{36}$/);
  expect(() => sql(`set role service_role; select public.privacy_cases_for_api('${disabled.id}','${disabledSession}',false,null,null);`)).toThrow();
  expect((await request(owner, collection, { kind: "access", subjectId: other.id })).status).toBe(400);
  expect((await request(owner, collection, { kind: "access", evidence: "example" })).status).toBe(400);

  const key = randomUUID();
  const concurrent = await Promise.all([api, secondary].map((origin) =>
    request(owner, collection, { kind: "deletion" }, key, origin)));
  expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
  expect(concurrent[0].headers.get("Cache-Control")).toBe("private, no-store");
  const [receipt, duplicate] = await Promise.all(concurrent.map((response) => response.json()));
  expect(duplicate).toEqual(receipt);
  const conflicted = await request(owner, collection, { kind: "export" }, key);
  expect(conflicted.status).toBe(409);
  expect((await conflicted.json()).error.code).toBe("PRIVACY_KEY_CONFLICT");
  const path = collection + "/" + receipt.id;
  expect((await request(other, path)).status).toBe(404);
  expect((await request(other, collection + "?after=" + receipt.id)).status).toBe(404);
  expect((await (await request(other)).json()).cases).toEqual([]);
  expect((await request(other, path + "/withdraw", { version: 1 })).status).toBe(404);
  expect((await request(owner, path + "/withdraw", { version: 2 })).status).toBe(409);
  expect((await request(owner, path + "/withdraw", { version: 1, state: "approved" })).status).toBe(400);
  expect((await (await request(owner, "/api/v1/admin/privacy-requests/" + receipt.id + "/triage", { state: "approved" })).json()).error.code)
    .toBe("MFA_REQUIRED");

  const withdrawalKey = randomUUID();
  const withdrawal = await request(owner, path + "/withdraw", { version: 1 }, withdrawalKey);
  expect(withdrawal.status).toBe(200);
  expect(await withdrawal.json()).toEqual({ ...receipt, version: 2, state: "withdrawn" });
  expect((await request(owner, path + "/withdraw", { version: 1 }, withdrawalKey, secondary)).status).toBe(200);
  expect((await request(owner, path + "/withdraw", { version: 1 })).status).toBe(409);
  expect(await (await request(owner, collection, { kind: "deletion" }, key)).json()).toEqual(receipt);
  const detail = await (await request(owner, path)).json();
  expect(Object.keys(detail).sort()).toEqual(["createdAt", "events", "id", "kind", "nextAction", "state", "version"]);
  expect(detail.events.map(({ state, version }: { state: string; version: number }) => [state, version]))
    .toEqual([["received", 1], ["withdrawn", 2]]);
  expect(Object.keys(detail.events[0]).sort()).toEqual(["at", "state", "version"]);
  for (const kind of privacyRequestKinds) expect((await request(owner, collection, { kind })).status).toBe(201);
  expect((await (await request(owner)).json()).cases).toHaveLength(8);
  expect(sql("select count(*) from auth.users where id='" + owner.id + "'")).toBe("1");
  sql("update auth.sessions set not_after=now()-interval '1 second' where user_id='" + other.id + "';");
  expect((await request(other)).status).toBe(401);
  sql("delete from auth.sessions where user_id='" + owner.id + "';");
  expect((await request(owner, path)).status).toBe(401);

  // A real, freshly verified TOTP session and a preseeded conflicted assignment still confer no review rights.
  const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect((await client.auth.signInWithPassword({ email: owner.email, password: owner.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(factor.error).toBeNull();
  const challenge = await client.auth.mfa.challengeAndVerify({ factorId: factor.data!.id, code: totp(factor.data!.totp.secret) });
  expect(challenge.error).toBeNull();
  expect(() => sql(`set role authenticated; insert into private.privacy_case_assignments(case_id,reviewer_id)
    values ('${receipt.id}','${owner.id}');`)).toThrow();
  sql(`insert into private.privacy_case_assignments(case_id,reviewer_id) values ('${receipt.id}','${owner.id}');`);
  const fresh = { ...owner, token: challenge.data!.access_token };
  const review = await request(fresh, "/api/v1/admin/privacy-requests/" + receipt.id + "/triage", { state: "approved" });
  expect(review.status).toBe(403);
  expect((await review.json()).error.code).toBe("PRIVACY_REVIEW_UNAVAILABLE");
  expect((await (await request(fresh, path)).json()).events).toHaveLength(2);
});

test("localized privacy form safely replays an interrupted submission and clears on sign-out @smoke",
  async ({ page, context, signedIn, makeMember }) => {
    const t = privacyMessages.en;
    const formError = page.getByRole("main").getByRole("alert");
    await page.goto(workspace);
    await expect(page.getByText(t.disabled)).toBeVisible();
    await expect(page.getByRole("button", { name: t.submit })).toHaveCount(0);
    allow(signedIn);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload();
    await expect(page.getByRole("combobox", { name: t.kind })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole("combobox", { name: t.kind }).selectOption("deletion");
    await page.route("**" + collection, async (route) => {
      if (route.request().method() === "POST") {
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: t.submit }).click();
    await expect(formError).toHaveText(errorMessages.en.network);
    await expect(page.getByRole("combobox", { name: t.kind })).toHaveValue("deletion");
    await page.unroute("**" + collection);
    await page.getByRole("button", { name: t.retry, exact: true }).click();
    await expect(page.getByText(t.success.received, { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: t.kinds.deletion.label })).toHaveCount(1);
    await page.getByRole("button", { name: t.details }).click();
    await expect(page.getByRole("listitem").last()).toContainText(t.status.received);
    await page.getByRole("button", { name: t.withdraw, exact: true }).click();
    await page.getByRole("button", { name: t.confirmAction }).click();
    await expect(page.getByText(t.success.withdrawn, { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const locale of ["ht", "fr", "es", "en"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: "http://127.0.0.1:5400" }]);
      await page.route("**" + collection, (route) => route.abort("failed"));
      await page.reload();
      await expect(page.getByRole("heading", { name: privacyMessages[locale].title })).toBeVisible();
      await expect(formError).toHaveText(errorMessages[locale].network);
      await page.unroute("**" + collection);
    }
    await logout(page);
    const second = await makeMember();
    allow(second);
    await login(page, second);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto(workspace);
    await expect(page.getByText(t.empty)).toBeVisible();
    await expect(page.getByText(t.success.withdrawn, { exact: false })).toHaveCount(0);
  });
