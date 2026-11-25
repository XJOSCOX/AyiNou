import type { FastifyInstance, FastifyRequest } from "fastify";
import { impactSectors, impactDepartments, type ImpactMappingSummary } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const department = z.enum(impactDepartments);
const sector = z.enum(impactSectors);
const year = z.number().int().min(2020).max(2100);
const version = z.number().int().min(0).max(2147483646);
const ids = z.strictObject({ id: z.uuid() });
const code = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/);
const reason = z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value));
const receipt = { requestId: z.uuid(), expectedVersion: version, confirmed: z.literal(true), reason };
const localizedText = z.string().trim().min(1).max(500).refine((value) => !/\p{Cc}/u.test(value));
const localized = z.strictObject({ en: localizedText, ht: localizedText, fr: localizedText, es: localizedText });
const report = { ...receipt, year, scope: sector };
const founderCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("configure"), enabled: z.boolean(), links: z.boolean(),
    measurements: z.boolean(), needs: z.boolean(), years: z.array(year).min(1).max(5),
    sectors: z.array(sector).min(1).max(7), departments: z.array(department).min(1).max(10) }),
  z.strictObject({ ...receipt, action: z.literal("define"), code, sector, names: localized, descriptions: localized,
    methods: localized, units: localized, unit: z.string().regex(/^[a-z][a-z_]{1,23}$/),
    methodologyCode: z.string().regex(/^[A-Z][A-Z0-9_]{4,63}$/), classification: z.enum(["output", "outcome"]),
    privacy: z.enum(["public_nonsensitive", "restricted"]), aggregatable: z.boolean() }),
  z.strictObject({ ...receipt, action: z.literal("grant"), target: z.uuid(), expiresAt: z.iso.datetime({ offset: true }) }),
  z.strictObject({ ...receipt, action: z.literal("revoke"), target: z.uuid() }),
  z.strictObject({ ...receipt, action: z.literal("retire_definition"), code }),
  z.strictObject({ ...report, action: z.literal("propose_report") }),
]);
const oversightCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("approve_definition"), code, methodReviewed: z.literal(true) }),
  z.strictObject({ ...report, action: z.literal("seal_report"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), methodReviewed: z.literal(true) }),
  z.strictObject({ ...report, action: z.literal("reject_report") }),
]);
const mappingReview = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("approve_mapping"), methodReviewed: z.literal(true) }),
  z.strictObject({ ...receipt, action: z.literal("reject_mapping") }),
]);
const mappingOwner = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("submit_mapping"), code, definitionVersion: version,
    deliveryReference: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{7,79}$/) }),
  z.strictObject({ ...receipt, action: z.literal("withdraw_mapping") }),
]);

export function registerImpact(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer");
  });

  async function execute<T>(request: FastifyRequest, lane: "founder" | "review" | "member", action: string, input: object = {}) {
    if (!enabled) throw new ApiError(404, "IMPACT_DISABLED", "Impact reporting unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Impact reporting unavailable");
    const staff = lane !== "member";
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(staff ? "audit" : "profile", session.actor, request.ip);
    try {
      return await repository.rpc<T>("c24_manage_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace?.data ?? null, p_lane: lane, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Impact request unavailable");
      throw error;
    }
  }

  app.get("/api/v1/impact", async (request) => {
    const selected = z.strictObject({ year: z.coerce.number().pipe(year).optional(), sector: sector.optional(),
      department: z.union([department, z.literal("national")]).optional() }).parse(request.query);
    if (!enabled) return { state: "disabled" };
    if (!repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Impact reporting unavailable");
    await budget("discovery", null, request.ip);
    try {
      return await repository.rpc("c24_impact_for_api", { p_year: selected.year ?? null,
        p_sector: selected.sector ?? null, p_department: selected.department ?? "national" });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Impact reporting unavailable");
      throw error;
    }
  });
  const founder = "/api/v1/admin/impact";
  const reviewers = "/api/v1/private/impact-review";
  const member = "/api/v1/me/impact";
  app.get(founder, (request) => execute(request, "founder", "overview",
    z.strictObject({ search: z.string().trim().min(2).max(60).optional() }).parse(request.query)));
  app.patch(founder, { bodyLimit: 12_288 }, (request) => {
    const { action, ...input } = founderCommand.parse(request.body);
    return execute(request, "founder", action, input);
  });
  app.get(reviewers, (request) => execute(request, "review", "overview"));
  app.patch(reviewers, { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = oversightCommand.parse(request.body);
    return execute(request, "review", action, input);
  });
  app.get(reviewers + "/mappings", async (request) => {
    const query = z.strictObject({ scope: department, id: z.uuid().optional() }).parse(request.query);
    const rows = await execute<ImpactMappingSummary[]>(request, "review", "mapping_queue", query);
    return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
  });
  app.get(reviewers + "/mappings/:id", (request) => execute(request, "review", "mapping_read", ids.parse(request.params)));
  app.patch(reviewers + "/mappings/:id", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = mappingReview.parse(request.body);
    return execute(request, "review", action, { ...ids.parse(request.params), ...input });
  });
  app.get(member + "/mappings/:id", (request) => execute(request, "member", "mapping_read", ids.parse(request.params)));
  app.patch(member + "/mappings/:id", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = mappingOwner.parse(request.body);
    return execute(request, "member", action, { ...ids.parse(request.params), ...input });
  });
  app.get(member + "/needs/:id", (request) => execute(request, "member", "need_read", ids.parse(request.params)));
  app.patch(member + "/needs/:id", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = z.strictObject({ ...receipt, action: z.enum(["allow_need", "withdraw_need"]) }).parse(request.body);
    return execute(request, "member", action, { ...ids.parse(request.params), ...input });
  });
}
