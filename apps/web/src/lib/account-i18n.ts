import ht from "../messages/account/ht.json";
import fr from "../messages/account/fr.json";
import en from "../messages/account/en.json";

import type { Locale } from "@ayinou/shared";
import es from "../messages/account/es.json";
export const accountMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
