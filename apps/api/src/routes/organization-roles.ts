import type { FastifyInstance, FastifyRequest } from "fastify";
import type { OperationalOrganization, OrganizationRoleWorkspace } from "@ayinou/shared";
import { z } from "zod";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const organization = z.strictObject({ id: z.uuid() });
const row = organization.extend({ roleId: z.uuid() });
const assignment = row.extend({ assignmentId: z.uuid() });
const version = z.number().int().positive().max(2147483647);
const fields = z.strictObject({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().min(1).max(300).nullable(),
  permissions: z.array(z.string().min(1).max(40)).min(1).max(7),
});

export function registerOrganizationRoleRoutes(app: FastifyInstance, { viewer, repo, read }: {
  viewer(request: FastifyRequest, required: true): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const base = "/api/v1/institutions/:id/roles";

  app.get("/api/v1/me/organization-roles", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { organizations: await repo().rpc<OperationalOrganization[]>(token, "my_organization_roles_for_client") };
  });
  app.get(base, async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    const { username } = z.strictObject({ username: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/).optional() }).parse(request.query);
    return repo().rpc<OrganizationRoleWorkspace>(token, "organization_roles_for_client", {
      p_org: organization.parse(request.params).id, p_username: username ?? null,
    });
  });
  app.post(base, { bodyLimit: 4096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = fields.parse(request.body);
    const id = await repo().rpc<string>(token, "organization_role_save_for_client", {
      p_org: organization.parse(request.params).id, p_id: null, p_version: null,
      p_name: input.name, p_description: input.description, p_permissions: input.permissions, p_deactivate: false,
    });
    return reply.code(201).send({ id });
  });
  app.patch(`${base}/:roleId`, { bodyLimit: 4096 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id, roleId } = row.parse(request.params);
    const input = z.discriminatedUnion("action", [
      fields.extend({ action: z.literal("save"), version }),
      z.strictObject({ action: z.literal("deactivate"), version }),
    ]).parse(request.body);
    await repo().rpc(token, "organization_role_save_for_client", {
      p_org: id, p_id: roleId, p_version: input.version, p_deactivate: input.action === "deactivate",
      p_name: input.action === "save" ? input.name : null,
      p_description: input.action === "save" ? input.description : null,
      p_permissions: input.action === "save" ? input.permissions : null,
    });
    return reply.code(204).send();
  });
  app.post(`${base}/:roleId/assignments`, { bodyLimit: 512 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id, roleId } = row.parse(request.params);
    const input = z.strictObject({ version, userId: z.uuid() }).parse(request.body);
    const assignmentId = await repo().rpc<string>(token, "organization_role_assignment_for_client", {
      p_org: id, p_role: roleId, p_version: input.version, p_user: input.userId, p_revoke: null,
    });
    return reply.code(201).send({ id: assignmentId });
  });
  app.patch(`${base}/:roleId/assignments/:assignmentId`, { bodyLimit: 512 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id, roleId, assignmentId } = assignment.parse(request.params);
    const input = z.strictObject({ version, action: z.literal("revoke") }).parse(request.body);
    await repo().rpc(token, "organization_role_assignment_for_client", {
      p_org: id, p_role: roleId, p_version: input.version, p_user: null, p_revoke: assignmentId,
    });
    return reply.code(204).send();
  });
}
