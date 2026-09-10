/**
 * Pure notification-fire-time scheduling (spec §6.4). A fixed daily time
 * would let the user pre-compose endings mentally, which defeats the
 * exercise — so fire times are drawn uniformly at random within each
 * configured window, subject to a minimum 90-minute gap between any two.
 *
 * No SQLite, no `expo-notifications`, no wall clock: `now` and the random
 * seed are both inputs, so a given call is fully reproducible (same
 * arguments in, same fire times out) and the 64-notification cap, the
 * rolling 10-day horizon, and DST are all exercised as plain Date algebra.
 * `src/notifications/scheduler.ts` is the thin glue that supplies these
 * from the real clock, settings, and `expo-notifications`.
 */

import { mulberry32 } from '@/lib/prng';

/** One user-defined daily window, in device-local wall-clock time (spec §6.4). */
export interface NotificationWindow {
  start: string; // "HH:MM", local time
  end: string; // "HH:MM", local time, > start
}

export interface ScheduleInput {
  windows: readonly NotificationWindow[];
  sessionsPerDay: number; // fire times wanted per day, per window pool
  now: Date; // scheduling horizon starts here
  horizonDays?: number; // default 10, per §6.4's "rolling 10 days ahead"
  maxPending?: number; // default 64, iOS's cap on pending local notifications
  seed: number;
}

export const MIN_GAP_MS = 90 * 60 * 1000; // §6.4: minimum 90-minute gap
const DEFAULT_HORIZON_DAYS = 10;
const DEFAULT_MAX_PENDING = 64;

function parseHHMM(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

/**
 * A window's [start, end) on one specific local calendar day, as real
 * `Date`s. Built with the local-time `Date` constructor (year, month, day,
 * hour, minute), not by adding milliseconds to midnight — that's what makes
 * this correct across a DST transition: the JS engine resolves local
 * wall-clock fields against the host's timezone database, so "8am" on a
 * spring-forward day and "8am" the day before are both really 8am local,
 * even though the UTC gap between them isn't exactly 24 hours.
 */
function windowOnDay(window: NotificationWindow, day: Date): { start: Date; end: Date } {
  const s = parseHHMM(window.start);
  const e = parseHHMM(window.end);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.hour, s.minute, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), e.hour, e.minute, 0, 0);
  return { start, end };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

/**
 * Draws `count` uniformly random instants inside [start, end), rejecting
 * (and redrawing) any candidate that falls within `MIN_GAP_MS` of one
 * already accepted for the day. `random` is the caller's seeded generator,
 * threaded through so the whole multi-day schedule consumes one PRNG
 * stream and stays reproducible.
 */
function drawTimesInWindow(start: Date, end: Date, count: number, random: () => number): Date[] {
  const spanMs = end.getTime() - start.getTime();
  if (spanMs <= 0 || count <= 0) return [];

  const accepted: Date[] = [];
  // A window that's too short or too crowded for `count` well-spaced draws
  // still terminates: cap attempts and return whatever fit, rather than
  // spinning forever chasing a geometrically shrinking pool of open slots.
  const maxAttempts = count * 200;
  let attempts = 0;
  while (accepted.length < count && attempts < maxAttempts) {
    attempts++;
    const candidateMs = start.getTime() + Math.floor(random() * spanMs);
    const candidate = new Date(candidateMs);
    const tooClose = accepted.some((t) => Math.abs(t.getTime() - candidate.getTime()) < MIN_GAP_MS);
    if (!tooClose) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * The full rolling schedule from `input.now` out to the horizon: for each
 * of the next `horizonDays` local calendar days, draws `sessionsPerDay`
 * times per configured window (spread across windows if there's more than
 * one — each window gets its own share, floor-divided with the remainder
 * given to the earliest windows), enforces the 90-minute gap globally
 * across the whole day (not just within one window), drops any time
 * already in the past relative to `now`, and truncates the overall result
 * to `maxPending`.
 *
 * Pure and deterministic: identical `input` (including `seed`) always
 * produces identical output, which is what makes calling this again after
 * a no-op reschedule idempotent.
 */
export function generateFireTimes(input: ScheduleInput): Date[] {
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const maxPending = input.maxPending ?? DEFAULT_MAX_PENDING;
  if (input.windows.length === 0 || input.sessionsPerDay <= 0) return [];

  const random = mulberry32(input.seed);
  const perWindowCounts = splitCount(input.sessionsPerDay, input.windows.length);

  const results: Date[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const day = addDays(input.now, d);
    const dayTimes: Date[] = [];

    input.windows.forEach((window, i) => {
      const { start, end } = windowOnDay(window, day);
      // Redraw against times already placed earlier the same day (other
      // windows), so the 90-minute gap holds across the whole day, not
      // just within a single window.
      const drawn = drawTimesInWindow(start, end, perWindowCounts[i], random);
      for (const t of drawn) {
        if (dayTimes.some((existing) => Math.abs(existing.getTime() - t.getTime()) < MIN_GAP_MS)) continue;
        dayTimes.push(t);
      }
    });

    for (const t of dayTimes) {
      if (t.getTime() > input.now.getTime()) results.push(t);
    }
  }

  results.sort((a, b) => a.getTime() - b.getTime());
  return results.slice(0, maxPending);
}

/** Splits `total` as evenly as possible across `parts`, remainder to the first parts. */
function splitCount(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
