/**
 * Pure helpers for review mode's re-read period (§6.5, ticket 13, Q4 in
 * docs/DECISIONS.md). A period is always "the last N days up to now": exclusive
 * end at `now`, inclusive start N days before it, matching `reviews`'
 * `period_start`/`period_end` column comments (spec §4.2).
 */
export type ReviewPeriodPreset = 7 | 14 | 30;

export const REVIEW_PERIOD_PRESETS: readonly ReviewPeriodPreset[] = [7, 14, 30];
export const DEFAULT_REVIEW_PERIOD_DAYS: ReviewPeriodPreset = 7;

export interface ReviewPeriod {
  periodStart: string; // inclusive, UTC ISO-8601
  periodEnd: string; // exclusive, UTC ISO-8601
}

export function computeReviewPeriod(days: ReviewPeriodPreset, now: string): ReviewPeriod {
  const periodEndMs = Date.parse(now);
  const periodStartMs = periodEndMs - days * 24 * 60 * 60 * 1000;
  return {
    periodStart: new Date(periodStartMs).toISOString(),
    periodEnd: new Date(periodEndMs).toISOString(),
  };
}

/**
 * True when review is due to be offered (§6.5: "offered once a week
 * in-app"). Compares to the most recent non-deleted review's
 * `created_at`, if any — `null` (no review yet) always counts as due.
 * A pure function of "now" and "when was the last one", so it's testable
 * without a clock or a database.
 */
export function isWeeklyReviewDue(lastReviewCreatedAt: string | null, now: string): boolean {
  if (lastReviewCreatedAt === null) return true;
  const sinceMs = Date.parse(now) - Date.parse(lastReviewCreatedAt);
  return sinceMs >= 7 * 24 * 60 * 60 * 1000;
}
