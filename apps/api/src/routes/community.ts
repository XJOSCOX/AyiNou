import type { FastifyInstance } from "fastify";
import { homepageStatisticsSchema, type CommunityRepository } from "../services/community.js";
import type { InstitutionRepository } from "../services/institutions.js";

export async function registerCommunityRoutes(
  app: FastifyInstance, community: CommunityRepository | null, policies: InstitutionRepository | null,
) {
  const requests = new Map<string, { count: number; resetAt: number }>();
  app.addHook("onRequest", async (request, reply) => {
    const now = Date.now();
    const current = requests.get(request.ip);
    if (!current || current.resetAt <= now) {
      requests.set(request.ip, { count: 1, resetAt: now + 60_000 });
    } else if (++current.count > 60) {
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Try again shortly" } });
    }
    if (requests.size > 1000) {
      for (const [key, value] of requests) if (value.resetAt <= now) requests.delete(key);
    }
  });

  app.get("/api/v1/homepage/community-statistics", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      if (!policies) throw new Error("Homepage policy unavailable");
      const result = await policies.rpc<unknown>("homepage_community_statistics_for_api", {});
      return { stats: homepageStatisticsSchema.nullable().parse(result) };
    } catch {
      return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Homepage statistics unavailable" } });
    }
  });

  // Shared read function keeps the three endpoints on one privacy contract.
  async function load() {
    if (!community) return null;
    try { return await community.stats(); } catch { return null; }
  }

  app.get("/api/v1/community/stats", async (_request, reply) => {
    const result = await load();
    if (!result) return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Community statistics unavailable" } });
    reply.header("Cache-Control", "public, max-age=30");
    return { stats: result };
  });
  app.get("/api/v1/community/departments", async (_request, reply) => {
    const result = await load();
    if (!result) return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Community statistics unavailable" } });
    reply.header("Cache-Control", "public, max-age=30");
    return { updatedAt: result.updatedAt, geographyAvailable: result.geographyAvailable, departments: result.departments };
  });
  app.get("/api/v1/community/diaspora", async (_request, reply) => {
    const result = await load();
    if (!result) return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Community statistics unavailable" } });
    reply.header("Cache-Control", "public, max-age=30");
    return { updatedAt: result.updatedAt, geographyAvailable: result.geographyAvailable, countries: result.diasporaCountries };
  });
}
