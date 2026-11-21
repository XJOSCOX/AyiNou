import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { messages, type Locale } from "../src/lib/i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { pollMessages } from "../src/lib/poll-i18n";
import { feedMessages } from "../src/lib/feed-i18n";
import { groupMessages } from "../src/lib/groups-i18n";
import { projectMessages } from "../src/lib/project-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";

const viewports = [{ width: 320, height: 810 }, { width: 768, height: 1024 },
  { width: 1440, height: 900 }, { width: 2560, height: 1080 }];
const cases = [
  ["/polls/new", pollMessages.en.create, pollMessages.en.question],
  ["/feed", feedMessages.en.feed, feedMessages.en.body],
  ["/projects/new", projectMessages.en.newProject, projectMessages.en.projectName],
  ["/communities/new", groupMessages.en.newGroup, groupMessages.en.name],
  ["/onboarding", authMessages.en.onboardingTitle, membershipMessages.en.firstName],
];

for (const viewport of viewports) {
  test(`viewport ${viewport.width}px keeps forms and navigation reachable`, async ({ page, signedIn }) => {
    await page.setViewportSize(viewport);
    for (const [url, title, name] of cases) {
      await page.goto(url);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: title, exact: true })).toBeVisible();
      const field = main.getByRole("textbox", { name, exact: true });
      await field.scrollIntoViewIfNeeded();
      const bounds = await field.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    const expand = page.getByRole("button", { name: messages.en.showSidebar });
    const collapse = page.getByRole("button", { name: messages.en.hideSidebar });
    const sidebar = page.getByRole("navigation", { name: authMessages.en.dashboard, exact: true });
    const polls = sidebar.getByRole("link", { name: pollMessages.en.title, exact: true });
    if (await expand.isVisible()) await expand.click();
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(polls.locator("span")).not.toHaveClass("sr-only");
    await collapse.press("Enter");
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(expand).toBeFocused();
    await expect(polls.locator("svg")).toBeVisible();
    await expect(polls.locator("span")).toHaveClass("sr-only");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await polls.press("Enter");
    await expect(page).toHaveURL(/\/polls$/);
    await expect(polls).toHaveAttribute("aria-current", "page");
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expand.click();
    await expect(polls.locator("span")).not.toHaveClass("sr-only");
    const menu = page.getByRole("banner").locator("details").first();
    await menu.locator("summary").click();
    const profile = menu.getByRole("link", { name: authMessages.en.myProfile, exact: true });
    await expect(profile).toBeVisible();
    const profileBounds = (await profile.boundingBox())!;
    expect(profileBounds.x).toBeGreaterThanOrEqual(0);
    expect(profileBounds.x + profileBounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(signedIn.handle).toMatch(/^e2e_/);
  });
}

test("four locale labels persist across pages and reload @smoke", async ({ page, signedIn }) => {
  await page.goto("/polls/new");
  let previous: Locale = "en";
  for (const locale of ["ht", "fr", "es", "en"] as const) {
    await page.getByRole("combobox", { name: messages[previous].languageLabel, exact: true }).selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: pollMessages[locale].create })).toBeVisible();
    await page.goto("/polls");
    await expect(page.getByRole("heading", { name: pollMessages[locale].title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.goto("/polls/new");
    previous = locale;
  }
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("keyboard focus, reduced motion and accessible controls in both themes @smoke", async ({ page, signedIn }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/polls/new");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: messages.en.skip });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const menu = page.getByRole("banner").locator("summary").first();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  expect(await page.evaluate(() => ({
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    scrolling: getComputedStyle(document.documentElement).scrollBehavior,
  }))).toEqual({ reduced: true, scrolling: "auto" });
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: theme === "light" ? messages.en.switchToDark : messages.en.switchToLight });
    await expect(toggle).toBeVisible();
    const report = await new AxeBuilder({ page }).include("main")
      .withRules(["color-contrast", "label", "button-name", "aria-valid-attr-value"]).analyze();
    expect(report.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target }) => target) }))).toEqual([]);
    if (theme === "light") {
      await toggle.click();
      await page.reload();
    }
  }
  expect(signedIn.handle).toMatch(/^e2e_/);
});
