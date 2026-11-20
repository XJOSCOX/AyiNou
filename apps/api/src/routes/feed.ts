import type { FastifyInstance, FastifyRequest } from "fastify";
import { locales, moderationActions, postBodyLimit, postVisibilities, reportCategories, type FeedReport } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import type { FeedRepository } from "../services/feed.js";

const cursorShape = z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
const pageCursor = z.string().max(250).regex(/^[A-Za-z0-9_-]+$/).optional();
const feedQuery = z.strictObject({
  scope: z.enum(["feed", "mine"]).default("feed"), cursor: pageCursor,
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(40)).optional(),
});
const identifiers = z.object({ id: z.uuid() });
const version = z.number().int().min(1).max(2_147_483_647);
const postFields = z.strictObject({ body: z.string(), language: z.enum(locales), visibility: z.enum(postVisibilities) });
const postEdit = postFields.extend({ version });
const explain = z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value));

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

export async function registerFeedRoutes(app: FastifyInstance, auth: AuthVerifier | null, repository: FeedRepository | null) {
  const readCounts = new Map<string, number>();
  let windowEnds = 0;

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

  function limitReads(request: FastifyRequest, actor: string | null) {
    const now = Date.now();
    if (now >= windowEnds) { readCounts.clear(); windowEnds = now + 60_000; }
    const key = actor ? `member:${actor}` : `anonymous:${request.ip}`;
    const count = readCounts.get(key) ?? 0;
    if (count >= (actor ? 120 : 90) || (!readCounts.has(key) && readCounts.size >= 10_000)) {
      throw new ApiError(429, "RATE_LIMITED", "Wait before trying again");
    }
    readCounts.set(key, count + 1);
  }

  async function moderator(request: FastifyRequest) {
    const { token } = await viewer(request, true);
    if (!await repo().rpc<boolean>(token, "feed_moderation_access")) {
      throw new ApiError(403, "FORBIDDEN", "A moderation role is required");
    }
    if (!await auth!.verify(token!, true)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    return token;
  }

  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  app.get("/api/v1/feed", async (request) => {
    const input = feedQuery.parse(request.query);
    const { actor, token } = await viewer(request, input.scope === "mine");
    limitReads(request, actor);
    const limit = input.limit ?? 20;
    const rows = await repo().read(token, { p_scope: input.scope, p_limit: limit, ...before(input.cursor), p_id: null });
    const { page, nextCursor } = paginate(rows, limit);
    return { posts: page, nextCursor };
  });
  app.get("/api/v1/posts/:id", async (request) => {
    const { id } = identifiers.parse(request.params);
    const { actor, token } = await viewer(request);
    limitReads(request, actor);
    const [post] = await repo().read(token, { p_scope: "feed", p_limit: 1, ...before(), p_id: id });
    if (!post) throw new ApiError(404, "NOT_FOUND", "Post unavailable");
    return { post };
  });
  app.post("/api/v1/posts", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = postFields.parse(request.body);
    content(input.body, postBodyLimit);
    const id = await repo().rpc<string>(token, "create_post_for_client", {
      p_body: input.body, p_language: input.language, p_visibility: input.visibility, p_submission: key,
    });
    return reply.code(201).send({ id });
  });
  app.patch("/api/v1/posts/:id", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = postEdit.parse(request.body);
    content(input.body, postBodyLimit);
    await repo().rpc(token, "mutate_post_for_client", {
      p_id: id, p_version: input.version, p_delete: false, p_body: input.body, p_language: input.language, p_visibility: input.visibility,
    });
    return reply.code(204).send();
  });
  app.delete("/api/v1/posts/:id", async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = z.strictObject({ version: z.string().regex(/^\d{1,10}$/).transform(Number).pipe(version) }).parse(request.query);
    await repo().rpc(token, "mutate_post_for_client", {
      p_id: id, p_version: input.version, p_delete: true, p_body: null, p_language: null, p_visibility: null,
    });
    return reply.code(204).send();
  });
  app.post("/api/v1/posts/:id/reports", { bodyLimit: 4_096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = z.strictObject({ category: z.enum(reportCategories), note: z.string().trim().optional() }).parse(request.body);
    if (input.note) content(input.note, 500);
    await repo().rpc(token, "report_post_for_client", { p_id: id, p_category: input.category, p_note: input.note || null });
    return reply.code(204).send();
  });
  app.get("/api/v1/me/feed-moderation", async (request) => {
    const { token } = await viewer(request, true);
    return { allowed: await repo().rpc<boolean>(token, "feed_moderation_access") };
  });
  app.get("/api/v1/moderation/feed", async (request) => {
    const token = await moderator(request);
    const input = z.strictObject({ scope: z.enum(["reports", "hidden"]).default("reports"), cursor: pageCursor }).parse(request.query);
    const rows = await repo().rpc<FeedReport[]>(token, "list_feed_reports_for_client", {
      p_scope: input.scope, ...before(input.cursor),
    });
    const { page, nextCursor } = paginate(rows, 25);
    return { reports: page, nextCursor };
  });
  app.patch("/api/v1/moderation/posts/:id", { bodyLimit: 4_096 }, async (request, reply) => {
    const token = await moderator(request);
    const { id } = identifiers.parse(request.params);
    const input = z.strictObject({ version, action: z.enum(moderationActions), reason: explain }).parse(request.body);
    await repo().rpc(token, "moderate_post_for_client", {
      p_id: id, p_version: input.version, p_action: input.action, p_reason: input.reason,
    });
    return reply.code(204).send();
  });
}
