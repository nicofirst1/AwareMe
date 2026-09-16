import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository, ALL_TABLES } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { DEFAULT_SETTINGS } from '../seed/settings';
import { EVENING_META_STEMS, META_STEMS, PROGRAMME_SEED_STEMS, RETIRED_SEED_STEMS, WEEKLY_META_STEM } from '../seed/stems';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { db: raw, repo: new Repository(executor) };
}

describe('Repository.seedIfEmpty', () => {
  it('seeds the official programme corpus (spec §5.3 as amended, ADR-0005)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    // 142 programme stems (byte-check lives in programmeSeed.test.ts) +
    // 1 weekly meta-stem + 26 soft-deleted retired originals, all
    // origin='seed'; plus the 2 evening meta-stems (origin='meta').
    const seedRows = (db.prepare("SELECT COUNT(*) as c FROM stems WHERE origin = 'seed'").get() as { c: number }).c;
    expect(seedRows).toBe(PROGRAMME_SEED_STEMS.length + 1 + RETIRED_SEED_STEMS.length);
    const texts = (db.prepare("SELECT text FROM stems WHERE origin = 'seed'").all() as { text: string }[]).map((r) => r.text);
    for (const t of texts) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
    // Programme stems are active morning stems of their week block.
    const programme = db
      .prepare('SELECT week_number, active, deleted_at, time_of_day FROM stems WHERE week_number IS NOT NULL')
      .all() as { week_number: number; active: number; deleted_at: string | null; time_of_day: string | null }[];
    expect(programme).toHaveLength(PROGRAMME_SEED_STEMS.length);
    for (const row of programme) {
      expect(row.active).toBe(1);
      expect(row.deleted_at).toBeNull();
      expect(row.time_of_day).toBe('morning');
      expect(row.week_number).toBeGreaterThanOrEqual(1);
      expect(row.week_number).toBeLessThanOrEqual(30);
    }
  });

  it('seeds the weekly reflection stem once, active, tagged is_weekly_meta = 1 (ADR-0005 decision 6)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const weekly = db
      .prepare('SELECT text, origin, active, week_number, time_of_day, is_weekly_meta, deleted_at FROM stems WHERE is_weekly_meta = 1')
      .all() as {
      text: string;
      origin: string;
      active: number;
      week_number: number | null;
      time_of_day: string | null;
      is_weekly_meta: number;
      deleted_at: string | null;
    }[];
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toMatchObject({
      text: WEEKLY_META_STEM,
      origin: 'seed',
      active: 1,
      week_number: null,
      time_of_day: null,
      is_weekly_meta: 1,
      deleted_at: null,
    });
  });

  it('seeds the 2 evening-review meta-stems as inactive stems rows with origin=meta (§5.4)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const metaRows = db.prepare("SELECT * FROM stems WHERE origin = 'meta'").all() as {
      text: string;
      active: number;
      category: string | null;
    }[];
    expect(metaRows).toHaveLength(2);
    expect(metaRows.map((r) => r.text).sort()).toEqual([...EVENING_META_STEMS].sort());
    for (const r of metaRows) {
      // Never selectable by the sitting draws (§6.2) or shown in the
      // library — they're a distinct concept from stems (CONTEXT.md).
      expect(r.active).toBe(0);
      expect(r.category).toBeNull();
    }
  });

  it('seeds the 26 retired v1 originals soft-deleted and inactive (spec §5.3, struck 2026-09-15)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const retired = db
      .prepare('SELECT text, active, deleted_at FROM stems WHERE deleted_at IS NOT NULL')
      .all() as { text: string; active: number; deleted_at: string | null }[];
    expect(retired).toHaveLength(26);
    expect(retired.map((r) => r.text).sort()).toEqual(RETIRED_SEED_STEMS.map((s) => s.text).sort());
    for (const r of retired) {
      expect(r.active).toBe(0);
      expect(r.deleted_at).toBeTruthy();
    }
  });

  it('assigns one of the six spec categories, or null, to every seed stem (programme stems are uncategorised)', () => {
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
    // origin != 'meta': meta-stems (§5.4) are a distinct concept from
    // stems (see the dedicated test above) and have no category by
    // construction.
    const stems = db.prepare('SELECT category FROM stems WHERE origin != \'meta\'').all() as {
      category: string | null;
    }[];
    for (const s of stems) {
      expect(validCategories.has(s.category)).toBe(true);
    }
    // Only the retired v1 originals carry categories; the official
    // programme and the weekly meta-stem are uncategorised (spec §5.2's
    // six buckets describe the v1 list, not the official programme). Of
    // the 26 retired stems, 24 have a category and 2 (the "general" pair)
    // are null — see DECISIONS.md.
    expect(stems.filter((s) => s.category === null)).toHaveLength(PROGRAMME_SEED_STEMS.length + 1 + 2);
    expect(stems.filter((s) => s.category !== null)).toHaveLength(24);
  });

  it('has 3 meta-stems matching spec §5.4, used only at review time per §6.5', () => {
    expect(META_STEMS).toHaveLength(3);
    expect(META_STEMS[0]).toBe('If any of what I wrote this week is true, it might be helpful if I');
  });

  it('seeds every default setting from spec §7 (including the 2026-09-15 additions)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    expect(rows).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
    for (const row of rows) {
      expect(JSON.parse(row.value)).toEqual(DEFAULT_SETTINGS[row.key as keyof typeof DEFAULT_SETTINGS]);
    }
  });

  it('is idempotent: calling it twice does not duplicate rows', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();
    repo.seedIfEmpty();
    repo.seedIfEmpty();

    const stemCount = (db.prepare('SELECT COUNT(*) as c FROM stems').get() as { c: number }).c;
    const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }).c;
    expect(stemCount).toBe(PROGRAMME_SEED_STEMS.length + 1 + EVENING_META_STEMS.length + RETIRED_SEED_STEMS.length);
    expect(settingsCount).toBe(Object.keys(DEFAULT_SETTINGS).length);
  });

  it('stores stems without a trailing terminator', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const texts = (db.prepare('SELECT text FROM stems').all() as { text: string }[]).map((r) => r.text);
    for (const text of texts) {
      expect(text.endsWith('...')).toBe(false);
      expect(text.endsWith('—')).toBe(false);
      expect(text.endsWith('…')).toBe(false);
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

    expect(dump.stems).toHaveLength(PROGRAMME_SEED_STEMS.length + 1 + EVENING_META_STEMS.length + RETIRED_SEED_STEMS.length);
    expect(dump.settings).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
  });
});

