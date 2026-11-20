import { apiCall, apiResponse, enroll, expect, inEnglish, login, logout, solveMfa, test } from "./fixtures";
import { groupMessages } from "../src/lib/groups-i18n";

const t = groupMessages.en;

test("a new private community admits an invited member through the inbox", async ({ page, context, makeMember }) => {
  const owner = await makeMember();
  const recipient = await makeMember({ visible: true });
  const secret = await enroll(owner);
  await inEnglish(context);
  await login(page, owner);
  await solveMfa(page, secret);
  const slug = owner.handle.replace("_", "-");
  const name = "Private browser invitation group";
  await page.goto("/communities/new");
  await page.getByLabel(t.name, { exact: true }).fill(name);
  await page.getByLabel(t.slug, { exact: true }).fill(slug);
  await page.getByLabel(t.description, { exact: true }).fill("A disposable community for the invitation workflow.");
  await page.getByLabel(t.rules, { exact: true }).fill("Respect other community members.");
  await page.getByRole("combobox", { name: t.membershipPolicy, exact: true }).selectOption("private");
  const saved = apiResponse(page, "/api/v1/communities", "POST");
  await page.getByRole("button", { name: t.create, exact: true }).click();
  expect((await saved).status()).toBe(201);
  await expect(page).toHaveURL(new RegExp("/communities/" + slug + "$"));
  const groupPath = "/api/v1/communities/" + slug;
  await apiCall(recipient, groupPath + "/posts", 404);
  await page.getByRole("button", { name: t.manage, exact: true }).click();
  await page.getByLabel(t.handle, { exact: true }).fill(recipient.handle);
  await page.getByLabel(t.reason, { exact: true }).fill("Invited to the browser fixture group.");
  const invitation = apiResponse(page, groupPath + "/management", "POST");
  await page.getByRole("button", { name: t.invite, exact: true }).click();
  const invitationResponse = await invitation;
  expect(invitationResponse.status()).toBe(200);
  const { invitationId } = await invitationResponse.json();
  expect(invitationId).toBeTruthy();

  await logout(page);
  await login(page, recipient);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/communities/invitations");
  const invite = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
  await expect(invite).toBeVisible();
  const accepted = apiResponse(page, "/api/v1/me/community-invitations/" + invitationId, "PATCH");
  await invite.getByRole("button", { name: t.accept, exact: true }).click();
  expect((await accepted).status()).toBe(204);
  await expect(invite).toHaveCount(0);
  await apiCall(recipient, groupPath + "/posts", 200);
});
