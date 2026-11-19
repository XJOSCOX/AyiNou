import en from "../messages/membership/en.json";
import fr from "../messages/membership/fr.json";
import ht from "../messages/membership/ht.json";

import type { Locale } from "@ayinou/shared";
import es from "../messages/membership/es.json";
export const membershipMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
