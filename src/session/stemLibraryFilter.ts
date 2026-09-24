/**
 * Pure filter predicate for the stem library (§6.6): state (active/
 * archived/all), origin, category, and a text search, combined. Kept out of
 * the screen component so the filter logic is directly unit-testable.
 *
 * p8 (grouping port): the predicate is UNCHANGED — bodies are byte-stable.
 * The UI's State filter row left the sheet (the Active/Disabled grouping
 * owns that axis), so the screen always passes 'all'; 'active'/'archived'
 * remain valid values for the module's other consumers and tests.
 */
export interface FilterableStem {
  text: string;
  origin: string;
  category: string | null;
  active: number; // 0/1
  deleted_at: string | null;
  /** Morning/evening pivot (migration 0003): null for an untagged stem — matched by the 'all' filter only, never by 'morning'/'evening'. */
  time_of_day: string | null;
  /** Programme week (migration 0004): 1–30 for seed programme stems, null otherwise. Optional so pre-0004 call sites/tests stay valid; a null/undefined week matches only the 'all' filter. */
  weekNumber?: number | null;
}

export type ActiveFilter = 'active' | 'archived' | 'all';

/** 'all' | 'morning' | 'evening' | 'none' (untagged — `time_of_day IS NULL`). */
export type TimeOfDayFilter = 'all' | 'morning' | 'evening' | 'none';

export interface StemLibraryFilters {
  query: string;
  activeFilter: ActiveFilter;
  originFilter: string; // 'all' | a specific origin
  categoryFilter: string; // 'all' | a specific category
  timeOfDayFilter?: TimeOfDayFilter; // defaults to 'all'
  /** Issue 03's week filter: 'all' | a programme week 1–30 (defaults to 'all'). */
  weekFilter?: 'all' | number;
}

export function matchesStemFilters(stem: FilterableStem, filters: StemLibraryFilters): boolean {
  const isDeleted = stem.deleted_at !== null;

  if (filters.activeFilter === 'active' && (!stem.active || isDeleted)) return false;
  if (filters.activeFilter === 'archived' && (stem.active || isDeleted)) return false;
  // 'all' shows everything, including soft-deleted — visible, not hidden.

  if (filters.originFilter !== 'all' && stem.origin !== filters.originFilter) return false;
  if (filters.categoryFilter !== 'all' && stem.category !== filters.categoryFilter) return false;

  const timeOfDayFilter = filters.timeOfDayFilter ?? 'all';
  if (timeOfDayFilter === 'none' && stem.time_of_day !== null) return false;
  if ((timeOfDayFilter === 'morning' || timeOfDayFilter === 'evening') && stem.time_of_day !== timeOfDayFilter) {
    return false;
  }

  // Issue 03's week filter: a selected week shows every stem of that
  // programme block — active, resting, and soft-deleted alike (state is
  // the grouping's job on screen since p8; the UI's default is 'all').
  // Stems outside the programme (null/undefined week) never match a week
  // number.
  const weekFilter = filters.weekFilter ?? 'all';
  if (weekFilter !== 'all' && stem.weekNumber !== weekFilter) return false;

  const q = filters.query.trim().toLowerCase();
  if (q && !stem.text.toLowerCase().includes(q)) return false;

  return true;
}

// w2-t4 (design §4.4) + p8: the practice-bucket taxonomy. Its screen
// render was superseded by the Active/Disabled grouping (p8), but the
// buckets survive as IDENTITY: `groupForDefaultView` is the practice
// card's counting engine ("Morning N"/"Evening N" over the active rows)
// and `orderForFlatView` is the Active group's inner order. Grouping is a
// VIEW: a pure partition by identity axes only (origin, time of day,
// programme week) — no state filtering here (matchesStemFilters stays the
// only state gate) and no new read path (the screen feeds in its current
// filter result).
export type LibraryGroupKey = 'morning-picks' | 'programme-week' | 'evening-reflection' | 'evening-picks' | 'other';

export interface LibraryGroup<T> {
  key: LibraryGroupKey;
  stems: T[];
}

export interface DefaultViewOptions {
  /** D1's ONE binary Programme setting. Off = picks-only grouping (D3). */
  programmeOn: boolean;
  /** The effective programme week (readProgrammeWeek's currentWeek) while on; null when off or unknown. */
  effectiveWeek: number | null;
}

