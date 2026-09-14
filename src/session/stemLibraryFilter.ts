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

  const q = filters.query.trim().toLowerCase();
  if (q && !stem.text.toLowerCase().includes(q)) return false;

  return true;
}

/**
 * A period's session (§6.2) needs at least one active stem for that
 * time-of-day, so the library refuses to deactivate the last active stem
 * rather than let a period go dead-ended. Deleted stems don't count as
 * active candidates either way.
 */
export function canDeactivateStem(stems: readonly FilterableStem[], target: FilterableStem): boolean {
  if (!target.active) return true; // already inactive; activating is always fine
  const activeCount = stems.filter((s) => s.active && s.deleted_at === null).length;
  return activeCount > 1;
}

/**
 * Same guard, generalized for the multi-select action bar's bulk
 * Deactivate (2026-09-11, selection mode): would deactivating every
 * `selectedIds` stem leave zero active, non-deleted stems? Bulk Activate
 * never needs this — activating can't reduce the active count.
 */
export function canDeactivateStems(selectedIds: readonly string[], stems: readonly (FilterableStem & { id: string })[]): boolean {
  const selected = new Set(selectedIds);
  const remainingActive = stems.filter((s) => s.active && s.deleted_at === null && !selected.has(s.id)).length;
  return remainingActive > 0;
}
