import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  commentBodyLimit, communityStaffRoles, departmentCommunityContent, interestCodes, locales, moderationActions, postBodyLimit, postVisibilities, reactionKinds,
  recommendationActions, reportCategories, type FeedComment, type FeedReport, type ReactionSummary, type RecommendationSettings,
  type PostAttachment, type MemberNotification, type NotificationPreferences, type CommentTarget, type Community, type DepartmentCommunity, type DiscoveryCard,
} from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { feedDatabaseError, type FeedRepository } from "../services/feed.js";
import { registerDiscoveryRoutes } from "./discovery.js";
import type { PostMediaService } from "../services/post-media.js";
import type { ReadBudget } from "../services/read-budget.js";
import { registerSafetyRoutes } from "./safety.js";
import { registerGroupRoutes } from "./groups.js";
import { registerTrustRoutes } from "./trust.js";
import { registerAmbassadorRoutes } from "./ambassadors.js";

const cursorShape = z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
const pageCursor = z.string().max(250).regex(/^[A-Za-z0-9_-]+$/).optional();
const feedQuery = z.strictObject({
  scope: z.enum(["feed", "mine", "following", "for_you"]).default("feed"), cursor: pageCursor,
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(40)).optional(),
});
const identifiers = z.object({ id: z.uuid() });
const version = z.number().int().min(1).max(2_147_483_647);
const postFields = z.strictObject({ body: z.string(), language: z.enum(locales), visibility: z.enum(postVisibilities) });
const topics = z.array(z.enum(interestCodes)).refine((codes) => new Set(codes).size === codes.length);
const attachments = z.array(z.strictObject({
  id: z.uuid(),
  alt: z.string().trim().max(240).refine((value) => !/\p{Cc}/u.test(value)).nullish(),
})).max(4).refine((items) => new Set(items.map(({ id }) => id.toLowerCase())).size === items.length);
const postInput = postFields.extend({ topics: z.array(z.enum(interestCodes)).max(3).pipe(topics).optional(), attachments: attachments.optional() });
const preferenceInput = z.strictObject({ reactions: z.boolean(), comments: z.boolean(), replies: z.boolean(), followers: z.boolean() });
const postEdit = postInput.extend({ version });
const commentFields = postFields.omit({ visibility: true });
const commentEdit = commentFields.extend({ version });
const versionQuery = z.strictObject({ version: z.string().regex(/^\d{1,10}$/).transform(Number).pipe(version) });
const reportInput = z.strictObject({ category: z.enum(reportCategories), note: z.string().trim().optional() });
const decisionInput = z.strictObject({ version, action: z.enum(moderationActions), reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)) });
const communityKey = z.string().max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const communityParams = z.object({ key: communityKey });
const reportQuery = z.strictObject({
  scope: z.enum(["reports", "hidden"]).default("reports"), target: z.enum(["posts", "comments"]).default("posts"), cursor: pageCursor,
});

function before(value?: string) {
  if (!value) return { p_before_at: null, p_before_id: null };
  try {
    const cursor = cursorShape.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { p_before_at: cursor.createdAt, p_before_id: cursor.id };
  } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid page cursor"); }
}

function paginate<T extends { createdAt: string; id: string }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = rows.length > limit && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null;
  return { page, nextCursor };
}

function content(body: string, limit: number) {
  if (!body.trim() || Array.from(body).length > limit || /\p{Cc}/u.test(body.replace(/[\t\r\n]/g, ""))) {
    throw new ApiError(422, "INVALID_CONTENT", "Content does not meet posting requirements");
  }
}

