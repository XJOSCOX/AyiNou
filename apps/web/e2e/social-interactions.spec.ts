import { randomUUID } from "node:crypto";
import type { FeedPage } from "@ayinou/shared";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test, type Member } from "./fixtures";
import { socialMessages } from "../src/lib/social-i18n";

const endpoint = "/api/v1/posts";
const posts = (member: Member, body: string, visibility = "public") =>
  apiCall(member, endpoint, 201, "POST", { body, language: "ht", visibility });
const change = (member: Member, id: string, kind: "repost" | "bookmark", enabled: boolean, status = 200) =>
  apiCall(member, `${endpoint}/${id}/social`, status, "PUT", { kind, enabled });
const get = async (member: Member, id: string) => (await apiCall(member, `${endpoint}/${id}`, 200)).post;
const following = (member: Member, query = ""): Promise<FeedPage> => apiCall(member, "/api/v1/feed?scope=following" + query, 200);
const follow = (member: Member, target: Member) => apiCall(member, "/api/v1/members/" + target.handle + "/follow", 200, "PUT");
const preferences = (member: Member) => "/api/v1/me/follow-reposts/member/" + member.handle;

test("F2.1 keeps original access, private saves, author attribution and notifications scoped @smoke",
  async ({ makeMember, page }) => {
    test.setTimeout(90_000);
    const [author, resharing, viewer] = await Promise.all(
      Array.from({ length: 3 }, () => makeMember({ visible: true })));
    for (const member of [author, resharing, viewer]) finishPersonalOnboarding(member);

    await follow(viewer, resharing);
    await follow(resharing, viewer);
    expect(await apiCall(viewer, preferences(resharing), 200)).toEqual({ mutual: true, showReposts: true });
    const publicPost = await posts(author, `Rasanbleman @${viewer.handle} @${viewer.handle} #Kreyòl #KREYÒL #République`);
    const draft = await posts(author, "PRIVATE-DRAFT-CONTENT", "private");
    const members = await posts(author, "MEMBER-ONLY-CONTENT", "members_only");
    await change(resharing, draft.id, "repost", true, 404);
    await change(resharing, members.id, "repost", true, 404);
    await change(resharing, draft.id, "bookmark", true, 404);

    const action = (actor: Member, name: string, idempotency: string, input: object) => fetch(api + name, {
      method: "POST", headers: { Authorization: "Bearer " + actor.token, "Content-Type": "application/json",
        "Idempotency-Key": idempotency }, body: JSON.stringify(input),
    });
    const commentary = { sourceId: publicPost.id, body: "Pawòl pa mwen", language: "ht" };
    const key = randomUUID();
    const [first, repeat] = await Promise.all([action(resharing, endpoint + "/social", key, commentary),
      action(resharing, endpoint + "/social", key, commentary)]);
    expect([first.status, repeat.status]).toEqual([201, 201]);
    const quote = (await first.json()).id;
    expect((await repeat.json()).id).toBe(quote);
    expect((await action(resharing, endpoint + "/social", randomUUID(), { ...commentary, sourceId: quote })).status).toBe(404);
    expect((await action(resharing, endpoint + "/social", randomUUID(), { ...commentary, sourceId: draft.id })).status).toBe(404);
    expect((await get(viewer, quote)).social.quote).toMatchObject({ id: publicPost.id, author: { username: author.handle } });

    await Promise.all([change(resharing, publicPost.id, "repost", true), change(resharing, publicPost.id, "repost", true)]);
    expect((await get(viewer, publicPost.id)).social).toMatchObject({
      repostCount: 1, mentions: { [viewer.handle]: "/members/" + viewer.handle }, hashtags: ["kreyòl", "république"],
    });
    expect((await following(viewer)).posts).toContainEqual(expect.objectContaining({ id: publicPost.id,
      repostBy: expect.objectContaining({ username: resharing.handle }) }));
    const firstPage = await following(viewer, "&limit=1");
    expect(firstPage.nextCursor).toBeTruthy();
    const nextPage = await following(viewer, "&limit=1&cursor=" + firstPage.nextCursor);
    expect(nextPage.posts[0]?.timelineId).not.toBe(firstPage.posts[0]?.timelineId);
    await apiCall(viewer, preferences(resharing), 200, "PUT", { enabled: false });
    expect((await following(viewer)).posts.some(({ id }) => id === publicPost.id)).toBe(false);
    expect((await following(viewer)).posts.some(({ id }) => id === quote)).toBe(true);

    await change(viewer, publicPost.id, "bookmark", true);
    const saved = "/api/v1/feed/social?scope=saved";
    expect((await fetch(api + saved)).status).toBe(401);
    expect((await apiCall(author, saved, 200)).posts).toEqual([]);
    expect((await apiCall(viewer, saved, 200)).posts[0].id).toBe(publicPost.id);
    expect((await apiCall(viewer, "/api/v1/discover/hashtags?q=" + encodeURIComponent("Kre"), 200)).tags)
      .toContain("kreyòl");
    expect((await apiCall(viewer, "/api/v1/feed/social?scope=hashtag&tag=" + encodeURIComponent("République"), 200)).posts[0].id).toBe(publicPost.id);

    const comment = await apiCall(resharing, `${endpoint}/${publicPost.id}/comments`, 201, "POST",
      { body: `Bonjou @${viewer.handle}`, language: "ht" });
    const comments = await apiCall(viewer, `${endpoint}/${publicPost.id}/comments`, 200);
    expect(comments.comments[0]).toMatchObject({ id: comment.id, mentions: { [viewer.handle]: "/members/" + viewer.handle } });
    const notices = await apiCall(viewer, "/api/v1/me/notifications", 200);
    expect(notices.notifications.filter(({ kind }: { kind: string }) => kind === "post_mention")).toHaveLength(2);
    const authorNotices = await apiCall(author, "/api/v1/me/notifications", 200);
    expect(authorNotices.notifications.map(({ kind }: { kind: string }) => kind)).toEqual(expect.arrayContaining(["post_quote", "post_repost"]));
    await apiCall(author, "/api/v1/me/social-notification-preferences", 200, "PUT", { mentions: false, reposts: false, quotes: false });
    await change(resharing, publicPost.id, "repost", false);
    expect((await get(viewer, publicPost.id)).social.repostCount).toBe(0);
    const quiet = await posts(resharing, `Quiet mention @${author.handle}`);
    const mutedNotices = await apiCall(author, "/api/v1/me/notifications", 200);
    expect(mutedNotices.notifications.some(({ postId }: { postId?: string }) => postId === quiet.id)).toBe(false);

    await inEnglish(page.context());
    await login(page, viewer);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/feed/saved");
    await expect(page.getByRole("heading", { name: socialMessages.en.saved })).toBeVisible();
    await expect(page.getByRole("link", { name: "#Kreyòl", exact: true })).toBeVisible();

    await apiCall(author, `${endpoint}/${publicPost.id}?version=1`, 204, "DELETE");
    expect((await get(viewer, quote)).social.quote).toEqual({ unavailable: true });
    const unavailable = (await apiCall(viewer, saved, 200)).posts[0];
    expect(unavailable).toMatchObject({ unavailable: true, body: "", author: null });
    expect(JSON.stringify(unavailable)).not.toContain("Rasanbleman");
    await change(viewer, publicPost.id, "bookmark", false);
    expect((await apiCall(viewer, saved, 200)).posts).toEqual([]);
    expect(sql("select has_table_privilege('authenticated','feed_data.bookmarks','select');")).toBe("f");
  });

