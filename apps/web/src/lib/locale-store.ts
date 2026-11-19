"use client";

import { createContext, createElement, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { defaultLocale, isLocale, localeCookie, localeMaxAge, messages, type Locale } from "./i18n";

const eventName = "ayinou-locale-change";

function snapshot(fallback: Locale): Locale {
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${localeCookie}=`))?.split("=")[1];
  if (isLocale(cookie)) return cookie;
  try {
    const stored = window.localStorage.getItem(localeCookie);
    if (isLocale(stored)) return stored;
  } catch { /* The cookie or server locale remains available. */ }
  return fallback;
}

function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}

function updateLocale(next: Locale) {
  document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=${localeMaxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  try { window.localStorage.setItem(localeCookie, next); } catch { /* Cookie persistence is still available. */ }
  window.dispatchEvent(new Event(eventName));
}

const LocaleContext = createContext<Locale>(defaultLocale);

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, () => snapshot(initial), () => initial);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].pageTitle;
    const text = messages[locale].validation;
    const touched = new Set<FormControl>();
    function clear(event: Event) {
      const field = event.target as FormControl;
      if (touched.delete(field)) field.setCustomValidity("");
    }
    function translate(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      if (touched.delete(field)) field.setCustomValidity("");
      const state = field.validity;
      if (state.valid || state.customError) return;
      const lengthField = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field : null;
      const input = field instanceof HTMLInputElement ? field : null;
      const message = state.valueMissing ? text.required
        : state.typeMismatch && input?.type === "email" ? text.email
        : state.typeMismatch && input?.type === "url" ? text.url
        : state.tooShort && lengthField ? text.tooShort.replace("{min}", String(lengthField.minLength))
        : state.tooLong && lengthField ? text.tooLong.replace("{max}", String(lengthField.maxLength))
        : state.rangeUnderflow && input ? text.underMin.replace("{min}", input.min)
        : state.rangeOverflow && input ? text.overMax.replace("{max}", input.max)
        : text.invalid;
      field.setCustomValidity(message);
      touched.add(field);
    }
    document.addEventListener("invalid", translate, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", translate, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
      for (const field of touched) field.setCustomValidity("");
    };
  }, [locale]);

  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useLocale(): [Locale, (locale: Locale) => void] {
  return [useContext(LocaleContext), updateLocale];
}
