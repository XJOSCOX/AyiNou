import type { FastifyInstance, FastifyRequest } from "fastify";
import { founderDecisions, founderIdentityBases, founderReviewActions, type FounderAppealItem, type FounderIdentityQueue, type FounderIdentityReceipt } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const member = "/api/v1/me/founder-identity";
const admin = "/api/v1/admin/founder-identity";
const appeals = "/api/v1/verification/founder-appeals";
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
  revision.extend({ action: z.literal("account_control") }),
  revision.extend({ action: z.enum(["withdraw", "correction"]) }),
]);
const standardReview = revision.extend({
  action: z.enum(founderReviewActions),
  reason: z.enum(founderDecisions),
  noConflict: z.literal(true).optional(),
}).refine(({ action, noConflict }) => (action === "grant" || action === "release") === (noConflict === true));
const review = z.union([standardReview, revision.extend({
  action: z.literal("attest"), basis: z.enum(founderIdentityBases), noConflict: z.literal(true),
})]);
const caseId = z.strictObject({ id: z.uuid() });
const appealDecision = z.strictObject({ action: z.enum(["uphold", "revoke"]), requestId: z.uuid(), noConflict: z.literal(true) });

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
        ...(rpc === "founder_identity_read_for_api" || rpc === "founder_identity_command_for_api"
          ? { p_admin: privileged } : {}), ...input,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Founder identity request could not be completed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Founder identity unavailable");
    }
  }

  async function staff<T>(request: FastifyRequest, action: string, input: {
    id?: string; username?: string; expected?: number; policy?: number; requestId?: string;
    reason?: string; noConflict?: true; basis?: string;
  } = {}) {
    const header = request.headers["x-ayinou-workspace"];
    if (header !== undefined || action === "attest") {
      const workspace = z.uuid().safeParse(header);
      if (!workspace.success) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
      const result = await call<T | null>(request, true, "founder_identity_workspace_for_api", {
        p_workspace: workspace.data, p_id: input.id ?? null, p_username: input.username ?? null, p_action: action,
        p_expected: input.expected ?? null, p_policy: input.policy ?? null, p_request: input.requestId ?? null,
        p_reason: input.reason ?? null, p_no_conflict: input.noConflict ?? null, p_basis: input.basis ?? null,
      });
      if (result === null) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
      return result;
    }
    return action === "read" ? call<T>(request, true, "founder_identity_read_for_api")
      : call<T>(request, true, "founder_identity_command_for_api", {
        p_id: input.id ?? null, p_username: input.username ?? null, p_action: action, p_expected: input.expected,
        p_policy: input.policy, p_request: input.requestId, p_reason: input.reason, p_disclose: null,
        p_no_conflict: input.noConflict ?? null,
      });
  }

  async function independentAppeal<T>(request: FastifyRequest, id: string | null,
    input?: z.infer<typeof appealDecision>) {
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    const data = await call<T | null>(request, true, "fv_founder_appeals_for_api", {
      p_workspace: workspace.data, p_id: id, p_action: input?.action ?? null,
      p_request: input?.requestId ?? null, p_no_conflict: input?.noConflict ?? null,
    });
    if (data === null) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    return data;
  }

  app.get(appeals, (request) => independentAppeal<FounderAppealItem[]>(request, null));
  app.post(appeals + "/:id", { bodyLimit: 512 }, (request) => independentAppeal<FounderIdentityReceipt>(request,
    caseId.parse(request.params).id, appealDecision.parse(request.body)));
  app.get(member, (request) => call<FounderIdentityQueue>(request, false, "founder_identity_read_for_api"));
  app.get(admin, (request) => staff<FounderIdentityQueue>(request, "read"));
  app.post(admin, { bodyLimit: 1024 }, (request) => {
    const input = open.parse(request.body);
    return staff<FounderIdentityReceipt>(request, "open", { ...input, expected: 0, policy: 1 });
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
    return staff<FounderIdentityReceipt>(request, input.action, {
      id, expected: input.expectedVersion, policy: input.policyVersion, requestId: input.requestId, noConflict: input.noConflict,
      ...(input.action === "attest" ? { basis: input.basis } : { reason: input.reason }),
    });
  });
}
