/**
 * Timestamps stored three ways (spec §4.1.3): UTC ISO-8601 with
 * milliseconds, IANA timezone, and UTC offset in minutes, all captured at
 * the moment of the event — not derived later.
 */
export interface EventTime {
  at: string; // UTC ISO-8601 with ms, e.g. "2026-09-10T14:03:22.418Z"
  tz: string; // IANA zone, e.g. "Europe/Berlin"
  offsetMin: number; // minutes east of UTC at `at`, e.g. 120
}

export function nowEventTime(now: Date = new Date()): EventTime {
  return {
    at: now.toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMin: -now.getTimezoneOffset(),
  };
}
