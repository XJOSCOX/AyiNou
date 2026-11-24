import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, sql, test } from "./fixtures";
import { institutionMessages } from "../src/lib/institution-i18n";
import { feedMessages } from "../src/lib/feed-i18n";

const t = institutionMessages.en;

test("Institutions Following shows only the signed-in member’s followed organizations", async ({ page, signedIn, makeMember }) => {
  const [owner, outsider] = await Promise.all([makeMember({ visible: true }), makeMember()]);
  for (const member of [signedIn, owner, outsider]) finishPersonalOnboarding(member);
  const prefix = "institutions-" + randomUUID().slice(0, 8);
  const organizations = Array.from({ length: 16 }, (_, index) => {
    const suffix = String(index).padStart(2, "0");
    const handle = prefix + "-" + suffix;
    const name = "Following fixture " + suffix;
    const id = sql(`with inserted as (
      insert into private.organizations(handle,name,kind,country_code,created_by)
      values ('${handle}','${name}','nonprofit','HT','${owner.id}') returning id
    ) select id from inserted;`);
    return { id, handle, name };
  });
  for (const org of organizations) await apiCall(signedIn, "/api/v1/institutions/" + org.id + "/follow", 200, "PUT");
  await apiCall(signedIn, "/api/v1/members/" + owner.handle + "/follow", 200, "PUT");
  const endpoint = "/api/v1/me/following";
  expect((await fetch(api + endpoint)).status).toBe(401);
  expect((await apiCall(outsider, endpoint, 200)).accounts).toEqual([]);

  const [first, ...rest] = organizations;
  sql(`insert into private.organization_memberships(organization_id,user_id,role)
    values ('${first.id}','${signedIn.id}','owner');
    update private.organizations set description='Workshops and reading circles in local communities.',
      website='https://sample.example' where id='${first.id}';`);
  await page.goto("/institutions");
  const managed = page.locator("li").filter({ has: page.getByRole("heading", { name: first.name, exact: true }) });
  await expect(managed.getByText("Workshops and reading circles in local communities.")).toBeVisible();
  await expect(managed.getByText("Haiti", { exact: true })).toBeVisible();
  await expect(managed.getByRole("link", { name: "https://sample.example" })).toHaveAttribute("href", "https://sample.example");
  await expect(managed.getByRole("link", { name: t.manageOrganization })).toHaveAttribute("href", "/institutions/" + first.id);
  const following = page.getByRole("navigation", { name: t.institutions, exact: true }).getByRole("link", { name: t.followingInstitutions });
  await following.click();
  await expect(page).toHaveURL(/\/institutions\?view=following$/);
  await page.reload();
  await expect(following).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("region", { name: t.followedInstitutionsTitle });
  await expect(list.locator("li")).toHaveCount(15);
  const more = list.getByRole("button", { name: feedMessages.en.loadMore });
  await more.click();
  await expect(list.locator("li")).toHaveCount(16);
  await expect(more).toHaveCount(0);
  sql(`delete from feed_data.institution_follows where follower_id='${signedIn.id}'
    and organization_id in (${rest.map((org) => `'${org.id}'`).join(",")});`);
  await page.reload();
  await expect(list.locator("li")).toHaveCount(1);
  const link = list.getByRole("link", { name: first.name, exact: true });
  await expect(link).toHaveAttribute("href", "/organization/" + first.handle);
  await list.getByRole("button", { name: "Following", exact: true }).click();
  await expect(link).toHaveCount(0);
  await expect(list.getByText(t.noFollowedInstitutions)).toBeVisible();
  await page.reload();
  await expect(list.getByText(t.noFollowedInstitutions)).toBeVisible();
  expect((await apiCall(signedIn, endpoint, 200)).accounts).toMatchObject([{ kind: "member", handle: owner.handle }]);
});
