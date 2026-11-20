import type { FastifyInstance, FastifyRequest } from "fastify";
import { organizationKinds, type DiscoveryCard, type FollowStatus } from "@ayinou/shared";
import { z } from "zod";
import { feedDatabaseError, type FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const cursor = z.string().max(52).regex(/^(?:(?:member|institution):)?[a-z0-9][a-z0-9_-]{2,39}$/).optional();
const limit = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional();
const paging = z.strictObject({ cursor, limit });
const search = paging.extend({
  q: z.string().trim().max(80).refine((value) => value.length !== 1 && !/\p{Cc}/u.test(value)).optional(),
  verified: z.enum(["true", "false"]).optional(),
});
const institutionSearch = search.extend({
  category: z.enum(organizationKinds).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  department: z.string().regex(/^HT-[A-Z]{2}$/).optional(),
});

export function registerDiscoveryRoutes(
  app: FastifyInstance,
  viewer: (request: FastifyRequest, required?: boolean) => Promise<{ actor: string | null; token: string | null }>,
  repo: () => FeedRepository,
  read: ReadBudget,
) {
  function response(rows: DiscoveryCard[], size: number, combined: boolean) {
    const accounts = rows.slice(0, size);
    const last = accounts.at(-1);
    return { accounts, nextCursor: rows.length > size && last ? (combined ? last.id : last.handle) : null };
  }

  app.get("/api/v1/discover/suggestions", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("discovery", actor, request.ip);
    return { accounts: await repo().rpc<DiscoveryCard[]>(token, "discovery_suggestions_for_client") };
  });

  for (const kind of ["people", "institutions"] as const) {
    app.get("/api/v1/discover/" + kind, async (request) => {
      const { actor, token } = await viewer(request, true);
      await read("discovery", actor, request.ip);
      const input = (kind === "people" ? search : institutionSearch).parse(request.query);
      const size = input.limit ?? 15;
      const rows = await repo().rpc<DiscoveryCard[]>(token, "search_discovery_for_client", {
        p_kind: kind, p_search: input.q ?? "", p_verified: input.verified === "true",
        p_category: "category" in input ? input.category ?? null : null,
        p_country: "country" in input ? input.country ?? null : null,
        p_department: "department" in input ? input.department ?? null : null,
        p_after: input.cursor ?? null, p_limit: size,
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

  function list(view: string, params?: z.ZodType<{ key: string }>) {
    return async (request: FastifyRequest) => {
      const { actor, token } = await viewer(request, true);
      await read("discovery", actor, request.ip);
      const { cursor, limit } = paging.parse(request.query);
      const size = limit ?? 15;
      const rows = await repo().rpc<DiscoveryCard[]>(token, "follow_list_for_client", {
        p_view: view, p_key: params?.parse(request.params).key ?? null, p_after: cursor ?? null, p_limit: size,
      });
      return response(rows, size, view === "mine" || view === "following");
    };
  }
}
