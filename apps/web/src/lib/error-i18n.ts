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
    case "COMMUNITY_UNAVAILABLE": return communityDirectoryMessages[locale].unavailable;
    case "COMMUNITY_MEMBERSHIP_REQUIRED": return communityDirectoryMessages[locale].membership;
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
