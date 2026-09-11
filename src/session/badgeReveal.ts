/**
 * Completion-screen badge reveal (gamification proposal §5 cycle 2). The
 * one function write.tsx's `done` phase calls — assembles `BadgeHistory`
 * before/after the just-finalized session and diffs via
 * `computeNewlyEarnedBadgeIds`, rather than inlining repository reads in
 * the screen.
 *
 * The before/after seam: by the time `session.phase === 'done'` renders,
 * `finalize()` (`useWritingSession.ts`) has already called
 * `repo.finalizeSession`, so the just-completed session is already a row
 * `listSessionsForStats()` returns. "Before" history is therefore built by
 * reading current stats and filtering the completed session's id back out
 * — not by reading before the save happens (there is no such moment by the
 * time this runs).
 *
 * `hasReview`/`hasUserStem` are read once, not diffed per-session (a review
 * or a user stem isn't attached to any particular session id) — so
 * `looking_back`/`stem_of_your_own` can never appear as "newly earned"
 * through *this* path specifically: write.tsx never creates a review or a
 * user stem itself (review.tsx and stems.tsx do, on their own screens). Both
 * badges still work correctly on the Progress screen's static grid (cycle
 * 3); they just don't get a completion-screen reveal moment, which matches
 * the proposal's placement (write.tsx only) rather than a general "review a
 * session" event.
 */

import type { BadgeDef, BadgeId } from './badges';
import { BADGES, computeNewlyEarnedBadgeIds } from './badges';

/** The narrow slice of `Repository` this needs — kept minimal so tests can pass a fake without standing up SQLite. */
export interface BadgeRevealRepo {
  listSessionsForStats(): ReturnType<import('@/db/repository').Repository['listSessionsForStats']>;
  getLastReviewAt(): string | null;
  listAllStems(): { origin: string; deleted_at: string | null }[];
}

/**
 * Badges newly earned by `completedSessionId`, in catalog order. Empty when
 * nothing newly crossed a threshold (the common case — most completions
 * earn nothing, per the proposal's "no counter, no checklist" posture).
 */
export function assembleNewlyEarnedBadges(repo: BadgeRevealRepo, completedSessionId: string): BadgeDef[] {
  const allSessions = repo.listSessionsForStats();
  const completed = allSessions.find((s) => s.id === completedSessionId);
  if (!completed) return [];

  const sessionsBefore = allSessions.filter((s) => s.id !== completedSessionId);
  const hasReview = repo.getLastReviewAt() !== null;
  const hasUserStem = repo.listAllStems().some((s) => s.origin === 'user' && s.deleted_at === null);

  const newlyEarnedIds: BadgeId[] = computeNewlyEarnedBadgeIds(
    { sessions: sessionsBefore, hasReview, hasUserStem },
    completed,
  );

  const byId = new Map(BADGES.map((b) => [b.id, b]));
  return newlyEarnedIds.map((id) => byId.get(id)).filter((b): b is BadgeDef => b !== undefined);
}
