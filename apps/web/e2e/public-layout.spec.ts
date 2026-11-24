import { expect, test } from "./fixtures";
import { projectMessages } from "../src/lib/project-i18n";

test("public pages align with the navigation and footer at each viewport", async ({ page }) => {
  const paths = ["/", "/about", "/legal"];
  for (const width of [320, 768, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      const logo = page.getByRole("banner").locator('img[src="/icon.png"]');
      await expect(logo).toHaveJSProperty("naturalWidth", 96);
      const layout = await page.evaluate(() => {
        const content = document.querySelector("main#main, main.public-container, main .public-container");
        const navigation = document.querySelector("header .public-container");
        const footer = document.querySelector("footer .public-container");
        function bounds(node: Element | null) {
          if (!node) return null;
          const { left, width } = node.getBoundingClientRect();
          return { left, width, gutter: getComputedStyle(node).paddingInlineStart };
        }
        const viewport = document.documentElement.clientWidth;
        return {
          viewport, content: bounds(content), navigation: bounds(navigation), footer: bounds(footer),
          overflow: document.documentElement.scrollWidth - viewport,
        };
      });
      const containerWidth = Math.min(layout.viewport, 1500);
      expect(layout.content, path).toEqual({
        left: (layout.viewport - containerWidth) / 2,
        width: containerWidth,
        gutter: width >= 640 ? "32px" : path === "/" ? "20px" : "16px",
      });
      const chrome = { ...layout.content, gutter: width < 640 ? "16px" : "32px" };
      expect(layout.navigation, path).toEqual(chrome);
      expect(layout.footer, path).toEqual(chrome);
      expect(layout.overflow, path).toBeLessThanOrEqual(1);
    }
  }
});

test("public app pages use the shared navigation without horizontal overflow", async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/community-directory", "/projects", "/ambassadors"]) {
      await page.goto(path);
      await expect(page.locator("aside nav")).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.locator("main#member-main h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test("signed-in project browsing uses the available workspace width", async ({ page, signedIn }) => {
  await page.setViewportSize({ width: 2560, height: 900 });
  await page.goto("/projects");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(main).toHaveAttribute("id", "member-main");
  const bounds = await main.boundingBox();
  expect(bounds!.width).toBeGreaterThan(1500);
  await page.setViewportSize({ width: 390, height: 900 });
  const projects = projectMessages.en;
  const filters = main.getByRole("button", { name: /^Filters/ });
  const category = main.getByRole("combobox", { name: projects.category, exact: true });
  await expect(category).toBeHidden();
  await filters.click();
  await category.selectOption("education");
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/projects" && url.searchParams.get("category") === "education";
  });
  await main.getByRole("button", { name: projects.filter }).click();
  expect((await filtered).ok()).toBe(true);
  await expect(filters).toContainText("Education");
  await expect(main.getByText(projects.emptyFiltered)).toBeVisible();
  await main.getByRole("button", { name: projects.clearFilters }).click();
  await expect(category).toHaveValue("");
  await expect(main.getByText(projects.emptyDirectory)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
