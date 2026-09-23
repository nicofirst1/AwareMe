/**
 * Unit tests for the DB-facing programme compositions (`programRead.ts`)
 * over a stub repository — no database, no clock; every `now` is
 * injected. The SQL reads themselves are exercised against real SQLite in
 * `programRepository.test.ts`.
 */
import {
  applyWeekSetActivation,
  readEveningReflectionInputs,
  readHomeProgrammeStatus,
  readMorningPracticeQueue,
  readProgrammeWeek,
  readWeeklyReflectionInputs,
  shouldClearOverride,
} from '@/session/programRead';
import { DEFAULT_SETTINGS, type Repository, type Settings } from '@/db';

type Repo = {
  getFirstProgrammePractice: () => { startedAt: string; offsetMin: number } | null;
  listCompletedWeeklyReflections: () => { startedAt: string; offsetMin: number; programmeOn: number }[];
  listCompletedEveningReflections: () => { startedAt: string; offsetMin: number }[];
  getProgrammeStemsForWeek: (week: number) => { id: string; text: string }[];
  listAllStems: () => {
    id: string;
    text: string;
    origin: string;
    time_of_day: string | null;
    active: number;
    deleted_at: string | null;
    created_at: string;
    weekNumber: number | null;
  }[];
  listMetaStems: () => { id: string; text: string; origin: string }[];
  getWeeklyMetaStem: () => { id: string; text: string } | null;
  listSessionsForDayMorning: (start: string, end: string) => unknown[];
  listSessionsForProgrammeWeek: (week: number) => unknown[];
  countProgrammeStemsCompletedInRange: (week: number, start: string, end: string) => number;
  getHighestUnlockedWeek: () => number;
  getSettings: () => Settings;
  setProgrammeWeekActive: (week: number) => void;
};

function makeRepo(overrides: Partial<Repo> = {}): Repository {
  return {
    getFirstProgrammePractice: () => null,
    listCompletedWeeklyReflections: () => [],
    listCompletedEveningReflections: () => [],
    getProgrammeStemsForWeek: () => [],
    listAllStems: () => [],
    listMetaStems: () => [
      { id: 'weekly', text: 'weekly meta', origin: 'seed' },
      { id: 'evening-a', text: 'evening meta A', origin: 'meta' },
      { id: 'evening-b', text: 'evening meta B', origin: 'meta' },
    ],
    getWeeklyMetaStem: () => ({ id: 'weekly', text: 'weekly meta', origin: 'seed' }),
    listSessionsForDayMorning: () => [],
    listSessionsForProgrammeWeek: () => [],
    countProgrammeStemsCompletedInRange: () => 0,
    getHighestUnlockedWeek: () => 0,
    getSettings: () => DEFAULT_SETTINGS,
    ...overrides,
  } as unknown as Repository;
}

/** The repo's reflection rows are (startedAt, offsetMin) event triples; these helpers write Berlin-summer (UTC+2) locals. */
function atIso(localWallIso: string, offsetMin = 120): { startedAt: string; offsetMin: number } {
  return { startedAt: new Date(Date.parse(localWallIso) - offsetMin * 60_000).toISOString(), offsetMin };
}

/** First programme practice Tue 2026-09-01 morning (Berlin) → anchor week Monday 2026-08-31. */
const ANCHOR = { getFirstProgrammePractice: () => atIso('2026-09-01T06:00:00Z') };

/** A completed WEEKLY reflection row as the repository's read now returns it (migration 0008 added `programmeOn`). Defaults to on — every pre-wave-2 row reads 1. */
function refl(localWallIso: string, programmeOn: 0 | 1 = 1): { startedAt: string; offsetMin: number; programmeOn: number } {
  return { ...atIso(localWallIso), programmeOn };
}

