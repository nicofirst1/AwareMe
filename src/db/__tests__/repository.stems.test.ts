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

describe('Repository.addStem', () => {
  it('inserts an active, non-deleted stem with the given text/category/origin', () => {
    const { db, repo } = freshRepository();
    const id = repo.addStem({ text: 'A new stem', category: 'purpose', origin: 'user' });

    const row = db.prepare('SELECT * FROM stems WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.text).toBe('A new stem');
    expect(row.category).toBe('purpose');
    expect(row.origin).toBe('user');
    expect(row.weight).toBe(1.0);
    expect(row.active).toBe(1);
    expect(row.deleted_at).toBeNull();
    expect(typeof row.created_at).toBe('string');
    expect(typeof row.created_tz).toBe('string');
    expect(typeof row.created_offset_min).toBe('number');
  });

  it('permits a null category', () => {
    const { db, repo } = freshRepository();
    const id = repo.addStem({ text: 'No category here', category: null, origin: 'user' });
    const row = db.prepare('SELECT category FROM stems WHERE id = ?').get(id) as { category: string | null };
    expect(row.category).toBeNull();
  });
});

describe('Repository.listStemTexts', () => {
  it('returns every non-deleted stem text, for duplicate checking', () => {
    const { db, repo } = freshRepository();
    const texts = repo.listStemTexts();
    expect(texts.length).toBe(26);

    const id = repo.addStem({ text: 'Freshly added', category: null, origin: 'user' });
    expect(repo.listStemTexts()).toContain('Freshly added');

    db.prepare("UPDATE stems SET deleted_at = '2026-09-06T00:00:00.000Z' WHERE id = ?").run(id);
    expect(repo.listStemTexts()).not.toContain('Freshly added');
  });
});

describe('Repository.bulkImportStems', () => {
  it('adds one stem per line, all origin=imported, and returns the count', () => {
    const { db, repo } = freshRepository();
    const count = repo.bulkImportStems(['First imported stem', 'Second imported stem'], 'integrity');

    expect(count).toBe(2);
    const rows = db.prepare("SELECT text, origin, category FROM stems WHERE origin = 'imported'").all() as {
      text: string;
      origin: string;
      category: string | null;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.origin === 'imported')).toBe(true);
    expect(rows.every((r) => r.category === 'integrity')).toBe(true);
  });

  it('is a no-op for an empty list', () => {
    const { repo } = freshRepository();
    expect(repo.bulkImportStems([], null)).toBe(0);
    expect(repo.listAllStems()).toHaveLength(26);
  });
});

describe('Repository.updateStem', () => {
  it('edits text/category without touching existing sessions.stem_text_snapshot', () => {
    const { db, repo } = freshRepository();
    const stemId = repo.listActiveStems()[0].id;
    const originalText = repo.listActiveStems()[0].text;

    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: originalText,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });

    repo.updateStem(stemId, { text: 'Reworded stem text', category: 'assertiveness' });

    const stemRow = db.prepare('SELECT text, category FROM stems WHERE id = ?').get(stemId) as {
      text: string;
      category: string;
    };
    expect(stemRow.text).toBe('Reworded stem text');
    expect(stemRow.category).toBe('assertiveness');

    const sessionRow = db.prepare('SELECT stem_text_snapshot FROM sessions WHERE id = ?').get(sessionId) as {
      stem_text_snapshot: string;
    };
    expect(sessionRow.stem_text_snapshot).toBe(originalText);
  });
});

describe('Repository.setStemActive', () => {
  it('toggles active without touching deleted_at', () => {
    const { db, repo } = freshRepository();
    const stemId = repo.listActiveStems()[0].id;

    repo.setStemActive(stemId, false);
    let row = db.prepare('SELECT active, deleted_at FROM stems WHERE id = ?').get(stemId) as {
      active: number;
      deleted_at: string | null;
    };
    expect(row.active).toBe(0);
    expect(row.deleted_at).toBeNull();

    repo.setStemActive(stemId, true);
    row = db.prepare('SELECT active, deleted_at FROM stems WHERE id = ?').get(stemId) as {
      active: number;
      deleted_at: string | null;
    };
    expect(row.active).toBe(1);
  });
});

describe('Repository.softDeleteStem', () => {
  it('sets deleted_at and leaves past sessions/endings intact', () => {
    const { db, repo } = freshRepository();
    const stemId = repo.listActiveStems()[0].id;
    const stemText = repo.listActiveStems()[0].text;

    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: stemText,
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-10T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-10T08:00:05.000Z');

    repo.softDeleteStem(stemId, '2026-09-10T09:00:00.000Z');

    const stemRow = db.prepare('SELECT deleted_at FROM stems WHERE id = ?').get(stemId) as { deleted_at: string };
    expect(stemRow.deleted_at).toBe('2026-09-10T09:00:00.000Z');

    const sessionRow = db.prepare('SELECT stem_text_snapshot FROM sessions WHERE id = ?').get(sessionId) as {
      stem_text_snapshot: string;
    };
    expect(sessionRow.stem_text_snapshot).toBe(stemText);
    const endings = db.prepare('SELECT * FROM endings WHERE session_id = ?').all(sessionId);
    expect(endings).toHaveLength(1);
  });
});

describe('Repository.setStemWeight', () => {
  it('sets an exact weight value', () => {
    const { db, repo } = freshRepository();
    const stemId = repo.listActiveStems()[0].id;

    repo.setStemWeight(stemId, 2.5);
    const row = db.prepare('SELECT weight FROM stems WHERE id = ?').get(stemId) as { weight: number };
    expect(row.weight).toBe(2.5);
  });
});
