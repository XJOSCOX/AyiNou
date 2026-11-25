import type { FastifyInstance, FastifyRequest } from "fastify";
import { outcomeClassifications, outcomeSourceKinds, type OutcomeRequest, type OutcomeSource, type OutcomeSummary } from "@ayinou/shared";
import { z } from "zod";
import { text } from "../modules/projects/request.js";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const path = "/api/v1/projects/:project/outcome-validation";
const project = z.strictObject({ project: z.uuid() });
const detail = project.extend({ id: z.uuid() });
const sourceKind = z.enum(outcomeSourceKinds);
const cursor = z.strictObject({ after: z.uuid().optional() });
const note = { classification: z.enum(outcomeClassifications), explanation: text(800).refine((value) => value.length >= 3) };
const revision = z.number().int().min(1).max(2147483646);
const create = z.strictObject({
  sourceKind, sourceId: z.uuid(), sourceRevision: revision, sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/), ...note,
});
const update = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("edit"), expectedRevision: revision, ...note }),
  z.strictObject({ action: z.literal("submit"), expectedRevision: revision, confirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("withdraw"), expectedRevision: revision, confirmed: z.literal(true) }),
]);
const unwrapPage = <T extends { id: string }>(rows: T[]) => ({
  items: rows.slice(0, 30),
  nextCursor: rows.length > 30 ? rows[29].id : null,
});

export function registerProjectOutcomes(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
    if (!enabled) throw new ApiError(404, "PROJECT_OUTCOMES_DISABLED", "Independent outcome validation is unavailable");
  });

  async function execute<T>(request: FastifyRequest, projectId: string, action: string, input: Record<string, unknown>) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Outcome validation unavailable");
    const session = await auth.verifySession(token);
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (await auth.memberFeatureAccess?.(token) === false) {
      throw new ApiError(403, "ONBOARDING_REQUIRED", "Complete member onboarding first");
    }
    await read("profile", session.actor, request.ip);
    try {
      return await repo.rpc<T>("c21_outcomes_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
        p_project: projectId, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) {
        throw new ApiError(error.statusCode, error.code, "Outcome validation request could not be processed");
      }
      throw error;
    }
  }

  app.get(path, async (request) => unwrapPage(await execute<OutcomeSummary[]>(request, project.parse(request.params).project,
    "list", cursor.parse(request.query))));
  app.get(path + "/sources", async (request) => unwrapPage(await execute<OutcomeSource[]>(request, project.parse(request.params).project,
    "sources", cursor.extend({ sourceKind }).parse(request.query))));
  app.get(path + "/:id", async (request) => {
    const { project, id } = detail.parse(request.params);
    return execute<OutcomeRequest>(request, project, "read", { id });
  });
  app.post(path, { bodyLimit: 4096 }, async (request, reply) => {
    const input = create.parse(request.body);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const result = await execute<OutcomeRequest>(request, project.parse(request.params).project, "create", { ...input, key });
    return reply.code(201).send(result);
  });
  app.patch(path + "/:id", { bodyLimit: 4096 }, async (request) => {
    const { project, id } = detail.parse(request.params);
    const { action, ...input } = update.parse(request.body);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    return execute<OutcomeRequest>(request, project, action, { ...input, id, key });
  });
}
