import type { FastifyInstance, FastifyRequest } from "fastify";
import { requirementFields, requirementPriorities, volunteerCategories, volunteerLanguages, volunteerLevels, volunteerModes } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const integer = (low: number, high: number) => z.number().int().min(low).max(high);
const receipt = { expectedVersion: integer(0,2147483646), requestId: z.uuid() };
const choice = { priority: z.enum(requirementPriorities), proficiency: z.enum(volunteerLevels).nullable() };
const requirements = z.strictObject({
  skills: z.array(z.strictObject({ ...choice, code: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/),
    experienceMin: integer(0,60).nullable(), experienceMax: integer(0,60).nullable() })).max(12),
  languages: z.array(z.strictObject({ ...choice, code: z.enum(volunteerLanguages) })).max(6),
  mode: z.enum(volunteerModes), hoursPerWeek: integer(1,40).nullable(), durationWeeks: integer(1,52).nullable(),
  beginnerFriendly: z.boolean(), screening: z.boolean(),
});
const update = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("draft"), requirements }),
  z.strictObject({ ...receipt, action: z.literal("publish"), confirmed: z.literal(true) }),
]);
const config = z.strictObject({ ...receipt, action: z.literal("configure"), confirmed: z.literal(true),
  reason: z.string().trim().min(10).max(500).refine((reason) => !/\p{Cc}/u.test(reason)),
  categories: z.array(z.enum(volunteerCategories)).max(volunteerCategories.length),
  fields: z.array(z.enum(requirementFields)).max(requirementFields.length), modes: z.array(z.enum(volunteerModes)).min(1).max(volunteerModes.length),
  maxSkills: integer(1,12), maxLanguages: integer(0,6),
});
const projectParams = z.strictObject({ id: z.uuid() });
const opportunityParams = projectParams.extend({ opportunity: z.uuid() });
const noQuery = z.strictObject({});

export function registerOpportunityRequirements(app: FastifyInstance, synthetic: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer");
  });

  async function execute(request: FastifyRequest, action: string, input = {}, project?: string, opportunity?: string) {
    noQuery.parse(request.query);
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Opportunity requirements unavailable");
    const staff = !project;
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    if (!staff && !synthetic) {
      if (action === "read") return { state: "closed" };
      throw new ApiError(403, "FORBIDDEN", "Structured requirements unavailable");
    }
    const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(staff ? "audit" : "profile", session.actor, request.ip);
    try {
      if (staff) {
        const access = await repository.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      return await repository.rpc("c32_requirements_for_api", { p_actor: session.actor, p_session: session.session,
        p_aal2: session.aal2, p_totp: session.totpAt ?? null, p_workspace: workspace?.data ?? null, p_fixture: synthetic,
        p_project: project ?? null, p_opportunity: opportunity ?? null, p_action: action, p_input: input });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Opportunity requirements unavailable");
      throw error;
    }
  }
  const admin = "/api/v1/admin/volunteer-settings/requirements";
  const project = "/api/v1/projects/:id/work/requirements";
  app.get(admin, (request) => execute(request,"settings"));
  app.patch(admin, { bodyLimit: 4096 }, (request) => {
    const { action, ...input } = config.parse(request.body);
    return execute(request,action,input);
  });
  app.get(project, (request) => execute(request,"read",{},projectParams.parse(request.params).id));
  app.patch(project + "/:opportunity", { bodyLimit: 6144 }, (request) => {
    const { id, opportunity } = opportunityParams.parse(request.params);
    const { action, ...input } = update.parse(request.body);
    return execute(request,action,input,id,opportunity);
  });
}
