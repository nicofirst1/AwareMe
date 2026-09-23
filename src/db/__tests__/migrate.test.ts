import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { migrate } from '../migrate';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../migrations';
import { MIGRATION_0004_OFFICIAL_PROGRAMME } from '../migrations/0004_official_programme';
import { MIGRATION_0006_EVENING_META_TIME_OF_DAY } from '../migrations/0006_evening_meta_time_of_day';
import { MIGRATION_0007_EVENING_PRACTICE_STARTER_SET } from '../migrations/0007_evening_practice_starter_set';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { EVENING_META_STEMS, EVENING_PRACTICE_SEED_STEMS, PROGRAMME_SEED_STEMS, programmeStemCategory, WEEKLY_META_STEM } from '../seed/stems';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/** Owner mode (issue 10): the canonical snapshot is on disk — untracked, owner-local. */
const SNAPSHOT_PRESENT = fs.existsSync(path.join(__dirname, '..', '..', '..', '.scratch', 'official-program', 'official-program-verbatim.txt'));
const SKIP_NOTE = SNAPSHOT_PRESENT ? '' : ' — SKIPPED: canonical snapshot not on disk (owner-local content; see README, "Seed content")';
const describeWithSnapshot = SNAPSHOT_PRESENT ? describe : describe.skip;

/**
 * The exact text migration 0004 tags the weekly meta row by, extracted from
 * the shipped SQL constant itself (issue 10: no programme text is quoted in
 * this tracked file). In owner mode it is additionally pinned to the seed
 * module's weekly stem — the shipped migration and the live seed cannot
 * disagree.
 */
