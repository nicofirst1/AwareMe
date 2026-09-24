import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactNode } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import OnboardingScreen from '@/app/onboarding';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
const mockSetOnboardingComplete = jest.fn();
const mockSetIntroComplete = jest.fn();
const mockSetSetting = jest.fn();
const mockRequestPermission = jest.fn();
const mockReschedule = jest.fn().mockResolvedValue(undefined);

// Same pattern as settings.test.tsx: no real navigation tree in a bare
// render, so useRouter needs a stub; `Link` renders its children inside the
// same Text the real native Link uses, forwarding accessibility props so
// role/label assertions exercise what ships (o11).
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  // p8-t2 replay: the route param `replay` comes from About's push; tests
  // point `mockParams` at { replay: '1' } to enter the read-only replay.
  useLocalSearchParams: () => mockParams,
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
  rescheduleNotifications: (...args: unknown[]) => mockReschedule(...args),
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
    mockBack.mockClear();
    mockParams = {};
    mockSetOnboardingComplete.mockClear();
    mockSetIntroComplete.mockClear();
    mockSetSetting.mockClear();
    mockReschedule.mockClear();
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
    expect(screen.getByText('Wow it works')).toBeTruthy();
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

    expect(screen.getByText(/built on the sentence completion method/)).toBeTruthy();
    expect(screen.getByText(/developed by the psychologist Nathaniel Branden/)).toBeTruthy();
    expect(screen.getByText(/larger approach aimed at increasing self-awareness/)).toBeTruthy();
    expect(screen.getByLabelText('Read more about the method')).toBeTruthy();
  });

  it('keeps the mechanics copy and adds how and why it works on tab 2', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText('Wow it works')).toBeTruthy();
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
    expect(screen.getByText('How many endings you write in one practice.')).toBeTruthy();
  });

  it('states the programme switch on the settings step in D8’s sentence (packet-7 D8, design §7.3)', () => {
    render(<OnboardingScreen />);

    // One two-sentence line, adjacent to the existing "later in Settings"
    // line — wording is D8’s decided sentence, verbatim.
    expect(screen.getByText(/The programme adds guided stems each week\./)).toBeTruthy();
    expect(screen.getByText(/You can disable the programme in Settings and pick your own stems\./)).toBeTruthy();
  });

  it('writes exactly the four flow keys on Done and never the programme key (D8 guard: the copy states the switch, the default ships it)', async () => {
    // Guard pin — green on the pre-w2-t3 tree by design (finish() never
    // wrote programme before either); it pins the contract against drift.
    mockRequestPermission.mockResolvedValue(true);
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next')); // Reminders tab
    fireEvent.press(screen.getByText('Allow reminders'));

    await waitFor(() => expect(screen.getByText('Morning reminder')).toBeTruthy());
    fireEvent.press(screen.getByText('Skip for now')); // → tab 5
    fireEvent.press(screen.getByText('Done'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    // Five writes total: the evening card's own skip write
    // ('evening_practice_enabled', false — v14 issue 05, pre-existing) plus
    // finish()'s four flow keys. D8: onboarding never writes 'programme' —
    // the day-one programme-first default is the engine's.
    expect(mockSetSetting).toHaveBeenCalledTimes(5);
    expect(mockSetSetting).not.toHaveBeenCalledWith('programme', expect.anything());
  });

  // Ticket 01 (320x640 floor, p8 t2 review): the settings page is the
  // flow's densest and its content exceeded the pager viewport at 320x640,
  // clipping Done to a ~4px sliver at the page bottom (coordinate taps
  // dead). The page must be a vertical scroll container with a
  // flexGrow-centered content container: identical centered look when the
  // content fits, scrollable when it cannot.
  it('makes the settings page a vertical scroll container so Done survives the 320x640 floor', () => {
    render(<OnboardingScreen />);

    // Walk up from Done to the page's scroll container (the first node
    // carrying contentContainerStyle; the horizontal pager has none).
    let node = screen.getByText('Done');
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    expect(node).toBeTruthy();
    // Vertical: the pager's horizontal ScrollView must not be this node.
    expect(node.props.horizontal).toBeFalsy();

    const content = StyleSheet.flatten(node.props.contentContainerStyle);
    expect(content.flexGrow).toBe(1);
    expect(content.justifyContent).toBe('center');
    expect(content.padding).toBe(Spacing.four);
  });

  it('pins the committed Reminders ask and drops the old reassurance paragraphs', () => {
    render(<OnboardingScreen />);

    // 36d1c1f copy pass; packet-3 t9: touch wording (tap, not click) and
    // the quoted label matches the actual button (sentence case).
    expect(
      screen.getByText(
        'This app can remind you of your daily practice, tap "Allow reminders" if you want to be notified.',
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

  // packet-3 t8 (C4): the footer Next/Skip pressables measured 34x44 — below
  // Android's 48dp minimum on both axes. Both bind on the shared footer style.
  it('footer Next/Skip targets clear the Android 48dp minimum on both axes', () => {
    render(<OnboardingScreen />);
    for (const name of ['Next', 'Skip']) {
      const style = StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  it('skip completes onboarding and marks the evening question asked without writing any settings', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  // ------------------------------------------------------------------
  // p8-t2: read-only replay (About's "Show introduction" row, param
  // `replay=1`). Owner-approved mechanics: the flow renders as the
  // ordinary one; the tells are ONLY the disabled controls (steppers,
  // reminder and evening asks; Done stays enabled) and the exits — Close
  // instead of Skip, and every exit returns to About, not Home. Every
  // write path is inert.

  it('replay: renders the ordinary flow with Close instead of Skip, and Close writes nothing on its way back to About', () => {
    mockParams = { replay: '1' };
    render(<OnboardingScreen />);

    // Ordinary flow: same counter, same first tab, Next still enabled.
    expect(screen.getByLabelText('Step 1 of 5')).toBeTruthy();
    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    // The standing replay line was REMOVED at the owner's review — its
    // absence is part of the approved design.
    expect(screen.queryByText(/viewing the introduction again/i)).toBeNull();
    expect(screen.queryByText(/Nothing here changes your settings/i)).toBeNull();

    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.press(screen.getByText('Close'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetOnboardingComplete).not.toHaveBeenCalled();
    expect(mockSetIntroComplete).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('replay: Done stays enabled, writes nothing, and returns to About instead of Home', () => {
    mockParams = { replay: '1' };
    render(<OnboardingScreen />);

    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(done);

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetOnboardingComplete).not.toHaveBeenCalled();
    expect(mockSetIntroComplete).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('replay: reminder and evening asks render disabled and never reach their write paths', () => {
    mockParams = { replay: '1' };
    render(<OnboardingScreen />);

    for (const name of ['Allow reminders', 'Not now', 'Include evening practice', 'Skip for now']) {
      expect(screen.getByRole('button', { name }).props.accessibilityState).toMatchObject({
        disabled: true,
      });
    }

    // Disabled on the device; the belt guards make inertness hold even
    // under a press that the test harness manages to deliver.
    fireEvent.press(screen.getByRole('button', { name: 'Allow reminders' }));
    fireEvent.press(screen.getByRole('button', { name: 'Include evening practice' }));
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockSetIntroComplete).not.toHaveBeenCalled();
  });

  it('replay: the step-5 steppers render disabled (inert controls, p8-t2)', () => {
    mockParams = { replay: '1' };
    render(<OnboardingScreen />);

    // Both steppers' buttons carry the shared component's disabled state
    // (the 0.5 step renders on the component; contract pinned there).
    expect(screen.getByLabelText('Decrease Endings per session').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByLabelText('Increase Timer (seconds)').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  // ------------------------------------------------------------------
  // p8-t2 copy pins: the approved drafts (worksheet "Agent drafts",
  // owner-approved as rendered 2026-09-24), pinned verbatim.

  it('names the daily shape on tab 1 and states the loop on tab 2 (p8-t2 approved copy)', () => {
    render(<OnboardingScreen />);

    expect(
      screen.getByText(
        /In practice it is small and daily: a few minutes in the morning to write, a moment in the evening to reread\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'A day with the app: in the morning you write your endings. In the evening you reread what you wrote and reflect on it. Once a week, one reflection pulls the week together.',
      ),
    ).toBeTruthy();
  });

  it('keeps the D8 promise verbatim and adds the picks-plus-programme sentence (p8-t2 approved copy)', () => {
    render(<OnboardingScreen />);

    // D8's two sentences stay byte-verbatim; the added sentence names how
    // the programme and the user's picks combine (the U+2019 is the
    // worksheet's curly form — copy rules forbid the straight one).
    expect(screen.getByText(/The programme adds guided stems each week\./)).toBeTruthy();
    expect(screen.getByText(/You can disable the programme in Settings and pick your own stems\./)).toBeTruthy();
    expect(
      screen.getByText(
        /While the programme is on, your morning practice is your picks plus that week’s guided stems\./,
      ),
    ).toBeTruthy();
  });

  it('names the reread in the evening ask (p8-t2 approved copy, shared card)', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText(/reread what you wrote in the morning, then reflect on your day\./)).toBeTruthy();
  });
});
