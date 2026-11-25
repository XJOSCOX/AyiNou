export function needsEnabled(enabled: boolean | (() => Promise<boolean>)) {
  return typeof enabled === "function" ? enabled() : enabled;
}
