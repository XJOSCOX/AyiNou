import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, expect, inEnglish, sql, test, totp, type Member } from "./fixtures";
import { privilegedSetupMessages } from "../src/lib/privileged-setup-i18n";

const supabase = "http://127.0.0.1:55321";
const governance = "/api/v1/admin/governance";
const reason = "Disposable appointment with an independent decision.";

async function prepareFounder(email: string, handle: string) {
  const key = process.env.AYINOU_E2E_SUPABASE_SECRET;
  if (!key || process.env.AYINOU_E2E_SUPABASE_URL !== supabase) throw new Error("Disposable Supabase is required");
  const directory = await mkdtemp(join(tmpdir(), "ayinou-f1-e2e-"));
  const destination = join(directory, "setup.txt");
  try {
    const output = execFileSync(process.execPath, ["scripts/prepare-founder-registration.mjs", destination], {
      encoding: "utf8", env: { ...process.env, AYINOU_FOUNDER_BOOTSTRAP_ENABLED: "true",
        AYINOU_FOUNDER_EMAIL: email, AYINOU_FOUNDER_USERNAME: handle, SUPABASE_URL: supabase, SUPABASE_SECRET_KEY: key },
    });
    const [url, secret] = (await readFile(destination, "utf8")).trim().split("\n");
    expect(url).toMatch(/^\/setup\/f\/[a-f0-9-]{36}$/);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output).not.toContain(secret);
    return { url, secret, key: url.split("/").at(-1)! };
  } finally {
    await rm(destination, { force: true });
    await rmdir(directory);
  }
}
const revise = (expectedVersion: number) => ({ expectedVersion, confirm: true, requestId: randomUUID() });
async function recent(member: Member): Promise<Member> {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error).toBeNull();
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  if (factor.error) throw factor.error;
  const proof = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id, code: totp(factor.data.totp.secret),
  });
  if (proof.error) throw proof.error;
  return { ...member, token: proof.data.access_token };
}

