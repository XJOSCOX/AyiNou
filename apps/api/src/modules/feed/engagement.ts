import type { FastifyInstance } from "fastify";
import { commentBodyLimit, reactionKinds, type CommentTarget, type FeedComment, type ReactionSummary } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../../services/api-error.js";
import { feedDatabaseError } from "../../services/feed.js";
import { before, pageCursor, paginate } from "./pagination.js";
import { content, identifiers, postFields, reportInput, version, versionQuery } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

const commentFields = postFields.omit({ visibility: true });
const commentEdit = commentFields.extend({ version });

export function registerFeedEngagementRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  async function engagement<T extends object>(token: string | null, operation: string, id: string, fields: Record<string, unknown> = {}) {
    const result = await repo().rpc<T & { error?: string }>(token, "write_engagement_for_client", {
      p_operation: operation, p_id: id, ...fields,
    });
    if (result.error) throw feedDatabaseError(result.error);
    return result as T;
  }

  app.get("/api/v1/posts/:id/comments/:commentId", async (request) => {
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const { id, commentId } = identifiers.extend({ commentId: z.uuid() }).parse(request.params);
    const comment = await repo().rpc<CommentTarget | null>(token, "post_comment_target_for_client", { p_post: id, p_comment: commentId });
    if (!comment) throw new ApiError(404, "NOT_FOUND", "Comment unavailable");
    return { comment };
  });

  for (const kind of ["posts", "comments"] as const) {
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
