---
version: alpha
name: AwareMe
description: Design tokens for the AwareMe app (the "six endings" method), extracted from src/constants/theme.ts and src/components/themed-text.tsx. Those files stay normative; this document is a published view of them.
colors:
  text: "#000000"
  text-dark: "#ffffff"
  background: "#fef5e8"
  background-dark: "#000000"
  backgroundElement: "#fcebd4"
  backgroundElement-dark: "#1e1d1c"
  backgroundSelected: "#faddba"
  backgroundSelected-dark: "#343330"
  textSecondary: "#60646C"
  textSecondary-dark: "#B0B4BA"
  error: "#B3261E"
  error-dark: "#FF6659"
  accent: "#5f5f9f"
  accent-dark: "#8585b6"
  accentMuted: "#ebe3df"
  accentMuted-dark: "#15151d"
  border: "#e0d8cc"
  border-dark: "#262626"
  borderStrong: "#e0d8cc"
  borderStrong-dark: "#737373"
  success: "#2E7D32"
  success-dark: "#6FCF73"
  pressureCalm: "#2E7D32"
  pressureUrgent: "#B3261E"
  glow: "#E8B34A"
  glowSoft: "rgba(232,179,74,0.16)"
  indigo: "#5f5f9f"
  rose: "#e792b8"
  cream: "#fef5e8"
  amber: "#f1a145"
  jade: "#73c099"
  indigoBg: "#d8d1d6"
  indigoText: "#515187"
  indigoBg-dark: "#131320"
  indigoText-dark: "#8585b6"
  roseBg: "#f8dddc"
  roseText: "#815267"
  roseBg-dark: "#2e1d25"
  roseText-dark: "#e792b8"
  creamBg: "#fef5e8"
  creamText: "#5b5854"
  creamBg-dark: "#e5ddd1"
  creamText-dark: "#615d58"
  amberBg: "#fbe1c1"
  amberText: "#855926"
  amberBg-dark: "#30200e"
  amberText-dark: "#f1a145"
  jadeBg: "#dde8d5"
  jadeText: "#3f6a54"
  jadeBg-dark: "#17261f"
  jadeText-dark: "#73c099"
  categoryAwarenessBg: "#D6E6F5"
  categoryAwarenessText: "#0B3C61"
  categoryAwarenessBg-dark: "#173B52"
  categoryAwarenessText-dark: "#BFE0FF"
  categorySelfAcceptanceBg: "#EBDCF5"
  categorySelfAcceptanceText: "#4A1D6B"
  categorySelfAcceptanceBg-dark: "#33253F"
  categorySelfAcceptanceText-dark: "#E3C4FF"
  categoryResponsibilityBg: "#DCEAD9"
  categoryResponsibilityText: "#1E4620"
  categoryResponsibilityBg-dark: "#213823"
  categoryResponsibilityText-dark: "#B9E8BD"
  categoryAssertivenessBg: "#F7DCC9"
  categoryAssertivenessText: "#6B3410"
  categoryAssertivenessBg-dark: "#3D2A1D"
  categoryAssertivenessText-dark: "#FFC793"
  categoryPurposeBg: "#F9E1E8"
  categoryPurposeText: "#6B1533"
  categoryPurposeBg-dark: "#3D2530"
  categoryPurposeText-dark: "#FFB8CE"
  categoryIntegrityBg: "#DDEAF0"
  categoryIntegrityText: "#0E3D45"
  categoryIntegrityBg-dark: "#1E3538"
  categoryIntegrityText-dark: "#A9E4EF"
typography:
  default:
    fontFamily: system-ui
    fontSize: 16px
    lineHeight: 24px
  title:
    fontFamily: system-ui
    fontSize: 32px
    fontWeight: 600
    lineHeight: 44px
  subtitle:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 30px
  small:
    fontFamily: system-ui
    fontSize: 14px
    lineHeight: 22px
  stem:
    fontFamily: ui-serif
    fontSize: 22px
    lineHeight: 34px
  eyebrow:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.6px
rounded:
  chip: 999px
  small: 8px
  medium: 12px
  large: 20px
spacing:
  half: 2px
  one: 4px
  two: 8px
  three: 16px
  four: 24px
  five: 32px
  six: 64px
  maxContentWidth: 800px
components:
  pressable:
    minTouchTarget: 44px
---

# AwareMe design system

## Overview

