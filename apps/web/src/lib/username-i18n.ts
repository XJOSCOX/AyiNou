import type { Locale } from "@ayinou/shared";
import en from "../messages/username/en.json";
import es from "../messages/username/es.json";
import fr from "../messages/username/fr.json";
import ht from "../messages/username/ht.json";

export const usernameMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
