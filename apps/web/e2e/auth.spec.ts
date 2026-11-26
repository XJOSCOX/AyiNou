import { accountEnforcementMessages } from "../src/lib/account-enforcement-i18n";
import { accountMessages } from "../src/lib/account-i18n";
import { authMessages } from "../src/lib/auth-i18n";
import { f24Messages } from "../src/lib/f24-i18n";
import { mediaNotificationMessages } from "../src/lib/media-notification-i18n";
import { messages } from "../src/lib/i18n";
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

test("settings sections retain their links and open independently", async ({ page, signedIn }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const a = accountMessages.en;
  const tabs = page.getByRole("navigation", { name: a.settings, exact: true });
  const security = page.getByRole("heading", { name: a.security, exact: true });
  await expect(security).toBeVisible();
  await expect(page.getByRole("heading", { name: a.privateCode })).toHaveCount(0);
  const notifications = mediaNotificationMessages.en.preferences;
  await tabs.getByRole("link", { name: notifications, exact: true }).click();
  await expect(page).toHaveURL(/#notification-preferences$/);
  await expect(security).toBeHidden();
  await page.reload();
  await expect(tabs.getByRole("link", { name: notifications, exact: true })).toHaveAttribute("aria-current", "location");
  await page.goto("/settings#follow-requests");
  await expect(tabs.getByRole("link", { name: f24Messages.en.privacy, exact: true })).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("heading", { name: f24Messages.en.followRequests, exact: true })).toBeVisible();
  await tabs.getByRole("link", { name: a.referrals, exact: true }).click();
  await expect(page.getByRole("heading", { name: a.privateCode })).toBeVisible();
  await tabs.getByRole("link", { name: a.security, exact: true }).click();
  await expect(page.getByRole("heading", { name: a.privateCode })).toHaveCount(0);
  await page.getByRole("link", { name: new RegExp(a.personal) }).click();
  await expect(page).toHaveURL(/\/profile#personal$/);
  await expect(page.getByRole("heading", { name: a.personal, exact: true })).toBeVisible();
  await expect(page.getByText("@" + signedIn.handle, { exact: true })).toBeVisible();
});

test("Account access has its own status page for members and guests", async ({ page, context, makeMember }) => {
  await inEnglish(context);
  await login(page, await makeMember());
  await expect(page).toHaveURL(/\/dashboard/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account-access");
  const copy = accountEnforcementMessages.en;
  await expect(page.getByRole("heading", { name: copy.noticesTitle })).toBeVisible();
  await expect(page.getByText(copy.noActiveNotices)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: authMessages.en.dashboard }))
    .toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("button", { name: "Pause slideshow", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: authMessages.en.logout, exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/account-access");
  await expect(page.getByText(copy.signInForNotices)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: authMessages.en.login })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("heading", { name: copy.noticesTitle })).toHaveCount(0);
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
  await page.setViewportSize({ width: 1440, height: 900 });
  const shell = page.locator("main > div").first();
  await page.goto("/register");
  const signUpSize = await shell.boundingBox();
  await page.goto("/login");
  const signInSize = await shell.boundingBox();
  expect(signInSize).not.toBeNull();
  expect(signUpSize).toMatchObject({ width: signInSize!.width, height: signInSize!.height });
  await login(page, member);
  await expect(page).toHaveURL(/\/mfa/);
  await expect(page.getByRole("region", { name: accountMessages.en.mfaTitle })).toBeVisible();
  const challengeSize = (await shell.boundingBox())!;
  expect(challengeSize.width).toBeLessThan(signInSize!.width);
  expect(challengeSize.height).toBeLessThan(signInSize!.height);
  expect(Math.abs(challengeSize.x + challengeSize.width / 2 - 720)).toBeLessThan(1);
  for (const [locale, width] of [["ht", 320], ["fr", 768], ["es", 1440], ["en", 320]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("combobox").selectOption(locale);
    const copy = accountMessages[locale];
    const panel = page.getByRole("region", { name: copy.mfaTitle });
    const confirm = panel.getByRole("button", { name: copy.mfaSubmit });
    await expect(panel).toBeVisible();
    await expect(confirm).toBeDisabled();
    const panelBox = (await panel.boundingBox())!;
    const codeBox = (await panel.getByLabel(copy.mfaChallengeCode).boundingBox())!;
    const confirmBox = (await confirm.boundingBox())!;
    expect(Math.abs(codeBox.x + codeBox.width / 2 - (panelBox.x + panelBox.width / 2))).toBeLessThan(1);
    expect(Math.abs(codeBox.x - confirmBox.x)).toBeLessThan(1);
    expect(Math.abs(codeBox.width - confirmBox.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: messages.en.switchToDark }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const code = page.getByLabel(accountMessages.en.mfaChallengeCode);
  await expect(code).toHaveAccessibleDescription(accountMessages.en.mfaHelp);
  await code.focus();
  await expect(code).toBeFocused();
  const slots = page.getByLabel(accountMessages.en.mfaChallengeCode).locator("..").locator("[data-active]");
  await expect(slots).toHaveCount(6);
  expect(await slots.evaluateAll((items) => items.map((item) => item.parentElement?.children.length))).toEqual([3, 3, 3, 3, 3, 3]);
  await code.fill("012 345");
  await expect(code).toHaveValue("012345");
  await expect(slots).toHaveText(["0", "1", "2", "3", "4", "5"]);
  await code.press("End");
  await code.press("Backspace");
  await expect(code).toHaveValue("01234");
  await expect(page.getByRole("button", { name: accountMessages.en.mfaSubmit })).toBeDisabled();
  await solveMfa(page, secret);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("main")).toBeVisible();
});
