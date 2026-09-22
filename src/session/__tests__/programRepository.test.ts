/**
 * The c02 repository read additions (issue 02-program-engine) exercised
 * against real SQLite — same pattern as `migrate.test.ts` (node:sqlite via
 * `nodeSqliteExecutor`, no device). Covers the reads' SQL semantics
 * (completeness, soft-delete, scope filters) and the whole §6.2 derivation
 * over real seeded rows, including the year-wraparound week bucketing.
 *
 * Lives in `src/session/__tests__/` because the reads are c02's
 * pre-approved excursion into `src/db/repository.ts`; no `src/db/__tests__`
 * file (c01's ownership) is touched.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../db/migrate';
import { nodeSqliteExecutor } from '../../db/testSupport/nodeSqliteExecutor';
import { Repository } from '../../db/repository';
import { PROGRAMME_SEED_STEMS, WEEKLY_META_STEM } from '../../db/seed/stems';
import { PROGRAMME_WEEK_CAP } from '../program';
import { readProgrammeWeek } from '../programRead';

let nextRowId = 0;
function rowId(prefix: string): string {
  return `${prefix}-${(++nextRowId).toString().padStart(4, '0')}`;
}

interface SessionInsert {
  stemId: string;
  origin?: string;
  startedAt: string; // UTC ISO
  offsetMin?: number;
  endedAt?: string | null;
  endReason?: string | null;
  deletedAt?: string | null;
}

function makeDb(): { raw: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const db = nodeSqliteExecutor(raw);
  migrate(db, '1.1.0', () => '2026-09-16T00:00:00.000Z');
  const repo = new Repository(db);
  repo.seedIfEmpty();
  return { raw, repo };
}

function insertStem(
  raw: DatabaseSync,
  input: { text: string; origin?: string; timeOfDay?: string | null; weekNumber?: number | null; isWeeklyMeta?: number; active?: number },
): string {
  const id = rowId('stem');
  raw
    .prepare(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES (?, ?, ?, NULL, 'en', 1.0, ?, ?, 'Europe/Berlin', 120, ?, ?, ?)`,
    )
    .run(
      id,
      input.text,
      input.origin ?? 'seed',
      input.active ?? 1,
      '2026-09-01T06:00:00.000Z',
      input.timeOfDay ?? null,
      input.weekNumber ?? null,
      input.isWeeklyMeta ?? 0,
    );
  return id;
}

function insertSession(raw: DatabaseSync, input: SessionInsert): string {
  const id = rowId('session');
  raw
    .prepare(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode,
         started_at, ended_at, end_reason, tz, offset_min, device_locale, deleted_at)
       VALUES (?, ?, ?, ?, 6, 90, 1, ?, ?, ?, 'Europe/Berlin', ?, 'en-DE', ?)`,
    )
    .run(
      id,
      input.stemId,
      'snapshot',
      input.origin ?? 'manual',
      input.startedAt,
      input.endedAt ?? null,
      input.endReason ?? null,
      input.offsetMin ?? 120,
      input.deletedAt ?? null,
    );
  return id;
}

function insertEnding(raw: DatabaseSync, sessionId: string, ordinal: number, startedAt: string, text = 'something true'): void {
  raw
    .prepare(
      `INSERT INTO endings (id, session_id, ordinal, text, started_at, submitted_at, backspace_count)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(rowId('ending'), sessionId, ordinal, text, startedAt, startedAt);
}

/** A completed session with one ending, the usual shape of every "wrote this" fixture. */
function insertCompletedSession(raw: DatabaseSync, stemId: string, startedAt: string, origin = 'manual'): string {
  const id = insertSession(raw, { stemId, origin, startedAt, endedAt: startedAt, endReason: 'user_done' });
  insertEnding(raw, id, 1, startedAt);
  return id;
}

function weeklyMetaStemId(repo: Repository): string {
  const stem = repo.getWeeklyMetaStem();
  if (!stem) throw new Error('seed must include the weekly meta-stem');
  return stem.id;
}

