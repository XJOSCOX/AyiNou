import { randomUUID } from "node:crypto";
import type { SocialPrivacy } from "@ayinou/shared";
import { f24Messages } from "../src/lib/f24-i18n";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test, type Member } from "./fixtures";

const preferences = "/api/v1/me/social-privacy";
const requests = "/api/v1/me/follow-requests";
const posts = "/api/v1/posts";
const member = (account: Member) => "/api/v1/members/" + account.handle;
const profile = (account: Member) => "/api/v1/profiles/" + account.handle;
const save = (actor: Member, values: SocialPrivacy) => apiCall(actor, preferences, 200, "PUT", values);
const makePost = (actor: Member, body: string, visibility = "public") =>
  apiCall(actor, posts, 201, "POST", { body, visibility, language: "en" });

test("F2.4 protects private profiles, requests and follower-only posts across surfaces", async ({ makeMember, page }) => {
  test.setTimeout(120_000);
  const [author, historical, outsider] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
  for (const account of [author, historical, outsider]) finishPersonalOnboarding(account);
  sql(`update public.profiles set display_name='Celestine Lantern',biography='Members can read this biography.' where user_id='${author.id}';`);
  const defaults: SocialPrivacy = await apiCall(author, preferences, 200);
  expect(defaults).toMatchObject({ mode: "public", followPolicy: "everyone", showActivity: false, shareLanguage: false, followNotices: false });
  expect((await apiCall(historical, "/api/v1/discover/people?q=celestin", 200)).accounts)
    .toContainEqual(expect.objectContaining({ handle: author.handle }));
  await apiCall(historical, member(author) + "/follow", 200, "PUT");
  await save(author, { ...defaults, mode: "limited", showActivity: true, followNotices: true });
  expect((await fetch(api + profile(author))).status).toBe(404);
  expect((await apiCall(outsider, profile(author), 200)).profile.biography).toContain("biography");
  await save(author, { ...defaults, mode: "private", showActivity: true, showFollowing: false, followNotices: true });

  expect((await apiCall(historical, profile(author), 200)).profile).toMatchObject({
    detailsVisible: false, biography: null, avatarUrl: null, activityVisible: false,
  });
  expect((await apiCall(outsider, "/api/v1/discover/people?q=celestin", 200)).accounts).toEqual([]);
  expect((await apiCall(historical, member(author) + "/follow", 200)).following).toBe(false);
  const tag = "lantern" + randomUUID().slice(0, 8);
  const restricted = await makePost(author, `Lantern collective #${tag}`, "followers");
  await makePost(author, "This private draft should not be returned", "private");
  const direct = posts + "/" + restricted.id;
  await apiCall(outsider, direct, 404);
  await apiCall(historical, direct, 404);
  expect((await fetch(api + direct)).status).toBe(404);
  expect((await apiCall(outsider, "/api/v1/discover/posts?tag=" + tag, 200)).posts).toEqual([]);
  expect((await apiCall(outsider, "/api/v1/discover/trending", 200)).tags).not.toContain(tag);

  const requested = member(author) + "/follow";
  for (const state of await Promise.all([
    apiCall(historical, requested, 200, "PUT"), apiCall(historical, requested, 200, "PUT"),
  ])) expect(state).toMatchObject({ following: false, requestPending: true, requiresApproval: true });
  const queue = (await apiCall(author, requests + "?view=incoming", 200)).requests;
  expect(queue).toHaveLength(1);
  expect(queue[0].username).toBe(historical.handle);
  await apiCall(outsider, requests + "/" + queue[0].id, 404, "PATCH", { action: "approve" });
  await apiCall(author, requests + "/" + queue[0].id, 204, "PATCH", { action: "approve" });

  expect((await apiCall(historical, profile(author), 200)).profile).toMatchObject({ detailsVisible: true, activityVisible: true });
  expect((await apiCall(historical, "/api/v1/me/following", 200)).accounts)
    .toContainEqual(expect.objectContaining({ handle: author.handle, following: true }));
  expect((await apiCall(historical, member(author) + "/timeline", 200)).posts.map(({ id }: { id: string }) => id)).toEqual([restricted.id]);
  expect((await apiCall(historical, "/api/v1/feed?scope=following", 200)).posts.map(({ id }: { id: string }) => id)).toContain(restricted.id);
  await apiCall(historical, direct + "/social", 404, "PUT", { kind: "repost", enabled: true });
  await apiCall(historical, direct + "/social", 200, "PUT", { kind: "bookmark", enabled: true });

  await inEnglish(page.context());
  await login(page, historical);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/members/" + author.handle);
  await expect(page.getByRole("heading", { name: "Celestine Lantern" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replies", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Media", exact: true })).toBeVisible();

  await apiCall(author, "/api/v1/me/followers/" + historical.handle, 204, "DELETE");
  await apiCall(historical, direct, 404);
  expect((await apiCall(historical, "/api/v1/feed/social?scope=saved", 200)).posts[0]).toMatchObject({ unavailable: true, body: "" });
  await save(author, { ...defaults, mode: "public" });
  await apiCall(historical, requested, 200, "PUT");
  await apiCall(historical, direct, 404);
  await save(author, { ...defaults, mode: "private", showActivity: true });
  await page.reload();
  await expect(page.getByText("This profile is private.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request to follow" })).toBeVisible();
  await expect(page.getByText("Members can read this biography.")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings#social-privacy");
  const language = page.getByRole("banner").getByRole("combobox");
  for (const locale of ["en", "fr", "ht", "es"] as const) {
    await language.selectOption(locale);
    await expect(page.getByRole("heading", { name: f24Messages[locale].privacy, exact: true })).toBeVisible();
  }
});

