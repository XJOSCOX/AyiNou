"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readFragment = () => window.location.hash.slice(1);
const emptyFragment = () => "";

export function useLocationFragment() {
  return useSyncExternalStore(subscribe, readFragment, emptyFragment);
}
