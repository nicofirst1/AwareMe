/**
 * Migration 0004: adopt the official Sentence Completion programme
 * (spec.md §5.1/§5.3/§5.4 as amended 2026-09-15; ADR-0005).
 *
 * - `stems.week_number` — nullable INTEGER, the official programme block
 *   (1..30). NULL for non-programme stems. The 1..30 range is enforced at
 *   the write path (Repository/seed), same convention as `category`'s
 *   six-value set — spec §4.2's DDL carries no CHECK constraint.
 * - `stems.is_weekly_meta` — 1 for the official weekly reflection stem
 *   (§5.4 #1). It already exists on installs that predate this migration
 *   as the `origin = 'meta'` row with that exact text, so the migration
 *   TAGS it (ADR-0005 decision 6) rather than adding a row; fresh installs
 *   seed it directly with the flag set.
 * - The four §7 settings added by the 2026-09-15 amendment, inserted for
 *   installs upgrading from v3 (fresh installs get them from the seed's
 *   DEFAULT_SETTINGS either way). Values are JSON-encoded per the settings
 *   table's convention. `updated_at` is stamped with the amendment date —
 *   migration bookkeeping, not a user event, so no tz/offset columns.
 *
 * Existing stems are deliberately left untouched (spec §5.3, append-only
 * §4.1): the retired v1 originals stay exactly as the install has them,
 * and no programme stems are retro-seeded — the programme corpus is a
 * fresh-install seed concern. `week_number`/`is_weekly_meta` back NULL/0.
 */
export const MIGRATION_0004_OFFICIAL_PROGRAMME = `
ALTER TABLE stems ADD COLUMN week_number INTEGER;
ALTER TABLE stems ADD COLUMN is_weekly_meta INTEGER NOT NULL DEFAULT 0;
UPDATE stems SET is_weekly_meta = 1 WHERE origin = 'meta' AND text = 'If any of what I wrote this week is true, it might be helpful if I';
INSERT INTO settings (key, value, updated_at) VALUES ('evening_practice_enabled', 'true', '2026-09-15T00:00:00.000Z');
INSERT INTO settings (key, value, updated_at) VALUES ('weekly_meta_day', '"sunday"', '2026-09-15T00:00:00.000Z');
INSERT INTO settings (key, value, updated_at) VALUES ('weekly_meta_time', '"21:00"', '2026-09-15T00:00:00.000Z');
INSERT INTO settings (key, value, updated_at) VALUES ('program_week_override', 'null', '2026-09-15T00:00:00.000Z');
`;
