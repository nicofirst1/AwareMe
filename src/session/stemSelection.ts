/**
 * Weighted stem selection for "start now" (spec §6.2). A pure function of
 * (candidate stems, session history, current time, random seed) so it is
 * deterministically unit-testable — no database, no clock, no RNG import.
 */

export interface SelectableStem {
  id: string;
  category: string | null;
  weight: number;
}

/** One past session's stem + when it started, enough to compute recency/category penalties. */
export interface StemUsage {
  stemId: string;
  category: string | null;
  startedAt: string; // UTC ISO-8601
}

const RECENT_2_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const RECENT_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** A xorshift-ish PRNG seeded with a plain number, so selection is reproducible for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Effective weight for one stem: base weight, reduced by a recency penalty
 * if used in the last 2 or 7 days (never to zero — a user with three stems
 * must still get one), lightly boosted if its category hasn't been seen in
 * the last 14 days.
 */
function effectiveWeight(stem: SelectableStem, history: readonly StemUsage[], nowMs: number): number {
  let weight = stem.weight;

  const lastUsedMs = history
    .filter((h) => h.stemId === stem.id)
    .map((h) => Date.parse(h.startedAt))
    .reduce((max, t) => Math.max(max, t), -Infinity);

  if (Number.isFinite(lastUsedMs)) {
    const age = nowMs - lastUsedMs;
    if (age < RECENT_2_DAYS_MS) weight *= 0.05;
    else if (age < RECENT_7_DAYS_MS) weight *= 0.2;
  }

  if (stem.category !== null) {
    const categorySeenRecently = history.some(
      (h) => h.category === stem.category && nowMs - Date.parse(h.startedAt) < CATEGORY_WINDOW_MS,
    );
    if (!categorySeenRecently) weight *= 1.3;
  }

  return weight;
}

/**
 * Draws one stem from `candidates` (already filtered by the caller to
 * `active=1 AND deleted_at IS NULL`), weighted per §6.2. Returns null only
 * when there are no candidates at all.
 */
export function selectStem(
  candidates: readonly SelectableStem[],
  history: readonly StemUsage[],
  now: string,
  seed: number,
): SelectableStem | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const nowMs = Date.parse(now);
  const weights = candidates.map((s) => effectiveWeight(s, history, nowMs));
  const total = weights.reduce((sum, w) => sum + w, 0);

  const random = mulberry32(seed);
  let draw = random() * total;
  for (let i = 0; i < candidates.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
