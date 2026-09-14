/**
 * Migration 0003: `stems.time_of_day` (morning/evening pivot).
 *
 * Nullable TEXT, allowed values 'morning' | 'evening' | NULL — enforcement of
 * the two-value set lives in the TypeScript `TimeOfDay` type at the write
 * path (`Repository`/seed), same convention as `stems.category`'s six-value
 * set, not a SQL CHECK constraint. No backfill for pre-existing rows: dev
 * DBs re-seed, and a fresh install gets the categorized seed stems directly.
 */
export const MIGRATION_0003_STEMS_TIME_OF_DAY = `
ALTER TABLE stems ADD COLUMN time_of_day TEXT;
`;
