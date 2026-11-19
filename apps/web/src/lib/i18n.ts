import { locales, type Locale } from "@ayinou/shared";
import ht from "../messages/ht.json";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

export const messages = { ht, fr, en, es } satisfies Record<Locale, typeof en>;
export { locales, type Locale };
export const defaultLocale = "ht";
export const localeCookie = "ayinou-locale";
export const localeMaxAge = 31_536_000;
export const languageNames = { ht: "Kreyòl ayisyen", fr: "Français", en: "English", es: "Español" } satisfies Record<Locale, string>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}
