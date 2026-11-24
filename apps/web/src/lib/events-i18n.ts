import en from "../messages/events/en.json";
import ht from "../messages/events/ht.json";
import fr from "../messages/events/fr.json";
import es from "../messages/events/es.json";
import type { Locale } from "@ayinou/shared";

export const eventMessages: Record<Locale, typeof en> = { en, ht, fr, es };
