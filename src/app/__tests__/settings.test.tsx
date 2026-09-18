import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsScreen from '@/app/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/db';
import { rescheduleNotifications } from '@/notifications/scheduler';
import { resyncThemePreference } from '@/theme/themePreference';

const mockSetSetting = jest.fn();
// Reassignable per test — the screen reads settings once on mount, so the
// conditional-stem-timer test swaps this and remounts.
let mockSettings: Settings = { ...DEFAULT_SETTINGS };

jest.mock('expo-router', () => ({
  // Same pattern as about.test.tsx: no real navigation tree in a bare
  // render, so useRouter/BackHeader need a stub; `Link` renders its
  // children inside the same Text the real native Link uses, forwarding
  // accessibility props so the o11 role/label assertions exercise what
  // ships.
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  Link: (props: { children: ReactNode } & Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createElement } = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    const { children, ...rest } = props;
    return createElement(Text, rest, children);
  },
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

// Native time pickers, mocked at the module boundary (issue 05): the mock
// renders the picker's props onto a View so tests can read `value` and fire
// `onChange` exactly as the native component would deliver them. The real
// iOS compact picker is a system-rendered button; passing accessibilityLabel
// through is what the screen relies on for its labels.
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

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSetSetting.mockClear();
    jest.mocked(rescheduleNotifications).mockClear();
    // The theme preference store is module-level: re-mirror the (fresh)
    // mocked settings table so each test starts from a known state.
    resyncThemePreference();
  });

  it('renders the ScreenHeader title, all five group eyebrows, and the destructive block', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByText('Session')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Writing')).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('About the method')).toBeTruthy();
    // o11 layout/a11y cycle: the nav link carries the link role + label.
    expect(screen.getByRole('link', { name: 'About the method' })).toBeTruthy();
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

    // Default endings_per_session is 7 (issue 03 owner feedback) → Increase
    // emits 8, clamped range 6–10.
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(mockSetSetting).toHaveBeenCalledWith('endings_per_session', 8);
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

  it('picks the weekly reflection day from the native date picker and reschedules on set', () => {
    render(<SettingsScreen />);

    // The seven-chip list is gone (2026-09-17 owner feedback): no weekday
    // other than the trigger's own value renders as a control.
    expect(screen.queryByText('thursday')).toBeNull();

    // 2026-09-14 is a Monday: the stored day is the picked date's weekday.
    fireEvent(screen.getByLabelText('Weekly reflection day'), 'onChange', { type: 'set' }, new Date(2026, 8, 14));

    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'monday');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('seeds the weekly day picker with a date on the stored weekday', () => {
    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_day: 'tuesday' };
    render(<SettingsScreen />);

    const picker = screen.getByLabelText('Weekly reflection day');
    expect(picker.props.mode).toBe('date');
    expect(picker.props.value.getDay()).toBe(2);
  });

  it('round-trips a persisted weekly day: the picker is reseeded from it on the next mount', () => {
    const first = render(<SettingsScreen />);
    fireEvent(screen.getByLabelText('Weekly reflection day'), 'onChange', { type: 'set' }, new Date(2026, 8, 14));
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'monday');
    first.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_day: 'monday' };
    render(<SettingsScreen />);
    expect(screen.getByLabelText('Weekly reflection day').props.value.getDay()).toBe(1);
  });

  it('renders the three notification times as native pickers seeded from the stored HH:MM values', () => {
    mockSettings = { ...DEFAULT_SETTINGS, morning_notification_time: '07:45' };
    render(<SettingsScreen />);

    for (const label of ['Morning notification time', 'Evening notification time', 'Weekly notification time']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    const morning = screen.getByLabelText('Morning notification time');
    expect(morning.props.value.getHours()).toBe(7);
    expect(morning.props.value.getMinutes()).toBe(45);
  });

  it('persists a picker result as the exact "HH:MM" 24h string and reschedules (morning)', () => {
    render(<SettingsScreen />);

    fireEvent(screen.getByLabelText('Morning notification time'), 'onChange', { type: 'set' }, pickerDate('09:05'));

    expect(mockSetSetting).toHaveBeenCalledWith('morning_notification_time', '09:05');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('persists and reschedules from the evening picker the same way', () => {
    render(<SettingsScreen />);

    fireEvent(screen.getByLabelText('Evening notification time'), 'onChange', { type: 'set' }, pickerDate('22:30'));

    expect(mockSetSetting).toHaveBeenCalledWith('evening_notification_time', '22:30');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('persists and reschedules from the weekly picker the same way', () => {
    render(<SettingsScreen />);

    fireEvent(screen.getByLabelText('Weekly notification time'), 'onChange', { type: 'set' }, pickerDate('07:30'));

    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_time', '07:30');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it('ignores a picker dismissal: no setSetting, no reschedule (time and day)', () => {
    render(<SettingsScreen />);

    fireEvent(screen.getByLabelText('Weekly notification time'), 'onChange', { type: 'dismissed' }, undefined);
    fireEvent(screen.getByLabelText('Weekly reflection day'), 'onChange', { type: 'dismissed' }, undefined);

    expect(mockSetSetting).not.toHaveBeenCalledWith('weekly_meta_time', expect.anything());
    expect(mockSetSetting).not.toHaveBeenCalledWith('weekly_meta_day', expect.anything());
    expect(rescheduleNotifications).not.toHaveBeenCalled();
  });

  it('round-trips a persisted weekly time: the picker is seeded with it on the next mount', () => {
    const first = render(<SettingsScreen />);
    fireEvent(screen.getByLabelText('Weekly notification time'), 'onChange', { type: 'set' }, pickerDate('07:30'));
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_time', '07:30');
    first.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_time: '07:30' };
    render(<SettingsScreen />);
    const picker = screen.getByLabelText('Weekly notification time');
    expect(picker.props.value.getHours()).toBe(7);
    expect(picker.props.value.getMinutes()).toBe(30);
  });

  it('persists the theme preference through the theme store and re-renders the chip selected state', () => {
    render(<SettingsScreen />);

    const systemChip = screen.getByRole('button', { name: 'system' });
    const darkChip = screen.getByRole('button', { name: 'dark' });
    expect(systemChip.props.accessibilityState.selected).toBe(true);
    fireEvent.press(darkChip);

    expect(mockSetSetting).toHaveBeenCalledWith('theme', 'dark');
    expect(darkChip.props.accessibilityState.selected).toBe(true);
    expect(systemChip.props.accessibilityState.selected).toBe(false);
  });

  it('exposes no program_week_override control — the library owns it (c02 contract)', () => {
    render(<SettingsScreen />);

    expect(screen.queryByText(/programme week/i)).toBeNull();
    expect(screen.queryByText(/program week/i)).toBeNull();
  });
});
