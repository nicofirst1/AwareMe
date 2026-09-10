import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { migrate } from '../migrate';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../migrations';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

function fixturePath(version: number): string {
  return path.join(FIXTURES_DIR, `schema-v${version}.db`);
}

/** Writes a fixture DB at exactly `version` by applying migrations 1..version. */
function writeFixture(version: number): void {
  const file = fixturePath(version);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const raw = new DatabaseSync(file);
  const db = nodeSqliteExecutor(raw);
  for (const m of MIGRATIONS.filter((candidate) => candidate.version <= version)) {
    db.execSync(m.sql);
  }
  db.runSync('INSERT INTO schema_meta (id, schema_version, app_version, created_at) VALUES (1, ?, ?, ?)', [
    version,
    'fixture',
    new Date(0).toISOString(),
  ]);
  raw.close();
}

function tableNames(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );
}

describe('migrate', () => {
  // Every version that has shipped must have a fixture committed to the
  // repo. Generate any that's missing so a fresh checkout self-heals, but a
  // git diff on this file is the signal a new fixture needs committing.
  beforeAll(() => {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    for (const m of MIGRATIONS) {
      if (!fs.existsSync(fixturePath(m.version))) writeFixture(m.version);
    }
  });

  it('brings a fresh (empty) database to the current schema version', () => {
    const raw = new DatabaseSync(':memory:');
    const db = nodeSqliteExecutor(raw);

    migrate(db, '1.0.0', () => '2026-01-01T00:00:00.000Z');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent: migrating an already-current database is a no-op', () => {
    const raw = new DatabaseSync(':memory:');
    const db = nodeSqliteExecutor(raw);
    migrate(db, '1.0.0');
    migrate(db, '1.0.1'); // second call, different app_version

    const meta = db.getFirstSync<{ schema_version: number; app_version: string }>(
      'SELECT schema_version, app_version FROM schema_meta WHERE id = 1',
      [],
    );
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    // app_version is untouched because no migration ran the second time.
    expect(meta?.app_version).toBe('1.0.0');
  });

  it.each(MIGRATIONS.map((m) => m.version))('upgrades the committed v%i fixture cleanly to current', (version) => {
    const raw = new DatabaseSync(fixturePath(version));
    const db = nodeSqliteExecutor(raw);

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    raw.close();
  });

  it('the current-version fixture has every table from the schema', () => {
    const raw = new DatabaseSync(fixturePath(CURRENT_SCHEMA_VERSION));
    expect(tableNames(raw).sort()).toEqual(
      ['schema_meta', 'stems', 'sessions', 'endings', 'reviews', 'settings', 'notification_schedule'].sort(),
    );
    raw.close();
  });
});
