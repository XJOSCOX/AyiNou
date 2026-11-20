import type { FastifyInstance, FastifyRequest } from "fastify";
import { projectTaskPriorities, projectTeamRoles, type ProjectWork, type ProjectWorkIndex } from "@ayinou/shared";
import { z } from "zod";
import type { FeedRepository } from "../services/feed.js";
import type { ReadBudget } from "../services/read-budget.js";

const id = z.strictObject({ id: z.uuid() });
const version = z.number().int().min(1).max(2147483647);
const task = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(2000),
  priority: z.enum(projectTaskPriorities),
  sensitive: z.boolean(),
  dueOn: z.iso.date().nullable(),
};
const taskAction = z.strictObject({
  action: z.enum(["task_accept", "task_decline", "task_progress", "task_block", "task_submit"]), id: z.uuid(), version,
});
const taskReview = z.strictObject({
  action: z.enum(["task_approve", "task_return", "task_cancel"]), id: z.uuid(), version, reason: z.string().trim().min(3).max(500),
});
const operation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("execution_status"), status: z.enum(["active", "paused", "completed", "archived"]),
    version: z.number().int().min(0).max(2147483647) }),
  z.strictObject({ action: z.literal("invite"), handle: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/),
    role: z.enum(projectTeamRoles), key: z.uuid() }),
  z.strictObject({ action: z.enum(["invite_accept", "invite_decline", "invite_revoke", "opportunity_close",
    "volunteer_apply", "volunteer_confirm", "volunteer_withdraw"]), id: z.uuid() }),
  z.strictObject({ action: z.literal("member_revoke"), userId: z.uuid() }),
  z.strictObject({ action: z.literal("opportunity_publish"), title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000), skills: z.string().trim().min(1).max(300),
    commitment: z.string().trim().min(1).max(180), remote: z.boolean(), capacity: z.number().int().min(1).max(100),
    closesOn: z.iso.date().nullable() }),
  z.strictObject({ action: z.enum(["volunteer_offer", "volunteer_reject"]), id: z.uuid(), reason: z.string().trim().min(3).max(500) }),
  z.strictObject({ action: z.literal("task_create"), ...task }),
  z.strictObject({ action: z.literal("task_edit"), id: z.uuid(), version, ...task }),
  z.strictObject({ action: z.literal("task_assign"), id: z.uuid(), version, userId: z.uuid().nullable() }),
  taskAction, taskReview,
]);

export function registerProjectWorkRoutes(app: FastifyInstance, { viewer, repo, read }: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
}) {
  const work = "/api/v1/projects/:id/work";
  app.get("/api/v1/me/project-work", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return repo().rpc<ProjectWorkIndex>(token, "project_work_index_for_client");
  });
  app.get(work, async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return repo().rpc<ProjectWork>(token, "project_work_for_client", { p_id: id.parse(request.params).id });
  });
  app.post(work, { bodyLimit: 16_000 }, async (request) => {
    const { token } = await viewer(request, true);
    const { action, ...input } = operation.parse(request.body);
    return repo().rpc<{ id: string }>(token, "project_operation_for_client",
      { p_project: id.parse(request.params).id, p_action: action, p_data: input });
  });
}
