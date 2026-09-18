import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import OnboardingScreen from '@/app/onboarding';

const mockReplace = jest.fn();
const mockSetOnboardingComplete = jest.fn();
const mockSetIntroComplete = jest.fn();
const mockSetSetting = jest.fn();
const mockRequestPermission = jest.fn();

// Same pattern as settings.test.tsx: no real navigation tree in a bare
// render, so useRouter needs a stub; `Link` renders its children inside the
// same Text the real native Link uses, forwarding accessibility props so
// role/label assertions exercise what ships (o11).
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  Link: (props: { children: ReactNode } & Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createElement } = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    const { children, ...rest } = props;
    return createElement(Text, rest, children);
  },
}));

jest.mock('@/db', () => ({
  getRepository: () => ({
    setOnboardingComplete: (...args: unknown[]) => mockSetOnboardingComplete(...args),
    setIntroComplete: (...args: unknown[]) => mockSetIntroComplete(...args),
    setSetting: (...args: unknown[]) => mockSetSetting(...args),
  }),
}));

jest.mock('@/notifications/scheduler', () => ({
  requestNotificationPermission: (...args: unknown[]) => mockRequestPermission(...args),
  rescheduleNotifications: jest.fn().mockResolvedValue(undefined),
}));

// Native time pickers, mocked at the module boundary (same pattern as
// settings.test.tsx): the mock renders the picker's props onto a View so
// tests can read `value` and fire `onChange` exactly as the native iOS
// component would deliver them.
jest.mock('@react-native-community/datetimepicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const MockPicker = (props: Record<string, unknown>) => createElement(View, props);
  return {
    __esModule: true,
    default: MockPicker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});

/** The date the picker mock should emit for a given 24h "HH:MM" time. */
function pickerDate(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(2026, 8, 16, hours ?? 0, minutes ?? 0);
}

