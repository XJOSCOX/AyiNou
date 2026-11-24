import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ActiveSessionList, PrivateFlow, PrivateFlowReceipt, SessionRevocation } from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const sessions = "/api/v1/me/sessions";
const workflows = "/api/v1/me/private-workflows";
const workflow = workflows + "/:id/:step";
const location = z.strictObject({ id: z.uuid(), step: z.enum(["resume", "confirm", "admin", "review", "moderation"]) });
const command = z.strictObject({ requestId: z.uuid() });
const unavailable = () => new ApiError(404, "NOT_FOUND", "Resource unavailable");

export function registerSessionSecurity(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Referrer-Policy", "no-referrer");
  });

  async function call<T>(request: FastifyRequest, rpc: string, params: object, privateLink = false): Promise<T> {
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Security service unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    const session = token ? await auth.verifySession(token) : null;
    if (!session) {
      if (privateLink) throw unavailable();
      throw new ApiError(401, "UNAUTHORIZED", "Sign-in required");
    }
    try {
      const result = await repo.rpc<T | null>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
        p_totp: session.totpAt ?? null, ...params,
      });
      if (result === null) throw unavailable();
      return result;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError) {
        throw new ApiError(cause.statusCode, cause.code, "Security request could not be completed");
      }
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Security service unavailable");
    }
  }

  app.get(sessions, (request) => call<ActiveSessionList>(request, "s2b_sessions_for_api", {
    p_action: "list", p_target: null, p_request: null,
  }));

  app.post(sessions + "/revoke", { bodyLimit: 512 }, (request) => {
    const input = command.extend({ target: z.uuid().nullable() }).parse(request.body);
    return call<SessionRevocation>(request, "s2b_sessions_for_api", {
      p_action: input.target ? "single" : "others", p_target: input.target, p_request: input.requestId,
    });
  });

  app.post(workflows, { bodyLimit: 512 }, (request) => {
    const input = z.strictObject({ kind: z.enum(["organization_draft", "revoke_other_sessions", "admin_workspace", "verification_workspace", "moderation_workspace"]) }).parse(request.body);
    return call<PrivateFlow>(request, "s2b_workflow_for_api", {
      p_action: "open", p_kind: input.kind, p_id: null, p_step: null, p_expected: null, p_request: null,
    });
  });

  app.get(workflow, (request) => {
    const parsed = location.safeParse(request.params);
    if (!parsed.success) throw unavailable();
    return call<PrivateFlow>(request, "s2b_workflow_for_api", {
      p_action: "read", p_kind: null, p_id: parsed.data.id, p_step: parsed.data.step, p_expected: null, p_request: null,
    }, true);
  });

  app.post(workflow, { bodyLimit: 512 }, (request) => {
    const parsed = location.safeParse(request.params);
    if (!parsed.success) throw unavailable();
    const input = command.extend({ action: z.enum(["cancel", "complete"]),
      expectedVersion: z.number().int().min(1).max(2147483646) }).parse(request.body);
    return call<PrivateFlowReceipt>(request, "s2b_workflow_for_api", {
      p_action: input.action, p_kind: null, p_id: parsed.data.id, p_step: parsed.data.step,
      p_expected: input.expectedVersion, p_request: input.requestId,
    }, true);
  });
}
