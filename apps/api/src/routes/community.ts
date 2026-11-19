import type { FastifyInstance } from "fastify";
import type { CommunityRepository } from "../services/community.js";

export async function registerCommunityRoutes(app: FastifyInstance, community: CommunityRepository | null) {
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
