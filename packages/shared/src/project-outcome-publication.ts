import type { OutcomeRequest } from "./project-outcomes.js";
import type { OutcomeFindingClass } from "./project-outcome-review.js";

export const outcomePublicationStatuses = [
  "draft", "submitted", "changes", "rejected", "appeal", "approved", "withdrawn", "invalidated",
] as const;
export type OutcomePublicationStatus = (typeof outcomePublicationStatuses)[number];

export type OutcomeDisclosure = {
  title: string;
  summary: string;
  limitations: string;
  classification: OutcomeRequest["classification"];
  finding: OutcomeFindingClass;
  startsOn: string | null;
  endsOn: string | null;
  reportedQuantity: number | null;
  supportedQuantity: number | null;
  unit: string | null;
  reviewedOn: string;
  corrected: boolean;
};
export type PublicOutcomeResult = OutcomeDisclosure & { publishedOn: string };
export type OutcomeDisclosurePacket = {
  disclosure: OutcomeDisclosure;
  findingExplanation: string;
  findingLimitations: string;
  rejectionReason: string | null;
  appealReason: string | null;
};
export type OutcomePublicationSummary = {
  id: string;
  department: string;
  status: OutcomePublicationStatus;
  revision: number;
  version: number;
  projectTitle: string;
  title: string;
};
export type OutcomePublicationEvent = { action: string; revision: number; at: string; note: string | null };
export type OutcomePublication = Omit<OutcomePublicationSummary, "id" | "status" | "revision" | "title"> & {
  id: string | null;
  status: OutcomePublicationStatus | null;
  revision: number | null;
  available: boolean;
  reviewer: string | null;
  assigned: boolean;
  accepted: boolean;
  assignmentLive: boolean;
  deadline: string | null;
  appealUntil: string | null;
  draft: OutcomeDisclosure | null;
  findingId: string | null;
  fingerprint: string | null;
  options: { id: string; classification: OutcomeFindingClass; reviewedAt: string; limitations: string }[] | null;
  history: OutcomePublicationEvent[];
};

export type OutcomePublicationRoster = {
  canAppoint: boolean;
  grants: { actor: string; label: string | null; version: number; expiresAt: string;
    eligible: boolean; state: "active" | "revoked" }[];
  candidates: { actor: string; label: string | null }[];
  history: OutcomePublicationEvent[];
};
export type OutcomePublicationReceipt = { version: number; revision?: number; snapshot?: OutcomeDisclosurePacket | null };
