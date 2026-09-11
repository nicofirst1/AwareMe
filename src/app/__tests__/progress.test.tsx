import { render, screen } from '@testing-library/react-native';

import ProgressScreen from '@/app/progress';
import type { BadgeSession } from '@/session/badges';

// Same pattern as `stems.test.tsx`: `useFocusEffect` no-ops without a real
// navigation tree, so run the effect once on mount instead.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

const oneSession: BadgeSession = {
  id: 'session-1',
  stemId: 'stem-1',
  category: 'awareness',
  origin: 'manual',
  targetEndings: 6,
  uncensoredMode: false,
  startedAt: '2026-09-10T12:00:00.000Z',
  endedAt: '2026-09-10T12:05:00.000Z',
  endReason: 'user_done',
  tz: 'UTC',
  offsetMin: 0,
  endings: [{ text: 'one' }, { text: 'two' }],
};

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listSessionsForStats: () => [oneSession],
      getLastReviewAt: () => null,
      listAllStems: () => [],
    }),
  };
});

describe('ProgressScreen', () => {
  it('renders the full badge grid with an earned badge and stats', () => {
    render(<ProgressScreen />);

    // Earned: at least one completed session -> "First Words".
    expect(screen.getByText('First Words')).toBeTruthy();
    // Unearned badges still render, name + criterion visible (never hidden).
    expect(screen.getByText('Fifty Endings')).toBeTruthy();
    expect(screen.getByText('Written 50 endings in total.')).toBeTruthy();
    expect(screen.getByText('Seven-Day Rhythm')).toBeTruthy();

    // Stats block.
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText('Endings')).toBeTruthy();
    expect(screen.getByText('Stems written on')).toBeTruthy();
    expect(screen.getByText('Longest streak')).toBeTruthy();
  });

  it('renders all 11 badges regardless of earned state', () => {
    render(<ProgressScreen />);
    const catalogNames = [
      'First Words',
      'Six Endings',
      'A Week of Mornings',
      'Every Corner',
      'Fifty Endings',
      'Two Hundred Endings',
      'The Long Way Round',
      'Uncensored',
      'Looking Back',
      'A Stem of Your Own',
      'Seven-Day Rhythm',
    ];
    for (const name of catalogNames) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });
});
