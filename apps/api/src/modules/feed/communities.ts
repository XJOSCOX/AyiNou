import type { FastifyInstance, FastifyRequest } from "fastify";
import { departmentCommunityContent, locales, postBodyLimit,
  type Community, type DepartmentCommunity, type DiscoveryCard } from "@ayinou/shared";
import { z } from "zod";
import { feedDatabaseError } from "../../services/feed.js";
import { before, paginate } from "./pagination.js";
import { communityParams, content, feedQuery, postInput, version } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

export function registerCommunityFeedRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
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
}