describe('Repository.setSetting', () => {
  it('updates a single key without touching the others', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();

    repo.setSetting('timer_seconds', 120);

    const settings = repo.getSettings();
    expect(settings.timer_seconds).toBe(120);
    expect(settings.endings_per_session).toBe(DEFAULT_SETTINGS.endings_per_session);
  });

  it('stamps updated_at on the row it touches', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    repo.setSetting('app_lock_enabled', true);

    const row = db.prepare('SELECT value, updated_at FROM settings WHERE key = ?').get('app_lock_enabled') as {
      value: string;
      updated_at: string;
    };
    expect(JSON.parse(row.value)).toBe(true);
    expect(() => new Date(row.updated_at).toISOString()).not.toThrow();
  });

  it('works even if the key was never seeded (upsert)', () => {
    const { repo } = freshRepository();
    // no seedIfEmpty() — settings table is empty

    repo.setSetting('theme', 'dark');

    expect(repo.getSettings().theme).toBe('dark');
  });

  it('back-fills settings keys added after a device was first seeded (2026-09-14: morning/evening notification times), with no migration needed', () => {
    const { db, repo } = freshRepository();
    // Simulates an existing install seeded before these keys existed: only
    // the pre-2026-09-14 key set is present in the settings table.
    const preExistingKeys: (keyof typeof DEFAULT_SETTINGS)[] = [
      'endings_per_session',
      'timer_seconds',
      'review_timer_seconds',
      'uncensored_mode',
      'stem_terminator',
      'app_lock_enabled',
      'weekly_review_prompt',
      'theme',
    ];
    for (const key of preExistingKeys) {
      db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        key,
        JSON.stringify(DEFAULT_SETTINGS[key]),
        '2026-01-01T00:00:00.000Z',
      );
    }

    const settings = repo.getSettings();
    expect(settings.stem_timer_enabled).toBe(DEFAULT_SETTINGS.stem_timer_enabled);
    expect(settings.stem_timer_seconds).toBe(DEFAULT_SETTINGS.stem_timer_seconds);
    expect(settings.morning_notification_time).toBe(DEFAULT_SETTINGS.morning_notification_time);
    expect(settings.evening_notification_time).toBe(DEFAULT_SETTINGS.evening_notification_time);
  });
});

describe('Repository.isOnboardingComplete / setOnboardingComplete', () => {
  it('defaults to false on a fresh database', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();
    expect(repo.isOnboardingComplete()).toBe(false);
  });

  it('becomes true after setOnboardingComplete, and stays out of getSettings', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();

    repo.setOnboardingComplete();

    expect(repo.isOnboardingComplete()).toBe(true);
    // Not one of §7's tunables — must not leak into the typed Settings object.
    expect(repo.getSettings()).not.toHaveProperty('onboarding_completed');
  });

  it('is false again after deleteAllData (a factory reset shows onboarding again)', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();
    repo.setOnboardingComplete();

    repo.deleteAllData();

    expect(repo.isOnboardingComplete()).toBe(false);
  });
});

describe('Repository.deleteAllData', () => {
  it('wipes stems, sessions, endings, reviews, notification_schedule, and re-seeds to factory defaults', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const stem = repo.listActiveStems()[0];
    repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: new Date().toISOString(),
      deviceLocale: 'en-US',
    });
    repo.setSetting('theme', 'dark');
    repo.insertScheduledNotification({ scheduledFor: new Date().toISOString(), stemId: stem.id, osIdentifier: 'x' });

    repo.deleteAllData();

    expect((db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) as c FROM endings').get() as { c: number }).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) as c FROM notification_schedule').get() as { c: number }).c).toBe(0);
    // Re-seeded: stems and settings are back to factory state.
    expect(repo.listActiveStems().length).toBeGreaterThan(0);
    expect(repo.getSettings().theme).toBe(DEFAULT_SETTINGS.theme);
    // schema_meta is bookkeeping, not user data — untouched by the wipe.
    expect((db.prepare('SELECT COUNT(*) as c FROM schema_meta').get() as { c: number }).c).toBe(1);
  });

  it('is safe to call on an empty (unseeded) database', () => {
    const { repo } = freshRepository();
    expect(() => repo.deleteAllData()).not.toThrow();
    expect(repo.hasStems()).toBe(true); // re-seeded
  });
});
