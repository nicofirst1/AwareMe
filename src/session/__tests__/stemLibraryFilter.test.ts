import { canDeactivateStems, matchesStemFilters, type FilterableStem, type StemLibraryFilters } from '../stemLibraryFilter';

const BASE: StemLibraryFilters = { query: '', activeFilter: 'active', originFilter: 'all', categoryFilter: 'all' };

function stem(overrides: Partial<FilterableStem> = {}): FilterableStem {
  return {
    text: 'If I brought more awareness',
    origin: 'seed',
    category: 'awareness',
    active: 1,
    deleted_at: null,
    time_of_day: null,
    ...overrides,
  };
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

  it('filters by time of day', () => {
    const morningFilters: StemLibraryFilters = { ...BASE, timeOfDayFilter: 'morning' };
    expect(matchesStemFilters(stem({ time_of_day: 'morning' }), morningFilters)).toBe(true);
    expect(matchesStemFilters(stem({ time_of_day: 'evening' }), morningFilters)).toBe(false);
    expect(matchesStemFilters(stem({ time_of_day: null }), morningFilters)).toBe(false);

    const noneFilters: StemLibraryFilters = { ...BASE, timeOfDayFilter: 'none' };
    expect(matchesStemFilters(stem({ time_of_day: null }), noneFilters)).toBe(true);
    expect(matchesStemFilters(stem({ time_of_day: 'morning' }), noneFilters)).toBe(false);

    const allFilters: StemLibraryFilters = { ...BASE, timeOfDayFilter: 'all' };
    expect(matchesStemFilters(stem({ time_of_day: 'evening' }), allFilters)).toBe(true);
    expect(matchesStemFilters(stem({ time_of_day: null }), allFilters)).toBe(true);
  });

  it('evening meta-stem rows (issue 06): origin=meta, active=0, time_of_day=evening — Evening matches under Resting/All, never under Active', () => {
    const eveningMeta = stem({ origin: 'meta', active: 0, time_of_day: 'evening' });
    // The library's default State is Active — the meta-stems are resting,
    // so a user must widen the State (or pick Resting) to see them.
    expect(matchesStemFilters(eveningMeta, { ...BASE, timeOfDayFilter: 'evening' })).toBe(false);
    expect(matchesStemFilters(eveningMeta, { ...BASE, activeFilter: 'archived', timeOfDayFilter: 'evening' })).toBe(true);
    expect(matchesStemFilters(eveningMeta, { ...BASE, activeFilter: 'all', timeOfDayFilter: 'evening' })).toBe(true);
    // An evening-tagged row never matches the other time-of-day filters.
    expect(matchesStemFilters(eveningMeta, { ...BASE, activeFilter: 'all', timeOfDayFilter: 'morning' })).toBe(false);
    expect(matchesStemFilters(eveningMeta, { ...BASE, activeFilter: 'all', timeOfDayFilter: 'none' })).toBe(false);
  });

  it('filters by programme week (issue 03): state-agnostic, programme stems only', () => {
    const week3: StemLibraryFilters = { ...BASE, activeFilter: 'all', weekFilter: 3 };
    // Every stem of the selected week matches, whatever its state — state
    // is the State filter's job, not the week filter's.
    expect(matchesStemFilters(stem({ weekNumber: 3 }), week3)).toBe(true);
    expect(matchesStemFilters(stem({ weekNumber: 3, active: 0 }), week3)).toBe(true);
    expect(matchesStemFilters(stem({ weekNumber: 3, deleted_at: '2026-09-01T00:00:00.000Z' }), week3)).toBe(true);
    // Other weeks, and stems outside the programme (null/undefined week), never match.
    expect(matchesStemFilters(stem({ weekNumber: 4 }), week3)).toBe(false);
    expect(matchesStemFilters(stem({ weekNumber: null }), week3)).toBe(false);
    expect(matchesStemFilters(stem(), week3)).toBe(false);

    // Default/'all' keeps every stem, week or no week.
    expect(matchesStemFilters(stem({ weekNumber: 3 }), BASE)).toBe(true);
    expect(matchesStemFilters(stem({ weekNumber: null }), BASE)).toBe(true);
    expect(matchesStemFilters(stem(), BASE)).toBe(true);
    // Under the default State filter ('active') a selected week still hides
    // its resting stems — the two filters AND together.
    expect(matchesStemFilters(stem({ weekNumber: 3, active: 0 }), { ...BASE, weekFilter: 3 })).toBe(false);
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

// w1-t3 (s2-3): the singular canDeactivateStem had zero production
// callers and is removed; its semantics are fully covered by the plural
// (the editor passes a one-element selection — same active-count math),
// whose suite below pins the at-least-one rule.
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
