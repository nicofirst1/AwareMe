import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { EVENING_META_STEMS, EVENING_PRACTICE_SEED_STEMS, PROGRAMME_SEED_STEMS, RETIRED_SEED_STEMS, WEEKLY_META_STEM } from '../seed/stems';
import { matchesStemFilters } from '@/session/stemLibraryFilter';

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
    // 142 programme stems + the weekly meta-stem (origin='seed' since
    // migration 0004; its text should block verbatim duplicates too) +
    // the evening practice starter set (issue 17, origin='seed').
    // The 26 retired originals are soft-deleted at seed — excluded.
    expect(texts.length).toBe(PROGRAMME_SEED_STEMS.length + 1 + EVENING_PRACTICE_SEED_STEMS.length);

    const id = repo.addStem({ text: 'Freshly added', category: null, origin: 'user' });
    expect(repo.listStemTexts()).toContain('Freshly added');

    db.prepare("UPDATE stems SET deleted_at = '2026-09-06T00:00:00.000Z' WHERE id = ?").run(id);
    expect(repo.listStemTexts()).not.toContain('Freshly added');
  });
});

describe('Repository.listMetaStems', () => {
  it('returns all 3 §5.4 meta-stems — the weekly one (origin=seed, is_weekly_meta=1) plus the 2 evening ones', () => {
    const { repo } = freshRepository();
    const metaStems = repo.listMetaStems();
    expect(metaStems).toHaveLength(3);
    // Seeded order preserved: the weekly stem first (created first), then
    // the two evening meta-stems.
    expect(metaStems[0].text).toBe(WEEKLY_META_STEM);
    expect(metaStems.slice(1).map((s) => s.text).sort()).toEqual([...EVENING_META_STEMS].sort());
  });

  it('listActiveStems never surfaces a meta-stem; listAllStems (issue 06) surfaces only the 2 evening ones, resting and evening-tagged', () => {
    const { repo } = freshRepository();
    const metaStems = repo.listMetaStems();
    const metaIds = new Set(metaStems.map((s) => s.id));
    expect(repo.listActiveStems().some((s) => metaIds.has(s.id))).toBe(false);

    // Issue 06 (owner feedback "there are no evening stems"): the library
    // lists the 2 evening meta-stems — still active=0, so no practice draw
    // ever picks them, and tagged time_of_day='evening' so the Evening
    // filter matches. The weekly meta-stem stays excluded.
    const inLibrary = repo.listAllStems().filter((s) => metaIds.has(s.id));
    expect(inLibrary.map((s) => s.text).sort()).toEqual([...EVENING_META_STEMS].sort());
    for (const row of inLibrary) {
      expect(row.time_of_day).toBe('evening');
      expect(row.active).toBe(0);
      expect(row.deleted_at).toBeNull();
    }
    expect(inLibrary.some((s) => s.text === WEEKLY_META_STEM)).toBe(false);
  });

  it('drops a soft-deleted evening meta-stem from future selection; the weekly one survives (w1-t4: the delete dialog keeps its promise)', () => {
    const { repo } = freshRepository();
    const deleted = repo.listMetaStems().find((s) => s.origin === 'meta');
    if (!deleted) throw new Error('seed must include the evening meta-stems');
    const survivor = repo.listMetaStems().find((s) => s.origin === 'meta' && s.id !== deleted.id);
    if (!survivor) throw new Error('seed must include a second evening meta-stem');

    // The stem-edit delete dialog (s6-new-1): "This only removes it from the
    // library and future selection" — soft-delete, then the rotation and
    // on-demand selection must stop drawing the row.
    repo.softDeleteStem(deleted.id, '2026-09-16T20:00:00.000Z');

    const metaStems = repo.listMetaStems();
    // 3 → 2: the deleted evening meta-stem leaves the rotation…
    expect(metaStems).toHaveLength(2);
    expect(metaStems.some((s) => s.id === deleted.id)).toBe(false);
    // …while the weekly meta-stem (not deletable via the editor) and the
    // surviving evening row stay selectable (review.tsx's options never empty).
    expect(metaStems.map((s) => s.text)).toContain(WEEKLY_META_STEM);
    expect(metaStems.map((s) => s.id)).toContain(survivor.id);
  });
});

describe('Repository.listAllStems × matchesStemFilters — evening visibility (issue 06)', () => {
  it('the Evening filter matches an evening meta-stem row under Resting/All state, and the Active state hides it', () => {
    const { repo } = freshRepository();
    const eveningMeta = repo.listAllStems().filter((s) => s.origin === 'meta');
    expect(eveningMeta).toHaveLength(EVENING_META_STEMS.length);

    const matchesEvening = (activeFilter: 'active' | 'archived' | 'all') =>
      matchesStemFilters(eveningMeta[0], {
        query: '',
        activeFilter,
        originFilter: 'all',
        categoryFilter: 'all',
        timeOfDayFilter: 'evening',
      });
    expect(matchesEvening('active')).toBe(false);
    expect(matchesEvening('archived')).toBe(true);
    expect(matchesEvening('all')).toBe(true);
  });
});

describe('Repository.getActiveStemsForTimeOfDay', () => {
  it('returns only active, non-deleted stems tagged for the given time of day', () => {
    const { db, repo } = freshRepository();

    const morning = repo.getActiveStemsForTimeOfDay('morning');
    const evening = repo.getActiveStemsForTimeOfDay('evening');
    // Issue 09: the official programme (ADR-0005) is mornings-only, and only
    // the first corpus week's programme stems are active at seed — weeks
    // 2..30 rest. The weekly meta-stem carries NULL and the retired
    // originals are soft-deleted at seed. Since issue 17 the seed's ACTIVE
    // evening rows are exactly the practice starter set: the two evening
    // meta-stems stay inactive (resting, issue 06) and are never drawn.
    expect(morning.length).toBe(PROGRAMME_SEED_STEMS.filter((s) => s.weekNumber === 1).length);
    expect(evening.length).toBe(EVENING_PRACTICE_SEED_STEMS.length);
    expect(evening.every((s) => EVENING_PRACTICE_SEED_STEMS.some((p) => p.text === s.text))).toBe(true);
    expect(morning.some((s) => evening.some((e) => e.id === s.id))).toBe(false);

    // A newly added stem has no time_of_day (NULL) and never surfaces here.
    const id = repo.addStem({ text: 'Untagged stem', category: null, origin: 'user' });
    expect(repo.getActiveStemsForTimeOfDay('morning').some((s) => s.id === id)).toBe(false);
    expect(repo.getActiveStemsForTimeOfDay('evening').some((s) => s.id === id)).toBe(false);

    // Archiving removes it from the draw.
    const morningId = morning[0].id;
    repo.setStemActive(morningId, false);
    expect(repo.getActiveStemsForTimeOfDay('morning').some((s) => s.id === morningId)).toBe(false);

    // Soft-deleting removes it too.
    const eveningId = repo.addStem({ text: 'An evening stem', category: null, origin: 'user', timeOfDay: 'evening' });
    db.prepare("UPDATE stems SET deleted_at = '2026-09-14T00:00:00.000Z' WHERE id = ?").run(eveningId);
    expect(repo.getActiveStemsForTimeOfDay('evening').some((s) => s.id === eveningId)).toBe(false);
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
    // Programme + the 2 evening meta-stems (issue 06) + the retired
    // originals + the evening practice starter set (issue 17).
    expect(repo.listAllStems()).toHaveLength(
      PROGRAMME_SEED_STEMS.length +
        EVENING_META_STEMS.length +
        EVENING_PRACTICE_SEED_STEMS.length +
        RETIRED_SEED_STEMS.length,
    );
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