const MIGRATION_0004_TAGGED_TEXT = /UPDATE stems SET is_weekly_meta = 1 WHERE origin = 'meta' AND text = '([^']+)';/.exec(
  MIGRATION_0004_OFFICIAL_PROGRAMME,
)?.[1];

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

    // Mimic a real v4 install: the whole programme corpus exists (seeded
    // after migration 0004) with NULL categories, plus rows the backfill
    // must never touch: a user stem, a programme stem whose category the
    // user already chose, a soft-deleted programme stem, and a retired v1
    // row. The scenario stems are deterministic picks from the loaded
    // content module's second week (issue 10), so the scenario exercises
    // identically under owner and example content.
    const scenarioWeeks = [...new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber))].sort((a, b) => a - b);
    expect(scenarioWeeks.length).toBeGreaterThanOrEqual(2);
    const scenarioWeek = scenarioWeeks[1];
    const presetStem = PROGRAMME_SEED_STEMS.find((s) => s.weekNumber === scenarioWeek);
    const deletedStem = [...PROGRAMME_SEED_STEMS].reverse().find((s) => s.weekNumber === scenarioWeek);
    expect(presetStem).toBeDefined();
    expect(deletedStem).toBeDefined();
    expect(presetStem!.text).not.toBe(deletedStem!.text); // distinct scenario rows
    // A user-chosen category that differs from the week default: the
    // backfill must preserve it even though the mapping disagrees.
    const presetCategory = programmeStemCategory(presetStem!.weekNumber, presetStem!.text) === 'purpose' ? 'awareness' : 'purpose';
    const presetIndex = PROGRAMME_SEED_STEMS.indexOf(presetStem!);
    const presetId = `programme-${presetIndex.toString().padStart(3, '0')}`;
    for (const [index, stem] of PROGRAMME_SEED_STEMS.entries()) {
      const preset = index === presetIndex ? presetCategory : null;
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
         VALUES ('programme-deleted', ?, 'seed', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', ?, 0, '2026-01-02T00:00:00.000Z')`,
      )
      .run(deletedStem!.text, scenarioWeek);

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    // Now CURRENT (6 with migration 0006): the v4 fixture flows through 0005
    // and 0006 on its way up.
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // Every programme row's category must equal what fresh-install seeding
    // would have written: the frozen migration and the live seed mapping
    // cannot drift, exceptions included, for the whole corpus.
    const rows = db.getAllSync<{ id: string; text: string; week_number: number; category: string | null }>(
      'SELECT id, text, week_number, category FROM stems WHERE id LIKE \'programme-%\' ORDER BY rowid',
      [],
    );
    expect(rows).toHaveLength(PROGRAMME_SEED_STEMS.length + 1); // + the soft-deleted block stem
    for (const row of rows) {
      if (row.id === presetId) {
        expect(row.category).toBe(presetCategory); // the user-chosen category survives untouched (§4.1)
        continue;
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
    expect(softDeleted?.category).toBe(programmeStemCategory(scenarioWeek, deletedStem!.text));

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('upgrading the v3 fixture tags the existing weekly meta-stem, inserts the new settings, and leaves other stems untouched', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(3), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v3 install: the v1 seed stems are present and active;
    // the weekly reflection stem exists as an origin='meta' row with the
    // exact text migration 0004 tags by — extracted from the shipped SQL
    // constant, not quoted here (issue 10).
    expect(MIGRATION_0004_TAGGED_TEXT).toBeDefined();
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day)
       VALUES ('stem-v1-1', 'A pre-amendment stem', 'seed', 'awareness', 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning')`,
      [],
    );
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
       VALUES ('stem-meta-1', ?, 'meta', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0)`,
      [MIGRATION_0004_TAGGED_TEXT!],
    );

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // ADR-0005 decision 6: the existing meta row is TAGGED, not duplicated.
    const weekly = db.getAllSync<{ id: string; is_weekly_meta: number }>(
      'SELECT id, is_weekly_meta FROM stems WHERE text = ?',
      [MIGRATION_0004_TAGGED_TEXT!],
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

  // Issue 10: proves the shipped migration and the live seed agree on the
  // weekly reflection stem without quoting programme text in this file.
  // Only meaningful in owner mode (the example weekly stem legitimately
  // differs from the real text the shipped 0004 SQL carries).
  describeWithSnapshot(`migration 0004's tagged text matches the seed module's weekly stem${SKIP_NOTE}`, () => {
    it('the shipped SQL and the live seed cannot disagree on the weekly reflection stem', () => {
      expect(MIGRATION_0004_TAGGED_TEXT).toBe(WEEKLY_META_STEM);
    });
  });

  it('upgrading the v5 fixture tags the two evening meta-stems (migration 0006), leaving the weekly meta-stem and look-alike user stems untouched', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(5), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v5 install's meta rows: the two evening reflection stems
    // (origin='meta', inactive, time_of_day NULL — the pre-issue-06 seed
    // shape) and the weekly meta-stem (tagged is_weekly_meta=1 by migration
    // 0004). The evening texts come from the live seed constant: if the
    // shipped SQL's frozen copies drifted, this test fails.
    for (const [index, text] of EVENING_META_STEMS.entries()) {
      db.runSync(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
         VALUES (?, ?, 'meta', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, NULL, NULL, 0)`,
        [`evening-meta-${index}`, text],
      );
    }
    expect(MIGRATION_0004_TAGGED_TEXT).toBeDefined();
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES ('weekly-meta', ?, 'meta', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, NULL, NULL, 1)`,
      [MIGRATION_0004_TAGGED_TEXT!],
    );
    // A user-authored stem verbatim-identical to an evening meta-stem: the
    // duplicate check excludes meta rows, so one can exist — the backfill
    // must never tag it (scope is the seed-authored meta rows).
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES ('user-lookalike', ?, 'user', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, NULL, NULL, 0)`,
      [EVENING_META_STEMS[0]],
    );

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // Since issue 17 the upgrade also lands the evening practice starter
    // set (migration 0007) — the tagging assertion scopes to the meta rows
    // 0006 governs; the starter rows are pinned by the 0007 suite below.
    const tagged = db.getAllSync<{ id: string; text: string; time_of_day: string | null; active: number }>(
      "SELECT id, text, time_of_day, active FROM stems WHERE origin = 'meta' AND time_of_day = 'evening' ORDER BY id",
      [],
    );
    expect(tagged.map((r) => r.id).sort()).toEqual(['evening-meta-0', 'evening-meta-1']);
    for (const row of tagged) {
      expect(EVENING_META_STEMS).toContain(row.text);
      expect(row.active).toBe(0); // visibility only — still never drawn by a practice
    }

    // The weekly meta-stem keeps NULL; the user look-alike keeps NULL.
    const weekly = db.getFirstSync<{ time_of_day: string | null }>('SELECT time_of_day FROM stems WHERE id = ?', ['weekly-meta']);
    expect(weekly?.time_of_day).toBeNull();
    const lookalike = db.getFirstSync<{ time_of_day: string | null }>('SELECT time_of_day FROM stems WHERE id = ?', ['user-lookalike']);
    expect(lookalike?.time_of_day).toBeNull();

    // Idempotent at the SQL level: re-running the shipped statement is a
    // no-op. The evening rows now comprise the two meta-stems 0006 tags
    // plus the starter set 0007 seeds on this upgrade path.
    db.execSync(MIGRATION_0006_EVENING_META_TIME_OF_DAY);
    expect(
      (db.getFirstSync<{ c: number }>("SELECT COUNT(*) AS c FROM stems WHERE time_of_day = 'evening'", []) as { c: number }).c,
    ).toBe(EVENING_META_STEMS.length + EVENING_PRACTICE_SEED_STEMS.length);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  // Issue 17: the shipped 0007 SQL and the live seed constant cannot drift —
  // the migration freezes the starter set's texts and categories, so a
  // seed-side edit without a matching migration fails here. Runs in BOTH
  // modes: the starter set is committed app-original text, independent of
  // the content module.
  it('migration 0007 freezes exactly the live starter set, text and category, in seed order', () => {
    // The shipped SQL writes one INSERT...SELECT per stem; the frozen text
    // and category are the 2nd and 4th literals. sqlString doubles single
    // quotes, so the extraction accepts doubled quotes too and would only
    // produce garbage (never a silent mismatch) if a future text carried one.
    const frozen = [
      ...MIGRATION_0007_EVENING_PRACTICE_STARTER_SET.matchAll(
        /SELECT 'm0007-evening-\d{2}', '((?:[^']|'')*)', 'seed', '([a-z_]+)'/g,
      ),
    ].map((m) => ({ text: m[1].replace(/''/g, "'"), category: m[2] }));
    expect(frozen).toEqual(EVENING_PRACTICE_SEED_STEMS.map((s) => ({ text: s.text, category: s.category })));
  });

  it('upgrading the v6 fixture seeds the evening practice starter set active and evening-tagged, skipping a text the install already has', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(6), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real pre-issue-17 install's stems: one user-authored row
    // verbatim-identical to a starter-set text (possible — the §6.6
    // duplicate check on that install could not have known these texts
    // yet) and one ordinary programme row. The lookalike keeps its own row
    // (the migration 0006 ruling), so the other six texts land.
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES ('user-lookalike', ?, 'user', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, NULL, NULL, 0)`,
      [EVENING_PRACTICE_SEED_STEMS[0].text],
    );
    db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES ('programme-1', ?, 'seed', 'awareness', 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', 1, 0)`,
      [PROGRAMME_SEED_STEMS[0].text],
    );

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // The six texts the install did not have land exactly as the fresh-install
    // seed writes them: active, evening-tagged, seed-origin, outside the
    // programme, with their frozen categories.
    const landed = db.getAllSync<{
      text: string;
      origin: string;
      category: string | null;
      active: number;
      time_of_day: string | null;
      week_number: number | null;
      is_weekly_meta: number;
      deleted_at: string | null;
    }>(
      "SELECT text, origin, category, active, time_of_day, week_number, is_weekly_meta, deleted_at FROM stems WHERE origin = 'seed' AND text IN (?, ?, ?, ?, ?, ?, ?)",
      EVENING_PRACTICE_SEED_STEMS.map((s) => s.text),
    );
    expect(landed).toHaveLength(EVENING_PRACTICE_SEED_STEMS.length - 1);
    for (const row of landed) {
      expect(row.active).toBe(1);
      expect(row.time_of_day).toBe('evening');
      expect(row.week_number).toBeNull();
      expect(row.is_weekly_meta).toBe(0);
      expect(row.deleted_at).toBeNull();
      expect(row.category).toBe(EVENING_PRACTICE_SEED_STEMS.find((s) => s.text === row.text)!.category);
    }

    // The lookalike text still belongs to exactly one row: the user's own,
    // untouched — no twin created.
    const lookalike = db.getAllSync<{ id: string; origin: string; active: number }>(
      'SELECT id, origin, active FROM stems WHERE text = ?',
      [EVENING_PRACTICE_SEED_STEMS[0].text],
    );
    expect(lookalike).toHaveLength(1);
    expect(lookalike[0]).toMatchObject({ id: 'user-lookalike', origin: 'user', active: 1 });

    // Idempotent at the SQL level: re-running the shipped statement is a no-op.
    const totalBefore = (db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM stems', []) as { c: number }).c;
    db.execSync(MIGRATION_0007_EVENING_PRACTICE_STARTER_SET);
    const totalAfter = (db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM stems', []) as { c: number }).c;
    expect(totalAfter).toBe(totalBefore);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('migration 0007 is a no-op on an empty stems table: a fresh install seeds the starter set itself', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(6), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    migrate(db, '9.9.9');

    // The row-count guard kept the table empty: seedIfEmpty's hasStems()
    // check must still see a fresh install, so the full corpus — starter
    // set included — seeds normally after migrate.
    expect((db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM stems', []) as { c: number }).c).toBe(0);
    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });
});
