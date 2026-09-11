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
    // 2026-09-11 design-system foundation (ui-audit-2026-09-11.md, cycle 1).
    // One warm accent hue, used sparingly (Home's primary CTA, section
    // headers) — not a second brand color, not per-category. 4.94:1 as text
    // on `background`, and — since the identical measurement is symmetric —
    // also 4.94:1 for white label text on an `accent`-filled surface
    // (`Button` variant="primary"). A single hex cannot clear 4.5:1 as text
    // against both pure white and pure black, so `accent` (like `error`) is
    // deliberately per-theme, not shared with `PressureColors`'s
    // theme-invariant approach.
    accent: '#B5541A',
    // Accent blended ~12% into `background`, for card/section fills that
    // want a warm tint without accent-strength saturation (§10). Not
    // intended to host accent-colored text (measures 4.00:1, under AA);
    // `text`/`textSecondary` sit on it at 17.81:1 / 5.04:1 respectively.
    accentMuted: '#F6EAE4',
    // Hairline divider, ~12% of `text` mixed into `background` — decorative
    // only (card/row edges), not a text pairing, so WCAG's 4.5:1 text
    // ratio doesn't apply; matches the existing ACTIVE_EDGE/INACTIVE_EDGE
    // precedent in stems.tsx ("decorative, not text").
    border: '#E0E0E0',
    // Same hue family as `PressureColors.calm`, reused verbatim here since
    // it already clears AA on white (5.13:1) — kept identical rather than
    // re-derived so the "calm" signal reads the same in the pressure
    // gradient and any status use of `success`.
    success: '#2E7D32',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    // 7.3:1 against `background` — the light theme's red fails AA (3.2:1) on black.
    error: '#FF6659',
    // 7.97:1 as text on `background`; the same measurement is symmetric, so
    // black label text on an `accent`-filled surface (`Button`
    // variant="primary") also measures 7.97:1. See the light theme's
    // comment above for why this is per-theme, not one shared hex.
    accent: '#E8873F',
    // Accent blended ~16% into `background`. `text`/`textSecondary` sit on
    // it at 17.53:1 / 8.42:1; not intended to host accent-colored text.
    accentMuted: '#25160A',
    // Hairline divider, ~15% of `text` mixed into `background` — decorative
    // only, same reasoning as the light theme's `border`.
    border: '#262626',
    // `PressureColors.calm` fails AA on black (4.10:1), so this is a
    // lighter derivation of the same green family: 10.85:1 against
    // `background`.
    success: '#6FCF73',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * One calm hue per stem category (2026-09-11 addition, stems library), used
 * for the category chip on each stem row and the category filter chips.
 * Each `bg`/`text` pair is checked ≥4.5:1 WCAG AA (measured, not eyeballed):
 * awareness 9.00:1 / 8.59:1, self_acceptance 9.58:1 / 9.21:1, responsibility
 * 8.61:1 / 9.27:1, assertiveness 7.55:1 / 8.95:1, purpose 9.53:1 / 8.63:1,
 * integrity 9.65:1 / 9.27:1 (light / dark respectively) — all well clear of
 * the 4.5:1 floor while staying muted, not traffic-light saturated (§10).
 * `.bg` doubles as a decorative accent-stripe color for `Card`'s
 * `accentColor` prop (history.tsx's `SessionRow`, cycle 3) — that use is
 * non-text (a 3px left edge), so it isn't held to the 4.5:1 text-contrast
 * bar above; only the `bg`/`text` pairing itself is.
 */
export const CategoryColors = {
  awareness: {
    light: { bg: '#D6E6F5', text: '#0B3C61' },
    dark: { bg: '#173B52', text: '#BFE0FF' },
  },
  self_acceptance: {
    light: { bg: '#EBDCF5', text: '#4A1D6B' },
    dark: { bg: '#33253F', text: '#E3C4FF' },
  },
  responsibility: {
    light: { bg: '#DCEAD9', text: '#1E4620' },
    dark: { bg: '#213823', text: '#B9E8BD' },
  },
  assertiveness: {
    light: { bg: '#F7DCC9', text: '#6B3410' },
    dark: { bg: '#3D2A1D', text: '#FFC793' },
  },
  purpose: {
    light: { bg: '#F9E1E8', text: '#6B1533' },
    dark: { bg: '#3D2530', text: '#FFB8CE' },
  },
  integrity: {
    light: { bg: '#DDEAF0', text: '#0E3D45' },
    dark: { bg: '#1E3538', text: '#A9E4EF' },
  },
} as const;

export type CategoryName = keyof typeof CategoryColors;

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
 * Border radius scale (2026-09-11 design-system foundation, ui-audit-
 * 2026-09-11.md cycle 1) — names what was previously an unnamed convention
 * (`borderRadius: Spacing.two` copy-pasted at every card/button call site).
 * `chip` = pill; `small` = the existing de-facto default (buttons, inputs,
 * numerically identical to the old `Spacing.two` so adopting it in a later
 * cycle is a mechanical rename, not a visual change); `medium` = cards;
 * `large` = the primary CTA / sheets.
 */
export const Radius = {
  chip: 999,
  small: 8,
  medium: 12,
  large: 20,
} as const;

/**
 * Minimum touch target side (Apple HIG and Material Design both call for
 * 44pt/48dp). Applied via `minHeight`/`minWidth` on `Pressable`s whose
 * visible content (small text, an icon) would otherwise be smaller.
 */
export const MinTouchTarget = 44;
