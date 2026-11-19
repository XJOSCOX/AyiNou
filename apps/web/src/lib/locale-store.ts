"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isLocale, type Locale } from "./i18n";

const eventName = "ayinou-locale-change";

function snapshot(): Locale {
  const value = document.cookie.split("; ").find((item) => item.startsWith("ayinou-locale="))?.split("=")[1]
    ?? window.localStorage.getItem("ayinou-locale");
  return value && isLocale(value) ? value : "ht";
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
  document.cookie = `ayinou-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.localStorage.setItem("ayinou-locale", next);
  window.dispatchEvent(new Event(eventName));
}

export function useLocale(): [Locale, (locale: Locale) => void] {
  const locale = useSyncExternalStore<Locale>(subscribe, snapshot, () => "ht");
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return [locale, updateLocale];
}
