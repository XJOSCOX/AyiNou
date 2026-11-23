import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { api, apiCall, enroll, expect, inEnglish, login, logout, solveMfa, sql, test, totp, type Member } from "./fixtures";
import { exportMessages } from "../src/lib/privacy-export-i18n";
import { privacyMessages } from "../src/lib/privacy-i18n";

const supabase = "http://127.0.0.1:55321";
const collection = "/api/v1/me/privacy-requests";
const artifacts = "/api/v1/me/privacy-exports/";

function allow(member: Member, exportEnabled = true) {
  sql(`insert into private.privacy_intake_fixtures(subject_id) values ('${member.id}');
    ${exportEnabled ? `insert into private.privacy_export_fixtures(subject_id) values ('${member.id}');` : ""}`);
}

async function steppedUp(member: Member, existing?: string) {
  const client = createClient(supabase, process.env.AYINOU_E2E_SUPABASE_PUBLIC!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  expect(signedIn.error).toBeNull();
  const enrollResult = existing ? null : await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollResult) expect(enrollResult.error).toBeNull();
  const factor = enrollResult?.data?.id ?? (await client.auth.mfa.listFactors()).data!.totp[0].id;
  const secret = existing ?? enrollResult!.data!.totp.secret;
  const proof = await client.auth.mfa.challengeAndVerify({ factorId: factor, code: totp(secret) });
  expect(proof.error).toBeNull();
  return { ...member, token: proof.data!.access_token, secret };
}

function call(member: Member, path: string, body?: object, key = randomUUID(), origin = api) {
  return fetch(origin + path, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: "Bearer " + member.token, ...(body && { "Content-Type": "application/json", "Idempotency-Key": key }) },
    body: body && JSON.stringify(body),
  });
}

