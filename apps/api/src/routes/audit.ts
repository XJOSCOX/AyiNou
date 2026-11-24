import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditCategories, auditOutcomes, auditResourceTypes, type AuditEvent, type AuditPage, type PolicyAuditEvent, type PolicyAuditPage } from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import { auditTimestamp, createAuditCursor } from "../services/audit-cursor.js";
import { registerModerationCenterRead } from "./moderation-center.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const uuid = z.uuid().transform((text) => text.toLowerCase());
const target = z.strictObject({ id: uuid });
const reference = z.strictObject({ reference: z.string().regex(/^[a-z_]{1,32}:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/) });
const filters = z.strictObject({
  category: z.enum(auditCategories).optional(),
  eventType: z.string().regex(/^[a-z][a-z_]{0,47}$/).optional(),
  resourceType: z.enum(auditResourceTypes).optional(),
  resource: uuid.optional(),
  actor: uuid.optional(),
  outcome: z.enum(auditOutcomes).optional(),
  from: auditTimestamp.optional(),
  to: auditTimestamp.optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).transform(Number).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{32,600}$/).optional(),
});
type Scope = "platform" | "member" | "organization" | "verification" | "moderation";
type Query = z.infer<typeof filters>;
type Projection = { high: string; events: AuditEvent[] };
const unavailable = () => new ApiError(404, "NOT_FOUND", "Resource unavailable");
const invalid = () => new ApiError(400, "INVALID_INPUT", "Check the audit filters");

export function registerAuditRoutes(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null,
  limitReads: ReadBudget, secret: string = randomUUID()) {
  const cursors = createAuditCursor(secret);
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Referrer-Policy", "no-referrer");
  });

  async function read(request: FastifyRequest, scope: Scope, query: Query, id: string | null, kind: string | null,
    ref: string | null): Promise<AuditPage> {
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Audit service unavailable");
    const needsWorkspace = scope === "platform" || scope === "verification";
    const workspace = uuid.safeParse(request.headers["x-ayinou-workspace"]);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token || (needsWorkspace && !workspace.success)) {
      await limitReads("audit", null, request.ip);
      throw unavailable();
    }
    const session = await auth.verifySession(token);
    if (!session) {
      await limitReads("audit", null, request.ip);
      throw unavailable();
    }
    await limitReads("audit", session.actor, request.ip);
    if (query.actor && scope !== "platform") throw invalid();
    const take = ref ? 1 : query.limit ?? 25;
    const binding = [session.actor, session.session, scope, id, kind, needsWorkspace ? workspace.data : null,
      query.category, query.eventType, query.resourceType, query.resource, query.actor, query.outcome, query.from, query.to, take];
    const cursor = query.cursor ? cursors.open(query.cursor, binding) : null;
    try {
      const result = await repo.rpc<Projection | null>("a1a_audit_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_scope: scope, p_scope_id: id, p_workspace: needsWorkspace ? workspace.data : null, p_scope_type: kind,
        p_category: query.category ?? null, p_event_type: query.eventType ?? null, p_resource_type: query.resourceType ?? null,
        p_resource: query.resource ?? null, p_filter_actor: query.actor ?? null, p_outcome: query.outcome ?? null,
        p_from: query.from ?? null, p_to: query.to ?? null, p_high: cursor?.high ?? null, p_before_at: cursor?.at ?? null,
        p_before_source: cursor?.source ?? null, p_before_id: cursor?.id ?? null, p_take: take, p_reference: ref,
      });
      if (!result || (ref && result.events.length === 0)) throw unavailable();
      const events = result.events.slice(0, take);
      const last = events.at(-1);
      const nextCursor = last && result.events.length > take ? cursors.seal({
        high: result.high, at: last.occurredAt, source: last.source, id: last.sourceEventId,
        expires: cursor?.expires ?? Date.now() + 5 * 60_000,
      }, binding) : null;
      if (scope !== "platform") return { version: 1, events, nextCursor };
      const people = await repo.auditPeople?.(events.flatMap((event) =>
        [event.actorRef, event.resourceType === "account" ? event.resourceRef : null]));
      return { version: 1, nextCursor, events: events.map((event) => ({
        ...event,
        actor: event.actorRef ? people?.get(event.actorRef) : undefined,
        affectedMember: event.resourceType === "account" && event.resourceRef ? people?.get(event.resourceRef) : undefined,
      })) };
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof InstitutionError && cause.statusCode === 400) throw invalid();
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Audit service unavailable");
    }
  }

  app.get("/api/v1/admin/audit/policies", async (request): Promise<PolicyAuditPage> => {
    const query = z.strictObject({ cursor: filters.shape.cursor }).parse(request.query);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    const workspace = uuid.safeParse(request.headers["x-ayinou-workspace"]);
    if (!token || !workspace.success) {
      await limitReads("audit", null, request.ip);
      throw unavailable();
    }
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Audit service unavailable");
    const session = await auth.verifySession(token, true);
    if (!session) {
      await limitReads("audit", null, request.ip);
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw unavailable();
    }
    await limitReads("audit", session.actor, request.ip);
    const binding = [session.actor, session.session, "platform_policies", workspace.data];
    const cursor = query.cursor ? cursors.open(query.cursor, binding) : null;
    const result = await repo.rpc<{ high: string; events: PolicyAuditEvent[] } | null>("platform_policy_audit_for_api", {
      p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
      p_workspace: workspace.data, p_high: cursor?.high ?? null, p_before_at: cursor?.at ?? null,
      p_before_source: cursor?.source ?? null, p_before_revision: cursor ? Number(cursor.id) : null,
    });
    if (!result) throw unavailable();

    const events = result.events.slice(0, 20);
    const last = events.at(-1);
    const nextCursor = last && result.events.length > events.length ? cursors.seal({
      high: result.high, at: last.occurredAt, source: last.source, id: String(last.revision),
      expires: cursor?.expires ?? Date.now() + 5 * 60_000,
    }, binding) : null;
    const people = await repo.auditPeople?.(events.map(({ actorId }) => actorId));
    return { nextCursor, events: events.map((event) => ({ ...event, actor: event.actorId ? people?.get(event.actorId) : undefined })) };
  });

  registerModerationCenterRead(app, auth, repo, limitReads, cursors);

  app.get("/api/v1/admin/audit/events", (request) => read(request, "platform", filters.parse(request.query), null, null, null));
  app.get("/api/v1/admin/audit/events/:reference", async (request) => {
    z.strictObject({}).parse(request.query);
    const parsed = reference.safeParse(request.params);
    if (!parsed.success) throw unavailable();
    const result = await read(request, "platform", {}, null, null, parsed.data.reference);
    return result.events[0];
  });
  app.get("/api/v1/me/activity", (request) => read(request, "member", filters.parse(request.query), null, null, null));
  app.get("/api/v1/institutions/:id/activity", (request) =>
    read(request, "organization", filters.parse(request.query), target.parse(request.params).id, null, null));
  app.get("/api/v1/verification/cases/:id/activity", (request) =>
    read(request, "verification", filters.parse(request.query), target.parse(request.params).id, null, null));
  app.get("/api/v1/moderation/:kind/:id/activity", (request) => {
    const { id, kind } = target.extend({ kind: z.enum(["post", "comment"]) }).parse(request.params);
    return read(request, "moderation", filters.parse(request.query), id, kind, null);
  });
}
