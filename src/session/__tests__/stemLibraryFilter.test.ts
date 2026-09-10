import { matchesStemFilters, type FilterableStem, type StemLibraryFilters } from '../stemLibraryFilter';

const BASE: StemLibraryFilters = { query: '', activeFilter: 'active', originFilter: 'all', categoryFilter: 'all' };

function stem(overrides: Partial<FilterableStem> = {}): FilterableStem {
  return { text: 'If I brought more awareness', origin: 'seed', category: 'awareness', active: 1, deleted_at: null, ...overrides };
}

describe('matchesStemFilters', () => {
  it('active filter: excludes archived and deleted', () => {
    expect(matchesStemFilters(stem(), BASE)).toBe(true);
    expect(matchesStemFilters(stem({ active: 0 }), BASE)).toBe(false);
    expect(matchesStemFilters(stem({ deleted_at: '2026-09-01T00:00:00.000Z' }), BASE)).toBe(false);
  });

  it('archived filter: only active=0, not deleted', () => {
    const filters: StemLibraryFilters = { ...BASE, activeFilter: 'archived' };
    expect(matchesStemFilters(stem({ active: 0 }), filters)).toBe(true);
    expect(matchesStemFilters(stem({ active: 1 }), filters)).toBe(false);
    expect(matchesStemFilters(stem({ active: 0, deleted_at: '2026-09-01T00:00:00.000Z' }), filters)).toBe(false);
  });

  it('all filter: shows active, archived, and deleted', () => {
    const filters: StemLibraryFilters = { ...BASE, activeFilter: 'all' };
    expect(matchesStemFilters(stem(), filters)).toBe(true);
    expect(matchesStemFilters(stem({ active: 0 }), filters)).toBe(true);
    expect(matchesStemFilters(stem({ deleted_at: '2026-09-01T00:00:00.000Z' }), filters)).toBe(true);
  });

  it('filters by origin', () => {
    const filters: StemLibraryFilters = { ...BASE, originFilter: 'user' };
    expect(matchesStemFilters(stem({ origin: 'user' }), filters)).toBe(true);
    expect(matchesStemFilters(stem({ origin: 'seed' }), filters)).toBe(false);
  });

  it('filters by category', () => {
    const filters: StemLibraryFilters = { ...BASE, categoryFilter: 'purpose' };
    expect(matchesStemFilters(stem({ category: 'purpose' }), filters)).toBe(true);
    expect(matchesStemFilters(stem({ category: 'awareness' }), filters)).toBe(false);
    expect(matchesStemFilters(stem({ category: null }), filters)).toBe(false);
  });

  it('searches text case-insensitively', () => {
    const filters: StemLibraryFilters = { ...BASE, query: 'AWARENESS' };
    expect(matchesStemFilters(stem({ text: 'more awareness' }), filters)).toBe(true);
    expect(matchesStemFilters(stem({ text: 'something else' }), filters)).toBe(false);
  });

  it('combines all filters with AND', () => {
    const filters: StemLibraryFilters = { query: 'promise', activeFilter: 'all', originFilter: 'user', categoryFilter: 'integrity' };
    expect(
      matchesStemFilters(stem({ text: 'A promise I made', origin: 'user', category: 'integrity', active: 0 }), filters),
    ).toBe(true);
    expect(
      matchesStemFilters(stem({ text: 'A promise I made', origin: 'seed', category: 'integrity', active: 0 }), filters),
    ).toBe(false);
  });
});
