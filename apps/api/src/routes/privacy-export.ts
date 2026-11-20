import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PrivacyExportService } from "../services/privacy-export.js";
import type { ReadBudget } from "../services/read-budget.js";
import type { AuthVerifier } from "../services/auth.js";
import { ApiError } from "../services/api-error.js";

const generate = "/api/v1/me/privacy-requests/:id/export";
const artifacts = "/api/v1/me/privacy-exports";
const id = z.strictObject({ id: z.uuid() });
const empty = z.strictObject({});
const input = z.strictObject({ version: z.number().int().min(1).max(2) });
const key = z.uuid().transform((value) => value.toLowerCase());

export function registerPrivacyExportRoutes(app: FastifyInstance, service: PrivacyExportService | null,
  auth: AuthVerifier | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!service) throw new ApiError(404, "PRIVACY_EXPORT_DISABLED", "Privacy export unavailable");
  });

  async function subject(request: FastifyRequest, sensitive = false) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    if (!auth?.verifySession) throw new ApiError(503, "EXPORT_RETRY", "Export temporarily unavailable");
    const identity = await auth.verifySession(token);
    if (!identity) throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
    await budget("profile", identity.actor, request.ip);
    empty.parse(request.query);
    if (!sensitive) return identity;
    const steppedUp = await auth.verifySession(token, true);
    if (!steppedUp) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
    return steppedUp;
  }

  app.get(artifacts + "/availability", async (request) => service!.availability(await subject(request)));
  app.get(generate, async (request) => service!.status(await subject(request), { p_case: id.parse(request.params).id }));
  app.get(artifacts + "/:id", async (request) => service!.status(await subject(request), { p_id: id.parse(request.params).id }));
  app.post(generate, { bodyLimit: 512 }, async (request, reply) => {
    const identity = await subject(request, true);
    const result = await service!.generate(identity, id.parse(request.params).id,
      input.parse(request.body).version, key.parse(request.headers["idempotency-key"]));
    return reply.code(result.state === "generating" ? 202 : 200).send(result);
  });
  app.get(artifacts + "/:id/download", { exposeHeadRoute: false }, async (request, reply) => {
    const data = await service!.download(await subject(request, true), id.parse(request.params).id);
    reply.raw.once("close", () => data.fill(0));
    return reply.header("Content-Disposition", 'attachment; filename="ayinou-synthetic-export.json"')
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Referrer-Policy", "no-referrer").type("application/json; charset=utf-8").send(data);
  });
  app.post(artifacts + "/:id/revoke", { bodyLimit: 512 }, async (request) => {
    const identity = await subject(request, true);
    empty.parse(request.body);
    return service!.revoke(identity, id.parse(request.params).id, key.parse(request.headers["idempotency-key"]));
  });
}
