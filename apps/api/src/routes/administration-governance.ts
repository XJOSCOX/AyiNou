import type { FastifyInstance, FastifyRequest } from "fastify";
import { governanceProposalKinds, organizationRegistrationStatuses, type CorrectionPreview, type CorrectionQueue,
  type GovernanceProposal, type GovernanceStatus } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { organizationSetupDraft } from "./organization-onboarding.js";

const member = "/api/v1/me/onboarding-corrections";
const work = "/api/v1/admin/organization-onboarding";
const governance = "/api/v1/admin/governance";
const invitations = "/api/v1/me/governance-invitations";
const params = z.strictObject({ id: z.uuid() });
const revision = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2_147_483_646),
  requestId: z.uuid(),
  confirm: z.literal(true),
});
const reason = z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value));
const correction = z.discriminatedUnion("kind", [
  revision.extend({ intentId: z.uuid(), kind: z.enum(["cancel", "restart", "claim_triage"]) }),
  revision.extend({ intentId: z.uuid(), kind: z.literal("registration"), change: z.enum(organizationRegistrationStatuses) }),
  revision.extend({ intentId: z.uuid(), kind: z.literal("details"), change: organizationSetupDraft.refine(({ mode }) => mode === "new") }),
]);
const administration = revision.extend({ action: z.enum(["assign", "apply"]), reason });
const propose = revision.extend({ kind: z.enum(governanceProposalKinds), target: z.uuid().nullable(), reason });
const decision = z.discriminatedUnion("action", [
  revision.extend({ action: z.literal("approve"), reason, noConflict: z.literal(true) }),
  revision.extend({ action: z.enum(["withdraw", "execute"]), reason }),
]);
const hold = z.discriminatedUnion("action", [
  revision.extend({ action: z.literal("place"), expectedVersion: z.literal(0), reason, noConflict: z.literal(true), reportId: z.uuid() }),
  revision.extend({ action: z.literal("release"), expectedVersion: z.literal(1), reason, noConflict: z.literal(true) }),
]);

export function registerAdministrationGovernance(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call<T>(request: FastifyRequest, rpc: string, input = {}, recent = false) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Administration service unavailable");
    const session = await auth.verifySession(token, recent);
    if (!session) {
      if (recent && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    }
    try {
      return await repo.rpc<T>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null, ...input,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Administration request could not be completed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Administration service unavailable");
    }
  }

  function command(request: FastifyRequest, rpc: string, id: string | null, action: string, version: number,
    key: string, payload: Record<string, unknown>, recent = false) {
    return call(request, rpc, {
      p_id: id, p_action: action, p_version: version, p_request: key, p_input: payload,
    }, recent);
  }

  const correctionRpc = "o5_correction_command_for_api";
  const proposalRpc = "o5_proposal_command_for_api";
  app.get(member, (request) => call<CorrectionQueue>(request, "o5_corrections_read_for_api", { p_admin: false, p_id: null }));
  app.post(member, { bodyLimit: 4608 }, (request) => {
    const { intentId, expectedVersion, requestId, ...input } = correction.parse(request.body);
    return command(request, correctionRpc, intentId, "request", expectedVersion, requestId, input);
  });
  app.post(member + "/:id/withdraw", { bodyLimit: 512 }, (request) => {
    const { id } = params.parse(request.params);
    const { expectedVersion, requestId, ...input } = revision.parse(request.body);
    return command(request, correctionRpc, id, "withdraw", expectedVersion, requestId, input);
  });
  app.get(work + "/corrections", (request) =>
    call<CorrectionQueue>(request, "o5_corrections_read_for_api", { p_admin: true, p_id: null }, true));
  app.get(work + "/:id/correction-preview", (request) => call<CorrectionPreview>(request, "o5_corrections_read_for_api",
    { p_admin: true, p_id: params.parse(request.params).id }, true));
  app.post(work + "/:id/corrections", { bodyLimit: 1536 }, (request) => {
    const { id } = params.parse(request.params);
    const { action, expectedVersion, requestId, ...input } = administration.parse(request.body);
    return command(request, correctionRpc, id, action, expectedVersion, requestId, input, true);
  });

  app.get(governance, (request) => call<GovernanceStatus>(request, "o5_governance_read_for_api", { p_admin: true }, true));
  app.post(governance + "/proposals", { bodyLimit: 1536 }, (request) => {
    const { expectedVersion, requestId, ...input } = propose.parse(request.body);
    return command(request, proposalRpc, null, "propose", expectedVersion, requestId, input, true);
  });
  app.post(governance + "/proposals/:id/actions", { bodyLimit: 1536 }, (request) => {
    const { id } = params.parse(request.params);
    const { action, expectedVersion, requestId, ...input } = decision.parse(request.body);
    return command(request, proposalRpc, id, action, expectedVersion, requestId, input, true);
  });
  app.post(governance + "/claim-holds/:id", { bodyLimit: 1536 }, (request) => {
    const { id } = params.parse(request.params);
    const { action, expectedVersion, requestId, ...input } = hold.parse(request.body);
    return command(request, "o5_claim_hold_for_api", id, action, expectedVersion, requestId, input, true);
  });
  app.get(invitations, (request) =>
    call<{ proposals: GovernanceProposal[] }>(request, "o5_governance_read_for_api", { p_admin: false }));
  app.post(invitations + "/:id/accept", { bodyLimit: 512 }, (request) => {
    const { id } = params.parse(request.params);
    const { expectedVersion, requestId, ...input } = revision.parse(request.body);
    return command(request, proposalRpc, id, "accept", expectedVersion, requestId, input, true);
  });
}
