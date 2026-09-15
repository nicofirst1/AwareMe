import { fireEvent, render, screen } from '@testing-library/react-native';

import WriteScreen from '@/app/write';
import type { StemRow } from '@/db';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ timeOfDay: 'morning' }),
  useRouter: () => ({ back: jest.fn() }),
}));

function makeStem(id: string, text: string): StemRow {
  return { id, text, origin: 'seed', category: null, weight: 1, time_of_day: 'morning' };
}

// jest.mock()'s factory below can't close over module-scope variables unless
// they're prefixed `mock*` — see jest's hoisting rule.
const mockStemA = makeStem('stem-a', 'The thing I am avoiding right now is');
const mockStemB = makeStem('stem-b', 'What I need to admit to myself is');

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  let nextSessionId = 0;
  return {
    ...actual,
    getRepository: () => ({
      getSettings: () => ({
        endings_per_session: 1,
        timer_seconds: 90,
        review_timer_seconds: 180,
        uncensored_mode: false,
        stem_terminator: '...',
        app_lock_enabled: false,
        weekly_review_prompt: true,
        theme: 'system',
        stem_timer_enabled: false,
        stem_timer_seconds: 60,
        morning_notification_time: '08:00',
        evening_notification_time: '21:00',
      }),
      getOpenSession: () => null,
      getActiveStemsForTimeOfDay: () => [mockStemA, mockStemB],
      listAllStems: () => [mockStemA, mockStemB],
      createSession: () => `session-${++nextSessionId}`,
      recordFirstKeypress: () => {},
      autosaveEndingText: () => {},
      submitEnding: () => {},
      finalizeSession: () => {},
    }),
  };
});

describe('WriteScreen', () => {
  // W4 regression (layout-audit-2026-09-15): `session.state.endings` isn't
  // cleared until the next `start()`, so the queue-advance effect used to
  // land on the next stem's Start gate with the *previous* stem's endings
  // still stacked underneath. write.tsx now hides the stack while
  // `awaitingStart` — this drives one stem to completion and asserts the
  // next stem's gate is clean.
  it('shows a clean Start gate for the next stem — no stale endings from the previous one', async () => {
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 2/);
    await screen.findByText(/The thing I am avoiding right now is/);
    fireEvent.press(screen.getByText('Start'));

    const input = await screen.findByLabelText('Your ending');
    // 2026-09-15 owner decision (cycle 2): the countdown Save button is
    // gone — regression pin that it never reappears after Start. Submission
    // is the return key: the multiline field's trailing "\n" drives
    // `submitActive` (§6.3.4's "return key, or a Next control").
    expect(screen.queryByLabelText('Save this ending')).toBeNull();
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    await screen.findByText(/Stem 2 of 2/);
    await screen.findByText(/What I need to admit to myself is/);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText('a stray thought I keep circling back to')).toBeNull();
  });
});
