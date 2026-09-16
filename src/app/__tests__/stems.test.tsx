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

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({ listAllStems: () => mockStems }),
  };
});

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
  // (pre-existing), so resting/deleted rows surface only under another
  // State choice; the summary names them regardless (28 active + 1 resting;
  // stem 2 is soft-deleted and counted nowhere).
  it('shows the active/resting summary and an Active badge on every listed row', () => {
    render(<StemsScreen />);

    expect(screen.getByText('28 active · 1 resting')).toBeTruthy();
    expect(screen.getByLabelText('Write on: Stem number 0. Active. Long-press to select.')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(5); // one badge per rendered active row
    // Resting rows are outside the default State filter — but counted above.
    expect(screen.queryByLabelText('Write on: Stem number 1. Resting. Long-press to select.')).toBeNull();
  });

  // Issue 03: switching the State filter surfaces resting and soft-deleted
  // rows, still with their state on the row — 'Resting' as a badge; a
  // soft-deleted row is neither active nor resting (no badge, no write
  // entry point, just the dimmed 'deleted' marker, §4.1).
  it('shows Resting and deleted rows with their state once the State filter includes them', () => {
    render(<StemsScreen />);

    fireEvent.press(screen.getByLabelText('More filters'));
    // With the default State filter ('active') no resting badges exist, so
    // the chip is the only 'Resting' text on screen.
    fireEvent.press(screen.getByText('Resting'));
    expect(screen.getByLabelText('Write on: Stem number 1. Resting. Long-press to select.')).toBeTruthy();

    // Five 'All' chips now: category row, Programme week, State, Origin,
    // Time of day — document order makes index 2 the State row's. The
    // length guard turns any structural drift into a loud failure instead
    // of a wrong press.
    const allChips = screen.getAllByText('All');
    expect(allChips).toHaveLength(5);
    fireEvent.press(allChips[2]);
    expect(screen.getByText('Stem number 2')).toBeTruthy(); // soft-deleted: visible for context
    expect(screen.queryByLabelText('Write on: Stem number 2. Active. Long-press to select.')).toBeNull();
    expect(screen.queryByLabelText('Write on: Stem number 2. Resting. Long-press to select.')).toBeNull();
    expect(screen.getAllByText(/deleted/).length).toBeGreaterThan(0); // the meta marker, not a state badge
  });

  // Issue 03: the week picker reaches any programme week 1–30 from the
  // library. Filtering to Week 2 (with the default State filter) shows the
  // active week-2 stems only; the bare number chips are unique on screen
  // (no other filter uses numeric labels).
  it('filters the list to a chosen programme week', () => {
    render(<StemsScreen />);

    fireEvent.press(screen.getByLabelText('More filters'));
    fireEvent.press(screen.getByText('2'));
    // Fixture weeks cycle 1,2,3: active week-2 stems in the window are
    // stems 4, 7, 10 (stem 1 is the resting week-2 stem, hidden by the
    // default State filter); week-1/3 stems are gone.
    expect(screen.getByLabelText('Write on: Stem number 4. Active. Long-press to select.')).toBeTruthy();
    expect(screen.queryByLabelText(/Write on: Stem number 0\./)).toBeNull();
    expect(screen.queryByLabelText(/Write on: Stem number 3\./)).toBeNull();
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
});
