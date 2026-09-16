import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { migrate } from '../migrate';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../migrations';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { PROGRAMME_SEED_STEMS, programmeStemCategory } from '../seed/stems';

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
    // Migrate a scratch copy, never the committed fixture file itself —
    // `migrate()` runs real DDL in place, and the committed file must stay
    // byte-for-byte what ships in the repo so it keeps proving "upgrades
    // real prior-version data" on every run, not just the first one.
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(version), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('the current-version fixture has every table from the schema', () => {
    const raw = new DatabaseSync(fixturePath(CURRENT_SCHEMA_VERSION));
    // FTS5's own shadow tables (endings_fts_*) come along with the virtual
    // table (migration 0002) — real SQLite bookkeeping, not app schema.
    const appTables = tableNames(raw).filter((n) => !n.startsWith('endings_fts_'));
    expect(appTables.sort()).toEqual(
      ['schema_meta', 'stems', 'sessions', 'endings', 'endings_fts', 'reviews', 'settings', 'notification_schedule'].sort(),
    );
    raw.close();
  });

  it('the v4 fixture\'s stems table carries week_number and is_weekly_meta (migration 0004)', () => {
    const raw = new DatabaseSync(fixturePath(4));
    const columns = raw.prepare('PRAGMA table_info(stems)').all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(byName['week_number']).toBeDefined();
    expect(byName['week_number'].type).toBe('INTEGER');
    expect(byName['is_weekly_meta']).toBeDefined();
    expect(byName['is_weekly_meta'].type).toBe('INTEGER');
    expect(byName['is_weekly_meta'].notnull).toBe(1);
    expect(byName['is_weekly_meta'].dflt_value).toBe('0');
    raw.close();
  });

  it('the v4 fixture contains the four §7 settings rows migration 0004 inserts, JSON-encoded', () => {
    const raw = new DatabaseSync(fixturePath(4));
    const rows = raw.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey['evening_practice_enabled']).toBe('true');
    expect(byKey['weekly_meta_day']).toBe('"sunday"');
    expect(byKey['weekly_meta_time']).toBe('"21:00"');
    expect(byKey['program_week_override']).toBe('null');
    raw.close();
  });

  it('migration 0005 (v4→v5) backfills programme-stem categories exactly as the seed mapping resolves them', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(4), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v4 install: the 142 programme stems exist (seeded after
    // migration 0004) with NULL categories, plus rows the backfill must
    // never touch: a user stem, a programme stem whose category the user
    // already chose, a soft-deleted programme stem, and a retired v1 row.
    for (const [index, stem] of PROGRAMME_SEED_STEMS.entries()) {
      // The 5th stem (index 4, Week 2) simulates a user-chosen category: the
      // backfill must preserve it even though the week default differs.
      const preset = stem.weekNumber === 2 && stem.text.startsWith('If I bring 5 percent more awareness to my insecurities') ? 'purpose' : null;
      raw
        .prepare(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', ?, 0)`,
        )
        .run(`programme-${index.toString().padStart(3, '0')}`, stem.text, preset, stem.weekNumber);
    }
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
         VALUES ('user-1', 'A user stem', 'user', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0)`,
      )
      .run();
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta, deleted_at)
         VALUES ('retired-1', 'A retired v1 original', 'seed', 'awareness', 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', NULL, 0, '2026-01-02T00:00:00.000Z')`,
      )
      .run();
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta, deleted_at)
         VALUES ('programme-deleted', 'If I bring 5 percent more awareness to my emotions', 'seed', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', 2, 0, '2026-01-02T00:00:00.000Z')`,
      )
      .run();

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(5);

    // Every programme row's category must equal what fresh-install seeding
    // would have written: the frozen migration and the live seed mapping
    // cannot drift, exceptions included, for the whole 142-stem corpus.
    const rows = db.getAllSync<{ text: string; week_number: number; category: string | null }>(
      'SELECT text, week_number, category FROM stems WHERE id LIKE \'programme-%\' ORDER BY rowid',
      [],
    );
    expect(rows).toHaveLength(PROGRAMME_SEED_STEMS.length + 1); // + the soft-deleted block stem
    for (const row of rows) {
      if (row.category === 'purpose' && row.week_number === 2 && row.text.startsWith('If I bring 5 percent more awareness to my insecurities')) {
        continue; // the user-chosen category survives untouched (§4.1)
      }
      expect(row.category).toBe(programmeStemCategory(row.week_number, row.text));
    }

    // Rows outside the programme are never in scope.
    const untouched = db.getFirstSync<{ category: string | null }>('SELECT category FROM stems WHERE id = ?', [
      'user-1',
    ]);
    expect(untouched?.category).toBeNull();
    const retired = db.getFirstSync<{ category: string | null; active: number; deleted_at: string | null }>(
      'SELECT category, active, deleted_at FROM stems WHERE id = ?',
      ['retired-1'],
    );
    expect(retired).toEqual({ category: 'awareness', active: 0, deleted_at: '2026-01-02T00:00:00.000Z' });
    // Soft-deleted programme stems are still programme provenance: filled too.
    const softDeleted = db.getFirstSync<{ category: string | null }>(
      'SELECT category FROM stems WHERE id = ?',
      ['programme-deleted'],
    );
    expect(softDeleted?.category).toBe('awareness');

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('upgrading the v3 fixture tags the existing weekly meta-stem, inserts the new settings, and leaves other stems untouched', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(3), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v3 install: the v1 seed stems are present and active;
    // the weekly reflection stem exists as an origin='meta' row.
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day)
       VALUES ('stem-v1-1', 'A pre-amendment stem', 'seed', 'awareness', 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning')`,
      [],
    );
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
       VALUES ('stem-meta-1', 'If any of what I wrote this week is true, it might be helpful if I', 'meta', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0)`,
      [],
    );

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // ADR-0005 decision 6: the existing meta row is TAGGED, not duplicated.
    const weekly = db.getAllSync<{ id: string; is_weekly_meta: number }>(
      "SELECT id, is_weekly_meta FROM stems WHERE text = 'If any of what I wrote this week is true, it might be helpful if I'",
      [],
    );
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toEqual({ id: 'stem-meta-1', is_weekly_meta: 1 });

    // Spec §5.3 (as amended): pre-amendment installs keep their rows as
    // they are — no retirement, no programme tags, no retro-seeding.
    const v1 = db.getFirstSync<Record<string, unknown>>('SELECT * FROM stems WHERE id = ?', ['stem-v1-1']);
    expect(v1).toMatchObject({ active: 1, deleted_at: null, week_number: null, is_weekly_meta: 0 });
    expect((db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM stems WHERE week_number IS NOT NULL', []) as { c: number }).c).toBe(0);

    // The four §7 keys land for the upgrading install.
    const settings = Object.fromEntries(
      (db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings', []) as { key: string; value: string }[]).map(
        (r) => [r.key, r.value],
      ),
    );
    expect(settings['evening_practice_enabled']).toBe('true');
    expect(settings['weekly_meta_day']).toBe('"sunday"');
    expect(settings['weekly_meta_time']).toBe('"21:00"');
    expect(settings['program_week_override']).toBe('null');

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });
});
