import ht from "../messages/institution/ht.json";
import fr from "../messages/institution/fr.json";
import en from "../messages/institution/en.json";

import type { Locale } from "@ayinou/shared";
import es from "../messages/institution/es.json";
import { apiErrorCode } from "./api-errors";
export const institutionMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
export type InstitutionMessages = typeof en;

export function institutionError(messages: InstitutionMessages, cause: unknown) {
  const code = apiErrorCode(cause);
  const errors: Readonly<Record<string, string>> = { FORBIDDEN: messages.forbidden, INVALID_INPUT: messages.invalid,
    INVALID_IMAGE: messages.invalid, CONFLICT: messages.conflict, LIMIT_REACHED: messages.rate,
    VERIFICATION_REQUEST_PENDING: messages.personalRequestPending, VERIFICATION_ALREADY_VERIFIED: messages.personalAlreadyVerified };
  return errors[code] ?? messages.unavailable;
}
