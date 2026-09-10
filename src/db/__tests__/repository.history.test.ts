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

function stemWithCategory(repo: Repository, category: string): { id: string; text: string } {
  const stem = repo.listActiveStems().find((s) => s.category === category)!;
  return { id: stem.id, text: stem.text };
}

describe('Repository.listSessionsForHistory', () => {
  it('lists non-deleted sessions reverse-chronologically with stem text/category', () => {
    const { repo } = freshRepository();
    const stem = stemWithCategory(repo, 'awareness');

    const idOld = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-01T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    const idNew = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    const rows = repo.listSessionsForHistory();
    expect(rows.map((r) => r.id)).toEqual([idNew, idOld]);
    expect(rows[0].category).toBe('awareness');
    expect(rows[0].stem_text_snapshot).toBe(stem.text);
  });

  it('excludes soft-deleted sessions', () => {
    const { db, repo } = freshRepository();
    const stem = stemWithCategory(repo, 'awareness');
    const id = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run('2026-09-06T00:00:00.000Z', id);

    expect(repo.listSessionsForHistory()).toHaveLength(0);
  });

  it('filters by stemId, category, and date range', () => {
    const { repo } = freshRepository();
    const awareness = stemWithCategory(repo, 'awareness');
    const purpose = stemWithCategory(repo, 'purpose');

    repo.createSession({
      stemId: awareness.id,
      stemTextSnapshot: awareness.text,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-01T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    const purposeId = repo.createSession({
      stemId: purpose.id,
      stemTextSnapshot: purpose.text,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    expect(repo.listSessionsForHistory({ stemId: purpose.id })).toHaveLength(1);
    expect(repo.listSessionsForHistory({ category: 'purpose' }).map((r) => r.id)).toEqual([purposeId]);
    expect(repo.listSessionsForHistory({ dateFrom: '2026-09-05T00:00:00.000Z' }).map((r) => r.id)).toEqual([
      purposeId,
    ]);
    expect(repo.listSessionsForHistory({ dateTo: '2026-09-02T00:00:00.000Z' })).toHaveLength(1);
  });
});

describe('Repository.getSessionDetail', () => {
  it('returns the session and its endings in ordinal order', () => {
    const { repo } = freshRepository();
    const stem = stemWithCategory(repo, 'awareness');
    const sessionId = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');
    repo.submitEnding(sessionId, 1, '2026-09-10T08:00:10.000Z');
    repo.recordFirstKeypress(sessionId, 2, '2026-09-10T08:00:15.000Z');

    const detail = repo.getSessionDetail(sessionId);
    expect(detail?.session.id).toBe(sessionId);
    expect(detail?.endings.map((e) => e.ordinal)).toEqual([1, 2]);
  });

  it('returns null for a soft-deleted or missing session', () => {
    const { db, repo } = freshRepository();
    const stem = stemWithCategory(repo, 'awareness');
    const sessionId = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run('2026-09-11T00:00:00.000Z', sessionId);

    expect(repo.getSessionDetail(sessionId)).toBeNull();
    expect(repo.getSessionDetail('nonexistent')).toBeNull();
  });
});

describe('Repository.softDeleteSession', () => {
  it('sets deleted_at without removing the row or its endings', () => {
    const { db, repo } = freshRepository();
    const stem = stemWithCategory(repo, 'awareness');
    const sessionId = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');

    repo.softDeleteSession(sessionId, '2026-09-11T00:00:00.000Z');

    const row = db.prepare('SELECT deleted_at FROM sessions WHERE id = ?').get(sessionId) as { deleted_at: string };
    expect(row.deleted_at).toBe('2026-09-11T00:00:00.000Z');
    const endings = db.prepare('SELECT * FROM endings WHERE session_id = ?').all(sessionId);
    expect(endings).toHaveLength(1); // still there — append-only
    expect(repo.listSessionsForHistory()).toHaveLength(0);
  });
});

describe('Repository.listHistoryCategories and listHistoryStems', () => {
  it('return only categories/stems that appear in a non-deleted session', () => {
    const { repo } = freshRepository();
    const awareness = stemWithCategory(repo, 'awareness');

    expect(repo.listHistoryCategories()).toEqual([]);
    expect(repo.listHistoryStems()).toEqual([]);

    repo.createSession({
      stemId: awareness.id,
      stemTextSnapshot: awareness.text,
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    expect(repo.listHistoryCategories()).toEqual(['awareness']);
    expect(repo.listHistoryStems()).toEqual([{ id: awareness.id, text: awareness.text }]);
  });
});