test("synthetic export protects field boundaries, sessions, ballots and concurrent receipts @smoke", async ({ makeMember }) => {
  const [candidate, outsider, intakeOnly] = await Promise.all([makeMember(), makeMember(), makeMember()]);
  allow(candidate);
  allow(outsider);
  allow(intakeOnly, false);
  expect((await call(intakeOnly, artifacts + "availability")).status).toBe(404);
  const receipt = await apiCall(candidate, collection, 201, "POST", { kind: "export" });
  const wrongKind = await apiCall(candidate, collection, 201, "POST", { kind: "deletion" });
  const generated = collection + "/" + receipt.id + "/export";
  expect((await call(candidate, generated, { version: 1 })).status).toBe(403);

  const owner = await steppedUp(candidate);
  const other = await steppedUp(outsider);
  const ownPost = "Omit subject free text containing third-party data";
  const otherPost = "Omit another author's private content";
  const followerPost = "Omit the text of a follower-only post";
  await apiCall(owner, "/api/v1/posts", 201, "POST", { body: ownPost, visibility: "private", language: "fr" });
  await apiCall(other, "/api/v1/posts", 201, "POST", { body: otherPost, visibility: "private", language: "es" });
  await apiCall(owner, "/api/v1/posts", 201, "POST", { body: followerPost, visibility: "followers", language: "ht" });
  const poll = await apiCall(owner, "/api/v1/polls", 201, "POST", {
    title: "Synthetic ballot export check", description: "Independently bound receipt.", scope: "individual",
    scopeId: null, taskId: null, policy: "advisory", kind: "community", language: "en", audience: "members",
    eligibility: "active", resultPolicy: "after_vote", opensAt: new Date(Date.now() + 180_000).toISOString(),
    closesAt: new Date(Date.now() + 360_000).toISOString(), quorum: null, threshold: null,
    options: ["Excluded choice one", "Excluded choice two"], key: randomUUID(),
  });
  const pollPath = "/api/v1/polls/" + poll.id;
  await apiCall(owner, pollPath + "/transition", 200, "POST", { action: "publish", version: poll.version });
  sql(`update private.polls set opens_at=now()-interval '5 seconds' where id='${poll.id}';`);
  const optionId = sql(`select id from private.poll_options where poll_id='${poll.id}' order by id limit 1;`);
  await apiCall(owner, pollPath + "/ballot", 200, "POST", { optionId });
  expect(await apiCall(other, pollPath + "/ballot", 200)).toEqual({ optionId: null });

  expect((await call(other, generated, { version: 1 })).status).toBe(404);
  expect((await call(owner, collection + "/" + wrongKind.id + "/export", { version: 1 })).status).toBe(404);
  expect((await call(owner, generated, { version: 2 })).status).toBe(409);
  const key = randomUUID();
  const responses = await Promise.all([api, "http://127.0.0.1:5301"].map((origin) => call(owner, generated, { version: 1 }, key, origin)));
  expect(responses.every((response) => [200, 202].includes(response.status))).toBe(true);
  const summaries = await Promise.all(responses.map((response) => response.json()));
  expect(summaries[0].id).toBe(summaries[1].id);
  const id = summaries[0].id;
  expect(sql(`select attempt from private.privacy_exports where id='${id}';`)).toBe("1");
  const blobPath = artifacts + id + "/download";
  expect((await call(other, blobPath)).status).toBe(404);
  const anotherSession = await steppedUp(owner, owner.secret);
  expect((await call(anotherSession, blobPath)).status).toBe(404);
  expect((await call(owner, blobPath + "?token=invalid")).status).toBe(400);
  expect((await call(owner, "/api/v1/admin/privacy-requests/" + receipt.id + "/triage")).status).toBe(403);
  const reply = await call(owner, blobPath);
  expect(reply.status).toBe(200);
  expect(reply.headers.get("cache-control")).toBe("private, no-store");
  expect(reply.headers.get("content-disposition")).toContain("attachment");
  const text = await reply.text();
  const archive = JSON.parse(text);
  expect(archive.data.pollParticipation).toEqual([{ hasParticipated: true }]);
  expect(archive.data.posts).toEqual([
    { language: "ht", visibility: "followers", status: "published", createdAt: expect.any(String) },
    { language: "fr", visibility: "private", status: "draft", createdAt: expect.any(String) },
  ]);
  for (const omitted of [owner.email, other.email, optionId, poll.id, ownPost, otherPost, followerPost, "Excluded choice one", "optionId"]) {
    expect(text).not.toContain(omitted);
  }
  expect(await apiCall(owner, pollPath + "/ballot", 200)).toEqual({ optionId });
  expect(sql(`select count(*) from private.poll_ballots where poll_id='${poll.id}';`)).toBe("1");
  expect(sql(`select pg_catalog.encode(envelope,'hex') from private.privacy_exports where id='${id}';`)).not.toContain(Buffer.from("manifest").toString("hex"));
  expect(sql(`select count(*) from pg_class where relnamespace='private'::regnamespace
    and relname in ('privacy_exports','privacy_export_fixtures') and relrowsecurity
    and not has_table_privilege('service_role',oid,'select,insert,update,delete')
    and not has_table_privilege('authenticated',oid,'select,insert,update,delete');`)).toBe("2");
  expect(sql(`select count(*) from storage.buckets where id like '%export%';`)).toBe("0");
  const direct = await fetch(supabase + "/rest/v1/rpc/privacy_export_for_api", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token,
      apikey: process.env.AYINOU_E2E_SUPABASE_PUBLIC! },
    body: JSON.stringify({ p_actor: owner.id, p_session: randomUUID(), p_aal2: true, p_totp: null, p_action: "read", p_id: id }),
  });
  expect(direct.status).toBe(403);
  const directStorage = await fetch(supabase + "/storage/v1/object/authenticated/privacy-export/" + id, {
    headers: { Authorization: "Bearer " + owner.token, apikey: process.env.AYINOU_E2E_SUPABASE_PUBLIC! },
  });
  expect(directStorage.ok).toBe(false);
  expect(sql(`update public.profiles set is_visible=true where user_id='${owner.id}' returning is_visible;`)).toContain("t");
  const changed = await call(owner, blobPath);
  expect(changed.status).toBe(409);
  expect((await changed.json()).error.code).toBe("EXPORT_CHANGED");
  const newCase = await apiCall(owner, collection, 201, "POST", { kind: "export" });
  expect((await call(owner, collection + "/" + newCase.id + "/export", { version: 1 }, key)).status).toBe(409);
  const revocationKey = randomUUID();
  const revoked = await call(anotherSession, artifacts + id + "/revoke", {}, revocationKey);
  expect(revoked.status).toBe(200);
  expect((await call(anotherSession, artifacts + id + "/revoke", {}, revocationKey)).status).toBe(200);
  expect((await call(owner, blobPath)).status).toBe(409);
  expect(sql(`select state || ':' || terminal_state || ':' || (envelope is null)::text
    from private.privacy_exports where id='${id}';`)).toBe("cleaned:revoked:true");
});

