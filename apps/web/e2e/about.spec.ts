import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import aboutEn from "../src/messages/about/en.json";
import aboutEs from "../src/messages/about/es.json";
import aboutFr from "../src/messages/about/fr.json";
import aboutHt from "../src/messages/about/ht.json";

test("About is a standalone public page with localized content and a reachable contact link @smoke", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ht");
  await expect(page.locator("main #about")).toHaveCount(0);
  await page.getByRole("navigation", { name: "AyiNou" }).locator('a[href="/about"]').click();
  await expect(page).toHaveURL(/\/about$/);
  for (const [locale, copy] of Object.entries({ ht: aboutHt, fr: aboutFr, en: aboutEn, es: aboutEs })) {
    await page.getByRole("banner").getByRole("combobox").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1, name: copy.intro.title })).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(10);
    await expect(page.getByText(copy.future.body)).toBeVisible();
  }
  await page.getByRole("banner").getByRole("combobox").selectOption("en");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  const contact = page.getByRole("link", { name: "contact@ayinou.com", exact: true });
  await expect(contact).toHaveAttribute("href", "mailto:contact@ayinou.com");
  await page.getByRole("main").locator("h1").click();
  await page.keyboard.press("Tab");
  await expect(contact).toBeFocused();
  const a11y = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});

test("signed-in members can open the public About page from the footer", async ({ page, signedIn }) => {
  await page.getByRole("contentinfo").getByRole("link", { name: "About AyiNou" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "About AyiNou", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(signedIn.handle)).toHaveCount(0);
});
