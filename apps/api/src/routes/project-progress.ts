import type { FastifyInstance, FastifyRequest } from "fastify";
import { projectProgressKinds, type ProjectProgress } from "@ayinou/shared";
import { z } from "zod";
import { ApiError } from "../services/api-error.js";
import type { FeedRepository } from "../services/feed.js";
import type { PostMediaService } from "../services/post-media.js";
import type { ReadBudget } from "../services/read-budget.js";

const params = z.strictObject({ id: z.uuid() });
const mediaParams = params.extend({ entry: z.uuid() });
const version = z.number().int().positive().max(2147483647);
const idVersion = { id: z.uuid(), version };
const limited = (max: number, min = 3) => z.string().trim().min(min).max(max);
const date = z.iso.date();
const quantity = z.number().min(0).max(100_000_000);
const ref = z.string().max(300).regex(/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(\/[^\s?#\\]*)?$/).refine((value) => URL.canParse(value));
const milestone = {
  title: limited(120), description: limited(1500), startsOn: date.nullable(), targetOn: date.nullable(),
  target: quantity.nullable(), unit: limited(48, 1).nullable(), displayOrder: z.number().int().min(0).max(10000),
  publicRequested: z.boolean(), responsibleId: z.uuid().nullable(),
};
const metric = { name: limited(80, 2), unit: limited(48, 1), target: quantity };
const content = z.strictObject({ title: limited(120), description: limited(2400), summary: limited(1200),
  language: z.enum(["ht", "fr", "en", "es"]), references: z.array(ref).max(3), includeMetrics: z.boolean(),
  unfinished: limited(1200).optional(), challenges: limited(1200).optional(), lessons: limited(1200).optional(),
  nextSteps: limited(1200, 1).optional(), correction: limited(600).optional(),
});
const milestones = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("milestone_create"), key: z.uuid(), ...milestone }),
  z.strictObject({ action: z.literal("milestone_edit"), ...idVersion, ...milestone }),
  z.strictObject({ action: z.enum(["milestone_start", "milestone_block", "milestone_submit"]), ...idVersion }),
  z.strictObject({ action: z.enum(["milestone_approve", "milestone_return", "milestone_cancel", "milestone_hide"]), ...idVersion, reason: limited(600) }),
  z.strictObject({ action: z.literal("task_milestone"), ...idVersion, milestoneId: z.uuid().nullable() }),
]);
const metrics = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("metric_create"), ...metric }),
  z.strictObject({ action: z.literal("metric_edit"), ...idVersion, ...metric }),
  z.strictObject({ action: z.literal("metric_observe"), id: z.uuid(), startsOn: date, endsOn: date,
    actual: quantity, explanation: limited(800), reference: ref.nullable() }),
]);
const entries = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("entry_create"), key: z.uuid(), kind: z.enum(projectProgressKinds), visibility: z.enum(["team", "public"]),
    milestoneId: z.uuid().nullable(), supersedesId: z.uuid().nullable(), content }),
  z.strictObject({ action: z.literal("entry_edit"), ...idVersion, content }),
  z.strictObject({ action: z.enum(["entry_submit", "entry_remove_image"]), ...idVersion }),
  z.strictObject({ action: z.enum(["entry_approve", "entry_return", "entry_reject", "entry_withdraw"]), ...idVersion, reason: limited(600) }),
]);

export function registerProjectProgressRoutes(app: FastifyInstance, { viewer, repo, read, media }: {
  viewer(request: FastifyRequest, required?: boolean): Promise<{ actor: string | null; token: string | null }>;
  repo(): FeedRepository;
  read: ReadBudget;
  media: PostMediaService | null;
}) {
  const root = "/api/v1/projects/:id/progress";
  for (const internal of [false, true]) {
    app.get(root + (internal ? "/work" : ""), async (request) => {
      const { actor, token } = await viewer(request, internal);
      await read("profile", actor, request.ip);
      return repo().rpc<ProjectProgress>(token, "project_progress_for_client", {
        p_id: params.parse(request.params).id, p_internal: internal,
      });
    });
  }
  for (const [segment, schema, rpc] of [
    ["milestones", milestones, "project_milestone_for_client"],
    ["metrics", metrics, "project_metric_for_client"],
    ["entries", entries, "project_progress_entry_for_client"],
  ] as const) {
    app.post(root + "/" + segment, { bodyLimit: 20000 }, async (request) => {
      const { token } = await viewer(request, true);
      const { action, ...input } = schema.parse(request.body);
      return repo().rpc<{ id: string; version?: number }>(token, rpc, {
        p_id: params.parse(request.params).id, p_action: action, p_data: input,
      });
    });
  }
  app.get(root + "/entries/:entry/image", async (request, reply) => {
    const { actor, token } = await viewer(request);
    await read("media", actor, request.ip);
    const { id, entry } = mediaParams.parse(request.params);
    const image = await repo().rpc<string | null>(token, "project_progress_media_for_client", { p_id: id, p_entry: entry });
    if (!image) throw new ApiError(404, "PROJECT_EVIDENCE_UNAVAILABLE", "Evidence unavailable");
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(Buffer.from(image, "base64"));
  });
  app.put(root + "/entries/:entry/image", { bodyLimit: 4200000 }, async (request) => {
    const { actor } = await viewer(request, true);
    if (!actor || !media?.uploadProjectProgress) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image handling unavailable");
    const { id, entry } = mediaParams.parse(request.params);
    const data = z.strictObject({ version, image: z.base64().max(4194304) }).parse(request.body);
    return { version: await media.uploadProjectProgress(actor, id, entry, data.version, Buffer.from(data.image, "base64")) };
  });
}
