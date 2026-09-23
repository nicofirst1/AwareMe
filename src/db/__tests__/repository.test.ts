import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository, ALL_TABLES } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { DEFAULT_SETTINGS } from '../seed/settings';
import { EVENING_META_STEMS, EVENING_PRACTICE_SEED_STEMS, META_STEMS, PROGRAMME_SEED_STEMS, RETIRED_SEED_STEMS, WEEKLY_META_STEM } from '../seed/stems';

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
    // 1 weekly meta-stem + 26 soft-deleted retired originals + the evening
    // practice starter set (issue 17), all origin='seed'; plus the 2
    // evening meta-stems (origin='meta').
    const seedRows = (db.prepare("SELECT COUNT(*) as c FROM stems WHERE origin = 'seed'").get() as { c: number }).c;
    expect(seedRows).toBe(PROGRAMME_SEED_STEMS.length + 1 + EVENING_PRACTICE_SEED_STEMS.length + RETIRED_SEED_STEMS.length);
    const texts = (db.prepare("SELECT text FROM stems WHERE origin = 'seed'").all() as { text: string }[]).map((r) => r.text);
    for (const t of texts) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
    // Issue 09: Only week 1 active, weeks 2..30 resting.
    const programme = db
      .prepare('SELECT week_number, active, deleted_at, time_of_day FROM stems WHERE week_number IS NOT NULL')
      .all() as { week_number: number; active: number; deleted_at: string | null; time_of_day: string | null }[];
    expect(programme).toHaveLength(PROGRAMME_SEED_STEMS.length);
    let week1Count = 0;
    let restingCount = 0;
    for (const row of programme) {
      expect(row.deleted_at).toBeNull();
      expect(row.time_of_day).toBe('morning');
      expect(row.week_number).toBeGreaterThanOrEqual(1);
      expect(row.week_number).toBeLessThanOrEqual(30);
      if (row.week_number === 1) {
        expect(row.active).toBe(1);
        week1Count++;
      } else {
        expect(row.active).toBe(0);
        restingCount++;
      }
    }
    // Week 1 active, all weeks 2+ resting. Total = PROGRAMME_SEED_STEMS.length.
    expect(week1Count).toBeGreaterThanOrEqual(1);
    expect(restingCount).toBe(PROGRAMME_SEED_STEMS.length - week1Count);
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

  it('seeds the 2 evening-review meta-stems as inactive, evening-tagged stems rows with origin=meta (§5.4, issue 06)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const metaRows = db.prepare("SELECT * FROM stems WHERE origin = 'meta'").all() as {
      text: string;
      active: number;
      category: string | null;
      time_of_day: string | null;
      deleted_at: string | null;
    }[];
    expect(metaRows).toHaveLength(2);
    expect(metaRows.map((r) => r.text).sort()).toEqual([...EVENING_META_STEMS].sort());
    for (const r of metaRows) {
      // Never selectable by the practice draws (§6.2) — seeded inactive and
      // still inactive. Since issue 06 they ARE shown in the library as
      // resting rows tagged 'evening', so the Evening filter matches them.
      expect(r.active).toBe(0);
      expect(r.time_of_day).toBe('evening');
      expect(r.deleted_at).toBeNull();
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

  it('assigns one of the six spec categories, or null, to every seed stem (programme stems carry their week pillar)', () => {
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
    // Issue 04: every official programme stem is categorised via the
    // week→pillar mapping; the weekly meta-stem has none. Of the 26 retired
    // v1 stems, 24 have a category and 2 (the "general" pair) are null —
    // see docs/DECISIONS.md.
    expect(stems.filter((s) => s.category === null)).toHaveLength(1 + 2);
    expect(stems.filter((s) => s.category !== null)).toHaveLength(PROGRAMME_SEED_STEMS.length + 24 + EVENING_PRACTICE_SEED_STEMS.length);
  });

  it('has 3 meta-stems matching spec §5.4, used only at review time per §6.5', () => {
    expect(META_STEMS).toHaveLength(3);
    // Issue 10: [0] is the official weekly reflection stem (licensed text,
    // loaded from the content module); [1..2] are the app's original
    // evening stems.
    expect(META_STEMS[0]).toBe(WEEKLY_META_STEM);
    expect(META_STEMS.slice(1)).toEqual([...EVENING_META_STEMS]);
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
    expect(stemCount).toBe(PROGRAMME_SEED_STEMS.length + 1 + EVENING_META_STEMS.length + EVENING_PRACTICE_SEED_STEMS.length + RETIRED_SEED_STEMS.length);
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

    expect(dump.stems).toHaveLength(
      PROGRAMME_SEED_STEMS.length + 1 + EVENING_META_STEMS.length + EVENING_PRACTICE_SEED_STEMS.length + RETIRED_SEED_STEMS.length,
    );
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

    // w1-t7 (s1-F7): the dead active-stem read is deleted (zero production
    // callers) — fixture reads derive the same set from listAllStems.
    const stem = repo.listAllStems().filter((s) => s.active !== 0 && s.deleted_at === null)[0];
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
    expect(repo.listAllStems().filter((s) => s.active !== 0 && s.deleted_at === null).length).toBeGreaterThan(0);
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

describe('Repository.seedIfEmpty — activation provenance (migration 0008, packet-7 D2)', () => {
  it('seeds programme rows as provenance \'programme\' and every other class as \'user\' (fresh install)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    // The programme INSERT writes 'programme' explicitly: on a fresh install
    // migrations run BEFORE seeding, so the column's DEFAULT 'user' would
    // otherwise mislabel every programme row. The seed's own membership rule
    // (week_number IS NOT NULL) is the backfill rule — the two cannot drift.
    const programme = db
      .prepare('SELECT activation_provenance FROM stems WHERE week_number IS NOT NULL')
      .all() as { activation_provenance: string }[];
    expect(programme).toHaveLength(PROGRAMME_SEED_STEMS.length);
    for (const row of programme) {
      expect(row.activation_provenance).toBe('programme');
    }

    // Every other seed class keeps the column DEFAULT 'user': the weekly
    // meta-stem, the two evening meta-stems, the evening starter set and
    // the retired v1 originals (all week_number NULL).
    const others = db
      .prepare('SELECT origin, is_weekly_meta, activation_provenance FROM stems WHERE week_number IS NULL')
      .all() as { origin: string; is_weekly_meta: number; activation_provenance: string }[];
    expect(others).toHaveLength(
      1 + EVENING_META_STEMS.length + EVENING_PRACTICE_SEED_STEMS.length + RETIRED_SEED_STEMS.length,
    );
    for (const row of others) {
      expect(row.activation_provenance).toBe('user');
    }
  });

  it('lands rows written after seeding on the DEFAULT too (addStem does not name the column)', () => {
    const { db, repo } = freshRepository();
    repo.seedIfEmpty();

    const added = repo.addStem({ text: 'A post-seed user stem', category: null, origin: 'user' });
    const addedRow = db.prepare('SELECT activation_provenance FROM stems WHERE id = ?').get(added) as {
      activation_provenance: string;
    };
    expect(addedRow.activation_provenance).toBe('user');
  });
});

describe('migration 0008 accessors — sessions.programme_on exposure (packet-7 D3)', () => {
  it('listCompletedWeeklyReflections exposes programmeOn per reflection; every row reads 1 pre-wave-2', () => {
    const { repo } = freshRepository();
    repo.seedIfEmpty();
    const weekly = repo.getWeeklyMetaStem();
    if (!weekly) throw new Error('seed must include the weekly meta-stem');

    // The real Start write path: createSession does not name the new column,
    // so the row lands on the DEFAULT 1 — no off state exists pre-wave-2,
    // nothing is 'unknown'. w2-t2's counting rule consumes this value.
    const sessionId = repo.createSession({
      stemId: weekly.id,
      stemTextSnapshot: 'snapshot',
      origin: 'review',
      targetEndings: 1,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-07T19:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-07T19:01:00.000Z');
    repo.autosaveEndingText(sessionId, 1, 'something true', 0, '2026-09-07T19:02:00.000Z');
    repo.finalizeSession(sessionId, 'user_done', '2026-09-07T19:03:00.000Z');

    const reflections = repo.listCompletedWeeklyReflections();
    expect(reflections).toHaveLength(1);
    expect(reflections[0].startedAt).toBe('2026-09-07T19:00:00.000Z');
    expect(reflections[0].programmeOn).toBe(1);
  });
});
