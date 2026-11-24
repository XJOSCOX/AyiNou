import type { Locale } from "@ayinou/shared";
import ht from "../messages/errors/ht.json";
import fr from "../messages/errors/fr.json";
import en from "../messages/errors/en.json";
import es from "../messages/errors/es.json";
import { apiErrorCode } from "./api-errors";
import { discoveryMessages } from "./discovery-i18n";
import { recommendationMessages } from "./recommendation-i18n";
import { safetyMessages } from "./safety-i18n";
import { communityDirectoryMessages } from "./communities-i18n";
import { groupMessages } from "./groups-i18n";
import { communityDiscoveryMessages } from "./community-discovery-i18n";
import { trustMessages } from "./trust-i18n";
import { governanceMessages } from "./governance-i18n";
import { ambassadorMessages } from "./ambassador-i18n";
import { organizationRoleMessages } from "./organization-role-i18n";
import { projectMessages } from "./project-i18n";
import { projectWorkMessages } from "./project-work-i18n";
import { projectProgressMessages } from "./project-progress-i18n";
import { featureMessages } from "./feature-enforcement-i18n";
import { pollMessages } from "./poll-i18n";

export const errorMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;

const messageByCode: Readonly<Partial<Record<string, keyof typeof en>>> = {
  NETWORK_ERROR: "network", TIMEOUT: "timeout", UNAUTHORIZED: "auth", FORBIDDEN: "permission", NOT_FOUND: "missing",
  BAD_REQUEST: "validation", INVALID_INPUT: "validation", INVALID_PROFILE: "validation",
  INVALID_CONTENT: "content", CONFLICT: "conflict", PAYLOAD_TOO_LARGE: "tooLarge", RATE_LIMITED: "rate",
  LIMIT_REACHED: "rate", MFA_REQUIRED: "mfa", DUPLICATE_REPORT: "duplicateReport",
  INVALID_IMAGE: "invalidImage", UNSUPPORTED_IMAGE: "unsupportedImage", IMAGE_PROCESSING: "imageProcessing",
  STORAGE_UNAVAILABLE: "imageStorage", IMAGE_BUSY: "imageBusy", MEDIA_CAP: "imageCap", ATTACHMENT_UNAVAILABLE: "imageUnavailable",
};

