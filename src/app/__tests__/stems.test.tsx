import { fireEvent, render, screen } from '@testing-library/react-native';

import StemsScreen from '@/app/stems';
import { LibraryStemRow } from '@/db';

// `useFocusEffect` no-ops without a real navigation tree (see
// node_modules/expo-router/build/useFocusEffect.js); run the effect once on
// mount instead, matching what happens on a real mount-while-focused.
// (`require` inside the factory, not a top-level import: jest.mock()
// factories can't close over out-of-scope variables.)
const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

function makeStem(i: number): LibraryStemRow {
  const categories = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'];
  return {
    id: `stem-${i}`,
    text: `Stem number ${i}`,
    origin: 'seed',
    category: categories[i % categories.length],
    weight: 1,
    time_of_day: i % 2 === 0 ? 'morning' : 'evening',
    // i = 1 rests, i = 2 is soft-deleted: the fixture exercises every row
    // state (issue 03) in every test, all inside FlatList's initial window.
    active: i === 1 ? 0 : 1,
    deleted_at: i === 2 ? '2026-01-02T00:00:00.000Z' : null,
    created_at: '2026-01-01T00:00:00.000Z',
    // Weeks 1–3 cycle across the fixture so the week filter has data in
    // every rendered window row.
    weekNumber: (i % 3) + 1,
  };
}

const mockStems = Array.from({ length: 30 }, (_, i) => makeStem(i));

// v13-feedback issue 07: one test swaps the whole library for a focused
// fixture (the evening reflection meta-stem). Null = the default 30-stem list.
let mockStemsOverride: LibraryStemRow[] | null = null;

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({ listAllStems: () => mockStemsOverride ?? mockStems }),
  };
});

afterEach(() => {
  mockStemsOverride = null;
});

// v13-feedback issue 07 fixture: the seeded evening reflection meta-stem
// (c06's backfill tagged it `evening`; it is resting by seed, `origin: 'meta'`).
function makeEveningMetaStem(): LibraryStemRow {
  return {
    id: 'stem-meta-evening',
    text: 'Evening reflection stem',
    origin: 'meta',
    category: null,
    weight: 1,
    time_of_day: 'evening',
    active: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    weekNumber: null,
  };
}

