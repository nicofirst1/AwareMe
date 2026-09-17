import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrate';
import { Repository } from './repository';
import { DATABASE_NAME, moveLegacyDatabaseFile, type DatabaseFileIo } from './legacyDatabaseFile';

// The directory expo-sqlite resolves bare database names against (its native
// `defaultDatabaseDirectory`: `<filesDir>/SQLite` on Android, `Documents/SQLite`
// on iOS) — the same directory `moveLegacyDatabaseFile` renames inside.
const SQLITE_DIRECTORY = new Directory(Paths.document, 'SQLite').uri;

const databaseFileIo: DatabaseFileIo = {
  exists: (path) => new File(path).exists,
  move: (from, to) => new File(from).moveSync(new File(to)),
};

// package.json's "version" field; kept as a literal because reading
// package.json at runtime is unnecessary indirection for one string.
const APP_VERSION = '1.0.0';

let db: SQLiteDatabase | null = null;
let repository: Repository | null = null;

function open(): SQLiteDatabase {
  if (db) return db;
  // First-open rename of the pre-rename database file (issue 02) — before the
  // first open, never after. A failed move must not brick the app: fall
  // through to opening fresh; the legacy file stays on disk for recovery.
  try {
    moveLegacyDatabaseFile(SQLITE_DIRECTORY, databaseFileIo);
  } catch (error) {
    if (__DEV__) console.warn('legacy database file move failed; opening a fresh database:', error);
  }
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
