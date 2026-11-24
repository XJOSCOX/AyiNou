import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  moderationCenterViews, moderationDomains, moderationHistoryActions, moderationStatuses,
  type ModerationCenterMetrics, type ModerationCenterPage, type ModerationSummary,
} from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import { auditTimestamp, type createAuditCursor } from "../services/audit-cursor.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const filters = z.strictObject({
  view: z.enum(moderationCenterViews),
  domain: z.enum(moderationDomains).optional(),
  status: z.enum(moderationStatuses).optional(),
  action: z.enum(moderationHistoryActions).optional(),
  scope: z.string().max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  target: uuid.optional(),
  from: auditTimestamp.optional(),
  to: auditTimestamp.optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).transform(Number).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{32,600}$/).optional(),
});
type ProjectedPage = {
  high: string;
  rows: (ModerationSummary & { sortAt: string })[];
  metrics: ModerationCenterMetrics | null;
};
const unavailable = () => new ApiError(404, "NOT_FOUND", "Workspace unavailable");

export function registerModerationCenterRead(app: FastifyInstance, auth: AuthVerifier | null,
  repo: InstitutionRepository | null, limitReads: ReadBudget, cursors: ReturnType<typeof createAuditCursor>) {
  app.get("/api/v1/admin/moderation-center", async (request): Promise<ModerationCenterPage> => {
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Moderation center unavailable");
    const workspace = uuid.safeParse(request.headers["x-ayinou-workspace"]);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token || !workspace.success) {
      await limitReads("audit", null, request.ip);
      throw unavailable();
    }
    const session = await auth.verifySession(token, true);
    if (!session) {
      await limitReads("audit", null, request.ip);
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification required");
      throw unavailable();
    }
    await limitReads("audit", session.actor, request.ip);
    const query = filters.parse(request.query);
    const take = query.limit ?? 25;
    const binding = [session.actor, session.session, "moderation_center", workspace.data, query.view, query.domain,
      query.status, query.action, query.scope, query.target, query.from, query.to, take];
    const cursor = query.cursor ? cursors.open(query.cursor, binding) : null;

    let result: ProjectedPage | null;
    try {
      result = await repo.rpc<ProjectedPage | null>("m21_moderation_center_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace.data, p_view: query.view, p_domain: query.domain ?? null, p_status: query.status ?? null,
        p_action: query.action ?? null, p_scope: query.scope ?? null, p_target: query.target ?? null,
        p_from: query.from ?? null, p_to: query.to ?? null, p_high: cursor?.high ?? null, p_before_at: cursor?.at ?? null,
        p_before_source: cursor?.source ?? null, p_before_id: cursor?.id ?? null, p_take: take,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError && cause.statusCode === 400)
        throw new ApiError(400, "INVALID_INPUT", "Check the moderation filters");
      throw cause;
    }
    if (!result) throw unavailable();
    const selected = result.rows.slice(0, take);
    const last = selected.at(-1);
    const nextCursor = last && result.rows.length > take ? cursors.seal({
      high: result.high, at: last.sortAt, source: last.source, id: last.id,
      expires: cursor?.expires ?? Date.now() + 5 * 60_000,
    }, binding) : null;
    const rows = selected.map(({ id, source, domain, target, targetId, scopeKey, status, action, occurredAt, expiresAt, actorRef }) =>
      ({ id, source, domain, target, targetId, scopeKey, status, action, occurredAt, expiresAt, actorRef }));
    return { metrics: result.metrics, nextCursor, rows };
  });
}
