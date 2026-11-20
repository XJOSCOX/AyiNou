import type { Locale } from "@ayinou/shared";
import ht from "../messages/errors/ht.json";
import fr from "../messages/errors/fr.json";
import en from "../messages/errors/en.json";
import es from "../messages/errors/es.json";
import { apiErrorCode } from "./api-errors";
import { discoveryMessages } from "./discovery-i18n";
import { recommendationMessages } from "./recommendation-i18n";

export const errorMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;

const messageByCode: Readonly<Partial<Record<string, keyof typeof en>>> = {
  NETWORK_ERROR: "network", TIMEOUT: "timeout", UNAUTHORIZED: "auth", FORBIDDEN: "permission", NOT_FOUND: "missing",
  BAD_REQUEST: "validation", INVALID_INPUT: "validation", INVALID_PROFILE: "validation",
  INVALID_CONTENT: "content", CONFLICT: "conflict", PAYLOAD_TOO_LARGE: "tooLarge", RATE_LIMITED: "rate",
  LIMIT_REACHED: "rate", MFA_REQUIRED: "mfa", DUPLICATE_REPORT: "duplicateReport",
};

export function localizedApiError(locale: Locale, cause: unknown) {
  const code = apiErrorCode(cause);
  if (code === "FOLLOW_CAP") return discoveryMessages[locale].followCap;
  if (code === "FEED_REFRESH_REQUIRED") return recommendationMessages[locale].expired;
  return errorMessages[locale][messageByCode[code] ?? "server"];
}
