import type { FastifyInstance, FastifyRequest } from "fastify";
import { outcomePublicationStatuses, type OutcomePublicationSummary, type PublicOutcomeResult } from "@ayinou/shared";
import { z } from "zod";
import { text } from "../modules/projects/request.js";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const path = "/api/v1/private/project-outcome-publication";
const staffLane = z.enum(["admin", "review"]);
const scope = z.string().regex(/^HT-[A-Z]{2}$/);
const version = z.number().int().min(0).max(2147483646);
const id = z.strictObject({ id: z.uuid() });
const memberIds = z.strictObject({ project: z.uuid(), caseId: z.uuid() });
const staffQuery = z.strictObject({ lane: staffLane });
const expiresAt = z.iso.datetime({ offset: true });
const bounded = (max: number, min = 3) => text(max).refine((value) => value.length >= min);
const base = { requestId: z.uuid(), expectedVersion: version, note: bounded(1200), confirmed: z.literal(true) };
const memberCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("draft"), findingId: z.uuid(), content: z.strictObject({
    title: bounded(120), summary: bounded(1000, 5), limitations: bounded(700), includeReported: z.boolean(),
  }) }),
  z.strictObject({ ...base, action: z.literal("submit"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ ...base, action: z.enum(["withdraw", "appeal"]) }),
]);
const staffCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("assign"), target: z.uuid(), expiresAt }),
  z.strictObject({ ...base, action: z.literal("accept"), conflictFree: z.literal(true) }),
  z.strictObject({ ...base, action: z.literal("approve"), faithful: z.literal(true) }),
  z.strictObject({ ...base, action: z.enum(["release", "recuse", "inspect", "changes", "reject", "invalidate"]) }),
]);
const grant = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("grant"), target: z.uuid(), department: scope, expiresAt }),
  z.strictObject({ ...base, action: z.literal("revoke"), target: z.uuid(), department: scope }),
]);

export function registerProjectOutcomePublication(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, feed: FeedRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
    });

  async function execute<T>(request: FastifyRequest, lane: "admin" | "review" | "member", action: string, input: object = {}) {
    if (!enabled) throw new ApiError(404, "PROJECT_OUTCOME_PUBLICATION_DISABLED", "Outcome publication unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Outcome publication unavailable");
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
      return await repo.rpc<T>("c23_publication_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace?.data ?? null, p_lane: lane, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Outcome publication unavailable");
      throw error;
    }
  }

  app.get("/api/v1/projects/:project/validated-results", async (request) => {
    const { project } = z.strictObject({ project: z.uuid() }).parse(request.params);
    if (!enabled) return [];
    if (!feed) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Validated results unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1] ?? null;
    const actor = token ? await auth?.verify(token) : null;
    if (token && !actor) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    await read("profile", actor ?? null, request.ip);
    return feed.rpc<PublicOutcomeResult[]>(token, "c23_public_results_for_client", { p_project: project });
  });
  app.get(path + "/availability", (request) => execute<boolean>(request, "member", "availability"));
  app.post(path + "/workspace", { bodyLimit: 512 }, (request) =>
    execute(request, staffQuery.parse(request.body).lane, "open"));
  app.get(path, async (request) => {
    const { lane, ...input } = staffQuery.extend({ department: scope, status: z.enum(outcomePublicationStatuses).optional(),
      after: z.uuid().optional() }).parse(request.query);
    const rows = await execute<OutcomePublicationSummary[]>(request, lane, "queue", input);
    const items = rows.slice(0, 20);
    return { items, nextCursor: rows.length > 20 ? items.at(-1)?.id : null };
  });
  app.get(path + "/roster", (request) => execute(request, "admin", "roster",
    z.strictObject({ department: scope, search: bounded(60, 2).optional() }).parse(request.query)));
  app.post(path + "/roster", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = grant.parse(request.body);
    return execute(request, "admin", action, input);
  });
  app.get(path + "/:id", (request) =>
    execute(request, staffQuery.parse(request.query).lane, "read", id.parse(request.params)));
  app.patch(path + "/:id", { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = staffCommand.parse(request.body);
    return execute(request, staffQuery.parse(request.query).lane, action, { ...id.parse(request.params), ...input });
  });

  const member = "/api/v1/projects/:project/outcome-validation/:caseId/publication";
  app.get(member, (request) => execute(request, "member", "read", memberIds.parse(request.params)));
  app.patch(member, { bodyLimit: 8192 }, (request) => {
    const { action, ...input } = memberCommand.parse(request.body);
    return execute(request, "member", action, { ...memberIds.parse(request.params), ...input });
  });
}
