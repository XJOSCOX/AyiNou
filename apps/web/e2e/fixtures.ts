import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { accountMessages } from "../src/lib/account-i18n";

const supabase = "http://127.0.0.1:55321";
export const api = "http://127.0.0.1:5300";
export const web = "http://127.0.0.1:5400";
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
export type Member = { id: string; email: string; password: string; handle: string; token: string };

function localProject() {
  const project = process.env.AYINOU_E2E_PROJECT;
  if (!project || !/^ayinou-e2e-[a-f0-9-]{12}$/.test(project) || process.env.AYINOU_E2E_SUPABASE_URL !== supabase) {
    throw new Error("Disposable project is required for fixture writes");
  }
  return project;
}

function checked<T extends { data: unknown; error: { code?: string } | null }>(result: T, operation: string): T["data"] {
  if (result.error) throw new Error(`Fixture failed to ${operation} (${result.error.code ?? "unknown"})`);
  return result.data;
}

export function localClient(key: string) {
  localProject();
  const value = process.env[key];
  if (!value) throw new Error("Missing disposable Supabase credential");
  return createClient(supabase, value, { auth });
}

export function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_" + localProject(), "psql",
    "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: statement, timeout: 10_000, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function rehearseDatabaseRecovery(verify: (restoredSql: (statement: string) => string) => void) {
  const container = "supabase_db_" + localProject();
  const database = "c46_restore_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const local = (args: string[], input?: string | Buffer) => execFileSync("docker", ["exec", "-i", container, ...args], {
    input, timeout: 45000, maxBuffer: 48 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  });
  const restoredSql = (statement: string) =>
    local(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], statement).toString("utf8").trim();
  const dump = local(["pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc"]);
  local(["createdb", "-U", "supabase_admin", "-T", "template0", database]);
  try {
    local(["pg_restore", "-U", "supabase_admin", "--exit-on-error", "-d", database], dump);
    // The scratch database is never registered with PostgREST. Quarantine its
    // restored release before any application traffic or stage verification.
    restoredSql("update private.c46_fixture set release_authorized=false where singleton;");
    verify(restoredSql);
  } finally {
    local(["dropdb", "-U", "supabase_admin", database]);
  }
}

export function finishPersonalOnboarding(member: Member) {
  sql(`update public.member_private set onboarding_step=4,first_name='Synthetic',last_name='Member',
    membership_category='haitian' where user_id='${member.id}';`);
}

export function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((part) => Number.parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function enroll(member: Member) {
  const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
  checked(await client.auth.signInWithPassword({ email: member.email, password: member.password }), "sign in");
  const factor = checked(await client.auth.mfa.enroll({ factorType: "totp" }), "enroll TOTP");
  if (!factor) throw new Error("Missing test factor");
  checked(await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }), "verify TOTP");
  return factor.totp.secret;
}

export async function inEnglish(context: BrowserContext) {
  await context.addCookies([{ name: "ayinou-locale", value: "en", url: web }]);
}

export async function login(page: Page, member: Pick<Member, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(member.email);
  await page.getByLabel("Password", { exact: true }).fill(member.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function openAdministration(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Open administration", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}\/admin$/);
}

export async function logout(page: Page) {
  await page.getByRole("banner").locator("summary").first().click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function solveMfa(page: Page, secret: string) {
  const t = accountMessages.en;
  await expect(page.getByRole("heading", { name: t.mfaTitle })).toBeVisible();
  await page.getByLabel(t.mfaChallengeCode).fill(totp(secret));
  await page.getByRole("button", { name: t.mfaSubmit }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function apiCall(member: Member, path: string, status: number, method = "GET", data?: object) {
  if (!path.startsWith("/api/v1/")) throw new Error("Use a versioned local API path");
  const response = await fetch(api + path, {
    method, signal: AbortSignal.timeout(10_000),
    headers: { Authorization: "Bearer " + member.token, ...(data && { "Content-Type": "application/json" }),
      ...(method === "POST" && { "Idempotency-Key": randomUUID() }) },
    body: data ? JSON.stringify(data) : undefined,
  });
  expect(response.status, `${method} ${path}`).toBe(status);
  return response.status === 204 ? null : await response.json();
}

export function apiResponse(page: Page, path: string, method = "GET") {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path &&
    response.request().method() === method);
}

export const test = base.extend<{
  makeMember: (options?: { visible?: boolean }) => Promise<Member>;
  signedIn: Member;
}>({
  makeMember: async ({ baseURL }, provide) => {
    if (baseURL !== web) throw new Error("Unexpected browser test origin");
    const admin = localClient("AYINOU_E2E_SUPABASE_SECRET");
    await provide(async ({ visible = false } = {}) => {
      const idPart = randomUUID().replaceAll("-", "").slice(0, 16);
      const handle = "e2e_" + idPart;
      const email = handle + "@example.invalid";
      const password = "Browser-Fixture!9-" + randomUUID();
      const created = checked(await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { preferred_locale: "en" },
      }), "create account");
      const id = created.user?.id;
      if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("Missing disposable account ID");
      checked(await admin.rpc("initialize_member_for_api", { p_user_id: id }), "initialize member");
      checked(await admin.from("member_metric_exclusions").insert({ user_id: id, reason: "synthetic_test" }), "exclude fixture");
      checked(await admin.from("profiles").update({
        username: handle, display_name: "Browser Test " + idPart.slice(0, 6), preferred_locale: "en", is_visible: visible,
      }).eq("user_id", id), "seed fixture profile");
      if (visible) {
        checked(await admin.from("user_settings").upsert({ user_id: id, discoverable: true }), "enable fixture discovery");
      }
      const client = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
      const signed = checked(await client.auth.signInWithPassword({ email, password }), "get fixture session");
      const token = signed.session?.access_token;
      if (!token) throw new Error("Missing fixture session");
      return { id, email, password, handle, token };
    });
    // The run exclusively owns the database and media volumes. The runner removes all of them.
  },
  signedIn: async ({ page, context, makeMember }, provide) => {
    await inEnglish(context);
    const member = await makeMember();
    await login(page, member);
    await expect(page).toHaveURL(/\/dashboard/);
    await provide(member);
  },
});

export { expect };
