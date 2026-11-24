import type { FastifyInstance } from "fastify";
import { projectReportCategories, projectReviewActions, type ProjectReport, type ProjectReviewItem } from "@ayinou/shared";
import { z } from "zod";
import { id, projectPath, reason, version, type ProjectRouteAccess } from "./request.js";

export function registerProjectReviewRoutes(app: FastifyInstance, { viewer, repo, read }: ProjectRouteAccess) {
  app.get(projectPath + "/review", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { items: await repo().rpc<ProjectReviewItem[]>(token, "project_queue_for_client", { p_reports: false }) };
  });
  app.post(projectPath + "/:id/review", { bodyLimit: 6000 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, action: z.enum(projectReviewActions), reason: reason(1000),
      reviewer: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/).nullable().optional(),
      previewProof: z.string().regex(/^[a-f0-9]{64}$/).optional() })
      .refine(({ action, reviewer }) => !reviewer || action === "assign").parse(request.body);
    return { version: await repo().rpc<number>(token, "project_review_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_action: input.action,
      p_reason: input.reason, p_reviewer: input.reviewer ?? null,
      ...(input.previewProof ? { p_preview_proof: input.previewProof } : {}),
    }) };
  });
  app.get(projectPath + "/reports", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { reports: await repo().rpc<ProjectReport[]>(token, "project_queue_for_client", { p_reports: true }) };
  });
  app.post(projectPath + "/:id/reports", { bodyLimit: 3500 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ category: z.enum(projectReportCategories), explanation: reason(500) }).parse(request.body);
    const reportId = await repo().rpc<string>(token, "project_report_for_client", {
      p_id: id.parse(request.params).id, p_category: input.category, p_explanation: input.explanation,
    });
    return reply.code(201).send({ id: reportId });
  });
  app.patch(projectPath + "/:id/reports/:report", { bodyLimit: 6000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, restrict: z.boolean(), reason: reason(1000) }).parse(request.body);
    const params = id.extend({ report: z.uuid() }).parse(request.params);
    await repo().rpc(token, "project_report_decide_for_client", {
      p_id: params.id, p_report: params.report, p_version: input.version, p_restrict: input.restrict, p_reason: input.reason,
    });
    return reply.code(204).send();
  });
}
