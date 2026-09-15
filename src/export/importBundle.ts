/**
 * Restores a previously exported JSON bundle (spec §8, ticket 15). Pure
 * over a `SqlExecutor`: every row is inserted with its original id,
 * timestamps, and `deleted_at` untouched — import never re-derives or
 * re-stamps anything, so merge/replace followed by export reproduces the
 * bundle exactly (the round-trip test in `__tests__/roundTrip.test.ts`).
 */
import { SqlBindValue, SqlExecutor } from '../db/executor';
import type { TableName } from '../db/repository';
import type { ExportBundle } from './jsonBundle';

export type ImportMode = 'merge' | 'replace';

const IMPORT_TABLES: readonly (keyof ExportBundle & TableName)[] = ['stems', 'sessions', 'endings', 'reviews', 'settings'];

/** Column order per table — must match `csvBundle.ts` / the DDL exactly; insert fails loudly (unknown column) if a bundle is missing one rather than silently dropping data. */
const COLUMNS: Record<(typeof IMPORT_TABLES)[number], readonly string[]> = {
  stems: ['id', 'text', 'origin', 'category', 'language', 'weight', 'active', 'created_at', 'created_tz', 'created_offset_min', 'deleted_at', 'time_of_day', 'week_number', 'is_weekly_meta'],
  sessions: [
    'id', 'stem_id', 'stem_text_snapshot', 'origin', 'target_endings', 'timer_seconds', 'uncensored_mode',
    'started_at', 'first_keypress_at', 'ended_at', 'end_reason', 'notification_id', 'notified_at', 'opened_at',
    'last_activity_at', 'tz', 'offset_min', 'device_locale', 'deleted_at',
  ],
  endings: ['id', 'session_id', 'ordinal', 'text', 'started_at', 'submitted_at', 'backspace_count', 'was_revised', 'deleted_at'],
  reviews: ['id', 'period_start', 'period_end', 'session_ids', 'reflection_text', 'meta_stem_text', 'created_at', 'tz', 'offset_min', 'deleted_at'],
  settings: ['key', 'value', 'updated_at'],
};

const PRIMARY_KEY: Record<(typeof IMPORT_TABLES)[number], string> = {
  stems: 'id',
  sessions: 'id',
  endings: 'id',
  reviews: 'id',
  settings: 'key',
};

function toBindValue(value: unknown): SqlBindValue {
  if (value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || value === null) return value;
  // Shouldn't occur for a well-formed bundle (every column is already a SQLite scalar), but a stray boolean/object is coerced rather than throwing.
  return JSON.stringify(value);
}

export interface ImportResult {
  inserted: number;
  skipped: number;
}

/**
 * Applies `bundle` to the database via `db`. `replace` deletes every row of
 * every imported table first (a hard delete of the *current* database
 * contents, not of the bundle's soft-deleted rows, which are re-inserted
 * with their own `deleted_at` intact); `merge` inserts only rows whose
 * primary key doesn't already exist, skipping the rest. Caller is
 * responsible for calling `Repository.rebuildEndingsFts()` afterwards —
 * this function only touches `SqlExecutor`, it doesn't know about the FTS
 * index.
 */
export function applyImport(db: SqlExecutor, bundle: ExportBundle, mode: ImportMode): ImportResult {
  let inserted = 0;
  let skipped = 0;

  db.withTransactionSync(() => {
    if (mode === 'replace') {
      // Children before parents (endings -> sessions -> stems) so this
      // works whether or not the target connection enforces foreign keys —
      // production's expo-sqlite doesn't (no PRAGMA foreign_keys = ON
      // anywhere in this app), but node:sqlite in tests does.
      for (const table of [...IMPORT_TABLES].reverse()) {
        db.execSync(`DELETE FROM ${table}`);
      }
    }

    for (const table of IMPORT_TABLES) {
      const columns = COLUMNS[table];
      const pk = PRIMARY_KEY[table];
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of bundle[table]) {
        if (mode === 'merge') {
          const existing = db.getFirstSync<Record<string, unknown>>(`SELECT ${pk} FROM ${table} WHERE ${pk} = ?`, [
            toBindValue(row[pk]),
          ]);
          if (existing) {
            skipped++;
            continue;
          }
        }
        db.runSync(
          insertSql,
          columns.map((c) => toBindValue(row[c])),
        );
        inserted++;
      }
    }
  });

  return { inserted, skipped };
}
