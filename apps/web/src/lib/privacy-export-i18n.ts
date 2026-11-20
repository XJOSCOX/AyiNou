import type { Locale } from "@ayinou/shared";
import en from "../messages/privacy-export/en.json";
import ht from "../messages/privacy-export/ht.json";
import fr from "../messages/privacy-export/fr.json";
import es from "../messages/privacy-export/es.json";

export const exportMessages = { en, ht, fr, es } satisfies Record<Locale, typeof en>;
