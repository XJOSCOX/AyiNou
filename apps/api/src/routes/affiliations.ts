import type { FastifyInstance } from "fastify";
import { affiliationActions, affiliationTypes, membershipPolicies, type AffiliationDirectory, type AffiliationManagement,
  type AffiliationStatus, type MyAffiliations } from "@ayinou/shared";
import { z } from "zod";
import { InstitutionError, type InstitutionRepository } from "../services/institutions.js";

const organization = z.object({ id: z.uuid() });
const type = z.enum(affiliationTypes);
const note = z.string().trim().max(500).nullable();
const domain = "/api/v1/institutions/:id/affiliations";

export function registerAffiliationDirectory(app: FastifyInstance, repo: InstitutionRepository | null) {
  app.get("/api/v1/institutions/by-handle/:handle/affiliations", async (request) => {
    if (!repo) throw new InstitutionError("SERVICE_UNAVAILABLE", 503);
    const { handle } = z.object({ handle: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/) }).parse(request.params);
    const directory = await repo.rpc<AffiliationDirectory | null>("affiliation_directory_for_api", { p_handle: handle });
    if (!directory) throw new InstitutionError("NOT_FOUND", 404);
    return directory;
  });
}

export function registerAffiliationRoutes(api: FastifyInstance, service: InstitutionRepository) {
  api.get("/api/v1/me/affiliations", (request) => service.rpc<MyAffiliations>("affiliations_own_for_api", {
    p_actor: request.authUserId,
  }));
  api.get(`${domain}/manage`, (request) => service.rpc<AffiliationManagement>("affiliation_manage_for_api", {
    p_actor: request.authUserId, p_org: organization.parse(request.params).id,
  }));
  api.patch(`${domain}/policy`, { bodyLimit: 512 }, async (request, reply) => {
    const input = z.object({ membershipPolicy: z.enum(membershipPolicies), directoryEnabled: z.boolean() }).strict().parse(request.body);
    await service.rpc("affiliation_policy_for_api", {
      p_actor: request.authUserId, p_org: organization.parse(request.params).id, p_policy: input.membershipPolicy, p_directory: input.directoryEnabled,
    });
    return reply.code(204).send();
  });
  api.post(domain, { bodyLimit: 4096 }, async (request, reply) => {
    const input = z.object({ affiliationType: type, message: note.optional() }).strict().parse(request.body);
    const status = await service.rpc<AffiliationStatus>("affiliation_join_for_api", {
      p_actor: request.authUserId, p_org: organization.parse(request.params).id, p_type: input.affiliationType, p_message: input.message ?? null,
    });
    return reply.code(201).send({ status });
  });
  api.patch(`${domain}/me`, { bodyLimit: 256 }, async (request, reply) => {
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("leave") }).strict(),
      z.object({ action: z.literal("set_directory"), listed: z.boolean() }).strict(),
    ]).parse(request.body);
    await service.rpc("affiliation_own_action_for_api", {
      p_actor: request.authUserId, p_org: organization.parse(request.params).id,
      p_leave: input.action === "leave", p_listed: input.action === "set_directory" ? input.listed : false,
    });
    return reply.code(204).send();
  });
  api.patch(`${domain}/requests/:requestId`, { bodyLimit: 4096 }, async (request, reply) => {
    const { id, requestId } = organization.extend({ requestId: z.uuid() }).parse(request.params);
    const input = z.object({ decision: z.enum(["approve", "reject"]), reason: note.optional() }).strict()
      .refine(({ decision, reason }) => decision === "approve" || !!reason).parse(request.body);
    await service.rpc("affiliation_decide_for_api", {
      p_actor: request.authUserId, p_org: id, p_request: requestId, p_approve: input.decision === "approve", p_reason: input.reason ?? null,
    });
    return reply.code(204).send();
  });
  api.patch(`${domain}/members/:affiliationId`, { bodyLimit: 512 }, async (request, reply) => {
    const { id, affiliationId } = organization.extend({ affiliationId: z.uuid() }).parse(request.params);
    const input = z.object({ action: z.enum(affiliationActions), affiliationType: type.optional() }).strict()
      .refine(({ action, affiliationType }) => (action === "change_type") === !!affiliationType).parse(request.body);
    await service.rpc("affiliation_member_action_for_api", {
      p_actor: request.authUserId, p_org: id, p_affiliation: affiliationId, p_action: input.action, p_type: input.affiliationType ?? null,
    });
    return reply.code(204).send();
  });
  api.post(`${domain}/invitations`, { bodyLimit: 512 }, async (request, reply) => {
    const { id } = organization.parse(request.params);
    const input = z.object({ affiliationType: type, username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,23}$/) }).strict().parse(request.body);
    const invitationId = await service.rpc<string>("affiliation_invite_for_api", {
      p_actor: request.authUserId, p_org: id, p_username: input.username, p_type: input.affiliationType,
    });
    return reply.code(201).send({ id: invitationId });
  });
  api.post("/api/v1/affiliation-invitations/:id/:action", { bodyLimit: 256 }, async (request, reply) => {
    const { id, action } = organization.extend({ action: z.enum(["accept", "revoke"]) }).parse(request.params);
    z.object({}).strict().optional().parse(request.body);
    await service.rpc("affiliation_resolve_invite_for_api", { p_actor: request.authUserId, p_invitation: id, p_accept: action === "accept" });
    return reply.code(204).send();
  });
}
