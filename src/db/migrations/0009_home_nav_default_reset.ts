/**
 * Migration 0009: reset the Home nav-dock KV to its default (packet-11
 * t7-fixes, owner report 2026-09-25: "menu must be collapsed by default").
 *
 * The seed default for `home_nav_expanded` is `false` (collapsed, the
 * packet-10 t4 owner pick), but installs that ever toggled the dock open
 * carry a stored `true` — a UI-state preference persisted as a plain
 * settings KV row (DECISIONS: new settings are KV rows, not schema
 * changes). The owner's install opened expanded on every launch and the
 * default had become unreachable for him; this migration resets that ONE
 * stored value to the default so existing installs land collapsed again.
 * A data migration, not a schema change — no column, table, or index is
 * touched; `schema_meta` is bumped by the runner (`migrate.ts`).
 *
 * Scope is exactly `key = 'home_nav_expanded' AND value = 'true'`, so the
 * three install classes resolve correctly:
 * - installs carrying `true` (ever toggled open) → reset to `false`;
 * - installs carrying `false` → untouched (already at the default);
 * - installs without the row (pre-packet-10 seeds; `seedIfEmpty` only
 *   seeds empty tables) → still no row, resolved collapsed through
 *   `getSettings`' defaults merge, unchanged.
 *
 * Fresh installs: migrations run BEFORE seeding (`database.ts`), so the
 * UPDATE touches zero rows there — the seed writes `false` directly.
 * Post-migration toggles persist normally: this is a one-time reset, not
 * a standing trigger (asserted by the migrate.test.ts scenario).
 *
 * `updated_at` is stamped with the fix date — migration bookkeeping, not a
 * user event, the migration 0004 precedent. Values are JSON-encoded per
 * the settings table's convention (`true`/`false` booleans stringify
 * bare, the repository's `setSetting` form).
 */
export const MIGRATION_0009_HOME_NAV_DEFAULT_RESET = `
UPDATE settings SET value = 'false', updated_at = '2026-09-25T00:00:00.000Z' WHERE key = 'home_nav_expanded' AND value = 'true';
`;