The app's look is **restrained, text-first, quiet**: one serif face reserved for
stems and endings, one neutral sans for all interface chrome, generous line
height, and dark mode that follows the system rather than being an
afterthought. Color is built on the owner's five-hue palette — indigo, rose,
cream, amber, jade — and **every theme token derives from those five hexes**, so
recoloring the product means editing five values, not hunting literals.

Two structural facts shape everything below. First, the design.md format has no
theme-pair concept, so dark-theme variants are published as separate tokens with
a `-dark` suffix; un-suffixed tokens are the light theme. Second, this file is a
**published view, not the source of truth**: `src/constants/theme.ts` stays
normative, every token here was extracted from it (or from
`src/components/themed-text.tsx` for typography), and the two must be kept in
sync by re-extracting after any theme change.

Units: this file uses `px` because the format requires a CSS-style dimension;
in React Native those figures are density-independent pixels (dp), so `16px`
here is RN's `16` — not a device pixel.

## Colors

### Light/dark encoding

Un-suffixed tokens are `Colors.light`; the same name with a `-dark` suffix is
its `Colors.dark` counterpart (for example `background` / `background-dark`).
Palette and category pair tokens follow the same rule: `indigoBg` is the light
chip fill, `indigoBg-dark` the dark one.

### The five owner hexes (raw)

- **Indigo `#5f5f9f`** — the anchor hue: CTAs, selected states, links. The only
  raw hue that clears WCAG AA as text on the cream light background.
- **Rose `#e792b8`** — warm highlight/celebration-adjacent accents.
- **Cream `#fef5e8`** — the surface hue: the light theme's background and its
  dark cousin.
- **Amber `#f1a145`** — the warm amber: badges, warm tints.
- **Jade `#73c099`** — the calm green: growth/positive signals.

Raw rose, amber, and jade are too light for text on cream and are reserved to
the dark theme, where they clear AA. Every text/surface pairing in `theme.ts`
is measured with the WCAG 2.x relative-luminance formula and asserted by
`src/theme/__tests__/palette.test.ts`; the 4.5:1 AA floor applies to text.

### Derived theme tokens (recipes from `theme.ts`)

Derived values are quoted as computed hexes; the blend recipe is the linear
per-channel `mixHex(a, b, t)` from `theme.ts` (t = 0 gives `a`, 1 gives `b`):

- `background` — cream `#fef5e8` verbatim (light) / pure black (dark).
- `backgroundElement` (card/chip fill) — cream blended 12% toward amber
  (light: `#fcebd4`) / black blended 12% toward cream (dark: `#1e1d1c`).
- `backgroundSelected` (pressed step) — cream blended 28% toward amber
  (light: `#faddba`) / the dark element blend blended 10% back toward cream
  (dark: `#343330`).
- `textSecondary` — `#60646C` (light) / `#B0B4BA` (dark).
- `error` — `#B3261E` (light) / `#FF6659` (dark; the light red fails AA on
  black at 3.2:1).
- `accent` — raw indigo `#5f5f9f` (light) / indigo lightened 24% toward the
  dark theme's white ink (dark: `#8585b6`, identical to `indigoText-dark`).
- `accentMuted` (indigo-tinted fill) — cream blended 12% toward indigo
  (light: `#ebe3df`) / black blended 16% toward the dark accent (dark:
  `#15151d`).
- `border` (decorative hairline) — cream blended 12% toward black (light:
  `#e0d8cc`) / black blended 15% toward white (dark: `#262626`).
