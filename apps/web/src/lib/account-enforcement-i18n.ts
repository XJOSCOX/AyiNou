import type { Locale } from "@ayinou/shared";
import en from "@/messages/account-enforcement/en.json";
import es from "@/messages/account-enforcement/es.json";
import fr from "@/messages/account-enforcement/fr.json";
import ht from "@/messages/account-enforcement/ht.json";

export const accountEnforcementMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
