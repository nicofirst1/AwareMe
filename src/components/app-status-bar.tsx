import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The app's single status-bar owner. Keyed off the app-wide
 * `useColorScheme()` (the stored §7 `theme` setting, not the raw OS scheme),
 * it flips the bar's content style with the same scheme every surface uses
 * to pick its background, so the bar stays legible on both themes:
 *
 * - light theme: cream surfaces (`Palette.cream.base`) need dark content —
 *   expo-status-bar's `style="dark"` means dark icons/text;
 * - dark theme: near-black surfaces need light content (`style="light"`).
 *
 * Rendered once in the root layout, so the bar follows the Settings theme
 * toggle everywhere with no per-screen code (the 2026-09-16 "theme toggle
 * does nothing" fix made the stored preference the one scheme source; this
 * component consumes that same source). Before it existed the app set no
 * StatusBar at all, and on edge-to-edge Android the system defaulted to
 * light icons over the cream background — near-invisible (packet-2
 * captures c10-01/c10-03, c11-04; round p3 ticket t1).
 *
 * A screen that paints a locally different background (e.g. a full-bleed
 * photo header) overrides the bar with explicit props in its own file,
 * rendering this component with a static `style` for that surface.
 */
export function AppStatusBar() {
  const colorScheme = useColorScheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}
