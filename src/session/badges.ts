/**
 * Milestone badges (gamification proposal §4, `docs/design/
 * gamification-proposal-2026-09-11.md`; spec §13 items 4/6 as amended by
 * commit e6f8c95). Pure derivation from history rows, same posture as
 * `reviewPeriod.ts`/`stemLibraryFilter.ts`: no SQLite, no persistence,
 * nothing stored (§13.7 survives the gamification reversal in full force).
 *
 * "Newly earned" for the completion-screen reveal (cycle 2's concern) is
 * computed by calling `computeEarnedBadgeIds` twice — once with history
 * excluding the just-finalized session, once including it — and diffing the
 * two sets. No flag persisted anywhere.
 */

import type { EndReason, SessionOrigin } from './sessionMachine';

/** One completed session's shape, as badges/stats need it — a subset of `SessionRow` plus its endings and stem category. */
export interface BadgeSession {
  id: string;
  stemId: string;
  category: string | null;
  origin: SessionOrigin;
  targetEndings: number;
  uncensoredMode: boolean;
  startedAt: string; // UTC ISO-8601
  endedAt: string | null;
  endReason: EndReason | null;
  tz: string; // IANA zone recorded at `startedAt` (§4.1.3) — not the device's current zone
  offsetMin: number;
  /** Submitted, non-deleted endings for this session, ordinal order. */
  endings: { text: string }[];
}

export interface BadgeHistory {
  /** Completed sessions only (`ended_at IS NOT NULL`), non-deleted. Badges never count an open or retracted session. */
  sessions: readonly BadgeSession[];
  /** Whether at least one non-deleted `reviews` row exists. */
  hasReview: boolean;
  /** Whether at least one non-deleted `stems` row with `origin = 'user'` exists. */
  hasUserStem: boolean;
}

export type BadgeId =
  | 'first_words'
  | 'six_endings'
  | 'week_of_mornings'
  | 'every_corner'
  | 'fifty_endings'
  | 'two_hundred_endings'
  | 'long_way_round'
  | 'uncensored'
  | 'looking_back'
  | 'stem_of_your_own'
  | 'seven_day_rhythm';

export interface BadgeDef {
  id: BadgeId;
  name: string;
  description: string;
}

/** All six stem categories (spec §5.2) — "Every Corner" needs the full set, not just however many exist. */
const ALL_CATEGORIES = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'] as const;

/** The 11-badge catalog (proposal §1), in the proposal's table order. Names/descriptions are copy, not evaluation — findings about history, not scores. */
export const BADGES: readonly BadgeDef[] = [
  { id: 'first_words', name: 'First Words', description: 'Completed your first session.' },
  { id: 'six_endings', name: 'Six Endings', description: 'Finished every ending in a session.' },
  { id: 'week_of_mornings', name: 'A Week of Mornings', description: 'Written on 7 different days.' },
  { id: 'every_corner', name: 'Every Corner', description: 'Written in all six categories.' },
  { id: 'fifty_endings', name: 'Fifty Endings', description: 'Written 50 endings in total.' },
  { id: 'two_hundred_endings', name: 'Two Hundred Endings', description: 'Written 200 endings in total.' },
  { id: 'long_way_round', name: 'The Long Way Round', description: 'Filled every field, right up to the timeout.' },
  { id: 'uncensored', name: 'Uncensored', description: 'Completed 25 sessions in uncensored mode.' },
  { id: 'looking_back', name: 'Looking Back', description: 'Completed your first review.' },
  { id: 'stem_of_your_own', name: 'A Stem of Your Own', description: 'Added a stem of your own.' },
  { id: 'seven_day_rhythm', name: 'Seven-Day Rhythm', description: 'Written 7 days in a row.' },
] as const;

function localDateKey(session: BadgeSession): string {
  // The session's own recorded offset at the time, not the device's current
  // one (proposal §4) — a badge computed today about a trip last month uses
  // the tz that was true then.
  const localMs = Date.parse(session.startedAt) + session.offsetMin * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10); // YYYY-MM-DD in that local calendar
}

function totalEndings(sessions: readonly BadgeSession[]): number {
  return sessions.reduce((sum, s) => sum + s.endings.length, 0);
}

function distinctLocalDays(sessions: readonly BadgeSession[]): Set<string> {
  return new Set(sessions.map(localDateKey));
}

/** Longest run of *consecutive* local calendar days with >=1 completed session. */
function longestConsecutiveDayRun(days: ReadonlySet<string>): number {
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = Date.parse(sorted[i - 1] + 'T00:00:00.000Z');
    const curMs = Date.parse(sorted[i] + 'T00:00:00.000Z');
    const dayGap = Math.round((curMs - prevMs) / (24 * 60 * 60 * 1000));
    current = dayGap === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function hasLongWayRound(session: BadgeSession): boolean {
  if (session.endReason !== 'timeout') return false;
  if (session.endings.length < session.targetEndings) return false;
  return session.endings.every((e) => e.text.trim().length > 0);
}

/** The set of badge ids earned by this history, as of now. Pure and order-independent — a badge is either in the set or it isn't. */
export function computeEarnedBadgeIds(history: BadgeHistory): Set<BadgeId> {
  const { sessions } = history;
  const earned = new Set<BadgeId>();

  if (sessions.length >= 1) earned.add('first_words');

  if (sessions.some((s) => s.endings.length >= s.targetEndings && s.targetEndings > 0)) {
    earned.add('six_endings');
  }

  if (distinctLocalDays(sessions).size >= 7) earned.add('week_of_mornings');

  const categoriesSeen = new Set(sessions.map((s) => s.category).filter((c): c is string => c !== null));
  if (ALL_CATEGORIES.every((c) => categoriesSeen.has(c))) earned.add('every_corner');

  const endingCount = totalEndings(sessions);
  if (endingCount >= 50) earned.add('fifty_endings');
  if (endingCount >= 200) earned.add('two_hundred_endings');

  if (sessions.some(hasLongWayRound)) earned.add('long_way_round');

  if (sessions.filter((s) => s.uncensoredMode).length >= 25) earned.add('uncensored');

  if (history.hasReview) earned.add('looking_back');

  if (history.hasUserStem) earned.add('stem_of_your_own');

  if (longestConsecutiveDayRun(distinctLocalDays(sessions)) >= 7) earned.add('seven_day_rhythm');

  return earned;
}

/**
 * Badges newly crossed by finalizing `newSession` — computed by diffing the
 * earned set before vs. after, per proposal §4 ("no flag persisted
 * anywhere"). `historyBefore` must not include `newSession`.
 */
export function computeNewlyEarnedBadgeIds(historyBefore: BadgeHistory, newSession: BadgeSession): BadgeId[] {
  const before = computeEarnedBadgeIds(historyBefore);
  const after = computeEarnedBadgeIds({ ...historyBefore, sessions: [...historyBefore.sessions, newSession] });
  return BADGES.map((b) => b.id).filter((id) => !before.has(id) && after.has(id));
}
