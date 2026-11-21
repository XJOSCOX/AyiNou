import en from "../messages/early-partners/en.json";
import es from "../messages/early-partners/es.json";
import fr from "../messages/early-partners/fr.json";
import ht from "../messages/early-partners/ht.json";

export const earlyPartnerMessages = { en, es, fr, ht };
export function earlyPartnerLabel(messages: typeof en, key: string) {
  return Object.hasOwn(messages, key) ? messages[key as keyof typeof en] : messages.activity;
}