test("export recovers abandoned generation, rejects corruption and expires without resurrection", async ({ makeMember }) => {
  const candidate = await makeMember();
  allow(candidate);
  const owner = await steppedUp(candidate);
  const receipt = await apiCall(owner, collection, 201, "POST", { kind: "export" });
  const path = collection + "/" + receipt.id + "/export";
  const key = randomUUID();
  // Claim through the real RPC and simulate worker loss before any encrypted artifact is committed.
  const claims = JSON.parse(Buffer.from(owner.token.split(".")[1], "base64url").toString("utf8"));
  const proof = claims.amr.find((entry: { method: string }) => entry.method === "totp" || entry.method === "mfa/totp").timestamp;
  const session = claims.session_id;
  expect(session).toMatch(/^[a-f0-9-]{36}$/);
  expect(Number.isInteger(proof)).toBe(true);
  expect(() => sql(`select public.privacy_export_for_api('${owner.id}','${session}',true,${proof - 901},
    'start','${receipt.id}',null,'${key}',1,1);`)).toThrow();
  const claim = JSON.parse(sql(`select public.privacy_export_for_api('${owner.id}','${session}',true,${proof},
    'start','${receipt.id}',null,'${key}',1,1);`));
  const id = claim.id;
  expect((await call(owner, path, { version: 1 }, key)).status).toBe(202);
  expect(() => sql(`select public.privacy_export_for_api('${owner.id}','${session}',true,${proof},
    'finish',null,'${id}',null,null,null,'${claim.fence}','ab');`)).toThrow();
  expect(sql(`select state || ':' || (envelope is null)::text from private.privacy_exports where id='${id}';`)).toBe("generating:true");
  sql(`update private.privacy_exports set lease_until=now()-interval '1 second' where id='${id}';`);
  expect((await (await call(owner, path)).json()).state).toBe("failed_retryable");
  expect((await (await call(owner, path, { version: 1 }, key)).json()).state).toBe("available");
  sql(`update private.privacy_exports set envelope=set_byte(envelope,0,(get_byte(envelope,0)+1)%256) where id='${id}';`);
  expect((await call(owner, artifacts + id + "/download")).status).toBe(503);
  expect((await (await call(owner, path)).json()).state).toBe("failed_retryable");
  expect((await (await call(owner, path, { version: 1 }, key)).json()).state).toBe("available");
  const verifyDownloads = await Promise.all(Array.from({ length: 4 }, () => call(owner, artifacts + id + "/download")));
  expect(verifyDownloads.map((response) => response.status).sort()).toEqual([200, 200, 200, 409]);
  sql(`update private.privacy_exports set expires_at=now()-interval '1 second' where id='${id}';`);
  expect((await call(owner, artifacts + id + "/download")).status).toBe(410);
  await Promise.all([api, "http://127.0.0.1:5301"].map((origin) => call(owner, path, undefined, undefined, origin)));
  expect(sql(`select state || ':' || terminal_state || ':' || (envelope is null)::text
    from private.privacy_exports where id='${id}';`)).toBe("cleaned:expired:true");
  expect((await (await call(owner, path, { version: 1 }, key)).json()).state).toBe("cleaned");
  const withdrawnCase = await apiCall(owner, collection, 201, "POST", { kind: "export" });
  const withdrawnPath = collection + "/" + withdrawnCase.id;
  const artifact = await (await call(owner, withdrawnPath + "/export", { version: 1 })).json();
  expect(artifact.state).toBe("available");
  expect((await call(owner, withdrawnPath + "/withdraw", { version: 1 })).status).toBe(200);
  expect((await call(owner, artifacts + artifact.id + "/download")).status).toBe(409);
  expect((await (await call(owner, withdrawnPath + "/export")).json()).state).toBe("revoked");
  sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${session}';`);
  expect((await call(owner, artifacts + id + "/download")).status).toBe(401);
  sql(`delete from auth.sessions where id='${session}';`);
  expect((await call(owner, path)).status).toBe(401);
});

test("privacy export UI downloads with MFA and clears case state on account change", async ({ page, context, makeMember }) => {
  const owner = await makeMember();
  allow(owner);
  const secret = await enroll(owner);
  await inEnglish(context);
  await login(page, owner);
  await solveMfa(page, secret);
  await page.goto("/settings/privacy-requests");
  const t = privacyMessages.en;
  const e = exportMessages.en;
  await page.getByRole("combobox", { name: t.kind }).selectOption("export");
  await page.getByRole("button", { name: t.submit }).click();
  await page.getByRole("button", { name: t.details }).click();
  await page.getByRole("button", { name: e.generate }).click();
  await expect(page.getByText(e.state.available, { exact: true })).toBeVisible();
  const received = page.waitForEvent("download");
  await page.getByRole("button", { name: e.download }).click();
  expect((await received).suggestedFilename()).toBe("ayinou-synthetic-export.json");
  await page.getByRole("button", { name: e.revoke, exact: true }).click();
  await page.getByRole("button", { name: e.confirm }).click();
  await expect(page.getByText(e.state.revoked, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: e.download })).toHaveCount(0);
  for (const locale of ["ht", "fr", "es", "en"] as const) {
    await context.addCookies([{ name: "ayinou-locale", value: locale, url: "http://127.0.0.1:5400" }]);
    await page.reload();
    await page.getByRole("button", { name: privacyMessages[locale].details }).click();
    await expect(page.getByRole("heading", { name: exportMessages[locale].title })).toBeVisible();
    await expect(page.getByText(exportMessages[locale].state.cleaned, { exact: true })).toBeVisible();
  }
  await logout(page);
  const other = await makeMember();
  await login(page, other);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings/privacy-requests");
  await expect(page.getByText(e.disabled, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: e.download })).toHaveCount(0);
});