describe('readProgrammeWeek', () => {
  it('derives week 1 with no anchor, even with pre-programme reflections', () => {
    const repo = makeRepo({ listCompletedWeeklyReflections: () => [refl('2026-01-04T21:00:00Z')] });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week).toMatchObject({ derivedWeek: 1, override: null, currentWeek: 1 });
  });

  it('counts anchored reflection weeks from the first programme practice onward', () => {
    const repo = makeRepo({
      // First programme practice in the week of Mon 2026-08-31 (UTC+2 wall: Tue 2026-09-01).
      getFirstProgrammePractice: () => atIso('2026-09-01T06:00:00Z'),
      // Two reflections in distinct later weeks + one same-week duplicate + one pre-anchor.
      listCompletedWeeklyReflections: () => [
        refl('2026-01-11T21:00:00Z'), // pre-anchor: never counts
        refl('2026-09-06T21:00:00Z'), // anchor week (Sun)
        refl('2026-09-08T21:00:00Z'), // same Mon–Sun week as above: counts once
        refl('2026-09-13T21:00:00Z'), // next week
      ],
    });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week.derivedWeek).toBe(3); // 1 + {anchor week, next week}
  });

  it('applies the override on top of the derived week', () => {
    const repo = makeRepo({
      getFirstProgrammePractice: () => atIso('2026-09-01T06:00:00Z'),
      listCompletedWeeklyReflections: () => [refl('2026-09-06T21:00:00Z')],
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 7 }),
    });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week.derivedWeek).toBe(2);
    expect(week.currentWeek).toBe(7);
    // Issue 09: the frontier rides the override — the manual-enable floor.
    expect(week.unlockFrontier).toBe(7);
  });

  it('unlockFrontier floors at the highest stored active week (legacy installs never regress)', () => {
    // A pre-c10 install has every stem active: the stored floor (30) outranks
    // both the null override and the low derived week.
    const repo = makeRepo({ getHighestUnlockedWeek: () => 30 });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week.derivedWeek).toBe(1);
    expect(week.unlockFrontier).toBe(30);
  });
});

