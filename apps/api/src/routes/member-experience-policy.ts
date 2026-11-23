import type { FastifyInstance, FastifyRequest } from "fastify";
import { memberExperienceFlags, type SavedMemberExperiencePolicy } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const policy = z.strictObject(Object.fromEntries(memberExperienceFlags.map((key) => [key, z.boolean()])));
const update = z.strictObject({
  value: policy, expectedRevision: z.number().int().min(1).max(2_147_483_647), requestId: z.uuid(),
  reason: z.string().trim().min(10).max(500).refine((reason) => !/\p{Cc}/u.test(reason)),
});
const path = "/api/v1/admin/member-experience";

export function registerMemberExperiencePolicy(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function access(request: FastifyRequest, command?: z.infer<typeof update>): Promise<SavedMemberExperiencePolicy> {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (!token || !workspace.success) throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Member policy unavailable");
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw new ApiError(404, "NOT_FOUND", "Resource unavailable");
    }
    try {
      const result = await repo.rpc<SavedMemberExperiencePolicy | null>("founder_member_experience_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, p_value: command?.value ?? null, p_expected: command?.expectedRevision ?? null,
        p_reason: command?.reason ?? null, p_request: command?.requestId ?? null,
      });
      if (!result) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Member policy unavailable");
      return result;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError) throw new ApiError(cause.statusCode, cause.code, "Member policy request failed");
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Member policy unavailable");
    }
  }

  app.get(path, (request) => access(request));
  app.patch(path, { bodyLimit: 4096 }, (request) => access(request, update.parse(request.body)));
}
