import { apiCall, apiResponse, expect, inEnglish, login, test } from "./fixtures";
import { discoveryMessages } from "../src/lib/discovery-i18n";
import { mediaNotificationMessages } from "../src/lib/media-notification-i18n";

test("private posts and project drafts stay hidden from another member", async ({ page, signedIn, makeMember }) => {
  const owner = await makeMember();
  const postText = "Owner-only disposable post";
  const post = await apiCall(owner, "/api/v1/posts", 201, "POST",
    { body: postText, visibility: "private", language: "en" });
  await apiCall(owner, "/api/v1/posts/" + post.id, 200);
  const blocked = apiResponse(page, "/api/v1/posts/" + post.id);
  await page.goto("/posts/" + post.id);
  expect((await blocked).status()).toBe(404);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(postText);

  const title = "Owner-only disposable proposal";
  const project = await apiCall(owner, "/api/v1/projects", 201, "POST", {
    kind: "individual", owner: null, association: null, proposal: {
      title, description: "Disposable private draft.", problem: "", solution: "", objectives: "",
      beneficiaries: "", outcomes: "", category: "education", country: "CA", department: null,
      startDate: null, endDate: null, references: [], publishRequested: false,
    },
  });
  await apiCall(owner, "/api/v1/projects/" + project.id, 200);
  const unavailable = apiResponse(page, "/api/v1/projects/" + project.id);
  await page.goto("/projects/" + project.id);
  expect((await unavailable).status()).toBe(404);
  await expect(page.getByRole("main")).not.toContainText(title);
  await apiCall(signedIn, "/api/v1/projects/" + project.id, 404);
});

test("a private group discussion is unavailable to guests and nonmembers", async ({ browser, page, signedIn, makeMember }) => {
  const owner = await makeMember();
  const slug = owner.handle.replace("_", "-");
  const group = await apiCall(owner, "/api/v1/communities", 201, "POST", {
    slug, kind: "diaspora", name: "Private fixture discussion", description: "Disposable test community.",
    rules: "Temporary fixture rules.", policy: "private", discussionPublic: false, countryCode: "CA", topic: null,
  });
  const path = "/api/v1/communities/" + slug;
  const body = "Only the group owner can read this test content.";
  await apiCall(owner, path + "/posts", 201, "POST", { body, language: "en", groupVersion: group.community.version });
  expect(JSON.stringify(await apiCall(owner, path + "/posts", 200))).toContain(body);
  await apiCall(signedIn, path + "/posts", 404);
  for (const viewer of [page, await browser.newPage({ baseURL: "http://127.0.0.1:5400" })]) {
    try {
      await viewer.goto("/communities/" + slug);
      await expect(viewer.getByRole("main")).toBeVisible();
      await expect(viewer.getByRole("main")).not.toContainText(body);
      await expect(viewer.getByRole("textbox", { name: "Post text" })).toHaveCount(0);
    } finally {
      if (viewer !== page) await viewer.close();
    }
  }
});

test("notification links are recipient-scoped and blocking removes follow controls", async ({ page, context, makeMember }) => {
  const recipient = await makeMember({ visible: true });
  const sender = await makeMember({ visible: true });
  const outside = await makeMember();
  const follow = "/api/v1/members/" + recipient.handle + "/follow";
  await apiCall(sender, follow, 200, "PUT");
  await inEnglish(context);
  await login(page, recipient);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/notifications");
  const t = mediaNotificationMessages.en;
  const target = page.getByRole("link", { name: t.openTarget });
  await expect(target).toHaveAttribute("href", "/members/" + sender.handle);
  const timestamp = page.getByRole("main").locator("time");
  const value = await timestamp.getAttribute("datetime");
  expect(value).toBeTruthy();
  await expect(timestamp).toHaveText(new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(value!)));
  expect((await apiCall(outside, "/api/v1/me/notifications", 200)).notifications).toEqual([]);
  await apiCall(recipient, "/api/v1/members/" + sender.handle + "/block", 204, "PUT");
  await page.goto("/members/" + sender.handle);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: discoveryMessages.en.follow, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: discoveryMessages.en.following, exact: true })).toHaveCount(0);
});