function isMorningPickRow(s: FilterableStem): boolean {
  return (s.origin === 'user' || s.origin === 'imported') && s.time_of_day !== 'evening';
}

/** Which practice bucket one library row belongs to, by identity alone. */
function bucketOf(s: FilterableStem, options: DefaultViewOptions): LibraryGroupKey {
  if (s.origin === 'meta') return 'evening-reflection';
  if (s.origin === 'seed' && s.weekNumber != null) {
    return options.programmeOn && s.weekNumber === options.effectiveWeek ? 'programme-week' : 'other';
  }
  if (s.time_of_day === 'evening') return 'evening-picks';
  if (isMorningPickRow(s)) return 'morning-picks';
  return 'other';
}

// The flat order's bucket rule (unchanged): same identity axes, but every
// programme row buckets together — the sequence the Active group renders
// in, and the p7 flat list's order before it.
function flatBucketOf(s: FilterableStem): LibraryGroupKey {
  if (s.origin === 'meta') return 'evening-reflection';
  if (s.origin === 'seed' && s.weekNumber != null) return 'programme-week';
  if (s.time_of_day === 'evening') return 'evening-picks';
  if (isMorningPickRow(s)) return 'morning-picks';
  return 'other';
}

const GROUP_ORDER: LibraryGroupKey[] = ['morning-picks', 'programme-week', 'evening-reflection', 'evening-picks', 'other'];

// The flat order (s2-1 resolution, unchanged as a sequence): evening picks
// come before the reflection — the design's sequence "morning picks →
// Programme → evening picks → reflection". 'other' trails so no row is
// ever dropped. Since p8 this order lives INSIDE the Active group; the
// Disabled group keeps corpus order.
const FLAT_ORDER: LibraryGroupKey[] = ['morning-picks', 'programme-week', 'evening-picks', 'evening-reflection', 'other'];

/**
 * The practice-bucket groups over the rows the caller passes in, in the
 * design §4.4 order. Since p8 this is the practice CARD's counting engine
 * (the screen feeds it the active, non-deleted rows); the helper itself
 * never filters. The programme group exists only while Programme is on AND
 * the effective week is known; weekless seed rows (the starters) are
 * evening/pick material, never programme-block rows (s1-F10's root fix),
 * and anything unclassifiable trails in 'other' so no row is ever dropped.
 */
export function groupForDefaultView<T extends FilterableStem>(stems: readonly T[], options: DefaultViewOptions): LibraryGroup<T>[] {
  const buckets = new Map<LibraryGroupKey, T[]>();
  for (const stem of stems) {
    const key = bucketOf(stem, options);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(stem);
    else buckets.set(key, [stem]);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({ key, stems: buckets.get(key)! }));
}

/**
 * The stable, learnable order (s2-1): morning picks → programme rows →
 * evening picks → reflection, then anything unclassifiable. Since p8 this
 * orders the Active group's rows INSIDE the two-group render (the screen
 * no longer flattens the grouping under filters). A stable partition of
 * the caller's rows — input order survives inside each bucket.
 */
export function orderForFlatView<T extends FilterableStem>(stems: readonly T[]): T[] {
  const flat: T[] = [];
  for (const key of FLAT_ORDER) {
    for (const stem of stems) {
      if (flatBucketOf(stem) === key) flat.push(stem);
    }
  }
  return flat;
}

/**
 * The at-least-one-active guard (§6.2): the practice needs at least one
 * active stem, so deactivation is refused when it would leave zero active,
 * non-deleted stems, rather than let the practice go dead-ended. Deleted
 * stems don't count as active candidates either way. Serves the multi-
 * select action bar's bulk Deactivate (2026-09-11, selection mode) AND the
 * editor's single-stem Archive (w1-t3, s2-3: the editor previously wrote
 * setStemActive unguarded). Bulk Activate never needs this — activating
 * can't reduce the active count. Scope unchanged through the w2-t4 rebuild
 * (D5, hub contract 1): both call sites keep the exact shape.
 */
export function canDeactivateStems(selectedIds: readonly string[], stems: readonly (FilterableStem & { id: string })[]): boolean {
  const selected = new Set(selectedIds);
  const remainingActive = stems.filter((s) => s.active && s.deleted_at === null && !selected.has(s.id)).length;
  return remainingActive > 0;
}
