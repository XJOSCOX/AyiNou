import type { FastifyInstance, FastifyRequest } from "fastify";
import { outcomeFindings, outcomeReviewerPurposes, outcomeReviewStatuses, type OutcomeReviewSummary } from "@ayinou/shared";
import { z } from "zod";
import { text } from "../modules/projects/request.js";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const path = "/api/v1/private/project-outcome-review";
const staffLane = z.enum(["admin", "review"]);
const scope = z.string().regex(/^HT-[A-Z]{2}$/);
const version = z.number().int().min(0).max(2147483646);
const id = z.strictObject({ caseId: z.uuid() });
const memberIds = id.extend({ project: z.uuid() });
const staffQuery = z.strictObject({ lane: staffLane });
const expiresAt = z.iso.datetime({ offset: true });
const bounded = (max: number, min = 3) => text(max).refine((value) => value.length >= min);
const base = { requestId: z.uuid(), expectedVersion: version, note: bounded(1200), confirmed: z.literal(true) };
const evidence = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("reference"), sourceId: z.uuid(), revision: version, reference: bounded(300, 1) }),
  z.strictObject({ kind: z.literal("image"), sourceId: z.uuid(), revision: version, digest: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
const memberCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.enum(["release_evidence", "revoke_evidence"]) }),
  z.strictObject({ ...base, action: z.literal("correct"), manifest: z.array(evidence).max(30) }),
  z.strictObject({ ...base, action: z.literal("challenge"), findingId: z.uuid() }),
]);
const staffCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("assign"), target: z.uuid(), expiresAt }),
  z.strictObject({ ...base, action: z.literal("accept"), conflictFree: z.literal(true) }),
  z.strictObject({ ...base, action: z.enum(["recuse", "release_assignment", "clarify", "uphold", "return"]) }),
  z.strictObject({ ...base, action: z.enum(["finding", "revise"]), classification: z.enum(outcomeFindings),
    limitations: bounded(1000), measurement: z.strictObject({ quantity: z.number().min(0).max(100_000_000),
      unit: bounded(48, 1), startsOn: z.iso.date(), endsOn: z.iso.date(), methodology: bounded(1000, 5) }).nullable() }),
]);
const grant = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("grant"), target: z.uuid(), department: scope,
    purpose: z.enum(outcomeReviewerPurposes), expiresAt }),
  z.strictObject({ ...base, action: z.enum(["suspend", "revoke"]), target: z.uuid(), department: scope,
    purpose: z.enum(outcomeReviewerPurposes) }),
]);

export function registerProjectOutcomeReview(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
    if (!enabled) throw new ApiError(404, "PROJECT_OUTCOME_REVIEW_DISABLED", "Outcome review unavailable");
  });

  async function execute<T>(request: FastifyRequest, lane: "admin" | "review" | "member", action: string, input: object = {}) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Outcome review unavailable");
    const staff = lane !== "member";
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    if (await auth.memberFeatureAccess?.(token) === false) {
      throw new ApiError(403, "ONBOARDING_REQUIRED", "Complete member onboarding first");
    }
    const workspace = staff && action !== "open" ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private review workspace required");
    await read(staff ? "audit" : "profile", session.actor, request.ip);
    try {
      return await repo.rpc<T>("c22_reviews_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace?.data ?? null, p_lane: lane, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Outcome review unavailable");
      throw error;
    }
  }

  app.get(path + "/notices", (request) => execute(request, "member", "notices"));
  app.post(path + "/workspace", { bodyLimit: 512 }, (request) =>
    execute(request, staffQuery.parse(request.body).lane, "open"));
  app.get(path, async (request) => {
    const { lane, ...input } = staffQuery.extend({ department: scope, status: z.enum(outcomeReviewStatuses).optional(),
      after: z.uuid().optional() }).parse(request.query);
    const rows = await execute<OutcomeReviewSummary[]>(request, lane, "queue", input);
    const items = rows.slice(0, 20);
    return { items, nextCursor: rows.length > 20 ? items.at(-1)?.id : null };
  });
  app.get(path + "/roster", (request) => execute(request, "admin", "roster",
    z.strictObject({ department: scope, after: z.uuid().optional(), search: bounded(60, 2).optional() }).parse(request.query)));
  app.post(path + "/roster", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = grant.parse(request.body);
    return execute(request, "admin", action, input);
  });
  app.get(path + "/:caseId", (request) =>
    execute(request, staffQuery.parse(request.query).lane, "read", id.parse(request.params)));
  app.patch(path + "/:caseId", { bodyLimit: 8192 }, (request) => {
    const { action, ...input } = staffCommand.parse(request.body);
    return execute(request, staffQuery.parse(request.query).lane, action, { ...id.parse(request.params), ...input });
  });
  app.get(path + "/:caseId/evidence", (request) => execute(request, "review", "evidence", {
    ...id.parse(request.params), ...z.strictObject({ expectedVersion: z.coerce.number().int().positive() }).parse(request.query),
  }));
  app.get(path + "/:caseId/evidence/:entry/image", async (request, reply) => {
    const input = id.extend({ entry: z.uuid() }).parse(request.params);
    const query = z.strictObject({ sourceRevision: z.coerce.number().int().positive(),
      expectedVersion: z.coerce.number().int().positive() }).parse(request.query);
    const { bytes } = await execute<{ bytes: string }>(request, "review", "image", { ...input, ...query });
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(Buffer.from(bytes, "base64"));
  });

  const member = "/api/v1/projects/:project/outcome-validation/:caseId/review";
  app.get(member, (request) => execute(request, "member", "read", memberIds.parse(request.params)));
  app.patch(member, { bodyLimit: 16_384 }, (request) => {
    const { action, ...input } = memberCommand.parse(request.body);
    return execute(request, "member", action, { ...memberIds.parse(request.params), ...input });
  });
}
