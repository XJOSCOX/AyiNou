import ht from "../messages/auth/ht.json";
import fr from "../messages/auth/fr.json";
import en from "../messages/auth/en.json";

import type { Locale } from "@ayinou/shared";
import es from "../messages/auth/es.json";
export const authMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
