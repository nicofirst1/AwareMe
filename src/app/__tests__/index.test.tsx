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

// Same pattern as `progress.test.tsx`: a minimal repository stub so the
// sitting card's read-time count and status footer (loadHomeStatus) have
// something real to render, instead of silently catching a throw from a
// real (unopenable-in-this-env) on-device DB.
jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listSessionsForHistory: () => [{ id: 'session-1' }],
      getLastReviewAt: () => '2000-01-01T00:00:00.000Z',
      listSessionsForStats: () => [],
      getActiveStemsForTimeOfDay: () => [{ id: 'stem-1' }],
    }),
  };
});

describe('HomeScreen', () => {
  it('renders the sitting card with eyebrow, stem count, and a review row', () => {
    render(<HomeScreen />);
    // Eyebrow names whichever period is current — either is a valid render.
    expect(screen.getByText(/^(Morning|Evening) sitting$/)).toBeTruthy();
    expect(screen.getByText('1 stem ready')).toBeTruthy();
    expect(screen.getByText('1 session this week')).toBeTruthy();
    expect(screen.getByText('Review available')).toBeTruthy();
  });

  it('renders the app name', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Six Endings')).toBeTruthy();
  });

  it('has morning and evening session starts and a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Morning session')).toBeTruthy();
    expect(screen.getByText('Evening session')).toBeTruthy();
    expect(screen.getByText('Stems')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('has a tappable creator footer', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Created by Nicolò Brandizzi')).toBeTruthy();
  });
});
