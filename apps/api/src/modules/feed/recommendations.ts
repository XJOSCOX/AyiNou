import type { FastifyInstance } from "fastify";
import { interestCodes, recommendationActions, type RecommendationSettings } from "@ayinou/shared";
import { z } from "zod";
import { identifiers, topics } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

export function registerRecommendationRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  app.get("/api/v1/recommendations/settings", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("feed", actor, request.ip);
    return repo().rpc<RecommendationSettings>(token, "recommendation_settings_for_client");
  });
  app.put("/api/v1/recommendations/settings", { bodyLimit: 2_048 }, async (request) => {
    const { token } = await viewer(request, true);
    const input = z.strictObject({ topics: z.array(z.enum(interestCodes)).max(10).pipe(topics) }).parse(request.body);
    return repo().rpc<RecommendationSettings>(token, "save_recommendation_topics_for_client", { p_topics: input.topics });
  });
  app.post("/api/v1/posts/:id/recommendation-feedback", { bodyLimit: 1_024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    const { action } = z.strictObject({ action: z.enum(recommendationActions) }).parse(request.body);
    await repo().rpc(token, "recommendation_feedback_for_client", { p_post: id, p_action: action });
    return reply.code(204).send();
  });
  app.delete("/api/v1/recommendations/feedback", async (request) => {
    const { token } = await viewer(request, true);
    return repo().rpc<RecommendationSettings>(token, "clear_recommendation_feedback_for_client");
  });
}
