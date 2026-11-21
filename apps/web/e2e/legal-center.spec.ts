import { expect, test } from "@playwright/test";

const paths = ["/legal", "/terms", "/privacy", "/community-guidelines", "/legal/organizations", "/legal/projects-and-volunteers", "/legal/voting", "/legal/verification", "/legal/cookies", "/legal/data-rights", "/legal/history"];
const unavailable = { en: "Approved and published policies will appear here when available.", fr: "Les politiques approuvées et publiées apparaîtront ici lorsqu’elles seront disponibles.", ht: "Règleman ki apwouve epi pibliye yo ap parèt isit la lè yo disponib.", es: "Las políticas aprobadas y publicadas aparecerán aquí cuando estén disponibles." };

test("anonymous legal routes stay unpublished and draft-safe @smoke", async ({ page }) => {
  await page.context().addCookies([{ name: "ayinou-locale", value: "en", url: "http://127.0.0.1:5400" }]);
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    const html = await response!.text();
    expect(html).not.toMatch(/L4_APPROVAL_AND_GAP_REGISTER|L5_SOURCE_MANIFEST|Imaginary Lantern Rules|\[\[operator\]\]/);
    expect(html).not.toMatch(/<meta[^>]*name="description"[^>]*effective/i);
  }
  await page.goto("/legal");
  await expect(page.getByText(unavailable.en)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const unknown = await page.goto("/legal/unknown-policy");
  expect(unknown?.status()).toBe(404);
  const invalid = await page.goto("/terms?version=999.0.0");
  expect(invalid?.status()).toBe(404);
});

test("legal shell changes language and fits a narrow viewport @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/legal");
  const select = page.locator("main select");
  for (const [locale, message] of Object.entries(unavailable)) {
    await select.selectOption(locale);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(320);
  await expect(page.getByRole("main").getByRole("link", { name: /terms|kondisyon|conditions|términos/i }).first()).toBeVisible();
});
