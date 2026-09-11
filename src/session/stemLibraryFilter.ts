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
}

export type ActiveFilter = 'active' | 'archived' | 'all';

export interface StemLibraryFilters {
  query: string;
  activeFilter: ActiveFilter;
  originFilter: string; // 'all' | a specific origin
  categoryFilter: string; // 'all' | a specific category
}

export function matchesStemFilters(stem: FilterableStem, filters: StemLibraryFilters): boolean {
  const isDeleted = stem.deleted_at !== null;

  if (filters.activeFilter === 'active' && (!stem.active || isDeleted)) return false;
  if (filters.activeFilter === 'archived' && (stem.active || isDeleted)) return false;
  // 'all' shows everything, including soft-deleted — visible, not hidden.

  if (filters.originFilter !== 'all' && stem.origin !== filters.originFilter) return false;
  if (filters.categoryFilter !== 'all' && stem.category !== filters.categoryFilter) return false;

  const q = filters.query.trim().toLowerCase();
  if (q && !stem.text.toLowerCase().includes(q)) return false;

  return true;
}

/**
 * `selectStem` (§6.2) returns null on zero active candidates, and "start
 * now" then silently does nothing — so the library refuses to deactivate
 * the last active stem rather than let the app go dead-ended. Deleted stems
 * don't count as active candidates either way.
 */
export function canDeactivateStem(stems: readonly FilterableStem[], target: FilterableStem): boolean {
  if (!target.active) return true; // already inactive; activating is always fine
  const activeCount = stems.filter((s) => s.active && s.deleted_at === null).length;
  return activeCount > 1;
}
