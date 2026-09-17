/**
 * First-open database-file rename: `six-endings.db` → `awareme.db`
 * (issue 02, v13-feedback round). The app identity was unfrozen and renamed
 * pre-publish, and the database filename went with it. Existing installs keep
 * their data: before the database is ever opened by this build, a legacy
 * `six-endings.db` still present in the SQLite directory is moved to the new
 * name, so the first open finds the old data where the new name expects it.
 *
 * This runs BEFORE `openDatabaseSync` (a schema migration runs inside an
 * already-open database, which is too late for a file rename), and it is NOT
 * a §13.8 schema migration: no table or column changes, no `schema_meta`
 * bump — the schema is untouched, only the file carrying it is renamed.
 *
 * Pure module on purpose (no expo imports): the production I/O adapter lives
 * in `database.ts`; tests drive this function against a real node directory.
 */

/** The database filename this build opens. */
export const DATABASE_NAME = 'awareme.db';

/** The database filename every build before the rename shipped with. */
export const LEGACY_DATABASE_NAME = 'six-endings.db';

/** SQLite journal companions that move along with the main file when present. */
const JOURNAL_SUFFIXES = ['-wal', '-shm', '-journal'];

/** Minimal filesystem surface the move needs — swapped for node fs in tests. */
export interface DatabaseFileIo {
  exists(path: string): boolean;
  move(from: string, to: string): void;
}

/**
 * Moves a legacy `six-endings.db` to `awareme.db` inside `sqliteDirectory`
 * (expo-sqlite's default directory, e.g. `<filesDir>/SQLite` on Android),
 * journal companions moving with it. No-op when there is nothing to move:
 * fresh installs never had a legacy file, and an install that already opened
 * this build keeps its current database untouched. Returns whether anything
 * was moved.
 */
export function moveLegacyDatabaseFile(sqliteDirectory: string, io: DatabaseFileIo): boolean {
  const legacyPath = joinDatabaseFile(sqliteDirectory, LEGACY_DATABASE_NAME);
  const currentPath = joinDatabaseFile(sqliteDirectory, DATABASE_NAME);

  if (!io.exists(legacyPath) || io.exists(currentPath)) return false;

  io.move(legacyPath, currentPath);
  for (const suffix of JOURNAL_SUFFIXES) {
    const companionPath = joinDatabaseFile(sqliteDirectory, LEGACY_DATABASE_NAME + suffix);
    if (io.exists(companionPath)) {
      io.move(companionPath, joinDatabaseFile(sqliteDirectory, DATABASE_NAME + suffix));
    }
  }
  return true;
}

/** Same join shape expo-sqlite's `createDatabasePath` uses: directory, slash, name. */
function joinDatabaseFile(directory: string, name: string): string {
  return `${directory}/${name}`;
}
