import type { Locale } from "@ayinou/shared";
import en from "../messages/enforcement-appeals/en.json";
import es from "../messages/enforcement-appeals/es.json";
import fr from "../messages/enforcement-appeals/fr.json";
import ht from "../messages/enforcement-appeals/ht.json";

export const enforcementAppealMessages = { en, es, fr, ht } satisfies Record<Locale, typeof en>;

export function appealHistoryLabels(locale: Locale) {
  const t = enforcementAppealMessages[locale];
  return {
    appeal_submit: t.submitted, appeal_correct: t.correct, appeal_assign: t.assigned, appeal_return: t.correction,
    appeal_uphold: t.upheld, appeal_overturn: t.overturn, appeal_release: t.release, appeal_decline_release: t.release_declined,
    appeal_withdraw: t.withdrawn, appeal_close: t.closed, appeal_conflict_denied: t.conflict_denied,
  };
}