test("F2.4 supports rejection, cancellation, blocking and current mention preferences", async ({ makeMember }) => {
  const [target, actor] = await Promise.all([makeMember({ visible: true }), makeMember({ visible: true })]);
  finishPersonalOnboarding(target);
  finishPersonalOnboarding(actor);
  const defaults: SocialPrivacy = await apiCall(target, preferences, 200);
  await save(target, { ...defaults, followPolicy: "approval", mentions: "no_one", followNotices: true });
  const nextRequest = async () => {
    await apiCall(actor, member(target) + "/follow", 200, "PUT");
    return (await apiCall(actor, requests + "?view=outgoing", 200)).requests[0].id;
  };
  const first = await nextRequest();
  expect((await apiCall(target, "/api/v1/me/notifications", 200)).notifications).toContainEqual(expect.objectContaining({ kind: "follow_requested" }));
  await apiCall(target, requests + "/" + first, 204, "PATCH", { action: "reject" });
  expect((await apiCall(actor, requests + "?view=outgoing", 200)).requests).toEqual([]);
  await apiCall(actor, requests + "/" + await nextRequest(), 204, "PATCH", { action: "cancel" });
  await nextRequest();
  await apiCall(target, member(actor) + "/block", 204, "PUT");
  expect((await apiCall(target, requests + "?view=incoming", 200)).requests).toEqual([]);
  await apiCall(target, member(actor) + "/block", 204, "DELETE");
  const post = await makePost(actor, `Hello @${target.handle}`);
  const { post: visible } = await apiCall(actor, posts + "/" + post.id, 200);
  expect(visible.social.mentions).not.toHaveProperty(target.handle);
  expect((await apiCall(target, "/api/v1/me/notifications", 200)).notifications).not.toContainEqual(expect.objectContaining({ kind: "post_mention" }));
});

test("F2.4 checks the original audience for quotes, search and recommendation snapshots", async ({ makeMember }) => {
  const [author, follower, peer] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
  for (const account of [author, follower, peer]) finishPersonalOnboarding(account);
  const audience = await makePost(author, "Collective workshop recommendations", "followers");
  const original = await makePost(author, "Workshop open to the public");
  const quote = await apiCall(peer, posts + "/social", 201, "POST", { sourceId: original.id, body: "Read the announcement", language: "en" });
  const recommendations = "/api/v1/feed?scope=for_you";
  await apiCall(follower, member(author) + "/follow", 200, "PUT");
  expect((await apiCall(follower, recommendations, 200)).posts).toContainEqual(expect.objectContaining({ id: audience.id }));
  expect((await apiCall(peer, recommendations, 200)).posts).not.toContainEqual(expect.objectContaining({ id: audience.id }));
  const search = "/api/v1/discover/posts?q=workshop&language=en";
  expect((await apiCall(follower, search, 200)).posts).toContainEqual(expect.objectContaining({ id: audience.id }));
  expect((await apiCall(peer, search, 200)).posts).not.toContainEqual(expect.objectContaining({ id: audience.id }));
  await apiCall(author, posts + "/" + original.id, 204, "PATCH", {
    body: "Workshop details for followers", language: "en", visibility: "followers", version: 1,
  });
  const updatedQuote = await apiCall(peer, posts + "/" + quote.id, 200);
  expect(updatedQuote.post.social.quote).toEqual({ unavailable: true });
  await apiCall(peer, posts + "/" + original.id, 404);
});

test("a saved hidden profile publishes once and appears in People search", async ({ makeMember, page }) => {
  test.setTimeout(90_000);
  const [owner, viewer] = await Promise.all([makeMember({ visible: true }), makeMember({ visible: true })]);
  finishPersonalOnboarding(owner);
  finishPersonalOnboarding(viewer);
  const profilePath = "/api/v1/me/profile/details";
  sql(`update public.profiles set is_visible=false where user_id='${owner.id}';
    update public.user_settings set discoverable=true where user_id='${owner.id}';`);
  const search = "/api/v1/discover/people?q=" + owner.handle;
  expect((await apiCall(viewer, search, 200)).accounts).toEqual([]);
  expect((await fetch(api + profile(owner))).status).toBe(404);
  expect((await fetch(api + profilePath, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishProfile: true }),
  })).status).toBe(401);
  await apiCall(owner, profilePath, 400, "PATCH", { publishProfile: true, userId: viewer.id });

  await inEnglish(page.context());
  await login(page, owner);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/profile");
  const publish = page.getByRole("button", { name: "Publish profile", exact: true });
  await expect(publish).toBeVisible();
  await publish.click();
  await expect(page.getByText("Your saved profile is published.", { exact: true })).toBeVisible();
  expect((await apiCall(viewer, search, 200)).accounts).toContainEqual(expect.objectContaining({
    handle: owner.handle, following: false, canFollow: true,
  }));
  expect((await apiCall(viewer, member(owner) + "/follow", 200, "PUT")).following).toBe(true);
  expect((await fetch(api + profile(owner))).status).toBe(200);

  await apiCall(owner, profilePath, 200, "PATCH", { discoverable: false });
  expect((await apiCall(viewer, search, 200)).accounts).toEqual([]);
  await apiCall(owner, profilePath, 200, "PATCH", { publishProfile: true });
  expect((await apiCall(owner, profilePath, 200, "PATCH", { publishProfile: true })).profile.isVisible).toBe(true);
});
