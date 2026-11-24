import type { Locale } from "@ayinou/shared";
import en from "../messages/moderation-policy/en.json";
import fr from "../messages/moderation-policy/fr.json";
import es from "../messages/moderation-policy/es.json";
import ht from "../messages/moderation-policy/ht.json";

export const moderationPolicyMessages = { en, fr, es, ht } satisfies Record<Locale, typeof en>;
