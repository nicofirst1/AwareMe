/**
 * t10 (packet 3, owner decision 2026-09-22): a session with zero non-empty
 * endings is still SAVED (§6.3.8 "nothing is discarded, ever"; §6.3.9 early
 * Done unchanged) but NEVER counts as complete — not in the history listing
 * and the home "N sessions this week" counter it feeds, not in the §6.2
 * week derivation (a zero-content weekly reflection must not advance the
 * programme week), not in the evening-done/alternation feed, not in the
 * morning-completion count, and not in the badge/streak feed.
 *
 * Read-time filter only: every assertion here runs against real SQLite with
 * the rows physically present (nothing discarded), so a schema change or a
 * stored flag would not help these tests — only the read predicate does.
 * Same node:sqlite pattern as `repository.weekActivation.test.ts` /
 * `programRepository.test.ts`.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { readProgrammeWeek } from '../../session/programRead';

let nextRowId = 0;
function rowId(prefix: string): string {
  return `${prefix}-${(++nextRowId).toString().padStart(4, '0')}`;
}

function makeDb(): { raw: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const db = nodeSqliteExecutor(raw);
  migrate(db, '1.0.0');
  const repo = new Repository(db);
  repo.seedIfEmpty();
  return { raw, repo };
}

function insertStem(raw: DatabaseSync, text: string, origin = 'user'): string {
  const id = rowId('stem');
  raw
    .prepare(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day)
       VALUES (?, ?, ?, NULL, 'en', 1.0, 1, '2026-09-01T06:00:00.000Z', 'Europe/Berlin', 120, NULL)`,
    )
    .run(id, text, origin);
  return id;
}

interface SessionInsert {
  stemId: string;
  origin?: string;
  startedAt: string; // UTC ISO
  endedAt?: string | null;
  endReason?: string | null;
  deletedAt?: string | null;
}

function insertSession(raw: DatabaseSync, input: SessionInsert): string {
  const id = rowId('session');
  raw
    .prepare(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode,
         started_at, ended_at, end_reason, tz, offset_min, device_locale, deleted_at)
       VALUES (?, ?, 'snapshot', ?, 6, 90, 1, ?, ?, ?, 'Europe/Berlin', 120, 'en-DE', ?)`,
    )
    .run(id, input.stemId, input.origin ?? 'manual', input.startedAt, input.endedAt ?? null, input.endReason ?? null, input.deletedAt ?? null);
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

/** A finished session with zero non-empty endings — the §6.3.8/§6.3.9 zero-content shape. */
function insertZeroEndingSession(raw: DatabaseSync, stemId: string, startedAt: string, origin = 'manual'): string {
  return insertSession(raw, { stemId, origin, startedAt, endedAt: startedAt, endReason: 'timeout' });
}

/** The usual "wrote this" fixture: a finished session with one non-empty ending. */
function insertCompletedSession(raw: DatabaseSync, stemId: string, startedAt: string, origin = 'manual'): string {
  const id = insertSession(raw, { stemId, origin, startedAt, endedAt: startedAt, endReason: 'user_done' });
  insertEnding(raw, id, 1, startedAt);
  return id;
}

