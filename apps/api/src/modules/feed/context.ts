import type { FastifyRequest } from "fastify";
import { ApiError } from "../../services/api-error.js";
import type { AuthVerifier } from "../../services/auth.js";
import type { FeedRepository } from "../../services/feed.js";
import type { PostMediaService } from "../../services/post-media.js";
import type { ReadBudget } from "../../services/read-budget.js";

export function createFeedRouteContext(auth: AuthVerifier | null, repository: FeedRepository | null,
  media: PostMediaService | null, read: ReadBudget) {
  function repo() {
    if (!repository) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Feed service unavailable");
    return repository;
  }

  async function viewer(request: FastifyRequest, required = false) {
    const header = request.headers.authorization;
    const token = /^Bearer ([^\s]+)$/.exec(header ?? "")?.[1];
    if (!header && !required) return { actor: null, token: null };
    if (!auth) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Authentication service unavailable");
    const actor = token ? await auth.verify(token) : null;
    if (!actor || !token) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    return { actor, token };
  }

  function storage() {
    if (!media) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");
    return media;
  }

  function cleanMedia(request: FastifyRequest) {
    void media?.cleanup().catch(() => request.log.warn("Post media cleanup deferred"));
  }

  async function requireRecentMfa(token: string | null) {
    if (!await auth!.verify(token!, true)) throw new ApiError(403, "MFA_REQUIRED", "Recent authenticator verification is required");
  }

  async function moderator(request: FastifyRequest, scope?: { community: string } | { post: string }) {
    const { token, actor } = await viewer(request, true);
    const allowed = !scope ? await repo().rpc<boolean>(token, "feed_moderation_access")
      : "community" in scope ? await repo().rpc<boolean>(token, "can_review_department_for_client", { p_key: scope.community })
      : await repo().rpc<boolean>(token, "can_review_post_for_client", { p_id: scope.post });
    if (!allowed) {
      throw new ApiError(403, "FORBIDDEN", "A moderation role is required");
    }
    await requireRecentMfa(token);
    return { token, actor };
  }

  return { viewer, repo, read, storage, cleanMedia, moderator, requireRecentMfa };
}

export type FeedRouteContext = ReturnType<typeof createFeedRouteContext>;
