import { randomUUID } from "node:crypto";
import { createApp } from "../../api/src/app";
import { readConfig } from "../../api/src/config";
import { enroll, expect, finishPersonalOnboarding, localClient, sql, test, totp } from "./fixtures";

test("restricted API accepts refreshed test sessions and preserves signup, MFA and revocation checks", async ({ signedIn, makeMember }) => {
  const [mfaMember, outsider] = await Promise.all([makeMember(), makeMember()]);
  finishPersonalOnboarding(signedIn);
  finishPersonalOnboarding(mfaMember);
  finishPersonalOnboarding(outsider);

  // The runtime setting itself only accepts the approved production project.
  // Substitute the disposable connection after validating the hosted shape.
  const config = readConfig({
    RENDER: "true", NODE_ENV: "production", PORT: "10000", LOG_LEVEL: "silent",
    AYINOU_API_MODE: "render-dev", AYINOU_RENDER_TEST_USER_IDS: `${signedIn.id},${mfaMember.id}`,
    AYINOU_RENDER_PROXY_CIDRS: "127.0.0.1/32",
    SUPABASE_URL: "https://hcbxulyfmdmuyccgrujs.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: process.env.AYINOU_E2E_SUPABASE_PUBLIC,
    SUPABASE_SECRET_KEY: process.env.AYINOU_E2E_SUPABASE_SECRET,
  });
  const app = createApp({ ...config, SUPABASE_URL: process.env.AYINOU_E2E_SUPABASE_URL });
  const headers = { host: "api-dev.ayinou.com", "x-forwarded-proto": "https" };
  const read = async (token: string) => app.inject({
    url: "/api/v1/me/profile", headers: { ...headers, authorization: `Bearer ${token}` },
  });
  const previous = sql("select mode from private.registration_policy where singleton;");
  if (!["closed", "public", "invitation_only"].includes(previous)) throw new Error("Unexpected fixture registration policy");

  try {
    sql("update private.registration_policy set mode='public' where singleton;");
    expect((await read(signedIn.token)).statusCode).toBe(503);
    sql("update private.registration_policy set mode='closed' where singleton;");
    expect((await read(outsider.token)).statusCode).toBe(403);
    const ordinary = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const signed = await ordinary.auth.signInWithPassword({ email: signedIn.email, password: signedIn.password });
    expect(Boolean(signed.data.session)).toBe(true);
    expect((await read(signed.data.session!.access_token)).statusCode).toBe(200);
    const refreshed = await ordinary.auth.refreshSession();
    expect(Boolean(refreshed.data.session)).toBe(true);
    expect((await read(refreshed.data.session!.access_token)).statusCode).toBe(200);

    const mfaSecret = await enroll(mfaMember);
    const elevated = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const lower = await elevated.auth.signInWithPassword({ email: mfaMember.email, password: mfaMember.password });
    expect(Boolean(lower.data.session)).toBe(true);
    expect((await read(lower.data.session!.access_token)).statusCode).toBe(401);
    const factor = (await elevated.auth.mfa.listFactors()).data!.totp[0];
    const upgraded = await elevated.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(mfaSecret) });
    expect(Boolean(upgraded.data?.access_token)).toBe(true);
    expect((await read(upgraded.data!.access_token)).statusCode).toBe(200);
    expect((await app.inject({
      url: "/api/v1/admin/overview",
      headers: { ...headers, authorization: `Bearer ${upgraded.data!.access_token}` },
    })).statusCode).toBe(404);

    const email = `render-denied-${randomUUID()}@example.com`;
    const count = sql("select count(*) from auth.users;");
    const denied = await localClient("AYINOU_E2E_SUPABASE_PUBLIC").auth.signUp({ email, password: randomUUID() });
    expect(Boolean(denied.error)).toBe(true);
    expect(sql("select count(*) from auth.users;")).toBe(count);

    sql(`delete from auth.sessions where user_id='${signedIn.id}';`);
    expect((await read(refreshed.data.session!.access_token)).statusCode).toBe(401);
  } finally {
    await app.close();
    sql(`update private.registration_policy set mode='${previous}' where singleton;`);
  }
});
