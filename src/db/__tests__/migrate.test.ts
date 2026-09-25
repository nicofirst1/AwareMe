import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { migrate } from '../migrate';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../migrations';
import { MIGRATION_0004_OFFICIAL_PROGRAMME } from '../migrations/0004_official_programme';
import { MIGRATION_0006_EVENING_META_TIME_OF_DAY } from '../migrations/0006_evening_meta_time_of_day';
import { MIGRATION_0007_EVENING_PRACTICE_STARTER_SET } from '../migrations/0007_evening_practice_starter_set';
import { MIGRATION_0008_ACTIVATION_PROVENANCE } from '../migrations/0008_activation_provenance';
import { MIGRATION_0009_HOME_NAV_DEFAULT_RESET } from '../migrations/0009_home_nav_default_reset';
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

/**
 * The exact backfill UPDATE migration 0008 ships, extracted from the shipped
 * SQL constant itself (issue 10's extraction pattern): the D2 rule must BE
 * `week_number IS NOT NULL → 'programme'` — a changed predicate fails the
 * pin below instead of silently backfilling a different row set.
 */
const MIGRATION_0008_BACKFILL_UPDATE =
  /^UPDATE stems SET activation_provenance = 'programme' WHERE week_number IS NOT NULL;$/m.exec(MIGRATION_0008_ACTIVATION_PROVENANCE)?.[0];

/**
 * The exact reset UPDATE migration 0009 ships, extracted from the shipped
 * SQL constant itself (issue 10's extraction pattern): the reset must BE
 * `home_nav_expanded = 'true' → 'false'` scoped to that one key — a changed
 * predicate fails the pin below instead of silently resetting other keys
 * or standing values.
 */
