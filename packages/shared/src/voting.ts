import type { Locale } from "./core.js";
import type { ProjectIdentityState } from "./projects.js";

export const pollKinds = ["community", "priority", "decision", "person"] as const;
export const pollScopes = ["individual", "community", "organization", "project"] as const;
export const pollDecisions = ["recommend", "defer", "decline"] as const;
export type PollScope = (typeof pollScopes)[number];
export type PollKind = (typeof pollKinds)[number];
export type PollStatus = "draft" | "scheduled" | "open" | "awaiting_close" | "closed" | "cancelled";
export type PollEvent = "created" | "edited" | "published" | "finalized" | "cancelled" | "decision_recorded" |
  "nomination_accepted" | "nomination_declined" | "nomination_withdrawn";
export type PollNotice = "nomination_requested" | "finalized" | "cancelled" | "decision_recorded";
export type PollCard = {
  id: string; title: string; kind: PollKind; scope: PollScope; language: Locale;
  scopeName: string | null; status: PollStatus; policy: "advisory" | "governance"; closesAt: string; createdAt: string;
};
export type PollConfiguration = {
  title: string; description: string; language: Locale; audience: "members" | "scope"; eligibility: "active" | "verified";
  resultPolicy: "after_vote" | "after_close"; opensAt: string; closesAt: string; quorum: number | null; threshold: number | null;
};
export type PollResults = {
  total: number; options: { id: string; votes: number; percentage: number }[]; outcome: "no_votes" | "no_quorum" | "tie" |
    "withdrawn_leads" | "below_threshold" | "winner" | null; winnerId: string | null; quorumMet: boolean | null; thresholdMet: boolean | null;
};
export type PollDetail = PollCard & PollConfiguration & {
  scopeId: string | null; taskId: string | null; proposalRevision: number | null; finalizedAt: string | null;
  electorateSize: number | null; canManage: boolean; canVote: boolean; canModerate: boolean; version: number | null;
  ownBallot: string | null; results: PollResults | null; cancellationReason: string | null;
  decision: { disposition: (typeof pollDecisions)[number]; recommendedOptionId: string | null; reason: string; at: string } | null;
  options: { id: string; position: number; label: string | null; handle: string | null; available: boolean;
    consent: "pending" | "accepted" | "declined" | "withdrawn" | null }[];
  events: { id: string; action: PollEvent; version: number; reason: string | null; at: string }[];
};
type PollScopeOption = { id: string; name: string };
export type PollConfigOptions = {
  identity: ProjectIdentityState; communities: (PollScopeOption & { memberAudience: boolean })[];
  organizations: PollScopeOption[]; projects: (PollScopeOption & { tasks: PollScopeOption[] })[];
};
export type PollNomination = {
  id: string; pollId: string; title: string | null; description: string | null; language: Locale;
  consent: "pending" | "accepted"; canRespond: boolean;
};
