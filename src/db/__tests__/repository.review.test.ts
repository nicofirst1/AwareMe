import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';
import { META_STEMS } from '../seed/stems';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  return { db: raw, repo };
}

// w1-t7 (s1-F7): the dead active-stem read is deleted (zero production
// callers). Fixture reads derive the same set from listAllStems.
function activeStems(repo: Repository) {
  return repo.listAllStems().filter((s) => s.active !== 0 && s.deleted_at === null);
}

function firstStemId(repo: Repository): string {
  return activeStems(repo)[0].id;
}

function sessionWithEnding(repo: Repository, stemId: string, startedAt: string): string {
  const sessionId = repo.createSession({
    stemId,
    stemTextSnapshot: 'snap',
    origin: 'manual',
    targetEndings: 1,
    timerSeconds: 90,
    uncensoredMode: true,
    startedAt,
    deviceLocale: 'en-US',
  });
  repo.recordFirstKeypress(sessionId, 1, startedAt);
  repo.submitEnding(sessionId, 1, startedAt);
  return sessionId;
}

describe('Repository.listSessionsForReview', () => {
  it('returns sessions with an ending inside the period, chronological, with their endings', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);

    const inPeriod1 = sessionWithEnding(repo, stemId, '2026-09-05T08:00:00.000Z');
    const inPeriod2 = sessionWithEnding(repo, stemId, '2026-09-08T08:00:00.000Z');
    const beforePeriod = sessionWithEnding(repo, stemId, '2026-09-01T08:00:00.000Z');
    const afterPeriod = sessionWithEnding(repo, stemId, '2026-09-11T08:00:00.000Z');

    const results = repo.listSessionsForReview('2026-09-03T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
    const ids = results.map((r) => r.session.id);
    expect(ids).toEqual([inPeriod1, inPeriod2]);
    expect(ids).not.toContain(beforePeriod);
    expect(ids).not.toContain(afterPeriod);
    expect(results[0].endings).toHaveLength(1);
  });

  it('excludes soft-deleted sessions', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const sessionId = sessionWithEnding(repo, stemId, '2026-09-05T08:00:00.000Z');
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run('2026-09-06T00:00:00.000Z', sessionId);

    expect(repo.listSessionsForReview('2026-09-01T00:00:00.000Z', '2026-09-10T00:00:00.000Z')).toHaveLength(0);
  });

  it('returns an empty array for a period with nothing written', () => {
    const { repo } = freshRepository();
    expect(repo.listSessionsForReview('2026-01-01T00:00:00.000Z', '2026-01-08T00:00:00.000Z')).toEqual([]);
  });
});

describe('Repository.listSessionsForDayMorning (issue 10: deleted stems in the evening reread)', () => {
  it('hides the day’s session on a stem soft-deleted before the evening reflection', () => {
    const { repo } = freshRepository();
    // The reread's morning filter is what this test exercises, so the two
    // fixture stems must be morning-tagged actives — selected explicitly
    // (fixture reads no longer inherit the deleted read's insertion-order
    // accident, w1-t7).
    const [deletedStem, keptStem] = activeStems(repo).filter((s) => s.time_of_day === 'morning');

    // The morning: two completed practices with endings, inside the day window.
    const deletedSession = sessionWithEnding(repo, deletedStem.id, '2026-09-10T08:00:00.000Z');
    const keptSession = sessionWithEnding(repo, keptStem.id, '2026-09-10T08:30:00.000Z');

    // Before the evening reflection, the user soft-deletes one stem.
    repo.softDeleteStem(deletedStem.id, '2026-09-10T12:00:00.000Z');

    const reviewed = repo.listSessionsForDayMorning('2026-09-10T00:00:00.000Z', '2026-09-11T00:00:00.000Z');
    // The deleted stem’s session is gone from the evening reread...
    expect(reviewed.map((r) => r.session.id)).toEqual([keptSession]);
    expect(reviewed.map((r) => r.session.id)).not.toContain(deletedSession);
  });

  it('still leaves the soft-deleted row visible to the library read (deliberate resting/provenance behavior, untouched)', () => {
    const { repo } = freshRepository();
    const [victim] = activeStems(repo);

    repo.softDeleteStem(victim.id, '2026-09-10T12:00:00.000Z');

    const library = repo.listAllStems();
    const row = library.find((s) => s.id === victim.id);
    expect(row?.deleted_at).toBe('2026-09-10T12:00:00.000Z');
    // The reflection meta-stems stay in the alternation pool too (§6.5.2).
    expect(repo.listMetaStems()).toHaveLength(3);
  });
});

