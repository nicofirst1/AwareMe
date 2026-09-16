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

  it('renders the one question card with the recommended include as primary and a skip exit', () => {
    render(<IntroScreen />);

    expect(screen.getByText('Include an evening practice?')).toBeTruthy();
    expect(screen.getByText('Include evening practice')).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
    // Non-trap promise, on the card itself: the answer lives in Settings.
    expect(screen.getByText('Skipping keeps the evening practice on. You can change this anytime in Settings.')).toBeTruthy();
  });

  it('persists "include" as evening_practice_enabled, marks the intro done, reschedules, and continues to onboarding', () => {
    render(<IntroScreen />);

    fireEvent.press(screen.getByText('Include evening practice'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', true);
    expect(mockSetIntroComplete).toHaveBeenCalledTimes(1);
    expect(mockReschedule).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('routes an upgrader (onboarding already complete) back home after answering', () => {
    mockOnboardingComplete = true;
    render(<IntroScreen />);

    fireEvent.press(screen.getByText('Include evening practice'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', true);
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

  it('routes to the intro before anything else when it has never been answered', () => {
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/intro');
  });

  it('asks the upgrader too (onboarding complete, intro never answered)', () => {
    mockOnboardingComplete = true;
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/intro');
  });

  it('does not re-route when the intro screen is already in front', () => {
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
