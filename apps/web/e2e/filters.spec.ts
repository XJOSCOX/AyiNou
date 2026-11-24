import { expect, test } from "./fixtures";
import { discoveryMessages } from "../src/lib/discovery-i18n";
import { f24Messages } from "../src/lib/f24-i18n";
import { groupMessages } from "../src/lib/groups-i18n";

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

test("community, Discover, and Feed filters open only on demand", async ({ page, signedIn }) => {
  expect(signedIn).toBeDefined();
  await page.goto("/communities");
  await expect(page.getByRole("searchbox")).toBeVisible();
  let filters = page.getByRole("button",{ name:"Filters",exact:true });
  await expect(filters).toHaveAttribute("aria-expanded","false");
  await expect(page.getByRole("combobox",{ name:groupMessages.en.category,exact:true })).toBeHidden();
  await filters.click();
  await expect(page.getByRole("combobox",{ name:groupMessages.en.category,exact:true })).toBeVisible();
  await page.goto("/discover");
  await expect(page.getByRole("searchbox")).toBeVisible();
  filters = page.getByRole("button",{ name:"Filters",exact:true });
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
});
