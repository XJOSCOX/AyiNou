import type { FastifyInstance } from "fastify";
import { postBodyLimit } from "@ayinou/shared";
import { z } from "zod";
import { content, identifiers, postInput, version, versionQuery } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

const postEdit = postInput.extend({ version });

export function registerPostWriteRoutes(app: FastifyInstance, { viewer, repo, cleanMedia }: FeedRouteContext) {
  app.post("/api/v1/posts", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const key = z.uuid().parse(request.headers["idempotency-key"]);
    const input = postInput.parse(request.body);
    content(input.body, postBodyLimit);
    const id = await repo().rpc<string>(token, "create_post_with_media_for_client", {
      p_body: input.body, p_language: input.language, p_visibility: input.visibility, p_submission: key,
      p_topics: input.topics ?? [], p_items: input.attachments ?? [],
    });
    return reply.code(201).send({ id });
  });
  app.patch("/api/v1/posts/:id", { bodyLimit: 16_384 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = postEdit.parse(request.body);
    content(input.body, postBodyLimit);
    const fields = { p_id: id, p_version: input.version, p_body: input.body, p_language: input.language, p_visibility: input.visibility };
    if (input.attachments) {
      await repo().rpc(token, "edit_post_with_media_for_client", { ...fields, p_topics: input.topics ?? null, p_items: input.attachments });
      cleanMedia(request);
    } else await repo().rpc(token, input.topics ? "edit_post_with_topics_for_client" : "mutate_post_for_client", {
      ...fields,
      ...(input.topics ? { p_topics: input.topics } : { p_delete: false }),
    });
    return reply.code(204).send();
  });

  app.delete("/api/v1/posts/:id", async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const input = versionQuery.parse(request.query);
    await repo().rpc(token, "mutate_post_for_client", {
      p_id: id, p_version: input.version, p_delete: true, p_body: null, p_language: null, p_visibility: null,
    });
    cleanMedia(request);
    return reply.code(204).send();
  });
}
