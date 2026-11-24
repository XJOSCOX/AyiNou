import en from "../messages/feed-languages/en.json";
import ht from "../messages/feed-languages/ht.json";
import fr from "../messages/feed-languages/fr.json";
import es from "../messages/feed-languages/es.json";
import type { Locale } from "@ayinou/shared";

export const feedLanguageMessages: Record<Locale, typeof en> = { en, ht, fr, es };
