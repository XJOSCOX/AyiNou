import type { Locale } from "@ayinou/shared";
import ht from "../messages/communities/ht.json";
import fr from "../messages/communities/fr.json";
import en from "../messages/communities/en.json";
import es from "../messages/communities/es.json";

export const communityDirectoryMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