describe('StemsScreen', () => {
  // Structural guard for the 375f6b3 regression: an unbounded horizontal
  // ScrollView beside a flex:1 FlatList sibling collapsed to zero height,
  // so the chip row (and neighbours) silently vanished under real data
  // volume even though nothing here throws. Assert every header sibling
  // renders alongside the list, not just the list.
  it('renders search, filters toggle, a category chip, and list rows together with many stems', () => {
    render(<StemsScreen />);

    expect(screen.getByLabelText('Search stems')).toBeTruthy();
    expect(screen.getByLabelText('More filters')).toBeTruthy();
    expect(screen.getAllByText('awareness').length).toBeGreaterThan(0);
    expect(screen.getByText(mockStems[0].text)).toBeTruthy();
  });

  // issue 02 (ADR-0005): the guided programme is a destination above the
  // flat list, not one row among the seed corpus.
  it("offers the official programme as the list's first entry", () => {
    const { getByLabelText } = render(<StemsScreen />);
    const row = getByLabelText('Official programme. Thirty weeks of guided sittings.');
    expect(row).toBeTruthy();
    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith('/week');
  });

  // Issue 03: state is visible at all times — a per-row badge plus the
  // always-visible summary line. The default State filter is 'active'
  // (pre-existing), so disabled/deleted rows surface only under another
  // State choice; the summary names them regardless (28 active + 1 disabled;
  // stem 2 is soft-deleted and counted nowhere). v13-feedback issue 07: the
  // visible word for the resting state is "Disabled" now.
  it('shows the active/disabled summary and an Active badge on every listed row', () => {
    render(<StemsScreen />);

    expect(screen.getByText('28 active · 1 disabled')).toBeTruthy();
    expect(screen.getByLabelText('Write on: Stem number 0. Active. Long-press to select.')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(5); // one badge per rendered active row
    // Disabled rows are outside the default State filter — but counted above.
    expect(screen.queryByLabelText('Write on: Stem number 1. Disabled. Long-press to select.')).toBeNull();
  });

  // Issue 03: switching the State filter surfaces disabled and soft-deleted
  // rows, still with their state on the row — 'Disabled' as a badge; a
  // soft-deleted row is neither active nor disabled (no badge, no write
  // entry point, just the dimmed 'deleted' marker, §4.1).
  it('shows Disabled and deleted rows with their state once the State filter includes them', () => {
    render(<StemsScreen />);

    fireEvent.press(screen.getByLabelText('More filters'));
    // With the default State filter ('active') no disabled badges exist, so
    // the chip is the only 'Disabled' text on screen.
    fireEvent.press(screen.getByText('Disabled'));
    expect(screen.getByLabelText('Write on: Stem number 1. Disabled. Long-press to select.')).toBeTruthy();

    // Four 'All' chips: category row, State, Origin, Time of day — the week
    // filter became a picker in v13-feedback issue 07 and carries no 'All'
    // chip. Document order makes index 1 the State row's. The length guard
    // turns any structural drift into a loud failure instead of a wrong press.
    const allChips = screen.getAllByText('All');
    expect(allChips).toHaveLength(4);
    fireEvent.press(allChips[1]);
    expect(screen.getByText('Stem number 2')).toBeTruthy(); // soft-deleted: visible for context
    expect(screen.queryByLabelText('Write on: Stem number 2. Active. Long-press to select.')).toBeNull();
    expect(screen.queryByLabelText('Write on: Stem number 2. Disabled. Long-press to select.')).toBeNull();
    expect(screen.getAllByText(/deleted/).length).toBeGreaterThan(0); // the meta marker, not a state badge
  });

  // Issue 03's week filter, rebuilt as a picker (v13-feedback issue 07):
  // selecting a week from the menu filters the list exactly as the old chip
  // row did, and the trigger names the selection.
  it('filters the list to a chosen programme week via the picker', () => {
    render(<StemsScreen />);

    fireEvent.press(screen.getByLabelText('More filters'));
    // The picker opens as a menu of All + weeks 1–30; "Week 2" is unique.
    fireEvent.press(screen.getByLabelText('Programme week: All weeks'));
    fireEvent.press(screen.getByLabelText('Week 2'));
    // Fixture weeks cycle 1,2,3: active week-2 stems in the window are
    // stems 4, 7, 10 (stem 1 is the disabled week-2 stem, hidden by the
    // default State filter); week-1/3 stems are gone.
    expect(screen.getByLabelText('Write on: Stem number 4. Active. Long-press to select.')).toBeTruthy();
    expect(screen.queryByLabelText(/Write on: Stem number 0\./)).toBeNull();
    expect(screen.queryByLabelText(/Write on: Stem number 3\./)).toBeNull();
    // The trigger reflects the selection.
    expect(screen.getByLabelText('Programme week: Week 2')).toBeTruthy();
  });

  // Issue 03: origin 'seed' surfaces as "Programme" — display only, the
  // enum value never appears as copy (cross-cycle contract: value stays
  // 'seed' in DB, exports, and tests).
  it("displays origin 'seed' as Programme on rows and in the Origin filter", () => {
    render(<StemsScreen />);

    expect(screen.queryByText(/seed/)).toBeNull();
    expect(screen.getAllByText(/Programme/).length).toBeGreaterThan(0); // row meta lines
    fireEvent.press(screen.getByLabelText('More filters'));
    expect(screen.getByText('Programme')).toBeTruthy(); // the Origin filter chip
  });

  // v13-feedback issue 07, c06 carry-forward: the library lists the two
  // evening reflection meta-stems (origin 'meta', seeded resting and
  // evening-tagged). The row must treat them honestly: a visible Reflection
  // tag (the bare 'meta' is developer vocabulary), the same state badge as
  // every row so an activation is visible, and copy that never suggests
  // activation is the only path — the reflection alternation reads these
  // rows whatever their state (listMetaStems has no active filter).
  it('treats the evening reflection meta-stem honestly: Reflection tag, state badge, state-honest copy', () => {
    mockStemsOverride = [makeEveningMetaStem()];
    render(<StemsScreen />);

    // Counted in the summary; hidden under the default 'active' State filter.
    expect(screen.getByText('0 active · 1 disabled')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('More filters'));
    // The Evening time-of-day filter matches it — but the 'active' State
    // filter still hides the resting row, so the list stays empty.
    fireEvent.press(screen.getByText('Evening'));
    expect(screen.queryByText('Evening reflection stem')).toBeNull();

    // State 'All': with no categories in this fixture there is no category
    // chip row, so the State row's 'All' is the first of three.
    const allChips = screen.getAllByText('All');
    expect(allChips).toHaveLength(3);
    fireEvent.press(allChips[0]);

    // Visible: the stem, its Reflection tag (replacing a bare 'meta'), the
    // Disabled badge any row would carry, and the caption that says state
    // is not what gates the reflection.
    expect(screen.getByText('Evening reflection stem')).toBeTruthy();
    expect(screen.getByText('Reflection')).toBeTruthy();
    expect(screen.getAllByText('Disabled').length).toBeGreaterThanOrEqual(2); // State chip + row badge
    expect(screen.getByText('Part of the evening reflection, whether Active or Disabled.')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Write on: Evening reflection stem. Disabled. Part of the evening reflection, whether Active or Disabled. Long-press to select.',
      ),
    ).toBeTruthy();
    // The developer vocabulary never leaks as copy.
    expect(screen.queryByText(/meta/)).toBeNull();
  });
});
