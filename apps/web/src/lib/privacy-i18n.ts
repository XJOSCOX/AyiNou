import type { Locale } from "@ayinou/shared";
import en from "../messages/privacy/en.json";
import es from "../messages/privacy/es.json";
import fr from "../messages/privacy/fr.json";
import ht from "../messages/privacy/ht.json";

export const privacyMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
