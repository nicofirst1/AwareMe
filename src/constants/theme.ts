/**
 * Design direction (spec.md §10): restrained, text-first, quiet. One serif
 * face for stems/endings, one neutral sans for interface chrome. Generous
 * line height. Dark mode follows the system, not an afterthought.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    // 6.5:1 against `background` (WCAG AA requires 4.5:1).
    error: '#B3261E',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    // 7.3:1 against `background` — the light theme's red fails AA (3.2:1) on black.
    error: '#FF6659',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Save/Next button pressure gradient (2026-09-11 addition, §6.3.4/13.4): an
 * urgency *cue*, not a countdown numeral or shame copy — interpolated by
 * `Animated` between these two endpoints as time depletes. Deliberately the
 * same in both themes (not theme-dependent) so the white label stays
 * ≥4.5:1 throughout: measured minimum 5.13:1 across the full gradient,
 * darkest midpoint included (olive/brown, not a bright yellow trap).
 */
export const PressureColors = {
  calm: '#2E7D32',
  urgent: '#B3261E',
} as const;

/**
 * `serif` is for stems and endings (the user's writing and the prompt).
 * `sans` is for everything else: buttons, labels, chrome.
 */
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;

/**
 * Minimum touch target side (Apple HIG and Material Design both call for
 * 44pt/48dp). Applied via `minHeight`/`minWidth` on `Pressable`s whose
 * visible content (small text, an icon) would otherwise be smaller.
 */
export const MinTouchTarget = 44;
