import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

// `useFocusEffect` (2026-09-11 visual-test fix: home status now refreshes on
// focus, not just mount) calls `useNavigation()` under the hood, which
// throws outside a real navigation tree — this bare `render(<HomeScreen />)`
// has none. Same fix as `stems.test.tsx`: run the effect once on mount
// instead, matching what happens on a real mount-while-focused, and keep
// `useRouter`/`Link` real since index.tsx's existing usage of them already
// works fine in this environment.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

describe('HomeScreen', () => {
  it('renders the app name', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Six Endings')).toBeTruthy();
  });

  it('has one primary action and a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Start writing')).toBeTruthy();
    expect(screen.getByText('Stems')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
  });
});
