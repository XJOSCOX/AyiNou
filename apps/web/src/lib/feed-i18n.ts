import type { Locale } from "@ayinou/shared";
import ht from "../messages/feed/ht.json";
import fr from "../messages/feed/fr.json";
import en from "../messages/feed/en.json";
import es from "../messages/feed/es.json";

export const feedMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
