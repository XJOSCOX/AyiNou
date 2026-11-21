import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { organizationKinds, organizationRegistrationStatuses, type OrganizationIntentReceipt, type OrganizationOnboardingIntent,
  type OrganizationRegistration, type OrganizationSetupMatch, type OrganizationSetupReceipt, type OrganizationSetupView } from "@ayinou/shared";
import type { AuthVerifier } from "../services/auth.js";
import { ApiError } from "../services/api-error.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { publicInstitutionUrl } from "./institution-input.js";
import type { ReadBudget } from "../services/read-budget.js";

const base = "/api/v1/me/organization-onboarding";
const expectedVersion = z.number().int().min(0).max(2_147_483_647);
const command = z.strictObject({ expectedVersion, requestId: z.uuid() });
const save = command.extend({
  id: z.uuid().nullable(),
  stage: z.enum(["drafting", "awaiting_identity"]),
}).refine(({ id, expectedVersion }) => (id === null) === (expectedVersion === 0));

const handle = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/);
export const organizationSetupDraft = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("new"),
    handle: handle.optional(),
    name: z.string().trim().min(2).max(120).refine((value) => !/\p{Cc}/u.test(value)).optional(),
    kind: z.enum(organizationKinds).optional(),
    description: z.string().trim().max(600).nullable().optional(),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
    departmentCode: z.string().regex(/^HT-[A-Z]{2}$/).nullable().optional(),
    website: publicInstitutionUrl.nullable().optional(),
    registrationStatus: z.enum(organizationRegistrationStatuses).optional(),
  }),
  z.strictObject({ mode: z.literal("existing"), targetHandle: handle }),
]);
const declaration = z.strictObject({
  authorityConfirmed: z.literal(true),
  declarationVersion: z.literal(1),
  evidence: z.array(publicInstitutionUrl).min(2).max(3).optional()
    .refine((refs) => !refs || new Set(refs).size === refs.length),
});

export function registerOrganizationOnboarding(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null, read: ReadBudget) {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });

  async function call<T>(request: FastifyRequest, rpc: string, input = {}) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    if (!auth?.verifySession || !repo) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Onboarding service unavailable");
    const session = await auth.verifySession(token);
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
    if (rpc === "organization_setup_matches_for_api") await read("discovery", session.actor, request.ip);
    try {
      return await repo.rpc<T>(rpc, {
        p_actor: session.actor, p_session: session.session, p_aal2: session.aal2, ...input,
      });
    } catch (cause) {
      if (cause instanceof InstitutionError) {
        if (["ORG_SETUP_IDENTITY_REQUIRED", "ORG_SETUP_AUTHORITY_REQUIRED", "ORG_SETUP_PROTECTED"].includes(cause.code)) {
          request.log.info({ event: "organization_setup_denied", code: cause.code, requestId: request.id }, "Organization setup denied");
        }
        throw new ApiError(cause.statusCode, cause.code, "Onboarding request could not be completed");
      }
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Onboarding service unavailable");
    }
  }

  app.get(base + "/setup", (request) => call<OrganizationSetupView>(request, "organization_setup_read_for_api"));
  app.get(base + "/matches", (request) => {
    const { q } = z.strictObject({ q: z.string().trim().min(2).max(80).refine((value) => !/\p{Cc}/u.test(value)) }).parse(request.query);
    return call<OrganizationSetupMatch[]>(request, "organization_setup_matches_for_api", { p_query: q });
  });
  app.put(base + "/:id/details", { bodyLimit: 4096 }, (request) => {
    const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const input = command.extend({ draft: organizationSetupDraft }).parse(request.body);
    return call<OrganizationSetupReceipt>(request, "organization_setup_command_for_api", {
      p_id: id, p_action: "save_details", p_expected: input.expectedVersion, p_request: input.requestId, p_payload: input.draft,
    });
  });
  app.post(base + "/:id/complete", { bodyLimit: 4096 }, (request) => {
    const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const input = command.extend({ declaration }).parse(request.body);
    return call<OrganizationSetupReceipt>(request, "organization_setup_command_for_api", {
      p_id: id, p_action: "complete", p_expected: input.expectedVersion, p_request: input.requestId, p_payload: input.declaration,
    });
  });
  app.put("/api/v1/institutions/:id/registration", { bodyLimit: 1024 }, (request) => {
    const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const input = command.extend({ status: z.enum(organizationRegistrationStatuses) }).parse(request.body);
    return call<OrganizationRegistration & { auditId: string }>(request, "institution_registration_for_api", {
      p_org: id, p_expected: input.expectedVersion, p_request: input.requestId, p_status: input.status,
    });
  });
  app.get(base, async (request) => ({
    intent: await call<OrganizationOnboardingIntent | null>(request, "organization_intent_for_api"),
  }));
  app.put(base, { bodyLimit: 1024 }, async (request) => {
    const input = save.parse(request.body);
    return call<OrganizationIntentReceipt>(request, "organization_intent_command_for_api", {
      p_id: input.id, p_action: "save", p_stage: input.stage,
      p_expected: input.expectedVersion, p_request: input.requestId,
    });
  });
  app.post(base + "/:id/change-path", { bodyLimit: 1024 }, async (request) => {
    const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
    const input = command.parse(request.body);
    return call<OrganizationIntentReceipt>(request, "organization_intent_command_for_api", {
      p_id: id, p_action: "cancel", p_stage: null, p_expected: input.expectedVersion, p_request: input.requestId,
    });
  });
}
