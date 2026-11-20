import { privacyRequestKinds, type PrivacyRequestPage } from "@ayinou/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import type { PrivacyRepository } from "../services/privacy.js";
import type { ReadBudget } from "../services/read-budget.js";

const collection = "/api/v1/me/privacy-requests";
const caseId = z.strictObject({ id: z.uuid() });
const pagination = z.strictObject({ after: z.uuid().optional() });
const creation = z.strictObject({ kind: z.enum(privacyRequestKinds) });
const withdrawal = z.strictObject({ version: z.number().int().min(1).max(2) });
const idempotencyKey = z.uuid().transform((value) => value.toLowerCase());

export function registerPrivacyRoutes(app: FastifyInstance, enabled: boolean, auth: AuthVerifier | null,
  repo: PrivacyRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!enabled) throw new ApiError(404, "PRIVACY_DISABLED", "Privacy requests unavailable");
  });

  async function requireSession(request: FastifyRequest, review = false) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Privacy request service unavailable");
    const identity = await auth.verifySession(token);
    if (!identity) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    await budget("profile", identity.actor, request.ip);
    if (review && !(await auth.verifySession(token, true))) {
      throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    }
    return { identity, repository: repo };
  }

  app.get(collection, async (request): Promise<PrivacyRequestPage> => {
    const { identity, repository } = await requireSession(request);
    const { after } = pagination.parse(request.query);
    const rows = await repository.list(identity, after);
    const cases = rows.slice(0, 20);
    return { cases, nextCursor: rows.length > 20 ? cases[19].id : null };
  });

  app.get(collection + "/:id", async (request) => {
    const { identity, repository } = await requireSession(request);
    return repository.detail(identity, caseId.parse(request.params).id);
  });

  app.post(collection, { bodyLimit: 512 }, async (request, reply) => {
    const { identity, repository } = await requireSession(request);
    const key = idempotencyKey.parse(request.headers["idempotency-key"]);
    const { kind } = creation.parse(request.body);
    const receipt = await repository.command(identity, { operation: "create", kind }, key, request.id);
    return reply.code(201).send(receipt);
  });

  app.post(collection + "/:id/withdraw", { bodyLimit: 512 }, async (request) => {
    const { identity, repository } = await requireSession(request);
    const key = idempotencyKey.parse(request.headers["idempotency-key"]);
    const { version } = withdrawal.parse(request.body);
    return repository.command(identity, { operation: "withdraw", id: caseId.parse(request.params).id, version }, key, request.id);
  });

  // There is no approved staff mandate or assignment workflow. Even a freshly verified
  // platform administrator cannot access a queue, inspect a case, or issue a review command.
  app.route({
    method: ["GET", "POST", "PATCH"],
    url: "/api/v1/admin/privacy-requests/*",
    bodyLimit: 512,
    async handler(request) {
      await requireSession(request, true);
      throw new ApiError(403, "PRIVACY_REVIEW_UNAVAILABLE", "Privacy review unavailable");
    },
  });
}