export async function registerFeedRoutes(app: FastifyInstance, auth: AuthVerifier | null, repository: FeedRepository | null, media: PostMediaService | null, read: ReadBudget) {
  const uploadIdentity = new WeakMap<FastifyRequest, { actor: string; id: string }>();

  function repo() {
    if (!repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Feed service unavailable");
    return repository;
  }

  async function viewer(request: FastifyRequest, required = false) {
    const header = request.headers.authorization;
    const token = /^Bearer ([^\s]+)$/.exec(header ?? "")?.[1];
    if (!header && !required) return { actor: null, token: null };
    if (!auth) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Authentication service unavailable");
    const actor = token ? await auth.verify(token) : null;
    if (!actor || !token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    return { actor, token };
  }

  function storage() {
    if (!media) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");
    return media;
  }

  function cleanMedia(request: FastifyRequest) {
    void media?.cleanup().catch(() => request.log.warn("Post media cleanup deferred"));
  }

  async function moderator(request: FastifyRequest, scope?: { community: string } | { post: string }) {
    const { token, actor } = await viewer(request, true);
    const allowed = !scope ? await repo().rpc<boolean>(token, "feed_moderation_access")
      : "community" in scope ? await repo().rpc<boolean>(token, "can_review_department_for_client", { p_key: scope.community })
      : await repo().rpc<boolean>(token, "can_review_post_for_client", { p_id: scope.post });
    if (!allowed) {
      throw new ApiError(403, "FORBIDDEN", "A moderation role is required");
    }
    if (!await auth!.verify(token!, true)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    return { token, actor };
  }

  async function reportPage(token: string | null, input: z.output<typeof reportQuery>, community?: string) {
    const params = { p_scope: input.scope, ...before(input.cursor) };
    const rows = community
      ? await repo().rpc<FeedReport[]>(token, "department_reports_for_client", { ...params, p_key: community, p_target: input.target })
      : await repo().rpc<FeedReport[]>(token, input.target === "comments" ? "list_comment_reports_for_client" : "list_feed_reports_for_client", params);
    const { page, nextCursor } = paginate(rows, 25);
    const mediaIds = [...new Set(page.filter((report) => !report.deleted).map((report) => report.postId))];
    const attachments = input.target === "posts" && mediaIds.length
      ? await repo().rpc<Record<string, PostAttachment[]>>(token, "post_attachments_for_client", { p_ids: mediaIds, p_review: true }) : {};
    return { reports: page.map((report) => ({ ...report, attachments: attachments[report.postId] ?? [] })), nextCursor };
  }

  async function engagement<T extends object>(token: string | null, operation: string, id: string, fields: Record<string, unknown> = {}) {
    const result = await repo().rpc<T & { error?: string }>(token, "write_engagement_for_client", {
      p_operation: operation, p_id: id, ...fields,
    });
    if (result.error) throw feedDatabaseError(result.error);
    return result as T;
  }

  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  registerDiscoveryRoutes(app, viewer, repo, read);
  registerSafetyRoutes(app, { viewer, moderator, repo, read });
  registerGroupRoutes(app, { viewer, repo, read });
  registerTrustRoutes(app, { viewer, repo, read });
  registerAmbassadorRoutes(app, { viewer, repo, read });
  app.get("/api/v1/communities", async (request) => {
    const { actor, token } = await viewer(request);
    await read("discovery", actor, request.ip);
    return { communities: await repo().rpc<DepartmentCommunity[]>(token, "department_communities_for_client", { p_mine: false }) };
  });
  app.get("/api/v1/me/communities", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    return { communities: await repo().rpc<DepartmentCommunity[]>(token, "department_communities_for_client", { p_mine: true }) };
  });
  const department = "/api/v1/communities/:key";
  app.get(department, async (request) => {
    const { key } = communityParams.parse(request.params);
    const { actor, token } = await viewer(request);
    await read("discovery", actor, request.ip);
    const community = await repo().rpc<Community | null>(token, "department_community_for_client", { p_key: key });
    if (!community) throw feedDatabaseError("PCM04");
    return community.kind === "department"
      ? { community, content: Object.fromEntries(locales.map((locale) => [locale, departmentCommunityContent(locale, community.name)])) }
      : { community };
  });
  for (const [method, route, action] of [["POST", "/join", "join"], ["DELETE", "/membership", "leave"], ["PATCH", "/membership", "privacy"]] as const) {
    app.route({ method, url: department + route, bodyLimit: 1024, handler: async (request) => {
      const { key } = communityParams.parse(request.params);
      const { token } = await viewer(request, true);
      const visible = action === "privacy" ? z.strictObject({ directoryVisible: z.boolean() }).parse(request.body).directoryVisible : null;
      if (action !== "privacy" && request.body !== undefined) z.strictObject({}).parse(request.body);
      const community = await repo().rpc<Community | null>(token, "change_department_membership_for_client", {
        p_key: key, p_action: action, p_visible: visible,
      });
      return { community };
    } });
  }
  app.get(department + "/members", async (request) => {
    const { key } = communityParams.parse(request.params);
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const query = z.strictObject({
      cursor: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/).optional(),
      limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional(),
    }).parse(request.query);
    const size = query.limit ?? 15;
    const rows = await repo().rpc<DiscoveryCard[]>(token, "department_members_for_client", { p_key: key, p_after: query.cursor ?? null, p_limit: size });
    const accounts = rows.slice(0, size);
    return { accounts, nextCursor: rows.length > size ? accounts.at(-1)?.handle ?? null : null };
  });
  const roomPosts = (requiresMember: boolean) => async (request: FastifyRequest) => {
    const { key } = communityParams.parse(request.params);
    const { actor, token } = requiresMember ? await viewer(request, true) : { actor: null, token: null };
    await read("feed", actor, request.ip);
    const query = feedQuery.omit({ scope: true }).parse(request.query);
    const size = query.limit ?? 20;
    const rows = await repo().read(token, { p_scope: "community", p_community: key, p_limit: size, ...before(query.cursor) });
    const { page, nextCursor } = paginate(rows, size);
    return { posts: page, nextCursor };
  };
  app.get(department + "/posts", roomPosts(true));
  app.get(department + "/public-posts", roomPosts(false));
  app.post(department + "/posts", { bodyLimit: 16_384 }, async (request, reply) => {
    const { key } = communityParams.parse(request.params);
    const { token } = await viewer(request, true);
    const submission = z.uuid().parse(request.headers["idempotency-key"]);
    const input = postInput.omit({ visibility: true }).extend({ groupVersion: version.optional() }).parse(request.body);
    content(input.body, postBodyLimit);
    const id = await repo().rpc<string>(token, input.groupVersion ? "create_group_post_for_client" : "create_department_post_for_client", {
      p_key: key, p_body: input.body, p_language: input.language, p_submission: submission, p_topics: input.topics ?? [], p_items: input.attachments ?? [],
      ...(input.groupVersion ? { p_version: input.groupVersion } : {}),
    });
    return reply.code(201).send({ id });
  });
  app.get(department + "/moderation", async (request) => {
    const { key } = communityParams.parse(request.params);
    const { actor, token } = await moderator(request, { community: key });
    await read("feed", actor, request.ip);
    return reportPage(token, reportQuery.parse(request.query), key);
  });
  app.patch(department + "/moderation/:target/:id", { bodyLimit: 4096 }, async (request, reply) => {
    const { key, target, id } = communityParams.extend({ target: z.enum(["posts", "comments"]), id: z.uuid() }).parse(request.params);
    const { token } = await moderator(request, { community: key });
    const input = decisionInput.parse(request.body);
    await repo().rpc(token, "moderate_department_content_for_client", {
      p_key: key, p_target: target, p_id: id, p_version: input.version, p_action: input.action, p_reason: input.reason,
    });
    if (target === "posts" && input.action === "remove") cleanMedia(request);
    return reply.code(204).send();
  });
  app.patch(department + "/staff", { bodyLimit: 4096 }, async (request, reply) => {
    const { key } = communityParams.parse(request.params);
    const { token } = await viewer(request, true);
    if (!await auth!.verify(token!, true)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    const input = z.strictObject({
      username: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/), role: z.enum(communityStaffRoles).nullable(),
      reason: decisionInput.shape.reason,
    }).parse(request.body);
    await repo().rpc(token, "change_department_staff_for_client", { p_key: key, p_username: input.username, p_role: input.role, p_reason: input.reason });
    return reply.code(204).send();
  });
  app.post("/api/v1/me/post-media", {
    bodyLimit: 4_200_000,
    onRequest: async (request) => {
      const { actor, token } = await viewer(request, true);
      storage();
      const id = z.uuid().parse(request.headers["idempotency-key"]).toLowerCase();
      await repo().rpc(token, "post_upload_budget_for_client");
      uploadIdentity.set(request, { actor: actor!, id });
    },
  }, async (request, reply) => {
    const { actor, id } = uploadIdentity.get(request)!;
    const service = storage();
    const { image } = z.strictObject({ image: z.base64().min(4).max(4_194_304) }).parse(request.body);
    await service.cleanup().catch(() => request.log.warn("Post media cleanup deferred"));
    await service.upload(actor, id, Buffer.from(image, "base64"));
    return reply.code(201).send({ id });
  });
  app.get("/api/v1/posts/:id/attachments/:attachmentId/image", async (request, reply) => {
    const { id, attachmentId } = identifiers.extend({ attachmentId: z.uuid() }).parse(request.params);
    const query = z.strictObject({ variant: z.enum(["thumbnail", "display"]).default("thumbnail"), review: z.literal("true").optional() }).parse(request.query);
    const { actor, token } = query.review ? await moderator(request, { post: id }) : await viewer(request);
    await read("media", actor, request.ip);
    if (!await repo().rpc<boolean>(token, "can_download_post_media_for_client", {
      p_post: id, p_id: attachmentId, p_review: Boolean(query.review),
    })) throw new ApiError(404, "ATTACHMENT_UNAVAILABLE", "Image unavailable");
    const bytes = await storage().download(attachmentId.toLowerCase(), query.variant);
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(bytes);
  });
  app.get("/api/v1/me/notifications", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    const { cursor, limit } = z.strictObject({
      cursor: pageCursor,
      limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(30)).optional(),
    }).parse(request.query);
    const rows = await repo().rpc<MemberNotification[]>(token, "notifications_for_client", { p_limit: limit ?? 20, ...before(cursor) });
    const { page, nextCursor } = paginate(rows, limit ?? 20);
    return { notifications: page, nextCursor };
  });
  app.get("/api/v1/me/notifications/unread-count", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    return { count: await repo().rpc<number>(token, "notification_count_for_client") };
  });
  app.patch("/api/v1/me/notifications/:id", { bodyLimit: 1024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    z.strictObject({ read: z.literal(true) }).parse(request.body);
    await repo().rpc(token, "mark_notifications_for_client", { p_id: id });
    return reply.code(204).send();
  });
  app.post("/api/v1/me/notifications/read-all", { bodyLimit: 1024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    await repo().rpc(token, "mark_notifications_for_client", { p_id: null });
    return reply.code(204).send();
  });
  app.get("/api/v1/me/notification-preferences", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    return repo().rpc<NotificationPreferences>(token, "notification_preferences_for_client");
  });
  app.put("/api/v1/me/notification-preferences", { bodyLimit: 1024 }, async (request) => {
    const { token } = await viewer(request, true);
    const { reactions, comments, replies, followers } = preferenceInput.parse(request.body);
    return repo().rpc<NotificationPreferences>(token, "save_notification_preferences_for_client", {
      p_reactions: reactions, p_comments: comments, p_replies: replies, p_followers: followers,
    });
  });
  app.get("/api/v1/posts/:id/comments/:commentId", async (request) => {
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const { id, commentId } = identifiers.extend({ commentId: z.uuid() }).parse(request.params);
    const comment = await repo().rpc<CommentTarget | null>(token, "post_comment_target_for_client", { p_post: id, p_comment: commentId });
    if (!comment) throw new ApiError(404, "NOT_FOUND", "Comment unavailable");
    return { comment };
  });
  app.get("/api/v1/feed", async (request) => {
    const input = feedQuery.parse(request.query);
    const { actor, token } = await viewer(request, input.scope !== "feed");
    await read("feed", actor, request.ip);
    const limit = input.limit ?? 20;
    if (input.scope === "for_you") {
      let snapshot: string | null = null;
      let after = 0;
      if (input.cursor) {
        try {
          const cursor = z.strictObject({ snapshot: z.uuid(), after: z.number().int().min(1).max(80) })
            .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
          snapshot = cursor.snapshot;
          after = cursor.after;
        } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid recommendation cursor"); }
      }
      const ranked = await repo().recommendations(token, { p_snapshot: snapshot, p_after: after, p_limit: limit });
      const page = ranked.rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor = ranked.rows.length > limit && last
        ? Buffer.from(JSON.stringify({ snapshot: ranked.snapshotId, after: last.position })).toString("base64url") : null;
      return { posts: page.map(({ post }) => post), nextCursor, algorithmVersion: ranked.algorithmVersion };
    }
    const rows = await repo().read(token, { p_scope: input.scope, p_limit: limit, ...before(input.cursor), p_id: null });
    const { page, nextCursor } = paginate(rows, limit);
    return { posts: page, nextCursor };
  });
  app.get("/api/v1/posts/:id", async (request) => {
    const { id } = identifiers.parse(request.params);
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const [post] = await repo().read(token, { p_scope: "feed", p_limit: 1, ...before(), p_id: id });
    if (!post) throw new ApiError(404, "NOT_FOUND", "Post unavailable");
    return { post };
  });
  app.post("/api/v1/posts", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = postInput.parse(request.body);
    content(input.body, postBodyLimit);
    const id = await repo().rpc<string>(token, "create_post_with_media_for_client", {
      p_body: input.body, p_language: input.language, p_visibility: input.visibility, p_submission: key,
      p_topics: input.topics ?? [], p_items: input.attachments ?? [],
    });
    return reply.code(201).send({ id });
  });
  app.patch("/api/v1/posts/:id", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = postEdit.parse(request.body);
    content(input.body, postBodyLimit);
    const fields = { p_id: id, p_version: input.version, p_body: input.body, p_language: input.language, p_visibility: input.visibility };
    if (input.attachments) {
      await repo().rpc(token, "edit_post_with_media_for_client", { ...fields, p_topics: input.topics ?? null, p_items: input.attachments });
      cleanMedia(request);
    } else await repo().rpc(token, input.topics ? "edit_post_with_topics_for_client" : "mutate_post_for_client", {
      ...fields,
      ...(input.topics ? { p_topics: input.topics } : { p_delete: false }),
    });
    return reply.code(204).send();
  });
  app.get("/api/v1/recommendations/settings", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("feed", actor, request.ip);
    return repo().rpc<RecommendationSettings>(token, "recommendation_settings_for_client");
  });
  app.put("/api/v1/recommendations/settings", { bodyLimit: 2_048 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ topics: z.array(z.enum(interestCodes)).max(10).pipe(topics) }).parse(request.body);
    return repo().rpc<RecommendationSettings>(token, "save_recommendation_topics_for_client", { p_topics: input.topics });
  });
  app.post("/api/v1/posts/:id/recommendation-feedback", { bodyLimit: 1_024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const { action } = z.strictObject({ action: z.enum(recommendationActions) }).parse(request.body);
    await repo().rpc(token, "recommendation_feedback_for_client", { p_post: id, p_action: action });
    return reply.code(204).send();
  });
  app.delete("/api/v1/recommendations/feedback", async (request) => {
    const { token } = await viewer(request, true);
    return repo().rpc<RecommendationSettings>(token, "clear_recommendation_feedback_for_client");
  });
  app.delete("/api/v1/posts/:id", async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = versionQuery.parse(request.query);
    await repo().rpc(token, "mutate_post_for_client", {
      p_id: id, p_version: input.version, p_delete: true, p_body: null, p_language: null, p_visibility: null,
    });
    cleanMedia(request);
    return reply.code(204).send();
  });
  app.post("/api/v1/posts/:id/reports", { bodyLimit: 4_096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = reportInput.parse(request.body);
    if (input.note) content(input.note, 500);
    await repo().rpc(token, "report_post_for_client", { p_id: id, p_category: input.category, p_note: input.note || null });
    return reply.code(204).send();
  });
  app.get("/api/v1/me/feed-moderation", async (request) => {
    const { token } = await viewer(request, true);
    return { allowed: await repo().rpc<boolean>(token, "feed_moderation_access") };
  });
  app.get("/api/v1/moderation/feed", async (request) => {
    const { token, actor } = await moderator(request);
    await read("feed", actor, request.ip);
    return reportPage(token, reportQuery.parse(request.query));
  });
  for (const kind of ["posts", "comments"] as const) {
    app.patch(`/api/v1/moderation/${kind}/:id`, { bodyLimit: 4_096 }, async (request, reply) => {
      const { token } = await moderator(request);
      const { id } = identifiers.parse(request.params);
      const input = decisionInput.parse(request.body);
      await repo().rpc(token, kind === "posts" ? "moderate_post_for_client" : "moderate_comment_for_client", {
        p_id: id, p_version: input.version, p_action: input.action, p_reason: input.reason,
      });
      if (kind === "posts" && input.action === "remove") cleanMedia(request);
      return reply.code(204).send();
    });

    const reaction = `/api/v1/${kind}/:id/reaction`;
    app.get(reaction, async (request) => {
      const { id } = identifiers.parse(request.params);
      const { actor, token } = await viewer(request);
      await read("feed", actor, request.ip);
      return { reactions: await repo().rpc<ReactionSummary>(token, "read_reaction_for_client", { p_id: id, p_comment: kind === "comments" }) };
    });
    app.route({
      method: ["PUT", "DELETE"], url: reaction, bodyLimit: 1_024,
      handler: async (request) => {
        const { id } = identifiers.parse(request.params);
        const { token } = await viewer(request, true);
        const selected = request.method === "PUT" ? z.strictObject({ kind: z.enum(reactionKinds) }).parse(request.body).kind : null;
        return engagement<{ reactions: ReactionSummary }>(token, kind === "posts" ? "post_reaction" : "comment_reaction", id, { p_kind: selected });
      },
    });
  }

  app.get("/api/v1/posts/:id/comments", async (request) => {
    const { id } = identifiers.parse(request.params);
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const query = z.strictObject({
      parent: z.uuid().optional(), cursor: pageCursor,
      limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(25)).optional(),
    }).parse(request.query);
    const limit = query.limit ?? 15;
    const cursor = before(query.cursor);
    const rows = await repo().rpc<FeedComment[]>(token, "list_comments_for_client", {
      p_post: id, p_parent: query.parent ?? null, p_limit: limit, p_after_at: cursor.p_before_at, p_after_id: cursor.p_before_id,
    });
    const { page, nextCursor } = paginate(rows, limit);
    return { comments: page, nextCursor };
  });
  app.post("/api/v1/posts/:id/comments", { bodyLimit: 12_288 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = commentFields.extend({ parentId: z.uuid().nullable().optional() }).parse(request.body);
    content(input.body, commentBodyLimit);
    const created = await engagement<{ id: string }>(token, "create", id, {
      p_parent: input.parentId ?? null, p_body: input.body, p_language: input.language, p_submission: key,
    });
    return reply.code(201).send(created);
  });
  app.patch("/api/v1/comments/:id", { bodyLimit: 12_288 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = commentEdit.parse(request.body);
    content(input.body, commentBodyLimit);
    await engagement(token, "edit", id, { p_version: input.version, p_body: input.body, p_language: input.language });
    return reply.code(204).send();
  });
  app.delete("/api/v1/comments/:id", async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = versionQuery.parse(request.query);
    await engagement(token, "delete", id, { p_version: input.version });
    return reply.code(204).send();
  });
  app.post("/api/v1/comments/:id/reports", { bodyLimit: 4_096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = reportInput.parse(request.body);
    if (input.note) content(input.note, 500);
    await engagement(token, "report", id, { p_category: input.category, p_note: input.note || null });
    return reply.code(204).send();
  });
}
