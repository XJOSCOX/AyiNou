import type { Locale } from "@ayinou/shared";
import ht from "../messages/media-notifications/ht.json";
import fr from "../messages/media-notifications/fr.json";
import en from "../messages/media-notifications/en.json";
import es from "../messages/media-notifications/es.json";

export const mediaNotificationMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
