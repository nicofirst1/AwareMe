/**
 * Unit tests for the DB-facing programme compositions (`programRead.ts`)
 * over a stub repository — no database, no clock; every `now` is
 * injected. The SQL reads themselves are exercised against real SQLite in
 * `programRepository.test.ts`.
 */
import {
  readEveningReflectionInputs,
  readHomeProgrammeStatus,
  readMorningSittingQueue,
  readProgrammeWeek,
  readWeeklyReflectionInputs,
  shouldClearOverride,
} from '@/session/programRead';
import { DEFAULT_SETTINGS, type Repository, type Settings } from '@/db';

type Repo = {
  getFirstProgrammeSitting: () => { startedAt: string; offsetMin: number } | null;
  listCompletedWeeklyReflections: () => { startedAt: string; offsetMin: number }[];
  listCompletedEveningReflections: () => { startedAt: string; offsetMin: number }[];
  getProgrammeStemsForWeek: (week: number) => { id: string; text: string }[];
  listMetaStems: () => { id: string; text: string; origin: string }[];
  getWeeklyMetaStem: () => { id: string; text: string } | null;
  listSessionsForDayMorning: (start: string, end: string) => unknown[];
  listSessionsForProgrammeWeek: (week: number) => unknown[];
  countProgrammeStemsCompletedInRange: (week: number, start: string, end: string) => number;
  getSettings: () => Settings;
};

function makeRepo(overrides: Partial<Repo> = {}): Repository {
  return {
    getFirstProgrammeSitting: () => null,
    listCompletedWeeklyReflections: () => [],
    listCompletedEveningReflections: () => [],
    getProgrammeStemsForWeek: () => [],
    listMetaStems: () => [
      { id: 'weekly', text: 'weekly meta', origin: 'seed' },
      { id: 'evening-a', text: 'evening meta A', origin: 'meta' },
      { id: 'evening-b', text: 'evening meta B', origin: 'meta' },
    ],
    getWeeklyMetaStem: () => ({ id: 'weekly', text: 'weekly meta', origin: 'seed' }),
    listSessionsForDayMorning: () => [],
    listSessionsForProgrammeWeek: () => [],
    countProgrammeStemsCompletedInRange: () => 0,
    getSettings: () => DEFAULT_SETTINGS,
    ...overrides,
  } as unknown as Repository;
}

/** The repo's reflection rows are (startedAt, offsetMin) event triples; these helpers write Berlin-summer (UTC+2) locals. */
function atIso(localWallIso: string, offsetMin = 120): { startedAt: string; offsetMin: number } {
  return { startedAt: new Date(Date.parse(localWallIso) - offsetMin * 60_000).toISOString(), offsetMin };
}

/** First programme sitting Tue 2026-09-01 morning (Berlin) → anchor week Monday 2026-08-31. */
const ANCHOR = { getFirstProgrammeSitting: () => atIso('2026-09-01T06:00:00Z') };

describe('readProgrammeWeek', () => {
  it('derives week 1 with no anchor, even with pre-programme reflections', () => {
    const repo = makeRepo({ listCompletedWeeklyReflections: () => [atIso('2026-01-04T21:00:00Z')] });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week).toMatchObject({ derivedWeek: 1, override: null, currentWeek: 1 });
  });

  it('counts anchored reflection weeks from the first programme sitting onward', () => {
    const repo = makeRepo({
      // First programme sitting in the week of Mon 2026-08-31 (UTC+2 wall: Tue 2026-09-01).
      getFirstProgrammeSitting: () => atIso('2026-09-01T06:00:00Z'),
      // Two reflections in distinct later weeks + one same-week duplicate + one pre-anchor.
      listCompletedWeeklyReflections: () => [
        atIso('2026-01-11T21:00:00Z'), // pre-anchor: never counts
        atIso('2026-09-06T21:00:00Z'), // anchor week (Sun)
        atIso('2026-09-08T21:00:00Z'), // same Mon–Sun week as above: counts once
        atIso('2026-09-13T21:00:00Z'), // next week
      ],
    });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week.derivedWeek).toBe(3); // 1 + {anchor week, next week}
  });

  it('applies the override on top of the derived week', () => {
    const repo = makeRepo({
      getFirstProgrammeSitting: () => atIso('2026-09-01T06:00:00Z'),
      listCompletedWeeklyReflections: () => [atIso('2026-09-06T21:00:00Z')],
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 7 }),
    });
    const week = readProgrammeWeek(repo, new Date('2026-09-16T12:00:00Z'));
    expect(week.derivedWeek).toBe(2);
    expect(week.currentWeek).toBe(7);
  });
});

describe('readHomeProgrammeStatus', () => {

  it('reports the sitting state, evening gate, and weekly card for a plain day', () => {
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

  it('marks the morning sitting done once every week stem completed today', () => {
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
      listCompletedWeeklyReflections: () => [atIso('2026-09-09T12:00:00Z'), atIso('2026-09-20T12:00:00Z')],
    });
    const status = readHomeProgrammeStatus(repo, new Date('2026-09-20T12:00:00Z'));
    expect(status.nudge).toEqual({ completedWeek: 2, nextWeek: 3 });

    // A second reflection in the SAME week changes nothing: the standing
    // message stays exactly as truthful as after the first one (a calendar
    // week counts once, §6.2).
    const twice = makeRepo({
      ...ANCHOR,
      listCompletedWeeklyReflections: () => [atIso('2026-09-20T12:00:00Z'), atIso('2026-09-19T12:00:00Z')],
    });
    expect(readHomeProgrammeStatus(twice, new Date('2026-09-20T12:00:00Z')).nudge).toEqual({
      completedWeek: 1,
      nextWeek: 2,
    });
  });

  it('never nudges before the programme started', () => {
    const repo = makeRepo({ listCompletedWeeklyReflections: () => [atIso('2026-09-20T12:00:00Z')] });
    expect(readHomeProgrammeStatus(repo, new Date('2026-09-20T12:00:00Z')).nudge).toBeNull();
  });

  it('gates the weekend card on weekly_meta_day and reports the done state', () => {
    const withReflection = { listCompletedWeeklyReflections: () => [atIso('2026-09-20T12:00:00Z')] };
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
      listCompletedWeeklyReflections: () => [atIso('2026-09-20T12:00:00Z')],
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

describe('readMorningSittingQueue', () => {
  it('loads the effective week’s stems (override respected)', () => {
    const weeks: Record<number, { id: string; text: string }[]> = {
      3: [{ id: 'w3-a', text: 'a' }],
      9: [{ id: 'w9-a', text: 'a' }, { id: 'w9-b', text: 'b' }],
    };
    const repo = makeRepo({
      getProgrammeStemsForWeek: (week) => weeks[week] ?? [],
      getSettings: () => ({ ...DEFAULT_SETTINGS, program_week_override: 9 }),
    });
    expect(readMorningSittingQueue(repo, new Date('2026-09-16T10:00:00Z'))).toHaveLength(2);
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

describe('shouldClearOverride (§6.2 clearing rule)', () => {
  it('clears only when the completed reflection is the selected week', () => {
    expect(shouldClearOverride(7, 7)).toBe(true);
    expect(shouldClearOverride(null, 7)).toBe(false);
    expect(shouldClearOverride(7, 3)).toBe(false);
    expect(shouldClearOverride(55, 7)).toBe(false); // garbage override never matches
  });
});