describe('programme repository reads', () => {
  it('seed provides the week-1 block in seed order and the weekly meta-stem', () => {
    const { repo } = makeDb();
    // Issue 10: expectations derive from the loaded content module, so the
    // pin holds under owner and example content alike.
    const corpusWeek1 = PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === 1);
    const week1 = repo.getProgrammeStemsForWeek(1);
    expect(week1.length).toBe(corpusWeek1.length);
    expect(week1.map((s) => s.text)).toEqual(corpusWeek1.map((s) => s.text));
    expect(week1[0].origin).toBe('seed');
    expect(repo.getProgrammeStemsForWeek(31)).toEqual([]);
    expect(repo.getProgrammeStemsForWeek(0)).toEqual([]);
    expect(repo.getWeeklyMetaStem()?.text).toBe(WEEKLY_META_STEM);
  });

  it('listProgrammeStems returns every non-deleted programme stem ordered by week then seed order (resting included since issue 04)', () => {
    const { repo } = makeDb();
    const all = repo.listProgrammeStems();
    // Issue 10: week bounds derive from the loaded corpus (owner: 1–30).
    const corpusWeeks = [...new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber))].sort((a, b) => a - b);
    expect(all.length).toBe(PROGRAMME_SEED_STEMS.length);
    expect(all[0].weekNumber).toBe(corpusWeeks[0]);
    expect(all[all.length - 1].weekNumber).toBe(corpusWeeks[corpusWeeks.length - 1]);
    // Monotone non-decreasing weeks.
    for (let i = 1; i < all.length; i++) {
      expect(all[i].weekNumber).toBeGreaterThanOrEqual(all[i - 1].weekNumber);
    }
  });

  it('getFirstProgrammeSitting anchors on the earliest programme-stem session, ignoring earlier non-programme writes', () => {
    const { raw, repo } = makeDb();
    expect(repo.getFirstProgrammeSitting()).toBeNull();

    const userStem = insertStem(raw, { text: 'my own stem', origin: 'user', timeOfDay: null });
    // Find any week that has stems in the corpus (issue 10: derive from loaded content).
    const weeksWithStems = [...new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber))].sort((a, b) => a - b);
    const scenarioWeek = weeksWithStems[0]; // use first week that has stems
    expect(scenarioWeek).toBeDefined();
    const programmeStems = repo.getProgrammeStemsForWeek(scenarioWeek);
    expect(programmeStems.length).toBeGreaterThan(0);
    const programmeStem = programmeStems[0];
    insertCompletedSession(raw, userStem, '2026-08-15T10:00:00.000Z'); // earlier, but not a programme sitting
    insertCompletedSession(raw, programmeStem.id, '2026-09-01T06:00:00.000Z');

    const anchor = repo.getFirstProgrammeSitting();
    expect(anchor).toEqual({ startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 });
  });

  it('getFirstProgrammeSitting ignores soft-deleted sessions', () => {
    const { raw, repo } = makeDb();
    const programmeStem = repo.getProgrammeStemsForWeek(1)[0];
    insertSession(raw, {
      stemId: programmeStem.id,
      startedAt: '2026-09-01T06:00:00.000Z',
      endedAt: '2026-09-01T06:10:00.000Z',
      deletedAt: '2026-09-02T00:00:00.000Z',
    });
    expect(repo.getFirstProgrammeSitting()).toBeNull();
  });

  it('listCompletedWeeklyReflections sees only ended review sessions on the weekly meta-stem', () => {
    const { raw, repo } = makeDb();
    const weekly = weeklyMetaStemId(repo);
    const morning = repo.getProgrammeStemsForWeek(1)[0];

    insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-06T12:00:00.000Z' }); // still open
    insertSession(raw, { stemId: weekly, origin: 'manual', startedAt: '2026-09-06T13:00:00.000Z', endedAt: '2026-09-06T13:05:00.000Z' }); // wrong origin
    insertSession(raw, { stemId: morning.id, origin: 'review', startedAt: '2026-09-06T14:00:00.000Z', endedAt: '2026-09-06T14:05:00.000Z' }); // wrong stem
    const kept = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-06T15:00:00.000Z', endedAt: '2026-09-06T15:03:00.000Z' });
    insertEnding(raw, kept, 1, '2026-09-06T15:01:00.000Z');

    const reflections = repo.listCompletedWeeklyReflections();
    expect(reflections).toHaveLength(1);
    expect(reflections[0]).toEqual({ startedAt: '2026-09-06T15:00:00.000Z', offsetMin: 120 });
  });

  it('listCompletedEveningReflections sees ended review sessions on the two evening meta-stems only', () => {
    const { raw, repo } = makeDb();
    const weekly = weeklyMetaStemId(repo);
    const eveningA = insertStem(raw, { text: 'evening A', origin: 'meta', active: 0 });
    const morning = repo.getProgrammeStemsForWeek(1)[0];

    const kept = insertSession(raw, { stemId: eveningA, origin: 'review', startedAt: '2026-09-15T19:00:00.000Z', endedAt: '2026-09-15T19:02:00.000Z' });
    insertEnding(raw, kept, 1, '2026-09-15T19:01:00.000Z');
    insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-15T20:00:00.000Z', endedAt: '2026-09-15T20:02:00.000Z' }); // weekly, not evening
    insertSession(raw, { stemId: morning.id, origin: 'review', startedAt: '2026-09-15T21:00:00.000Z', endedAt: '2026-09-15T21:02:00.000Z' }); // not a meta-stem

    expect(repo.listCompletedEveningReflections()).toHaveLength(1);
  });

  it('listSessionsForProgrammeWeek scopes to the week’s stems, needs a non-deleted ending, orders chronologically', () => {
    const { raw, repo } = makeDb();
    // Issue 10: first week is corpus-derived; second week may not exist in example content.
    const corpusWeeks = [...new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber))].sort((a, b) => a - b);
    const firstWeek = corpusWeeks[0];
    const w1a = repo.getProgrammeStemsForWeek(firstWeek)[0];
    const w1b = repo.getProgrammeStemsForWeek(firstWeek)[1];
    // Cross-week scoping needs a second stemmed week; both shipped corpora
    // have one. If a future corpus drops to a single week, fire loudly here
    // instead of the scoping check silently evaporating.
    expect(corpusWeeks.length).toBeGreaterThan(1);
    // Issue 09: the seed leaves every week after the first resting, and the
    // rotation read returns active stems only — raise the unlock frontier to
    // the cap so the second week's stem is readable. The scoping under test
    // is the week filter, not the activation state.
    repo.setProgrammeWeekActive(PROGRAMME_WEEK_CAP);
    const w2 = repo.getProgrammeStemsForWeek(corpusWeeks[1])[0];

    const later = insertCompletedSession(raw, w1b.id, '2026-09-03T08:00:00.000Z');
    const earlier = insertCompletedSession(raw, w1a.id, '2026-09-01T08:00:00.000Z');
    insertCompletedSession(raw, w2.id, '2026-09-02T08:00:00.000Z'); // other week
    const endingless = insertSession(raw, { stemId: w1a.id, startedAt: '2026-09-04T08:00:00.000Z', endedAt: '2026-09-04T08:01:00.000Z' });
    insertEnding(raw, endingless, 0, '2026-09-04T08:00:30.000Z', '');
    raw.prepare('UPDATE endings SET deleted_at = ? WHERE session_id = ?').run('2026-09-04T09:00:00.000Z', endingless); // only ending soft-deleted
    const deleted = insertCompletedSession(raw, w1a.id, '2026-09-05T08:00:00.000Z');
    raw.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run('2026-09-06T00:00:00.000Z', deleted);

    const sessions = repo.listSessionsForProgrammeWeek(firstWeek);
    expect(sessions.map((r) => r.session.id)).toEqual([earlier, later]);
    expect(sessions[0].endings).toHaveLength(1);
  });

  it('listSessionsForDayMorning scopes to morning stems inside [dayStart, dayEnd)', () => {
    const { raw, repo } = makeDb();
    const morning = repo.getProgrammeStemsForWeek(1)[0];
    const eveningStem = insertStem(raw, { text: 'an evening user stem', origin: 'user', timeOfDay: 'evening' });

    const inWindow = insertCompletedSession(raw, morning.id, '2026-09-16T06:00:00.000Z');
    insertCompletedSession(raw, morning.id, '2026-09-15T06:00:00.000Z'); // yesterday
    insertCompletedSession(raw, eveningStem, '2026-09-16T09:00:00.000Z'); // not a morning stem
    const boundary = insertSession(raw, { stemId: morning.id, startedAt: '2026-09-16T05:00:00.000Z', endedAt: '2026-09-16T05:01:00.000Z' });
    insertEnding(raw, boundary, 1, '2026-09-16T05:00:00.000Z'); // exactly at dayStart: inclusive

    const sessions = repo.listSessionsForDayMorning('2026-09-16T00:00:00.000Z', '2026-09-17T00:00:00.000Z');
    // Both morning sessions of the day (the 05:00 one starts at dayStart; the 06:00 one) — ordering by started_at.
    expect(sessions.map((r) => r.session.id)).toEqual([boundary, inWindow]);
  });

  it('countProgrammeStemsCompletedInRange counts distinct completed stems only', () => {
    const { raw, repo } = makeDb();
    const [a, b] = repo.getProgrammeStemsForWeek(1);
    insertCompletedSession(raw, a.id, '2026-09-16T06:00:00.000Z');
    insertCompletedSession(raw, a.id, '2026-09-16T07:00:00.000Z'); // same stem again
    insertSession(raw, { stemId: b.id, startedAt: '2026-09-16T08:00:00.000Z' }); // still open

    expect(repo.countProgrammeStemsCompletedInRange(1, '2026-09-16T00:00:00.000Z', '2026-09-17T00:00:00.000Z')).toBe(1);
    expect(repo.countProgrammeStemsCompletedInRange(1, '2026-09-17T00:00:00.000Z', '2026-09-18T00:00:00.000Z')).toBe(0);
  });
});

