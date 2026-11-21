import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { OrganizationIntentReceipt, OrganizationOnboardingIntent } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import { ApiError } from "../services/api-error.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const base = "/api/v1/me/organization-onboarding";
const expectedVersion = z.number().int().min(0).max(2_147_483_647);
const command = z.strictObject({ expectedVersion, requestId: z.uuid() });
const save = command.extend({
  id: z.uuid().nullable(),
  stage: z.enum(["drafting", "awaiting_identity"]),
}).refine(({ id, expectedVersion }) => (id === null) === (expectedVersion === 0));

export function registerOrganizationOnboarding(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call<T>(request: FastifyRequest, rpc: string, input = {}) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Onboarding service unavailable");
    const session = await auth.verifySession(token);
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    try {
      return await repo.rpc<T>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, ...input,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Onboarding request could not be completed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Onboarding service unavailable");
    }
  }

  app.get(base, async (request) => ({
    intent: await call<OrganizationOnboardingIntent | null>(request, "organization_intent_for_api"),
  }));
  app.put(base, { bodyLimit: 1024 }, async (request) => {
    const input = save.parse(request.body);
    return call<OrganizationIntentReceipt>(request, "organization_intent_command_for_api", {
      p_id: input.id, p_action: "save", p_stage: input.stage,
      p_expected: input.expectedVersion, p_request: input.requestId,
    });
  });
  app.post(base + "/:id/change-path", { bodyLimit: 1024 }, async (request) => {
    const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const input = command.parse(request.body);
    return call<OrganizationIntentReceipt>(request, "organization_intent_command_for_api", {
      p_id: id, p_action: "cancel", p_stage: null, p_expected: input.expectedVersion, p_request: input.requestId,
    });
  });
}
