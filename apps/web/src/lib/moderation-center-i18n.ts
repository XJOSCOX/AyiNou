import type { Locale } from "@ayinou/shared";
import en from "@/messages/moderation-center/en.json";
import es from "@/messages/moderation-center/es.json";
import fr from "@/messages/moderation-center/fr.json";
import ht from "@/messages/moderation-center/ht.json";

export const moderationCenterMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
