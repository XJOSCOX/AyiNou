import type { FastifyInstance, FastifyRequest } from "fastify";
import { recognitionIcons, verificationPolicyFlags } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const revision = z.number().int().min(1).max(2_147_483_647);
const audit = {
  requestId: z.uuid(),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)),
};
const update = z.strictObject({
  value: z.strictObject(Object.fromEntries(verificationPolicyFlags.map((flag) => [flag, z.boolean()]))),
  expectedRevision: revision,
  ...audit,
});
const text = (max: number) => {
  const value = z.string().trim().min(2).max(max).refine((item) => !/\p{Cc}/u.test(item));
  return z.strictObject({ en: value, fr: value, ht: value, es: value });
};
const metadata = { name: text(64), description: text(300), icon: z.enum(recognitionIcons),
  color: z.string().regex(/^#[a-f0-9]{6}$/i).nullable(), awardsEnabled: z.boolean(), publicEnabled: z.boolean() };
const badge = { badgeId: z.uuid(), expectedRevision: revision };
const recognition = z.strictObject({
  ...audit,
  command: z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("create"), ...metadata }),
    z.strictObject({ action: z.literal("edit"), ...badge, ...metadata }),
    z.strictObject({ action: z.literal("archive"), ...badge }),
    z.strictObject({ action: z.literal("reactivate"), ...badge }),
    z.strictObject({ action: z.literal("award"), ...badge, username: z.string().regex(/^[a-z][a-z0-9_]{2,23}$/i) }),
    z.strictObject({ action: z.literal("revoke"), awardId: z.uuid() }),
  ]),
});

export function registerVerificationPolicy(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  async function run(request: FastifyRequest, rpc: string, command: Record<string, unknown> = {}) {
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!workspace.success || !token) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Verification settings unavailable");
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    }
    try {
      const result = await repo.rpc<unknown>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, ...command,
      });
      if (result === null) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Verification settings unavailable");
      return result;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Verification settings request failed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Verification settings unavailable");
    }
  }
  const policyPath = "/api/v1/admin/verification-policy";
  app.get(policyPath, (request) => run(request, "founder_verification_policy_for_api",
    { p_value: null, p_expected: null, p_request: null, p_reason: null }));
  app.patch(policyPath, { bodyLimit: 4096 }, (request) => {
    const change = update.parse(request.body);
    return run(request, "founder_verification_policy_for_api", {
      p_value: change.value, p_expected: change.expectedRevision, p_request: change.requestId, p_reason: change.reason,
    });
  });
  app.get("/api/v1/admin/role-assignments", (request) => run(request, "r25_roles_for_api"));
  const awardsPath = "/api/v1/admin/recognition";
  app.get(awardsPath, (request) => run(request, "r25_recognition_for_api",
    { p_command: null, p_request: null, p_reason: null }));
  app.post(awardsPath, { bodyLimit: 8192 }, (request) => {
    const change = recognition.parse(request.body);
    return run(request, "r25_recognition_for_api", {
      p_command: change.command, p_request: change.requestId, p_reason: change.reason,
    });
  });
}
