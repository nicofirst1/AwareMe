import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository, ALL_TABLES } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { DEFAULT_SETTINGS } from '../seed/settings';
import { META_STEMS } from '../seed/stems';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { db: raw, repo: new Repository(executor) };
}

describe('Repository.seedIfEmpty', () => {
  it('inserts all 26 seed stems with origin=seed', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const stems = db.prepare("SELECT * FROM stems WHERE origin = 'seed'").all() as { text: string; category: string | null }[];
    expect(stems).toHaveLength(26);
    for (const s of stems) {
      expect(typeof s.text).toBe('string');
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('assigns one of the six spec categories, or null, to every seed stem', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const validCategories = new Set([
      'awareness',
      'self_acceptance',
      'responsibility',
      'assertiveness',
      'purpose',
      'integrity',
      null,
    ]);
    const stems = db.prepare('SELECT category FROM stems').all() as { category: string | null }[];
    for (const s of stems) {
      expect(validCategories.has(s.category)).toBe(true);
    }
    // exactly two stems (spec's "general" heading, §5.3) have no category
    expect(stems.filter((s) => s.category === null)).toHaveLength(2);
  });

  it('has 3 meta-stems matching spec §5.4 (not stored in `stems`; used at review time per §6.5)', () => {
    expect(META_STEMS).toHaveLength(3);
    expect(META_STEMS[0]).toBe('If any of what I wrote this week is true, it might be helpful if I');
  });

  it('seeds every default setting from spec §7', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    expect(rows).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
    for (const row of rows) {
      expect(JSON.parse(row.value)).toEqual(DEFAULT_SETTINGS[row.key]);
    }
  });

  it('is idempotent: calling it twice does not duplicate rows', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();
    repo.seedIfEmpty();
    repo.seedIfEmpty();

    const stemCount = (db.prepare('SELECT COUNT(*) as c FROM stems').get() as { c: number }).c;
    const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }).c;
    expect(stemCount).toBe(26);
    expect(settingsCount).toBe(Object.keys(DEFAULT_SETTINGS).length);
  });

  it('stores stems without a trailing terminator', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const texts = (db.prepare('SELECT text FROM stems').all() as { text: string }[]).map((r) => r.text);
    for (const text of texts) {
      expect(text.endsWith('...')).toBe(false);
      expect(text.endsWith('—')).toBe(false);
    }
  });

  it('records created_at/created_tz/created_offset_min on every seed stem', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const rows = db.prepare('SELECT created_at, created_tz, created_offset_min FROM stems').all() as {
      created_at: string;
      created_tz: string;
      created_offset_min: number;
    }[];
    for (const r of rows) {
      expect(() => new Date(r.created_at).toISOString()).not.toThrow();
      expect(r.created_tz.length).toBeGreaterThan(0);
      expect(typeof r.created_offset_min).toBe('number');
    }
  });
});

describe('Repository.dumpAllTables', () => {
  it('returns every table, empty before seeding except schema_meta', () => {
    const { repo } = freshRepository();
    const dump = repo.dumpAllTables();

    expect(Object.keys(dump).sort()).toEqual([...ALL_TABLES].sort());
    expect(dump.stems).toHaveLength(0);
    expect(dump.schema_meta).toHaveLength(1);
  });

  it('reflects seeded rows after seedIfEmpty', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();
    const dump = repo.dumpAllTables();

    expect(dump.stems).toHaveLength(26);
    expect(dump.settings).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
  });
});
