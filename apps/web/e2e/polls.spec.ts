import { randomUUID } from "node:crypto";
import { apiCall, apiResponse, expect, sql, test } from "./fixtures";
import { pollMessages } from "../src/lib/poll-i18n";

const t = pollMessages.en;

test("scheduled poll refreshes both boundaries without losing an unsent reason", async ({ page, signedIn }) => {
  const time = (offset: number) => new Date(Date.now() + offset).toISOString();
  const poll = await apiCall(signedIn, "/api/v1/polls", 201, "POST", {
    title: "Disposable scheduled poll", description: "An isolated timing fixture.",
    scope: "individual", scopeId: null, taskId: null, policy: "advisory", kind: "community",
    language: "en", audience: "members", eligibility: "active", resultPolicy: "after_vote",
    opensAt: time(180_000), closesAt: time(360_000), quorum: null, threshold: null,
    options: ["One", "Two"], key: randomUUID(),
  });
  const path = "/api/v1/polls/" + poll.id;
  await apiCall(signedIn, path + "/transition", 200, "POST", { action: "publish", version: poll.version });
  await page.clock.install();
  await page.goto("/polls/" + poll.id);
  await expect(page.getByText(/Community opinion · Scheduled/)).toBeVisible();
  const radios = page.getByRole("group", { name: t.optionsTitle });
  await expect(radios.getByRole("radio", { name: "One" })).toBeDisabled();
  await page.getByRole("main").locator("summary").filter({ hasText: t.cancel }).click();
  const reason = page.getByLabel(t.reason);
  await reason.fill("Keep this unsent cancellation reason.");
  sql(`update private.polls set opens_at=now()-interval '5 seconds' where id='${poll.id}';`);
  await page.clock.fastForward(185_000);
  await expect(radios.getByRole("radio", { name: "One" })).toBeEnabled();
  await radios.getByRole("radio", { name: "Two" }).check();
  await expect(page.getByRole("button", { name: t.vote })).toBeEnabled();
  sql(`update private.polls set closes_at=now()-interval '1 second' where id='${poll.id}';`);
  await page.clock.fastForward(365_000);
  await expect(page.getByRole("button", { name: t.finalize })).toBeVisible();
  await expect(radios.getByRole("radio", { name: "Two" })).toBeChecked();
  await expect(radios.getByRole("radio", { name: "Two" })).toBeDisabled();
  await expect(page.getByRole("button", { name: t.vote })).toHaveCount(0);
  await expect(reason).toHaveValue("Keep this unsent cancellation reason.");
});

test("ballot receipt is bound to the voter and a stale write stays visible", async ({ page, signedIn, makeMember }) => {
  const voter = await makeMember();
  const opensAt = new Date(Date.now() + 180_000).toISOString();
  const draft = await apiCall(signedIn, "/api/v1/polls", 201, "POST", {
    title: "Disposable ballot", description: "An isolated ballot fixture.", scope: "individual",
    scopeId: null, taskId: null, policy: "advisory", kind: "community", language: "en",
    audience: "members", eligibility: "active", resultPolicy: "after_vote", opensAt,
    closesAt: new Date(Date.now() + 360_000).toISOString(), quorum: null, threshold: null,
    options: ["One", "Two"], key: randomUUID(),
  });
  const path = "/api/v1/polls/" + draft.id;
  await apiCall(signedIn, path + "/transition", 200, "POST", { action: "publish", version: draft.version });
  sql(`update private.polls set opens_at=now()-interval '5 seconds' where id='${draft.id}';`);
  await page.goto("/polls/" + draft.id);
  await page.getByRole("radio", { name: "One" }).check();
  const saved = apiResponse(page, path + "/ballot", "POST");
  await page.getByRole("button", { name: t.vote }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText(new RegExp(t.receipt))).toBeVisible();
  const receipt = await apiCall(signedIn, path + "/ballot", 200);
  expect(receipt.optionId).toBeTruthy();
  expect(await apiCall(voter, path + "/ballot", 200)).toEqual({ optionId: null });
  expect(await apiCall(signedIn, path + "/ballot", 200, "POST", receipt)).toEqual(receipt);
  await page.getByRole("main").locator("summary").filter({ hasText: t.cancel }).click();
  const reason = page.getByLabel(t.reason);
  await reason.fill("Keep a stale cancellation draft.");
  sql(`update private.polls set version=version+1 where id='${draft.id}';`);
  const stale = apiResponse(page, path + "/transition", "POST");
  await page.getByRole("button", { name: t.cancel, exact: true }).click();
  expect((await stale).status()).toBe(409);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(t.errors.POLL_CHANGED);
  await expect(reason).toHaveValue("Keep a stale cancellation draft.");
});
