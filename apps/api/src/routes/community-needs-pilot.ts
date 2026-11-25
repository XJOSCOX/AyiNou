import type { FastifyInstance, FastifyRequest } from "fastify";
import { pilotDepartments } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import { InstitutionError } from "../services/institutions.js";
import { needRequestContext, type NeedRouteOptions } from "./community-needs-review.js";

const revision = z.number().int().min(0).max(2147483646);
const stages = z.strictObject({
  intake: z.boolean(), review: z.boolean(), publication: z.boolean(), association: z.boolean(),
});
const duration = z.number().int().min(1).max(30);
const receipt = {
  expectedRevision: revision, requestId: z.uuid(), confirmed: z.literal(true),
  reason: z.string().trim().min(10).max(500).refine((value) => !/\p{Cc}/u.test(value)),
};
const department = z.enum(pilotDepartments);
const command = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("configure"), capacity: z.number().int().min(1).max(10), durationDays: duration, stages,
    eligible: z.boolean().optional(), verifiedIdentity: z.boolean().optional(), maxParticipants: z.number().int().min(1).max(20).optional() }),
  z.strictObject({ ...receipt, action: z.literal("enroll"), target: z.uuid(), days: duration }),
  z.strictObject({ ...receipt, action: z.literal("remove"), target: z.uuid() }),
  z.strictObject({ ...receipt, action: z.enum(["activate", "pause", "resume"]) }),
]);
const emergency = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("pause_selected"), departments: z.array(department).min(2).max(10)
    .refine((scopes) => new Set(scopes).size === scopes.length) }),
  z.strictObject({ ...receipt, action: z.literal("pause_nationwide") }),
]);
const query = z.strictObject({
  department: department.optional(),
  before: z.coerce.number().pipe(revision).optional(),
  search: z.string().trim().regex(/^[a-z0-9_]{2,24}$/i).optional(),
});

export function registerCommunityNeedsPilot(app: FastifyInstance, options: NeedRouteOptions, release: string | null) {
  const path = "/api/v1/admin/community-needs-pilot";
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer");
  });

  async function execute(request: FastifyRequest, change: z.infer<typeof command> | z.infer<typeof emergency> | null,
    scope?: z.infer<typeof department>, before?: number, search?: string) {
    const { session, workspace, repo } = await needRequestContext(request, options, true);
    try {
      return await repo.rpc(scope ? "c18_pilot_for_api" : "c16_pilot_for_api", {
        ...(scope ? { p_department: scope } : {}),
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2,
        p_totp: session.totpAt ?? null, p_workspace: workspace, p_release: release,
        p_command: change, p_before: before ?? null, p_query: search ?? null,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Pilot request unavailable");
      throw error;
    }
  }

  app.get(path, (request) => {
    const { before, search, department: scope } = query.parse(request.query);
    return execute(request, null, scope, before, search);
  });
  app.patch(path, { bodyLimit: 4096 }, (request) => {
    const { department: scope } = query.pick({ department: true }).parse(request.query);
    return execute(request, scope ? z.union([command, emergency]).parse(request.body) : command.parse(request.body), scope);
  });
}
