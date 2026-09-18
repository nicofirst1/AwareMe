import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import IntroScreen from '@/app/intro';
import RootLayout from '@/app/_layout';

const mockReplace = jest.fn();
const mockSetSetting = jest.fn();
const mockSetIntroComplete = jest.fn();
const mockReschedule = jest.fn().mockResolvedValue(undefined);

let mockIntroComplete = false;
let mockOnboardingComplete = false;
let mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  // The intro screen only needs useRouter; the root layout additionally
  // needs Stack/ThemeProvider as passthroughs plus the theme exports.
  Stack: ({ children }: { children: ReactNode }) => children,
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  DarkTheme: {},
  DefaultTheme: {},
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useSegments: () => mockSegments,
}));

jest.mock('@/db', () => ({
  getRepository: () => ({
    isIntroComplete: () => mockIntroComplete,
    isOnboardingComplete: () => mockOnboardingComplete,
    setSetting: (...args: unknown[]) => mockSetSetting(...args),
    setIntroComplete: () => mockSetIntroComplete(),
  }),
}));

jest.mock('@/notifications/useNotifications', () => ({
  useNotificationScheduler: () => undefined,
  useNotificationTapRouting: () => undefined,
}));

jest.mock('@/notifications/scheduler', () => ({
  rescheduleNotifications: (...args: unknown[]) => mockReschedule(...args),
}));

jest.mock('@/components/lock-screen', () => ({
  LockScreen: () => null,
}));

jest.mock('@/session/useAppLock', () => ({
  useAppLock: () => ({ checking: false, locked: false }),
}));

describe('IntroScreen', () => {
  beforeEach(() => {
    mockIntroComplete = false;
    mockOnboardingComplete = false;
    mockReplace.mockClear();
    mockSetSetting.mockClear();
    mockSetIntroComplete.mockClear();
    mockReschedule.mockClear();
  });

  it('renders the one question card with the morning path as the default selection, the opt-in, and a skip exit', () => {
    render(<IntroScreen />);

    expect(screen.getByText('Include an evening practice?')).toBeTruthy();
    // The default selection is the morning path — unconditional, never
    // clock-sensitive (owner feedback 2026-09-16).
    expect(screen.getByText('Start with the morning sitting')).toBeTruthy();
    expect(screen.getByText('Include evening practice')).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
    // Non-trap promise, on the card itself: the answer lives in Settings.
    expect(screen.getByText('Skipping keeps the evening practice on. You can change this anytime in Settings.')).toBeTruthy();
  });

  it('states the purpose of the exercise and the evening + weekly note', () => {
    render(<IntroScreen />);

    // Purpose framing (owner feedback 2026-09-16): what the exercise is
    // FOR, not merely the mechanics — factual, no outcome promises.
    expect(screen.getByText(/self-awareness/)).toBeTruthy();
    expect(screen.getByText(/self-esteem/i)).toBeTruthy();
    // The evening explanation: the original method practised morning and
    // evening, plus what this app adds beyond it.
    expect(screen.getByText(/The original method is practised morning and evening/)).toBeTruthy();
    expect(screen.getByText(/weekly reflection/)).toBeTruthy();
  });

  it('persists "include" as evening_practice_enabled, marks the intro done, reschedules, and continues to onboarding', () => {
    render(<IntroScreen />);

    fireEvent.press(screen.getByText('Include evening practice'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', true);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(mockReschedule).toHaveBeenCalledTimes(1);
    // Direct visit with onboarding still pending: exit toward onboarding.
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('defaults to the morning path even at an evening clock time (21:30 local)', () => {
    // The clock is mocked to an evening hour to pin the owner requirement:
    // the default must stay the morning path regardless of the time of
    // day. Nothing in the component reads the clock today; this fails if
    // anyone makes the default clock-sensitive later.
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(21);
    const minutesSpy = jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(30);
    try {
      render(<IntroScreen />);

      fireEvent.press(screen.getByText('Start with the morning sitting'));

      expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', false);
      expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
      expect(mockReschedule).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    } finally {
      hoursSpy.mockRestore();
      minutesSpy.mockRestore();
    }
  });

  it('routes an upgrader (onboarding already complete) home after choosing the morning path', () => {
    mockOnboardingComplete = true;
    render(<IntroScreen />);

    fireEvent.press(screen.getByText('Start with the morning sitting'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', false);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('skip persists no answer (the §7 default stands) and still never shows the intro again', () => {
    render(<IntroScreen />);

    fireEvent.press(screen.getByText('Skip for now'));

    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockReschedule).not.toHaveBeenCalled();
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('never re-asks once answered: an already-complete intro renders nothing and exits', async () => {
    mockIntroComplete = true;
    render(<IntroScreen />);

    await waitFor(() => expect(screen.queryByText('Include an evening practice?')).toBeNull());
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });
});

describe('first-run gate (RootLayout)', () => {
  beforeEach(() => {
    mockIntroComplete = false;
    mockOnboardingComplete = false;
    mockSegments = [];
    mockReplace.mockClear();
  });

  it('routes a fresh install to onboarding, which carries the evening question as tab 4', () => {
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('asks the upgrader on the standalone card (onboarding complete, question never asked)', () => {
    mockOnboardingComplete = true;
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/intro');
  });

  it('does not re-route when onboarding is already in front', () => {
    mockSegments = ['onboarding'];
    render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes to onboarding even from the intro route while onboarding is incomplete (the question lives in tab 4 now)', () => {
    mockSegments = ['intro'];
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('does not re-route when the upgrader is already on the intro card', () => {
    mockOnboardingComplete = true;
    mockSegments = ['intro'];
    render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('after the intro is answered but onboarding is not, routes to onboarding', () => {
    mockIntroComplete = true;
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('routes nothing once both first-run stages are done', () => {
    mockIntroComplete = true;
    mockOnboardingComplete = true;
    render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
