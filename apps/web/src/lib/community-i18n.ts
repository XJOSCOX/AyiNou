import ht from "../messages/community/ht.json";
import fr from "../messages/community/fr.json";
import en from "../messages/community/en.json";

import type { Locale } from "@ayinou/shared";
import es from "../messages/community/es.json";
export const communityMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
