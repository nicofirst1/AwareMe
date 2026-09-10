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

/** Writes one ending's text via the same path the app uses (first keypress, then autosave). */
function writeEnding(repo: Repository, sessionId: string, ordinal: number, text: string, at: string): void {
  repo.recordFirstKeypress(sessionId, ordinal, at);
  repo.autosaveEndingText(sessionId, ordinal, text, 0, at);
}

describe('Repository.searchEndings', () => {
  it('finds an ending by a word in its text, with its session context', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'The stem shown at the time',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'the lighthouse keeper waited quietly', '2026-09-10T08:00:05.000Z');

    const results = repo.searchEndings('lighthouse');
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe(sessionId);
    expect(results[0].text).toBe('the lighthouse keeper waited quietly');
    expect(results[0].stemTextSnapshot).toBe('The stem shown at the time');
  });

  it('stays in sync as an ending is edited (autosave rewrites the index, not just appends to it)', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'first draft text', '2026-09-10T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, 'second revision text', 0, '2026-09-10T08:00:06.000Z');

    expect(repo.searchEndings('first')).toHaveLength(0);
    expect(repo.searchEndings('revision')).toHaveLength(1);
  });

  it('excludes a soft-deleted session even though its endings text is untouched', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'a searchable phrase', '2026-09-10T08:00:05.000Z');
    expect(repo.searchEndings('searchable')).toHaveLength(1);

    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run('2026-09-11T00:00:00.000Z', sessionId);
    expect(repo.searchEndings('searchable')).toHaveLength(0);
  });

  it('returns nothing for a query with no match, and for an empty/whitespace query', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'ordinary words here', '2026-09-10T08:00:05.000Z');

    expect(repo.searchEndings('nonexistentword')).toHaveLength(0);
    expect(repo.searchEndings('')).toHaveLength(0);
    expect(repo.searchEndings('   ')).toHaveLength(0);
  });

  it('treats FTS5 special characters in the query as literal text rather than throwing', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'quotes "and" stars * are fine', '2026-09-10T08:00:05.000Z');

    expect(() => repo.searchEndings('"unterminated')).not.toThrow();
    expect(() => repo.searchEndings('foo* OR bar-')).not.toThrow();
    expect(repo.searchEndings('quotes')).toHaveLength(1);
  });

  it('multi-word queries AND together, narrowing the result', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    writeEnding(repo, sessionId, 1, 'quiet morning walk', '2026-09-10T08:00:05.000Z');
    writeEnding(repo, sessionId, 2, 'quiet evening walk', '2026-09-10T08:01:05.000Z');

    expect(repo.searchEndings('quiet')).toHaveLength(2);
    expect(repo.searchEndings('quiet morning')).toHaveLength(1);
  });
});

describe('Repository.rebuildEndingsFts', () => {
  it('re-syncs the index after a write made outside the normal repository methods (e.g. an import)', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snap',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    // Bypasses the repository/triggers entirely, simulating a bulk import
    // that inserts endings rows directly.
    db.prepare(
      'INSERT INTO endings (id, session_id, ordinal, text, started_at, submitted_at, backspace_count) VALUES (?, ?, ?, ?, ?, ?, 0)',
    ).run('direct-insert-id', sessionId, 1, 'inserted directly', '2026-09-10T08:00:05.000Z', '2026-09-10T08:00:10.000Z');

    // Triggers still fire on a plain INSERT regardless of caller, so this
    // already matches — the real test is that rebuild is safe/idempotent
    // to run afterwards and the index stays correct.
    expect(repo.searchEndings('directly')).toHaveLength(1);

    repo.rebuildEndingsFts();
    expect(repo.searchEndings('directly')).toHaveLength(1);
  });
});
