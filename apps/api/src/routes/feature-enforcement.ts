import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { accountEnforcementCategories, featureCapabilities, featureCommands, featureScopes, type FeatureEnforcementPage } from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import { createAuditCursor } from "../services/audit-cursor.js";
import type { AuthVerifier } from "../services/auth.js";
import type { InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const input = z.strictObject({
  requestId: uuid, subject: uuid, action: z.enum(featureCommands), capabilities: z.array(z.enum(featureCapabilities)).min(1).max(25),
  scope: z.enum(featureScopes), scopeId: uuid.nullable(), reference: uuid.nullable().default(null),
  version: z.number().int().min(1).max(2147483646).nullable().default(null),
  minutes: z.number().int().min(1).max(129600).nullable().default(null),
  maxMinutes: z.number().int().min(1).max(10080).nullable().default(null),
  indefinite: z.boolean().default(false), category: z.enum(accountEnforcementCategories).nullable().default(null),
  reason: z.string().trim().min(10).max(500).refine((text) => !/\p{Cc}/u.test(text)), confirmed: z.literal(true),
});
const filters = z.strictObject({
  q: z.string().trim().max(100).default(""), subject: uuid.optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{32,600}$/).optional(),
});

export function registerFeatureEnforcement(app: FastifyInstance, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, read: ReadBudget, secret?: string) {
  const path = "/api/v1/moderation/feature-enforcement";
  const cursors = createAuditCursor(secret ?? crypto.randomUUID());
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
  });

  async function session(request: FastifyRequest, recent: boolean) {
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Moderation unavailable");
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    const verified = await auth.verifySession(token);
    if (!verified) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (recent && (!verified.aal2 || verified.totpAt === undefined))
      throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
    return verified;
  }

  async function access(request: FastifyRequest) {
    const workspace = uuid.safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    const verified = await session(request, true);
    await read("audit", verified.actor, request.ip);
    return { p_actor: verified.actor, p_session: verified.session, p_aal2: verified.aal2,
      p_totp: verified.totpAt, p_workspace: workspace.data };
  }

  app.get(path + "/access", async (request) => {
    const actor = await session(request, false);
    await read("audit", actor.actor, request.ip);
    return { allowed: await repository!.rpc<boolean>("m23_access_for_api", { p_actor: actor.actor }) };
  });
  app.get(path, async (request): Promise<FeatureEnforcementPage> => {
    const binding = await access(request);
    const query = filters.parse(request.query);
    const cursorBinding = [binding.p_actor, binding.p_session, binding.p_workspace, "m23", query.q, query.subject];
    const cursor = query.cursor ? cursors.open(query.cursor, cursorBinding) : null;
    const data = await repository!.rpc<Omit<FeatureEnforcementPage, "nextCursor">>("m23_read_for_api", {
      ...binding, p_query: query.q, p_subject: query.subject ?? null, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
    });
    const history = data.history.slice(0, 25);
    const last = history.at(-1);
    return { ...data, history, nextCursor: last && data.history.length > history.length ? cursors.seal({
      high: last.occurredAt, at: last.occurredAt, source: "feature", id: last.id,
      expires: cursor?.expires ?? Date.now() + 300_000,
    }, cursorBinding) : null };
  });
  app.post(path, { bodyLimit: 8192 }, async (request) => {
    const binding = await access(request);
    const action = input.parse(request.body);
    return { records: await repository!.rpc("m23_command_for_api", {
      ...binding, p_request: action.requestId, p_subject: action.subject, p_action: action.action, p_caps: action.capabilities,
      p_scope: action.scope, p_scope_id: action.scopeId, p_case: action.reference, p_version: action.version,
      p_minutes: action.minutes, p_max: action.maxMinutes, p_indefinite: action.indefinite, p_category: action.category,
      p_reason: action.reason, p_confirmed: action.confirmed,
    }) };
  });
}
