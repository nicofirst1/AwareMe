import { canDeactivateStem, canDeactivateStems, matchesStemFilters, type FilterableStem, type StemLibraryFilters } from '../stemLibraryFilter';

const BASE: StemLibraryFilters = { query: '', activeFilter: 'active', originFilter: 'all', categoryFilter: 'all' };

function stem(overrides: Partial<FilterableStem> = {}): FilterableStem {
  return { text: 'If I brought more awareness', origin: 'seed', category: 'awareness', active: 1, deleted_at: null, ...overrides };
}

function idStem(id: string, overrides: Partial<FilterableStem> = {}): FilterableStem & { id: string } {
  return { id, ...stem(overrides) };
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

describe('canDeactivateStem', () => {
  it('allows deactivating when more than one active stem remains', () => {
    const stems = [stem({ active: 1 }), stem({ active: 1 })];
    expect(canDeactivateStem(stems, stems[0])).toBe(true);
  });

  it('refuses to deactivate the last active stem', () => {
    const stems = [stem({ active: 1 }), stem({ active: 0 })];
    expect(canDeactivateStem(stems, stems[0])).toBe(false);
  });

  it('deleted stems do not count toward the active total', () => {
    const stems = [stem({ active: 1 }), stem({ active: 1, deleted_at: '2026-09-01T00:00:00.000Z' })];
    expect(canDeactivateStem(stems, stems[0])).toBe(false);
  });

  it('always allows activating (target is already inactive)', () => {
    const stems = [stem({ active: 0 })];
    expect(canDeactivateStem(stems, stems[0])).toBe(true);
  });
});

describe('canDeactivateStems', () => {
  it('allows bulk deactivate when an active stem remains outside the selection', () => {
    const stems = [idStem('a', { active: 1 }), idStem('b', { active: 1 }), idStem('c', { active: 1 })];
    expect(canDeactivateStems(['a', 'b'], stems)).toBe(true);
  });

  it('refuses bulk deactivate that would leave zero active stems', () => {
    const stems = [idStem('a', { active: 1 }), idStem('b', { active: 1 })];
    expect(canDeactivateStems(['a', 'b'], stems)).toBe(false);
  });

  it('refuses when the only other active stems are also selected, even mixed with inactive/deleted', () => {
    const stems = [
      idStem('a', { active: 1 }),
      idStem('b', { active: 0 }),
      idStem('c', { active: 1, deleted_at: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(canDeactivateStems(['a'], stems)).toBe(false);
  });

  it('allows an empty selection (no-op)', () => {
    const stems = [idStem('a', { active: 1 })];
    expect(canDeactivateStems([], stems)).toBe(true);
  });
});
