import type { Locale } from "@ayinou/shared";
import ht from "../messages/session-security/ht.json";
import fr from "../messages/session-security/fr.json";
import en from "../messages/session-security/en.json";
import es from "../messages/session-security/es.json";

export const sessionSecurityMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
