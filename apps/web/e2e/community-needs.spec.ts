import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api, expect, finishPersonalOnboarding, localClient, sql, test, web, type Member } from "./fixtures";
import { needsMessages } from "../src/lib/community-needs-i18n";

const path = "/api/v1/me/community-needs";
const proposed = {
  title: "Reading room access",
  description: "The community needs a place where students can study after school.",
  category: "education",
  area: "Ouest",
  beneficiaries: "Students and their caregivers",
  references: [{ url: "https://example.org/library", description: "Example public program" }],
};

async function request(member: Member, suffix = "", method = "GET", body?: object, key = randomUUID() as string) {
  return fetch(api + path + suffix, {
    method, signal: AbortSignal.timeout(10_000),
    headers: { Authorization: "Bearer " + member.token, "Idempotency-Key": key, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
}

test("C1.1 keeps private intake gated and enforces lifecycle, ownership, revision, quota and audit", async ({ page, context, signedIn, makeMember }) => {
  finishPersonalOnboarding(signedIn);
  const databaseChecks = readFileSync(join(__dirname, "../../../supabase/tests/database/c11_community_needs_test.sql"), "utf8");
  const tap = sql(databaseChecks);
  expect(tap).toContain("1..9");
  expect(tap).toContain("ok 9");
  expect(tap).not.toContain("not ok");
  expect((await request(signedIn)).status).toBe(404);
  expect(sql("select not has_table_privilege('authenticated','private.c11_needs','select');")).toBe("t");
  expect(sql("select not has_function_privilege('authenticated','public.c11_needs_for_api(uuid,uuid,boolean,text,uuid,uuid,uuid,integer,jsonb,boolean)','execute');")).toBe("t");
  const peer = await makeMember();
  finishPersonalOnboarding(peer);
  const community = sql("select id from feed_data.communities where slug='ouest';");
  const otherCommunity = sql("select id from feed_data.communities where slug='centre';");
  sql(`insert into feed_data.community_memberships(community_id,user_id) values
    ('${community}','${signedIn.id}'),('${otherCommunity}','${peer.id}');
    insert into private.c11_intake_fixture values(true,true);`);
  try {
    expect((await request(peer, "", "POST", { communityId: community, content: proposed })).status).toBe(403);
    expect((await request(signedIn, "", "POST", { communityId: otherCommunity, content: proposed })).status).toBe(403);
    expect((await request(signedIn, "", "POST", {
      communityId: community, content: { ...proposed, area: "18.543, -72.338" },
    })).status).toBe(400);
    const key = randomUUID();
    const create = () => request(signedIn, "", "POST", { communityId: community, content: proposed }, key);
    const responses = await Promise.all([create(), create()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const [first, retry] = await Promise.all(responses.map((response) => response.json()));
    expect(first).toMatchObject({ status: "draft", revision: 1, content: proposed });
    expect(retry.id).toBe(first.id);
    const suffix = "/" + first.id;
    expect((await request(signedIn, "", "POST", { communityId: community, content: { ...proposed, title: "Different" } }, key)).status).toBe(409);
    expect((await request(peer, suffix)).status).toBe(404);
    expect((await request(peer, "?cursor=" + first.id)).status).toBe(404);
    expect(await (await request(peer)).json()).toMatchObject({ needs: [] });
    sql(`insert into feed_data.community_memberships(community_id,user_id) values ('${community}','${peer.id}');
      insert into feed_data.community_staff(community_id,user_id,role) values ('${community}','${peer.id}','moderator');`);
    expect((await request(peer, suffix)).status).toBe(404);
    expect(await (await request(signedIn)).json()).toMatchObject({ needs: [expect.not.objectContaining({ content: expect.any(Object) })] });
    const publicClient = localClient("AYINOU_E2E_SUPABASE_PUBLIC");
    const direct = await publicClient.rpc("c11_needs_for_api", {
      p_actor: signedIn.id, p_session: randomUUID(), p_aal2: false, p_action: "read",
      p_id: first.id, p_community: null, p_request: null, p_expected: null, p_content: null, p_confirmed: null,
    });
    expect(direct.error).not.toBeNull();
    const service = localClient("AYINOU_E2E_SUPABASE_SECRET");
    const stale = await service.rpc("c11_needs_for_api", {
      p_actor: signedIn.id, p_session: randomUUID(), p_aal2: false, p_action: "read",
      p_id: first.id, p_community: null, p_request: null, p_expected: null, p_content: null, p_confirmed: null,
    });
    expect(stale.error?.code).toBe("42501");
    const edit = { action: "edit", expectedRevision: 1, content: { ...proposed, title: "Community reading room access" } };
    const change = await request(signedIn, suffix, "PATCH", edit);
    expect(change.status).toBe(200);
    expect((await request(signedIn, suffix, "PATCH", edit)).status).toBe(409);
    expect((await request(signedIn, suffix, "PATCH", { action: "submit", expectedRevision: 2, confirmed: false })).status).toBe(400);

    await page.goto("/communities");
    await page.getByRole("link", { name: needsMessages.en.title }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: needsMessages.en.newNeed }).click();
    await page.getByLabel(needsMessages.en.needTitle).fill("Draft made in the browser");
    await page.getByRole("button", { name: needsMessages.en.save }).click();
    await expect(page.getByRole("heading", { name: "Draft made in the browser" })).toBeVisible();
    await page.getByLabel(needsMessages.en.needTitle).fill("Edited in the browser");
    await page.getByRole("button", { name: needsMessages.en.save }).click();
    await expect(page.getByText(needsMessages.en.saved, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edited in the browser" })).toBeVisible();
    expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("link", { name: needsMessages.en.back }).click();
    await page.getByRole("link", { name: /Community reading room access/ }).click();
    await expect(page).toHaveURL(web + "/communities/intake/needs/" + first.id);
    const detail = await page.reload();
    expect(detail?.headers()["cache-control"]).toContain("no-store");
    expect(detail?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(detail?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByRole("button", { name: needsMessages.en.submit })).toBeDisabled();
    await page.getByRole("checkbox", { name: needsMessages.en.confirmation }).check();
    await page.getByRole("button", { name: needsMessages.en.submit }).click();
    await expect(page.getByText(needsMessages.en.unreviewed)).toBeVisible();
    await expect(page.getByText(proposed.references[0].url)).toBeVisible();
    for (const locale of ["ht", "fr", "es"] as const) {
      await context.addCookies([{ name: "ayinou-locale", value: locale, url: web }]);
      await page.reload();
      await expect(page.getByRole("heading", { name: needsMessages[locale].title })).toBeVisible();
      await expect(page.getByText(needsMessages[locale].unreviewed)).toBeVisible();
    }
    expect((await request(peer, suffix)).status).toBe(404);
    sql(`delete from feed_data.community_memberships where community_id='${community}' and user_id='${signedIn.id}';`);
    const withdrawn = await request(signedIn, suffix, "PATCH", { action: "withdraw", expectedRevision: 3, confirmed: true });
    expect(withdrawn.status).toBe(200);
    expect(await withdrawn.json()).toMatchObject({ status: "withdrawn", revision: 4 });
    expect(sql(`select string_agg(action || ':' || revision, ',' order by revision) from private.c11_need_revisions where need_id='${first.id}';`))
      .toBe("create:1,edit:2,submit:3,withdraw:4");
    expect(sql("select count(*) from information_schema.columns where table_schema='private' and table_name='a1a_audit_source' and column_name in ('content','references');")).toBe("0");
    for (let index = 0; index < 10; index++) {
      expect((await request(peer, "", "POST", { communityId: otherCommunity, content: proposed })).status).toBe(201);
    }
    expect((await request(peer, "", "POST", { communityId: otherCommunity, content: proposed })).status).toBe(429);
    sql(`insert into private.m22_account_sanctions(subject_id,kind,category,started_at,expires_at)
      values('${signedIn.id}','suspended','safety',now(),now()+interval '1 hour');`);
    expect((await request(signedIn, suffix)).status).toBe(401);
  } finally {
    sql("delete from private.c11_intake_fixture;");
  }
});
