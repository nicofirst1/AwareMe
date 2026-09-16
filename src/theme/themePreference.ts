/**
 * The stored theme preference (`theme`, §7: 'system' | 'light' | 'dark') as
 * a tiny reactive store. This is the fix for the 2026-09-16 owner feedback
 * "the theme toggle does nothing": Settings persisted the key, but
 * `useColorScheme()`/`useTheme()` read only the OS scheme, so nothing ever
 * consumed the setting.
 *
 * Shape: a module-level cached value with subscribe/notify, consumed by
 * `useSyncExternalStore` in `useColorScheme()` — no React context and no
 * provider to mount, so bare screen renders (tests render screens without
 * navigation context) keep working, and every existing `useColorScheme()`
 * call site picks the preference up without modification.
 *
 * The settings table stays the single source of truth, one writer per
 * event: `getThemePreference` lazily mirrors it on first read,
 * `setThemePreference` writes through `Repository.setSetting` and notifies
 * (the Settings screen's theme control is the only writer),
 * `resyncThemePreference` re-reads after another path resets the table
 * (Delete all data). Reads fall back to 'system' — the §7 default and the
 * exact pre-preference behaviour — wherever no repository exists (bare
 * screen renders in tests), so `useTheme()` never touches the database
 * beyond one guarded read (DECISIONS.md, ticket-06/ticket-13 constraint).
 */

import { useSyncExternalStore } from 'react';

import { getRepository } from '@/db';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_VALUES = ['system', 'light', 'dark'] as const;

let cached: ThemePreference | null = null;
const listeners = new Set<() => void>();

/** Anything other than an explicit force is 'system' (follow the OS). */
function normalize(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readFromRepository(): ThemePreference {
  try {
    return normalize(getRepository().getSettings().theme);
  } catch {
    return 'system';
  }
}

export function getThemePreference(): ThemePreference {
  if (cached === null) cached = readFromRepository();
  return cached;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Persists the preference through the one settings write path and applies it immediately. */
export function setThemePreference(next: ThemePreference): void {
  cached = normalize(next);
  getRepository().setSetting('theme', cached);
  notify();
}

/**
 * Re-reads the persisted preference and applies it if it moved — for
 * writers that reset the settings table wholesale (Delete all data) rather
 * than going through `setThemePreference`.
 */
export function resyncThemePreference(): void {
  const next = readFromRepository();
  if (next !== cached) {
    cached = next;
    notify();
  }
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The preference as reactive state (the Settings screen's chip reads this). */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeThemePreference, getThemePreference);
}
