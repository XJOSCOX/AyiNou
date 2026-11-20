import { api, apiResponse, expect, test } from "./fixtures";
import { authMessages } from "../src/lib/auth-i18n";
import { membershipMessages } from "../src/lib/membership-i18n";

test("onboarding preserves fields on save failure and restores its step and locale on reload", async ({ page, signedIn }) => {
  const t = membershipMessages.en;
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: t.haitian, exact: true }).check();
  await page.getByLabel(t.firstName).fill("Ada");
  await page.getByLabel(t.lastName).fill("Browser");
  await page.getByRole("combobox", { name: authMessages.en.preferredLanguage, exact: true }).selectOption("fr");
  await page.route(api + "/api/v1/me/profile/details", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE" } } });
  });
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(authMessages.en.saveError);
  await expect(page.getByLabel(t.firstName)).toHaveValue("Ada");
  await expect(page.getByRole("combobox", { name: authMessages.en.preferredLanguage, exact: true })).toHaveValue("fr");
  await page.unroute(api + "/api/v1/me/profile/details");

  const saved = apiResponse(page, "/api/v1/me/profile/details", "PATCH");
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator('[aria-current="step"]')).toHaveText(membershipMessages.fr.location);
  await page.reload();
  await expect(page.locator('[aria-current="step"]')).toHaveText(membershipMessages.fr.location);
  await expect(page.getByRole("combobox", { name: authMessages.fr.country, exact: true })).toBeVisible();
  expect(signedIn.handle).toMatch(/^e2e_/);
});
