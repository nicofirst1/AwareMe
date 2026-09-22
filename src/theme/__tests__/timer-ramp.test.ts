import { Colors, Palette, pressureColorAt, TimerColors } from '@/constants/theme';

/**
 * Packet-3 t4 (theme contrast, clusters 5/6/10/17): the depleting-color cue
 * is ONE ramp — normal → amber → expiring — defined per theme and never red
 * (spec §10 item 7: "No red"; ambient pressure only, no shaming copy
 * §13.4). Every figure quoted in the TimerColors / textSecondary /
 * textMuted comments is asserted here with the WCAG 2.x relative-luminance
 * formula — the same discipline as palette.test.ts.
 */

const AA = 4.5;

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// mixHex emits lowercase; token literals are uppercase. Compare case-insensitively.
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const THEMES = ['light', 'dark'] as const;

describe('timer ramp (packet-3 t4)', () => {
  it.each(THEMES)('%s: publishes the three ramp stops, each clearing AA on the background', (scheme) => {
    const ramp = TimerColors[scheme];
    for (const stop of ['normal', 'amber', 'expiring'] as const) {
      expect(contrast(ramp[stop], Colors[scheme].background)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)('%s: the ramp stops are the published token derivations', (scheme) => {
    const ramp = TimerColors[scheme];
    // `normal` is the theme's success green verbatim; `amber` is the palette
    // amber family's AA-safe text for that theme; `expiring` is the deepened
    // (light) / lifted (dark) amber — the three hexes DESIGN.md publishes.
    expect(sameHex(ramp.normal, Colors[scheme].success)).toBe(true);
    expect(sameHex(ramp.amber, scheme === 'light' ? Palette.amber.light.text : Palette.amber.base)).toBe(true);
    expect(sameHex(ramp.expiring, scheme === 'light' ? '#5c3d1a' : '#f5bd7d')).toBe(true);
  });

  it.each(THEMES)('%s: pressureColorAt walks normal → amber → expiring, never red', (scheme) => {
    // The old ramp's endpoint WAS the theme `error` red — forbidden for the
    // timer cue (spec §10 item 7). The full piecewise path (fine sweep) must
    // never return it.
    expect(sameHex(pressureColorAt(0, scheme), TimerColors[scheme].normal)).toBe(true);
    expect(sameHex(pressureColorAt(0.5, scheme), TimerColors[scheme].amber)).toBe(true);
    expect(sameHex(pressureColorAt(1, scheme), TimerColors[scheme].expiring)).toBe(true);
    expect(sameHex(pressureColorAt(1, scheme), Colors[scheme].error)).toBe(false);
    for (let t = 0; t <= 1.0001; t += 0.002) {
      expect(sameHex(pressureColorAt(t, scheme), Colors[scheme].error)).toBe(false);
    }
  });

  it.each(THEMES)('%s: the full ramp clears AA against background (sweep minimum)', (scheme) => {
    let min = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.002) {
      min = Math.min(min, contrast(pressureColorAt(t, scheme), Colors[scheme].background));
    }
    // theme.ts quotes the measured sweep minima: 4.74 (light), 9.71 (dark).
    expect(min).toBeGreaterThanOrEqual(AA);
  });

  it('clamps fractions outside 0..1', () => {
    expect(sameHex(pressureColorAt(-1, 'light'), TimerColors.light.normal)).toBe(true);
    expect(sameHex(pressureColorAt(2, 'light'), TimerColors.light.expiring)).toBe(true);
  });
});

describe('muted and secondary inks (packet-3 t4, clusters 6/10)', () => {
  it.each(THEMES)('%s: textSecondary clears AA on every shipped surface', (scheme) => {
    const c = Colors[scheme];
    for (const surface of [c.background, c.backgroundElement, c.backgroundSelected, c.accentMuted]) {
      expect(contrast(c.textSecondary, surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('light: textSecondary clears 5.8:1 on its worst surface (backgroundSelected)', () => {
    // The packet-3 receipt: the old cool-gray #60646C measured 4.56:1 on
    // backgroundSelected — the borderline figure the audit flagged. The
    // palette-derived replacement is asserted at its worst pairing.
    const c = Colors.light;
    expect(contrast(c.textSecondary, c.backgroundSelected)).toBeGreaterThanOrEqual(5.8);
  });

  it.each(THEMES)('%s: textMuted exists as a solid AA-safe silhouette ink, weaker than textSecondary', (scheme) => {
    const c = Colors[scheme];
    // Unearned-badge silhouettes previously dimmed content to opacity 0.5:
    // 3.83:1 (title) and 2.02:1 (caption) on the card fill — below AA. The
    // solid token replaces the opacity trick, so it must clear AA on both
    // surfaces that card sits on.
    for (const surface of [c.background, c.backgroundElement]) {
      expect(contrast(c.textMuted, surface)).toBeGreaterThanOrEqual(AA);
      // De-emphasis survives: the muted ink is the WEAKER pairing on the
      // same surface (theme-agnostic ordering — in light mode muted is a
      // lighter ink, in dark mode a dimmer one).
      expect(contrast(c.textMuted, surface)).toBeLessThan(contrast(c.textSecondary, surface));
    }
  });
});