export function localizedApiError(locale: Locale, cause: unknown) {
  const code = apiErrorCode(cause);
  const safety = safetyMessages[locale];
  switch (code) {
    case "FEATURE_RESTRICTED": return featureMessages[locale].blocked;
    case "FEATURE_RESTRICTION_LIMIT": return featureMessages[locale].limit;
    case "GOVERNANCE_REQUIRED": return governanceMessages[locale].protectedRole;
    case "CLAIM_APPROVAL_HELD": return governanceMessages[locale].claimHeld;
    case "COMMUNITY_UNAVAILABLE": return communityDirectoryMessages[locale].unavailable;
    case "COMMUNITY_MEMBERSHIP_REQUIRED": return communityDirectoryMessages[locale].membership;
    case "COMMUNITY_RECOMMENDATIONS_EXPIRED": return communityDiscoveryMessages[locale].expired;
    case "COMMUNITY_FEEDBACK_LIMIT": return communityDiscoveryMessages[locale].feedbackLimit;
    case "TRUST_CASE_UNAVAILABLE": return trustMessages[locale].unavailable;
    case "VERIFICATION_APPEAL_EXISTS": return trustMessages[locale].appealExists;
    case "VERIFICATION_APPEAL_EXPIRED": return trustMessages[locale].appealExpired;
    case "VERIFICATION_ASSIGNMENT_REQUIRED": return trustMessages[locale].assignmentRequired;
    case "INSTITUTION_EVIDENCE_REQUIRED": return trustMessages[locale].institutionEvidenceRequired;
    case "AMBASSADOR_UNAVAILABLE": return ambassadorMessages[locale].unavailable;
    case "AMBASSADOR_CASE_CHANGED": return ambassadorMessages[locale].changed;
    case "AMBASSADOR_PUBLIC_ELIGIBILITY": return ambassadorMessages[locale].eligibility;
    case "ORGANIZATION_ROLE_UNAVAILABLE": return organizationRoleMessages[locale].unavailable;
    case "ORGANIZATION_ROLE_CHANGED": return organizationRoleMessages[locale].changed;
    case "ORGANIZATION_PERMISSION_PROTECTED": return organizationRoleMessages[locale].permissionProtected;
    case "ORGANIZATION_ROLE_NAME_CONFLICT": return organizationRoleMessages[locale].duplicate;
    case "ORGANIZATION_GRANT_DENIED": return organizationRoleMessages[locale].grantDenied;
    case "ORGANIZATION_RELATIONSHIP_UNAVAILABLE": return organizationRoleMessages[locale].relationshipUnavailable;
    case "PROJECT_INVALID": return projectMessages[locale].invalid;
    case "PROJECT_UNAVAILABLE": return projectMessages[locale].unavailable;
    case "PROJECT_CHANGED": return projectMessages[locale].changed;
    case "PROJECT_OWNER_UNAVAILABLE": return projectMessages[locale].ownerUnavailable;
    case "PROJECT_REVIEW_UNAVAILABLE": return projectMessages[locale].reviewUnavailable;
    case "PROJECT_IDENTITY_REQUIRED": return projectMessages[locale].identity.required;
    case "PROJECT_IDENTITY_PENDING": return projectMessages[locale].identity.pending;
    case "PROJECT_IDENTITY_REVOKED": return projectMessages[locale].identity.revoked;
    case "PROJECT_INSTITUTION_AUTHORITY_UNAVAILABLE": return projectMessages[locale].institutionAuthorityUnavailable;
    case "PROJECT_COMMUNITY_AUTHORITY_UNAVAILABLE": return projectMessages[locale].communityAuthorityUnavailable;
    case "PROJECT_WORK_INACTIVE": return projectWorkMessages[locale].errors.inactive;
    case "PROJECT_INVITATION_EXPIRED": return projectWorkMessages[locale].errors.expired;
    case "PROJECT_TEAM_UNAVAILABLE": return projectWorkMessages[locale].errors.teamUnavailable;
    case "PROJECT_VOLUNTEER_UNAVAILABLE": return projectWorkMessages[locale].errors.volunteerUnavailable;
    case "PROJECT_TASK_UNAVAILABLE": return projectWorkMessages[locale].errors.taskUnavailable;
    case "PROJECT_TASK_CHANGED": return projectWorkMessages[locale].errors.taskChanged;
    case "PROJECT_WORK_CONFLICT": return projectWorkMessages[locale].errors.conflict;
    case "PROJECT_PROGRESS_REVIEW_CONFLICT": return projectProgressMessages[locale].errors.reviewConflict;
    case "PROJECT_PROGRESS_UNAVAILABLE": return projectProgressMessages[locale].errors.unavailable;
    case "PROJECT_METRIC_INVALID": return projectProgressMessages[locale].errors.metricInvalid;
    case "PROJECT_EVIDENCE_UNAVAILABLE": return projectProgressMessages[locale].errors.evidenceUnavailable;
    case "PROJECT_REPORT_UNAVAILABLE": return projectProgressMessages[locale].errors.reportUnavailable;
    case "PROJECT_PROGRESS_CHANGED": return projectProgressMessages[locale].errors.changed;
    case "POLL_INVALID":
    case "POLL_UNAVAILABLE":
    case "POLL_NOT_OPEN":
    case "POLL_CLOSED":
    case "POLL_BALLOT_EXISTS":
    case "POLL_NOT_ELIGIBLE":
    case "POLL_CHANGED":
    case "POLL_RESULT_UNAVAILABLE":
    case "POLL_NOMINEE_UNAVAILABLE":
    case "POLL_CANCELLED": return pollMessages[locale].errors[code];
    case "GROUP_RESERVED": return groupMessages[locale].reservedError;
    case "GROUP_CREATION_LIMIT": return groupMessages[locale].limitError;
    case "GROUP_NAME_IN_USE": return groupMessages[locale].duplicateError;
    case "GROUP_INVITATION_UNAVAILABLE": return groupMessages[locale].invitationError;
    case "GROUP_POLICY_CHANGED": return groupMessages[locale].changedError;
    case "GROUP_OWNER_REQUIRED": return groupMessages[locale].ownerError;
    case "SELF_SAFETY_ACTION": return safety.selfError;
    case "APPEAL_REVIEW_CONFLICT": return safety.conflictError;
    case "APPEAL_INELIGIBLE": return safety.ineligibleError;
    case "APPEAL_EXISTS": return safety.existsError;
    case "APPEAL_EXPIRED": return safety.expiredError;
    case "SAFETY_CAP": return safety.safetyCap;
  }
  if (code === "FOLLOW_CAP") return discoveryMessages[locale].followCap;
  if (code === "FEED_REFRESH_REQUIRED") return recommendationMessages[locale].expired;
  return errorMessages[locale][messageByCode[code] ?? "server"];
}
