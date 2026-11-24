import sharp from "sharp";
import { api, apiResponse, expect, login, logout, test } from "./fixtures";
import { accountMessages } from "../src/lib/account-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { discoveryMessages } from "../src/lib/discovery-i18n";
import { feedMessages } from "../src/lib/feed-i18n";
import { groupMessages } from "../src/lib/groups-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";
import { pollMessages } from "../src/lib/poll-i18n";
import { projectMessages } from "../src/lib/project-i18n";
import { messages } from "../src/lib/i18n";
import { errorMessages } from "../src/lib/error-i18n";

const feed = feedMessages.en;
const polls = pollMessages.en;
const projects = projectMessages.en;

test("feed draft survives tab changes and a failed submit without automatic replay @smoke", async ({ page, signedIn }) => {
  await page.goto("/feed");
  const composer = page.getByRole("region", { name: feed.write });
  const text = composer.getByRole("textbox", { name: feed.body });
  await text.fill("Private draft with a recoverable error.");
  await page.getByRole("button", { name: discoveryMessages.en.followingFeed, exact: true }).click();
  await page.getByRole("button", { name: feed.timeline, exact: true }).click();
  await expect(text).toHaveValue("Private draft with a recoverable error.");
  await composer.getByRole("combobox", { name: feed.visibility }).selectOption("private");
  const keys: string[] = [];
  await page.route(api + "/api/v1/posts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE",
      message: "Internal database fixture details" } } });
    await route.continue();
  });
  await composer.getByRole("button", { name: /publish|save draft/i }).click();
  await expect(composer.getByRole("alert")).toHaveText(errorMessages.en.server);
  await expect(text).toHaveValue("Private draft with a recoverable error.");
  expect(keys).toHaveLength(1);
  const posted = apiResponse(page, "/api/v1/posts", "POST");
  await composer.getByRole("button", { name: /publish|save draft/i }).click();
  expect((await posted).status()).toBe(201);
  await expect(page.getByText("Private draft with a recoverable error.", { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toEqual(keys[0]);
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("creates and reloads a poll draft @smoke", async ({ page, signedIn }) => {
  await page.goto("/polls/new");
  await page.getByLabel(polls.question).fill("Which training should we plan?");
  await page.getByLabel(polls.description).fill("A disposable browser draft.");
  await page.getByLabel(polls.options).fill("One\nTwo");
  const iso = (offset: number) => new Date(Date.now() + offset).toISOString().slice(0, 16);
  await page.getByLabel(polls.opensAt).fill(iso(3_600_000));
  await page.getByLabel(polls.closesAt).fill(iso(7_200_000));
  const saved = apiResponse(page, "/api/v1/polls", "POST");
  await page.getByRole("button", { name: polls.save }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Which training should we plan?" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(polls.question)).toHaveValue("Which training should we plan?");
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("project draft keeps entered fields after a transient write failure", async ({ page, signedIn }) => {
  await page.goto("/projects/new");
  await expect(page.getByText(projects.proposalIdentityRequired)).toBeVisible();
  const title = "Local training proposal";
  await page.getByLabel(projects.projectName).fill(title);
  await page.getByRole("combobox", { name: /^Category/ }).selectOption("education");
  await page.getByLabel(projects.fields.description, { exact: true }).fill("A local test proposal.");
  await page.route(api + "/api/v1/projects", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE" } } });
  }, { times: 1 });
  await page.getByRole("button", { name: projects.saveDraft }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(errorMessages.en.server);
  await expect(page.getByLabel(projects.projectName)).toHaveValue(title);
  await page.getByRole("button", { name: projects.saveDraft }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: projects.detailsHeading })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: projects.title, exact: true });
  await expect(navigation.getByRole("link", { name: projects.manage, exact: true })).toHaveAttribute("aria-current", "page");
  const edit = page.getByRole("button", { name: projects.edit, exact: true });
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await edit.click();
  await expect(page.getByRole("heading", { name: projects.detailsHeading })).toBeHidden();
  await page.getByLabel(projects.projectName).fill("Updated training proposal");
  await edit.click();
  await expect(page.getByLabel(projects.projectName)).toBeHidden();
  await edit.click();
  await expect(page.getByLabel(projects.projectName)).toHaveValue("Updated training proposal");
  await page.getByRole("button", { name: projects.saveDraft }).click();
  await expect(page.getByRole("heading", { name: "Updated training proposal", exact: true })).toBeVisible();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel(projects.projectName)).toBeHidden();
  await expect(page.getByRole("heading", { name: projects.detailsHeading })).toBeVisible();
  await expect(page.getByRole("main").getByText(projects.saved, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 850 });
  await edit.click();
  await expect(page.getByLabel(projects.projectName)).toHaveValue("Updated training proposal");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("group form announces Spanish validation and keeps the entered name", async ({ page, signedIn }) => {
  await page.goto("/communities/new");
  await page.getByRole("combobox", { name: messages.en.languageLabel, exact: true }).selectOption("es");
  const t = groupMessages.es;
  await page.getByLabel(t.name, { exact: true }).fill("Grupo de prueba");
  const slug = page.getByLabel(t.slug, { exact: true });
  await slug.fill("invalid spaces");
  await page.getByRole("button", { name: t.create, exact: true }).click();
  await expect.poll(() => slug.evaluate((field) => (field as HTMLInputElement).validationMessage))
    .toBe(messages.es.validation.invalid);
  await expect(slug).toBeFocused();
  await expect(page.getByLabel(t.name, { exact: true })).toHaveValue("Grupo de prueba");
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("profile saves, replaces a selected image, renews it and clears it on account change", async ({ page, signedIn, makeMember }) => {
  await page.clock.install();
  const reads = { profile: 0, access: 0 };
  const onRequest = (request: import("@playwright/test").Request) => {
    if (request.method() !== "GET") return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/me/profile") reads.profile++;
    if (pathname === "/api/v1/me/platform-access") reads.access++;
  };
  page.on("request", onRequest);
  const access = apiResponse(page, "/api/v1/me/platform-access");
  await page.goto("/profile");
  const m = membershipMessages.en;
  const t = authMessages.en;
  await expect(page.getByLabel(t.displayName, { exact: true })).toBeVisible();
  expect((await access).ok()).toBe(true);
  expect(reads).toEqual({ profile: 1, access: 1 });
  page.off("request", onRequest);
  const sections = page.getByRole("navigation", { name: t.profileTitle });
  await sections.getByRole("link", { name: accountMessages.en.personal, exact: true }).click();
  await expect(page.getByLabel(t.displayName, { exact: true })).toBeHidden();
  await page.getByRole("radio", { name: m.haitian }).check();
  await page.getByLabel(m.firstName, { exact: true }).fill("Browser");
  await page.getByLabel(m.lastName, { exact: true }).fill("Fixture");
  await sections.getByRole("link", { name: m.publicProfile, exact: true }).click();
  await page.getByLabel(t.displayName, { exact: true }).fill("Updated browser fixture");
  await page.getByLabel(m.biography).fill("Disposable test biography");
  const saved = apiResponse(page, "/api/v1/me/profile/details", "PATCH");
  await page.getByRole("button", { name: t.saveProfile }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: t.saved })).toBeVisible();
  const personal = sections.getByRole("link", { name: accountMessages.en.personal, exact: true });
  await personal.click();
  await page.reload();
  await expect(personal).toHaveAttribute("aria-current", "location");
  await expect(page.getByLabel(m.firstName, { exact: true })).toHaveValue("Browser");
  await sections.getByRole("link", { name: m.publicProfile, exact: true }).click();
  const photo = page.getByLabel(m.addPhoto);
  const avatar = page.getByRole("banner").locator("summary img");
  let previous: string | null = null;
  for (const color of ["#275eda", "#d64c40"]) {
    const buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: color } }).png().toBuffer();
    const saved = apiResponse(page, "/api/v1/me/profile/avatar", "POST");
    await photo.setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer });
    expect((await saved).status()).toBe(200);
    await expect(avatar).toBeVisible();
    if (previous) await expect(avatar).not.toHaveAttribute("src", previous);
    previous = await avatar.getAttribute("src");
    await expect.poll(() => avatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.goto("/feed");
  const composerAvatar = page.getByRole("region", { name: feed.write }).locator("img");
  await expect.poll(() => composerAvatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.goto("/settings");
  await expect(avatar).toBeVisible();
  await page.reload();
  await expect.poll(() => avatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const renewed = apiResponse(page, "/api/v1/me/profile");
  await page.clock.fastForward(125_000);
  expect((await renewed).status()).toBe(200);
  const other = await makeMember();
  await logout(page);
  await expect(avatar).toHaveCount(0);
  await login(page, other);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(avatar).toHaveCount(0);
  expect(signedIn.id).not.toEqual(other.id);
});
