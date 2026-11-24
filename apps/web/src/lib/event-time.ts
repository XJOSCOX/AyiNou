function wallFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}

export function eventWallTime(instant: string | number, timeZone: string) {
  const parts = Object.fromEntries(wallFormatter(timeZone).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join("-") + "T" + parts.hour + ":" + parts.minute;
}

export function eventInstant(wall: string, timeZone: string, previous?: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return null;
  try {
    if (previous && eventWallTime(previous, timeZone) === wall) return new Date(previous).toISOString();
    const nominal = Date.parse(wall + ":00Z");
    if (!Number.isFinite(nominal)) return null;
    const candidates = [-24, 0, 24].map((hours) => {
      const sample = nominal + hours * 3_600_000;
      const offset = Date.parse(eventWallTime(sample, timeZone) + ":00Z") - sample;
      return nominal - offset;
    });
    const exact = candidates.filter((instant) => eventWallTime(instant, timeZone) === wall).sort((a, b) => a - b);
    return exact.length ? new Date(exact[0]).toISOString() : null;
  } catch {
    return null;
  }
}
