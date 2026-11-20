import type { Locale } from "@ayinou/shared";
import en from "../messages/privacy-lifecycle/en.json";
import ht from "../messages/privacy-lifecycle/ht.json";
import fr from "../messages/privacy-lifecycle/fr.json";
import es from "../messages/privacy-lifecycle/es.json";

export const lifecycleMessages = { en, ht, fr, es } satisfies Record<Locale, typeof en>;