- `borderStrong` (control outline, held to WCAG 1.4.11's 3:1 non-text bar) —
  same derivation as `border` in light (coincides verbatim: `#e0d8cc`) / black
  blended 45% toward white (dark: `#737373`).
- `success` — `#2E7D32` (light) / `#6FCF73` (dark; a lighter derivation of the
  same green family, 10.85:1 on black).

### Palette pairs (chip/tint fills + labels)

For each hue, `XxxBg` is the hue blended 76% toward cream (light) or 80%
toward black (dark), and `XxxText` is the hue darkened toward black (light) or
lightened toward white (dark) until the pair clears AA 4.5:1 with margin.
Specifics: indigo text darkened 15%; rose 44%; amber 45%; jade 45%; cream text
darkened 64% (light) and 62% (dark), with the dark cream background blended
only 10% toward black. In the dark theme rose, amber, and jade text are the
raw base hexes themselves. `creamText-dark` is pair-scoped — cream is a
surface hue, not a text color on black.

### Category pairs

Six stem categories, each a muted `category<Name>Bg`/`category<Name>Text` pair
per theme (all measured ≥ 4.5:1 within the pair): awareness,
self_acceptance, responsibility, assertiveness, purpose, integrity. The `Bg`
also doubles as a decorative accent-stripe color (a 3px `Card` left edge,
non-text, not held to the text bar).

### Pressure and celebration

- `pressureCalm` `#2E7D32` / `pressureUrgent` `#B3261E` — theme-invariant
  endpoints of the Save/Next urgency gradient, an interpolated cue (never a
  countdown numeral or shame copy); the white label stays ≥ 5.13:1 across the
  full gradient. Countdown numerals instead use `pressureColorAt`, which
  interpolates each theme's `success` → `error` tokens.
- `glow` `#E8B34A` — decorative only (icon tint, thin card edge), never text:
  it measures 1.77:1 on the cream background and 10.98:1 on black, so it does
  not clear 4.5:1 universally and must not be used as a text color.
- `glowSoft` `rgba(232,179,74,0.16)` — the earned-badge card fill; translucent,
  so contrast is judged on its composite with each theme's background.

## Typography

Six roles, from `ThemedText`. Faces come from `Fonts` (`Platform.select`):
sans is `system-ui` on iOS and `normal` on Android; serif is `ui-serif` on iOS
and `serif` on Android — `ui-serif` is the iOS face, Android resolves the
platform default. Sizes and line heights are RN dp (published as `px` above).

- **default** — sans 16/24, body text.
- **title** — sans 32/44, weight 600.
- **subtitle** — sans 20/30, weight 600.
- **small** — sans 14/22.
- **stem** — serif 22/34; the serif is reserved for stems and endings (the
  user's writing) and the prompt.
- **eyebrow** — sans 12/16, weight 600, letter spacing 0.6, uppercase; a small
  label-above-a-group style (section and category labels).

Roles without a listed weight render at RN's default weight (400).

## Layout

Spacing uses a seven-step scale (`Spacing`): half 2, one 4, two 8, three 16,
four 24, five 32, six 64. Content is capped at a max content width of 800.

Corner radius (`Radius`): **chip** 999 (pill), **small** 8 (buttons, inputs —
the pre-existing de-facto default, numerically identical to the old
`Spacing.two`), **medium** 12 (cards), **large** 20 (the primary CTA, sheets).

Touch targets: every `Pressable` whose visible content would be smaller
observes `MinTouchTarget` 44 (Apple HIG and Material both call for 44pt/48dp),
applied via `minHeight`/`minWidth`.

## Components

- **Button (primary)** — filled with `accent`; the label is white on the light
  accent (5.79:1) and black on the dark accent (6.03:1).
- **Button (secondary)** — outlined; the boundary is `borderStrong`, held to
  WCAG 1.4.11's 3:1 non-text bar against the surfaces it sits on.
- **Category chip** — filled with the category `Bg`, labelled in the matching
  category `Text`. Unselected filter chips label in the theme's `text` on a
  `backgroundElement` fill.
- **Card** — `backgroundElement` fill on `background`; optional accent stripe
  in a category `Bg` (3px left edge, decorative).
- **Earned badge** — `glowSoft` fill; `glow` for the icon tint and card edge.
- **Save/Next pressure** — vestigial: the on-fill consumer (the write
  screen's countdown Save button) was removed 2026-09-15 and the token
  export kept; the live depleting-color cue is the timer numerals below.
- **Timer numerals** — colored by `pressureColorAt`, interpolating each
  theme's `success` → `error` as the timer depletes (ambient cue only).
- **Pressable** — minimum touch target 44 (`MinTouchTarget`).

## Do's and Don'ts

- Do use the serif face only for stems, endings, and the prompt; sans for all
  chrome.
- Don't use `glow` as a text color — it is decorative only (icon tint, card
  edge).
- Don't hardcode a hex outside `theme.ts` — every color derives from the five
  owner hexes there.
- Do keep touch targets at least 44 (`MinTouchTarget`).
- Don't set raw rose, amber, or jade as light-theme text — they clear AA only
  on the dark theme; raw indigo is the only raw hue that clears AA as
  light-theme text on cream.
- Do treat `theme.ts` as normative — change it first, then re-publish this
  view.
