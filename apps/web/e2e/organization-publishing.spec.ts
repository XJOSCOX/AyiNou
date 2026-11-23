import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, sql, test } from "./fixtures";

test("F2.3 scopes announcements, pin capacity and organization post history", async ({ page, makeMember }) => {
  const [owner, outsider] = await Promise.all([makeMember({ visible: true }), makeMember({ visible: true })]);
  for (const member of [owner, outsider]) finishPersonalOnboarding(member);
  const handle = "publishing-" + randomUUID().slice(0, 8);
  const organization = sql(`with created as (insert into private.organizations(handle,name,kind,country_code,created_by)
    values('${handle}','Public publishing fixture','nonprofit','HT','${owner.id}') returning id) select id from created;`);
  sql(`insert into private.organization_memberships(organization_id,user_id,role)
    values('${organization}','${owner.id}','owner');`);
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
  sql(`delete from private.organization_memberships where organization_id='${organization}' and user_id='${owner.id}';`);
  await apiCall(owner, `/api/v1/posts/${first.id}?version=2`, 403, "DELETE");
  await pin(owner, later.id, 404);
  sql(`update private.organizations set status='archived' where id='${organization}';`);
  expect((await (await fetch(api + timeline)).json()).posts).toEqual([]);
});
