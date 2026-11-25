import type { FastifyInstance, FastifyRequest } from "fastify";
import { needClarifications, needFindingSummaries, needReviewActions, needReviewLanes, type NeedReviewQueue } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";
import { needContent } from "./community-needs.js";

const id = z.strictObject({ id: z.uuid() });
const staffQuery = z.strictObject({ lane: z.enum(needReviewLanes) });
const version = z.number().int().min(0).max(2147483646);
const base = {
  requestId: z.uuid(), confirmed: z.literal(true),
  note: z.string().trim().min(5).max(1500).refine((text) => !/\p{Cc}/u.test(text)).optional(),
};
const memberCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("correct"), expectedRevision: version, expectedEvidenceRevision: version, content: needContent }),
  z.strictObject({ ...base, action: z.literal("challenge"), expectedRevision: version, findingId: z.uuid() }),
]);
const staffCommand = z.strictObject({
  ...base, action: z.enum(needReviewActions),
  expectedRevision: version, target: z.uuid().optional(), conflictFree: z.literal(true).optional(),
  summary: z.enum([...needClarifications, ...Object.values(needFindingSummaries).flat()]).optional(),
}).refine(({ action }) => !["correct", "challenge", "grant", "revoke"].includes(action));
const policyCommand = z.strictObject({
  ...base, action: z.enum(["grant", "revoke"]), target: z.uuid(), communityId: z.uuid(), role: z.enum(["triage", "review"]),
});

export type NeedRouteOptions = {
  enabled: boolean; auth: AuthVerifier | null; repo: InstitutionRepository | null; read: ReadBudget;
};

export async function needRequestContext(request: FastifyRequest, { auth, repo, read }: NeedRouteOptions, staff: boolean) {
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
  if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Review unavailable");
  const session = await auth.verifySession(token, staff);
  if (!session) {
    if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
    throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
  }
  const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
  if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
  await read(staff ? "audit" : "profile", session.actor, request.ip);
  return { session, workspace: workspace?.data ?? null, repo };
}

export function registerCommunityNeedsReview(app: FastifyInstance, options: NeedRouteOptions) {
  const member = "/api/v1/me/community-needs/:id/review";
  const staff = "/api/v1/private/community-needs-review";
  const { enabled } = options;
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
  });

  async function execute<T>(request: FastifyRequest, lane: string, caseId: string | null, command: object | null, after: string | null = null) {
    if (!enabled) throw new ApiError(404, "COMMUNITY_NEEDS_REVIEW_DISABLED", "Community needs review unavailable");
    const { session, workspace, repo } = await needRequestContext(request, options, lane !== "member" && lane !== "access");
    try {
      const result = await repo.rpc<T & { denied?: boolean }>("c12_needs_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
        p_totp: session.totpAt ?? null, p_workspace: workspace, p_lane: lane,
        p_id: caseId, p_command: command, p_after: after,
      });
      if (result.denied) throw new ApiError(403, "COMMUNITY_NEEDS_ASSIGNMENT_DENIED", "An eligible independent assignment is required");
      return result;
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Community needs review unavailable");
      throw error;
    }
  }

  app.get(staff + "/triage-access", (request) => execute(request, "access", null, null));
  app.get(member, (request) => execute(request, "member", id.parse(request.params).id, null));
  app.patch(member, { bodyLimit: 32_000 }, (request) =>
    execute(request, "member", id.parse(request.params).id, memberCommand.parse(request.body)));
  app.get(staff, async (request) => {
    const { lane, after } = staffQuery.extend({ after: z.uuid().optional() }).parse(request.query);
    const result = await execute<Omit<NeedReviewQueue, "nextCursor">>(request, lane, null, null, after ?? null);
    const cases = result.cases.slice(0, 20);
    return { ...result, cases, nextCursor: result.cases.length > cases.length ? cases.at(-1)!.id : null };
  });
  app.get(staff + "/:id", (request) => execute(request, staffQuery.parse(request.query).lane, id.parse(request.params).id, null));
  app.patch(staff + "/:id", { bodyLimit: 8192 }, (request) =>
    execute(request, staffQuery.parse(request.query).lane, id.parse(request.params).id, staffCommand.parse(request.body)));
  app.post(staff, { bodyLimit: 8192 }, (request) => execute(request, "admin", null, policyCommand.parse(request.body)));
}
