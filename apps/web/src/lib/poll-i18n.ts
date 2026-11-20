import en from "../messages/polls/en.json";
import ht from "../messages/polls/ht.json";
import fr from "../messages/polls/fr.json";
import es from "../messages/polls/es.json";
import type { Locale } from "@ayinou/shared";

export const pollMessages: Record<Locale, typeof en> = { en, ht, fr, es };
