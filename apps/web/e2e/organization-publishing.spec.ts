import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";

test("F2.3 scopes announcements, pin capacity and organization post history", async ({ page, makeMember }) => {
  const [owner, outsider] = await Promise.all([makeMember({ visible: true }), makeMember({ visible: true })]);
  for (const member of [owner, outsider]) finishPersonalOnboarding(member);
  const handle = "publishing-" + randomUUID().slice(0, 8);
  const organization = sql(`with created as (insert into private.organizations(handle,name,kind,country_code,created_by)
    values('${handle}','Public publishing fixture','nonprofit','HT','${owner.id}') returning id) select id from created;`);
  sql(`insert into private.organization_memberships(organization_id,user_id,role)
    values('${organization}','${owner.id}','owner');`);
  const image = readFileSync(join(__dirname, "../public/site-grid.png")).toString("base64");
  await apiCall(owner, `/api/v1/institutions/${organization}/logo`, 204, "POST", { image });
  const ownerAccounts = await apiCall(owner, "/api/v1/me/institution-accounts", 200);
  const entry = ownerAccounts.organizations.find((item: { id: string }) => item.id === organization);
  expect(entry.logoUrl).toContain("/object/sign/institution-logos/");
  expect(entry).not.toHaveProperty("logoAsset");
  expect((await fetch(entry.logoUrl)).ok).toBe(true);
  const outsiderAccounts = await apiCall(outsider, "/api/v1/me/institution-accounts", 200);
  expect(outsiderAccounts.organizations).toEqual([]);

  const command = { organization: handle, body: "Official organization update", language: "en", announcement: true };
  await apiCall(outsider, "/api/v1/posts/social", 404, "POST", command);
  await apiCall(owner, "/api/v1/posts/social", 404, "POST", { ...command, projectId: randomUUID() });
  const first = await apiCall(owner, "/api/v1/posts/social", 201, "POST", command);
  const later = await apiCall(owner, "/api/v1/posts/social", 201, "POST", { ...command, body: "Routine update", announcement: false });
  const otherPosts = await Promise.all(["Third", "Fourth"].map((body) =>
    apiCall(owner, "/api/v1/posts/social", 201, "POST", { ...command, body: body + " organization post", announcement: false })));
  const pin = (member: typeof owner, id: string, status: number) =>
    apiCall(member, `/api/v1/posts/${id}/organization-pin`, status, "PUT", { version: 1, pinned: true });
  await pin(outsider, first.id, 404);
  await pin(owner, first.id, 204);
  await pin(owner, first.id, 204);
  await Promise.all(otherPosts.map(({ id }) => pin(owner, id, 204)));
  await pin(owner, later.id, 409);
  const timeline = "/api/v1/institutions/by-handle/" + handle + "/posts";
  const response = await fetch(api + timeline + "?filter=announcements");
  expect(response.status).toBe(200);
  const { posts } = await response.json();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ id: first.id, author: null, social: { announcement: true, pinned: true, canPin: false } });
  expect(JSON.stringify(posts)).not.toContain(owner.handle);
  expect(sql(`select count(*) from feed_data.organization_post_events where organization_id='${organization}'
    and action='pinned' and representative_id='${owner.id}';`)).toBe("3");
  expect(sql("select has_table_privilege('authenticated','feed_data.organization_post_events','select');")).toBe("f");

  await inEnglish(page.context());
  await page.goto("/organization/" + handle);
  await expect(page.getByRole("region", { name: "Organization posts" }).getByText(command.body)).toBeVisible();
  await expect(page.locator("aside nav")).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await login(page, owner);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/institutions");
  const organizationRow = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Public publishing fixture", exact: true }) });
  const logo = organizationRow.locator('img[src*="institution-logos"]');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  sql(`delete from private.organization_memberships where organization_id='${organization}' and user_id='${owner.id}';`);
  await apiCall(owner, `/api/v1/posts/${first.id}?version=2`, 403, "DELETE");
  await pin(owner, later.id, 404);
  sql(`update private.organizations set status='archived' where id='${organization}';`);
  expect((await (await fetch(api + timeline)).json()).posts).toEqual([]);
});
