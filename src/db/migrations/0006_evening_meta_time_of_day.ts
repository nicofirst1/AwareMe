/**
 * Migration 0006: tag the two evening reflection meta-stems with
 * `time_of_day = 'evening'` (issue 06, owner feedback "there are no
 * evening stems").
 *
 * The two rows exist on every install as `origin = 'meta'`, `active = 0`,
 * `time_of_day` NULL (the §5.4 meta-stem convention predating issue 06).
 * Issue 06 makes the stem library list them and tags them 'evening' at
 * seed time — but existing installs never re-seed, so this backfill gives
 * their rows the same tag and the library's Evening filter matches there
 * too. Fresh installs run this migration against an empty `stems` table
 * (seeding happens after migrate), where it is a no-op.
 *
 * - Scope guard `origin = 'meta' AND is_weekly_meta = 0`: the weekly
 *   meta-stem (§5.4 #1) keeps `time_of_day = NULL` on every install, and a
 *   user-authored stem whose text verbatim-duplicates an evening meta-stem
 *   (the duplicate check excludes meta rows, so one can exist) is never
 *   tagged — it is the user's own stem, not the reflection stem.
 * - Rows are matched by the exact seeded text, frozen HERE as literals
 *   (migration files are immutable once shipped) and pinned to the live
 *   `EVENING_META_STEMS` by `__tests__/migrate.test.ts`, so the shipped
 *   SQL and the live seed cannot drift.
 * - §4.1: this tags seed-authored classification on app-owned rows — no
   user-set value is overwritten (no user-visible path ever exposed these
 *   rows for editing), no row is created or removed, and no other column
 *   changes.
 * - Idempotent: re-running the UPDATE (or the whole migration set on an
 *   already-current database) leaves the same state.
 */

/** The two §5.4 evening reflection stems, frozen at migration time (issue 06). */
const MIGRATION_0006_EVENING_META_TEXTS: readonly string[] = [
  'Reading these back, the thing I notice myself circling is',
  'If I take these endings seriously rather than dismissing them',
];

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const eveningTextList = MIGRATION_0006_EVENING_META_TEXTS.map(sqlString).join(', ');

export const MIGRATION_0006_EVENING_META_TIME_OF_DAY = `UPDATE stems SET time_of_day = 'evening' WHERE origin = 'meta' AND is_weekly_meta = 0 AND text IN (${eveningTextList});`;
