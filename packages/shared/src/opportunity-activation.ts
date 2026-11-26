export const opportunityActivationStages = ["drafts", "publication", "external", "interest", "discovery", "personalization",
  "mentorship_intake", "mentorship_matching", "mentorship_requests", "mentorship_coordination"] as const;
export const opportunityPauseScopes = ["opportunities", "mentorship", "all"] as const;

export type OpportunityActivationStage = typeof opportunityActivationStages[number];
export type OpportunityPauseScope = typeof opportunityPauseScopes[number];
export type OpportunityActivationCommand = "enable" | "pause" | "resume" | "emergency_pause";

export type OpportunityActivationRead = {
  version: number;
  emergency: Record<OpportunityPauseScope, string>;
  stages: {
    capability: OpportunityActivationStage;
    digest: string;
    status: "active" | "paused" | "disabled";
    readiness: {
      configuration: Partial<Record<"drafts" | "publication" | "discovery" | "intake" | "coordination", number>> & { catalog?: string };
      configurationPrepared: boolean;
      technicalReady: boolean;
      operationsApproved: boolean;
      privacyApproved: boolean;
      safeguardingApproved: boolean;
      reviewerReady: boolean | null;
      releaseAuthorized: boolean;
      dependencies: Partial<Record<OpportunityActivationStage, boolean>>;
    };
  }[];
  history: {
    version: number;
    capability: OpportunityActivationStage | OpportunityPauseScope;
    action: OpportunityActivationCommand | "readiness_changed";
    reason: string;
    affected: OpportunityActivationStage[];
    at: string;
  }[];
};
