import en from "../messages/social-privacy/en.json";
import fr from "../messages/social-privacy/fr.json";
import ht from "../messages/social-privacy/ht.json";
import es from "../messages/social-privacy/es.json";
import type { Locale } from "@ayinou/shared";

export const f24Messages = { en, fr, ht, es } satisfies Record<Locale, typeof en>;