describe('t10: zero-ending sessions never count as complete (owner decision 2026-09-22)', () => {
  describe('listSessionsForHistory (history listing + the home sessions-this-week / review-available feed)', () => {
    it('excludes a finished session with no ending rows at all (Done before the first keypress)', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      insertZeroEndingSession(raw, stemId, '2026-09-10T08:00:00.000Z');

      expect(repo.listSessionsForHistory()).toHaveLength(0);
    });

    it('excludes a finished session whose only ending row is empty text (first keypress, timer expiry)', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      const id = insertZeroEndingSession(raw, stemId, '2026-09-10T08:00:00.000Z');
      insertEnding(raw, id, 1, '2026-09-10T08:00:30.000Z', '');

      expect(repo.listSessionsForHistory()).toHaveLength(0);
    });

    it('excludes a finished session whose only ending is whitespace-only text', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      const id = insertZeroEndingSession(raw, stemId, '2026-09-10T08:00:00.000Z');
      insertEnding(raw, id, 1, '2026-09-10T08:00:30.000Z', '   ');

      expect(repo.listSessionsForHistory()).toHaveLength(0);
    });

    it('excludes a session whose only ending was soft-deleted', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      const id = insertCompletedSession(raw, stemId, '2026-09-10T08:00:00.000Z');
      raw.prepare('UPDATE endings SET deleted_at = ? WHERE session_id = ?').run('2026-09-11T00:00:00.000Z', id);

      expect(repo.listSessionsForHistory()).toHaveLength(0);
    });

    it('still lists a session with at least one non-empty ending (guard), alongside a zero-ending one', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      const zero = insertZeroEndingSession(raw, stemId, '2026-09-01T08:00:00.000Z');
      const kept = insertCompletedSession(raw, stemId, '2026-09-05T08:00:00.000Z');
      insertEnding(raw, kept, 2, '2026-09-05T08:01:00.000Z', ''); // a second, empty field does not disqualify

      const rows = repo.listSessionsForHistory();
      expect(rows.map((r) => r.id)).toEqual([kept]);
      expect(rows.map((r) => r.id)).not.toContain(zero);
    });
  });

  describe('week derivation (§6.2 — listCompletedWeeklyReflections + readProgrammeWeek)', () => {
    it('excludes a zero-ending weekly reflection from the completed set', () => {
      const { raw, repo } = makeDb();
      const weekly = repo.getWeeklyMetaStem();
      if (!weekly) throw new Error('seed must include the weekly meta-stem');
      insertZeroEndingSession(raw, weekly.id, '2026-09-07T12:00:00.000Z', 'review');

      expect(repo.listCompletedWeeklyReflections()).toHaveLength(0);
    });

    it('includes a weekly reflection with a non-empty ending (guard)', () => {
      const { raw, repo } = makeDb();
      const weekly = repo.getWeeklyMetaStem();
      if (!weekly) throw new Error('seed must include the weekly meta-stem');
      insertCompletedSession(raw, weekly.id, '2026-09-07T12:00:00.000Z', 'review');

      expect(repo.listCompletedWeeklyReflections()).toHaveLength(1);
    });

    it('a zero-ending weekly reflection does not advance the derived programme week; one with content does (guard)', () => {
      const { raw, repo } = makeDb();
      const weekly = repo.getWeeklyMetaStem();
      if (!weekly) throw new Error('seed must include the weekly meta-stem');
      const week1Stem = repo.getProgrammeStemsForWeek(1)[0];
      // Anchor: a real first programme sitting with content.
      insertCompletedSession(raw, week1Stem.id, '2026-09-01T06:00:00.000Z');
      const now = new Date('2026-09-16T10:00:00.000Z');

      // Zero-content reflection (§6.3.9 Done on the meta-stem with nothing typed): saved, never complete.
      insertZeroEndingSession(raw, weekly.id, '2026-09-07T12:00:00.000Z', 'review');
      expect(readProgrammeWeek(repo, now).currentWeek).toBe(1);

      // A reflection with content in the same calendar week advances (guard).
      insertCompletedSession(raw, weekly.id, '2026-09-06T12:00:00.000Z', 'review');
      expect(readProgrammeWeek(repo, now).currentWeek).toBe(2);
    });
  });

  describe('evening reflections (home evening-done card + the alternation feed)', () => {
    it('excludes a zero-ending evening reflection; includes one with content (guard)', () => {
      const { raw, repo } = makeDb();
      const eveningA = insertStem(raw, 'evening meta A', 'meta');
      insertZeroEndingSession(raw, eveningA, '2026-09-15T19:00:00.000Z', 'review');
      insertCompletedSession(raw, eveningA, '2026-09-16T19:00:00.000Z', 'review');

      const reflections = repo.listCompletedEveningReflections();
      expect(reflections.map((r) => r.startedAt)).toEqual(['2026-09-16T19:00:00.000Z']);
      expect(reflections).toHaveLength(1);
    });
  });

  describe('countProgrammeStemsCompletedInRange (the home morning-complete feed)', () => {
    it('a stem whose only session in range is zero-ending is not completed; one with content is (guard)', () => {
      const { raw, repo } = makeDb();
      const [a, b] = repo.getProgrammeStemsForWeek(1);
      insertZeroEndingSession(raw, a.id, '2026-09-16T06:00:00.000Z');
      insertCompletedSession(raw, b.id, '2026-09-16T07:00:00.000Z');

      expect(repo.countProgrammeStemsCompletedInRange(1, '2026-09-16T00:00:00.000Z', '2026-09-17T00:00:00.000Z')).toBe(1);
    });
  });

  describe('listSessionsForStats (badge/streak/progress feed)', () => {
    it('excludes zero-ending finished sessions; includes one with content (guard)', () => {
      const { raw, repo } = makeDb();
      const stemId = insertStem(raw, 'my own stem');
      insertZeroEndingSession(raw, stemId, '2026-09-10T08:00:00.000Z');
      insertCompletedSession(raw, stemId, '2026-09-11T08:00:00.000Z');

      const sessions = repo.listSessionsForStats();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].startedAt).toBe('2026-09-11T08:00:00.000Z');
    });
  });
});
