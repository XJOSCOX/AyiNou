import type { AffiliationEvent } from "@ayinou/shared";
import en from "../messages/affiliation/en.json";
import fr from "../messages/affiliation/fr.json";
import ht from "../messages/affiliation/ht.json";

export const affiliationMessages = { en, fr, ht };

export const affiliationEventLabels = {
  requested: "eventRequested", joined: "eventJoined", approved: "eventApproved", rejected: "eventRejected",
  withdrawn: "eventWithdrawn", suspended: "eventSuspended", reinstated: "eventReinstated", removed: "eventRemoved",
  left: "eventLeft", type_changed: "eventType", directory_changed: "eventDirectory", policy_changed: "eventPolicy",
  invited: "eventInvited", invitation_revoked: "eventInviteRevoked",
} as const satisfies Record<AffiliationEvent, keyof typeof en>;
