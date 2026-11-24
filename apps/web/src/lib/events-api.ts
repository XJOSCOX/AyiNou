import type { CommunityEvent, EventParticipant, EventUpdate } from "@ayinou/shared";
import { authorizedSocialRequest } from "./feed-api";
import { requestJson } from "./api-errors";

export type EventOptions = {
  enabled: boolean; discovery: boolean; individual: boolean;
  organizations: { id: string; name: string }[]; communities: { id: string; name: string }[];
};
export type EventReport = {
  id: string; createdAt: string; title: string; eventId: string; category: string; note: string | null; restricted: boolean;
};
const path = "/api/v1/events";
type EventPage<T> = { page: T[]; nextCursor: string | null };

async function page<T>(resource: string, query: URLSearchParams, cursor: string | null, signal: AbortSignal, signedIn = true) {
  if (cursor) query.set("cursor", cursor);
  const endpoint = resource + "?" + query.toString();
  const data: EventPage<T> = signedIn ? await authorizedSocialRequest(endpoint, { signal })
    : await requestJson((process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000") + endpoint, { signal });
  return { rows: data.page, nextCursor: data.nextCursor };
}

export const loadEventOptions = (signal: AbortSignal): Promise<EventOptions> => authorizedSocialRequest(path + "/capabilities", { signal });
export const loadEvents = (query: string, cursor: string | null, signal: AbortSignal) =>
  page<CommunityEvent>(path, new URLSearchParams(query), cursor, signal);
export const loadEventUpdates = (id: string, signedIn: boolean, cursor: string | null, signal: AbortSignal) =>
  page<EventUpdate>(path + "/" + id + "/updates", new URLSearchParams(), cursor, signal, signedIn);
export const loadParticipants = (id: string, cursor: string | null, signal: AbortSignal) =>
  page<EventParticipant>(path + "/" + id + "/participants", new URLSearchParams(), cursor, signal);
export const loadEventReports = (cursor: string | null, signal: AbortSignal) =>
  page<EventReport>(path + "/moderation/reports", new URLSearchParams(), cursor, signal);
export async function writeEvent<T>(method: "POST" | "PUT", suffix: string, body: object): Promise<T> {
  return authorizedSocialRequest(path + suffix, { method, body: JSON.stringify(body) });
}
export const loadEventNotices = (signal: AbortSignal): Promise<{ enabled: boolean }> =>
  authorizedSocialRequest(path + "/notification-preference", { signal });
