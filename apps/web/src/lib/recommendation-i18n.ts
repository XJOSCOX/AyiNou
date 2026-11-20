import type { Locale } from "@ayinou/shared";
import ht from "../messages/recommendations/ht.json";
import fr from "../messages/recommendations/fr.json";
import en from "../messages/recommendations/en.json";
import es from "../messages/recommendations/es.json";

export const recommendationMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
