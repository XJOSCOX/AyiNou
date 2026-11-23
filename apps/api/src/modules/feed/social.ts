import type { FastifyInstance } from "fastify";
import { locales, postBodyLimit } from "@ayinou/shared";
import { z } from "zod";
import { content, identifiers } from "./validation.js";
import { before, pageCursor, paginate } from "./pagination.js";
import type { FeedRouteContext } from "./context.js";

const tag = z.string().max(96).transform((value) => value.normalize("NFC").toLowerCase())
  .pipe(z.string().regex(/^[\p{L}\p{N}_]{1,48}$/u));
const handle = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/);
const organization = z.union([handle, z.uuid()]);
const preferenceInput = z.strictObject({ mentions: z.boolean(), reposts: z.boolean(), quotes: z.boolean() });

export function registerSocialRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  app.get("/api/v1/institutions/by-handle/:handle/posts", async (request) => {
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const params = z.object({ handle }).parse(request.params);
    const query = z.strictObject({ cursor: pageCursor, filter: z.enum(["all", "announcements"]).default("all") }).parse(request.query);
    const fields = { p_scope: "organization", p_handle: params.handle, p_filter: query.filter, p_limit: 20 };
    const [rows, pinned] = await Promise.all([
      repo().read(token, { ...fields, p_pins: false, ...before(query.cursor) }),
      query.cursor ? [] : repo().read(token, { ...fields, p_pins: true, ...before() }),
    ]);
    const { page, nextCursor } = paginate(rows, 20);
    return { posts: [...pinned, ...page], nextCursor };
  });
  app.put("/api/v1/posts/:id/organization-pin", { bodyLimit: 1024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = z.strictObject({ version: z.number().int().positive(), pinned: z.boolean() }).parse(request.body);
    await repo().rpc(token, "set_organization_post_pin_for_client", { p_id: id, p_version: input.version, p_pinned: input.pinned });
    return reply.code(204).send();
  });
  app.get("/api/v1/feed/social", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("feed", actor, request.ip);
    const query = z.strictObject({ scope: z.enum(["saved", "hashtag"]), tag: tag.optional(), cursor: pageCursor })
      .refine(({ scope, tag }) => (scope === "hashtag") === (tag !== undefined)).parse(request.query);
    const limit = 20;
    const rows = await repo().read(token, { p_scope: query.scope, p_tag: query.tag ?? null, p_limit: limit, ...before(query.cursor) });
    const { page, nextCursor } = paginate(rows, limit);
    return { posts: page, nextCursor };
  });
  app.get("/api/v1/discover/hashtags", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const { q } = z.strictObject({ q: tag }).parse(request.query);
    return { tags: await repo().rpc<string[]>(token, "search_hashtags_for_client", { p_prefix: q }) };
  });
  app.put("/api/v1/posts/:id/social", { bodyLimit: 1024 }, async (request) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const { kind, enabled } = z.strictObject({ kind: z.enum(["repost", "bookmark"]), enabled: z.boolean() }).parse(request.body);
    return repo().rpc(token, "social_interaction_for_client", { p_id: id, p_kind: kind, p_enabled: enabled });
  });
  app.post("/api/v1/posts/social", { bodyLimit: 12_288 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = z.strictObject({
      body: z.string(), language: z.enum(locales), sourceId: z.uuid().optional(), organization: handle.optional(),
      announcement: z.boolean().optional(), projectId: z.uuid().optional(),
    }).refine(({ sourceId, organization, announcement, projectId }) =>
      Boolean(organization) || Boolean(sourceId && announcement === undefined && !projectId)).parse(request.body);
    content(input.body, postBodyLimit);
    const id = input.organization
      ? await repo().rpc<string>(token, "publish_organization_post_for_client", {
        p_organization: input.organization, p_body: input.body, p_language: input.language, p_submission: key,
        p_announcement: input.announcement ?? false, p_project: input.projectId ?? null, p_source: input.sourceId ?? null,
      })
      : await repo().rpc<string>(token, "create_social_post_for_client", {
      p_source: input.sourceId ?? null, p_organization: input.organization ?? null,
      p_body: input.body, p_language: input.language, p_submission: key,
    });
    return reply.code(201).send({ id });
  });
  app.route({
    method: ["GET", "PUT"], url: "/api/v1/me/follow-reposts/:kind/:key", bodyLimit: 1024,
    handler: async (request) => {
      const { actor, token } = await viewer(request, true);
      if (request.method !== "PUT") await read("discovery", actor, request.ip);
      const { kind, key } = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("member"), key: handle }),
        z.object({ kind: z.literal("institution"), key: organization }),
      ]).parse(request.params);
      const enable = request.method === "PUT" ? z.strictObject({ enabled: z.boolean() }).parse(request.body).enabled : null;
      return repo().rpc(token, "follow_reposts_for_client", { p_kind: kind, p_key: key, p_enabled: enable });
    },
  });
  app.route({
    method: ["GET", "PUT"], url: "/api/v1/me/social-notification-preferences", bodyLimit: 1024,
    handler: async (request) => {
      const { actor, token } = await viewer(request, true);
      if (request.method !== "PUT") await read("notifications", actor, request.ip);
      const input = request.method === "PUT" ? preferenceInput.parse(request.body) : null;
      return repo().rpc(token, "social_notification_preferences_for_client", {
        p_mentions: input?.mentions ?? null, p_reposts: input?.reposts ?? null, p_quotes: input?.quotes ?? null,
      });
    },
  });
}
