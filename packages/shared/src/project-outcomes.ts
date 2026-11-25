export const outcomeSourceKinds = ["milestone", "observation", "progress_report", "final_report", "accomplishment"] as const;
export const outcomeClassifications = ["output", "outcome"] as const;

export type OutcomeSourceKind = (typeof outcomeSourceKinds)[number];
export type OutcomeClassification = (typeof outcomeClassifications)[number];
export type OutcomeRequestStatus = "draft" | "submitted" | "withdrawn";

export type OutcomeResult = {
  title: string;
  reportedResult: string;
  measurement: number | null;
  unit: string | null;
  startsOn: string | null;
  endsOn: string | null;
  internallyReviewed: boolean;
  evidence: Array<{ sourceId: string; revision: number } &
    ({ kind: "reference"; reference: string } | { kind: "image"; digest: string })>;
};

export type OutcomeSource = {
  id: string;
  revision: number;
  fingerprint: string;
  result: OutcomeResult;
};

export type OutcomeSummary = {
  id: string;
  sourceKind: OutcomeSourceKind;
  title: string;
  status: OutcomeRequestStatus;
  createdAt: string;
};

export type OutcomeRequest = Omit<OutcomeSummary, "title"> & {
  projectId: string;
  mine?: boolean;
  sourceId: string;
  sourceRevision: number;
  result: OutcomeResult;
  submittedAt: string | null;
  revision: number;
  classification: OutcomeClassification;
  explanation: string;
  history: Array<{
    revision: number;
    action: "create" | "edit" | "submit" | "withdraw";
    status: OutcomeRequestStatus;
    classification: OutcomeClassification;
    explanation: string;
    occurredAt: string;
  }>;
};

export type OutcomePage<T> = { items: T[]; nextCursor: string | null };