// ── Packet-7 w2-t5 / D7: the §8.2 reread widening + the picks-read's leak guard ──

describe('Repository.listSessionsForDayMorning — the design §8.2 widening (packet-7 w2-t5)', () => {
  it('includes an untagged stem’s today-session in the evening reread (untagged picks land in the morning, so their endings re-read)', () => {
    const { repo } = freshRepository();
    // addStem without timeOfDay seeds the honest default: untagged.
    const untaggedId = repo.addStem({ text: 'Mock untagged reread fixture stem', category: null, origin: 'user' });
    sessionWithEnding(repo, untaggedId, '2026-09-10T08:00:00.000Z');

    const reviewed = repo.listSessionsForDayMorning('2026-09-10T00:00:00.000Z', '2026-09-11T00:00:00.000Z');
    expect(reviewed.map((r) => r.session.stem_id)).toEqual([untaggedId]);
  });

  it('still excludes evening-tagged stems — the evening practice is not re-read (the w1-t5 solo-fallback intent survives the widening)', () => {
    const { repo } = freshRepository();
    const eveningId = repo.addStem({
      text: 'Mock evening reread fixture stem',
      category: null,
      origin: 'user',
      timeOfDay: 'evening',
    });
    sessionWithEnding(repo, eveningId, '2026-09-10T08:00:00.000Z');

    const reviewed = repo.listSessionsForDayMorning('2026-09-10T00:00:00.000Z', '2026-09-11T00:00:00.000Z');
    expect(reviewed).toEqual([]); // exact: nothing else is in the window either
  });
});

describe('Repository.listAllStems — the weekly meta-stem cannot reach the D7 evening picks (packet-7 w2-t5)', () => {
  it('excludes is_weekly_meta rows outright, even a contrived active evening-tagged one (worst-case shape)', () => {
    const { db, repo } = freshRepository();
    // The real weekly meta-stem is active=1 but time_of_day=NULL; this
    // contrived row gives it EVERY attribute the evening-picks predicate
    // would accept (active, evening-tagged, non-deleted, origin seed) —
    // only is_weekly_meta=1 stands between it and a practice draw. The
    // library read must exclude it regardless.
    db.prepare(
      `INSERT INTO stems (id, text, origin, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
       VALUES ('wkmeta-contrived', 'Mock contrived weekly-meta row', 'seed', 'en', 1.0, 1, '2026-09-10T00:00:00.000Z', 'Europe/Berlin', 120, 'evening', NULL, 1)`,
    ).run();

    const library = repo.listAllStems();
    expect(library.some((s) => s.id === 'wkmeta-contrived')).toBe(false);
    // The exact predicate readEveningReflectionInputs applies has nothing to leak:
    const picksShape = library.filter(
      (s) => s.active === 1 && s.deleted_at === null && s.time_of_day === 'evening' && s.origin !== 'meta',
    );
    expect(picksShape.some((s) => s.id === 'wkmeta-contrived')).toBe(false);
  });
});

