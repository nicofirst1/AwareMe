import { fireEvent, render, screen } from '@testing-library/react-native';

import HistoryScreen from '@/app/history';
import { EndingSearchResult, HistorySessionRow } from '@/db';

// `useFocusEffect` no-ops without a real navigation tree (see
// node_modules/expo-router/build/useFocusEffect.js). Mirror React
// Navigation's actual semantics — run the effect on mount AND whenever the
// callback identity changes while focused (that is what makes filter-chip
// presses refetch in the real app; `[]` here would freeze the first
// closure). (`require` inside the factory, not a top-level import:
// jest.mock() factories can't close over out-of-scope variables.)
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
  };
});

function makeSession(i: number): HistorySessionRow {
  const categories = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'];
  const day = String(i + 1).padStart(2, '0');
  return {
    id: `session-${i}`,
    stem_id: `stem-${i}`,
    stem_text_snapshot: `Session stem number ${i}`,
    category: i % 2 === 0 ? categories[i % categories.length] : null,
    origin: 'manual',
    started_at: `2026-09-${day}T08:15:00.000Z`,
    ended_at: `2026-09-${day}T08:20:00.000Z`,
    end_reason: 'user_done',
  };
}

const mockSessions = Array.from({ length: 14 }, (_, i) => makeSession(i));

const mockSearchResults: EndingSearchResult[] = [
  {
    endingId: 'ending-1',
    sessionId: 'session-3',
    ordinal: 1,
    text: 'The sentence that matches the query.',
    startedAt: '2026-09-01T08:14:00.000Z',
    stemTextSnapshot: 'Session stem number 3',
    sessionStartedAt: '2026-09-01T08:00:00.000Z',
  },
];

const mockListSessionsForHistory = jest.fn(() => mockSessions);
const mockSearchEndings = jest.fn(() => [mockSearchResults[0]]);

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listHistoryCategories: () => ['awareness', 'purpose'],
      listHistoryStems: () => [
        { id: 'stem-0', text: 'Session stem number 0' },
        { id: 'stem-1', text: 'Session stem number 1' },
      ],
      listSessionsForHistory: mockListSessionsForHistory,
      searchEndings: mockSearchEndings,
    }),
  };
});

// Built with the exact Intl expression history.tsx uses, so the assertion
// holds whatever locale the test environment runs under (audit C6).
function expectedRowDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' });
}

describe('HistoryScreen', () => {
  // Hy1 regression (layout-audit-2026-09-15): the three filter rows used to
  // render unconditionally and, with a real corpus, consumed the entire
  // viewport — the FlatList got zero height and no session row was
  // reachable by any scroll gesture. Default state must be: search +
  // collapsed filters + visible list.
  it('shows session rows above a collapsed filter wall by default', () => {
    render(<HistoryScreen />);

    expect(screen.getByLabelText('Search endings')).toBeTruthy();
    const toggle = screen.getByLabelText('Filters');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(screen.queryByText('Date range')).toBeNull();
    // Primary content reachable: several session rows render above the
    // (virtualized) fold.
    expect(screen.getAllByLabelText(/^Open session:/).length).toBeGreaterThanOrEqual(3);
  });

  it('reveals the three filter rows when the toggle is expanded and applies a chip press', () => {
    render(<HistoryScreen />);

    fireEvent.press(screen.getByLabelText('Filters'));

    expect(screen.getByText('Date range')).toBeTruthy();
    expect(screen.getByText('Category')).toBeTruthy();
    expect(screen.getByText('Stem')).toBeTruthy();
    expect(screen.getByLabelText('Filters').props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: true }),
    );

    fireEvent.press(screen.getByText('7 days'));
    // The preset reached the query (the refetch's `dateFrom`), not just the
    // chip's local state.
    expect(mockListSessionsForHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: expect.any(String) }),
    );
  });

  // Hy2 regression (LC5): the date — the list's ordering key — used to sit
  // at the end of a `' · '`-joined dim string at the card's bottom; now it
  // is its own right-column element and the category is the dim line.
  it('renders SessionRow with stem primary, dim category line, and a right-column date', () => {
    render(<HistoryScreen />);

    expect(screen.getByText('Session stem number 0')).toBeTruthy();
    expect(screen.getAllByText('awareness').length).toBeGreaterThan(0);
    expect(screen.getByText(expectedRowDate('2026-09-01T08:15:00.000Z'))).toBeTruthy();
  });

  it('replaces the list with FTS results while searching and hides the filters toggle', () => {
    render(<HistoryScreen />);

    fireEvent.changeText(screen.getByLabelText('Search endings'), 'matching');

    expect(screen.getByText('The sentence that matches the query.')).toBeTruthy();
    expect(screen.queryByLabelText('Filters')).toBeNull();
    expect(screen.queryByText('Date range')).toBeNull();
    expect(screen.queryByText('Session stem number 0')).toBeNull();
  });
});