test("F2.1 organization publication and reposts observe live organization, block and account restrictions",
  async ({ makeMember }) => {
    const [manager, follower, blocked] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
    for (const member of [manager, follower, blocked]) finishPersonalOnboarding(member);
    const handle = "social-" + randomUUID().slice(0, 8);
    const org = sql(`with inserted as (insert into private.organizations(handle,name,kind,country_code,created_by)
      values('${handle}','Public Social Organization','nonprofit','HT','${manager.id}') returning id) select id from inserted;`);
    sql(`insert into private.organization_memberships(organization_id,user_id,role)
      values('${org}','${manager.id}','owner');`);
    const body = { organization: handle, body: "Organization announcement", language: "en" };
    await apiCall(follower, endpoint + "/social", 404, "POST", body);
    const created = await apiCall(manager, endpoint + "/social", 201, "POST", body);
    await apiCall(follower, "/api/v1/institutions/" + org + "/follow", 200, "PUT");
    expect((await following(follower)).posts[0]).toMatchObject({ id: created.id,
      social: { organization: { handle } } });
    await follow(follower, blocked);
    await change(blocked, created.id, "repost", true);
    expect((await following(follower)).posts.some((post) => post.repostBy?.username === blocked.handle)).toBe(true);
    await apiCall(follower, "/api/v1/me/follow-reposts/institution/" + org, 200, "PUT", { enabled: false });
    expect((await following(follower)).posts.some((post) => post.repostBy?.username === blocked.handle)).toBe(false);
    await apiCall(follower, "/api/v1/members/" + blocked.handle + "/block", 204, "PUT");
    expect((await following(follower)).posts.some((post) => post.repostBy?.username === blocked.handle)).toBe(false);
    sql(`update private.organizations set status='archived' where id='${org}';`);
    expect((await following(follower)).posts.some(({ id }) => id === created.id)).toBe(false);
    await apiCall(follower, endpoint + "/" + created.id, 404);
    await apiCall(follower, "/api/v1/members/" + blocked.handle + "/block", 204, "DELETE");
    const mention = await posts(follower, `Hello @${blocked.handle}`);
    expect((await get(follower, mention.id)).social.mentions).toHaveProperty(blocked.handle);
    sql(`delete from auth.users where id='${blocked.id}';`);
    expect((await get(follower, mention.id)).social.mentions).toEqual({});
  });
