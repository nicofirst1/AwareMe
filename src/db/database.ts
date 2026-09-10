import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrate';
import { Repository } from './repository';

const DATABASE_NAME = 'six-endings.db';

// package.json's "version" field; kept as a literal because reading
// package.json at runtime is unnecessary indirection for one string.
const APP_VERSION = '1.0.0';

let db: SQLiteDatabase | null = null;
let repository: Repository | null = null;

function open(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync(DATABASE_NAME);
  migrate(db, APP_VERSION);
  repository = new Repository(db);
  repository.seedIfEmpty();
  return db;
}

/**
 * Opens (creating on first launch) the app's single on-device database,
 * runs any pending migrations, and seeds it if empty. Safe to call
 * repeatedly — returns the same connection; migrate() and seedIfEmpty() are
 * both idempotent.
 */
export function getDatabase(): SQLiteDatabase {
  return open();
}

export function getRepository(): Repository {
  open();
  // Non-null: `open()` always assigns it.
  return repository as Repository;
}
