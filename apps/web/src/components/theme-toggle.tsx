"use client";

import { useSyncExternalStore } from "react";
import { messages } from "@/lib/i18n";
import { useLocale } from "@/lib/locale-store";
import { darkThemeQuery, themeStorageKey } from "@/lib/theme";

function subscribe(onChange: () => void) {
  function syncTheme() {
    document.documentElement.dataset.theme = readTheme();
    onChange();
  }
  const preference = window.matchMedia(darkThemeQuery);
  preference.addEventListener("change", syncTheme);
  window.addEventListener(themeStorageKey, syncTheme);
  window.addEventListener("storage", syncTheme);
  return () => {
    preference.removeEventListener("change", syncTheme);
    window.removeEventListener(themeStorageKey, syncTheme);
    window.removeEventListener("storage", syncTheme);
  };
}

function readTheme() {
  try {
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia(darkThemeQuery).matches ? "dark" : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}

function initialTheme(): ReturnType<typeof readTheme> {
  return "light";
}

export function ThemeToggle() {
  const [locale] = useLocale();
  const theme = useSyncExternalStore(subscribe, readTheme, initialTheme);
  const t = messages[locale];
  const label = theme === "dark" ? t.switchToLight : t.switchToDark;

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(themeStorageKey, next); } catch { /* The current page still reflects the choice. */ }
    window.dispatchEvent(new Event(themeStorageKey));
  }

  return (
    <button type="button" aria-label={label} title={label} onClick={toggleTheme}
      className="grid size-9 shrink-0 place-items-center rounded-e-md text-[var(--theme-link)] hover:bg-[var(--theme-selected)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--theme-link)]">
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {theme === "dark" ? <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
        </> : <path d="M20.5 15.1A8.8 8.8 0 0 1 8.9 3.5 9 9 0 1 0 20.5 15.1Z" />}
      </svg>
    </button>
  );
}
