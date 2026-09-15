import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import { DEFAULT_SETTINGS, type Settings } from '@/db';

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
// real (unopenable-in-this-env) on-device DB. `getSettings` carries the
// real §7 defaults (issue 03: loadHomeStatus and the render path both read
// the two notification times to derive the current sitting period); tests
// that need other settings reassign it and `afterEach` restores the base.
const mockRepository: {
  listSessionsForHistory: () => { id: string }[];
  getLastReviewAt: () => string | null;
  listSessionsForStats: () => { id: string }[];
  getActiveStemsForTimeOfDay: () => { id: string }[];
  getSettings?: () => Settings;
} = {
  listSessionsForHistory: () => [{ id: 'session-1' }],
  getLastReviewAt: () => '2000-01-01T00:00:00.000Z',
  listSessionsForStats: () => [],
  getActiveStemsForTimeOfDay: () => [{ id: 'stem-1' }],
  getSettings: () => DEFAULT_SETTINGS,
};

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => mockRepository,
  };
});

describe('HomeScreen', () => {
  afterEach(() => {
    mockRepository.getSettings = () => DEFAULT_SETTINGS;
  });

  it('renders the sitting card with eyebrow, stem count, and a review row', () => {
    render(<HomeScreen />);
    // Eyebrow names whichever period is current — either is a valid render.
    expect(screen.getByText(/^(Morning|Evening) sitting$/)).toBeTruthy();
    expect(screen.getByText('1 stem ready')).toBeTruthy();
    expect(screen.getByText('1 session this week')).toBeTruthy();
    expect(screen.getByText('Review available')).toBeTruthy();
  });

  it('names the sitting period from the configured notification times (midpoint rule)', () => {
    // 08:00/09:00 midpoint is 08:30; at a faked 10:00 local the old hardcoded
    // 17:00 rule would still say "Morning", the midpoint rule says "Evening".
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 15, 10, 0));
    mockRepository.getSettings = () => ({
      ...DEFAULT_SETTINGS,
      morning_notification_time: '08:00',
      evening_notification_time: '09:00',
    });
    try {
      render(<HomeScreen />);
      expect(screen.getByText('Evening sitting')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('still renders (default period rule) when settings cannot be read', () => {
    // No `getSettings` on the stub: the render path must catch the throw and
    // fall back (currentSittingPeriod(undefined, undefined)), not crash the
    // screen — and the status block is simply absent, not an error message.
    const baseGetSettings = mockRepository.getSettings;
    delete mockRepository.getSettings;
    try {
      render(<HomeScreen />);
      expect(screen.getByText(/^(Morning|Evening) sitting$/)).toBeTruthy();
      expect(screen.queryByText('1 stem ready')).toBeNull();
    } finally {
      mockRepository.getSettings = baseGetSettings;
    }
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
    expect(screen.getByText("Created by Nicolo' Brandizzi")).toBeTruthy();
  });
});