const MIGRATION_0009_RESET_UPDATE =
  /^UPDATE settings SET value = 'false', updated_at = '2026-09-25T00:00:00\.000Z' WHERE key = 'home_nav_expanded' AND value = 'true';$/m.exec(
    MIGRATION_0009_HOME_NAV_DEFAULT_RESET,
  )?.[0];

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

  // --- Migration 0008 (wave-2 w2-t1): activation provenance + programme-on record ---

  it("the v8 fixture carries migration 0008's two columns with their NOT NULL defaults", () => {
    // Frozen at the migration that introduced the pin; 0009's cycle bumps it.
    expect(CURRENT_SCHEMA_VERSION).toBe(9);
    const raw = new DatabaseSync(fixturePath(8));
    const columnsOf = (table: string) =>
      Object.fromEntries(
        (raw.prepare(`PRAGMA table_info(${table})`).all() as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
        }[]).map((c) => [c.name, c]),
      );
    const stems = columnsOf('stems');
    const sessions = columnsOf('sessions');
    expect(stems['activation_provenance']).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: "'user'" });
    expect(sessions['programme_on']).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '1' });
    // D6/ADR-0004: the vestigial weight column is NOT dropped by 0008.
    expect(stems['weight']).toMatchObject({ type: 'REAL' });
    raw.close();
  });

  it("migration 0008 (v7→v8) backfills provenance deterministically — exactly the programme rows, soft-deleted included — and the shipped rule cannot drift from the live seed's membership", () => {
    expect(MIGRATION_0008_BACKFILL_UPDATE).toBeDefined();
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(7), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v7 install's stems table: the whole live programme
    // corpus (seeded after migrate), one soft-deleted programme stem, the
    // weekly meta-stem, the two evening meta-stems, the evening starter
    // set, a retired v1 original, a user stem and an imported stem. Every
    // class the backfill must distinguish is present, built from the LIVE
    // seed constants — so the shipped SQL and the live seed cannot drift
    // (issue 10's cross-pin pattern; unlike 0005 there is no user-set value
    // to preserve: the column is new, so the whole table pins against the
    // rule).
    for (const [index, stem] of PROGRAMME_SEED_STEMS.entries()) {
      raw
        .prepare(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', NULL, 'en', 1.0, ?, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', ?, 0)`,
        )
        .run(`programme-${index.toString().padStart(3, '0')}`, stem.text, stem.weekNumber === 1 ? 1 : 0, stem.weekNumber);
    }
    // A soft-deleted programme row: a deterministic pick from the loaded
    // corpus (its last stem, at its own week) with a tombstone — the class
    // 0005's precedent says stays programme provenance.
    const deletedProgramme = PROGRAMME_SEED_STEMS[PROGRAMME_SEED_STEMS.length - 1];
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta, deleted_at)
         VALUES ('programme-deleted', ?, 'seed', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', ?, 0, '2026-01-02T00:00:00.000Z')`,
      )
      .run(deletedProgramme.text, deletedProgramme.weekNumber);
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
         VALUES ('weekly-meta', ?, 'seed', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, NULL, NULL, 1)`,
      )
      .run(WEEKLY_META_STEM);
    for (const [index, text] of EVENING_META_STEMS.entries()) {
      raw
        .prepare(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'meta', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'evening', NULL, 0)`,
        )
        .run(`evening-meta-${index}`, text);
    }
    for (const [index, stem] of EVENING_PRACTICE_SEED_STEMS.entries()) {
      raw
        .prepare(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'evening', NULL, 0)`,
        )
        .run(`starter-${index}`, stem.text, stem.category);
    }
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta, deleted_at)
         VALUES ('retired-1', 'A retired v1 original', 'seed', NULL, 'en', 1.0, 0, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'morning', NULL, 0, '2026-01-02T00:00:00.000Z')`,
      )
      .run();
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
         VALUES ('user-1', 'A user stem', 'user', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0)`,
      )
      .run();
    raw
      .prepare(
        `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day)
         VALUES ('imported-1', 'An imported stem', 'imported', NULL, 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0, 'evening')`,
      )
      .run();

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    // The determinism pin: EVERY row of the table against the shipped rule.
    const rows = db.getAllSync<{
      id: string;
      week_number: number | null;
      active: number;
      deleted_at: string | null;
      time_of_day: string | null;
      activation_provenance: string;
    }>('SELECT id, week_number, active, deleted_at, time_of_day, activation_provenance FROM stems', []);
    for (const row of rows) {
      expect(row.activation_provenance).toBe(row.week_number !== null ? 'programme' : 'user');
    }

    // Class cross-pins against the live seed: every programme week resolves
    // 'programme' (soft-deleted included), everything else 'user'. The
    // count composes like 0005's: the whole corpus + the soft-deleted twin.
    const programme = rows.filter((r) => r.id.startsWith('programme-'));
    expect(programme).toHaveLength(PROGRAMME_SEED_STEMS.length + 1); // + the soft-deleted programme row
    for (const row of programme) expect(row.activation_provenance).toBe('programme');
    expect(rows.find((r) => r.id === 'programme-deleted')).toMatchObject({
      activation_provenance: 'programme',
      active: 0,
      deleted_at: '2026-01-02T00:00:00.000Z', // tombstone untouched
    });
    for (const id of ['weekly-meta', 'evening-meta-0', 'evening-meta-1', 'starter-0', 'retired-1', 'user-1', 'imported-1']) {
      expect(rows.find((r) => r.id === id)).toMatchObject({ activation_provenance: 'user' });
    }

    // Nothing else changed: the migration writes exactly one column. The
    // user stem keeps its state; a resting week-2+ row keeps its rest and
    // its morning tag (found by predicate, not by index guess).
    expect(rows.find((r) => r.id === 'user-1')).toMatchObject({ active: 1, deleted_at: null, time_of_day: null });
    const restingWeek = rows.find((r) => r.id.startsWith('programme-') && r.week_number !== 1 && r.active === 0);
    expect(restingWeek).toBeDefined();
    expect(restingWeek).toMatchObject({ deleted_at: null, time_of_day: 'morning' });

    // Idempotent at the SQL level: re-running the shipped UPDATE is a no-op.
    const before = JSON.stringify(rows.map((r) => r.activation_provenance));
    db.execSync(MIGRATION_0008_BACKFILL_UPDATE!);
    const after = db
      .getAllSync<{ activation_provenance: string }>('SELECT activation_provenance FROM stems', [])
      .map((r) => r.activation_provenance);
    expect(JSON.stringify(after)).toBe(before);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('migration 0008 fills sessions.programme_on = 1 on every pre-existing row and on rows written after the upgrade (nothing is unknown)', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(7), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // A v7 install can already carry sessions (the columns 0001 defines).
    // Two shapes: one minimal, one with nullable columns set. The FK needs
    // the stem to exist first.
    db.runSync(
      `INSERT INTO stems (id, text, origin, language, weight, active, created_at, created_tz, created_offset_min)
       VALUES ('stem-x', 'A v7-era stem', 'user', 'en', 1.0, 1, '2026-01-01T00:00:00.000Z', 'UTC', 0)`,
      [],
    );
    db.runSync(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode, started_at, last_activity_at, tz, offset_min, device_locale)
       VALUES ('sess-min', 'stem-x', 'snapshot', 'manual', 6, 90, 1, '2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z', 'UTC', 0, 'en-US')`,
      [],
    );
    db.runSync(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode, started_at, first_keypress_at, ended_at, end_reason, last_activity_at, tz, offset_min, device_locale)
       VALUES ('sess-full', 'stem-x', 'snapshot', 'review', 1, 90, 0, '2026-09-02T08:00:00.000Z', '2026-09-02T08:00:05.000Z', '2026-09-02T08:01:00.000Z', 'user_done', '2026-09-02T08:01:00.000Z', 'Europe/Berlin', 120, 'de-DE')`,
      [],
    );

    migrate(db, '9.9.9');

    // No off state exists pre-wave-2: every pre-existing reflection was
    // written while the programme was on, so the DEFAULT fill IS the
    // backfill — deterministic by construction.
    const rows = db.getAllSync<{ id: string; programme_on: number }>('SELECT id, programme_on FROM sessions', []);
    expect(rows.map((r) => r.id).sort()).toEqual(['sess-full', 'sess-min']);
    for (const row of rows) expect(row.programme_on).toBe(1);

    // A session written after the upgrade (the createSession path, which
    // does not name the column) lands on the same DEFAULT.
    db.runSync(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode, started_at, last_activity_at, tz, offset_min, device_locale)
       VALUES ('sess-new', 'stem-x', 'snapshot', 'manual', 6, 90, 0, '2026-09-03T08:00:00.000Z', '2026-09-03T08:00:00.000Z', 'UTC', 0, 'en-US')`,
      [],
    );
    const fresh = db.getFirstSync<{ programme_on: number }>('SELECT programme_on FROM sessions WHERE id = ?', [
      'sess-new',
    ]);
    expect(fresh?.programme_on).toBe(1);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('migration 0008 runs as a no-op against the empty tables of a fresh install: seeding labels the corpus itself', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(7), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    migrate(db, '9.9.9');

    // 0007's template: on a fresh install the UPDATE touches zero rows and
    // the tables stay empty — seedIfEmpty must still see a fresh install
    // and label the corpus itself (repository.test.ts pins that side).
    expect((db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM stems', []) as { c: number }).c).toBe(0);
    expect((db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM sessions', []) as { c: number }).c).toBe(0);
    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  // Packet-11 t7-fixes (owner report 2026-09-25: "menu must be collapsed by
  // default"): the seed default for home_nav_expanded is false, but
  // installs that ever toggled the dock open carry a stored 'true' the
  // default could never reach again. 0009 resets that one stored value —
  // the three install classes must resolve correctly, and a toggle after
  // the migration must persist normally (a one-time reset, not a trigger).
  it('the shipped 0009 reset is scoped exactly to the home_nav_expanded true row', () => {
    expect(MIGRATION_0009_RESET_UPDATE).toBeDefined();
  });

  it('migration 0009 (v8→v9) resets a stored expanded dock to the default and leaves every other shape untouched', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(8), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // Mimic a real v8 install's settings table: the owner's class (stored
    // 'true' from an earlier toggle), a collapsed install ('false'), an
    // old install without the row, and an unrelated KV row the reset must
    // never touch. Values are the repository's JSON-encoded forms.
    const insertSetting = (key: string, value: string, at: string) =>
      raw.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, at);
    insertSetting('home_nav_expanded', 'true', '2026-09-24T10:00:00.000Z');
    insertSetting('stem_terminator', '"..."', '2026-09-20T10:00:00.000Z');
    insertSetting('onboarding_completed', 'true', '2026-09-20T10:00:00.000Z');

    migrate(db, '9.9.9');

    const meta = db.getFirstSync<{ schema_version: number }>('SELECT schema_version FROM schema_meta WHERE id = 1', []);
    expect(meta?.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    const byKey = Object.fromEntries(
      (db.getAllSync<{ key: string; value: string; updated_at: string }>('SELECT key, value, updated_at FROM settings', []) as {
        key: string;
        value: string;
        updated_at: string;
      }[]).map((r) => [r.key, r]),
    );
    // The owner's class: reset to the JSON-encoded default, bookkeeping stamp.
    expect(byKey['home_nav_expanded']).toEqual({ key: 'home_nav_expanded', value: 'false', updated_at: '2026-09-25T00:00:00.000Z' });
    // Unrelated rows untouched (value AND stamp).
    expect(byKey['stem_terminator']).toEqual({ key: 'stem_terminator', value: '"..."', updated_at: '2026-09-20T10:00:00.000Z' });
    expect(byKey['onboarding_completed']).toEqual({ key: 'onboarding_completed', value: 'true', updated_at: '2026-09-20T10:00:00.000Z' });

    // A toggle after the migration persists normally: the reset is a
    // one-time write, not a standing trigger.
    db.runSync("UPDATE settings SET value = 'true', updated_at = '2026-09-26T08:00:00.000Z' WHERE key = 'home_nav_expanded'", []);
    const toggled = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['home_nav_expanded']);
    expect(toggled?.value).toBe('true');

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });

  it('migration 0009 is a no-op for installs already collapsed or without the row', () => {
    const scratch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'copy.db');
    fs.copyFileSync(fixturePath(8), scratch);
    const raw = new DatabaseSync(scratch);
    const db = nodeSqliteExecutor(raw);

    // The collapsed class: 'false' stays 'false' with its own stamp. The
    // pre-packet-10 class: no row at all — getSettings' defaults merge
    // resolves it collapsed; the migration must not insert one.
    raw
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('home_nav_expanded', 'false', '2026-09-23T10:00:00.000Z');

    migrate(db, '9.9.9');

    const row = db.getFirstSync<{ value: string; updated_at: string }>(
      'SELECT value, updated_at FROM settings WHERE key = ?',
      ['home_nav_expanded'],
    );
    expect(row).toEqual({ value: 'false', updated_at: '2026-09-23T10:00:00.000Z' });

    // Fresh-install class: migrations run before seeding, so an empty
    // settings table must stay empty through 0009 (the seed writes the
    // default itself; repository.test.ts pins that side).
    const fresh = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'six-endings-migrate-')), 'fresh.db');
    const rawFresh = new DatabaseSync(fresh);
    const dbFresh = nodeSqliteExecutor(rawFresh);
    migrate(dbFresh, '9.9.9');
    // (Migration 0004 legitimately inserts its four §7 settings on this
    // path — the fresh-install assertion is that home_nav_expanded in
    // particular has NO row: the seed writes the default itself;
    // repository.test.ts pins that side.)
    expect(
      (dbFresh.getFirstSync<{ c: number }>(
        'SELECT COUNT(*) AS c FROM settings WHERE key = ?',
        ['home_nav_expanded'],
      ) as { c: number }).c,
    ).toBe(0);
    rawFresh.close();
    fs.rmSync(path.dirname(fresh), { recursive: true, force: true });

    raw.close();
    fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  });
});
