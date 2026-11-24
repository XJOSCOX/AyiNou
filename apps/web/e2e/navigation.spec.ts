import { api, expect, test } from "./fixtures";
import { accountMessages } from "../src/lib/account-i18n";
import { adminMessages } from "../src/lib/admin-i18n";
import { ambassadorMessages } from "../src/lib/ambassador-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { institutionMessages } from "../src/lib/institution-i18n";
import { pollMessages } from "../src/lib/poll-i18n";
import { projectMessages } from "../src/lib/project-i18n";

test("member navigation loads the main workspaces and empty views @smoke", async ({ page, signedIn }) => {
  await page.route((url) => url.origin === api && url.pathname === "/api/v1/polls", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }));
  const nav = page.getByRole("navigation", { name: "Dashboard", exact: true });
  const main = page.getByRole("main");
  const destinations = [
    ["Feed", "/feed"], ["Discover", "/discover"], ["Communities", "/communities"],
    ["Institutions", "/institutions"], ["Projects", "/projects"], ["Polls", "/polls"],
    ["Founding Ambassadors", "/ambassadors"], ["Dashboard", "/dashboard"],
  ];
  for (const [name, path] of destinations) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    if (path === "/polls") await expect(main.getByText(pollMessages.en.empty)).toBeVisible();
    if (path === "/projects") await expect(main.getByText(projectMessages.en.emptyDirectory)).toBeVisible();
    if (path === "/ambassadors") await expect(main.getByText(ambassadorMessages.en.emptyDirectory)).toBeVisible();
  }
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(main.getByRole("heading", { name: "Notifications" })).toBeVisible();

  const menu = page.getByRole("banner").locator("details").first();
  const toggle = menu.locator("summary");
  const accountDestinations = [
    [authMessages.en.myProfile, "/profile"],
    [accountMessages.en.settings, "/settings"],
    [institutionMessages.en.verification, "/verification"],
  ] as const;
  for (const [name, path] of accountDestinations) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
    await toggle.click();
    await menu.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(menu).not.toHaveAttribute("open", "");
  }

  const administration = adminMessages.en.administration;
  const review = institutionMessages.en.review;
  await toggle.click();
  await expect(menu.getByRole("link", { name: administration, exact: true })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: review, exact: true })).toHaveCount(0);

  await page.route(api + "/api/v1/me/platform-access", (route) =>
    route.fulfill({ json: { administrator: true, reviewer: true, totp: true } }));
  await page.reload();
  await toggle.click();
  await expect(menu.getByRole("link", { name: administration, exact: true })).toHaveAttribute("href", "/admin");
  await expect(menu.getByRole("link", { name: review, exact: true })).toHaveAttribute("href", "/verification/review");
  await expect(nav.locator('a[href="/admin"], a[href="/verification/review"]')).toHaveCount(0);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
