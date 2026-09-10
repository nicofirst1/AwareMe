/**
 * The minimal synchronous SQLite surface migrations and repositories are
 * written against. `expo-sqlite`'s `SQLiteDatabase` satisfies this directly
 * (see executorCompat.check.ts). Tests satisfy it with an adapter over
 * Node's built-in `node:sqlite`, so migrations run against real SQLite
 * without needing a native module or a mock of one.
 */
/** SQLite has no native boolean type; store 0/1 as elsewhere in this schema. */
export type SqlBindValue = string | number | null;

export interface SqlExecutor {
  execSync(source: string): void;
  runSync(source: string, params: SqlBindValue[]): { changes: number; lastInsertRowId: number };
  getAllSync<T>(source: string, params: SqlBindValue[]): T[];
  getFirstSync<T>(source: string, params: SqlBindValue[]): T | null;
  withTransactionSync(task: () => void): void;
}
