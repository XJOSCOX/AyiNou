import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ProjectProgress, ProjectWork } from "@ayinou/shared";
import { api, expect, test } from "./fixtures";
import { projectProgressMessages } from "../src/lib/project-progress-i18n";

const progressText = projectProgressMessages.en;

test("project progress preserves stale milestone edits and releases an outcome image", async ({ page, signedIn }, testInfo) => {
  const id = randomUUID();
  const milestoneId = randomUUID();
  const reportId = randomUUID();
  const base = api + "/api/v1/projects/" + id;
  const now = new Date().toISOString();
  const work: ProjectWork = {
    projectId: id, title: "Browser progress project", status: "active", version: 1,
    role: "owner", identity: "verified", canApply: false, team: [], invites: [],
    opportunities: [], applications: [], tasks: [], activity: [],
  };
  const progress: ProjectProgress = {
    status: "active", role: "owner", canManage: true, completedOn: null, taskCount: 0, milestoneCount: 0, history: [], metrics: [],
    milestones: [{
      id: milestoneId, title: "Run the first workshop", description: "Schedule and host the workshop.",
      startsOn: null, targetOn: null, target: null, unit: null, displayOrder: 10, publicRequested: false,
      updatedAt: now, status: "planned", version: 2, responsibleId: null, mine: false, canReview: false, canApprove: false,
    }],
    entries: [{
      id: reportId, kind: "report", visibility: "team", state: "draft", milestoneId: null,
      supersedesId: null, superseded: false, content: {
        title: "Workshop outcome draft", description: "Draft outcome details", summary: "Workshop summary",
        language: "en", references: [], includeMetrics: false,
      },
      snapshot: null, hasImage: true, approvedAt: null, updatedAt: now, version: 1,
      mine: true, canReview: false, reviewed: false,
    }],
  };
  const reads = { work: 0, progress: 0 };
  await page.route(base + "/work", (route) => {
    reads.work++;
    return route.fulfill({ json: work });
  });
  await page.route(base + "/progress/work", (route) => {
    reads.progress++;
    return route.fulfill({ json: progress });
  });
  await page.route(base + "/progress/milestones", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      action: "milestone_edit", id: milestoneId, version: 2, title: "Unsaved workshop revision",
    });
    await route.fulfill({ status: 409, json: { error: { code: "PROJECT_PROGRESS_CHANGED" } } });
  });
  const imageBytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#6485ad" } }).webp().toBuffer();
  await page.route(base + "/progress/entries/" + reportId + "/image", (route) => route.fulfill({
    contentType: "image/webp",
    body: imageBytes,
  }));
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    const revoked: string[] = [];
    Object.defineProperty(window, "revokedProgressUrls", { value: revoked });
    URL.revokeObjectURL = (url) => { revoked.push(url); revoke(url); };
  });
  const start = performance.now();
  await page.goto("/projects/" + id + "/work?section=milestones");
  await expect(page.getByRole("heading", { name: progress.milestones[0].title })).toBeVisible();
  const initialMs = Math.round(performance.now() - start);
  expect(reads).toEqual({ work: 1, progress: 1 });
  const milestone = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: progress.milestones[0].title }) });
  await milestone.locator("summary").filter({ hasText: progressText.actions.milestone_edit }).click();
  const title = milestone.getByRole("textbox", { name: progressText.title, exact: true });
  await title.fill("Unsaved workshop revision");
  await milestone.getByRole("button", { name: progressText.actions.milestone_edit, exact: true }).click();
  await expect(milestone.getByRole("alert")).toHaveText(progressText.errors.changed);
  await expect(title).toHaveValue("Unsaved workshop revision");

  const navigation = performance.now();
  await page.getByRole("button", { name: progressText.outcomes, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workshop outcome draft" })).toBeVisible();
  const tabMs = Math.round(performance.now() - navigation);
  const image = page.getByRole("img", { name: progressText.image, exact: true });
  await expect(image).toBeVisible();
  const url = await image.getAttribute("src");
  expect(url).toMatch(/^blob:/);
  await page.getByRole("button", { name: progressText.milestones, exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "revokedProgressUrls"))).toContain(url);
  expect(reads).toEqual({ work: 1, progress: 1 });
  await testInfo.attach("progress timings", {
    body: JSON.stringify({ initialMs, tabMs, reads }), contentType: "application/json",
  });
  expect(signedIn.handle).toMatch(/^e2e_/);
});
