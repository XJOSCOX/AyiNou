import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const publicPolicy = z.strictObject({
  enabled: z.boolean(),
  mode: z.enum(["public", "invitation_only", "closed"]),
  individualEnabled: z.boolean(),
  organizationEnabled: z.boolean(),
  referralsEnabled: z.boolean(),
});
const savedPolicy = publicPolicy.extend({
  rewardsEnabled: z.literal(false), revision: z.number().int().positive(), updatedAt: z.iso.datetime({ offset: true }),
});
const invitation = z.strictObject({ id: z.uuid(), expiresAt: z.iso.datetime({ offset: true }) });
const receipt = {
  expectedRevision: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)),
  requestId: z.uuid(),
};
const command = z.strictObject({ ...receipt, action: z.literal("update"), value: publicPolicy });
const invite = z.strictObject({
  ...receipt, action: z.literal("invite"), email: z.email().max(254),
  pathway: z.enum(["individual", "organization"]), code: z.string().regex(/^[0-9a-f]{64}$/),
});
const admin = "/api/v1/admin/registration";

export function registerRegistrationPolicyRoutes(app: FastifyInstance, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  app.get("/api/v1/registration/policy", async (request) => {
    await read("discovery", null, request.ip);
    if (repo) {
      try { return publicPolicy.parse(await repo.rpc("registration_policy_for_api", {})); }
      catch { /* Policy reads fail closed. */ }
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Registration policy unavailable");
  });

  async function call(request: FastifyRequest, change?: z.infer<typeof command> | z.infer<typeof invite>) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Registration policy unavailable");
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    }
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    try {
      const access = await repo.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
      if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      const result = await repo.rpc<unknown>("founder_registration_policy_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, p_command: change ?? null,
      });
      return change?.action === "invite" ? invitation.parse(result) : savedPolicy.parse(result);
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Registration request failed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Registration policy unavailable");
    }
  }

  app.get(admin, (request) => call(request));
  app.patch(admin, { bodyLimit: 4096 }, (request) => call(request, command.parse(request.body)));
  app.post(admin + "/invitations", { bodyLimit: 4096 }, (request) => call(request, invite.parse(request.body)));
}
