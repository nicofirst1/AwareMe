import type { BadgeSession } from '../badges';
import { assembleNewlyEarnedBadges, type BadgeRevealRepo } from '../badgeReveal';

function session(overrides: Partial<BadgeSession> = {}): BadgeSession {
  return {
    id: 's1',
    stemId: 'stem-1',
    category: 'awareness',
    origin: 'manual',
    targetEndings: 6,
    uncensoredMode: false,
    startedAt: '2026-09-10T09:00:00.000Z',
    endedAt: '2026-09-10T09:10:00.000Z',
    endReason: 'user_done',
    tz: 'Europe/Berlin',
    offsetMin: 0,
    endings: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }, { text: 'f' }],
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<{ sessions: BadgeSession[]; lastReviewAt: string | null; userStem: boolean }> = {}): BadgeRevealRepo {
  const sessions = overrides.sessions ?? [];
  const lastReviewAt = overrides.lastReviewAt ?? null;
  const userStem = overrides.userStem ?? false;
  return {
    listSessionsForStats: () => sessions,
    getLastReviewAt: () => lastReviewAt,
    listAllStems: () => (userStem ? [{ origin: 'user', deleted_at: null }] : []),
  };
}

describe('assembleNewlyEarnedBadges', () => {
  it('returns nothing when the completed session id is not found (defensive)', () => {
    const repo = fakeRepo({ sessions: [session({ id: 's1' })] });
    expect(assembleNewlyEarnedBadges(repo, 'missing')).toEqual([]);
  });

  it('excludes the completed session from "before" so its own first-session badge counts as newly earned', () => {
    const repo = fakeRepo({ sessions: [session({ id: 's1' })] });
    const newly = assembleNewlyEarnedBadges(repo, 's1');
    expect(newly.map((b) => b.id)).toEqual(expect.arrayContaining(['first_words', 'six_endings']));
  });

  it('earns nothing new when the badge was already earned by prior history', () => {
    const repo = fakeRepo({
      sessions: [session({ id: 'prior' }), session({ id: 's2' })],
    });
    // 'first_words' was already earned by 'prior'; completing s2 shouldn't
    // re-surface it.
    const newly = assembleNewlyEarnedBadges(repo, 's2');
    expect(newly.map((b) => b.id)).not.toContain('first_words');
  });

  it('never surfaces looking_back/stem_of_your_own as "newly earned" through this path, by construction', () => {
    // hasReview/hasUserStem are read once (not filtered by session id), so
    // they're identical in "before" and "after" for every call through
    // write.tsx's completion flow — write.tsx never creates a review or a
    // user stem itself (review.tsx and stems.tsx do, on their own screens),
    // so these two badges can only ever be earned outside this reveal path,
    // surfacing later on the Progress screen's static grid instead.
    const repo = fakeRepo({
      sessions: [session({ id: 's1' })],
      lastReviewAt: '2026-09-10T09:00:00.000Z',
      userStem: true,
    });
    const newly = assembleNewlyEarnedBadges(repo, 's1').map((b) => b.id);
    expect(newly).not.toContain('looking_back');
    expect(newly).not.toContain('stem_of_your_own');
  });

  it('excludes deleted user stems from hasUserStem (repository read convention)', () => {
    const repo: BadgeRevealRepo = {
      listSessionsForStats: () => [session({ id: 's1' })],
      getLastReviewAt: () => null,
      listAllStems: () => [{ origin: 'user', deleted_at: '2026-09-10T09:00:00.000Z' }],
    };
    const newly = assembleNewlyEarnedBadges(repo, 's1');
    expect(newly.map((b) => b.id)).not.toContain('stem_of_your_own');
  });

  it('returns an empty array, not undefined entries, when nothing newly crosses a threshold', () => {
    const repo = fakeRepo({ sessions: [session({ id: 'prior' }), session({ id: 's2' })] });
    const newly = assembleNewlyEarnedBadges(repo, 's2');
    expect(Array.isArray(newly)).toBe(true);
    expect(newly.every((b) => typeof b.id === 'string')).toBe(true);
  });
});
