import { expect, test } from "./fixtures";
import { messages } from "../src/lib/i18n";
import { institutionMessages } from "../src/lib/institution-i18n";
import { trustMessages } from "../src/lib/trust-i18n";

test("direct administration and verification review routes deny an ordinary member", async ({ page, signedIn }) => {
  const denied = await page.goto("/admin");
  expect(denied?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: messages.en.notFound })).toBeVisible();
  await expect(page.getByRole("button", { name: trustMessages.en.trustWorkspace, exact: true })).toHaveCount(0);
  expect((await page.goto("/verification/review"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: messages.en.notFound })).toBeVisible();
  await expect(page.getByRole("group", { name: institutionMessages.en.applications })).toHaveCount(0);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
