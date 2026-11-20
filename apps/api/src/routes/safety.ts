import type { FastifyInstance, FastifyRequest } from "fastify";
import { appealOutcomes, type AppealReview, type MemberAppealDecision, type MemberSafetyEntry, type PostAttachment } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const limit = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(30)).optional();
const cursor = z.string().max(250).regex(/^[A-Za-z0-9_-]+$/).optional();
const boundary = z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
const reason = (maximum: number) => z.string().trim().min(10).max(maximum).refine((value) => !/\p{Cc}/u.test(value));

function appealBoundary(value?: string) {
  if (!value) return { p_before_at: null, p_before_id: null };
  try {
    const data = boundary.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { p_before_at: data.createdAt, p_before_id: data.id };
  } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid page cursor"); }
}

function appealPage<T extends { id: string; createdAt: string }>(rows: T[], size: number) {
  const decisions = rows.slice(0, size);
  const last = decisions.at(-1);
  const nextCursor = rows.length > size && last
    ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt })).toString("base64url") : null;
  return { decisions, nextCursor };
}

export function registerSafetyRoutes(app: FastifyInstance, context: {
  viewer(request: FastifyRequest, required: true): Promise<{ actor: string | null; token: string | null }>;
  moderator(request: FastifyRequest): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const { viewer, moderator, repo, read } = context;
  for (const [kind, resource] of [["block", "blocked"], ["mute", "muted"]] as const) {
    app.route({
      method: ["PUT", "DELETE"], url: `/api/v1/members/:username/${kind}`, bodyLimit: 1024,
      handler: async (request, reply) => {
        const { token } = await viewer(request, true);
        const params = z.object({ username }).parse(request.params);
        if (request.body !== undefined) z.strictObject({}).parse(request.body);
        await repo().rpc(token, "save_member_safety_for_client", {
          p_kind: kind, p_enabled: request.method === "PUT", p_username: params.username, p_target: null,
        });
        return reply.code(204).send();
      },
    });
    app.get(`/api/v1/me/${resource}`, async (request) => {
      const { actor, token } = await viewer(request, true);
      await read("profile", actor, request.ip);
      const query = z.strictObject({ cursor: z.uuid().optional(), limit }).parse(request.query);
      const size = query.limit ?? 20;
      const rows = await repo().rpc<MemberSafetyEntry[]>(token, "list_member_safety_for_client", {
        p_kind: kind, p_after: query.cursor ?? null, p_limit: size,
      });
      const accounts = rows.slice(0, size);
      return { accounts, nextCursor: rows.length > size ? accounts.at(-1)?.id ?? null : null };
    });
    app.delete(`/api/v1/me/${resource}/:id`, async (request, reply) => {
      const { token } = await viewer(request, true);
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      await repo().rpc(token, "save_member_safety_for_client", { p_kind: kind, p_enabled: false, p_username: null, p_target: id });
      return reply.code(204).send();
    });
  }
  app.get("/api/v1/members/:username/mute", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    const params = z.object({ username }).parse(request.params);
    return { muted: await repo().rpc<boolean>(token, "member_mute_status_for_client", { p_username: params.username }) };
  });
  app.get("/api/v1/me/moderation-appeals", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    const query = z.strictObject({ cursor, limit }).parse(request.query);
    const size = query.limit ?? 20;
    const rows = await repo().rpc<MemberAppealDecision[]>(token, "member_appeals_for_client", {
      ...appealBoundary(query.cursor), p_limit: size,
    });
    return appealPage(rows, size);
  });
  app.post("/api/v1/moderation/actions/:id/appeals", { bodyLimit: 8192 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = z.strictObject({ kind: z.enum(["post", "comment"]),
      reason: z.string().trim().min(10).max(1000).refine((value) => !/\p{Cc}/u.test(value.replace(/[\t\r\n]/g, ""))),
    }).parse(request.body);
    const appeal = await repo().rpc<string>(token, "submit_moderation_appeal_for_client", {
      p_kind: input.kind, p_action: id, p_reason: input.reason,
    });
    return reply.code(201).send({ id: appeal });
  });
  app.get("/api/v1/moderation/appeals", async (request) => {
    const { token, actor } = await moderator(request);
    await read("notifications", actor, request.ip);
    const query = z.strictObject({ scope: z.enum(["pending", "history"]).default("pending"), cursor, limit }).parse(request.query);
    const size = query.limit ?? 20;
    const rows = await repo().rpc<AppealReview[]>(token, "review_appeals_for_client", {
      ...appealBoundary(query.cursor), p_scope: query.scope, p_limit: size,
    });
    const page = appealPage(rows, size);
    const postIds = [...new Set(page.decisions.filter((item) => item.kind === "post").map((item) => item.postId))];
    const media = postIds.length ? await repo().rpc<Record<string, PostAttachment[]>>(token, "post_attachments_for_client", {
      p_ids: postIds, p_review: true,
    }) : {};
    return { ...page, decisions: page.decisions.map((item) => ({ ...item, attachments: item.kind === "post" ? media[item.postId] ?? [] : [] })) };
  });
  app.patch("/api/v1/moderation/appeals/:id", { bodyLimit: 4096 }, async (request, reply) => {
    const { token } = await moderator(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = z.strictObject({ outcome: z.enum(appealOutcomes), explanation: reason(500) }).parse(request.body);
    await repo().rpc(token, "decide_moderation_appeal_for_client", { p_id: id, p_outcome: input.outcome, p_explanation: input.explanation });
    return reply.code(204).send();
  });
}
