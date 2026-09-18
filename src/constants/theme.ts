/**
 * Design direction (spec.md §10): restrained, text-first, quiet. One serif
 * face for stems/endings, one neutral sans for interface chrome. Generous
 * line height. Dark mode follows the system, not an afterthought.
 *
 * Color (v13-feedback issue 04, .scratch/v13-feedback/issues/04-color-
 * palette.md): the owner's five-color palette lives in `Palette` below —
 * the five owner hexes verbatim plus per-theme derivations — and every
 * theme token in `Colors` derives from it, so recoloring the app means
 * editing those five hexes. Every text/surface figure quoted here is
 * measured with the WCAG 2.x relative-luminance formula and asserted by
 * src/theme/__tests__/palette.test.ts; edit a base hex and re-run that
 * suite to see which pairings need re-deriving.
 */

import { Platform } from 'react-native';

/**
 * The two theme inks, named here because they double as blend targets for
 * the derivation recipes below (darkening toward the light theme's ink,
 * lightening toward the dark theme's ink).
 */
const BLACK = '#000000';
const WHITE = '#ffffff';

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * Linear per-channel blend of two hex colors (t = 0 → `a`, 1 → `b`), the
 * derivation primitive for the palette below and for `pressureColorAt`.
 */
function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${[0, 1, 2].map((i) => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The owner's five hexes, verbatim (v13-feedback issue 04; owner feedback
 * 2026-09-17: "a color palette file where we can easily manage our new
 * color palette"). `Palette` publishes them with the derivations the theme
 * and the polish cycles consume; these literals are the only place the
 * owner's values are written.
 */
const PALETTE_HEX = {
  indigo: '#5f5f9f',
  rose: '#e792b8',
  cream: '#fef5e8',
  amber: '#f1a145',
  jade: '#73c099',
} as const;

/**
 * The five-color palette as named tokens: the anchor hues of the retheme
 * (v13-feedback issue 04). One entry per hue:
 *
 * - `base` — the owner's hex verbatim. Decorative and large-fill uses;
 *   AA-bound only where a comment below claims it (raw indigo clears AA as
 *   text on cream; the other raw hues are too light for text on cream and
 *   raw rose/amber/jade are reserved to the dark theme, where they clear).
 * - `light`/`dark` — per-theme `{ bg, text }` pairs in the same shape as
 *   `CategoryColors` below: `bg` = the hue blended toward that theme's
 *   background (a chip/tint fill), `text` = the hue darkened (light theme)
 *   or lightened (dark theme) until the pair clears WCAG AA 4.5:1 with
 *   margin. Each `text` also clears AA as text on that theme's plain
 *   `background`, so a hue can label a chip or color a headline alike.
 *   Measured pairs (light/dark): indigo 4.87/5.28, rose 4.91/6.98, amber
 *   4.82/7.41, jade 4.87/7.30, cream 6.55/4.85 — and each `text` on its
 *   theme's `background`: indigo 6.76/6.03, rose 5.83/9.20, amber
 *   5.63/9.92, jade 5.72/9.73 (cream's dark `text` is pair-scoped: the
 *   cream family is a surface hue, not a text color on black).
 *
 * The wave-2 polish cycles (issues 05/07/08) consume these pairs rather
 * than re-deriving colors; nothing outside this file may hardcode a hex.
 */
export const Palette = {
  /** The anchor hue: CTAs, selected states, links. Raw clears AA on cream. */
  indigo: {
    base: PALETTE_HEX.indigo,
    light: { bg: mixHex(PALETTE_HEX.indigo, PALETTE_HEX.cream, 0.76), text: mixHex(PALETTE_HEX.indigo, BLACK, 0.15) },
    dark: { bg: mixHex(PALETTE_HEX.indigo, BLACK, 0.8), text: mixHex(PALETTE_HEX.indigo, WHITE, 0.24) },
  },
  /** Warm rose: highlight/celebration-adjacent accents. */
  rose: {
    base: PALETTE_HEX.rose,
    light: { bg: mixHex(PALETTE_HEX.rose, PALETTE_HEX.cream, 0.76), text: mixHex(PALETTE_HEX.rose, BLACK, 0.44) },
    dark: { bg: mixHex(PALETTE_HEX.rose, BLACK, 0.8), text: PALETTE_HEX.rose },
  },
  /** The surface hue: the light theme's background and its dark cousin. */
  cream: {
    base: PALETTE_HEX.cream,
    light: { bg: PALETTE_HEX.cream, text: mixHex(PALETTE_HEX.cream, BLACK, 0.64) },
    dark: { bg: mixHex(PALETTE_HEX.cream, BLACK, 0.1), text: mixHex(PALETTE_HEX.cream, BLACK, 0.62) },
  },
  /** The warm amber: badges, warm tints. Raw clears AA on black. */
  amber: {
    base: PALETTE_HEX.amber,
    light: { bg: mixHex(PALETTE_HEX.amber, PALETTE_HEX.cream, 0.76), text: mixHex(PALETTE_HEX.amber, BLACK, 0.45) },
    dark: { bg: mixHex(PALETTE_HEX.amber, BLACK, 0.8), text: PALETTE_HEX.amber },
  },
  /** The calm green: growth/positive signals. Raw clears AA on black. */
  jade: {
    base: PALETTE_HEX.jade,
    light: { bg: mixHex(PALETTE_HEX.jade, PALETTE_HEX.cream, 0.76), text: mixHex(PALETTE_HEX.jade, BLACK, 0.45) },
    dark: { bg: mixHex(PALETTE_HEX.jade, BLACK, 0.8), text: PALETTE_HEX.jade },
  },
} as const;

export type PaletteName = keyof typeof Palette;

export const Colors = {
  light: {
    text: BLACK,
    // The owner's Start-page cream, verbatim from the palette: black text
    // on it measures 19.44:1 (WCAG AA requires 4.5:1).
    background: Palette.cream.base,
    // Cream deepened 12% toward amber — the card/chip fill step. The same
    // blend the old cool-gray token served, in the palette's warm family:
    // `text` sits on it at 17.97:1, `textSecondary` at 5.08:1.
    backgroundElement: mixHex(PALETTE_HEX.cream, PALETTE_HEX.amber, 0.12),
    // The pressed/selected step, one deeper blend of the same two hues
    // (28%): text 16.12:1, textSecondary 4.56:1 — the secondary figure
    // matches the old #E0E1E6's 4.55:1 margin almost exactly.
    backgroundSelected: mixHex(PALETTE_HEX.cream, PALETTE_HEX.amber, 0.28),
    textSecondary: '#60646C',
    // 6.05:1 against the cream `background` (WCAG AA requires 4.5:1).
    error: '#B3261E',
    // The palette's anchor hue, verbatim (it needs no derivation to clear
    // AA here): 5.36:1 as text on the cream `background`, and — since the
    // identical measurement is symmetric — 5.79:1 for white label text on
    // an `accent`-filled surface (`Button` variant="primary"). A single
    // hex cannot clear 4.5:1 as text against both pure white and pure
    // black, so `accent` (like `error`) is deliberately per-theme, not
    // shared with `PressureColors`'s theme-invariant approach.
    accent: Palette.indigo.base,
    // Accent blended ~12% into `background`, for card/section fills that
    // want an indigo tint without accent-strength saturation (§10).
    // `text`/`textSecondary` sit on it at 16.59:1 / 4.69:1; `accent` as
    // text on it measures 4.58:1 — usable, though secondary ink is the
    // intended pair.
    accentMuted: mixHex(PALETTE_HEX.cream, PALETTE_HEX.indigo, 0.12),
    // Hairline divider, ~12% of `text` mixed into `background` — decorative
    // only (card/row edges), not a text pairing, so WCAG's 4.5:1 text
    // ratio doesn't apply; matches the existing ACTIVE_EDGE/INACTIVE_EDGE
    // precedent in stems.tsx ("decorative, not text").
    border: mixHex(PALETTE_HEX.cream, BLACK, 0.12),
    // Same hue family as `PressureColors.calm`, reused verbatim here since
    // it already clears AA (4.75:1 against the cream `background`) — kept
    // identical rather than re-derived so the "calm" signal reads the same
    // in the pressure gradient and any status use of `success`.
    success: '#2E7D32',
  },
  dark: {
    text: WHITE,
    background: '#000000',
    // The cream family pulled to a near-black surface (12% cream into
    // black): the dark-theme card/chip fill keeps the palette's warmth.
    // `text` sits on it at 16.83:1, `textSecondary` at 8.08:1.
    backgroundElement: mixHex(BLACK, PALETTE_HEX.cream, 0.12),
    // The pressed/selected step, blended 10% back toward cream.
    // `text` 12.63:1, `textSecondary` 6.07:1.
    backgroundSelected: mixHex(mixHex(BLACK, PALETTE_HEX.cream, 0.12), PALETTE_HEX.cream, 0.1),
    textSecondary: '#B0B4BA',
    // 7.3:1 against `background` — the light theme's red fails AA (3.2:1) on black.
    error: '#FF6659',
    // The palette's indigo, lightened 24% toward the theme ink: 6.03:1 as
    // text on `background`; the same measurement is symmetric, so black
    // label text on an `accent`-filled surface (`Button`
    // variant="primary") also measures 6.03:1. See the light theme's
    // comment above for why this is per-theme, not one shared hex.
    accent: Palette.indigo.dark.text,
    // Accent blended ~16% into `background`. `text`/`textSecondary` sit on
    // it at 18.15:1 / 8.72:1; `accent` as text on it measures 5.21:1.
    accentMuted: mixHex(BLACK, Palette.indigo.dark.text, 0.16),
    // Hairline divider, ~15% of `text` mixed into `background` — decorative
    // only, same reasoning as the light theme's `border`.
    border: mixHex(BLACK, WHITE, 0.15),
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
 * bar above; only the `bg`/`text` pairing itself is. Unselected category
 * chips (FilterChip) label in `.text` on the theme's `backgroundElement`
 * fill, a pairing `palette.test.ts` keeps measured as the surfaces evolve.
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
 *
 * 2026-09-15: its on-fill consumer (the write screen's countdown Save
 * button) is gone (owner decision, expo-feedback round cycle 2; recorded in
 * DECISIONS.md at merge) — the write/review screens now color the top-strip
 * MM:SS numerals via `pressureColorAt` below. Export kept (vestigial
 * token, like the schema's pre-pivot tables): the numerals' per-theme
 * derivation now lives in `pressureColorAt` — its light-theme calm endpoint
 * coincides with `calm` verbatim; dark's is `success` (#6FCF73) instead.
 */
export const PressureColors = {
  calm: '#2E7D32',
  urgent: '#B3261E',
} as const;

/**
 * Pressure color for the write/review top strip's MM:SS numerals
 * (2026-09-15 owner decision, expo-feedback round cycle 2 — recorded in
 * DECISIONS.md at merge): the countdown Save button is gone, and §6.3.7's
 * depleting-color cue — a *may*, ambient only, no penalty text, no shaming
 * copy (§13.4) — now colors the numerals as the active timer depletes.
 * `fraction` 0 = calm, 1 = urgent; values outside 0..1 clamp.
 *
 * The endpoints are the per-theme `success`/`error` tokens, deliberately
 * NOT the theme-invariant `PressureColors`: the numerals are text sitting
 * on each theme's `background` (unlike the old button's fixed gradient
 * fill), so both endpoints must clear 4.5:1 against that background —
 * light `success` 4.75:1 → `error` 6.05:1; dark `success` 10.85:1 →
 * `error` 7.3:1 (figures from the token comments above). Measured across
 * the full interpolation: the gradient's minimum contrast is 4.75:1 (light)
 * and 7.21:1 (dark), so every point on the path clears AA.
 */
export function pressureColorAt(fraction: number, scheme: 'light' | 'dark'): string {
  const t = Math.max(0, Math.min(1, fraction));
  return mixHex(Colors[scheme].success, Colors[scheme].error, t);
}

/**
 * Badge "earned" accent (2026-09-11 gamification proposal §2,
 * `docs/design/gamification-proposal-2026-09-11.md`) — theme-invariant like
 * `PressureColors`: a celebratory glow should read identically regardless
 * of light/dark, not a text/background pairing subject to per-theme AA math.
 *
 * `glow` is decorative-only (icon tint, thin card edge) — never text. It
 * measures 1.77:1 against the cream `background` and 10.98:1 against black,
 * so it does not clear 4.5:1 universally and MUST NOT be used as a text
 * color.
 *
 * `glowSoft` is the earned-badge `Card` fill. It's translucent, so the only
 * meaningful check is the *composite* it forms with each theme's
 * `background` — the existing `text`/`textSecondary` tokens sit on top of
 * that composite, not on `glowSoft` alone: light composite `#faeacf` gives
 * text 17.73:1 / textSecondary 5.01:1; dark composite `#251d0c` gives text
 * 16.67:1 / textSecondary 8.00:1 (all measured, all clear AA).
 */
export const CelebrationColors = {
  glow: '#E8B34A', // decorative only — icon tint / card edge, never text
  glowSoft: 'rgba(232,179,74,0.16)', // badge card fill, both themes
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
