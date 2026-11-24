import type { FastifyInstance } from "fastify";
import { interestCodes, projectOwners, type ProjectCard, type ProjectDetail, type ProjectOptions } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { PostMediaService } from "../services/post-media.js";
import { registerProjectWorkRoutes } from "./project-work.js";
import { registerProjectProgressRoutes } from "./project-progress.js";
import { registerProjectReviewRoutes } from "../modules/projects/review.js";
import { id, projectPath, text, version, type ProjectRouteAccess } from "../modules/projects/request.js";

const country = z.string().regex(/^[A-Z]{2}$/);
const department = z.string().regex(/^HT-[A-Z]{2}$/);
const category = z.enum(interestCodes);
const reference = z.string().trim().max(300).regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(\/[^\s?#\\]*)?$/)
  .refine((value) => URL.canParse(value));
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
const projectReadQuery = z.object({ preview: z.literal("review").optional() });

export function registerProjectRoutes(app: FastifyInstance, { viewer, repo, read, media }: ProjectRouteAccess & { media: PostMediaService | null }) {
  registerProjectWorkRoutes(app, { viewer, repo, read });
  registerProjectProgressRoutes(app, { viewer, repo, read, media });
  const mine = "/api/v1/me/projects";

  app.get(projectPath, async (request) => {
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
  app.get(projectPath + "/:id", async (request) => {
    const { preview } = projectReadQuery.parse(request.query);
    const { token, actor } = await viewer(request, !!preview);
    await read("profile", actor, request.ip);
    return repo().rpc<ProjectDetail>(token, preview ? "project_review_preview_for_client" : "project_detail_for_client",
      { p_id: id.parse(request.params).id });
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
  app.post(projectPath, { bodyLimit: 28_000 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = draft.parse(request.body);
    const projectId = await repo().rpc<string>(token, "project_create_for_client", {
      p_key: key, p_kind: input.kind, p_owner: input.owner, p_association: input.association, p_proposal: input.proposal,
    });
    return reply.code(201).send({ id: projectId });
  });
  app.patch(projectPath + "/:id", { bodyLimit: 28_000 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, proposal, removeImage: z.boolean() }).parse(request.body);
    return { version: await repo().rpc<number>(token, "project_edit_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_proposal: input.proposal, p_remove_image: input.removeImage,
    }) };
  });
  app.post(projectPath + "/:id/submit", { bodyLimit: 512 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version }).parse(request.body);
    return { version: await repo().rpc<number>(token, "project_submit_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version,
    }) };
  });
  app.patch(projectPath + "/:id/publication", { bodyLimit: 512 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ version, publish: z.boolean() }).parse(request.body);
    return { version: await repo().rpc<number>(token, "project_set_publication_for_client", {
      p_id: id.parse(request.params).id, p_version: input.version, p_publish: input.publish,
    }) };
  });
  app.put(projectPath + "/:id/image", { bodyLimit: 4_200_000 }, async (request) => {
    const { actor } = await viewer(request, true);
    if (!actor || !media?.uploadProjectImage) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image handling unavailable");
    const input = z.strictObject({ version, image: z.base64().max(4_194_304) }).parse(request.body);
    return { version: await media.uploadProjectImage(actor, id.parse(request.params).id, input.version, Buffer.from(input.image, "base64")) };
  });
  app.get(projectPath + "/:id/image", async (request, reply) => {
    const { preview } = projectReadQuery.parse(request.query);
    const { token, actor } = await viewer(request, !!preview);
    await read("media", actor, request.ip);
    const image = await repo().rpc<string | null>(token, preview ? "project_review_preview_media_for_client" : "project_media_for_client",
      { p_id: id.parse(request.params).id });
    if (!image) throw new ApiError(404, "ATTACHMENT_UNAVAILABLE", "Image unavailable");
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(Buffer.from(image, "base64"));
  });
  registerProjectReviewRoutes(app, { viewer, repo, read });
}
