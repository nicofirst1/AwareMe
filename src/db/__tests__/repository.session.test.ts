import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  return { db: raw, repo };
}

function firstStemId(repo: Repository): string {
  return repo.listActiveStems()[0].id;
}

describe('Repository.getSettings', () => {
  it('returns spec §7 defaults after seeding', () => {
    const { repo } = freshRepository();
    const settings = repo.getSettings();
    expect(settings.timer_seconds).toBe(90);
    expect(settings.endings_per_session).toBe(6);
    expect(settings.uncensored_mode).toBe(true);
  });
});

describe('Repository.listActiveStems', () => {
  it('excludes archived and deleted stems', () => {
    const { db, repo } = freshRepository();
    const activeBefore = repo.listActiveStems();
    expect(activeBefore.length).toBe(26);

    const someId = activeBefore[0].id;
    db.prepare('UPDATE stems SET active = 0 WHERE id = ?').run(someId);
    expect(repo.listActiveStems().length).toBe(25);
  });
});

describe('Repository session lifecycle', () => {
  it('createSession inserts a row with the given config, snapshot, and origin', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);

    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'A snapshot of the stem',
      origin: 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Record<string, unknown>;
    expect(row.stem_id).toBe(stemId);
    expect(row.stem_text_snapshot).toBe('A snapshot of the stem');
    expect(row.origin).toBe('manual');
    expect(row.target_endings).toBe(6);
    expect(row.timer_seconds).toBe(90);
    expect(row.uncensored_mode).toBe(1);
    expect(row.started_at).toBe('2026-09-10T08:00:00.000Z');
    expect(row.last_activity_at).toBe('2026-09-10T08:00:00.000Z');
    expect(row.first_keypress_at).toBeNull();
    expect(row.ended_at).toBeNull();
    expect(row.device_locale).toBe('en-US');
    expect(typeof row.tz).toBe('string');
    expect(typeof row.offset_min).toBe('number');
  });

  it('recordFirstKeypress creates an endings row and stamps session.first_keypress_at once', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    const session = db.prepare('SELECT first_keypress_at, last_activity_at FROM sessions WHERE id = ?').get(sessionId) as {
      first_keypress_at: string;
      last_activity_at: string;
    };
    expect(session.first_keypress_at).toBe('2026-09-10T08:00:05.000Z');
    expect(session.last_activity_at).toBe('2026-09-10T08:00:05.000Z');

    const endings = db.prepare('SELECT * FROM endings WHERE session_id = ?').all(sessionId) as Record<string, unknown>[];
    expect(endings).toHaveLength(1);
    expect(endings[0].ordinal).toBe(1);
    expect(endings[0].text).toBe('');
    expect(endings[0].submitted_at).toBeNull();

    // A later field's first keypress does not overwrite first_keypress_at.
    repo.recordFirstKeypress(sessionId, 2, '2026-09-10T08:00:20.000Z');
    const sessionAfter = db.prepare('SELECT first_keypress_at FROM sessions WHERE id = ?').get(sessionId) as {
      first_keypress_at: string;
    };
    expect(sessionAfter.first_keypress_at).toBe('2026-09-10T08:00:05.000Z');
  });

  it('recordFirstKeypress is idempotent for the same field', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:06.000Z');

    const endings = db.prepare('SELECT * FROM endings WHERE session_id = ?').all(sessionId);
    expect(endings).toHaveLength(1);
  });

  it('autosaveEndingText updates text, accumulates backspace_count, and bumps last_activity_at', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, 'hell', 1, '2026-09-10T08:00:06.000Z');
    repo.autosaveEndingText(sessionId, 1, 'hello', 0, '2026-09-10T08:00:07.000Z');

    const ending = db.prepare('SELECT text, backspace_count FROM endings WHERE session_id = ? AND ordinal = 1').get(
      sessionId,
    ) as { text: string; backspace_count: number };
    expect(ending.text).toBe('hello');
    expect(ending.backspace_count).toBe(1);

    const session = db.prepare('SELECT last_activity_at FROM sessions WHERE id = ?').get(sessionId) as {
      last_activity_at: string;
    };
    expect(session.last_activity_at).toBe('2026-09-10T08:00:07.000Z');
  });

  it('submitEnding stamps submitted_at', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.submitEnding(sessionId, 1, '2026-09-10T08:00:30.000Z');

    const ending = db.prepare('SELECT submitted_at FROM endings WHERE session_id = ? AND ordinal = 1').get(
      sessionId,
    ) as { submitted_at: string };
    expect(ending.submitted_at).toBe('2026-09-10T08:00:30.000Z');
  });

  it('finalizeSession closes any open ending without discarding its text, and stamps end_reason/ended_at', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, 'half-typed', 0, '2026-09-10T08:00:10.000Z');

    repo.finalizeSession(sessionId, 'timeout', '2026-09-10T08:01:30.000Z');

    const ending = db.prepare('SELECT text, submitted_at FROM endings WHERE session_id = ? AND ordinal = 1').get(
      sessionId,
    ) as { text: string; submitted_at: string };
    expect(ending.text).toBe('half-typed');
    expect(ending.submitted_at).toBe('2026-09-10T08:01:30.000Z');

    const session = db.prepare('SELECT ended_at, end_reason FROM sessions WHERE id = ?').get(sessionId) as {
      ended_at: string;
      end_reason: string;
    };
    expect(session.ended_at).toBe('2026-09-10T08:01:30.000Z');
    expect(session.end_reason).toBe('timeout');
  });

  it('finalizeSession does not touch an already-submitted ending', () => {
    const { db, repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.submitEnding(sessionId, 1, '2026-09-10T08:00:10.000Z');
    repo.finalizeSession(sessionId, 'user_done', '2026-09-10T08:00:40.000Z');

    const ending = db.prepare('SELECT submitted_at FROM endings WHERE session_id = ? AND ordinal = 1').get(
      sessionId,
    ) as { submitted_at: string };
    expect(ending.submitted_at).toBe('2026-09-10T08:00:10.000Z');
  });

  it('getOpenSession finds the one unfinished session with its endings, and null once finalized', () => {
    const { repo } = freshRepository();
    const sessionId = repo.createSession({
      stemId: firstStemId(repo),
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');

    const open = repo.getOpenSession();
    expect(open?.session.id).toBe(sessionId);
    expect(open?.endings).toHaveLength(1);

    repo.finalizeSession(sessionId, 'abandoned', '2026-09-10T08:10:00.000Z');
    expect(repo.getOpenSession()).toBeNull();
  });
});
