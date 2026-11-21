import en from "@/messages/organization-onboarding/en.json";
import es from "@/messages/organization-onboarding/es.json";
import fr from "@/messages/organization-onboarding/fr.json";
import ht from "@/messages/organization-onboarding/ht.json";
import type { Locale } from "./i18n";

export const organizationOnboardingMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;