test("F1 separates private registration, actual email and MFA from independent Administrator appointment @smoke",
  async ({ page, context, makeMember }) => {
    test.setTimeout(100_000);
    const handle = "private_" + randomUUID().slice(0, 8);
    const email = handle + "@example.com";
    const password = "Disposable-founder!92";
    const { key, url, secret } = await prepareFounder(email, handle);
    const endpoint = "/api/v1/setup/founder/" + key;
    const t = privilegedSetupMessages.en;
    const provisioned = [await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    const [approver, candidate, outsider, secondTarget] = await Promise.all(provisioned.map(recent));
    let founderId: string | undefined;
    try {
      expect(sql(`select has_table_privilege('authenticated','private.f1_appointment','select')::text;`)).toBe("false");
      sql(`update private.founder_registration set expires_at=now()-interval '1 minute' where singleton;`);
      await apiCall(outsider, endpoint, 404, "POST", { action: "unlock", secret });
      sql(`update private.founder_registration set expires_at=now()+interval '30 minutes' where singleton;`);
      await page.goto(url);
      for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440]] as const) {
        await context.addCookies([{ name: "ayinou-locale", value: locale, url: new URL(url, page.url()).origin }]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        const input = page.getByLabel(privilegedSetupMessages[locale].secret);
        await input.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: privilegedSetupMessages[locale].unlock })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await inEnglish(context);
      await page.goto(url);
      await expect(page.getByLabel(t.password, { exact: true })).toHaveCount(0);
      await page.getByLabel(t.secret).fill(randomBytes(32).toString("base64url"));
      await page.getByRole("button", { name: t.unlock }).click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(t.failed);
      await page.getByLabel(t.secret).fill(secret);
      await page.getByRole("button", { name: t.unlock }).click();
      await expect(page.getByLabel(t.password, { exact: true })).toBeVisible();
      expect((await fetch(api + endpoint)).status).toBe(404);
      const temporary = (await context.cookies()).find((cookie) => cookie.name === "ayinou-f1-" + key);
      expect(temporary?.httpOnly).toBe(true);
      await page.getByLabel(t.password, { exact: true }).fill(password);
      await page.getByLabel(t.confirmPassword, { exact: true }).fill(password);
      await page.getByRole("button", { name: t.register }).click();
      await expect(page.getByRole("status").filter({ hasText: t.email })).toBeVisible();
      expect(sql(`select (email_confirmed_at is null)::text from auth.users where email='${email}';`)).toBe("true");
      let mail = "";
      await expect.poll(async () => {
        const response = await fetch("http://127.0.0.1:55324/api/v1/messages");
        const data = await response.json();
        mail = data.messages.find((item: { To: { Address: string }[] }) =>
          item.To.some((address) => address.Address === email))?.ID ?? "";
        return !!mail;
      }).toBe(true);
      const message = await (await fetch("http://127.0.0.1:55324/api/v1/message/" + mail)).json();
      const confirmation = new URL(String(message.Text).match(/https?:\/\/[^\s<(]+\/auth\/v1\/verify\?[^\s)>]+/)![0]);
      expect(confirmation.origin).toBe(supabase);
      await page.goto(confirmation.href);
      await expect(page).toHaveURL(new RegExp(url + "$"));
      founderId = sql(`select id from auth.users where email='${email}';`);
      expect(founderId).toMatch(/^[a-f0-9-]{36}$/);
      const leader = await recent({ id: founderId, email, password, handle, token: "" });
      await apiCall(outsider, endpoint, 404, "POST", { action: "claim", authorization: temporary!.value });
      await apiCall(leader, endpoint, 200, "POST", { action: "claim", authorization: temporary!.value });
      await apiCall(leader, endpoint, 404, "POST", { action: "claim", authorization: temporary!.value });
      expect(sql(`select username from public.profiles where user_id='${founderId}';`)).toBe(handle);
      expect((await apiCall(leader, "/api/v1/me/platform-access", 200)).founder).toBe(true);

      sql(`insert into public.role_assignments(user_id,role) values ('${approver.id}','administrator');
        insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
          values ('${candidate.id}','identity','verified','review','${approver.id}',now()),
                 ('${secondTarget.id}','identity','verified','review','${approver.id}',now());`);
      const { version } = await apiCall(leader, governance, 200);
      const propose = (target: string) => apiCall(leader, governance + "/proposals", 200, "POST",
        { ...revise(version), kind: "appoint", target, reason });
      const proposal = await propose(candidate.id);
      const createPath = "/api/v1/admin/appointments/" + proposal.id + "/invitation";
      await apiCall(approver, createPath, 404, "POST");
      const issued = await apiCall(leader, createPath, 200, "POST");
      const invitation = "/api/v1/administrator-activation/" + issued.flowId;
      expect(issued.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      await apiCall(outsider, invitation, 404);
      expect(await apiCall(candidate, invitation, 200)).toEqual({ ready: false });
      await apiCall(candidate, invitation, 404, "POST", { code: issued.code, accept: true });
      const approve = { ...revise(proposal.version), action: "approve", reason, noConflict: true };
      const decisions = governance + "/proposals/" + proposal.id + "/actions";
      await apiCall(leader, decisions, 403, "POST", approve);
      await apiCall(approver, decisions, 200, "POST", approve);
      const accept = { code: issued.code, accept: true };
      await apiCall(candidate, invitation, 404, "POST", { ...accept, code: randomBytes(32).toString("base64url") });
      await apiCall(outsider, invitation, 404, "POST", accept);
      const outcomes = await Promise.all([0, 1].map(() => fetch(api + invitation, {
        method: "POST", headers: { Authorization: "Bearer " + candidate.token, "Content-Type": "application/json" },
        body: JSON.stringify(accept),
      })));
      expect(outcomes.map((response) => response.status).sort()).toEqual([200, 404]);
      expect((await apiCall(candidate, "/api/v1/me/platform-access", 200))).toMatchObject({ administrator: true, founder: false });
      expect(sql(`select count(*) from private.f1_events where workflow='${issued.flowId}' and event='activated';`)).toBe("1");

      const another = await propose(secondTarget.id);
      const revoke = "/api/v1/admin/appointments/" + another.id + "/invitation";
      const pending = await apiCall(leader, revoke, 200, "POST");
      await apiCall(leader, revoke, 200, "DELETE");
      await apiCall(secondTarget, "/api/v1/administrator-activation/" + pending.flowId, 404);
      sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
        values ('${outsider.id}','identity','verified','review','${approver.id}',now());`);
      const expiring = await propose(outsider.id);
      const expiringIssue = await apiCall(leader, "/api/v1/admin/appointments/" + expiring.id + "/invitation", 200, "POST");
      sql(`update private.f1_appointment set expires_at=now()-interval '1 minute' where id='${expiringIssue.flowId}';`);
      await apiCall(outsider, "/api/v1/administrator-activation/" + expiringIssue.flowId, 404, "POST",
        { code: expiringIssue.code, accept: true });
      expect(sql(`select count(*) from private.f1_events where workflow='${expiringIssue.flowId}' and event='expired';`)).toBe("1");
    } finally {
      sql(`delete from private.f1_founder_flow where id='${key}';
        delete from private.founder_registration where reserved_username='${handle}';
        ${founderId && /^[a-f0-9-]{36}$/.test(founderId) ? "delete from private.platform_bootstrap where user_id='" + founderId + "';" : ""}
        delete from public.role_assignments where user_id in ('${approver.id}','${candidate.id}') and role='administrator';`);
    }
  });
