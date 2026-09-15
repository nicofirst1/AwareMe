/**
 * Pure helpers for the Home screen's current-sitting period (expo-feedback
 * round 2026-09-15, issue 03, owner decision). The highlighted (primary)
 * period is the one whose sitting is "now": it flips at the midpoint
 * between the user's two configured notification times (§7
 * `morning_notification_time`/`evening_notification_time` — defaults
 * 08:00/21:00 flip at 14:30), replacing the old hardcoded "evening from
 * 17:00 local" boundary. Pure functions of the settings text and an
 * injectable `now`, so they're testable without a clock or a database —
 * same discipline as `reviewPeriod.ts`.
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
 * The period whose sitting the Home card highlights. With both settings
 * parseable, 'evening' from the midpoint between the two configured times
 * onward, 'morning' before it. If either setting fails to parse (missing,
 * malformed, or out of range — user-editable free text), falls back to the
 * old hardcoded rule: evening from 17:00 local, morning before it.
 *
 * Degenerate wraparound configs (morning > evening, e.g. 22:00/02:00) get
 * no special case: the same plain midpoint arithmetic yields a midday flip
 * (1320 + 120 → floor(1440 / 2) = 720 → 12:00). Intentionally one rule
 * with documented behaviour over two rules with a seam.
 */
export function currentSittingPeriod(
  morningHm: string | null | undefined,
  eveningHm: string | null | undefined,
  now: Date = new Date(),
): TimeOfDay {
  const morning = parseHmMinutes(morningHm ?? '');
  const evening = parseHmMinutes(eveningHm ?? '');
  if (morning === null || evening === null) {
    return now.getHours() >= 17 ? 'evening' : 'morning';
  }
  const midpoint = Math.floor((morning + evening) / 2);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= midpoint ? 'evening' : 'morning';
}
