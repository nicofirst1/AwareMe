/**
 * Week-set activation (issue 04, v12-feedback round) against real SQLite —
 * the same node:sqlite pattern as `migrate.test.ts`/`programRepository.test.ts`.
 *
 * Covers the acceptance pair "set-week → that week active, others inactive,
 * manual stems untouched (both directions + clear)" plus the boundaries the
 * write must respect: §4.1 append-only (history rows and soft-deletes are
 * never touched), the weekly meta-stem and non-programme rows stay outside
 * the set, and the one-off visit read (`getProgrammeWeekBlock`) is
 * activation-state-agnostic.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { applyWeekSetActivation, readMorningSittingQueue } from '../../session/programRead';
import { PROGRAMME_SEED_STEMS } from '../seed/stems';

function makeDb(): { raw: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const db = nodeSqliteExecutor(raw);
  migrate(db, '1.0.0');
  const repo = new Repository(db);
  repo.seedIfEmpty();
  return { raw, repo };
}

function activeByWeek(raw: DatabaseSync): Map<number, number> {
  const rows = raw
    .prepare(
      `SELECT week_number as week, active, COUNT(*) as n FROM stems
       WHERE week_number IS NOT NULL AND deleted_at IS NULL
       GROUP BY week_number, active`,
    )
    .all() as { week: number; active: number; n: number }[];
  const map = new Map<number, number>();
  for (const row of rows) {
    const key = row.active === 1 ? row.week : -row.week;
    map.set(key, (map.get(key) ?? 0) + row.n);
  }
  return map;
}

describe('setProgrammeWeekActive (issue 04 week-set activation)', () => {
  it('fresh install seeds every programme week active; activation then isolates exactly one week', () => {
    const { raw, repo } = makeDb();

    // Before any activation write, the seed's own state: all 142 active.
    let byWeek = activeByWeek(raw);
    expect(byWeek.get(1)).toBe(4); // weeks are keyed positive when active
    expect(byWeek.get(-1)).toBeUndefined();

    repo.setProgrammeWeekActive(3);

    byWeek = activeByWeek(raw);
    expect(byWeek.get(3)).toBe(4);
    // Every other week rests: 29 resting weeks hold the remaining stems.
    const restingWeeks = [...byWeek.keys()].filter((k) => k < 0);
    expect(restingWeeks).toHaveLength(29);
    const restingStems = restingWeeks.reduce((sum, key) => sum + (byWeek.get(key) ?? 0), 0);
    expect(restingStems).toBe(142 - 4);
  });

  it('activates the target week and rests all others, both directions (set 12, then set 5)', () => {
    const { raw, repo } = makeDb();

    repo.setProgrammeWeekActive(12);
    let byWeek = activeByWeek(raw);
    expect(byWeek.get(12)).toBe(4);
    expect(byWeek.get(-12)).toBeUndefined();
    expect([...byWeek.keys()].filter((k) => k > 0)).toEqual([12]);

    repo.setProgrammeWeekActive(5);
    byWeek = activeByWeek(raw);
    expect(byWeek.get(5)).toBe(4);
    expect(byWeek.get(12)).toBeUndefined();
    expect(byWeek.get(-12)).toBe(4); // the previously active week rests too
  });

  it('leaves user stems, the weekly meta-stem, the evening meta-stems and the retired originals untouched', () => {
    const { raw, repo } = makeDb();
    const userId = repo.addStem({ text: 'My own stem', category: 'purpose', origin: 'user' });

    repo.setProgrammeWeekActive(7);

    const user = raw.prepare('SELECT active, deleted_at FROM stems WHERE id = ?').get(userId) as {
      active: number;
      deleted_at: string | null;
    };
    expect(user).toEqual({ active: 1, deleted_at: null }); // manual stems unaffected

    const weekly = raw
      .prepare('SELECT active, deleted_at FROM stems WHERE is_weekly_meta = 1')
      .get() as { active: number; deleted_at: string | null };
    expect(weekly).toEqual({ active: 1, deleted_at: null }); // weekly meta unaffected

    const eveningMetas = raw.prepare("SELECT active FROM stems WHERE origin = 'meta'").all() as { active: number }[];
    expect(eveningMetas).toHaveLength(2);
    expect(eveningMetas.every((r) => r.active === 0)).toBe(true);

    const retired = raw.prepare('SELECT COUNT(*) as c FROM stems WHERE deleted_at IS NOT NULL AND active = 0').get() as {
      c: number;
    };
    expect(retired.c).toBe(26); // soft-deleted rows untouched: same flags as the seed wrote
  });

  it('is a no-op for out-of-range weeks (same guard as the rotation reads)', () => {
    const { raw, repo } = makeDb();
    repo.setProgrammeWeekActive(5);
    const before = raw.prepare('SELECT id, active FROM stems WHERE week_number IS NOT NULL ORDER BY id').all();

    repo.setProgrammeWeekActive(0);
    repo.setProgrammeWeekActive(31);
    repo.setProgrammeWeekActive(2.5);
    repo.setProgrammeWeekActive(Number.NaN);

    const after = raw.prepare('SELECT id, active FROM stems WHERE week_number IS NOT NULL ORDER BY id').all();
    expect(after).toEqual(before);
  });

  it('never touches history or soft-delete columns', () => {
    const { raw, repo } = makeDb();
    const before = raw.prepare('SELECT id, deleted_at FROM stems ORDER BY id').all();
    repo.setProgrammeWeekActive(2);
    const after = raw.prepare('SELECT id, deleted_at FROM stems ORDER BY id').all();
    expect(after).toEqual(before);
  });
});

describe('getProgrammeWeekBlock (one-off visit read, activation-state-agnostic)', () => {
  it('returns the whole non-deleted block in seed order even when the week is resting', () => {
    const { repo } = makeDb();
    repo.setProgrammeWeekActive(1); // week 3 now rests

    const block = repo.getProgrammeWeekBlock(3);
    const seedWeek3 = PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === 3);
    expect(block.map((s) => s.text)).toEqual(seedWeek3.map((s) => s.text));
    expect(block.every((s) => s.origin === 'seed')).toBe(true);
  });

  it('excludes soft-deleted stems and rejects out-of-range weeks', () => {
    const { repo } = makeDb();
    const victim = repo.getProgrammeWeekBlock(5)[0];
    repo.softDeleteStem(victim.id, '2026-09-16T00:00:00.000Z');

    expect(repo.getProgrammeWeekBlock(5)).toHaveLength(PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === 5).length - 1);
    expect(repo.getProgrammeWeekBlock(0)).toEqual([]);
    expect(repo.getProgrammeWeekBlock(31)).toEqual([]);
  });
});

describe('listProgrammeStems (programme page read)', () => {
  it('includes resting stems after activation and still excludes soft-deleted ones', () => {
    const { repo } = makeDb();
    repo.setProgrammeWeekActive(2);
    const victim = repo.listProgrammeStems().find((s) => s.weekNumber === 9)!;
    repo.softDeleteStem(victim.id, '2026-09-16T00:00:00.000Z');

    const stems = repo.listProgrammeStems();
    expect(stems).toHaveLength(PROGRAMME_SEED_STEMS.length - 1);
    expect(stems.filter((s) => s.weekNumber === 2)).toHaveLength(4); // resting week still listed
    expect(stems.find((s) => s.id === victim.id)).toBeUndefined();
    // Ordered by week then seed order.
    for (let i = 1; i < stems.length; i++) {
      expect(stems[i].weekNumber).toBeGreaterThanOrEqual(stems[i - 1].weekNumber);
    }
  });
});

describe('week-set activation end to end over the §6.2/§7 setting', () => {
  /** `active` lives on the row, not on the rotation read's StemRow shape — read it directly. */
  function activeFlags(raw: DatabaseSync, week: number): number[] {
    return (
      raw.prepare('SELECT active FROM stems WHERE week_number = ? AND deleted_at IS NULL ORDER BY rowid').all(week) as {
        active: number;
      }[]
    ).map((r) => r.active);
  }

  it('set-week activates the override week; clearing restores the derived week; the rotation queue follows', () => {
    const { raw, repo } = makeDb();

    // The make-my-week flow (week.tsx): setting the override, then activation.
    repo.setSetting('program_week_override', 12);
    applyWeekSetActivation(repo);
    expect(activeFlags(raw, 12)).toEqual([1, 1, 1, 1]);
    expect(
      raw
        .prepare('SELECT COUNT(*) as c FROM stems WHERE week_number IS NOT NULL AND week_number != 12 AND active = 1')
        .get(),
    ).toEqual({ c: 0 });
    // The morning rotation reads the override week's active stems.
    expect(readMorningSittingQueue(repo).map((s) => s.text)).toEqual(
      PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === 12).map((s) => s.text),
    );

    // The clear path (card toggle or reflection completion): the derived week
    // (1 — no anchor on a fresh corpus) takes over.
    repo.setSetting('program_week_override', null);
    applyWeekSetActivation(repo);
    expect(activeFlags(raw, 1)).toEqual([1, 1, 1, 1]);
    expect(
      raw
        .prepare('SELECT COUNT(*) as c FROM stems WHERE week_number IS NOT NULL AND week_number != 1 AND active = 1')
        .get(),
    ).toEqual({ c: 0 });
    expect(readMorningSittingQueue(repo)).toHaveLength(4);
  });

  it('user stems and the weekly meta-stem stay out of the activation set entirely', () => {
    const { raw, repo } = makeDb();
    repo.addStem({ text: 'Manual stem', category: null, origin: 'user' });

    repo.setSetting('program_week_override', 5);
    applyWeekSetActivation(repo);

    const nonProgramme = raw
      .prepare(
        `SELECT text, active, deleted_at FROM stems
         WHERE week_number IS NULL AND deleted_at IS NULL AND is_weekly_meta = 0`,
      )
      .all() as { text: string; active: number; deleted_at: string | null }[];
    // Only the two evening meta-stems match this shape among seed rows; the
    // user stem must remain active, the metas must remain inactive.
    const user = nonProgramme.find((r) => r.text === 'Manual stem');
    expect(user?.active).toBe(1);
    expect(nonProgramme.filter((r) => r.active === 0)).toHaveLength(2);

    const weekly = raw.prepare('SELECT active FROM stems WHERE is_weekly_meta = 1').get() as { active: number };
    expect(weekly.active).toBe(1);
  });
});
