import type { FastifyInstance, FastifyRequest } from "fastify";
import { followPolicies, interestCodes, locales, mentionPolicies, organizationKinds, profileModes, type DiscoveryCard, type FollowStatus, type FollowRequestEntry } from "@ayinou/shared";
import { z } from "zod";
import { feedDatabaseError, type FeedRepository } from "../services/feed.js";
import { before, pageCursor, paginate } from "../modules/feed/pagination.js";
import type { ReadBudget } from "../services/read-budget.js";

const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const cursor = z.string().max(52).regex(/^(?:(?:member|institution):)?[a-z0-9][a-z0-9_-]{2,39}$/).optional();
const limit = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional();
const paging = z.strictObject({ cursor, limit });
const search = paging.extend({
  q: z.string().trim().max(80).refine((value) => value.length !== 1 && !/[\p{Cc}@]/u.test(value)).optional(),
  verified: z.enum(["true", "false"]).optional(),
});
const geography = {
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  department: z.string().regex(/^HT-[A-Z]{2}$/).optional(),
};
const institutionSearch = search.extend({
  ...geography,
  category: z.enum(organizationKinds).optional(),
});
const peopleSearch = search.extend({
  ...geography,
  language: z.enum(locales).optional(),
  interest: z.enum(interestCodes).optional(),
});
const socialPrivacy = z.strictObject({
  mode: z.enum(profileModes), followPolicy: z.enum(followPolicies), mentions: z.enum(mentionPolicies),
  showFollowers: z.boolean(), showFollowing: z.boolean(), showBiography: z.boolean(),
  showActivity: z.boolean(), shareLanguage: z.boolean(), followNotices: z.boolean(),
});

export function registerDiscoveryRoutes(
  app: FastifyInstance,
  viewer: (request: FastifyRequest, required?: boolean) => Promise<{ actor: string | null; token: string | null }>,
  repo: () => FeedRepository,
  read: ReadBudget,
) {
  type Row = DiscoveryCard & { avatarPath?: string | null };
  async function hydrate(rows: Row[]) {
    const paths = rows.flatMap(({ avatarPath }) => avatarPath ? [avatarPath] : []);
    const signed = paths.length ? await repo().signAvatars?.(paths) : undefined;
    return rows.map(({ avatarPath, ...card }) => card.kind === "member"
      ? { ...card, avatarUrl: avatarPath ? signed?.get(avatarPath) ?? null : null } : card);
  }

  async function response(rows: Row[], size: number, combined: boolean) {
    const accounts = rows.slice(0, size);
    const last = accounts.at(-1);
    return { accounts: await hydrate(accounts), nextCursor: rows.length > size && last ? (combined ? last.id : last.handle) : null };
  }

  app.get("/api/v1/discover/suggestions", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    return { accounts: await hydrate(await repo().rpc<Row[]>(token, "discovery_suggestions_for_client")) };
  });

  for (const kind of ["people", "institutions"] as const) {
    app.get("/api/v1/discover/" + kind, async (request) => {
      const { actor, token } = await viewer(request, true);
      await read("discovery", actor, request.ip);
      const input = (kind === "people" ? peopleSearch : institutionSearch).parse(request.query);
      const size = input.limit ?? 15;
      const common = {
        p_search: input.q ?? "", p_verified: input.verified === "true",
        p_country: input.country ?? null, p_department: input.department ?? null,
        p_after: input.cursor ?? null, p_limit: size,
      };
      const rows = kind === "people"
        ? await repo().rpc<Row[]>(token, "search_members_f24_for_client", {
          ...common, p_interest: "interest" in input ? input.interest ?? null : null,
          p_language: "language" in input ? input.language ?? null : null,
        })
        : await repo().rpc<Row[]>(token, "search_discovery_for_client", {
          ...common, p_kind: kind, p_category: "category" in input ? input.category ?? null : null,
        });
      return response(rows, size, false);
    });
  }

  for (const target of [{ segment: "members", kind: "member", id: username }, { segment: "institutions", kind: "institution", id: z.uuid() }] as const) {
    const targetPath = "/api/v1/" + target.segment + "/:key";
    const params = z.object({ key: target.id });
    app.get(targetPath + "/follow", async (request) => {
      const { actor, token } = await viewer(request);
      await read("discovery", actor, request.ip);
      const { key } = params.parse(request.params);
      return repo().rpc<FollowStatus>(token, "follow_status_for_client", { p_kind: target.kind, p_key: key });
    });
    app.route({
      method: ["PUT", "DELETE"], url: targetPath + "/follow", bodyLimit: 1024,
      handler: async (request) => {
        const { token } = await viewer(request, true);
        const { key } = params.parse(request.params);
        if (request.body !== undefined) z.strictObject({}).parse(request.body);
        const result = await repo().rpc<FollowStatus | { error: string }>(token, "write_follow_for_client", {
          p_kind: target.kind, p_key: key, p_follow: request.method === "PUT",
        });
        if ("error" in result) throw feedDatabaseError(result.error);
        return result;
      },
    });
    app.get(targetPath + "/followers", list(target.kind === "member" ? "followers" : "institution_followers", params));
  }
  app.get("/api/v1/members/:key/following", list("following", z.object({ key: username })));
  app.get("/api/v1/me/following", list("mine"));

  app.route({
    method: ["GET", "PUT"], url: "/api/v1/me/social-privacy", bodyLimit: 2048,
    handler: async (request) => {
      const { actor, token } = await viewer(request, true);
      if (request.method === "GET") await read("profile", actor, request.ip);
      return repo().rpc(token, "social_privacy_for_client", {
        p_settings: request.method === "PUT" ? socialPrivacy.parse(request.body) : null,
      });
    },
  });
  app.get("/api/v1/me/follow-requests", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    const query = z.strictObject({ view: z.enum(["incoming", "outgoing"]), cursor: pageCursor }).parse(request.query);
    const rows = await repo().rpc<FollowRequestEntry[]>(token, "follow_requests_for_client", {
      p_view: query.view, p_limit: 20, ...before(query.cursor),
    });
    const { page, nextCursor } = paginate(rows, 20);
    return { requests: page, nextCursor };
  });
  app.patch("/api/v1/me/follow-requests/:id", { bodyLimit: 512 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { action } = z.strictObject({ action: z.enum(["approve", "reject", "cancel"]) }).parse(request.body);
    await repo().rpc(token, "resolve_follow_request_for_client", { p_request: id, p_action: action });
    return reply.code(204).send();
  });
  app.delete("/api/v1/me/followers/:key", async (request, reply) => {
    const { token } = await viewer(request, true);
    const { key } = z.object({ key: username }).parse(request.params);
    await repo().rpc(token, "remove_follower_for_client", { p_username: key });
    return reply.code(204).send();
  });

  function list(view: string, params?: z.ZodType<{ key: string }>) {
    return async (request: FastifyRequest) => {
      const { actor, token } = await viewer(request, true);
      await read("discovery", actor, request.ip);
      const { cursor, limit } = paging.parse(request.query);
      const size = limit ?? 15;
      const rows = await repo().rpc<Row[]>(token, "follow_list_for_client", {
        p_view: view, p_key: params?.parse(request.params).key ?? null, p_after: cursor ?? null, p_limit: size,
      });
      return response(rows, size, view === "mine" || view === "following");
    };
  }
}
