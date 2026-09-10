import { DatabaseSync } from 'node:sqlite';

import { SqlBindValue, SqlExecutor } from '../executor';

/**
 * Adapts Node's built-in `node:sqlite` to the `SqlExecutor` interface, so
 * migrations run against real SQLite in tests without a native module or a
 * mock of one. Test-only: production code uses `expo-sqlite`'s
 * `SQLiteDatabase`, which satisfies `SqlExecutor` directly.
 */
export function nodeSqliteExecutor(db: DatabaseSync): SqlExecutor {
  return {
    execSync(source: string): void {
      db.exec(source);
    },
    runSync(source: string, params: SqlBindValue[]) {
      const result = db.prepare(source).run(...params);
      return { changes: result.changes as number, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getAllSync<T>(source: string, params: SqlBindValue[]): T[] {
      return db.prepare(source).all(...params) as T[];
    },
    getFirstSync<T>(source: string, params: SqlBindValue[]): T | null {
      const row = db.prepare(source).get(...params);
      return (row as T | undefined) ?? null;
    },
    withTransactionSync(task: () => void): void {
      db.exec('BEGIN');
      try {
        task();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
