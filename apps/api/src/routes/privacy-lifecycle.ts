import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import type { LifecycleRead } from "../services/privacy-lifecycle.js";
import type { ReadBudget } from "../services/read-budget.js";

const path = "/api/v1/me/privacy-requests/:id";
const requestId = z.strictObject({ id: z.uuid() });
const noQuery = z.strictObject({});
const version = z.number().int().positive().max(2_147_483_647);
const key = z.uuid().transform((value) => value.toLowerCase());

export function registerPrivacyLifecycleRoutes(app: FastifyInstance, service: LifecycleRead | null,
  auth: AuthVerifier | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!service) throw new ApiError(404, "LIFECYCLE_DISABLED", "Deletion planning unavailable");
  });

  async function subject(request: FastifyRequest, sensitive = false) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    if (!auth?.verifySession) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Deletion planning service unavailable");
    const identity = await auth.verifySession(token);
    if (!identity) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    await budget("profile", identity.actor, request.ip);
    noQuery.parse(request.query);
    if (!sensitive) return identity;
    const proof = await auth.verifySession(token, true);
    if (!proof) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    return proof;
  }

  app.get(path + "/deletion-preview", async (request) =>
    service!(await subject(request), requestId.parse(request.params).id, { action: "preview" }));
  app.get(path + "/deletion-status", async (request) =>
    service!(await subject(request), requestId.parse(request.params).id, { action: "status" }));
  app.post(path + "/deletion-plan", { bodyLimit: 512 }, async (request) => {
    const actor = await subject(request, true);
    return service!(actor, requestId.parse(request.params).id, {
      action: "plan", ...z.strictObject({ caseVersion: version }).parse(request.body),
      key: key.parse(request.headers["idempotency-key"]),
    });
  });
  app.post(path + "/deletion-confirmation", { bodyLimit: 512 }, async (request) => {
    const actor = await subject(request, true);
    return service!(actor, requestId.parse(request.params).id, {
      action: "confirm", ...z.strictObject({ caseVersion: version, planVersion: version }).parse(request.body),
      key: key.parse(request.headers["idempotency-key"]),
    });
  });
}
