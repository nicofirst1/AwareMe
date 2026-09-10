import { newId } from './id';
import { SqlExecutor } from './executor';
import { SEED_STEMS } from './seed/stems';
import { DEFAULT_SETTINGS } from './seed/settings';
import { nowEventTime } from './time';

/** Every user-facing table, in the order the debug dump shows them. */
export const ALL_TABLES = [
  'stems',
  'sessions',
  'endings',
  'reviews',
  'settings',
  'notification_schedule',
  'schema_meta',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

/**
 * Reads and writes shared by first-launch seeding and the debug dump
 * screen. Deliberately thin: M2+ tickets add session/ending/review
 * read-write methods as those features are built, rather than speculating
 * on their shape here.
 */
export class Repository {
  constructor(private readonly db: SqlExecutor) {}

  /** True once any stem exists — i.e. seeding has already run. */
  hasStems(): boolean {
    const row = this.db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM stems', []);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Inserts the seed stems and default settings on first launch. Idempotent:
   * a no-op if stems already exist, so it's safe to call on every app start.
   */
  seedIfEmpty(): void {
    if (this.hasStems()) return;

    this.db.withTransactionSync(() => {
      for (const stem of SEED_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 1, ?, ?, ?)`,
          [newId(), stem.text, stem.category, at, tz, offsetMin],
        );
      }

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { at } = nowEventTime();
        this.db.runSync('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
          key,
          JSON.stringify(value),
          at,
        ]);
      }
    });
  }

  /** Every row of every table, for the debug dump screen. Includes soft-deleted rows. */
  dumpAllTables(): Record<TableName, Record<string, unknown>[]> {
    const result = {} as Record<TableName, Record<string, unknown>[]>;
    for (const table of ALL_TABLES) {
      result[table] = this.db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`, []);
    }
    return result;
  }
}
