import type { FastifyInstance } from "fastify";
import { communityStaffRoles, moderationActions, type FeedReport, type PostAttachment } from "@ayinou/shared";
import { z } from "zod";
import { before, pageCursor, paginate } from "./pagination.js";
import { communityParams, content, identifiers, reportInput, version } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

const decisionInput = z.strictObject({ version, action: z.enum(moderationActions),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)) });
const reportQuery = z.strictObject({
  scope: z.enum(["reports", "hidden"]).default("reports"), target: z.enum(["posts", "comments"]).default("posts"), cursor: pageCursor,
});

export function registerFeedModerationRoutes(app: FastifyInstance, { viewer, repo, read, moderator, requireRecentMfa, cleanMedia }: FeedRouteContext) {
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
  }

  const department = "/api/v1/communities/:key";
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
    await requireRecentMfa(token);
    const input = z.strictObject({
      username: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/), role: z.enum(communityStaffRoles).nullable(),
      reason: decisionInput.shape.reason,
    }).parse(request.body);
    await repo().rpc(token, "change_department_staff_for_client", { p_key: key, p_username: input.username, p_role: input.role, p_reason: input.reason });
    return reply.code(204).send();
  });
}
