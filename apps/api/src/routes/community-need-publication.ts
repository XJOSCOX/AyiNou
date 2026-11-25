import { needsEnabled } from "../modules/community-needs-access.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { communityNeedCategories, needPublicationReasons, needPublicationStaffActions } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import { InstitutionError } from "../services/institutions.js";
import { needContent } from "./community-needs.js";
import { needRequestContext, type NeedRouteOptions } from "./community-needs-review.js";

const id = z.uuid();
const item = z.strictObject({ id });
const directory = z.strictObject({ id, publication: id.optional() });
const page = z.strictObject({ after: id.optional(), category: z.enum(communityNeedCategories).optional() });
const staff = z.strictObject({ after: id.optional(), lane: z.enum(["admin", "review", "triage"]) });
const version = z.number().int().min(0).max(2147483646);
const receipt = { requestId: id, expectedRevision: version, confirmed: z.literal(true) };
const note = z.string().trim().min(5).max(1500).refine((value) => !/\p{Cc}/u.test(value));
const memberCommand = z.discriminatedUnion("action", [
  z.strictObject({
    ...receipt, action: z.literal("request"), expectedEvidenceRevision: version, finding: id,
    audience: z.literal("community"), attribution: z.boolean(),
    content: needContent.omit({ references: true }).extend({ description: z.string().trim().min(20).max(1200) }),
  }),
  z.strictObject({ ...receipt, action: z.literal("challenge"), note }),
  z.strictObject({ ...receipt, action: z.enum(["withdraw", "revoke_attribution"]) }),
]);
const staffCommand = z.strictObject({
  ...receipt, action: z.enum(needPublicationStaffActions), target: id.optional(),
  reason: z.enum(needPublicationReasons).optional(), note,
});

export function registerCommunityNeedPublication(app: FastifyInstance, options: NeedRouteOptions) {
  const member = "/api/v1/me/community-needs/:id/publication";
  const staffPath = "/api/v1/private/community-need-publications";
  const room = "/api/v1/private/communities/:id/needs";
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("X-Robots-Tag", "noindex, nofollow");
  });

  async function execute<T>(request: FastifyRequest, lane: string, optionsForCall: {
    caseId?: string; roomId?: string; after?: string; category?: string; command?: object;
  } = {}): Promise<T> {
    if (!options.enabled) throw new ApiError(404, "COMMUNITY_NEED_PUBLICATION_DISABLED", "Community need publication unavailable");
    const { session, workspace, repo } = await needRequestContext(request, options, lane !== "member" && lane !== "directory");
    if (!await needsEnabled(options.enabled)) throw new ApiError(404, "COMMUNITY_NEED_PUBLICATION_DISABLED", "Community need publication unavailable");
    const { caseId, roomId, command, after, category } = optionsForCall;
    try {
      return await repo.rpc<T>("c13_publication_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: workspace, p_lane: lane, p_id: caseId ?? null, p_room: roomId ?? null,
        p_category: category ?? null, p_after: after ?? null, p_command: command ?? null,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Community need publication unavailable");
      throw error;
    }
  }

  async function list(request: FastifyRequest, lane: string, args: Parameters<typeof execute>[2]) {
    const { items } = await execute<{ items: { id: string }[] }>(request, lane, args);
    return { items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19].id : null };
  }

  app.get(room, (request) => list(request, "directory", { roomId: item.parse(request.params).id, ...page.parse(request.query) }));
  app.get(room + "/:publication", async (request) => {
    const parsed = directory.parse(request.params);
    const { items } = await execute<{ items: unknown[] }>(request, "directory", { roomId: parsed.id, caseId: parsed.publication });
    if (!items.length) throw new ApiError(404, "NOT_FOUND", "Community need publication unavailable");
    return items[0];
  });
  app.get(member, (request) => execute(request, "member", { caseId: item.parse(request.params).id }));
  app.patch(member, { bodyLimit: 16_384 }, (request) =>
    execute(request, "member", { caseId: item.parse(request.params).id, command: memberCommand.parse(request.body) }));
  app.get(staffPath, (request) => {
    const query = staff.parse(request.query);
    return list(request, query.lane, { after: query.after });
  });
  app.get(staffPath + "/:id", (request) =>
    execute(request, staff.pick({ lane: true }).parse(request.query).lane, { caseId: item.parse(request.params).id }));
  app.patch(staffPath + "/:id", { bodyLimit: 8192 }, (request) =>
    execute(request, staff.pick({ lane: true }).parse(request.query).lane,
      { caseId: item.parse(request.params).id, command: staffCommand.parse(request.body) }));
}