describe('readHomeProgrammeStatus', () => {

  it('reports the practice state, evening gate, and weekly card for a plain day', () => {
    // Wednesday 2026-09-16 (not the default target day, Sunday).
    const repo = makeRepo({
      ...ANCHOR,
      getProgrammeStemsForWeek: () => [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }],
      countProgrammeStemsCompletedInRange: () => 1,
    });
    const status = readHomeProgrammeStatus(repo, new Date('2026-09-16T14:00:00Z'));
    expect(status.week.currentWeek).toBe(1);
    expect(status.weekStemCount).toBe(2);
    expect(status.morningDone).toBe(false);
    expect(status.eveningEnabled).toBe(true);
    expect(status.eveningDone).toBe(false);
    expect(status.weeklyCardToday).toBe(false);
    expect(status.nudge).toBeNull();
    expect(status.programmeComplete).toBe(false);
  });

  it('marks the morning practice done once every week stem completed today', () => {
    const repo = makeRepo({
      ...ANCHOR,
      getProgrammeStemsForWeek: () => [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }],
      countProgrammeStemsCompletedInRange: () => 2,
    });
    expect(readHomeProgrammeStatus(repo, new Date('2026-09-16T14:00:00Z')).morningDone).toBe(true);
  });

  it('marks the evening done only for a reflection completed today', () => {
    const repo = makeRepo({
      ...ANCHOR,
      listCompletedEveningReflections: () => [atIso('2026-09-16T09:00:00Z')],
    });
    expect(readHomeProgrammeStatus(repo, new Date('2026-09-16T21:00:00Z')).eveningDone).toBe(true);
    expect(readHomeProgrammeStatus(repo, new Date('2026-09-17T21:00:00Z')).eveningDone).toBe(false);
  });

  it('shows the nudge only when this calendar week advanced the derived week, with derived numbers', () => {
    // Reflections in the previous week AND this Sunday (2026-09-20, anchor
    // week +2) → derived 2 without the current week, 3 with it.
    const repo = makeRepo({
      ...ANCHOR,
      listCompletedWeeklyReflections: () => [refl('2026-09-09T12:00:00Z'), refl('2026-09-20T12:00:00Z')],
    });
    const status = readHomeProgrammeStatus(repo, new Date('2026-09-20T12:00:00Z'));
    expect(status.nudge).toEqual({ completedWeek: 2, nextWeek: 3 });

    // A second reflection in the SAME week changes nothing: the standing
    // message stays exactly as truthful as after the first one (a calendar
    // week counts once, §6.2).
    const twice = makeRepo({
      ...ANCHOR,
      listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z'), refl('2026-09-19T12:00:00Z')],
    });
    expect(readHomeProgrammeStatus(twice, new Date('2026-09-20T12:00:00Z')).nudge).toEqual({
      completedWeek: 1,
      nextWeek: 2,
    });
  });

  it('never nudges before the programme started', () => {
    const repo = makeRepo({ listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z')] });
    expect(readHomeProgrammeStatus(repo, new Date('2026-09-20T12:00:00Z')).nudge).toBeNull();
  });

  it('gates the weekend card on weekly_meta_day and reports the done state', () => {
    const withReflection = { listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z')] };
    const sunday = new Date('2026-09-20T12:00:00Z'); // Sunday midday Berlin
    const monday = new Date('2026-09-21T10:00:00Z'); // Monday midday Berlin

    const doneRepo = makeRepo({ ...ANCHOR, ...withReflection });
    const doneStatus = readHomeProgrammeStatus(doneRepo, sunday);
    expect(doneStatus.weeklyCardToday).toBe(true);
    expect(doneStatus.weeklyDoneThisWeek).toBe(true);

    const openRepo = makeRepo({ ...ANCHOR });
    const openStatus = readHomeProgrammeStatus(openRepo, sunday);
    expect(openStatus.weeklyCardToday).toBe(true);
    expect(openStatus.weeklyDoneThisWeek).toBe(false);

    expect(readHomeProgrammeStatus(makeRepo({ ...ANCHOR, ...withReflection }), monday).weeklyCardToday).toBe(false);
  });

  it('flips the week-30 completion state only when week 30 and its reflection are done', () => {
    // Still pre-completion: derived week 2 at the 30-cap is not "complete".
    const midRepo = makeRepo({ ...ANCHOR });
    expect(readHomeProgrammeStatus(midRepo, new Date('2026-09-20T12:00:00Z')).programmeComplete).toBe(false);

    const complete = makeRepo({
      ...ANCHOR,
      listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z')],
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 30 }),
    });
    expect(readHomeProgrammeStatus(complete, new Date('2026-09-20T12:00:00Z')).programmeComplete).toBe(true);
    // Same week, but no reflection yet → not complete.
    const week30NoReflection = makeRepo({
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 30 }),
    });
    expect(readHomeProgrammeStatus(week30NoReflection, new Date('2026-09-20T12:00:00Z')).programmeComplete).toBe(false);
  });
});

describe('readMorningPracticeQueue', () => {
  it('loads the effective week’s stems (override respected)', () => {
    const weeks: Record<number, { id: string; text: string }[]> = {
      3: [{ id: 'w3-a', text: 'a' }],
      9: [{ id: 'w9-a', text: 'a' }, { id: 'w9-b', text: 'b' }],
    };
    const repo = makeRepo({
      getProgrammeStemsForWeek: (week) => weeks[week] ?? [],
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 9 }),
    });
    expect(readMorningPracticeQueue(repo, new Date('2026-09-16T10:00:00Z'))).toHaveLength(2);
  });
});

