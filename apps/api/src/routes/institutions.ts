import type { FastifyInstance } from "fastify";
import { invitedRoles, organizationKinds, reviewDecisions, verificationKinds, type InstitutionInput,
  type ReviewApplication, type VerificationApplication, type VerificationStatus } from "@ayinou/shared";
import { z } from "zod";
import type { AuthVerifier } from "../services/auth.js";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";
import { registerAffiliationDirectory, registerAffiliationRoutes } from "./affiliations.js";

const handle = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/);
const resource = z.object({ id: z.uuid() });
const publicUrl = z.string().trim().max(300).regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(\/[^\s?#\\]*)?$/)
  .refine((value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } });
const institution = z.object({
  handle,
  name: z.string().trim().min(2).max(120),
  kind: z.enum(organizationKinds),
  description: z.string().trim().max(600).nullable(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  departmentCode: z.string().regex(/^HT-[A-Z]{2}$/).nullable(),
  website: publicUrl.nullable(),
  contactEmail: z.email().max(254).nullable(),
}).strict();
const patchInstitution = institution.partial().refine((input) => Object.keys(input).length > 0);
const invite = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,23}$/),
  role: z.enum(invitedRoles),
  termDays: z.number().int().min(1).max(730).nullable(),
}).strict();
const submission = z.object({
  kind: z.enum(verificationKinds),
  organizationId: z.uuid().nullable(),
  evidence: z.array(publicUrl).min(1).max(3),
}).strict().refine(({ evidence }) => new Set(evidence).size === evidence.length);
const decision = z.object({
  decision: z.enum(reviewDecisions),
  rationale: z.string().trim().min(10).max(1000),
  conflictFree: z.literal(true),
}).strict();

export async function registerInstitutionRoutes(app: FastifyInstance, auth: AuthVerifier | null, repo: InstitutionRepository | null) {
  app.setErrorHandler((cause, _request, reply) => {
    if (cause instanceof InstitutionError) {
      return reply.code(cause.statusCode).send({ error: { code: cause.code, message: "Institution request could not be completed" } });
    }
    if (cause instanceof z.ZodError) return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "Check the submitted fields" } });
    const errorStatus = typeof cause === "object" && cause !== null && "statusCode" in cause ? cause.statusCode : null;
    const status = typeof errorStatus === "number" && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 503;
    return reply.code(status).send({ error: { code: status === 503 ? "SERVICE_UNAVAILABLE" : "INVALID_INPUT", message: "Institution request could not be completed" } });
  });
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
  registerAffiliationDirectory(app, repo);

  app.get("/api/v1/institutions/by-handle/:handle", async (request, reply) => {
    if (!repo) throw new InstitutionError("SERVICE_UNAVAILABLE", 503);
    const input = z.object({ handle }).parse(request.params);
    const profile = await repo.publicProfile(input.handle);
    if (!profile) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Institution not found" } });
    return { organization: profile };
  });

  app.register(async (api) => {
    api.decorateRequest("authUserId", null);
    api.decorateRequest("authToken", null);
    api.addHook("preHandler", async (request) => {
      if (!auth || !repo) throw new InstitutionError("SERVICE_UNAVAILABLE", 503);
      const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
      const actor = token ? await auth.verify(token) : null;
      if (!actor || !token) throw new InstitutionError("UNAUTHORIZED", 401);
      request.authUserId = actor;
      request.authToken = token;
    });

    const service = repo!;
    registerAffiliationRoutes(api, service);
    const base = "/api/v1/institutions";
    api.get("/api/v1/me/institution-accounts", async (request) => service.accounts(request.authUserId!));
    api.get(`${base}/:id`, async (request) => service.manage(request.authUserId!, resource.parse(request.params).id));
    api.post(base, { bodyLimit: 4096 }, async (request, reply) => {
      const input = institution.parse(request.body);
      const id = await service.rpc<string>("institution_save_for_api", { p_actor: request.authUserId, p_org: null, p_input: input });
      return reply.code(201).send({ id });
    });
    api.patch(`${base}/:id`, { bodyLimit: 4096 }, async (request) => {
      const { id } = resource.parse(request.params);
      const input: Partial<InstitutionInput> = patchInstitution.parse(request.body);
      await service.rpc("institution_save_for_api", { p_actor: request.authUserId, p_org: id, p_input: input });
      return { id };
    });
    api.post(`${base}/:id/logo`, { bodyLimit: 2_800_000 }, async (request, reply) => {
      const { id } = resource.parse(request.params);
      const { image } = z.object({ image: z.base64().max(2_796_204) }).strict().parse(request.body);
      const bytes = Buffer.from(image, "base64");
      if (!bytes.length || bytes.length > 2_097_152) throw new InstitutionError("INVALID_IMAGE", 400);
      await service.logo(request.authUserId!, id, bytes);
      return reply.code(204).send();
    });
    api.post(`${base}/:id/invitations`, { bodyLimit: 1024 }, async (request, reply) => {
      const { id } = resource.parse(request.params);
      const input = invite.parse(request.body);
      const invitationId = await service.rpc<string>("institution_invite_for_api", {
        p_actor: request.authUserId, p_org: id, p_username: input.username, p_role: input.role, p_term_days: input.termDays,
      });
      return reply.code(201).send({ id: invitationId });
    });
    api.post("/api/v1/institution-invitations/:id/:action", { bodyLimit: 256 }, async (request, reply) => {
      const { id, action } = resource.extend({ action: z.enum(["accept", "revoke"]) }).parse(request.params);
      await service.rpc("institution_resolve_invite_for_api", { p_actor: request.authUserId, p_invitation: id, p_accept: action === "accept" });
      return reply.code(204).send();
    });
    api.post(`${base}/:id/representatives/:member/revoke`, { bodyLimit: 256 }, async (request, reply) => {
      const { id, member } = resource.extend({ member: z.uuid() }).parse(request.params);
      await service.rpc("institution_revoke_member_for_api", { p_actor: request.authUserId, p_org: id, p_member: member });
      return reply.code(204).send();
    });
    api.get("/api/v1/me/verification", async (request) => ({
      applications: await service.rpc<VerificationApplication[]>("verification_own_for_api", { p_actor: request.authUserId }),
    }));
    api.post("/api/v1/me/verification", { bodyLimit: 4096 }, async (request, reply) => {
      const input = submission.parse(request.body);
      const id = await service.rpc<string>("verification_submit_for_api", {
        p_actor: request.authUserId, p_org: input.organizationId, p_kind: input.kind, p_evidence: input.evidence,
      });
      return reply.code(201).send({ id, status: "pending" });
    });
    api.register(async (reviewer) => {
      reviewer.addHook("preHandler", async (request) => {
        if (!await auth?.verify(request.authToken!, true)) throw new InstitutionError("FORBIDDEN", 403);
      });
      reviewer.get("/api/v1/verification/review", async (request) => {
        const { status } = z.object({ status: z.enum(["pending", "approved"]).default("pending") }).parse(request.query);
        return { applications: await service.rpc<ReviewApplication[]>("verification_queue_for_api", { p_actor: request.authUserId, p_status: status }) };
      });
      reviewer.post("/api/v1/verification/review/:id", { bodyLimit: 4096 }, async (request) => {
        const { id } = resource.parse(request.params);
        const input = decision.parse(request.body);
        return { status: await service.rpc<VerificationStatus>("verification_decide_for_api", {
          p_actor: request.authUserId, p_application: id, p_decision: input.decision,
          p_rationale: input.rationale, p_conflict_free: input.conflictFree,
        }) };
      });
    });
  });
}
