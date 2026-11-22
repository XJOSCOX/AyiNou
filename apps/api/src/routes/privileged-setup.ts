import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import type { InstitutionRepository } from "../services/institutions.js";

const credential = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const id = z.object({ id: z.uuid() });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new ApiError(404, "NOT_FOUND", "Workflow unavailable");

export function registerPrivilegedSetup(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null, founderEnabled: boolean) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function session(request: FastifyRequest, recent: boolean) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token || !auth?.verifySession) throw unavailable();
    const proof = await auth.verifySession(token, recent);
    if (!proof) throw unavailable();
    return proof;
  }

  const founder = "/api/v1/setup/founder/:id";
  async function founderCommand(request: FastifyRequest, action: string, secret?: string, nonce?: string) {
    if (!founderEnabled || !repo) throw unavailable();
    const proof = action === "claim" ? await session(request, true) : null;
    const result = await repo.rpc("f1_founder_for_api", {
      p_flow: id.parse(request.params).id, p_action: action,
      p_hash: secret ? digest(secret) : null, p_authorization: nonce ? digest(nonce) : null,
      p_actor: proof?.actor ?? null, p_session: proof?.session ?? null, p_totp: proof?.totpAt ?? null,
    });
    if (!result) throw unavailable();
    return result;
  }

  app.get(founder, (request) => founderCommand(request, "status"));
  app.post(founder, { bodyLimit: 512 }, async (request) => {
    const input = z.discriminatedUnion("action", [
      z.strictObject({ action: z.literal("unlock"), secret: credential }),
      z.strictObject({ action: z.enum(["form", "claim"]), authorization: credential }),
    ]).parse(request.body);
    if (input.action === "unlock") {
      const authorization = randomBytes(32).toString("base64url");
      await founderCommand(request, "unlock", input.secret, authorization);
      return { authorization };
    }
    return founderCommand(request, input.action, undefined, input.authorization);
  });

  const appointment = "/api/v1/administrator-activation/:id";
  async function appointmentCommand(request: FastifyRequest, action: string, code?: string) {
    if (!repo) throw unavailable();
    const proof = await session(request, action !== "status");
    const result = await repo.rpc<{ flowId?: string; expiresAt?: string }>("f1_appointment_for_api", {
      p_actor: proof.actor, p_session: proof.session, p_aal2: proof.aal2, p_totp: proof.totpAt ?? null,
      p_id: id.parse(request.params).id, p_action: action, p_hash: code ? digest(code) : null,
    });
    if (!result) throw unavailable();
    return result;
  }

  app.get(appointment, (request) => appointmentCommand(request, "status"));
  app.post(appointment, { bodyLimit: 512 }, (request) => {
    const input = z.strictObject({ code: credential, accept: z.literal(true) }).parse(request.body);
    return appointmentCommand(request, "activate", input.code);
  });
  app.post("/api/v1/admin/appointments/:id/invitation", async (request) => {
    const code = randomBytes(32).toString("base64url");
    return { ...await appointmentCommand(request, "issue", code), code };
  });
  app.delete("/api/v1/admin/appointments/:id/invitation", (request) => appointmentCommand(request, "revoke"));
}
