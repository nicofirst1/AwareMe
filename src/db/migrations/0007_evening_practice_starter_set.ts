/**
 * Migration 0007: backfill the evening practice starter set (issue 17,
 * 2026-09-18 owner decision: original placeholder evening stems).
 *
 * `seedIfEmpty` seeds the starter set on fresh installs — but seeding
 * happens once per install (it early-returns the moment any stem exists),
 * so an install that predates the set would never receive it. This
 * migration gives existing installs the same rows the fresh-install seed
 * writes: seven app-original evening practice stems, `origin = 'seed'`,
 * `active = 1`, `time_of_day = 'evening'`, `week_number = NULL`,
 * `is_weekly_meta = 0`, each with the category its seed entry carries.
 *
 * - Fresh-install guard: on a fresh database this runs against an EMPTY
 *   `stems` table (seeding happens after migrate), where the row-count
 *   guard makes it a no-op — the table must stay empty so `seedIfEmpty`'s
 *   `hasStems()` check still sees a fresh install and seeds the whole
 *   corpus, starter set included. An install with zero stems is by
 *   definition one that never seeded: no seed-authored row can ever be
 *   hard-deleted (soft-delete only, §4.5), so "table empty" and "fresh
 *   install" are the same state.
 * - Text twins: an install whose user authored a stem verbatim-identical
 *   to one of the seven (possible — the §6.6 duplicate check on that
 *   install could not have known these texts yet) keeps its own row and
 *   is not twinned; the per-text NOT EXISTS guard skips that text, the
 *   same ruling migration 0006 made for a user look-alike. That install
 *   simply receives fewer of the seven.
 * - Rows are written from the texts frozen HERE as literals (migration
 *   files are immutable once shipped) and pinned to the live
 *   `EVENING_PRACTICE_SEED_STEMS` — text, category and order — by
 *   `__tests__/migrate.test.ts`, so the shipped SQL and the live seed
 *   cannot drift.
 * - §4.1: append-only row creation — no existing row is touched, no user
 *   value overwritten, nothing removed.
 * - Idempotent: re-running the statement (or the whole migration set on
 *   an already-current database) changes nothing — the count guard and
 *   the per-text guards both re-apply as no-ops.
 * - created_at/id are frozen literals, the 0004 bookkeeping convention
 *   (migration bookkeeping, not a user event): the shipped SQL stays
 *   byte-deterministic and the suite can pin it exactly. Runtime write
 *   paths keep `newId()`.
 */

/** The starter-set entries frozen at migration time (issue 17), in seed order: text, category. */
const MIGRATION_0007_EVENING_PRACTICE_STEMS: readonly { text: string; category: string }[] = [
  { text: 'If I take one honest look at the day I actually had', category: 'awareness' },
  { text: 'If I end the day on speaking terms with myself', category: 'self_acceptance' },
  { text: 'If I take my share of today, and only my share', category: 'responsibility' },
  { text: 'The thing I wanted to say today and kept back is', category: 'assertiveness' },
  { text: 'If the first hour of tomorrow goes to what matters most', category: 'purpose' },
  { text: 'Where my words and my actions parted ways today is', category: 'integrity' },
  { text: 'If I set down the unfinished parts of today until morning', category: 'self_acceptance' },
];

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function stemInsert(id: string, text: string, category: string): string {
  return `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
SELECT ${sqlString(id)}, ${sqlString(text)}, 'seed', ${sqlString(category)}, 'en', 1.0, 1, '2026-09-18T00:00:00.000Z', 'UTC', 0, 'evening', NULL, 0
WHERE (SELECT COUNT(*) FROM stems) > 0
  AND NOT EXISTS (SELECT 1 FROM stems WHERE text = ${sqlString(text)});`;
}

export const MIGRATION_0007_EVENING_PRACTICE_STARTER_SET = MIGRATION_0007_EVENING_PRACTICE_STEMS.map((stem, index) =>
  stemInsert(`m0007-evening-${String(index + 1).padStart(2, '0')}`, stem.text, stem.category),
).join('\n');
