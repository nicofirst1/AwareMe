import { SqlExecutor } from './executor';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from './migrations';

/**
 * Reads the current schema version (0 if `schema_meta` doesn't exist yet,
 * i.e. a fresh install) and applies every migration above it in order, each
 * in its own transaction, bumping `schema_meta.schema_version` as it goes.
 * Idempotent: running it again when already current is a no-op.
 */
export function migrate(db: SqlExecutor, appVersion: string, now: () => string = () => new Date().toISOString()): void {
  const currentVersion = readSchemaVersion(db);

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    db.withTransactionSync(() => {
      db.execSync(migration.sql);
      if (migration.version === 1) {
        db.runSync('INSERT INTO schema_meta (id, schema_version, app_version, created_at) VALUES (1, ?, ?, ?)', [
          migration.version,
          appVersion,
          now(),
        ]);
      } else {
        db.runSync('UPDATE schema_meta SET schema_version = ?, app_version = ? WHERE id = 1', [
          migration.version,
          appVersion,
        ]);
      }
    });
  }
}

function readSchemaVersion(db: SqlExecutor): number {
  const tableExists = db.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
    [],
  );
  if (!tableExists) return 0;

  const row = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
  return row?.schema_version ?? 0;
}

export { CURRENT_SCHEMA_VERSION };
