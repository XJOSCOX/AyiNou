import { organizationKinds, professionalApplicationMethods, professionalOpportunityCategories, professionalOpportunityModes,
  professionalOpportunityScopes, professionalOpportunityTypes, volunteerDepartments } from "@ayinou/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import type { ReadBudget } from "../services/read-budget.js";

const empty = z.strictObject({});
const key = z.strictObject({ organization: z.uuid() });
const detail = key.extend({ opportunity: z.uuid() });
const version = z.number().int().min(0).max(2147483646);
const request = { requestId: z.uuid(), expectedVersion: version };
const boundedText = (limit: number) => z.string().trim().min(1).max(limit).refine(value => !/\p{Cc}/u.test(value));
const reference = z.url({ protocol: /^https$/ }).max(300).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password;
});
const snapshot = z.strictObject({
  title: boundedText(120), description: z.string().trim().min(1).max(2400).refine(value => !/\p{Cc}/u.test(value.replaceAll("\n", ""))), type: z.enum(professionalOpportunityTypes),
  language: z.enum(["ht", "fr", "en", "es"]), category: z.enum(professionalOpportunityCategories),
  country: z.string().regex(/^[A-Z]{2}$/), department: z.enum(volunteerDepartments).nullable(),
  mode: z.enum(professionalOpportunityModes), opensOn: z.iso.date().nullable(), closesOn: z.iso.date().nullable(),
  skills: z.array(z.string().regex(/^[a-z][a-z0-9_]{2,39}$/)).max(12),
  details: z.record(z.string().max(40),z.unknown()).optional(),
  references: z.array(reference).max(4), applicationMethod: z.enum(professionalApplicationMethods),
});
const draft = z.strictObject({ ...request, snapshot });
const configure = z.strictObject({
  ...request, confirmed: z.literal(true), reason: boundedText(500).refine(value => value.length >= 10),
  settings: z.strictObject({
    types: z.array(z.enum(professionalOpportunityTypes)).min(1).max(professionalOpportunityTypes.length),
    organizationKinds: z.array(z.enum(organizationKinds)).min(1).max(organizationKinds.length),
    scopes: z.array(z.enum(professionalOpportunityScopes)).min(1).max(professionalOpportunityScopes.length),
    modes: z.array(z.enum(professionalOpportunityModes)).min(1).max(professionalOpportunityModes.length),
    draftLimit: z.number().int().min(1).max(50),
  }),
});

export function registerProfessionalOpportunities(app: FastifyInstance, synthetic: boolean, auth: AuthVerifier | null,
  repository: InstitutionRepository | null, budget: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow").header("Referrer-Policy", "no-referrer");
  });
  async function run(request: FastifyRequest, action: "settings" | "configure" | "list" | "detail" | "create" | "edit" | "withdraw",
    input: object = {}, organization: string | null = null, opportunity: string | null = null) {
    const founder = action === "settings" || action === "configure";
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    if (!auth?.verifySession || !repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Opportunity settings unavailable");
    const session = await auth.verifySession(token, founder);
    if (!session) {
      if (founder && await auth.verifySession(token)) throw new ApiError(403, "MFA_REQUIRED", "Recent verification required");
      throw new ApiError(401, "UNAUTHORIZED", "Sign in required");
    }
    const workspace = z.uuid().safeParse(request.headers["x-ayinou-workspace"]);
    if (founder && !workspace.success) throw new ApiError(403, "FORBIDDEN", "Private workspace required");
    await budget(founder ? "audit" : "profile", session.actor, request.ip);
    try {
      if (founder) {
        const access = await repository.rpc<{ founder?: boolean }>("platform_access_for_api", { p_actor: session.actor });
        if (access?.founder !== true) throw new ApiError(403, "FORBIDDEN", "Founder authority required");
      }
      return await repository.rpc("c41_opportunities_for_api", {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, p_totp: session.totpAt ?? null,
        p_workspace: founder ? workspace.data : null, p_fixture: synthetic, p_org: organization,
        p_opportunity: opportunity, p_action: action, p_input: input,
      });
    } catch (error) {
      if (error instanceof InstitutionError) throw new ApiError(error.statusCode, error.code, "Opportunity operation unavailable");
      throw error;
    }
  }
  const settings = "/api/v1/admin/opportunity-settings";
  app.get(settings, req => { empty.parse(req.query); return run(req, "settings"); });
  app.patch(settings, { bodyLimit: 4096 }, req => { empty.parse(req.query); return run(req, "configure", configure.parse(req.body)); });
  const path = "/api/v1/institutions/:organization/opportunities";
  app.get(path, req => run(req, "list", empty.extend({ after: z.uuid().optional() }).parse(req.query), key.parse(req.params).organization));
  app.post(path, { bodyLimit: 8192 }, req => {
    empty.parse(req.query);
    return run(req, "create", draft.parse(req.body), key.parse(req.params).organization);
  });
  app.get(path + "/:opportunity", req => {
    const ids = detail.parse(req.params);
    return run(req, "detail", empty.extend({ before: z.coerce.number().int().min(1).max(2147483647).optional() }).parse(req.query),
      ids.organization, ids.opportunity);
  });
  app.patch(path + "/:opportunity", { bodyLimit: 8192 }, req => {
    empty.parse(req.query);
    const ids = detail.parse(req.params);
    const input = z.discriminatedUnion("action", [
      draft.extend({ action: z.literal("edit") }), z.strictObject({ ...request, action: z.literal("withdraw") }),
    ]).parse(req.body);
    const { action, ...data } = input;
    return run(req, action, data, ids.organization, ids.opportunity);
  });
}
