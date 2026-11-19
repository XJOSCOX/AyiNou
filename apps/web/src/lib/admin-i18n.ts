import en from "@/messages/admin/en.json";
import fr from "@/messages/admin/fr.json";
import ht from "@/messages/admin/ht.json";

import type { Locale } from "@ayinou/shared";
import es from "@/messages/admin/es.json";
export const adminMessages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
