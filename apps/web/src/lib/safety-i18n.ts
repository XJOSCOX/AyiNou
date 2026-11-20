import type { Locale } from "@ayinou/shared";
import en from "../messages/safety/en.json";
import es from "../messages/safety/es.json";
import fr from "../messages/safety/fr.json";
import ht from "../messages/safety/ht.json";

export const safetyMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
