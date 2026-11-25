export const pilotStages = ["intake", "review", "publication", "association"] as const;
export const pilotRequirements = ["privacy", "support", "databaseRecovery", "storageRecovery", "release", "launchBlockers"] as const;
export const pilotMetrics = ["weekly", "pending", "awaitingReview", "challenges", "publications", "associations", "conflicts"] as const;

export type PilotStages = Record<typeof pilotStages[number], boolean>;
export type PilotDecision = "configure" | "enroll" | "remove" | "activate" | "pause" | "resume";
export type PilotStatus = "unconfigured" | "prepared" | "active" | "paused" | "expired" | "blocked";

export interface PilotWorkspace {
  revision: number;
  status: PilotStatus;
  scope: "ouest";
  scopeAvailable: boolean;
  capacity: number;
  durationDays: number;
  endsAt: string | null;
  stages: PilotStages;
  requirements: Record<typeof pilotRequirements[number], "pending" | "verified">;
  releaseConfigured: boolean;
  ready: boolean;
  activeParticipants: number;
  triagers: number;
  reviewers: number;
  enrollments: { id: string; handle: string | null; expiresAt: string; status: "removed" | "expired" | "eligible" | "blocked" }[];
  staff: { id: string; handle: string | null; lane: "review" | "triage"; eligible: boolean; expiresAt: string; revoked: boolean; assigned: number; challenges: number }[];
  metrics: Record<typeof pilotMetrics[number], number> | null;
  candidates: { id: string; handle: string }[];
  history: { revision: number; action: PilotDecision; reason: string; occurredAt: string; actor: string | null; subject: string | null }[];
  hasMore: boolean;
}