describe('reflection inputs', () => {
  it('evening: alternates the meta-stem by completed count and scopes the reread to today', () => {
    const now = new Date('2026-09-16T21:00:00Z');
    const noReflections = makeRepo({ listSessionsForDayMorning: () => ['today-morning-sessions'] });
    expect(readEveningReflectionInputs(noReflections, now).metaStem?.id).toBe('evening-a');

    const afterOne = makeRepo({
      listCompletedEveningReflections: () => [atIso('2026-09-15T21:00:00Z')],
    });
    expect(readEveningReflectionInputs(afterOne, now).metaStem?.id).toBe('evening-b');

    const afterTwo = makeRepo({
      listCompletedEveningReflections: () => [atIso('2026-09-14T21:00:00Z'), atIso('2026-09-15T21:00:00Z')],
    });
    expect(readEveningReflectionInputs(afterTwo, now).metaStem?.id).toBe('evening-a');
  });

  it('evening: with one meta-stem deleted, the survivor serves every parity slot (w1-t4 granted excursion)', () => {
    // After a deletion the rotation holds one survivor (the repository's
    // deleted_at filter removed the other), but the parity index still
    // counts completed reflections modulo 2 (program.ts is frozen). The
    // slot must degrade to the survivor instead of landing past the end of
    // the rotation — otherwise the evening reflection is available only
    // every OTHER evening after a deletion.
    const now = new Date('2026-09-16T21:00:00Z');
    const singleSurvivor = makeRepo({
      listMetaStems: () => [
        { id: 'weekly', text: 'weekly meta', origin: 'seed' },
        { id: 'evening-b', text: 'evening meta B', origin: 'meta' },
      ],
      listCompletedEveningReflections: () => [atIso('2026-09-15T21:00:00Z')], // odd count → index 1
    });
    expect(readEveningReflectionInputs(singleSurvivor, now).metaStem?.id).toBe('evening-b');

    // Both deleted (empty rotation): the honest null — the write screen's
    // empty state — never an out-of-bounds draw.
    const noneLeft = makeRepo({
      listMetaStems: () => [{ id: 'weekly', text: 'weekly meta', origin: 'seed' }],
      listCompletedEveningReflections: () => [atIso('2026-09-15T21:00:00Z')],
    });
    expect(readEveningReflectionInputs(noneLeft, now).metaStem).toBeNull();
  });

  it('weekly: reviews the effective week and hands back the weekly meta-stem', () => {
    const repo = makeRepo({
      ...ANCHOR,
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 5 }),
      listSessionsForProgrammeWeek: (week) => [`week-${week}-sessions`],
    });
    const inputs = readWeeklyReflectionInputs(repo, new Date('2026-09-16T10:00:00Z'));
    expect(inputs.week).toBe(5);
    expect(inputs.reviewed).toEqual(['week-5-sessions']);
    expect(inputs.metaStem?.id).toBe('weekly');
  });
});

// ── Packet-7 w2-t5 / D7: the evening picks — the one new evening composition ──

