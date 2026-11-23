import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const route = "/api/v1/admin/homepage/community-statistics";
const command = z.strictObject({
  enabled: z.boolean(),
  expectedRevision: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)),
  requestId: z.uuid(),
});
const setting = z.object({
  key: z.literal("homepage.community_statistics.enabled"),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();

export function registerHomepagePolicyRoutes(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call(request: FastifyRequest, update?: z.infer<typeof command>) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Homepage policy unavailable");
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
      const result = await repo.rpc<unknown>("founder_homepage_policy_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, p_enabled: update?.enabled ?? null, p_expected: update?.expectedRevision ?? null,
        p_reason: update?.reason ?? null, p_request: update?.requestId ?? null,
      });
      return setting.parse(result);
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Homepage setting request failed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Homepage policy unavailable");
    }
  }

  app.get(route, (request) => call(request));
  app.patch(route, { bodyLimit: 4096 }, (request) => call(request, command.parse(request.body)));
}