describe('§6.2 derivation over real rows (readProgrammeWeek)', () => {
  it('advances one week per distinct reflection calendar week, self-paced, anchored', () => {
    const { raw, repo } = makeDb();
    const weekly = weeklyMetaStemId(repo);
    const week1Stem = repo.getProgrammeStemsForWeek(1)[0];

    // Anchor: first programme sitting Tue 2026-09-01 (Berlin morning).
    insertCompletedSession(raw, week1Stem.id, '2026-09-01T06:00:00.000Z');
    const now = new Date('2026-09-16T10:00:00.000Z');
    expect(readProgrammeWeek(repo, now).currentWeek).toBe(1); // no reflections yet

    // One reflection in the anchor week (Sun 2026-09-06) → week 2. (t10:
    // reflections carry a non-empty ending — a zero-content reflection no
    // longer completes; owner decision 2026-09-22.)
    const firstReflection = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-06T12:00:00.000Z', endedAt: '2026-09-06T12:03:00.000Z' });
    insertEnding(raw, firstReflection, 1, '2026-09-06T12:01:00.000Z');
    expect(readProgrammeWeek(repo, now).currentWeek).toBe(2);

    // Two more reflections inside the SAME calendar week (Sep 14–20) count once → week 3, not 4.
    const secondReflection = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-14T12:00:00.000Z', endedAt: '2026-09-14T12:03:00.000Z' });
    insertEnding(raw, secondReflection, 1, '2026-09-14T12:01:00.000Z');
    const thirdReflection = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-16T12:00:00.000Z', endedAt: '2026-09-16T12:03:00.000Z' });
    insertEnding(raw, thirdReflection, 1, '2026-09-16T12:01:00.000Z');
    expect(readProgrammeWeek(repo, now).currentWeek).toBe(3);
  });

  it('buckets weeks by the event wall clock across the year boundary', () => {
    const { raw, repo } = makeDb();
    const weekly = weeklyMetaStemId(repo);
    const week1Stem = repo.getProgrammeStemsForWeek(1)[0];

    // Anchor week: Mon 2025-12-29 .. Sun 2026-01-04 (spans the year boundary).
    insertCompletedSession(raw, week1Stem.id, '2025-12-29T06:00:00.000Z');
    const now = new Date('2026-01-20T10:00:00.000Z');

    // Reflections on Sun 2026-01-04 (wall) and Mon 2026-01-05 (wall) — two DISTINCT Mon–Sun weeks.
    // (t10: non-empty endings — a zero-content reflection no longer completes.)
    const firstReflection = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-01-04T12:00:00.000Z', endedAt: '2026-01-04T12:03:00.000Z' });
    insertEnding(raw, firstReflection, 1, '2026-01-04T12:01:00.000Z');
    const secondReflection = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-01-05T12:00:00.000Z', endedAt: '2026-01-05T12:03:00.000Z' });
    insertEnding(raw, secondReflection, 1, '2026-01-05T12:01:00.000Z');
    expect(readProgrammeWeek(repo, now).currentWeek).toBe(3);
  });

  it('respects a negative-offset event frame (UTC−5) when bucketing', () => {
    const { raw, repo } = makeDb();
    const weekly = weeklyMetaStemId(repo);
    const week1Stem = repo.getProgrammeStemsForWeek(1)[0];

    insertCompletedSession(raw, week1Stem.id, '2026-09-07T12:00:00.000Z', 'manual'); // Mon 2026-09-07 anchor week
    const now = new Date('2026-10-01T10:00:00.000Z');

    // Sun 2026-09-13 23:30 UTC−5 = Mon 2026-09-14 04:30 UTC — wall date is still Sunday the 13th → anchor week +0? No:
    // anchor week is Sep 7–13, so this lands in the anchor week → week 2.
    const id = insertSession(raw, { stemId: weekly, origin: 'review', startedAt: '2026-09-14T04:30:00.000Z', offsetMin: -300, endedAt: '2026-09-14T04:33:00.000Z' });
    insertEnding(raw, id, 1, '2026-09-14T04:31:00.000Z');
    expect(readProgrammeWeek(repo, now).currentWeek).toBe(2);
  });
});
