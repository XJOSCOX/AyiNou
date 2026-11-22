export interface ActiveSession {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  remembered: boolean;
}

export interface ActiveSessionList {
  privileged: boolean;
  sessions: ActiveSession[];
}

export interface SessionRevocation {
  affected: number;
}

export interface PrivateFlow {
  id: string;
  kind: "organization_draft" | "revoke_other_sessions";
  step: "resume" | "confirm";
  version: number;
  expiresAt: string;
}

export interface PrivateFlowReceipt {
  state: "completed" | "cancelled";
  affected: number | null;
}
