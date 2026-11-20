export const privacyRequestKinds = ["access", "correction", "export", "closure", "deletion", "restriction", "appeal"] as const;
export type PrivacyRequestKind = typeof privacyRequestKinds[number];
export type PrivacyRequestState = "received" | "withdrawn";

export interface PrivacyRequestReceipt {
  id: string;
  version: number;
  state: PrivacyRequestState;
}

export interface PrivacyRequestSummary extends PrivacyRequestReceipt {
  kind: PrivacyRequestKind;
  createdAt: string;
  nextAction: "await_policy" | "none";
}

export interface PrivacyRequestDetail extends PrivacyRequestSummary {
  events: { state: PrivacyRequestState; version: number; at: string }[];
}

export interface PrivacyRequestPage {
  cases: PrivacyRequestSummary[];
  nextCursor: string | null;
}
