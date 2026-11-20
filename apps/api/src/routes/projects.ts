import type { FastifyInstance, FastifyRequest } from "fastify";
import { interestCodes, projectOwners, projectReportCategories, projectReviewActions, type ProjectCard,
  type ProjectDetail, type ProjectOptions, type ProjectReport, type ProjectReviewItem } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { FeedRepository } from "../services/feed.js";
import type { PostMediaService } from "../services/post-media.js";
import type { ReadBudget } from "../services/read-budget.js";
import { registerProjectWorkRoutes } from "./project-work.js";

const id = z.strictObject({ id: z.uuid() });
const version = z.number().int().positive().max(2147483647);
const country = z.string().regex(/^[A-Z]{2}$/);
const department = z.string().regex(/^HT-[A-Z]{2}$/);
const category = z.enum(interestCodes);
const reference = z.string().trim().max(300).regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(\/[^\s?#\\]*)?$/)
  .refine((value) => URL.canParse(value));
const text = (maximum: number) => z.string().trim().max(maximum).refine((value) => !/\p{Cc}/u.test(value.replace(/[\r\n\t]/g, "")));
const proposal = z.strictObject({
  title: text(120).refine((value) => value.length >= 3),
  description: text(2400), problem: text(1000), solution: text(1000), objectives: text(1000),
  beneficiaries: text(1000), outcomes: text(1000),
  category, country, department: department.nullable(), startDate: z.iso.date().nullable(), endDate: z.iso.date().nullable(),
  references: z.array(reference).max(3), publishRequested: z.boolean(),
}).refine(({ country, department, startDate, endDate }) => (!department || country === "HT") && (!startDate || !endDate || startDate <= endDate));
const draft = z.strictObject({
  kind: z.enum(projectOwners), owner: z.uuid().nullable(), association: z.uuid().nullable(), proposal,
}).refine(({ kind, owner }) => (kind === "individual") === (owner === null));
const cursor = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);
const reason = (maximum: number) => text(maximum).refine((value) => value.length >= 10);

export function registerProjectRoutes(app: FastifyInstance, { viewer, repo, read, media }: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
  media: PostMediaService | null;
}) {
  registerProjectWorkRoutes(app, { viewer, repo, read });
  const root = "/api/v1/projects";
  const mine = "/api/v1/me/projects";

  app.get(root, async (request) => {
    const { token, actor } = await viewer(request);
    await read("discovery", actor, request.ip);
    const input = z.strictObject({ category: category.optional(), country: country.optional(), department: department.optional(),
      cursor: z.string().max(120).optional() }).parse(request.query);
    const [before, beforeId] = input.cursor ? cursor.parse(input.cursor.split("|")) : [null, null];
    const rows = await repo().rpc<ProjectCard[]>(token, "projects_list_for_client", {
      p_category: input.category ?? null, p_country: input.country ?? null, p_department: input.department ?? null,
      p_before: before, p_before_id: beforeId,
    });
    const projects = rows.slice(0, 15);
    const last = projects.at(-1);
    return { projects, nextCursor: rows.length > 15 && last?.publishedAt ? last.publishedAt + "|" + last.id : null };
  });
  app.get(root + "/:id", async (request) => {
    const { token, actor } = await viewer(request);
    await read("profile", actor, request.ip);
    return repo().rpc<ProjectDetail>(token, "project_detail_for_client", { p_id: id.parse(request.params).id });
  });
  app.get(mine, async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { projects: await repo().rpc<Array<ProjectCard & { createdByMe: boolean; restricted: boolean }>>(token, "my_projects_for_client") };
  });
  app.get(mine + "/options", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return repo().rpc<ProjectOptions>(token, "project_options_for_client");
  });
  app.post(root, { bodyLimit: 28_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = draft.parse(request.body);
    const projectId = await repo().rpc<string>(token, "project_create_for_client", {
      p_key: key, p_kind: input.kind, p_owner: input.owner, p_association: input.association, p_proposal: input.proposal,
    });
    return reply.code(201).send({ id: projectId });
  });
  app.patch(root + "/:id", { bodyLimit: 28_000 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, proposal, removeImage: z.boolean() }).parse(request.body);
    return { version: await repo().rpc<number>(token, "project_edit_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_proposal: input.proposal, p_remove_image: input.removeImage,
    }) };
  });
  app.post(root + "/:id/submit", { bodyLimit: 512 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version }).parse(request.body);
    return { version: await repo().rpc<number>(token, "project_submit_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version,
    }) };
  });
  app.put(root + "/:id/image", { bodyLimit: 4_200_000 }, async (request) => {
    const { actor } = await viewer(request, true);
    if (!actor || !media?.uploadProjectImage) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image handling unavailable");
    const input = z.strictObject({ version, image: z.base64().max(4_194_304) }).parse(request.body);
    return { version: await media.uploadProjectImage(actor, id.parse(request.params).id, input.version, Buffer.from(input.image, "base64")) };
  });
  app.get(root + "/:id/image", async (request, reply) => {
    const { token, actor } = await viewer(request);
    await read("media", actor, request.ip);
    const image = await repo().rpc<string | null>(token, "project_media_for_client", { p_id: id.parse(request.params).id });
    if (!image) throw new ApiError(404, "ATTACHMENT_UNAVAILABLE", "Image unavailable");
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(Buffer.from(image, "base64"));
  });
  app.get(root + "/review", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { items: await repo().rpc<ProjectReviewItem[]>(token, "project_queue_for_client", { p_reports: false }) };
  });
  app.post(root + "/:id/review", { bodyLimit: 6000 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, action: z.enum(projectReviewActions), reason: reason(1000),
      reviewer: z.string().regex(/^[a-z0-9][a-z0-9_]{2,23}$/).nullable().optional() })
      .refine(({ action, reviewer }) => !reviewer || action === "assign").parse(request.body);
    return { version: await repo().rpc<number>(token, "project_review_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_action: input.action,
      p_reason: input.reason, p_reviewer: input.reviewer ?? null,
    }) };
  });
  app.get(root + "/reports", async (request) => {
    const { token, actor } = await viewer(request, true);
    await read("profile", actor, request.ip);
    return { reports: await repo().rpc<ProjectReport[]>(token, "project_queue_for_client", { p_reports: true }) };
  });
  app.post(root + "/:id/reports", { bodyLimit: 3500 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ category: z.enum(projectReportCategories), explanation: reason(500) }).parse(request.body);
    const reportId = await repo().rpc<string>(token, "project_report_for_client", {
      p_id: id.parse(request.params).id, p_category: input.category, p_explanation: input.explanation,
    });
    return reply.code(201).send({ id: reportId });
  });
  app.patch(root + "/:id/reports/:report", { bodyLimit: 6000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, restrict: z.boolean(), reason: reason(1000) }).parse(request.body);
    const params = id.extend({ report: z.uuid() }).parse(request.params);
    await repo().rpc(token, "project_report_decide_for_client", {
      p_id: params.id, p_report: params.report, p_version: input.version, p_restrict: input.restrict, p_reason: input.reason,
    });
    return reply.code(204).send();
  });
}
