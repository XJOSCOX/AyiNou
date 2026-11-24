import { randomUUID } from "node:crypto";
import { apiCall, apiResponse, expect, sql, test } from "./fixtures";
import { pollMessages } from "../src/lib/poll-i18n";

const t = pollMessages.en;

test("scheduled poll refreshes both boundaries without losing an unsent reason", async ({ page, signedIn, makeMember }) => {
  const reviewer = await makeMember();
  sql(`update public.profiles set is_visible=true where user_id='${signedIn.id}';
    insert into public.user_settings(user_id,discoverable) values ('${signedIn.id}',true)
      on conflict(user_id) do update set discoverable=true;
    insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
      values ('${signedIn.id}','identity','verified','review','${reviewer.id}',now());`);
  const time = (offset: number) => new Date(Date.now() + offset).toISOString();
  const closesAt = time(360_000);
  const poll = await apiCall(signedIn, "/api/v1/polls", 201, "POST", {
    title: "Disposable scheduled poll", description: "An isolated timing fixture.",
    scope: "individual", scopeId: null, taskId: null, policy: "advisory", kind: "community",
    language: "en", audience: "members", eligibility: "active", resultPolicy: "after_vote",
    opensAt: time(180_000), closesAt, quorum: null, threshold: null,
    options: ["One", "Two"], key: randomUUID(),
  });
  const path = "/api/v1/polls/" + poll.id;
  await apiCall(signedIn, path + "/transition", 200, "POST", { action: "publish", version: poll.version });
  await page.clock.install();
  await page.goto("/polls");
  const pollRow = page.getByRole("link", { name: "Disposable scheduled poll", exact: true });
  await expect(pollRow.getByText(t.states.scheduled, { exact: true })).toBeVisible();
  await expect(pollRow.getByRole("img", { name: "Identity verified", exact: true })).toBeVisible();
  const listedClose = await pollRow.locator("time").getAttribute("datetime");
  expect(Date.parse(listedClose!)).toBe(Date.parse(closesAt));
  await pollRow.click();
  await expect(page).toHaveURL("/polls/" + poll.id);
  await expect(page.getByRole("heading", { name: "Disposable scheduled poll" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Polls", exact: true }).getByRole("link", { name: t.mine }))
    .toHaveAttribute("href", "/polls/mine");
  await expect(page.getByText(t.states.scheduled, { exact: true })).toBeVisible();
  await expect(page.getByRole("meter")).toHaveCount(0);
  await expect(page.locator("main article header").getByRole("img", { name: "Identity verified", exact: true })).toBeVisible();
  const timer = page.getByRole("timer");
  await expect(timer).toContainText(t.opensIn);
  const initialCountdown = await timer.innerText();
  await page.clock.runFor(2_000);
  await expect(timer).not.toHaveText(initialCountdown);
  const radios = page.getByRole("group", { name: t.optionsTitle });
  await expect(radios.getByRole("radio", { name: "One" })).toBeDisabled();
  const layout = () => page.locator("main article").evaluate((article) => {
    const ballot = article.querySelector("form")!.getBoundingClientRect();
    const details = article.querySelector("dl")!.getBoundingClientRect();
    return { sideBySide: details.left >= ballot.right, stacked: details.top >= ballot.bottom,
      pageWidth: document.documentElement.scrollWidth };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(layout).toMatchObject({ sideBySide: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(layout).toMatchObject({ stacked: true, pageWidth: 390 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("main").locator("summary").filter({ hasText: t.cancel }).click();
  const reason = page.getByLabel(t.reason);
  await reason.fill("Keep this unsent cancellation reason.");
  sql(`update private.polls set opens_at=now()-interval '5 seconds' where id='${poll.id}';`);
  await page.clock.fastForward(185_000);
  await expect(radios.getByRole("radio", { name: "One" })).toBeEnabled();
  await expect(timer).toContainText(t.closesIn);
  await radios.getByRole("radio", { name: "Two" }).check();
  await expect(page.getByRole("button", { name: t.vote })).toBeEnabled();
  sql(`update private.polls set closes_at=now()-interval '1 second' where id='${poll.id}';`);
  await page.clock.fastForward(365_000);
  await expect(page.getByRole("button", { name: t.finalize })).toBeVisible();
  await expect(timer).toHaveCount(0);
  await expect(radios.getByRole("radio", { name: "Two" })).toBeChecked();
  await expect(radios.getByRole("radio", { name: "Two" })).toBeDisabled();
  await expect(page.getByRole("button", { name: t.vote })).toHaveCount(0);
  await expect(reason).toHaveValue("Keep this unsent cancellation reason.");
});

test("ballot receipt is bound to the voter and a stale write stays visible", async ({ page, signedIn, makeMember }) => {
  const [voter, observer] = await Promise.all([makeMember(), makeMember()]);
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
  await page.clock.install();
  await page.goto("/polls/" + draft.id);
  const ballot = page.getByRole("group", { name: t.optionsTitle });
  await expect(ballot.getByRole("meter", { name: "One" })).toHaveAttribute("value", "0");
  await expect(ballot.getByText(t.outcomes.winner, { exact: true })).toHaveCount(0);
  const before = await apiCall(voter, path, 200);
  await apiCall(voter, path + "/ballot", 200, "POST", { optionId: before.options[0].id });
  await page.clock.fastForward(16_000);
  await expect(ballot.getByRole("meter", { name: "One" })).toHaveAttribute("value", "100");
  await expect(ballot.getByText(t.outcomes.winner, { exact: true })).toHaveCount(1);
  await ballot.getByRole("radio", { name: "One" }).check();
  const saved = apiResponse(page, path + "/ballot", "POST");
  await page.getByRole("button", { name: t.vote }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText(new RegExp(t.receipt))).toBeVisible();
  await expect(ballot.getByRole("meter", { name: "One" })).toHaveAttribute("value", "100");
  await expect(ballot.getByRole("meter", { name: "Two" })).toHaveAttribute("value", "0");
  await expect(ballot.getByText(t.outcomes.winner, { exact: true })).toHaveCount(1);
  const readings = await Promise.all(Array.from({ length: 3 }, () => apiCall(observer, path, 200)));
  for (const reading of readings) {
    expect(reading).toMatchObject({ ownBallot: null, results: { total: 2 } });
    expect(JSON.stringify(reading)).not.toContain('"ballot_cast"');
  }
  const receipt = await apiCall(signedIn, path + "/ballot", 200);
  expect(receipt.optionId).toBeTruthy();
  expect(await apiCall(observer, path + "/ballot", 200)).toEqual({ optionId: null });
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

test("finalization-only polls keep totals sealed after a vote", async ({ signedIn }) => {
  const draft = await apiCall(signedIn, "/api/v1/polls", 201, "POST", {
    title: "Disposable sealed poll", description: "This fixture only reveals results after finalization.",
    scope: "individual", scopeId: null, taskId: null, policy: "advisory", kind: "community",
    language: "en", audience: "members", eligibility: "active", resultPolicy: "after_close",
    opensAt: new Date(Date.now() + 180_000).toISOString(), closesAt: new Date(Date.now() + 360_000).toISOString(),
    quorum: null, threshold: null, options: ["One", "Two"], key: randomUUID(),
  });
  const path = "/api/v1/polls/" + draft.id;
  const published = await apiCall(signedIn, path + "/transition", 200, "POST", { action: "publish", version: draft.version });
  sql(`update private.polls set opens_at=now()-interval '2 minutes' where id='${draft.id}';`);
  const detail = await apiCall(signedIn, path, 200);
  expect(detail.results).toBeNull();
  await apiCall(signedIn, path + "/ballot", 200, "POST", { optionId: detail.options[0].id });
  expect((await apiCall(signedIn, path, 200)).results).toBeNull();
  sql(`update private.polls set closes_at=now()-interval '1 minute' where id='${draft.id}';`);
  await apiCall(signedIn, path + "/transition", 200, "POST", { action: "close", version: published.version });
  expect((await apiCall(signedIn, path, 200)).results).toMatchObject({ total: 1, outcome: "winner" });
});
