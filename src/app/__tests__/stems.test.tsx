import { render, screen } from '@testing-library/react-native';

import StemsScreen from '@/app/stems';
import { LibraryStemRow } from '@/db';

// `useFocusEffect` no-ops without a real navigation tree (see
// node_modules/expo-router/build/useFocusEffect.js); run the effect once on
// mount instead, matching what happens on a real mount-while-focused.
// (`require` inside the factory, not a top-level import: jest.mock()
// factories can't close over out-of-scope variables.)
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
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
    active: 1,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
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
});
