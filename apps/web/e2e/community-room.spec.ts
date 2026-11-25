import { expect, finishPersonalOnboarding, test } from "./fixtures";

test("Ouest keeps discussion, member directory, and membership controls usable in the new layout", async ({ page, signedIn }) => {
  finishPersonalOnboarding(signedIn);
  await page.goto("/communities/ouest");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Ouest", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Communities", exact: true })).toHaveAttribute("href", "/communities");
  await expect(main.getByText("Join to read and take part in the discussion.")).toBeVisible();
  await main.getByRole("button", { name: "Join", exact: true }).click();

  const discussion = main.getByRole("button", { name: "Discussion", exact: true });
  await expect(discussion).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByRole("region", { name: "Discussion", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "My community needs", exact: true })).toHaveAttribute("href", "/communities/intake/needs");
  await expect(main.getByRole("button", { name: "Leave", exact: true })).toBeHidden();

  await main.getByRole("button", { name: "Members", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Listed members" })).toBeVisible();
  await main.getByText("Membership", { exact: true }).click();
  await expect(main.getByRole("checkbox", { name: /Show my public profile/ })).toBeVisible();
  await expect(main.getByRole("button", { name: "Leave", exact: true })).toBeVisible();
  await main.getByText("Membership", { exact: true }).click();
  await main.getByText("Community rules", { exact: true }).click();
  await expect(main.getByText(/Discuss ideas with respect/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await discussion.click();
  await expect(main.getByRole("region", { name: "Discussion", exact: true })).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390);
});
