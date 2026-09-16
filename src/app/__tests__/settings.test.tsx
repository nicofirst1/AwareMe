import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsScreen from '@/app/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/db';
import { rescheduleNotifications } from '@/notifications/scheduler';

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
  WEEKDAY_NAMES: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSetSetting.mockClear();
    jest.mocked(rescheduleNotifications).mockClear();
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

  it('persists the evening practice toggle one key at a time and reschedules (the gate is notification-relevant)', () => {
    render(<SettingsScreen />);

    // ThemedView nesting wraps the section label in its own View — climb to
    // the ancestor that actually holds this section's chips.
    let section = screen.getByText('Evening practice').parent!;
    while (!within(section).queryByText('off')) section = section.parent!;
    fireEvent.press(within(section).getByText('off'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_practice_enabled', false);
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('offers all seven lowercase weekdays for the weekly reflection and reschedules on change', () => {
    render(<SettingsScreen />);

    for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) {
      expect(screen.getByText(day)).toBeTruthy();
    }

    fireEvent.press(screen.getByText('monday'));
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'monday');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('validates the weekly time like the existing two: invalid HH:MM rejected, valid persisted + rescheduled', () => {
    render(<SettingsScreen />);

    const input = screen.getByLabelText('Weekly notification time');
    fireEvent.changeText(input, '25:99');
    fireEvent(input, 'blur');
    expect(screen.getByText('Enter a valid time (HH:MM).')).toBeTruthy();
    expect(mockSetSetting).not.toHaveBeenCalledWith('weekly_meta_time', '25:99');

    fireEvent.changeText(input, '07:30');
    fireEvent(input, 'blur');
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_time', '07:30');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('round-trips a persisted weekly time: saved value is shown on the next mount', () => {
    const first = render(<SettingsScreen />);
    const input = screen.getByLabelText('Weekly notification time');
    fireEvent.changeText(input, '07:30');
    fireEvent(input, 'blur');
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_time', '07:30');
    first.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_time: '07:30' };
    render(<SettingsScreen />);
    expect(screen.getByLabelText('Weekly notification time').props.value).toBe('07:30');
  });

  it('exposes no program_week_override control — the library owns it (c02 contract)', () => {
    render(<SettingsScreen />);

    expect(screen.queryByText(/programme week/i)).toBeNull();
    expect(screen.queryByText(/program week/i)).toBeNull();
  });
});
