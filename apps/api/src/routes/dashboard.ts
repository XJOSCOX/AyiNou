import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const sections = ["events", "projects", "communities", "opportunities", "impact", "statistics"] as const;
const section = z.enum(sections);
const order = z.array(section).length(sections.length).refine((value) => new Set(value).size === sections.length);
const subset = z.array(section).max(sections.length).refine((value) => new Set(value).size === value.length);
const receipt = { expectedVersion: z.number().int().min(0), requestId: z.uuid() };
const reason = z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value));
const translations = z.strictObject({
  en: z.string().trim().min(3).max(2000), ht: z.string().trim().min(3).max(2000),
  fr: z.string().trim().min(3).max(2000), es: z.string().trim().min(3).max(2000),
});
const preferences = z.strictObject({ ...receipt, order, hidden: subset });
const adminCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("configure"), reason, confirmed: z.literal(true),
    available: subset, defaultOrder: order, defaultHidden: subset, itemLimit: z.number().int().min(2).max(6),
    announcementsEnabled: z.boolean(), statisticsEnabled: z.boolean(), featuredPolicy: z.literal("latest") }),
  z.strictObject({ ...receipt, action: z.literal("publish"), reason, confirmed: z.literal(true),
    category: z.enum(["platform", "feature", "notice", "initiative", "maintenance"]),
    title: translations, body: translations, publishedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }) }),
  z.strictObject({ ...receipt, action: z.literal("withdraw"), reason, confirmed: z.literal(true), id: z.uuid() }),
]);
const empty = z.strictObject({});

export function registerDashboardRoutes(app: FastifyInstance, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow");
  });
  async function run(request: FastifyRequest, action: string, input: object, founder = false) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Dashboard unavailable");
    const session = await auth.verifySession(token, founder);
    if (!session) {
      if (founder && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = founder ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(founder ? "audit" : "profile", session.actor, request.ip);
    try {
      if (founder) {
        const access = await repository.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      return await repository.rpc("d1_dashboard_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace?.data ?? null, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Dashboard request failed");
      throw error;
    }
  }

  app.get("/api/v1/me/dashboard", (request) => {
    empty.parse(request.query);
    return run(request, "read", {});
  });
  app.patch("/api/v1/me/dashboard/preferences", { bodyLimit: 2048 }, (request) => {
    empty.parse(request.query);
    return run(request, "preferences", preferences.parse(request.body));
  });
  app.get("/api/v1/admin/dashboard-settings", (request) => {
    empty.parse(request.query);
    return run(request, "settings_read", {}, true);
  });
  app.patch("/api/v1/admin/dashboard-settings", { bodyLimit: 12_288 }, (request) => {
    empty.parse(request.query);
    const command = adminCommand.parse(request.body);
    const input: Record<string, unknown> = { ...command };
    delete input.action;
    delete input.confirmed;
    return run(request, command.action, input, true);
  });
}