describe('readEveningReflectionInputs — D7 evening picks (packet-7 w2-t5)', () => {
  it('returns the evening picks: active, non-deleted, evening-tagged, non-meta stems in listAllStems order — the seed starters included (D7/s1-F3 closes structurally)', () => {
    const repo = makeRepo({
      listAllStems: () => [
        // The starter set: seed-origin evening rows (design §8.1) — they become
        // evening pick material, the mirror of isMorningPick's "w2-t5 draws
        // them" note. origin !== 'meta' (not === 'user') is what includes them.
        pick('starter', { origin: 'seed', time_of_day: 'evening' }),
        pick('user-eve', { time_of_day: 'evening' }),
        pick('imported-eve', { origin: 'imported', time_of_day: 'evening' }),
        // Every exclusion class, so the read cannot pass vacuously:
        pick('morning-tagged'), // morning joins the MORNING practice
        pick('untagged', { time_of_day: null }), // untagged joins the morning (design §8.2)
        pick('inactive', { active: 0, time_of_day: 'evening' }), // the resting meta pair's class
        pick('deleted', { deleted_at: '2026-09-10T00:00:00.000Z', time_of_day: 'evening' }),
      ],
    });
    const inputs = readEveningReflectionInputs(repo, new Date('2026-09-16T21:00:00Z'));
    expect(inputs.picks.map((s) => s.id)).toEqual(['starter', 'user-eve', 'imported-eve']);
    // The rest of the flow's inputs are unchanged by the picks leg.
    expect(inputs.metaStem?.id).toBe('evening-a');
    expect(inputs.reviewed).toEqual([]);
  });

  it('keeps listAllStems’ own order — no re-sort (the morning precedent: start and resume walk identical queues)', () => {
    // Recency order as the library read returns it: 'newest' first. The
    // composition must not reorder — the queue the picker walks is the
    // library's order, nothing else.
    const repo = makeRepo({
      listAllStems: () => [
        pick('newest', { time_of_day: 'evening' }),
        pick('middle', { origin: 'seed', time_of_day: 'evening' }),
        pick('oldest', { time_of_day: 'evening' }),
      ],
    });
    expect(readEveningReflectionInputs(repo, new Date('2026-09-16T21:00:00Z')).picks.map((s) => s.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('never draws the reflection meta-stems into the picks (the evening pair is origin=meta; the weekly meta-stem cannot leak — listAllStems excludes is_weekly_meta, pinned at the real-SQL level in repository.review.test.ts)', () => {
    const repo = makeRepo({
      // The real listAllStems never returns the meta rows — they live only
      // in listMetaStems (the weekly meta is is_weekly_meta=1, excluded by
      // the SQL outright). The stub mirrors that contract; the origin guard
      // below is the second layer, so even a meta row that somehow reached
      // the library read could not join a practice draw.
      listAllStems: () => [
        pick('real-pick', { time_of_day: 'evening' }),
        pick('contrived-meta', { origin: 'meta', time_of_day: 'evening' }), // worst case: active + evening
      ],
    });
    expect(readEveningReflectionInputs(repo, new Date('2026-09-16T21:00:00Z')).picks.map((s) => s.id)).toEqual([
      'real-pick',
    ]);
  });
});

describe('shouldClearOverride (§6.2 clearing rule)', () => {
  it('clears only when the completed reflection is the selected week', () => {
    expect(shouldClearOverride(7, 7)).toBe(true);
    expect(shouldClearOverride(null, 7)).toBe(false);
    expect(shouldClearOverride(7, 3)).toBe(false);
    expect(shouldClearOverride(55, 7)).toBe(false); // garbage override never matches
  });
});

describe('applyWeekSetActivation (issue 09: cumulative unlock with regression guard)', () => {
  const makeRepoWithRecording = (overrides: Partial<Repo> = {}) => {
    const activated: number[] = [];
    const repo = makeRepo({
      ...overrides,
      setProgrammeWeekActive: (week: number) => {
        activated.push(week);
      },
    });
    return { activated, repo };
  };

  it('activates weeks 1..override while one is set (cumulative unlock)', () => {
    const { activated, repo } = makeRepoWithRecording({
      ...ANCHOR,
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 12 }),
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([12]); // unlocks weeks 1..12 (§6.2/§7 + issue 09)
  });

  it('on clear (override null) it activates weeks 1..derived, not the last selection', () => {
    // Anchor week Mon 2026-08-31 + two anchored reflection weeks → derived 3.
    const { activated, repo } = makeRepoWithRecording({
      ...ANCHOR,
      listCompletedWeeklyReflections: () => [refl('2026-09-06T21:00:00Z'), refl('2026-09-13T21:00:00Z')],
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([3]); // unlocks weeks 1..3
  });

  it('with no anchor at all it activates weeks 1..1 (the derivation starts at 1)', () => {
    const { activated, repo } = makeRepoWithRecording();
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([1]); // unlocks week 1
  });

  it('refuses the write on an out-of-range frontier (house guard, not a clamp)', () => {
    // A corrupted raw override must not clamp to the cap and unlock the
    // whole corpus — the house pattern is a no-op.
    const { activated, repo } = makeRepoWithRecording({
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 45 }),
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([]);
  });
});

// ── Packet-7 D1: the composition — picks + the gated programme block ──────

/** A library row (the listAllStems shape) for one pick. Picks are user/imported stems. */
function pick(id: string, overrides: Partial<{ origin: string; time_of_day: string | null; active: number; deleted_at: string | null }> = {}) {
  return {
    id,
    text: `pick ${id}`,
    origin: 'user',
    time_of_day: 'morning' as string | null,
    active: 1,
    deleted_at: null,
    created_at: `2026-09-01T00:00:${id}`,
    weekNumber: null,
    ...overrides,
  };
}

function blockStem(id: string) {
  return { id, text: `block ${id}` };
}

describe('readMorningPracticeQueue — D1 composition (picks + gated programme block)', () => {
  it('composes the picks first, then the programme block, while Programme is on', () => {
    const repo = makeRepo({
      ...ANCHOR,
      // listAllStems order (library recency): p2 before p1 — the queue keeps it.
      listAllStems: () => [pick('p2'), pick('p1'), pick('resting', { active: 0 }), pick('evening-tagged', { time_of_day: 'evening' })],
      getProgrammeStemsForWeek: (week) => (week === 1 ? [blockStem('b1'), blockStem('b2')] : []),
    });
    const queue = readMorningPracticeQueue(repo, new Date('2026-09-16T10:00:00Z'));
    expect(queue.map((s) => s.id)).toEqual(['p2', 'p1', 'b1', 'b2']);
  });

  it('with Programme off the queue is the picks alone and the week is never read (D3: zero programme state)', () => {
    const weekReads: number[] = [];
    const repo = makeRepo({
      listAllStems: () => [pick('p1')],
      getProgrammeStemsForWeek: (week) => {
        weekReads.push(week);
        return [blockStem('b1')];
      },
      getSettings: () => ({ ...DEFAULT_SETTINGS, programme: false }),
    });
    const queue = readMorningPracticeQueue(repo, new Date('2026-09-16T10:00:00Z'));
    expect(queue.map((s) => s.id)).toEqual(['p1']); // picks only
    expect(weekReads).toEqual([]); // the derivation is never consulted while off
  });

  it('the pick filter is exact: only active, non-deleted, user/imported, non-evening stems join (cannot pass vacuously)', () => {
    const repo = makeRepo({
      listAllStems: () => [
        pick('qualifies'), // the one that must join
        pick('inactive', { active: 0 }),
        pick('deleted', { deleted_at: '2026-09-10T00:00:00.000Z' }),
        pick('evening', { time_of_day: 'evening' }),
        pick('seeded', { origin: 'seed' }), // seed starters are evening content, never picks
        pick('imported', { origin: 'imported' }), // imported picks DO join
        pick('untagged', { time_of_day: null }), // untagged joins the morning (design §8.2)
      ],
      getSettings: () => ({ ...DEFAULT_SETTINGS, programme: false }),
    });
    expect(readMorningPracticeQueue(repo, new Date('2026-09-16T10:00:00Z')).map((s) => s.id)).toEqual([
      'qualifies',
      'imported',
      'untagged',
    ]);
  });

  it('Programme on with an emptied block still queues the picks (the honest empty state stays reachable when both are gone)', () => {
    const repo = makeRepo({
      getProgrammeStemsForWeek: () => [],
      getSettings: () => ({ ...DEFAULT_SETTINGS, programme: false }),
    });
    expect(readMorningPracticeQueue(repo, new Date('2026-09-16T10:00:00Z'))).toEqual([]);
  });
});

// ── Packet-7 D3: the counting rule — derivation counts enabled-period reflections ──

describe('D3 counting rule — programme_on filters the week derivation (both sides)', () => {
  it('an off-period reflection does not advance the derived week; the same reflection with the flag on does', () => {
    const base = {
      ...ANCHOR,
      // One reflection in a distinct later week (anchor week Mon 2026-08-31, reflection Mon 2026-09-07 week).
      listCompletedWeeklyReflections: () => [refl('2026-09-08T21:00:00Z', 0)],
    };
    expect(readProgrammeWeek(makeRepo(base), new Date('2026-09-16T12:00:00Z')).derivedWeek).toBe(1);

    const on = { ...base, listCompletedWeeklyReflections: () => [refl('2026-09-08T21:00:00Z', 1)] };
    expect(readProgrammeWeek(makeRepo(on), new Date('2026-09-16T12:00:00Z')).derivedWeek).toBe(2);
  });

  it('off-period reflections freeze the nudge while enabled-period ones keep it', () => {
    const now = new Date('2026-09-20T12:00:00Z'); // Sunday, anchor week +2
    const off = makeRepo({ ...ANCHOR, listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z', 0)] });
    expect(readHomeProgrammeStatus(off, now).nudge).toBeNull();
    const on = makeRepo({ ...ANCHOR, listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z', 1)] });
    expect(readHomeProgrammeStatus(on, now).nudge).toEqual({ completedWeek: 1, nextWeek: 2 });
  });

  it('completion states keep counting off-period reflections (recording continues; only ADVANCEMENT is excluded)', () => {
    const now = new Date('2026-09-20T12:00:00Z'); // Sunday midday — the weekend card's day
    const off = makeRepo({ ...ANCHOR, listCompletedWeeklyReflections: () => [refl('2026-09-20T12:00:00Z', 0)] });
    const status = readHomeProgrammeStatus(off, now);
    expect(status.weeklyDoneThisWeek).toBe(true); // the reflection happened — the card may say done
    expect(status.week.derivedWeek).toBe(1); // …but it does not advance the week
  });

  it('applyWeekSetActivation is a total no-op while Programme is off (zero state changes, even with an override set)', () => {
    const activated: number[] = [];
    const repo = makeRepo({
      ...ANCHOR,
      getSettings: () => ({ ...DEFAULT_SETTINGS, programme: false, program_week_override: 7 }),
      setProgrammeWeekActive: (week: number) => {
        activated.push(week);
      },
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([]); // not even the provenance-untouched part of the write runs
  });

  it('applyWeekSetActivation still runs while Programme is on (the off gate is the setting, not a permanent off)', () => {
    const activated: number[] = [];
    const repo = makeRepo({
      ...ANCHOR,
      getSettings: () => ({ ...DEFAULT_SETTINGS, programme: true }),
      setProgrammeWeekActive: (week: number) => {
        activated.push(week);
      },
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([1]);
  });
});

// ── Packet-7 D4: re-enable — the pin is the override, the derived week is the fallback ──

describe('D4 re-enable — the override pin and the derived fallback (enabled-period reflections only)', () => {
  it('a re-enable pin (override 1) wins over a higher derived week; clearing it resumes the derived week', () => {
    const anchorAndWeeks = {
      ...ANCHOR,
      // Two enabled reflection weeks → derived 3. An off-period one must not add a fourth.
      listCompletedWeeklyReflections: () => [
        refl('2026-09-06T21:00:00Z', 1),
        refl('2026-09-13T21:00:00Z', 1),
        refl('2026-09-20T21:00:00Z', 0),
      ],
      getProgrammeStemsForWeek: (week: number) => [blockStem(`w${week}`)],
    };

    // The pin: week 1 while the override says so.
    const pinned = makeRepo({ ...anchorAndWeeks, getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 1 }) });
    expect(readMorningPracticeQueue(pinned, new Date('2026-09-21T10:00:00Z')).map((s) => s.id)).toEqual(['w1']);

    // The fallback: cleared, the derived week resumes — counting enabled-period weeks only.
    const cleared = makeRepo({ ...anchorAndWeeks, getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: null }) });
    const week = readProgrammeWeek(cleared, new Date('2026-09-21T10:00:00Z'));
    expect(week.derivedWeek).toBe(3);
    expect(readMorningPracticeQueue(cleared, new Date('2026-09-21T10:00:00Z')).map((s) => s.id)).toEqual(['w3']);
  });

  it('the pin is idempotent: re-stating override 1 and re-running the funnel changes nothing', () => {
    const activated: number[] = [];
    const repo = makeRepo({
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 1 }),
      setProgrammeWeekActive: (week: number) => {
        activated.push(week);
      },
    });
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    applyWeekSetActivation(repo, new Date('2026-09-16T10:00:00Z'));
    expect(activated).toEqual([1, 1]); // the same frontier, the same activation — a no-op state change
  });
});
