import type { Locale } from "@ayinou/shared";
import en from "../messages/privileged-setup/en.json";
import es from "../messages/privileged-setup/es.json";
import fr from "../messages/privileged-setup/fr.json";
import ht from "../messages/privileged-setup/ht.json";

export const privilegedSetupMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
