import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../../services/api-error.js";
import { before, paginate } from "./pagination.js";
import { feedQuery, identifiers } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

export function registerFeedTimelineRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  app.get("/api/v1/feed", async (request) => {
    const input = feedQuery.parse(request.query);
    const { actor, token } = await viewer(request, input.scope !== "feed");
    await read("feed", actor, request.ip);
    const limit = input.limit ?? 20;
    if (input.scope === "for_you") {
      let snapshot: string | null = null;
      let after = 0;
      if (input.cursor) {
        try {
          const cursor = z.strictObject({ snapshot: z.uuid(), after: z.number().int().min(1).max(80) })
            .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
          snapshot = cursor.snapshot;
          after = cursor.after;
        } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid recommendation cursor"); }
      }
      const ranked = await repo().recommendations(token, { p_snapshot: snapshot, p_after: after, p_limit: limit });
      const page = ranked.rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor = ranked.rows.length > limit && last
        ? Buffer.from(JSON.stringify({ snapshot: ranked.snapshotId, after: last.position })).toString("base64url") : null;
      return { posts: page.map(({ post }) => post), nextCursor, algorithmVersion: ranked.algorithmVersion };
    }
    const rows = await repo().read(token, { p_scope: input.scope, p_limit: limit, ...before(input.cursor), p_id: null });
    const { page, nextCursor } = paginate(rows, limit);
    return { posts: page, nextCursor };
  });
  app.get("/api/v1/posts/:id", async (request) => {
    const { id } = identifiers.parse(request.params);
    const { actor, token } = await viewer(request);
    await read("feed", actor, request.ip);
    const [post] = await repo().read(token, { p_scope: "feed", p_limit: 1, ...before(), p_id: id });
    if (!post) throw new ApiError(404, "NOT_FOUND", "Post unavailable");
    return { post };
  });
}