describe('end-to-end review flow', () => {
  it('a meta-stem session (a real session/endings pair, stem_id pointing at a real stems row) feeds createReview', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const reviewedId = sessionWithEnding(repo, stemId, '2026-09-05T08:00:00.000Z');

    const metaStem = repo.listMetaStems()[0];

    // Review's meta-stem completion is "a normal timed session" (§6.5.2):
    // exercise the exact same repository calls write.tsx/useWritingSession
    // use for any other session.
    const metaSessionId = repo.createSession({
      stemId: metaStem.id,
      stemTextSnapshot: metaStem.text,
      origin: 'review',
      targetEndings: 1,
      timerSeconds: 180,
      uncensoredMode: true,
      startedAt: '2026-09-10T09:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(metaSessionId, 1, '2026-09-10T09:00:05.000Z');
    repo.autosaveEndingText(metaSessionId, 1, 'It might be helpful if I slowed down.', 0, '2026-09-10T09:00:20.000Z');
    repo.finalizeSession(metaSessionId, 'user_done', '2026-09-10T09:00:25.000Z');

    const metaSessionRow = db.prepare('SELECT stem_id, origin FROM sessions WHERE id = ?').get(metaSessionId) as {
      stem_id: string;
      origin: string;
    };
    expect(metaSessionRow.stem_id).toBe(metaStem.id);
    expect(metaSessionRow.origin).toBe('review');

    const reviewId = repo.createReview({
      periodStart: '2026-09-03T00:00:00.000Z',
      periodEnd: '2026-09-10T00:00:00.000Z',
      sessionIds: [reviewedId],
      metaStemText: metaStem.text,
      reflectionText: 'It might be helpful if I slowed down.',
      createdAt: '2026-09-10T09:00:25.000Z',
    });

    const reviewRow = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as Record<string, unknown>;
    expect(JSON.parse(reviewRow.session_ids as string)).toEqual([reviewedId]);
    expect(reviewRow.reflection_text).toBe('It might be helpful if I slowed down.');

    // The meta-stem session itself shows up in ordinary history/session
    // reads exactly like any other session — nothing about review hides it.
    expect(repo.getSessionDetail(metaSessionId)?.session.origin).toBe('review');
  });
});

describe('Repository.createReview and getLastReviewAt', () => {
  it('inserts a review row with the reviewed session ids and reflection text', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const reviewedId = sessionWithEnding(repo, stemId, '2026-09-05T08:00:00.000Z');

    const reviewId = repo.createReview({
      periodStart: '2026-09-03T00:00:00.000Z',
      periodEnd: '2026-09-10T00:00:00.000Z',
      sessionIds: [reviewedId],
      metaStemText: META_STEMS[0],
      reflectionText: 'It might be helpful if I slowed down.',
      createdAt: '2026-09-10T09:00:00.000Z',
    });

    const row = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as Record<string, unknown>;
    expect(JSON.parse(row.session_ids as string)).toEqual([reviewedId]);
    expect(row.meta_stem_text).toBe(META_STEMS[0]);
    expect(row.reflection_text).toBe('It might be helpful if I slowed down.');
    expect(row.period_start).toBe('2026-09-03T00:00:00.000Z');
    expect(row.period_end).toBe('2026-09-10T00:00:00.000Z');
    expect(typeof row.tz).toBe('string');
    expect(typeof row.offset_min).toBe('number');
  });

  it('permits a null reflection_text (e.g. the meta-stem session timed out with nothing typed)', () => {
    const { db, repo } = freshRepository();
    const reviewId = repo.createReview({
      periodStart: '2026-09-03T00:00:00.000Z',
      periodEnd: '2026-09-10T00:00:00.000Z',
      sessionIds: [],
      metaStemText: META_STEMS[0],
      reflectionText: null,
      createdAt: '2026-09-10T09:00:00.000Z',
    });
    const row = db.prepare('SELECT reflection_text FROM reviews WHERE id = ?').get(reviewId) as {
      reflection_text: string | null;
    };
    expect(row.reflection_text).toBeNull();
  });

  it('getLastReviewAt returns null with no reviews, then the most recent created_at', () => {
    const { repo } = freshRepository();
    expect(repo.getLastReviewAt()).toBeNull();

    repo.createReview({
      periodStart: '2026-08-27T00:00:00.000Z',
      periodEnd: '2026-09-03T00:00:00.000Z',
      sessionIds: [],
      metaStemText: META_STEMS[0],
      reflectionText: null,
      createdAt: '2026-09-03T09:00:00.000Z',
    });
    repo.createReview({
      periodStart: '2026-09-03T00:00:00.000Z',
      periodEnd: '2026-09-10T00:00:00.000Z',
      sessionIds: [],
      metaStemText: META_STEMS[1],
      reflectionText: null,
      createdAt: '2026-09-10T09:00:00.000Z',
    });

    expect(repo.getLastReviewAt()).toBe('2026-09-10T09:00:00.000Z');
  });

  it('getLastReviewAt excludes soft-deleted reviews', () => {
    const { db, repo } = freshRepository();
    const id = repo.createReview({
      periodStart: '2026-09-03T00:00:00.000Z',
      periodEnd: '2026-09-10T00:00:00.000Z',
      sessionIds: [],
      metaStemText: META_STEMS[0],
      reflectionText: null,
      createdAt: '2026-09-10T09:00:00.000Z',
    });
    db.prepare('UPDATE reviews SET deleted_at = ? WHERE id = ?').run('2026-09-11T00:00:00.000Z', id);

    expect(repo.getLastReviewAt()).toBeNull();
  });
});
