import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { founderMessages } from "../src/lib/founder-i18n";
import { api, apiCall, enroll, expect, inEnglish, login, solveMfa, sql, test, totp } from "./fixtures";

const endpoint = "/api/v1/me/founder-bootstrap";
const hash = (credential: string) => createHash("sha256").update(credential).digest("hex");

test("reserved Founder bootstrap requires confirmed email, fresh MFA and one atomic credential consumption @smoke", async ({ page, makeMember }) => {
  test.setTimeout(100_000);
  const [owner, ordinary] = await Promise.all([makeMember(), makeMember()]);
  const reserved = "founder_e2e_" + randomUUID().slice(0, 8);
  const first = randomBytes(32).toString("base64url");
  const credential = randomBytes(32).toString("base64url");
  const prepare = (email: string, username: string, token: string) =>
    sql(`select public.prepare_founder_registration_for_api('${email}','${username}','${hash(token)}');`);

  expect(() => prepare(owner.email, ordinary.handle, first)).toThrow();
  expect(prepare(owner.email, reserved, first)).toBe("t");
  try {
    expect(prepare(ordinary.email, reserved, credential)).toBe("f");
    expect(() => sql(`update public.profiles set username='${reserved}' where user_id='${ordinary.id}';`)).toThrow();
    expect(() => sql(`insert into public.profiles(user_id,username) values('${ordinary.id}','${reserved}')
      on conflict(user_id) do nothing;`)).toThrow();
    expect((await apiCall(ordinary, endpoint, 200)).available).toBe(false);
    expect((await apiCall(owner, endpoint, 200)).available).toBe(true);
    await apiCall(owner, endpoint, 403, "POST", { credential: first });
    expect(sql(`select has_function_privilege('service_role','public.bootstrap_first_platform_admin_for_api(uuid)','execute')
      or has_table_privilege('authenticated','private.founder_registration','select');`)).toBe("f");

    const secret = await enroll(owner);
    const client = createClient("http://127.0.0.1:55321", process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    expect((await client.auth.signInWithPassword({ email: owner.email, password: owner.password })).error).toBeNull();
    const factors = await client.auth.mfa.listFactors();
    const factorId = factors.data!.totp[0].id;
    const elevated = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    expect(elevated.error).toBeNull();
    const member = { ...owner, token: elevated.data!.access_token };

    sql(`update auth.users set email_confirmed_at=null where id='${owner.id}';`);
    expect(sql(`select public.founder_registration_status_for_api('${owner.id}');`)).toBe("f");
    expect(sql("select count(*) from private.platform_bootstrap;")).toBe("0");
    sql(`update auth.users set email_confirmed_at=now() where id='${owner.id}';`);
    await apiCall(member, endpoint, 409, "POST", { credential });
    expect(sql("select failed_attempts from private.founder_registration;")).toBe("1");
    expect(sql(`select count(*) from private.founder_registration_audit where event='credential_rejected' and actor_id='${owner.id}';`)).toBe("1");
    sql("update private.founder_registration set expires_at=now()-interval '1 second';");
    await apiCall(member, endpoint, 409, "POST", { credential: first });
    expect(prepare(owner.email, reserved, credential)).toBe("t");

    await inEnglish(page.context());
    await login(page, owner);
    await solveMfa(page, secret);
    await page.goto("/settings");
    for (const locale of ["ht", "fr", "es", "en"] as const) {
      await page.getByRole("banner").locator("select").selectOption(locale);
      await expect(page.getByLabel(founderMessages[locale].bootstrapCredential)).toBeVisible();
    }

    const submit = () => fetch(api + endpoint, { method: "POST", headers: {
      Authorization: "Bearer " + member.token, "Content-Type": "application/json",
    }, body: JSON.stringify({ credential }) });
    const result = await Promise.all([submit(), submit()]);
    expect(result.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await apiCall(member, "/api/v1/me/platform-access", 200)).toMatchObject({ founder: true, administrator: true, reviewer: false });
    expect(await apiCall(ordinary, "/api/v1/me/platform-access", 200)).toMatchObject({ founder: false, administrator: false });
    expect(prepare(ordinary.email, ordinary.handle, first)).toBe("f");
    expect(sql(`select count(*) from private.platform_admin_audit where subject_id='${owner.id}' and event='first_account_bootstrapped';`)).toBe("1");
    expect(sql("select (credential_hash is null and configured_email is null)::text from private.founder_registration;")).toBe("true");
    expect(sql(`select count(*) from public.verification_records where user_id='${owner.id}';`)).toBe("0");

    await page.goto("/dashboard");
    const founderMark = page.locator('main [data-designation="founder"]');
    await expect(founderMark).toHaveCSS("color", "rgb(159, 36, 51)");
    await expect(founderMark.locator("img")).toHaveAttribute("src", "/founder.png");
    await expect(founderMark.locator("img")).toHaveJSProperty("naturalWidth", 100);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: founderMessages.en.bootstrapTitle })).toHaveCount(0);
    sql(`update public.profiles set username='${reserved}' where user_id='${owner.id}';`);
    sql(`update public.profiles set username='${owner.handle}' where user_id='${owner.id}';`);
    expect(() => sql(`update public.profiles set username='${reserved}' where user_id='${ordinary.id}';`)).toThrow();
  } finally {
    sql(`delete from private.founder_registration where reserved_username='${reserved}';
      delete from private.platform_bootstrap where user_id='${owner.id}';`);
  }
});
