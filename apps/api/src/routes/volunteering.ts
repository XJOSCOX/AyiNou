import type { FastifyInstance, FastifyRequest } from "fastify";
import { volunteerCategories, volunteerCommitments, volunteerDepartments, volunteerFields, volunteerLanguages,
  volunteerLevels, volunteerModes } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/\p{Cc}/u.test(value));
const labels = (max: number) => z.strictObject({ en: text(1,max), ht: text(1,max), fr: text(1,max), es: text(1,max) });
const code = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/);
const receipt = { expectedVersion: z.number().int().min(0).max(2147483646), requestId: z.uuid() };
const adminReceipt = { ...receipt, reason: text(10,500), confirmed: z.literal(true) };
const profile = z.discriminatedUnion("action", [
  z.strictObject({ ...receipt, action: z.literal("pause") }),
  z.strictObject({ ...receipt, action: z.literal("withdraw"), consentKey: z.enum(["matching","discovery","profileDisplay"]).optional() }),
  z.strictObject({ ...receipt, action: z.literal("save"), summary: text(0,500),
    skills: z.array(z.strictObject({ code, proficiency: z.enum(volunteerLevels), experience: z.number().int().min(0).max(60).nullable() })).max(20),
    languages: z.array(z.strictObject({ code: z.enum(volunteerLanguages), proficiency: z.enum(volunteerLevels) })).max(9),
    mode: z.enum(volunteerModes), commitment: z.enum(volunteerCommitments),
    departments: z.array(z.enum(volunteerDepartments)).max(10), nationwide: z.boolean(),
    availability: z.enum(["available","paused"]), expiresOn: z.iso.date().nullable(),
    consent: z.strictObject({ matching: z.boolean(), discovery: z.boolean(), profileDisplay: z.boolean() }) }),
]);
const administration = z.discriminatedUnion("action", [
  z.strictObject({ ...adminReceipt, action: z.literal("configure"),
    categories: z.array(z.enum(volunteerCategories)).max(volunteerCategories.length), fields: z.array(z.enum(volunteerFields)).max(volunteerFields.length) }),
  z.strictObject({ ...adminReceipt, action: z.literal("define"), code, category: z.enum(volunteerCategories),
    names: labels(80), descriptions: labels(240).nullable(), aliases: z.array(text(2,80)).max(12),
    status: z.enum(["draft","active","retired"]) }),
]);

export function registerVolunteering(app: FastifyInstance, synthetic: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, response) => {
    response.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer");
  });

  async function execute(request: FastifyRequest, lane: "owner" | "founder", action: string, input = {}) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Volunteer profiles unavailable");
    const staff = lane === "founder";
    const session = await auth.verifySession(token, staff);
    if (!session) {
      if (staff && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = staff ? z.uuid().safeParse(request.headers["x-ayinou-workspace"]) : null;
    if (workspace?.success === false) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(staff ? "audit" : "profile", session.actor, request.ip);
    try {
      if (staff) {
        const access = await repository.rpc<{ founder?: boolean; administrator?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true || access.administrator !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      return await repository.rpc("c31_volunteer_for_api", { p_actor: session.actor, p_session: session.session,
        p_aal2: session.aal2, p_totp: session.totpAt ?? null, p_workspace: workspace?.data ?? null,
        p_fixture: synthetic, p_lane: lane, p_action: action, p_input: input });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Volunteer request unavailable");
      throw error;
    }
  }

  const owner = "/api/v1/me/volunteer-profile";
  const founder = "/api/v1/admin/volunteer-settings";
  const noQuery = z.strictObject({});
  app.get(owner, (request) => {
    noQuery.parse(request.query);
    return execute(request, "owner", "read");
  });
  app.patch(owner, { bodyLimit: 8192 }, (request) => {
    noQuery.parse(request.query);
    const { action, ...input } = profile.parse(request.body);
    return execute(request, "owner", action, input);
  });
  app.get(founder, (request) => {
    noQuery.parse(request.query);
    return execute(request, "founder", "read");
  });
  app.patch(founder, { bodyLimit: 8192 }, (request) => {
    noQuery.parse(request.query);
    const { action, ...input } = administration.parse(request.body);
    return execute(request, "founder", action, input);
  });
}
