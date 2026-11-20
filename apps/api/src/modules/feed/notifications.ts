import type { FastifyInstance } from "fastify";
import type { MemberNotification, NotificationPreferences } from "@ayinou/shared";
import { z } from "zod";
import { before, pageCursor, paginate } from "./pagination.js";
import { identifiers } from "./validation.js";
import type { FeedRouteContext } from "./context.js";

const preferenceInput = z.strictObject({ reactions: z.boolean(), comments: z.boolean(), replies: z.boolean(), followers: z.boolean() });

export function registerNotificationRoutes(app: FastifyInstance, { viewer, repo, read }: FeedRouteContext) {
  app.get("/api/v1/me/notifications", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    const { cursor, limit } = z.strictObject({
      cursor: pageCursor,
      limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(30)).optional(),
    }).parse(request.query);
    const rows = await repo().rpc<MemberNotification[]>(token, "notifications_for_client", { p_limit: limit ?? 20, ...before(cursor) });
    const { page, nextCursor } = paginate(rows, limit ?? 20);
    return { notifications: page, nextCursor };
  });
  app.get("/api/v1/me/notifications/unread-count", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    return { count: await repo().rpc<number>(token, "notification_count_for_client") };
  });
  app.patch("/api/v1/me/notifications/:id", { bodyLimit: 1024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    const { id } = identifiers.parse(request.params);
    z.strictObject({ read: z.literal(true) }).parse(request.body);
    await repo().rpc(token, "mark_notifications_for_client", { p_id: id });
    return reply.code(204).send();
  });
  app.post("/api/v1/me/notifications/read-all", { bodyLimit: 1024 }, async (request, reply) => {
    const { token } = await viewer(request, true);
    await repo().rpc(token, "mark_notifications_for_client", { p_id: null });
    return reply.code(204).send();
  });
  app.get("/api/v1/me/notification-preferences", async (request) => {
    const { actor, token } = await viewer(request, true);
    await read("notifications", actor, request.ip);
    return repo().rpc<NotificationPreferences>(token, "notification_preferences_for_client");
  });
  app.put("/api/v1/me/notification-preferences", { bodyLimit: 1024 }, async (request) => {
    const { token } = await viewer(request, true);
    const { reactions, comments, replies, followers } = preferenceInput.parse(request.body);
    return repo().rpc<NotificationPreferences>(token, "save_notification_preferences_for_client", {
      p_reactions: reactions, p_comments: comments, p_replies: replies, p_followers: followers,
    });
  });
}
