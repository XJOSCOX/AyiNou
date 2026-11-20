import { randomUUID } from "node:crypto";
import type { ProjectWork } from "@ayinou/shared";
import { api, expect, test } from "./fixtures";
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
  await page.goto("/projects/" + id + "/work");
  await page.getByRole("button", { name: t.team, exact: true }).click();
  await expect(page.getByRole("button", { name: t.events.invite_accept, exact: true })).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: t.events.invite })).toHaveCount(0);
  await page.getByRole("button", { name: t.volunteers, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workshop registration" })).toBeVisible();
  await expect(page.getByRole("button", { name: t.events.volunteer_apply, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: t.events.opportunity_close, exact: true })).toHaveCount(0);
  expect(reads).toBe(1);
  expect(signedIn.handle).toMatch(/^e2e_/);
});
