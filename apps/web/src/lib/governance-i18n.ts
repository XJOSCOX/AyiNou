import en from "../messages/governance/en.json";
import es from "../messages/governance/es.json";
import fr from "../messages/governance/fr.json";
import ht from "../messages/governance/ht.json";

export const governanceMessages = { en, es, fr, ht };
export function governanceLabel(t: typeof en, code: string) {
  return Object.hasOwn(t, code) ? t[code as keyof typeof en] : t.protected;
}
