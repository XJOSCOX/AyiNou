import type { Locale } from "@ayinou/shared";
import ht from "../messages/discovery/ht.json";
import fr from "../messages/discovery/fr.json";
import en from "../messages/discovery/en.json";
import es from "../messages/discovery/es.json";

export const discoveryMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
