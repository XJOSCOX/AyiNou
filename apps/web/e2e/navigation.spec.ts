import { expect, test } from "./fixtures";
import { ambassadorMessages } from "../src/lib/ambassador-i18n";
import { pollMessages } from "../src/lib/poll-i18n";
import { projectMessages } from "../src/lib/project-i18n";

test("member navigation loads the main workspaces and empty views @smoke", async ({ page, signedIn }) => {
  const nav = page.getByRole("navigation", { name: "Dashboard", exact: true });
  const main = page.getByRole("main");
  const destinations = [
    ["Feed", "/feed"], ["Discover", "/discover"], ["Communities", "/communities"],
    ["Institutions", "/institutions"], ["Projects", "/projects"], ["Polls", "/polls"],
    ["Account settings", "/settings"], ["Verification", "/verification"],
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
  await expect(nav.getByRole("link", { name: /administration/i })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /review/i })).toHaveCount(0);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
