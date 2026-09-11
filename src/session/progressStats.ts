/**
 * Progress screen stats (gamification proposal §1.C/§4): totals + streaks,
 * computed at read time from the same `BadgeSession` shape `badges.ts`
 * derives from. No stored derived values (§13.7).
 */

import type { BadgeSession } from './badges';

export interface ProgressStats {
  totalSessions: number;
  totalEndings: number;
  distinctStemsUsed: number;
  longestStreak: number;
  currentStreak: number;
}

function localDateKey(session: BadgeSession): string {
  // Same tz handling as badges.ts: the session's own recorded offset at the
  // time, not the device's current zone.
  const localMs = Date.parse(session.startedAt) + session.offsetMin * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function longestConsecutiveDayRun(sortedDays: readonly string[]): number {
  if (sortedDays.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const dayGap = dayDiff(sortedDays[i - 1], sortedDays[i]);
    current = dayGap === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function dayDiff(a: string, b: string): number {
  const aMs = Date.parse(a + 'T00:00:00.000Z');
  const bMs = Date.parse(b + 'T00:00:00.000Z');
  return Math.round((bMs - aMs) / (24 * 60 * 60 * 1000));
}

/**
 * The current streak: the run of consecutive local days ending at either
 * today or yesterday (in `nowLocalDateKey`'s calendar) — a day off doesn't
 * zero the streak retroactively until a second day is missed, matching
 * "descriptive, not punitive" (§13.4/§13.6 as amended): the streak simply
 * stops incrementing, it isn't shown as broken the instant midnight passes
 * without an entry.
 */
function currentStreak(sortedDays: readonly string[], nowLocalDateKey: string): number {
  if (sortedDays.length === 0) return 0;
  const last = sortedDays[sortedDays.length - 1];
  const gapFromNow = dayDiff(last, nowLocalDateKey);
  if (gapFromNow > 1) return 0; // most recent session is >1 day ago: no current streak

  let streak = 1;
  for (let i = sortedDays.length - 1; i > 0; i--) {
    if (dayDiff(sortedDays[i - 1], sortedDays[i]) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * `now`/`nowTz`/`nowOffsetMin` locate "today" in the *device's current*
 * zone — unlike history badges, "current streak" is inherently asked from
 * wherever the user is right now, not from a past session's recorded zone.
 */
export function computeStreaks(
  sessions: readonly BadgeSession[],
  now: string,
  nowOffsetMin: number,
): { current: number; longest: number } {
  const days = Array.from(new Set(sessions.map(localDateKey))).sort();
  const nowLocalMs = Date.parse(now) + nowOffsetMin * 60 * 1000;
  const nowLocalDateKey = new Date(nowLocalMs).toISOString().slice(0, 10);
  return {
    current: currentStreak(days, nowLocalDateKey),
    longest: longestConsecutiveDayRun(days),
  };
}

export function computeProgressStats(
  sessions: readonly BadgeSession[],
  now: string,
  nowOffsetMin: number,
): ProgressStats {
  const streaks = computeStreaks(sessions, now, nowOffsetMin);
  return {
    totalSessions: sessions.length,
    totalEndings: sessions.reduce((sum, s) => sum + s.endings.length, 0),
    distinctStemsUsed: new Set(sessions.map((s) => s.stemId)).size,
    longestStreak: streaks.longest,
    currentStreak: streaks.current,
  };
}
