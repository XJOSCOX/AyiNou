"use client";

import { useSyncExternalStore } from "react";
import type { FeedScope } from "@ayinou/shared";

type CommunityScope = Exclude<FeedScope, "mine">;
const storageKey = "ayinou-feed-mode";
const eventName = "ayinou-feed-mode-change";
let fallback: CommunityScope = "feed";

function subscribe(change: () => void) {
  window.addEventListener(eventName, change);
  return () => window.removeEventListener(eventName, change);
}

function readScope(): CommunityScope {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "feed" || stored === "for_you" || stored === "following") return stored;
  } catch { /* Storage can be unavailable in a restricted browser. */ }
  return fallback;
}

export function usePreferredFeedMode() {
  return useSyncExternalStore<CommunityScope>(subscribe, readScope, () => "feed");
}

export function rememberFeedMode(scope: CommunityScope) {
  fallback = scope;
  try { window.localStorage.setItem(storageKey, scope); } catch { /* Retain the selection in this tab. */ }
  window.dispatchEvent(new Event(eventName));
}
