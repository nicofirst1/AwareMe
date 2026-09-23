/**
 * Week-set activation against real SQLite — the same node:sqlite pattern as
 * `migrate.test.ts`/`programRepository.test.ts`.
 *
 * Packet-7 D2 (wave 2) rewrites the write's semantics: automation may only
 * ACTIVATE programme stems the user has never touched (`activation_provenance
 * = 'programme'`, migration 0008) at or below the unlock frontier, in one
 * statement. It never deactivates (the old `ELSE 0` resting write is retired),
 * never reorders (the queue reads `rowid` order and the write never touches
 * it), and never re-activates a row the user deactivated (every user touch
 * flips provenance to 'user' via `setStemActive` — D2's "never touched" rule).
 * The write's boundaries are unchanged from issue 04: §4.1 append-only
 * (history rows and soft-deletes' columns are never touched), the weekly
 * meta-stem, evening meta-stems and user stems stay outside the set
 * (`week_number IS NULL`), and the one-off visit read
 * (`getProgrammeWeekBlock`) is activation-state-agnostic.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { applyWeekSetActivation, readMorningPracticeQueue } from '../../session/programRead';
import { PROGRAMME_SEED_STEMS } from '../seed/stems';

// Issue 10: week choices and per-week counts derive from the loaded content
// module, so the suite exercises identically under the owner's licensed
// corpus and the committed example corpus. Intent is unchanged: distinct
// in-corpus weeks with known stem counts.
const CORPUS_WEEKS = [...new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber))].sort((a, b) => a - b);
const weekA = CORPUS_WEEKS[0];
const weekB = CORPUS_WEEKS[Math.min(2, CORPUS_WEEKS.length - 1)];
const weekC = CORPUS_WEEKS[CORPUS_WEEKS.length - 1];
const weekD = CORPUS_WEEKS[Math.min(4, CORPUS_WEEKS.length - 1)];
// The next DISTINCT corpus week below the top — the floor once the top
// week's rows leave automation's scope (a user touch). Corpus-independence
// promise (header above): derive expectations from CORPUS_WEEKS structure
// itself, never from another derived week or index-magic that assumes the
// example shape (the owner's dense 30-week corpus put `weekD` at 5 while
// the true floor stayed 29).
const weekBelowC = CORPUS_WEEKS[CORPUS_WEEKS.length - 2];
const countOf = (week: number): number => PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === week).length;
const allActive = (week: number): number[] => new Array(countOf(week)).fill(1);

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

describe('setProgrammeWeekActive (D2: provenance-scoped activation, never resting)', () => {
  it('fresh install seeds only the first corpus week active, every later week resting (issue 09)', () => {
    const { raw } = makeDb();

    const byWeek = activeByWeek(raw);
    // Issue 09: weeks 2..N rest at seed — every corpus week after the first
    // holds only inactive (resting) rows, the first week only active ones.
    // (The seed's initial state is not the funnel: D2 stops AUTOMATION from
    // resting, the seed still starts from week 1 only.)
    for (const week of CORPUS_WEEKS) {
      if (week === weekA) {
        expect(byWeek.get(week)).toBe(countOf(weekA));
        expect(byWeek.get(-weekA)).toBeUndefined();
      } else {
        expect(byWeek.get(-week)).toBe(countOf(week));
        expect(byWeek.get(week)).toBeUndefined();
      }
    }
  });

  it('activates untouched programme stems of weeks 1..N; higher weeks keep their own state (no resting write)', () => {
    const { raw, repo } = makeDb();

    repo.setProgrammeWeekActive(weekB);
    let byWeek = activeByWeek(raw);
    for (const week of CORPUS_WEEKS) {
      if (week <= weekB) {
        expect(byWeek.get(week)).toBe(countOf(week)); // weeks 1..B unlocked
        expect(byWeek.get(-week)).toBeUndefined();
      } else {
        // D2: higher weeks are NOT rested — they keep the seed's resting
        // state because the funnel never writes active = 0.
        expect(byWeek.get(-week)).toBe(countOf(week));
        expect(byWeek.get(week)).toBeUndefined();
      }
    }

    // Raising the frontier admits the newly unlocked week; every earlier
    // week stays active — no re-lock on raise.
    repo.setProgrammeWeekActive(weekC);
    byWeek = activeByWeek(raw);
    for (const week of CORPUS_WEEKS) {
      if (week <= weekC) {
        expect(byWeek.get(week)).toBe(countOf(week));
        expect(byWeek.get(-week)).toBeUndefined();
      } else {
        expect(byWeek.get(-week)).toBe(countOf(week));
        expect(byWeek.get(week)).toBeUndefined();
      }
    }
    expect(byWeek.get(weekA)).toBe(countOf(weekA));
    expect(byWeek.get(weekB)).toBe(countOf(weekB));
  });

  it('never deactivates: re-running the funnel at a LOWER frontier leaves higher weeks exactly as they were (D2 retires the ELSE-0 write)', () => {
    const { raw, repo } = makeDb();
    repo.setProgrammeWeekActive(weekC); // everything 1..C active
    expect(activeByWeek(raw).get(weekC)).toBe(countOf(weekC));

    repo.setProgrammeWeekActive(weekB); // a lower frontier arrives (override cleared, say)
    const byWeek = activeByWeek(raw);
    // The old write rested every week above the frontier; D2 never does.
    for (const week of CORPUS_WEEKS) {
      if (week > weekB) {
        expect(byWeek.get(week)).toBe(countOf(week)); // RED on the old UPDATE (rested to 0)
        expect(byWeek.get(-week)).toBeUndefined();
      }
    }
  });

  it('never re-activates a user-deactivated programme stem, even below the frontier (D2: automation activates only untouched rows)', () => {
    const { raw, repo } = makeDb();
    const victim = repo.getProgrammeWeekBlock(weekA)[0];
    repo.setStemActive(victim.id, false); // the user touch (flips provenance — pinned below)
    expect(raw.prepare('SELECT activation_provenance as p FROM stems WHERE id = ?').get(victim.id)).toEqual({ p: 'user' });

    repo.setProgrammeWeekActive(weekC); // frontier well above the row's week
    const after = raw.prepare('SELECT active FROM stems WHERE id = ?').get(victim.id) as { active: number };
    expect(after).toEqual({ active: 0 }); // RED on the old UPDATE (CASE ... THEN 1 re-activates it)
  });

  it('still activates the untouched rows of the unlocked weeks (the scoped write keeps its purpose)', () => {
    const { raw, repo } = makeDb();
    const [touched, ...untouched] = repo.getProgrammeWeekBlock(weekB);
    repo.setStemActive(touched.id, false); // the user takes this one out of automation's scope

    repo.setProgrammeWeekActive(weekC);
    const flags = (
      raw.prepare('SELECT active FROM stems WHERE week_number = ? AND deleted_at IS NULL ORDER BY rowid').all(weekB) as {
        active: number;
      }[]
    ).map((r) => r.active);
    // Every untouched week-B row activated; the touched one did not.
    expect(flags.filter((f) => f === 1)).toHaveLength(untouched.length);
    const touchedRow = raw.prepare('SELECT active FROM stems WHERE id = ?').get(touched.id) as { active: number };
    expect(touchedRow).toEqual({ active: 0 });
  });

  it('no programme row ever flips active 1 -> 0 through the funnel, whatever frontier order arrives', () => {
    const { raw, repo } = makeDb();
    const snapshot = (): { id: string; active: number }[] =>
      raw.prepare('SELECT id, active FROM stems WHERE week_number IS NOT NULL ORDER BY id').all() as {
        id: string;
        active: number;
      }[];

    repo.setProgrammeWeekActive(weekC);
    const peak = snapshot();
    // Frontiers arriving in every order — including lowerings — never un-activate a row.
    for (const week of [...CORPUS_WEEKS].reverse()) {
      repo.setProgrammeWeekActive(week);
      const after = snapshot();
      for (const row of peak) {
        if (row.active === 1) {
          expect(after.find((r) => r.id === row.id)?.active).toBe(1); // RED on the old write
        }
      }
    }
  });

  it('never reorders: the rotation queue keeps rowid order across repeated funnel runs', () => {
    const { repo } = makeDb();
    repo.setProgrammeWeekActive(weekA);
    const before = readMorningPracticeQueue(repo).map((s) => s.id);
    expect(before).toEqual(repo.getProgrammeWeekBlock(weekA).map((s) => s.id)); // rowid/seed order

    repo.setProgrammeWeekActive(weekC);
    repo.setProgrammeWeekActive(weekB);
    repo.setProgrammeWeekActive(weekA);
    expect(readMorningPracticeQueue(repo).map((s) => s.id)).toEqual(before);
  });

  it('leaves user stems, the weekly meta-stem, the evening meta-stems and the retired originals untouched', () => {
    const { raw, repo } = makeDb();
    const userId = repo.addStem({ text: 'My own stem', category: 'purpose', origin: 'user' });

    repo.setProgrammeWeekActive(weekD);

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
    repo.setProgrammeWeekActive(weekD);
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

  it('the funnel write never flips activation_provenance (automation keeps programme rows programme)', () => {
    const { raw, repo } = makeDb();
    const before = raw
      .prepare('SELECT id, activation_provenance as p FROM stems WHERE week_number IS NOT NULL ORDER BY id')
      .all();
    repo.setProgrammeWeekActive(weekC);
    const after = raw
      .prepare('SELECT id, activation_provenance as p FROM stems WHERE week_number IS NOT NULL ORDER BY id')
      .all();
    expect(after).toEqual(before);
  });
});

describe('setStemActive (D2 provenance flip: every user touch claims the row)', () => {
  it('writes activation_provenance = user on a programme row, deactivate direction', () => {
    const { raw, repo } = makeDb();
    const stem = repo.getProgrammeWeekBlock(weekA)[0];
    expect(raw.prepare('SELECT activation_provenance as p FROM stems WHERE id = ?').get(stem.id)).toEqual({ p: 'programme' });

    repo.setStemActive(stem.id, false);
    expect(raw.prepare('SELECT active, activation_provenance as p FROM stems WHERE id = ?').get(stem.id)).toEqual({
      active: 0,
      p: 'user',
    });
  });

  it('writes activation_provenance = user on a programme row, re-activate direction too (a re-activation is also a user touch)', () => {
    const { raw, repo } = makeDb();
    const stem = repo.getProgrammeWeekBlock(weekB)[0]; // seed-resting week
    repo.setStemActive(stem.id, true);
    expect(raw.prepare('SELECT active, activation_provenance as p FROM stems WHERE id = ?').get(stem.id)).toEqual({
      active: 1,
      p: 'user',
    });
  });

  it('is one atomic statement: active and provenance move together (bulk loop and editor shapes share this write)', () => {
    const { raw, repo } = makeDb();
    const stem = repo.getProgrammeWeekBlock(weekA)[0];
    repo.setStemActive(stem.id, false);
    const row = raw.prepare('SELECT active, activation_provenance as p FROM stems WHERE id = ?').get(stem.id) as {
      active: number;
      p: string;
    };
    // A row can never be observed deactivated but still programme-claimed:
    // the two columns change in the one UPDATE, never in sequence.
    expect(row.active === 0 || row.p === 'user').toBe(true);
    expect(row.active === 1 && row.p === 'programme').toBe(false);
  });

  it('leaves non-programme rows honest: a user stem is already user, the evening metas keep their resting flags', () => {
    const { raw, repo } = makeDb();
    const userId = repo.addStem({ text: 'Manual stem', category: null, origin: 'user' });
    repo.setStemActive(userId, false);
    expect(raw.prepare('SELECT active, activation_provenance as p FROM stems WHERE id = ?').get(userId)).toEqual({
      active: 0,
      p: 'user',
    });

    const eveningMeta = raw.prepare("SELECT id FROM stems WHERE origin = 'meta' LIMIT 1").get() as { id: string };
    repo.setStemActive(eveningMeta.id, false);
    expect(raw.prepare('SELECT active, activation_provenance as p FROM stems WHERE id = ?').get(eveningMeta.id)).toEqual({
      active: 0,
      p: 'user',
    });
  });
});

describe('getHighestUnlockedWeek (the stored floor, D2-scoped)', () => {
  it('reads the highest active week among provenance-programme rows only — a user touch lowers the floor', () => {
    const { repo } = makeDb();
    repo.setProgrammeWeekActive(weekC);
    expect(repo.getHighestUnlockedWeek()).toBe(weekC);

    // The user deactivates every stem of the top week: those rows leave
    // automation's scope (provenance 'user'), so the floor drops with them —
    // to the next distinct corpus week below the top, whatever the corpus
    // shape is (NOT `weekD`, which only coincides on the example corpus).
    for (const stem of repo.getProgrammeWeekBlock(weekC)) {
      repo.setStemActive(stem.id, false);
    }
    expect(repo.getHighestUnlockedWeek()).toBe(weekBelowC);
  });

  it('a user-activated programme stem never raises the automation floor (provenance left the programme)', () => {
    const { repo } = makeDb();
    expect(repo.getHighestUnlockedWeek()).toBe(weekA); // fresh seed: week 1 only
    const resting = repo.getProgrammeWeekBlock(weekC)[0];
    repo.setStemActive(resting.id, true); // the user's own activation
    expect(repo.getHighestUnlockedWeek()).toBe(weekA); // not weekC — the row is 'user' now
  });

  it('returns 0 when no programme-provenance row is active', () => {
    const { repo } = makeDb();
    for (const week of CORPUS_WEEKS) {
      for (const stem of repo.getProgrammeWeekBlock(week)) {
        if (raw_active(repo, stem.id)) repo.setStemActive(stem.id, false);
      }
    }
    expect(repo.getHighestUnlockedWeek()).toBe(0);
  });

  function raw_active(repo: Repository, id: string): boolean {
    // listAllStems carries the active flag; the rows here are all programme
    // stems (never soft-deleted in this suite).
    return repo.listAllStems().find((s) => s.id === id)?.active === 1;
  }
});

describe('getProgrammeWeekBlock (one-off visit read, activation-state-agnostic)', () => {
  it('returns the whole non-deleted block in seed order even when the week is resting', () => {
    const { repo } = makeDb();

    const block = repo.getProgrammeWeekBlock(weekB);
    const seedWeekB = PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === weekB);
    expect(block.map((s) => s.text)).toEqual(seedWeekB.map((s) => s.text));
    expect(block.every((s) => s.origin === 'seed')).toBe(true);
  });

  it('excludes soft-deleted stems and rejects out-of-range weeks', () => {
    const { repo } = makeDb();
    const victim = repo.getProgrammeWeekBlock(weekD)[0];
    repo.softDeleteStem(victim.id, '2026-09-16T00:00:00.000Z');

    expect(repo.getProgrammeWeekBlock(weekD)).toHaveLength(countOf(weekD) - 1);
    expect(repo.getProgrammeWeekBlock(0)).toEqual([]);
    expect(repo.getProgrammeWeekBlock(31)).toEqual([]);
  });
});

describe('listProgrammeStems (programme page read)', () => {
  it('includes resting stems and still excludes soft-deleted ones', () => {
    const { repo } = makeDb();
    repo.setProgrammeWeekActive(weekD);
    const victim = repo.listProgrammeStems().find((s) => s.weekNumber === weekB)!;
    repo.softDeleteStem(victim.id, '2026-09-16T00:00:00.000Z');

    const stems = repo.listProgrammeStems();
    expect(stems).toHaveLength(PROGRAMME_SEED_STEMS.length - 1);
    expect(stems.filter((s) => s.weekNumber === weekD)).toHaveLength(countOf(weekD)); // resting week still listed
    expect(stems.find((s) => s.id === victim.id)).toBeUndefined();
    // Ordered by week then seed order.
    for (let i = 1; i < stems.length; i++) {
      expect(stems[i].weekNumber).toBeGreaterThanOrEqual(stems[i - 1].weekNumber);
    }
  });
});

describe('week-set activation end to end over the §6.2/§7 setting (D2 engine)', () => {
  /** `active` lives on the row, not on the rotation read's StemRow shape — read it directly. */
  function activeFlags(raw: DatabaseSync, week: number): number[] {
    return (
      raw.prepare('SELECT active FROM stems WHERE week_number = ? AND deleted_at IS NULL ORDER BY rowid').all(week) as {
        active: number;
      }[]
    ).map((r) => r.active);
  }

  it('set-week unlocks 1..override (untouched rows only); clearing keeps every active row active; the queue follows the effective week', () => {
    const { raw, repo } = makeDb();

    // The make-my-week flow (week.tsx): setting the override, then activation.
    repo.setSetting('program_week_override', weekB);
    applyWeekSetActivation(repo);
    expect(activeFlags(raw, weekA)).toEqual(allActive(weekA)); // cumulative: 1..B unlocked
    expect(activeFlags(raw, weekB)).toEqual(allActive(weekB));
    // The morning rotation reads the override week's active stems.
    expect(readMorningPracticeQueue(repo).map((s) => s.text)).toEqual(
      PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === weekB).map((s) => s.text),
    );

    // The clear path (card toggle or reflection completion): the override is
    // gone so the queue reads the derived week again (weekA — no anchor on a
    // fresh corpus). D2: nothing is ever rested, so every unlocked row STAYS
    // active — no auto-re-lock exists to test for, because the resting write
    // no longer exists.
    repo.setSetting('program_week_override', null);
    applyWeekSetActivation(repo);
    expect(activeFlags(raw, weekA)).toEqual(allActive(weekA));
    expect(activeFlags(raw, weekB)).toEqual(allActive(weekB));
    expect(readMorningPracticeQueue(repo)).toHaveLength(countOf(weekA));
  });

  it('user stems and the weekly meta-stem stay out of the activation set entirely', () => {
    const { raw, repo } = makeDb();
    repo.addStem({ text: 'Manual stem', category: null, origin: 'user' });

    repo.setSetting('program_week_override', weekD);
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

  it('a user-deactivated programme stem survives the whole end-to-end cycle (set + clear my week — the s5 #2 repro, D2-retired)', () => {
    const { raw, repo } = makeDb();
    // The device-reproduced trample (s5 #2): deactivate one week-1 stem,
    // set + clear my-week, and the old funnel brought it back. Under D2 the
    // user's deactivation outlives every automation pass.
    const victim = repo.getProgrammeWeekBlock(weekA)[0];
    repo.setStemActive(victim.id, false);

    repo.setSetting('program_week_override', weekB);
    applyWeekSetActivation(repo);
    repo.setSetting('program_week_override', null);
    applyWeekSetActivation(repo);

    expect(raw.prepare('SELECT active FROM stems WHERE id = ?').get(victim.id)).toEqual({ active: 0 });
    // ...while the untouched rows of both weeks stay active.
    expect(activeFlags(raw, weekA).filter((f) => f === 1)).toHaveLength(countOf(weekA) - 1);
    expect(activeFlags(raw, weekA).every((f) => f === 1 || f === 0)).toBe(true);
    expect(activeFlags(raw, weekB)).toEqual(allActive(weekB));
  });
});
