/**
 * Pure filter predicate for the stem library (§6.6): state (active/
 * archived/all), origin, category, and a text search, combined. Kept out of
 * the screen component so the filter logic is directly unit-testable.
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
  // the State filter's job). Stems outside the programme (null/undefined
  // week) never match a week number.
  const weekFilter = filters.weekFilter ?? 'all';
  if (weekFilter !== 'all' && stem.weekNumber !== weekFilter) return false;

  const q = filters.query.trim().toLowerCase();
  if (q && !stem.text.toLowerCase().includes(q)) return false;

  return true;
}

/**
 * The at-least-one-active guard (§6.2): the practice needs at least one
 * active stem, so deactivation is refused when it would leave zero active,
 * non-deleted stems, rather than let the practice go dead-ended. Deleted
 * stems don't count as active candidates either way. Serves the multi-
 * select action bar's bulk Deactivate (2026-09-11, selection mode) AND the
 * editor's single-stem Archive (w1-t3, s2-3: the editor previously wrote
 * setStemActive unguarded). Bulk Activate never needs this — activating
 * can't reduce the active count.
 */
export function canDeactivateStems(selectedIds: readonly string[], stems: readonly (FilterableStem & { id: string })[]): boolean {
  const selected = new Set(selectedIds);
  const remainingActive = stems.filter((s) => s.active && s.deleted_at === null && !selected.has(s.id)).length;
  return remainingActive > 0;
}
