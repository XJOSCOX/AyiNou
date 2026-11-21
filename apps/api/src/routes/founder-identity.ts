import type { FastifyInstance, FastifyRequest } from "fastify";
import { founderDecisions, founderReviewActions, type FounderIdentityQueue, type FounderIdentityReceipt } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const member = "/api/v1/me/founder-identity";
const admin = "/api/v1/admin/founder-identity";
const revision = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
  policyVersion: z.literal(1),
  requestId: z.uuid(),
});
const username = z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/);
const open = z.strictObject({ username, requestId: z.uuid(), reason: z.literal("member_request") });
const memberAction = z.discriminatedUnion("action", [
  revision.extend({ action: z.literal("consent"), disclose: z.boolean(), supersession: z.strictObject({
    applicationId: z.uuid(), revision: z.number().int().min(1).max(2_147_483_647),
  }).optional() }),
  revision.extend({ action: z.literal("supersede"), applicationId: z.uuid(), revision: z.number().int().min(1).max(2_147_483_647) }),
  revision.extend({ action: z.literal("visibility"), disclose: z.boolean() }),
  revision.extend({ action: z.enum(["withdraw", "correction"]) }),
]);
const review = revision.extend({
  action: z.enum(founderReviewActions),
  reason: z.enum(founderDecisions),
  noConflict: z.literal(true).optional(),
}).refine(({ action, noConflict }) => (action === "grant" || action === "release") === (noConflict === true));
const caseId = z.strictObject({ id: z.uuid() });

export function registerFounderIdentity(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call<T>(request: FastifyRequest, privileged: boolean, rpc: string, input = {}) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Founder identity unavailable");
    const session = await auth.verifySession(token, privileged);
    if (!session) {
      if (privileged && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    }
    try {
      return await repo.rpc<T>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp_at: session.totpAt ?? null,
        ...(rpc.startsWith("founder_supersession_") ? {} : { p_admin: privileged }), ...input,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Founder identity request could not be completed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Founder identity unavailable");
    }
  }

  app.get(member, (request) => call<FounderIdentityQueue>(request, false, "founder_identity_read_for_api"));
  app.get(admin, (request) => call<FounderIdentityQueue>(request, true, "founder_identity_read_for_api"));
  app.post(admin, { bodyLimit: 1024 }, (request) => {
    const input = open.parse(request.body);
    return call<FounderIdentityReceipt>(request, true, "founder_identity_command_for_api", {
      p_id: null, p_username: input.username, p_action: "open", p_expected: 0, p_policy: 1,
      p_request: input.requestId, p_reason: input.reason, p_disclose: null, p_no_conflict: null,
    });
  });
  app.post(member + "/:id/actions", { bodyLimit: 1024 }, (request) => {
    const { id } = caseId.parse(request.params);
    const input = memberAction.parse(request.body);
    if (input.action === "supersede") {
      return call<FounderIdentityReceipt>(request, false, "founder_supersession_after_grant_for_api", {
        p_id: id, p_expected: input.expectedVersion, p_policy: input.policyVersion, p_request: input.requestId,
        p_application: input.applicationId, p_revision: input.revision,
      });
    }
    if (input.action === "consent" && input.supersession) {
      return call<FounderIdentityReceipt>(request, false, "founder_supersession_consent_for_api", {
        p_id: id, p_expected: input.expectedVersion, p_policy: input.policyVersion, p_request: input.requestId,
        p_disclose: input.disclose, p_application: input.supersession.applicationId, p_revision: input.supersession.revision,
      });
    }
    return call<FounderIdentityReceipt>(request, false, "founder_identity_command_for_api", {
      p_id: id, p_username: null, p_action: input.action, p_expected: input.expectedVersion, p_policy: input.policyVersion,
      p_request: input.requestId, p_reason: null, p_disclose: "disclose" in input ? input.disclose : null, p_no_conflict: null,
    });
  });
  app.post(admin + "/:id/actions", { bodyLimit: 1024 }, (request) => {
    const { id } = caseId.parse(request.params);
    const input = review.parse(request.body);
    return call<FounderIdentityReceipt>(request, true, "founder_identity_command_for_api", {
      p_id: id, p_username: null, p_action: input.action, p_expected: input.expectedVersion, p_policy: input.policyVersion,
      p_request: input.requestId, p_reason: input.reason, p_disclose: null, p_no_conflict: input.noConflict ?? null,
    });
  });
}
