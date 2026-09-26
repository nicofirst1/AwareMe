/**
 * Pure helpers for the Home screen's current-practice period (expo-feedback
 * round 2026-09-15, issue 03, owner decision). The highlighted (primary)
 * period is the one whose configured notification time is circularly
 * closest to now — the day circle runs through midnight (packet-12 B2,
 * owner decision 2026-09-26: "midnight still the evening"), replacing the
 * original same-day midpoint between the two configured times (§7
 * `morning_notification_time`/`evening_notification_time` — defaults
 * 08:00/21:00) and the older hardcoded "evening from 17:00 local" boundary
 * before that. Pure functions of the settings text and an injectable
 * `now`, so they're testable without a clock or a database — same
 * discipline as `reviewPeriod.ts`.
 */
import type { TimeOfDay } from '@/db';

/**
 * Strict "H:MM"/"HH:MM" → minutes since midnight, or `null` on anything
 * else: non-string-shaped input, missing/extra digits, hours > 23 or
 * minutes > 59. Settings are user-editable free text, so callers may hand
 * us anything — never throw, just report `null` and let the caller pick a
 * fallback.
 */
export function parseHmMinutes(hm: string): number | null {
  if (typeof hm !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The period whose practice the Home card highlights. With both settings
 * parseable, the period whose configured alarm time is CIRCULARLY closest
 * to now (packet-12 B2, owner decision 2026-09-26): the distance runs
 * around the day circle through midnight, so with the §7 defaults
 * (08:00/21:00) the morning arc is 02:31–14:29 and the evening arc is
 * 14:30–02:30 through midnight — 2:00 is evening, 4:00 is morning. The
 * two tie points (14:30 and 02:30 for the defaults) fall to evening,
 * preserving the original >= at-or-past-the-midpoint convention. If either
 * setting fails to parse (missing, malformed, or out of range —
 * user-editable free text), falls back to the old hardcoded rule: evening
 * from 17:00 local, morning before it.
 *
 * Degenerate wraparound configs (morning > evening, e.g. 22:00/02:00) get
 * no special case: closest-of-two on the circle handles them with the one
 * rule — the arcs shrink to the two halves between the alarm times, and
 * both tie points fall to evening (22:00/02:00 → evening 22:00–12:00
 * through midnight, morning 12:01–21:59). Intentionally one rule with
 * documented behaviour over two rules with a seam.
 */
export function currentPracticePeriod(
  morningHm: string | null | undefined,
  eveningHm: string | null | undefined,
  now: Date = new Date(),
): TimeOfDay {
  const morning = parseHmMinutes(morningHm ?? '');
  const evening = parseHmMinutes(eveningHm ?? '');
  if (morning === null || evening === null) {
    return now.getHours() >= 17 ? 'evening' : 'morning';
  }
  const DAY_MINUTES = 1440;
  const forwardSteps = (from: number, to: number) => (to - from + DAY_MINUTES) % DAY_MINUTES;
  const circularDistance = (a: number, b: number) => Math.min(forwardSteps(a, b), forwardSteps(b, a));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Tie (equidistant) → evening, the >= convention carried over from the
  // midpoint rule.
  return circularDistance(nowMinutes, evening) <= circularDistance(nowMinutes, morning)
    ? 'evening'
    : 'morning';
}
