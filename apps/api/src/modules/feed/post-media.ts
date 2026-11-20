import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../../services/api-error.js";
import { identifiers } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

export function registerPostMediaRoutes(app: FastifyInstance, { viewer, repo, read, storage, moderator }: FeedRouteContext) {
  const uploadIdentity = new WeakMap<FastifyRequest, { actor: string; id: string }>();

  app.post("/api/v1/me/post-media", {
    bodyLimit: 4_200_000,
    onRequest: async (request) => {
      const { actor, token } = await viewer(request, true);
      storage();
      const id = z.uuid().parse(request.headers["idempotency-key"]).toLowerCase();
      await repo().rpc(token, "post_upload_budget_for_client");
      uploadIdentity.set(request, { actor: actor!, id });
    },
  }, async (request, reply) => {
    const { actor, id } = uploadIdentity.get(request)!;
    const service = storage();
    const { image } = z.strictObject({ image: z.base64().min(4).max(4_194_304) }).parse(request.body);
    await service.cleanup().catch(() => request.log.warn("Post media cleanup deferred"));
    await service.upload(actor, id, Buffer.from(image, "base64"));
    return reply.code(201).send({ id });
  });
  app.get("/api/v1/posts/:id/attachments/:attachmentId/image", async (request, reply) => {
    const { id, attachmentId } = identifiers.extend({ attachmentId: z.uuid() }).parse(request.params);
    const query = z.strictObject({ variant: z.enum(["thumbnail", "display"]).default("thumbnail"), review: z.literal("true").optional() }).parse(request.query);
    const { actor, token } = query.review ? await moderator(request, { post: id }) : await viewer(request);
    await read("media", actor, request.ip);
    if (!await repo().rpc<boolean>(token, "can_download_post_media_for_client", {
      p_post: id, p_id: attachmentId, p_review: Boolean(query.review),
    })) throw new ApiError(404, "ATTACHMENT_UNAVAILABLE", "Image unavailable");
    const bytes = await storage().download(attachmentId.toLowerCase(), query.variant);
    return reply.type("image/webp").header("X-Content-Type-Options", "nosniff").send(bytes);
  });
}
