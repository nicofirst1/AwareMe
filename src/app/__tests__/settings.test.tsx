import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsScreen from '@/app/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/db';

const mockSetSetting = jest.fn();
// Reassignable per test — the screen reads settings once on mount, so the
// conditional-stem-timer test swaps this and remounts.
let mockSettings: Settings = { ...DEFAULT_SETTINGS };

jest.mock('expo-router', () => ({
  // Same pattern as about.test.tsx: no real navigation tree in a bare
  // render, so useRouter/BackHeader need a stub; `Link` renders children.
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      getSettings: () => ({ ...mockSettings }),
      setSetting: (...args: unknown[]) => mockSetSetting(...args),
      deleteAllData: jest.fn(),
    }),
  };
});

jest.mock('@/notifications/scheduler', () => ({
  cancelAllPendingNotifications: jest.fn().mockResolvedValue(undefined),
  rescheduleNotifications: jest.fn().mockResolvedValue(undefined),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSetSetting.mockClear();
  });

  it('renders the ScreenHeader title, all four group eyebrows, and the destructive block', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByText('Session')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Writing')).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByText('Delete all data')).toBeTruthy();
  });

  it('renders one-line stepper rows with their dim hints', () => {
    render(<SettingsScreen />);

    expect(screen.getByLabelText('Decrease Endings per session')).toBeTruthy();
    expect(screen.getByText('Endings you write to the same stem per session.')).toBeTruthy();
    expect(screen.getByLabelText('Increase Timer (seconds)')).toBeTruthy();
    expect(screen.getByText('How long the session runs before timing out.')).toBeTruthy();
  });

  it('persists a stepper change one key at a time via setSetting (§7 pattern)', async () => {
    render(<SettingsScreen />);

    // Default endings_per_session is 6 → Increase emits 7, clamped range 6–10.
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(mockSetSetting).toHaveBeenCalledWith('endings_per_session', 7);
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('shows the conditional per-stem stepper only when the stem timer is on', () => {
    // Off by default (§7): no per-stem stepper.
    const view = render(<SettingsScreen />);
    expect(screen.queryByLabelText('Increase Seconds per stem')).toBeNull();
    view.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, stem_timer_enabled: true };
    render(<SettingsScreen />);
    expect(screen.getByLabelText('Increase Seconds per stem')).toBeTruthy();
  });
});
