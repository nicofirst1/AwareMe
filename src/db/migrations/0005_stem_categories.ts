/**
 * Migration 0005: categorise the programme stems (issue 04, 2026-09-16
 * owner feedback; spec §5.2's six categories, ADR-0005's week structure).
 *
 * Backfills `stems.category` on programme stems (`week_number IS NOT NULL`)
 * from the week→pillar mapping — the same mapping fresh-install seeding
 * applies (`src/db/seed/stems.ts`, `programmeStemCategory`). Migration
 * files are immutable once shipped, so the mapping is frozen HERE as
 * literals and the SQL is built from them; `__tests__/migrate.test.ts`
 * runs the whole 142-stem seed corpus through this migration and pins
 * every row's outcome to `programmeStemCategory`, so the frozen copy and
 * the live mapping cannot drift.
 *
 * - Per-stem exceptions run FIRST (they are the specific readings); the
 *   week default fills only what is still NULL.
 * - Every UPDATE is guarded `category IS NULL`: a category the user chose
 *   via the stem editor is never overwritten (§4.1 — no destructive
 *   rewrites of state the user set).
 * - Rows outside the programme are never in scope: user/imported stems,
 *   the weekly meta-stem, the retired v1 originals and the evening
 *   meta-stems all have `week_number IS NULL`.
 * - Soft-deleted programme stems ARE backfilled: they remain programme
 *   provenance in exports (§4.1.5).
 * - No DDL, and no retro-seeding (F1 stays deferred — categories only,
 *   never stems): an upgrade from v3 has no programme rows yet and this
 *   migration touches nothing else. `schema_meta` is bumped by the runner
 *   (`migrate.ts`), not here.
 */

/** The week→pillar mapping, frozen at migration time (weeks 1–30 → §5.2 categories). */
const MIGRATION_0005_WEEK_CATEGORY: Readonly<Record<number, string>> = {
  1: 'awareness',
  2: 'awareness',
  3: 'awareness',
  4: 'self_acceptance',
  5: 'self_acceptance',
  6: 'self_acceptance',
  7: 'self_acceptance',
  8: 'self_acceptance',
  9: 'self_acceptance',
  10: 'responsibility',
  11: 'responsibility',
  12: 'responsibility',
  13: 'assertiveness',
  14: 'assertiveness',
  15: 'purpose',
  16: 'purpose',
  17: 'integrity',
  18: 'integrity',
  19: 'self_acceptance',
  20: 'self_acceptance',
  21: 'self_acceptance',
  22: 'self_acceptance',
  23: 'self_acceptance',
  24: 'self_acceptance',
  25: 'self_acceptance',
  26: 'self_acceptance',
  27: 'awareness',
  28: 'awareness',
  29: 'assertiveness',
  30: 'self_acceptance',
};

/** Per-stem exceptions (exact seed text → category), applied before the week defaults. */
const MIGRATION_0005_TEXT_CATEGORY_EXCEPTIONS: Readonly<Record<string, string>> = {
  'If I take more responsibility for my choices and actions today': 'responsibility',
  'I am becoming aware': 'awareness',
  'If I take more responsibility for fulfilling my wants': 'responsibility',
  'If I bring 5 percent more awareness to my life': 'awareness',
  'If I am 5 percent more self-accepting': 'self_acceptance',
  'If I bring 5 percent more self-responsibility to my life': 'responsibility',
  'If I operate 5 percent more self-assertively': 'assertiveness',
  'If I live my life 5 percent more purposefully': 'purpose',
  'If I bring 5 percent more integrity to my life': 'integrity',
  'If I breathe deeply and allow myself to experience what self-esteem feels like': 'self_acceptance',
};

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const exceptionUpdates = Object.entries(MIGRATION_0005_TEXT_CATEGORY_EXCEPTIONS)
  .map(([text, category]) => `UPDATE stems SET category = '${category}' WHERE text = ${sqlString(text)} AND category IS NULL;`)
  .join('\n');

const weekUpdates = Object.entries(MIGRATION_0005_WEEK_CATEGORY)
  .map(([week, category]) => `UPDATE stems SET category = '${category}' WHERE week_number = ${week} AND category IS NULL;`)
  .join('\n');

export const MIGRATION_0005_STEM_CATEGORIES = `${exceptionUpdates}\n${weekUpdates}`;
