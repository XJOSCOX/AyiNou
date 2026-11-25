import type { CommunityNeedContent } from "./community-needs";

export type NeedPublicationContent = Omit<CommunityNeedContent, "references">;
export type NeedPublicationLane = "admin" | "review" | "triage";
export const needPublicationStates = [
  "unrequested", "pending", "published", "rejected", "changes_requested", "challenged", "hidden", "removed", "withdrawn", "stale",
] as const;
export type NeedPublicationState = typeof needPublicationStates[number];
export const needPublicationReasons = ["privacy", "clarity", "evidence"] as const;
export const needPublicationStaffActions = [
  "assign", "assign_challenge", "approve", "reject", "request_correction", "uphold", "return", "hide", "remove",
] as const;
export type NeedPublicationStaffAction = typeof needPublicationStaffActions[number];

export type NeedPublication = {
  id: string | null;
  revision: number;
  state: NeedPublicationState;
  published: boolean;
  snapshot?: { content: NeedPublicationContent; attribution: boolean; evidenceRevision: number } | null;
  canRequest?: boolean;
  evidenceRevision?: number;
  finding?: string | null;
  deadline?: string | null;
  history?: { action: string; state: NeedPublicationState; at: string; code?: string | null; reason?: string | null }[];
};

export type PublishedNeed = {
  id: string;
  content: NeedPublicationContent;
  publishedAt: string;
  attribution: { username: string; displayName: string } | null;
};

export type NeedPublicationPage<T> = { items: T[]; nextCursor: string | null };
