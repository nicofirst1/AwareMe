import {
  canDeactivateStems,
  groupForDefaultView,
  matchesStemFilters,
  orderForFlatView,
  type FilterableStem,
  type StemLibraryFilters,
} from '../stemLibraryFilter';

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

// w2-t4 (design §4.4): the library's default view groups the practice-first
// list out of the already-filtered rows — a VIEW, no new read path and no
// state filtering here (matchesStemFilters stays the only state gate). The
// helpers are pure so the grouped order is directly unit-testable.
//
// Corpus discipline (the round's live lesson): every fixture below is built
// row by row in this file — no expectation derives from the shipped seed
// corpus's shape, only from these rows.
describe('groupForDefaultView (w2-t4, design §4.4)', () => {
  // One row per bucket, in scrambled input order, so both the bucketing and
  // the group ORDER (morning picks → programme week → reflection → evening
  // picks) are pinned by a single expectation.
  function fixture(): FilterableStem[] {
    return [
      stem({ text: 'evening starter', time_of_day: 'evening' }), // seed, weekless → evening picks
      stem({ text: 'evening meta', origin: 'meta', time_of_day: 'evening' }), // → reflection
      stem({ text: 'week-2 block', weekNumber: 2 }), // seed, other week → NOT the effective week's group
      stem({ text: 'week-1 block', weekNumber: 1 }), // seed, effective week → programme group
      stem({ text: 'morning pick', origin: 'user', weekNumber: null }), // → morning picks
      stem({ text: 'evening pick', origin: 'user', weekNumber: null, time_of_day: 'evening' }), // → evening picks
    ];
  }

  it('groups practice-first in the design §4.4 order', () => {
    const groups = groupForDefaultView(fixture(), { programmeOn: true, effectiveWeek: 1 });
    // The week-2 block is a programme row of another week: it can't sit
    // under the "Programme · Week 1" header and must not be dropped, so it
    // trails in the 'other' bucket (headerless on screen).
    expect(groups.map((g) => g.key)).toEqual(['morning-picks', 'programme-week', 'evening-reflection', 'evening-picks', 'other']);
    expect(groups.map((g) => g.stems.map((s) => s.text))).toEqual([
      ['morning pick'],
      ['week-1 block'],
      ['evening meta'],
      ['evening starter', 'evening pick'],
      ['week-2 block'],
    ]);
  });

  it('keys the programme group to the effective week only', () => {
    const groups = groupForDefaultView(fixture(), { programmeOn: true, effectiveWeek: 2 });
    const programme = groups.find((g) => g.key === 'programme-week');
    expect(programme?.stems.map((s) => s.text)).toEqual(['week-2 block']);
  });

  it('ships no programme group while Programme is off (D3: picks-only default, mockup 07)', () => {
    const groups = groupForDefaultView(fixture(), { programmeOn: false, effectiveWeek: null });
    // No programme group — and the week-2 block still trails (no dropped
    // rows); grouping is a view, not a state filter.
    expect(groups.map((g) => g.key)).toEqual(['morning-picks', 'evening-reflection', 'evening-picks', 'other']);
  });

  it('omits the programme group when the week number is unknown even while on', () => {
    const groups = groupForDefaultView(fixture(), { programmeOn: true, effectiveWeek: null });
    expect(groups.find((g) => g.key === 'programme-week')).toBeUndefined();
  });

  it('never puts a weekless seed row (a starter) in the programme group (s1-F10)', () => {
    const groups = groupForDefaultView(fixture(), { programmeOn: true, effectiveWeek: 1 });
    const programmeTexts = groups.find((g) => g.key === 'programme-week')?.stems.map((s) => s.text) ?? [];
    expect(programmeTexts).not.toContain('evening starter');
  });

  it('groups by identity only: inactive and deleted rows bucket like active ones (state is matchesStemFilters\'s job)', () => {
    const rows = [
      stem({ text: 'resting pick', origin: 'user', weekNumber: null, active: 0 }),
      stem({ text: 'deleted block', weekNumber: 1, deleted_at: '2026-09-01T00:00:00.000Z' }),
    ];
    const groups = groupForDefaultView(rows, { programmeOn: true, effectiveWeek: 1 });
    expect(groups.find((g) => g.key === 'morning-picks')?.stems.map((s) => s.text)).toEqual(['resting pick']);
    expect(groups.find((g) => g.key === 'programme-week')?.stems.map((s) => s.text)).toEqual(['deleted block']);
  });

  it('keeps the input order stable inside a group', () => {
    const rows = [
      stem({ text: 'week-1 b', weekNumber: 1, time_of_day: 'morning' }),
      stem({ text: 'week-1 a', weekNumber: 1, time_of_day: 'morning' }),
      stem({ text: 'week-1 c', weekNumber: 1, time_of_day: 'morning' }),
    ];
    const groups = groupForDefaultView(rows, { programmeOn: true, effectiveWeek: 1 });
    expect(groups.find((g) => g.key === 'programme-week')?.stems.map((s) => s.text)).toEqual([
      'week-1 b',
      'week-1 a',
      'week-1 c',
    ]);
  });

  it('buckets an unclassifiable row (seed, weekless, untagged) into its own trailing group', () => {
    const rows = [stem({ text: 'pre-backfill seed edge' })];
    const groups = groupForDefaultView(rows, { programmeOn: true, effectiveWeek: 1 });
    expect(groups.map((g) => g.key)).toEqual(['other']);
    expect(groups[0].stems.map((s) => s.text)).toEqual(['pre-backfill seed edge']);
  });
});

// w2-t4 (design §4.4): any non-default filter/query flattens the list to one
// stable, learnable order — morning picks → programme → evening picks →
// reflection, then anything unclassifiable. Same identity-only discipline:
// no state filtering here.
describe('orderForFlatView (w2-t4, design §4.4)', () => {
  it('orders morning picks, programme, evening picks, reflection, then other', () => {
    const rows = [
      stem({ text: 'evening pick', origin: 'user', weekNumber: null, time_of_day: 'evening' }),
      stem({ text: 'week-3 block', weekNumber: 3 }),
      stem({ text: 'evening meta', origin: 'meta', time_of_day: 'evening' }),
      stem({ text: 'morning pick', origin: 'user', weekNumber: null }),
      stem({ text: 'pre-backfill edge' }),
    ];
    expect(orderForFlatView(rows).map((s) => s.text)).toEqual([
      'morning pick',
      'week-3 block',
      'evening pick',
      'evening meta',
      'pre-backfill edge',
    ]);
  });

  it('is a stable partition: input order survives inside each bucket', () => {
    const rows = [
      stem({ text: 'block b', weekNumber: 1 }),
      stem({ text: 'block a', weekNumber: 2 }),
      stem({ text: 'block c', weekNumber: 1 }),
    ];
    expect(orderForFlatView(rows).map((s) => s.text)).toEqual(['block b', 'block a', 'block c']);
  });

  it('keeps every week\'s programme rows in the flat browsing order (not just the effective week)', () => {
    const rows = [stem({ text: 'week-30 block', weekNumber: 30 })];
    expect(orderForFlatView(rows).map((s) => s.text)).toEqual(['week-30 block']);
  });
});
