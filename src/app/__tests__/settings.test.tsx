import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsScreen from '@/app/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/db';
import { rescheduleNotifications } from '@/notifications/scheduler';
import { resyncThemePreference } from '@/theme/themePreference';

const mockSetSetting = jest.fn();
// Hoisted so the D4 dialog's navigation pin can assert the push (the
// screen calls useRouter() once at mount and keeps the object).
const mockPush = jest.fn();
// Reassignable per test — the screen reads settings once on mount, so the
// conditional-stem-timer test swaps this and remounts.
let mockSettings: Settings = { ...DEFAULT_SETTINGS };

jest.mock('expo-router', () => ({
  // Same pattern as about.test.tsx: no real navigation tree in a bare
  // render, so useRouter/BackHeader need a stub; `Link` renders its
  // children inside the same Text the real native Link uses, forwarding
  // accessibility props so the o11 role/label assertions exercise what
  // ships.
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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

/**
 * The weekly day menu's row for one weekday. The trigger also matches a
 * day name through its visible text, so row queries filter for the exact
 * accessibility label the menu rows carry.
 */
function dayRow(name: string) {
  return screen
    .getAllByRole('button', { name })
    .find((row) => row.props.accessibilityLabel === name)!;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSetSetting.mockClear();
    mockPush.mockClear();
    jest.mocked(rescheduleNotifications).mockClear();
    // The theme preference store is module-level: re-mirror the (fresh)
    // mocked settings table so each test starts from a known state.
    resyncThemePreference();
  });

  it('renders the ScreenHeader title, all five group eyebrows, and the destructive block', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    // The section-label call rides w2-t3 (packet w2-t3 row + design §7.1):
    // the base label read "Session"; the practice-composition section is
    // "Practice". Display rename with its pinned test, not a silent one.
    expect(screen.getByText('Practice')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Writing')).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
    // The About row was removed 2026-09-24 (owner call); /about-method
    // stays reachable from the About screen and the intro.
    expect(screen.queryByText('About the method')).toBeNull();
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
    // p10 t3: the "Saved." notice is gone — every change already saves
    // instantly, so no notice renders after a change.
    expect(screen.queryByText('Saved.')).toBeNull();
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

  it('renders the weekly reflection day as a compact menu field, closed by default (p10 port)', () => {
    render(<SettingsScreen />);

    // The field names the group + the stored option (the OptionToggle
    // a11y pattern, carried to the field); the menu starts closed and no
    // native date picker exists for this field.
    const field = screen.getByRole('button', { name: 'Weekly reflection day: Sunday' });
    expect(field.props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByRole('button', { name: 'Monday' })).toBeNull();
    expect(screen.queryByLabelText('Weekly reflection day')).toBeNull();
  });

  it('opens the weekday menu: seven capitalized days, Monday-first, the stored day checked', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Sunday' }));

    // getAllByRole returns matches in tree order, so the mapped sequence
    // pins the Monday-first presentation order (the order note at the top
    // of settings.tsx) — the menu only changes which name is picked. The
    // trigger's visible text also matches the regex, so filter to the
    // rows' exact labels first.
    const rows = screen
      .getAllByRole('button', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/ })
      .filter((row) => typeof row.props.accessibilityLabel === 'string' && !row.props.accessibilityLabel.includes(':'));
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    // Default stored day (sunday) renders selected; the others do not.
    expect(rows[6]!.props.accessibilityState.selected).toBe(true);
    expect(rows[0]!.props.accessibilityState.selected).toBe(false);
  });

  it('the day menu dismisses without writing: the scrim closes it, no setSetting, no reschedule', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Sunday' }));
    fireEvent.press(screen.getByLabelText('Close weekly reflection day picker'));

    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(rescheduleNotifications).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Tuesday' })).toBeNull();
  });

  it('persists a picked weekday as the stored lowercase name and reschedules on pick', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Sunday' }));
    fireEvent.press(screen.getByRole('button', { name: 'Monday' }));

    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'monday');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
    // The pick closes the menu; the field reflects the new day.
    expect(screen.getByRole('button', { name: 'Weekly reflection day: Monday' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tuesday' })).toBeNull();
  });

  it('seeds the field and the menu from the stored weekday name (selected row)', () => {
    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_day: 'tuesday' };
    render(<SettingsScreen />);

    expect(screen.getByRole('button', { name: 'Weekly reflection day: Tuesday' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Weekly reflection day: Tuesday' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Tuesday' }));
    expect(dayRow('Tuesday').props.accessibilityState.selected).toBe(true);
    expect(dayRow('Monday').props.accessibilityState.selected).toBe(false);
  });

  it('round-trips a persisted weekly day: the field reseeds from it on the next mount', () => {
    const first = render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Sunday' }));
    fireEvent.press(screen.getByRole('button', { name: 'Monday' }));
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'monday');
    first.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_day: 'monday' };
    render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'Weekly reflection day: Monday' })).toBeTruthy();
  });

  it('leaves the menu unseeded for an out-of-range stored name, and the next pick stores a valid one', () => {
    // The 2026-09-17 fallback (out-of-range name seeded the picker with
    // today) translated to the menu idiom: the field shows the stored name
    // capitalized, no row renders selected, and the user's next pick
    // writes a valid lowercase name.
    mockSettings = { ...DEFAULT_SETTINGS, weekly_meta_day: 'mardi' };
    render(<SettingsScreen />);

    expect(screen.getByRole('button', { name: 'Weekly reflection day: Mardi' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Weekly reflection day: Mardi' }));
    for (const name of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(dayRow(name).props.accessibilityState.selected).toBe(false);
    }

    fireEvent.press(screen.getByRole('button', { name: 'Wednesday' }));
    expect(mockSetSetting).toHaveBeenCalledWith('weekly_meta_day', 'wednesday');
    expect(rescheduleNotifications).toHaveBeenCalledTimes(1);
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

  it('ignores a picker dismissal: no setSetting, no reschedule (time fields; the day menu has its own dismissal test)', () => {
    render(<SettingsScreen />);

    fireEvent(screen.getByLabelText('Weekly notification time'), 'onChange', { type: 'dismissed' }, undefined);

    expect(mockSetSetting).not.toHaveBeenCalledWith('weekly_meta_time', expect.anything());
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

  it('renders the Programme row first in the Practice section with the design copy (p7 design §7.1)', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Programme')).toBeTruthy();
    // The design's two hint lines, verbatim (§13.4-safe; no "programme
    // week" adjacency — the c02 pin above stays green).
    expect(screen.getByText('Adds the official programme’s current week to your morning practice.')).toBeTruthy();
    expect(
      screen.getByText('Off, your practice is your picks only, and the week stops advancing until you turn it back on.'),
    ).toBeTruthy();

    // First row of the section (§7.1, owner-approved): compare the
    // Programme block's position against the first stepper's among the
    // direct children of the card that holds them both. Children elements
    // are string | instance; RNTL 13 re-exports no instance type (and
    // react-test-renderer ships no types), so narrow through unknown.
    let card = screen.getByText('Programme').parent!;
    while (!within(card).queryByText('Endings per session')) card = card.parent!;
    const cardChildren: unknown[] = card.children;
    let programmeIndex = -1;
    let endingsIndex = -1;
    cardChildren.forEach((child, i) => {
      if (typeof child === 'string') return;
      if (within(child).queryByText('Programme')) programmeIndex = i;
      if (within(child).queryByText('Endings per session')) endingsIndex = i;
    });
    expect(programmeIndex).toBeGreaterThanOrEqual(0);
    expect(endingsIndex).toBeGreaterThan(programmeIndex);
  });

  it('names the Programme pills for screen readers and seeds the on state (D8 default)', () => {
    render(<SettingsScreen />);

    // The OptionToggle group-label convention: each pill reads
    // "Programme: <option>" (the map's exact a11y pattern).
    expect(screen.getByRole('button', { name: 'Programme: on' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Programme: off' }).props.accessibilityState.selected).toBe(false);
  });

  it('persists the Programme toggle one key at a time and reschedules nothing (not notification-relevant)', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Programme: off' }));
    expect(mockSetSetting).toHaveBeenCalledWith('programme', false);
    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(mockSetSetting).toHaveBeenCalledWith('programme', true);

    // D3: the Programme setting is not notification-relevant — the evening
    // toggle's reschedule precedent does not transfer (research map §5.6).
    expect(rescheduleNotifications).not.toHaveBeenCalled();
  });

  it('pins week 1 on the off→on re-enable and writes nothing but the toggle on the off leg (D4/D3)', () => {
    render(<SettingsScreen />);

    // On → off: D3-inert — the toggle write is the only state change, no
    // override clear (two-sided so the pin cannot pass vacuously).
    fireEvent.press(screen.getByRole('button', { name: 'Programme: off' }));
    expect(mockSetSetting).not.toHaveBeenCalledWith('program_week_override', expect.anything());

    // Off → on: the D4 re-enable pin rides the transition (the week
    // pages' exact write shape, number 1 — not a string).
    mockSetSetting.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(mockSetSetting).toHaveBeenCalledWith('programme', true);
    expect(mockSetSetting).toHaveBeenCalledWith('program_week_override', 1);
  });

  it('shows the re-enable dialog on every off→on transition — never on off, never without a transition', () => {
    // Mount with the setting already on: no transition happened, no dialog.
    const mounted = render(<SettingsScreen />);
    expect(screen.queryByText('Programme on')).toBeNull();
    // Pressing the already-selected pill is not an off→on transition either.
    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(screen.queryByText('Programme on')).toBeNull();
    mounted.unmount();

    mockSettings = { ...DEFAULT_SETTINGS, programme: false };
    render(<SettingsScreen />);

    // Off state is inert (D3): no dialog while off.
    expect(screen.queryByText('Programme on')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(screen.getByText('Programme on')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Start at Week 1' }));
    expect(screen.queryByText('Programme on')).toBeNull();

    // On → off never shows it; the NEXT off→on shows it AGAIN — the dialog
    // is a per-transition artifact, nothing persisted (hub decision 15:52).
    fireEvent.press(screen.getByRole('button', { name: 'Programme: off' }));
    expect(screen.queryByText('Programme on')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(screen.getByText('Programme on')).toBeTruthy();
  });

  it('the re-enable dialog carries the design copy; its primary dismisses without navigating (p7 design §7.2)', () => {
    mockSettings = { ...DEFAULT_SETTINGS, programme: false };
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    expect(screen.getByText('Programme on')).toBeTruthy();
    expect(
      screen.getByText(
        'Your practice starts at Week 1. You can pick a different week, and your week will advance from there.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Start at Week 1' }));
    expect(screen.queryByText('Programme on')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('the re-enable dialog’s Pick a different week link routes to /week (D4)', () => {
    mockSettings = { ...DEFAULT_SETTINGS, programme: false };
    render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Programme: on' }));
    // The /week link convention (role="link" + explicit label).
    fireEvent.press(screen.getByRole('link', { name: 'Pick a different week' }));

    expect(mockPush).toHaveBeenCalledWith('/week');
  });
});
