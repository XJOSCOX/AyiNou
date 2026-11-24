import { randomUUID } from "node:crypto";
import type { ProjectWork, ProjectWorkIndex } from "@ayinou/shared";
import { api, expect, test } from "./fixtures";
import { membershipMessages } from "../src/lib/membership-i18n";
import { projectMessages } from "../src/lib/project-i18n";
import { projectWorkMessages } from "../src/lib/project-work-i18n";

const t = projectWorkMessages.en;

test("project team and volunteer tabs use one work read and preserve contributor controls", async ({ page, signedIn }) => {
  const id = randomUUID();
  const work: ProjectWork = {
    projectId: id, title: "Browser project team", status: "active", version: 1, role: "contributor", identity: "verified",
    canApply: true, team: [], invites: [{ id: randomUUID(), role: "volunteer", expiresAt: "2099-12-31T00:00:00Z", recipient: null, mine: true }],
    opportunities: [{
      id: randomUUID(), title: "Workshop registration", description: "Track attendance at the next workshop.",
      skills: "Scheduling", commitment: "Two hours", remote: true, capacity: 2, closesOn: null, open: true,
    }],
    applications: [], tasks: [], activity: [],
  };
  let reads = 0;
  await page.route(api + "/api/v1/projects/" + id + "/work", (route) => {
    expect(route.request().method()).toBe("GET");
    reads++;
    return route.fulfill({ json: work });
  });
  const index: ProjectWorkIndex = {
    work: [{ id, title: work.title, status: work.status }],
    opportunities: [],
  };
  await page.route(api + "/api/v1/me/project-work", (route) => route.fulfill({ json: index }));
  await page.goto("/projects/team");
  const navigation = page.getByRole("navigation", { name: projectMessages.en.title, exact: true });
  const navigationLinks = navigation.getByRole("link");
  const expectedLinks = [projectMessages.en.title, projectMessages.en.manage, t.workspace];
  await expect(navigationLinks).toHaveText(expectedLinks);
  await page.getByRole("link", { name: work.title, exact: true }).click();
  await expect(page.getByRole("heading", { name: work.title, level: 1, exact: true })).toBeVisible();
  await expect(navigationLinks).toHaveText(expectedLinks);
  await expect(navigation.getByRole("link", { name: t.workspace, exact: true })).toHaveAttribute("aria-current", "page");
  const workspaceTabs = page.getByRole("group", { name: t.workspace, exact: true });
  await workspaceTabs.getByRole("button", { name: t.team, exact: true }).click();
  await expect(page.getByRole("button", { name: t.events.invite_accept, exact: true })).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: t.events.invite })).toHaveCount(0);
  await page.getByRole("button", { name: t.volunteers, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workshop registration" })).toBeVisible();
  await expect(page.getByRole("button", { name: t.events.volunteer_apply, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: t.events.opportunity_close, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: membershipMessages.en.back, exact: true }).click();
  await expect(page).toHaveURL(/\?section=team$/);
  await expect(page.getByRole("button", { name: t.events.invite_accept, exact: true })).toBeVisible();
  expect(reads).toBe(1);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
