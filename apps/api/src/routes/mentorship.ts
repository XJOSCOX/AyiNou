import {
  mentorshipConsents, mentorshipGeographies, mentorshipOptionalFields, mentorshipRoles, mentorshipTopics,
  volunteerCategories, volunteerDepartments, volunteerLanguages, volunteerLevels, volunteerModes,
} from "@ayinou/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

import {
  coordinationCandidates, coordinationCommand, coordinationDashboard, coordinationPreparation, coordinationResource, mentorshipModerationCommand,
} from "./mentorship-coordination.js";

const empty = z.strictObject({});
const role = z.enum(mentorshipRoles);
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => !/\p{Cc}/u.test(value.replaceAll("\n", "")));
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const skill = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/);
const receipt = { requestId: z.uuid(), expectedVersion: integer(0, 2147483646) };
const configuration = z.strictObject({
  roles: z.array(role).max(2).refine(unique),
  topics: z.array(z.enum(mentorshipTopics)).max(mentorshipTopics.length).refine(unique),
  fields: z.array(z.enum(mentorshipOptionalFields)).max(mentorshipOptionalFields.length).refine(unique),
  skillCategories: z.array(z.enum(volunteerCategories)).max(volunteerCategories.length).refine(unique),
  modes: z.array(z.enum(volunteerModes)).max(volunteerModes.length).refine(unique),
  geographies: z.array(z.enum(mentorshipGeographies)).max(mentorshipGeographies.length).refine(unique),
  maxWeeklyHours: integer(1, 16), maxSessionMinutes: integer(15, 120),
  maxDurationWeeks: integer(1, 52), maxCapacity: integer(1, 8),
});
const preferences = z.strictObject({
  topics: z.array(z.enum(mentorshipTopics)).max(8).refine(unique),
  skills: z.array(z.strictObject({ code: skill, proficiency: z.enum(volunteerLevels) })).max(12)
    .refine(values => unique(values.map(value => value.code))),
  languages: z.array(z.strictObject({ code: z.enum(volunteerLanguages), proficiency: z.enum(volunteerLevels) })).max(9)
    .refine(values => unique(values.map(value => value.code))),
  mode: z.enum(volunteerModes), geography: z.enum(mentorshipGeographies),
  departments: z.array(z.enum(volunteerDepartments)).max(10).refine(unique),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(10).refine(unique),
  weeklyHours: integer(1, 16), sessionMinutes: integer(15, 120), durationWeeks: integer(1, 52),
  capacity: integer(1, 8).nullable(), expiresOn: z.iso.date().nullable(),
  summary: text(0, 500), experience: integer(0, 60).nullable(), goals: text(0, 500), learningObjectives: text(0, 500),
});
const ownerCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, role, action: z.literal("save"), preferences,
    adult: z.literal(true), safeguarding: z.literal(true), participation: z.literal(true),
    consent: z.strictObject({ recommendations: z.boolean(), discovery: z.boolean(), requests: z.boolean() }),
    importSkills: z.array(skill).max(12).refine(unique).optional() }),
  z.strictObject({ ...receipt, role, action: z.literal("pause") }),
  z.strictObject({ ...receipt, role, action: z.literal("resume") }),
  z.strictObject({ ...receipt, role, action: z.literal("withdraw"), purpose: z.enum(mentorshipConsents).optional() }),
]);
const configure = z.strictObject({
  ...receipt, confirmed: z.literal(true), reason: text(10, 500), configuration,
  safeguardingPlan: text(0, 500), readinessNotes: text(0, 500),
});

export function registerMentorship(app: FastifyInstance, synthetic: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer");
  });

  async function run(request: FastifyRequest, lane: "owner" | "founder" | "moderation", action: string, input: object = {}, coordination = false) {
    const founder = lane === "founder";
    const staff = lane !== "owner";
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Mentorship unavailable");
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (staff && !workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(staff ? "audit" : "profile", session.actor, request.ip);
    try {
      if (founder) {
        const access = await repository.rpc<{ founder?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      const context = {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: staff ? workspace.data : null, p_fixture: synthetic, p_action: action, p_input: input,
      };
      if (lane === "moderation") return await repository.rpc("c44_reports_for_api", context);
      if (coordination) return await repository.rpc("c44_coordination_for_api", context);
      return await repository.rpc("c43_mentorship_for_api", { ...context, p_lane: lane });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Mentorship operation unavailable");
      throw error;
    }
  }

  const member = "/api/v1/me/mentorship";
  app.get(member, request => {
    empty.parse(request.query);
    return run(request, "owner", "read");
  });
  app.get(member + "/skills", request => {
    const query = z.strictObject({ q: text(0, 80).default("") }).parse(request.query);
    return run(request, "owner", "catalog", query);
  });
  app.patch(member, { bodyLimit: 10500 }, request => {
    empty.parse(request.query);
    const { action, ...input } = ownerCommand.parse(request.body);
    return run(request, "owner", action, input);
  });

  const coordination = member + "/coordination";
  app.get(coordination, request => run(request, "owner", "dashboard", coordinationDashboard.parse(request.query), true));
  app.get(coordination + "/matches", request => {
    const { lane, ...filters } = coordinationCandidates.parse(request.query);
    return run(request, "owner", lane, filters, true);
  });
  app.get(coordination + "/requests/:id", request => {
    empty.parse(request.query);
    return run(request, "owner", "open_request", coordinationResource.parse(request.params), true);
  });
  app.get(coordination + "/relationships/:id", request => {
    empty.parse(request.query);
    return run(request, "owner", "open_relationship", coordinationResource.parse(request.params), true);
  });
  app.post(coordination, { bodyLimit: 6000 }, request => {
    empty.parse(request.query);
    const { action, ...input } = coordinationCommand.parse(request.body);
    return run(request, "owner", action, input, true);
  });

  const reports = "/api/v1/admin/moderation/mentorship";
  app.get(reports, request => {
    empty.parse(request.query);
    return run(request, "moderation", "list");
  });
  app.get(reports + "/:id", request => {
    empty.parse(request.query);
    return run(request, "moderation", "open", coordinationResource.parse(request.params));
  });
  app.patch(reports + "/:id", { bodyLimit: 2600 }, request => {
    empty.parse(request.query);
    const { action, ...input } = mentorshipModerationCommand.parse(request.body);
    return run(request, "moderation", action, { ...input, ...coordinationResource.parse(request.params) });
  });

  const admin = "/api/v1/admin/opportunity-settings/mentorship";
  app.get(admin, request => {
    empty.parse(request.query);
    return run(request, "founder", "read");
  });
  app.patch(admin, { bodyLimit: 5000 }, request => {
    empty.parse(request.query);
    return run(request, "founder", "configure", configure.parse(request.body));
  });
  app.get(admin + "/coordination", request => {
    empty.parse(request.query);
    return run(request, "founder", "settings", {}, true);
  });
  app.patch(admin + "/coordination", { bodyLimit: 3200 }, request => {
    empty.parse(request.query);
    return run(request, "founder", "configure", coordinationPreparation.parse(request.body), true);
  });
}