// All five pages render inside the horizontal pager (offscreen pages stay
// mounted), so navigation via the Next button changes what's *reachable*,
// not what's mounted — navigation-dependent assertions therefore target
// controls that only exist in a given state (e.g. the permission-granted
// time fields), or the step counter, not page copy alone.
describe('OnboardingScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSetOnboardingComplete.mockClear();
    mockSetIntroComplete.mockClear();
    mockSetSetting.mockClear();
    mockRequestPermission.mockReset();
  });

  it('renders the method tab first with the step counter', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 5')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('presents all five tabs with the evening question fourth, in the owner’s order', () => {
    render(<OnboardingScreen />);

    // Every tab's title is mounted (the pager keeps offscreen pages), and
    // the visual order is pinned by the step sequence asserted below.
    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByText('Here is how it works!')).toBeTruthy();
    expect(screen.getByText('Reminders')).toBeTruthy();
    expect(screen.getByText('Include an evening practice?')).toBeTruthy();
    expect(screen.getByText('Choose your settings')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Step 2 of 5')).toBeTruthy();
    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Step 3 of 5')).toBeTruthy();
    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Step 4 of 5')).toBeTruthy();
    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Step 5 of 5')).toBeTruthy();
  });

  it('states the Branden method and the larger self-awareness approach on tab 1', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText(/built on the Branden method/)).toBeTruthy();
    expect(screen.getByText(/larger approach aimed at increasing self-awareness/)).toBeTruthy();
    expect(screen.getByLabelText('Read more about the method')).toBeTruthy();
  });

  it('keeps the mechanics copy and adds how and why it works on tab 2', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText('Here is how it works!')).toBeTruthy();
    expect(screen.getByText(/finish it, several times, quickly/)).toBeTruthy();
    // v14 issue 03: the semicolon sentence split into two, and the quickness
    // paragraph broken into short sentences without losing the meaning.
    expect(screen.getByText(/Repetition or nonsense is fine\. That’s part of how it works\./)).toBeTruthy();
    expect(screen.getByText(/The quickness is the point\. Endings written before you can polish them/)).toBeTruthy();
    expect(screen.getByText(/how you actually respond/)).toBeTruthy();
    expect(screen.getByText(/The value is in the pattern across many endings, not in any single one\./)).toBeTruthy();
    expect(screen.queryByText(/is fine; that’s part/)).toBeNull();
  });

  it('makes Allow reminders unmistakably a button, with Not now as the quiet alternative', () => {
    render(<OnboardingScreen />);

    // v14 issue 04: the default secondary fill read as body text. Primary is
    // the flow's one-action styling; the flatten pattern is button.test.tsx's.
    const allow = StyleSheet.flatten(screen.getByRole('button', { name: 'Allow reminders' }).props.style);
    // Scheme is 'unspecified' in tests → light fallback (use-theme.ts).
    expect(allow.backgroundColor).toBe(Colors.light.accent);

    const notNow = StyleSheet.flatten(screen.getByRole('button', { name: 'Not now' }).props.style);
    expect(notNow.backgroundColor).toBe('transparent');
    expect(notNow.borderWidth).toBeUndefined();

    // The hint states what allowing does (and what declining costs: nothing).
    expect(screen.getByText(/Allowing lets the app send those two daily nudges/)).toBeTruthy();
  });

  it('explains the endings-per-session setting in one plain line', () => {
    render(<OnboardingScreen />);

    // v14 issue 06: the stepper label names a number, not a meaning; the
    // hint carries the meaning (settings.tsx's Hint pattern, LC3 anatomy).
    expect(screen.getByText('How many endings you write in one sitting.')).toBeTruthy();
  });

  it('ends the Reminders copy at "end of day" and drops the old reassurance paragraphs', () => {
    render(<OnboardingScreen />);

    expect(
      screen.getByText(
        'This app can nudge you twice a day, at a morning and an evening time you choose: the book’s own suggestion is start and end of day.',
      ),
    ).toBeTruthy();
    // Owner feedback 2026-09-17: the notification-privacy sentence and the
    // "Say no and…" paragraph are gone from the fresh flow.
    expect(screen.queryByText(/lock screen/)).toBeNull();
    expect(screen.queryByText(/Say no and/)).toBeNull();
  });

  it('uses the shared StepperRow on the settings tab', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));

    // The shared component's a11y labels — the same anatomy settings uses.
    expect(screen.getByLabelText('Decrease Endings per session')).toBeTruthy();
    expect(screen.getByLabelText('Increase Endings per session')).toBeTruthy();
    expect(screen.getByLabelText('Decrease Timer (seconds)')).toBeTruthy();
    expect(screen.getByLabelText('Increase Timer (seconds)')).toBeTruthy();
  });

  it('steps values through the shared StepperRow with clamping semantics', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));

    // endings_per_session starts at 7 (issue 03), range 6–10 → +1 steps to 8.
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(screen.getByText('8')).toBeTruthy();
    // timer_seconds starts at 90, step 10 → −1 steps to 80.
    fireEvent.press(screen.getByLabelText('Decrease Timer (seconds)'));
    expect(screen.getByText('80')).toBeTruthy();
  });

  it('asks the evening question on tab 4; the no-answer exit pins the morning default and advances', () => {
    render(<OnboardingScreen />);

    // v14 issue 05: exactly two options — "Skip for now" is the no-answer
    // exit and persists the morning default (false).
    fireEvent.press(screen.getByText('Skip for now'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', false);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Step 5 of 5')).toBeTruthy();
  });

  it('records the evening opt-in the same way', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Include evening practice'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', true);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Step 5 of 5')).toBeTruthy();
  });

  it('shows the native time fields after reminders are allowed', async () => {
    mockRequestPermission.mockResolvedValue(true);
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next')); // Reminders tab
    fireEvent.press(screen.getByText('Allow reminders'));

    await waitFor(() => expect(screen.getByText('Morning reminder')).toBeTruthy());
    expect(screen.getByText('Evening reminder')).toBeTruthy();
    expect(screen.getByLabelText('Morning notification time')).toBeTruthy();
    expect(screen.getByLabelText('Evening notification time')).toBeTruthy();
  });

  it('keeps a picker-confirmed time and writes it on Done', async () => {
    mockRequestPermission.mockResolvedValue(true);
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next')); // Reminders tab
    fireEvent.press(screen.getByText('Allow reminders'));

    await waitFor(() => expect(screen.getByText('Morning reminder')).toBeTruthy());
    fireEvent(screen.getByLabelText('Morning notification time'), 'onChange', { type: 'set' }, pickerDate('09:05'));
    fireEvent.press(screen.getByText('Skip for now')); // → tab 5
    fireEvent.press(screen.getByText('Done'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    // The evening answer marks the question asked, and the exit marks it
    // again (idempotent upsert; every exit marks it, per the once-rule).
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(2);
    expect(mockSetSetting).toHaveBeenCalledWith('morning_notification_time', '09:05');
    expect(mockSetSetting).toHaveBeenCalledWith('endings_per_session', 7);
    expect(mockSetSetting).toHaveBeenCalledWith('timer_seconds', 90);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('a picker dismissal never reaches storage: the row keeps its value', async () => {
    mockRequestPermission.mockResolvedValue(true);
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next')); // Reminders tab
    fireEvent.press(screen.getByText('Allow reminders'));

    await waitFor(() => expect(screen.getByText('Morning reminder')).toBeTruthy());
    fireEvent(screen.getByLabelText('Evening notification time'), 'onChange', { type: 'dismissed' }, undefined);
    fireEvent.press(screen.getByText('Done'));

    // A dismissal carries no date; the evening row writes its untouched
    // default, never a derived value from the dismissed event.
    expect(mockSetSetting).toHaveBeenCalledWith('evening_notification_time', '21:00');
  });

  it('skip completes onboarding and marks the evening question asked without writing any settings', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
