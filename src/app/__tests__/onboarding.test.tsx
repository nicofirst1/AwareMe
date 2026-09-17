import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import OnboardingScreen from '@/app/onboarding';

const mockReplace = jest.fn();
const mockSetOnboardingComplete = jest.fn();
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
    setSetting: (...args: unknown[]) => mockSetSetting(...args),
  }),
}));

jest.mock('@/notifications/scheduler', () => ({
  requestNotificationPermission: (...args: unknown[]) => mockRequestPermission(...args),
  rescheduleNotifications: jest.fn().mockResolvedValue(undefined),
}));

// All four pages render inside the horizontal pager (offscreen pages stay
// mounted), so navigation via the Next button changes what's *reachable*,
// not what's mounted — navigation-dependent assertions therefore target
// controls that only exist in a given state (e.g. the permission-granted
// time fields), not page copy.
describe('OnboardingScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSetOnboardingComplete.mockClear();
    mockSetSetting.mockClear();
    mockRequestPermission.mockReset();
  });

  it('renders the first step with the step counter', () => {
    render(<OnboardingScreen />);

    expect(screen.getByText('Finish the sentence')).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('uses the shared StepperRow on the defaults step (layout audit M3/O1)', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));

    expect(screen.getByText('A few defaults')).toBeTruthy();
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

    // endings_per_session starts at 6, range 6–10 → +1 steps to 7.
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(screen.getByText('7')).toBeTruthy();
    // timer_seconds starts at 90, step 10 → −1 steps to 80.
    fireEvent.press(screen.getByLabelText('Decrease Timer (seconds)'));
    expect(screen.getByText('80')).toBeTruthy();
  });

  it('shows the eyebrow-labeled time fields after reminders are allowed', async () => {
    mockRequestPermission.mockResolvedValue(true);
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next')); // Reminders step
    fireEvent.press(screen.getByText('Allow reminders'));

    await waitFor(() => expect(screen.getByText('Morning')).toBeTruthy());
    expect(screen.getByText('Evening')).toBeTruthy();
    expect(screen.getByLabelText('Morning notification time')).toBeTruthy();
    expect(screen.getByLabelText('Evening notification time')).toBeTruthy();
  });

  it('writes the chosen defaults and completes onboarding on Done', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Done'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    expect(mockSetSetting).toHaveBeenCalledWith('endings_per_session', 6);
    expect(mockSetSetting).toHaveBeenCalledWith('timer_seconds', 90);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('skip completes onboarding without writing any settings', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledTimes(1);
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
