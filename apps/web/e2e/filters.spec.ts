import { apiCall, expect, finishPersonalOnboarding, test } from "./fixtures";
import { discoveryMessages } from "../src/lib/discovery-i18n";
import { f24Messages } from "../src/lib/f24-i18n";
import { groupMessages } from "../src/lib/groups-i18n";
import { communityDirectoryMessages } from "../src/lib/communities-i18n";
import { communityDiscoveryMessages } from "../src/lib/community-discovery-i18n";

test("text search stays visible and advanced event filters preserve their selection when collapsed", async ({ page, signedIn }) => {
  expect(signedIn).toBeDefined();
  await page.setViewportSize({ width: 420, height: 850 });
  await page.goto("/events");
  await expect(page.getByRole("searchbox", { name:"Search by title" })).toBeVisible();
  const filters = page.getByRole("button",{ name:/^Filters/ });
  const category = page.getByRole("combobox",{ name:"Category",exact:true });
  await expect(filters).toHaveAttribute("aria-expanded","false");
  await expect(category).toBeHidden();
  expect(await filters.evaluate((button) => {
    const search = document.querySelector("main input[type=search]");
    return search ? Boolean(button.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  })).toBe(true);
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(filters).toHaveAttribute("aria-expanded","true");
  await category.selectOption("education");
  await page.getByRole("button",{ name:"Apply filters" }).click();
  await expect(filters).toHaveText(/1 active/);
  await filters.click();
  await expect(category).toBeHidden();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await filters.click();
  await expect(category).toHaveValue("education");
});

test("community, Discover, and Feed controls open only on demand", async ({ page, signedIn, makeMember }) => {
  expect(signedIn).toBeDefined();
  const author = await makeMember({ visible: true });
  finishPersonalOnboarding(author);
  const recommendedPost = "Recommended post for the Feed toolbar test";
  await apiCall(author, "/api/v1/posts", 201, "POST", { body: recommendedPost, visibility: "public", language: "en" });
  await page.goto("/communities");
  await expect(page.getByRole("searchbox")).toBeVisible();
  let filters = page.getByRole("button",{ name:"Filters",exact:true });
  await expect(filters).toHaveAttribute("aria-expanded","false");
  await expect(page.getByRole("combobox",{ name:groupMessages.en.category,exact:true })).toBeHidden();
  await filters.click();
  await expect(page.getByRole("combobox",{ name:groupMessages.en.category,exact:true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/discover");
  const discoverySearch = page.getByRole("searchbox", { name: discoveryMessages.en.search });
  const searchButton = page.getByRole("button", { name: discoveryMessages.en.search, exact: true });
  await expect(discoverySearch).toBeVisible();
  filters = page.getByRole("button",{ name:"Filters",exact:true });
  const [filterBox, searchBox, submitBox] = await Promise.all([filters.boundingBox(), discoverySearch.boundingBox(), searchButton.boundingBox()]);
  expect(filterBox!.x).toBeLessThan(searchBox!.x);
  expect(searchBox!.x).toBeLessThan(submitBox!.x);
  expect(Math.abs(searchBox!.y - submitBox!.y)).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await discoverySearch.fill(author.handle);
  const results = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/discover/people" && url.searchParams.get("q") === author.handle;
  });
  await searchButton.click();
  expect((await results).ok()).toBe(true);
  const memberCard = page.getByRole("listitem").filter({ hasText: "@" + author.handle });
  await expect(memberCard.getByRole("link")).toHaveAttribute("href", "/members/" + author.handle);
  await expect(page.getByText(discoveryMessages.en.verifiedOnly,{ exact:true })).toBeHidden();
  await filters.click();
  await expect(page.getByText(discoveryMessages.en.verifiedOnly,{ exact:true })).toBeVisible();
  await page.getByRole("button",{ name:f24Messages.en.posts,exact:true }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("main").getByRole("combobox",{ name:f24Messages.en.language,exact:true })).toBeHidden();
  await page.goto("/feed");
  filters = page.getByRole("button",{ name:/^Filters/ });
  await expect(filters).toHaveText(/All languages/);
  await expect(page.getByRole("checkbox",{ name:"Français" })).toBeHidden();
  await filters.click();
  await expect(page.getByRole("checkbox",{ name:"Français" })).toBeVisible();
  await filters.click();

  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole("button", { name: "For You", exact: true }).click();
  const settings = page.getByRole("button", { name: "Recommendation settings", exact: true });
  const refresh = page.getByRole("button", { name: "Refresh For You", exact: true });
  const panel = page.getByRole("region", { name: "Recommendation settings", exact: true });
  await expect(refresh).toBeVisible();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  await expect(panel.getByRole("button", { name: "Save topics", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await settings.click();
  await expect(panel).toBeHidden();
  const refreshed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/feed" && url.searchParams.get("scope") === "for_you";
  });
  await refresh.click();
  expect((await refreshed).ok()).toBe(true);
  const recommended = page.getByRole("region", { name: "For You", exact: true })
    .getByRole("article").filter({ hasText: recommendedPost });
  const why = recommended.getByText("Why am I seeing this?", { exact: true });
  await why.click();
  await expect(recommended.getByRole("button", { name: "Not interested", exact: true })).toBeVisible();
  await why.press("Escape");
  await expect(recommended.getByRole("button", { name: "Not interested", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Latest posts", exact: true }).click();
  await expect(settings).toHaveCount(0);
});

test("Communities keeps each tab usable on a phone", async ({ page, signedIn }) => {
  expect(signedIn).toBeDefined();
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/communities");
  const groups = groupMessages.en;
  const directory = communityDirectoryMessages.en;
  const discovery = communityDiscoveryMessages.en;
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  const search = page.getByRole("searchbox");

  const why = page.getByText(discovery.why, { exact: true }).first();
  await expect(why).toBeVisible();
  await expect(page.getByRole("button", { name: discovery.notInterested })).toHaveCount(0);
  await why.click();
  await expect(page.getByRole("button", { name: discovery.notInterested })).toBeVisible();
  await why.press("Escape");
  await expect(page.getByRole("button", { name: discovery.notInterested })).toHaveCount(0);
  const preferences = page.getByRole("button", { name: discovery.reset, exact: true }).and(page.locator("[aria-expanded]"));
  await preferences.click();
  await expect(page.getByText(discovery.recommendIntro)).toBeVisible();
  await preferences.click();

  for (const [tab, searchLabel, field] of [
    [discovery.recommended, groups.searchGroups, page.getByRole("combobox", { name: groups.category })],
    [groups.officialDepartments, directory.search],
    [groups.diaspora, groups.searchGroups, page.getByRole("textbox", { name: groups.country })],
    [groups.interest, groups.searchGroups, page.getByRole("combobox", { name: groups.topic })],
    [directory.mine, groups.searchCommunities],
  ] as const) {
    const button = page.getByRole("button", { name: tab, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(search).toHaveAccessibleName(searchLabel);
    if (field) {
      await expect(field).toBeHidden();
      await filters.click();
      await expect(field).toBeVisible();
      await expect(search).toBeVisible();
      await filters.click();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  await expect(page.getByRole("heading", { name: discovery.groupsJoined })).toBeVisible();
  await expect(page.getByRole("heading", { name: groups.invitations })).toBeVisible();

  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route((url) => url.pathname.endsWith("/groups") && url.searchParams.get("kind") === "diaspora", async (route) => {
    await responseGate;
    await route.continue();
  });
  await page.getByRole("button", { name: groups.diaspora, exact: true }).click();
  const loading = page.getByRole("status").filter({ hasText: directory.loading });
  try {
    await expect(loading.locator("[aria-hidden=true] > div")).toHaveCount(3);
    await expect(loading.getByText(directory.loading)).toHaveClass("sr-only");
  } finally {
    releaseResponse();
  }
  await expect(loading).toHaveCount(0);
});

test("the Feed fills the available area without horizontal scrolling", async ({ page, signedIn }) => {
  expect(signedIn).toBeDefined();
  await page.goto("/feed");
  const heading = page.getByRole("heading", { name: "Feed", exact: true });
  await expect(heading).toBeVisible();

  for (const width of [390, 900, 1920]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => heading.evaluate((element) => {
      const header = element.closest("header")!;
      const main = element.closest("main")!;
      const { paddingLeft, paddingRight } = getComputedStyle(main);
      const availableWidth = main.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
      return Math.abs(availableWidth - header.getBoundingClientRect().width);
    })).toBeLessThan(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
