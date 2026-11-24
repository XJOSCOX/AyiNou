import type { Locale } from "@ayinou/shared";
import en from "../messages/feature-enforcement/en.json";
import es from "../messages/feature-enforcement/es.json";
import fr from "../messages/feature-enforcement/fr.json";
import ht from "../messages/feature-enforcement/ht.json";

export const featureMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
