import { accountMessages } from "../src/lib/account-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { apiCall, enroll, expect, inEnglish, login, logout, solveMfa, sql, test } from "./fixtures";

test("guest access redirects before rendering protected screens @smoke", async ({ page, context }) => {
  await inEnglish(context);
  for (const path of ["/dashboard", "/feed", "/polls/new", "/settings", "/notifications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: authMessages.en.loginTitle })).toBeVisible();
    await expect(page.locator("#member-main")).toHaveCount(0);
  }
});

test("rejects a bad password, restores the session and signs out @smoke", async ({ page, context, makeMember }) => {
  await inEnglish(context);
  const member = await makeMember();
  await login(page, { ...member, password: "Incorrect-fixture!9" });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(authMessages.en.invalidCredentials);
  await expect(page).toHaveURL(/\/login/);
  await login(page, member);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: accountMessages.en.settings, exact: true })).toBeVisible();
  await logout(page);
  expect((await context.cookies()).filter(({ name }) => /^sb-.*auth-token/.test(name))).toHaveLength(0);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});

test("a restricted member loses an existing browser session and API access", async ({ page, signedIn }) => {
  sql(`insert into private.account_restrictions(user_id,status,reason)
    select id,'suspended','Disposable browser regression' from auth.users
    where id='${signedIn.id}' and email='${signedIn.email}' returning user_id;`);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/account-access/);
  await expect(page.locator("#member-main")).toHaveCount(0);
  await apiCall(signedIn, "/api/v1/me/profile", 401);
});

test("enrolled member completes a real TOTP challenge", async ({ page, context, makeMember }) => {
  const member = await makeMember();
  const secret = await enroll(member);
  await inEnglish(context);
  await login(page, member);
  await expect(page).toHaveURL(/\/mfa/);
  await solveMfa(page, secret);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("main")).toBeVisible();
});
