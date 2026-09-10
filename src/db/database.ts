import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrate';

const DATABASE_NAME = 'six-endings.db';

// package.json's "version" field; kept as a literal because reading
// package.json at runtime is unnecessary indirection for one string.
const APP_VERSION = '1.0.0';

let db: SQLiteDatabase | null = null;

/**
 * Opens (creating on first launch) the app's single on-device database and
 * runs any pending migrations. Safe to call repeatedly — returns the same
 * connection and migrate() is idempotent.
 */
export function getDatabase(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync(DATABASE_NAME);
  migrate(db, APP_VERSION);
  return db;
}
