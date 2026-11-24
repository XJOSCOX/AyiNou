import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { accountEnforcementCategories, featureCapabilities, ordinaryModerationCapabilities, suspensionMinutes } from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import type { InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const policy = z.strictObject({
  suspensionPresets: z.array(z.number().refine((value) => suspensionMinutes.some((preset) => preset === value))).max(6),
  administratorMaxMinutes: z.number().int().min(1).max(129600),
  moderatorMaxMinutes: z.number().int().min(1).max(10080),
  defaultMinutes: z.number().int().min(1).max(10080),
  delegableCapabilities: z.array(z.enum(featureCapabilities)).max(featureCapabilities.length),
  reasonCategories: z.array(z.enum(accountEnforcementCategories)).min(1).max(accountEnforcementCategories.length),
  repeatViolationGuidance: z.string().trim().max(500).refine((text) => !/\p{Cc}/u.test(text)),
  notifyStaffGuidance: z.boolean(),
}).refine((value) => value.defaultMinutes <= Math.min(value.administratorMaxMinutes, value.moderatorMaxMinutes)
  && (!value.notifyStaffGuidance || value.repeatViolationGuidance.length > 0)
  && value.delegableCapabilities.every((item) => ordinaryModerationCapabilities.includes(item))
  && [value.suspensionPresets, value.delegableCapabilities, value.reasonCategories]
    .every((list) => new Set<number | string>(list).size === list.length));

const revision = z.number().int().min(1).max(2147483646);
const receipt = {
  expectedRevision: revision, requestId: z.uuid(), confirmed: z.literal(true),
  reason: z.string().trim().min(10).max(500).refine((text) => !/\p{Cc}/u.test(text)),
};
const command = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("update"), value: policy }),
  z.strictObject({ ...receipt, action: z.literal("restore"), restoreRevision: revision }),
]);

export function registerModerationPolicyRoutes(app: FastifyInstance, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
  });
  async function binding(request: FastifyRequest) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Moderation policy unavailable");
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await read("audit", session.actor, request.ip);
    return { p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
      p_totp: session.totpAt ?? null, p_workspace: workspace.data };
  }

  const path = "/api/v1/admin/moderation-policy";
  app.get(path, async (request) => {
    const { before } = z.strictObject({ before: z.coerce.number().pipe(revision).optional() }).parse(request.query);
    const args = await binding(request);
    return repo!.rpc("m25_policy_for_api", { ...args, p_command: null, p_before: before ?? null });
  });
  app.patch(path, { bodyLimit: 8192 }, async (request) => {
    const args = await binding(request);
    return repo!.rpc("m25_policy_for_api", { ...args, p_command: command.parse(request.body), p_before: null });
  });
  app.get("/api/v1/moderation/action-policy", async (request) => {
    const args = await binding(request);
    return repo!.rpc("m25_action_policy_for_api", args);
  });
}
