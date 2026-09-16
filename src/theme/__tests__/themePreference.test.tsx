import { render, screen } from '@testing-library/react-native';
import { act } from 'react';
import { Text, useColorScheme as useSystemColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_SETTINGS } from '@/db';
import {
  getThemePreference,
  resyncThemePreference,
  setThemePreference,
  useThemePreference,
} from '@/theme/themePreference';

let mockSettings = { ...DEFAULT_SETTINGS };
const mockSetSetting = jest.fn();

jest.mock('@/db', () => ({
  getRepository: () => ({
    getSettings: () => ({ ...mockSettings }),
    setSetting: (...args: unknown[]) => mockSetSetting(...args),
  }),
}));

/**
 * The OS scheme is not forced to a value here: the pass-through branch is
 * asserted as equality with react-native's own hook (the exact pre-
 * preference behaviour), and the override branch forces the opposite of
 * whatever the OS hook reports, so both branches are exercised whatever
 * the jest environment's scheme is.
 */

/** Renders the raw OS hook's value beside the app hook's resolved value. */
function DualSchemeProbe() {
  const system = String(useSystemColorScheme());
  const resolved = String(useColorScheme());
  return (
    <>
      <Text testID="probe-system">{system}</Text>
      <Text testID="probe-resolved">{resolved}</Text>
    </>
  );
}

function ThemeProbe() {
  const theme = useTheme();
  return <Text testID="probe-bg">{theme.background}</Text>;
}

function PreferenceProbe() {
  return <Text testID="probe-pref">{useThemePreference()}</Text>;
}

function renderSchemes(): { system: string; resolved: string } {
  render(<DualSchemeProbe />);
  return {
    system: screen.getByTestId('probe-system').props.children,
    resolved: screen.getByTestId('probe-resolved').props.children,
  };
}

describe('themePreference store + resolution hooks', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSetSetting.mockClear();
    // The preference store is module-level: re-mirror the (fresh) mocked
    // settings table so each test starts from a known state.
    resyncThemePreference();
  });

  it('lazily mirrors the repository on first read (system by default)', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('system passes the OS value through, unchanged from the pre-preference behaviour', () => {
    const { system, resolved } = renderSchemes();
    expect(getThemePreference()).toBe('system');
    expect(resolved).toBe(system);
  });

  it('a forced preference overrides the OS scheme app-wide', () => {
    const { system } = renderSchemes();
    const forced = system === 'dark' ? 'light' : 'dark';

    act(() => setThemePreference(forced));
    const { resolved } = renderSchemes();
    expect(resolved).toBe(forced);

    // The resolved scheme drives useTheme's palette app-wide.
    render(<ThemeProbe />);
    expect(screen.getByTestId('probe-bg').props.children).toBe(Colors[forced as 'light' | 'dark'].background);

    // And back: 'system' restores the OS-following behaviour.
    act(() => setThemePreference('system'));
    const after = renderSchemes();
    expect(after.resolved).toBe(after.system);
  });

  it('setThemePreference persists through Repository.setSetting and applies immediately', () => {
    render(<ThemeProbe />);
    const before = screen.getByTestId('probe-bg').props.children;

    act(() => setThemePreference('dark'));

    expect(mockSetSetting).toHaveBeenCalledWith('theme', 'dark');
    expect(screen.getByTestId('probe-bg').props.children).not.toBe(before);
    expect(screen.getByTestId('probe-bg').props.children).toBe(Colors.dark.background);
  });

  it('resyncThemePreference re-mirrors the repository after a wholesale reset (Delete all data)', () => {
    act(() => setThemePreference('dark'));
    expect(getThemePreference()).toBe('dark');

    // runDeleteAll resets the settings table behind the store's back.
    mockSettings = { ...DEFAULT_SETTINGS, theme: 'system' };
    act(() => resyncThemePreference());
    expect(getThemePreference()).toBe('system');

    // And a persisted forced value is mirrored too.
    mockSettings = { ...DEFAULT_SETTINGS, theme: 'light' };
    act(() => resyncThemePreference());
    expect(getThemePreference()).toBe('light');
  });

  it('resync falls back to system where the repository is unreadable', () => {
    act(() => setThemePreference('dark'));

    mockSettings = undefined as unknown as typeof mockSettings;
    resyncThemePreference();
    expect(getThemePreference()).toBe('system');
  });

  it('useThemePreference exposes the current preference reactively', () => {
    render(<PreferenceProbe />);
    expect(screen.getByTestId('probe-pref').props.children).toBe('system');

    act(() => setThemePreference('dark'));
    expect(screen.getByTestId('probe-pref').props.children).toBe('dark');
  });
});
