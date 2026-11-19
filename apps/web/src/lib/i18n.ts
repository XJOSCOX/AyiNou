import ht from "../messages/ht.json";
import fr from "../messages/fr.json";
import en from "../messages/en.json";

export const messages = { ht, fr, en };
export type Locale = keyof typeof messages;
export const locales: Locale[] = ["ht", "fr", "en"];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
