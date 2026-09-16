import { useSyncExternalStore } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { getThemePreference, subscribeThemePreference } from '@/theme/themePreference';

/**
 * The app-wide color-scheme source. This file used to re-export react-
 * native's hook — the OS scheme only — which was the root cause of the
 * 2026-09-16 owner report "the theme toggle does nothing": Settings
 * persisted the `theme` setting, but nothing consumed it. Every scheme
 * read in the app now resolves through this one hook, so the stored
 * preference applies everywhere with no per-screen changes:
 *
 * - 'system' passes the OS value through unchanged (including
 *   'unspecified', exactly as before);
 * - 'light' / 'dark' force the scheme app-wide.
 *
 * The preference store mirrors the §7 `theme` setting lazily and falls
 * back to 'system' where no repository exists (bare screen renders in
 * tests) — see `@/theme/themePreference`.
 */
export function useColorScheme(): ReturnType<typeof useSystemColorScheme> {
  const system = useSystemColorScheme();
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference);
  return preference === 'system' ? system : preference;
}
