import type { CommentTarget, FeedPost, NotificationPage, NotificationPreferences } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";

export const notificationRead = "ayinou:notification-read";

export async function loadNotifications(cursor: string | null, signal: AbortSignal) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const result: NotificationPage = await authorizedSocialRequest(`/api/v1/me/notifications${query}`, { signal });
  return { rows: result.notifications, nextCursor: result.nextCursor };
}

export const loadUnreadCount = (signal: AbortSignal): Promise<{ count: number }> =>
  authorizedSocialRequest("/api/v1/me/notifications/unread-count", { signal });

export async function markNotifications(id?: string) {
  await authorizedSocialRequest(id ? `/api/v1/me/notifications/${id}` : "/api/v1/me/notifications/read-all",
    id ? { method: "PATCH", body: JSON.stringify({ read: true }) } : { method: "POST" });
  window.dispatchEvent(new Event(notificationRead));
}

export const loadNotificationPreferences = (signal: AbortSignal): Promise<NotificationPreferences> =>
  authorizedSocialRequest("/api/v1/me/notification-preferences", { signal });

export const saveNotificationPreferences = (preferences: NotificationPreferences): Promise<NotificationPreferences> =>
  authorizedSocialRequest("/api/v1/me/notification-preferences", { method: "PUT", body: JSON.stringify(preferences) });

export const loadPostDetail = (id: string, signal: AbortSignal): Promise<{ post: FeedPost }> =>
  authorizedSocialRequest(`/api/v1/posts/${encodeURIComponent(id)}`, { signal });

export const loadLinkedComment = (post: string, comment: string, signal: AbortSignal): Promise<{ comment: CommentTarget }> =>
  authorizedSocialRequest(`/api/v1/posts/${encodeURIComponent(post)}/comments/${encodeURIComponent(comment)}`, { signal });
