import type { Locale } from "./core";

export const eventCategories = ["community", "culture", "education", "volunteer", "other"] as const;
export const eventFormats = ["in_person", "online", "hybrid"] as const;
export const eventVisibilities = ["public", "members", "community"] as const;
export const eventStatuses = ["draft", "published", "canceled", "completed"] as const;
export const eventResponses = ["going", "interested", "not_going"] as const;
export const eventScopes = ["upcoming", "following", "communities", "past", "mine", "organizing"] as const;
export const eventPolicyKeys = [
  "events.enabled", "events.individual", "events.organization", "events.discovery", "events.rsvp", "events.notifications",
] as const;

export const f25FeaturePolicyKeys = [...eventPolicyKeys, "feed.language_filter", "feed.translation"] as const;
export type F25PolicyKey = typeof f25FeaturePolicyKeys[number];

export type EventCategory = typeof eventCategories[number];
export type EventFormat = typeof eventFormats[number];
export type EventVisibility = typeof eventVisibilities[number];
export type EventStatus = typeof eventStatuses[number];
export type EventResponse = typeof eventResponses[number];
export type EventScope = typeof eventScopes[number];

export interface EventInput {
  title: string; description: string; category: EventCategory; format: EventFormat; visibility: EventVisibility;
  startsAt: string; endsAt: string; timeZone: string; country: string | null; department: string | null;
  locality: string | null; venue: string | null; meetingUrl: string | null; coverUrl: string | null;
  capacity: number | null; projectId: string | null; language: Locale;
}
export interface EventOrganizer { kind: "member" | "organization"; name: string; handle: string | null; }
export interface EventPreview {
  id: string; title: string; organizer: EventOrganizer; startsAt: string; timeZone: string; status: Exclude<EventStatus, "draft">;
}
export interface CommunityEvent extends EventInput {
  id: string; createdAt: string; version: number; status: EventStatus;
  organizer: EventOrganizer; organizationId: string | null; communityId: string | null;
  canManage: boolean; canComplete: boolean; canRsvp: boolean; canShare: boolean; response: EventResponse | null; listMe: boolean;
  counts: Record<EventResponse, number> | null;
}
export interface EventParticipant {
  id: string; createdAt: string; username: string | null; name: string | null; response: EventResponse;
}
export interface EventUpdate { id: string; createdAt: string; body: string; }
