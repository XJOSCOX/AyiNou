import { api, expect, test } from "./fixtures";
import { errorMessages } from "../src/lib/error-i18n";
import { messages } from "../src/lib/i18n";
import { pollMessages } from "../src/lib/poll-i18n";

const list = api + "/api/v1/polls*";

test("network loss and rate limit show localized errors with manual retry", async ({ page, signedIn }) => {
  await page.goto("/polls/new");
  await page.getByRole("combobox", { name: messages.en.languageLabel, exact: true }).selectOption("fr");
  let attempts = 0;
  await page.route(list, async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/v1/polls") return route.fallback();
    attempts++;
    if (attempts === 1) return route.abort("failed");
    if (attempts === 2) return route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED",
      message: "Synthetic raw backend exception" } } });
    await route.continue();
  });
  await page.goto("/polls");
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toHaveText(errorMessages.fr.network);
  await page.getByRole("button", { name: errorMessages.fr.retry }).click();
  await expect(alert).toHaveText(errorMessages.fr.rate);
  await page.getByRole("button", { name: errorMessages.fr.retry }).click();
  await expect(page.getByText(pollMessages.fr.empty)).toBeVisible();
  expect(attempts).toBe(3);
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("a timed-out social request can be retried", async ({ page, signedIn }) => {
  let calls = 0;
  await page.route(list, async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/v1/polls") return route.fallback();
    // Leave the first request pending so the client's real timeout owns cancellation.
    if (++calls > 1) await route.continue();
  });
  await page.goto("/polls");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(errorMessages.en.timeout, { timeout: 18_000 });
  await page.getByRole("button", { name: errorMessages.en.retry }).click();
  await expect(page.getByText(pollMessages.en.empty)).toBeVisible();
  expect(calls).toBe(2);
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("invalid API session offers sign-in and missing poll renders a safe error", async ({ page, signedIn }) => {
  await page.route(list, (route) => route.fulfill({ status: 401, json: {
    error: { message: "Synthetic credentials detail" },
  } }), { times: 1 });
  await page.goto("/polls");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(errorMessages.en.auth);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login");
  await page.goto("/polls/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Synthetic credentials detail");
  expect(signedIn.handle).toMatch(/^e2e_/);
});
