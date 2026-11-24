import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  enforcementAppealDomains, enforcementAppealStaffActions, enforcementAppealStatuses,
  type MemberEnforcementAppeals, type StaffEnforcementAppeals,
} from "@ayinou/shared";
import { ApiError } from "../services/api-error.js";
import { createAuditCursor } from "../services/audit-cursor.js";
import type { AuthVerifier } from "../services/auth.js";
import type { FeedRepository } from "../services/feed.js";
import type { InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2147483646);
const reference = { reference: uuid, requestId: uuid };
const memberCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...reference, action: z.literal("submit"), domain: z.enum(enforcementAppealDomains), reason: z.string().trim().min(10).max(2000) }),
  z.strictObject({ ...reference, action: z.literal("correct"), revision, reason: z.string().trim().min(10).max(2000) }),
  z.strictObject({ ...reference, action: z.literal("withdraw"), revision }),
]);
const staffCommand = z.strictObject({
  id: uuid, requestId: uuid, revision, action: z.enum(enforcementAppealStaffActions),
  reviewer: uuid.optional(), reason: z.string().trim().min(10).max(500),
}).refine(({ action, reviewer }) => (action === "assign") === !!reviewer);

const staffFilters = z.strictObject({
  lane: z.enum(["admin", "review"]), search: z.string().trim().max(64).optional(),
  status: z.enum(enforcementAppealStatuses).optional(), cursor: z.string().regex(/^[A-Za-z0-9_-]{32,600}$/).optional(),
});

export function registerEnforcementAppeals(app: FastifyInstance, auth: AuthVerifier | null, feed: FeedRepository | null,
  institutions: InstitutionRepository | null, read: ReadBudget, secret?: string) {
  const memberPath = "/api/v1/me/enforcement-appeals";
  const staffPath = "/api/v1/moderation/enforcement-appeals";
  const cursors = createAuditCursor(secret ?? randomUUID());

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
  });

  function bearer(request: FastifyRequest) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    return token;
  }

  async function staff(request: FastifyRequest) {
    if (!auth?.verifySession || !institutions) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Appeals unavailable");
    const token = bearer(request);
    const workspace = uuid.safeParse(request.headers["x-ayinou-workspace"]);
    if (!workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    const session = await auth.verifySession(token, true);
    if (!session) {
      if (await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    await read("audit", session.actor, request.ip);
    return { p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
      p_totp: session.totpAt ?? null, p_workspace: workspace.data };
  }

  app.get(memberPath, async (request) => {
    if (!feed) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Appeals unavailable");
    const token = bearer(request);
    await read("notifications", null, request.ip);
    const { event } = z.strictObject({ event: uuid.optional() }).parse(request.query);
    const data = await feed.rpc<MemberEnforcementAppeals | null>(token, "m24_my_appeals", { p_event: event ?? null });
    if (!data) throw new ApiError(404, "APPEAL_INELIGIBLE", "Appeals unavailable");
    return data;
  });

  app.post(memberPath, { bodyLimit: 12288 }, async (request) => {
    if (!feed) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Appeals unavailable");
    const token = bearer(request);
    await read("notifications", null, request.ip);
    const command = memberCommand.parse(request.body);
    return feed.rpc(token, "m24_member_appeal", {
      p_action: command.action, p_ref: command.reference, p_request: command.requestId,
      p_domain: "domain" in command ? command.domain : null, p_revision: "revision" in command ? command.revision : null,
      p_reason: "reason" in command ? command.reason : null,
    });
  });

  app.get(staffPath, async (request): Promise<StaffEnforcementAppeals> => {
    const binding = await staff(request);
    const query = staffFilters.parse(request.query);
    const cursorBinding = [binding.p_actor, binding.p_session, binding.p_workspace, "appeals", query.lane, query.status, query.search];
    const cursor = query.cursor ? cursors.open(query.cursor, cursorBinding) : null;
    const result = await institutions!.rpc<Omit<StaffEnforcementAppeals, "nextCursor">>("m24_staff_appeals", {
      ...binding, p_lane: query.lane, p_search: query.search ?? null, p_status: query.status ?? null,
      p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
    });
    const cases = result.cases.slice(0, 25);
    const last = cases.at(-1);
    return { ...result, cases, nextCursor: last && result.cases.length > cases.length ? cursors.seal({
      high: last.updatedAt, at: last.updatedAt, id: last.id, source: "enforcement_appeal",
      expires: cursor?.expires ?? Date.now() + 300_000,
    }, cursorBinding) : null };
  });

  app.post(staffPath, { bodyLimit: 8192 }, async (request) => {
    const binding = await staff(request);
    const { lane } = staffFilters.pick({ lane: true }).parse(request.query);
    const command = staffCommand.parse(request.body);
    const result = await institutions!.rpc<{ denied?: boolean }>("m24_staff_decision", {
      ...binding, p_lane: lane, p_case: command.id, p_revision: command.revision, p_action: command.action,
      p_reviewer: command.reviewer ?? null, p_request: command.requestId, p_reason: command.reason,
    });
    if (result.denied) throw new ApiError(403, "APPEAL_REVIEW_CONFLICT", "An eligible independent reviewer is required");
    return result;
  });
}
