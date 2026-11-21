import type { FastifyInstance, FastifyRequest } from "fastify";
import { earlyPartnerFeatures, earlyPartnerFeedbackCategories } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const adminPath = "/api/v1/admin/early-partners";
const orgPath = "/api/v1/institutions/:id/early-partner";
const uuid = z.uuid();
const text = (min: number) => z.string().trim().min(min).max(500).refine((value) => !/\p{Cc}/u.test(value));
const command = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2_147_483_646),
  requestId: uuid,
  confirm: z.literal(true),
});
const nomination = command.extend({ action: z.literal("nominate"), programId: uuid, organizationId: uuid, reason: text(10) });
const adminCommand = z.discriminatedUnion("action", [
  nomination,
  command.extend({ action: z.enum(["offer", "reject_nomination", "suspend", "end", "expire", "revoke_feedback"]),
    enrollmentId: uuid, reason: text(10) }),
  command.extend({ action: z.literal("resolve"), enrollmentId: uuid, feedbackId: uuid, reason: text(10) }),
]);
const orgCommand = z.discriminatedUnion("action", [
  command.extend({ action: z.enum(["decline", "withdraw", "opt_in", "opt_out"]), enrollmentId: uuid }),
  command.extend({ action: z.literal("accept"), enrollmentId: uuid, termsVersion: z.number().int().positive().max(2_147_483_646),
    termsDigest: z.string().regex(/^[a-f0-9]{64}$/) }),
  command.extend({ action: z.literal("feedback"), enrollmentId: uuid, feature: z.enum(earlyPartnerFeatures),
    category: z.enum(earlyPartnerFeedbackCategories), description: text(10), steps: text(3).optional() }),
]);

export function registerEarlyPartners(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call(request: FastifyRequest, administrative: boolean, rpc: string, input: object, recent = administrative) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Early Partner service unavailable");
    const session = await auth.verifySession(token, recent);
    if (!session) {
      if (recent && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    }
    try {
      return await repo.rpc(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_admin: administrative, ...input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Early Partner request could not be completed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Early Partner service unavailable");
    }
  }

  function write(request: FastifyRequest, administrative: boolean, organization: string | null,
    input: z.infer<typeof adminCommand> | z.infer<typeof orgCommand>) {
    const { expectedVersion, requestId, action, ...payload } = input;
    const program = input.action === "nominate" ? input.programId : null;
    const enrollment = input.action === "nominate" ? null : input.enrollmentId;
    return call(request, administrative, "early_partner_command_for_api", {
      p_org: organization, p_program: program, p_id: enrollment, p_action: action, p_version: expectedVersion,
      p_request: requestId, p_input: Object.fromEntries(Object.entries(payload)
        .filter(([key]) => !["enrollmentId", "programId", "organizationId"].includes(key))),
    }, administrative || action === "accept" || action === "opt_in");
  }

  function organization(request: FastifyRequest) {
    return z.strictObject({ id: uuid }).parse(request.params).id;
  }

  app.get(adminPath, (request) => {
    const { programId } = z.strictObject({ programId: uuid.optional() }).parse(request.query);
    return call(request, true, "early_partner_read_for_api", { p_org: null, p_program: programId ?? null });
  });
  app.post(adminPath, { bodyLimit: 2048 }, (request) => {
    const input = adminCommand.parse(request.body);
    return write(request, true, input.action === "nominate" ? input.organizationId : null, input);
  });
  app.get(orgPath, (request) => call(request, false, "early_partner_read_for_api", {
    p_org: organization(request), p_program: null,
  }));
  app.post(orgPath, { bodyLimit: 2048 }, (request) => write(request, false, organization(request), orgCommand.parse(request.body)));
}
