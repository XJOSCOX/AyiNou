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
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-control)] text-lg hover:bg-[var(--theme-selected)]">
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
