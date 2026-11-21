import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { platformRoles, type PlatformAccess } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { registerAdminLegalRoutes } from "./legal-publication.js";

const reason = z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value));
const actionInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status"), value: z.enum(["active", "suspended", "banned"]), reason }),
  z.strictObject({ action: z.enum(["grant", "revoke"]), value: z.enum(platformRoles), reason }),
]);

export async function registerAdminRoutes(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null, founderBootstrapEnabled = false) {
  app.decorateRequest("authUserId", null);
  app.decorateRequest("authToken", null);
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  app.setErrorHandler((cause, _request, reply) => {
    const requestStatus = typeof cause === "object" && cause !== null && "statusCode" in cause ? cause.statusCode : null;
    const status = cause instanceof InstitutionError ? cause.statusCode : cause instanceof z.ZodError ? 400
      : typeof requestStatus === "number" && requestStatus >= 400 && requestStatus < 500 ? requestStatus : 503;
    const code = cause instanceof InstitutionError ? cause.code : status < 500 ? "INVALID_INPUT" : "SERVICE_UNAVAILABLE";
    return reply.code(status).send({ error: { code, message: "Administration request could not be completed" } });
  });
  app.addHook("preHandler", async (request) => {
    if (!auth || !repo) throw new InstitutionError("SERVICE_UNAVAILABLE", 503);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    const actor = token ? await auth.verify(token) : null;
    if (!token || !actor) throw new InstitutionError("UNAUTHORIZED", 401);
    request.authToken = token;
    request.authUserId = actor;
  });

  const access = (actor: string) => repo!.rpc<PlatformAccess>("platform_access_for_api", { p_actor: actor });
  app.get("/api/v1/me/platform-access", async (request) => access(request.authUserId!));
  app.get("/api/v1/me/founder-bootstrap", async (request) => ({
    available: founderBootstrapEnabled && await repo!.rpc<boolean>("founder_registration_status_for_api", { p_actor: request.authUserId }),
  }));
  app.post("/api/v1/me/founder-bootstrap", { bodyLimit: 256 }, async (request) => {
    if (!founderBootstrapEnabled) throw new InstitutionError("FORBIDDEN", 403);
    const session = await auth?.verifySession?.(request.authToken!, true);
    if (!session || session.actor !== request.authUserId) throw new InstitutionError("MFA_REQUIRED", 403);
    const { credential } = z.strictObject({ credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(request.body);
    const outcome = await repo!.rpc<string>("claim_founder_registration_for_api", {
      p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp_at: session.totpAt,
      p_hash: createHash("sha256").update(credential, "utf8").digest("hex"),
    });
    if (outcome !== "claimed") throw new InstitutionError("FOUNDER_BOOTSTRAP_UNAVAILABLE", 409);
    return { claimed: true };
  });

  app.register(async (admin) => {
    admin.addHook("preHandler", async (request) => {
      const { administrator } = await access(request.authUserId!);
      if (!administrator) throw new InstitutionError("FORBIDDEN", 403);
      if (await auth!.verify(request.authToken!, true) !== request.authUserId) {
        throw new InstitutionError("MFA_REQUIRED", 403);
      }
    });
    admin.get("/api/v1/admin/overview", async (request) => repo!.rpc("admin_overview_for_api", { p_actor: request.authUserId }));
    admin.get("/api/v1/admin/safety", async (request) => repo!.rpc("safety_overview_for_api", { p_actor: request.authUserId }));
    admin.get("/api/v1/admin/accounts", async (request) => {
      const { q, offset } = z.strictObject({
        q: z.string().trim().max(100).default(""),
        offset: z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().max(10000)).optional(),
      }).parse(request.query);
      return { accounts: await repo!.rpc("admin_accounts_for_api", { p_actor: request.authUserId, p_query: q, p_offset: offset ?? 0 }) };
    });
    admin.patch("/api/v1/admin/accounts/:id", { bodyLimit: 4096 }, async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { action, value, reason } = actionInput.parse(request.body);
      await repo!.rpc("admin_account_action_for_api", {
        p_actor: request.authUserId, p_subject: id, p_action: action, p_value: value, p_reason: reason,
      });
      return reply.code(204).send();
    });
    admin.get("/api/v1/admin/audit", async (request) => ({
      events: await repo!.rpc("admin_audit_for_api", { p_actor: request.authUserId, p_before: null }),
    }));
    registerAdminLegalRoutes(admin, repo!);
  });
}
