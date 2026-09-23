import { CategoryColors, CelebrationColors, Colors, Palette, pressureColorAt } from '@/constants/theme';

/**
 * The measured-contrast discipline, machine-checked (v13-feedback issue 04):
 * every figure quoted in theme.ts comments is asserted here with the WCAG
 * 2.x relative-luminance formula. Deliberately NOT pinned: the *derived*
 * token hexes. The owner may edit a palette base at any time, and this
 * suite exists to flag any pairing that drops below AA (4.5:1), not to
 * freeze yesterday's derivations.
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

const THEMES = ['light', 'dark'] as const;

describe('owner palette (issue 04)', () => {
  it('pins the five owner hexes verbatim', () => {
    expect(Palette.indigo.base).toBe('#5f5f9f');
    expect(Palette.rose.base).toBe('#e792b8');
    expect(Palette.cream.base).toBe('#fef5e8');
    expect(Palette.amber.base).toBe('#f1a145');
    expect(Palette.jade.base).toBe('#73c099');
  });

  it.each(THEMES)('%s: every palette chip pair clears AA', (scheme) => {
    for (const hue of Object.values(Palette)) {
      expect(contrast(hue[scheme].text, hue[scheme].bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)('%s: every chromatic hue clears AA as text on background', (scheme) => {
    // cream is the surface hue: its dark-theme text is scoped to the cream
    // chip pair (asserted above), never to text-on-background duty.
    for (const name of ['indigo', 'rose', 'amber', 'jade'] as const) {
      expect(contrast(Palette[name][scheme].text, Colors[scheme].background)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('theme color tokens', () => {
  it('derives the theme accents and surfaces from the palette', () => {
    expect(Colors.light.background).toBe(Palette.cream.base);
    expect(Colors.light.accent).toBe(Palette.indigo.base);
    expect(Colors.dark.accent).toBe(Palette.indigo.dark.text);
  });

  it.each(THEMES)('%s: text and textSecondary clear AA on every shipped surface', (scheme) => {
    const c = Colors[scheme];
    for (const surface of [c.background, c.backgroundElement, c.backgroundSelected, c.accentMuted]) {
      expect(contrast(c.text, surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.textSecondary, surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)('%s: accent, error and success clear AA as text on background', (scheme) => {
    const c = Colors[scheme];
    expect(contrast(c.accent, c.background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.error, c.background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.success, c.background)).toBeGreaterThanOrEqual(AA);
  });

  it.each(THEMES)('%s: the primary button label clears AA on the accent fill', (scheme) => {
    // Button.primaryLabelColor: white label on the light accent, black on
    // the dark accent (see the accent comment in constants/theme.ts).
    const label = scheme === 'light' ? '#ffffff' : '#000000';
    expect(contrast(label, Colors[scheme].accent)).toBeGreaterThanOrEqual(AA);
  });

  it('dark: the control outline clears 3:1 on background and backgroundElement', () => {
    // `borderStrong` outlines non-text controls (Button secondary, LockScreen
    // Unlock); WCAG 1.4.11 sets the 3:1 bar for non-text UI boundaries, not
    // the 4.5:1 text bar. Dark buttons sit on `background` (the black screen)
    // and on `backgroundElement` cards (the practice card), so both pairings
    // are asserted — the v14 report's "buttons not really visible in dark"
    // measured 1.25:1 (fill) and 1.39:1 (the old shared 15% border) against
    // these very surfaces (v14 issue 07).
    const c = Colors.dark;
    for (const surface of [c.background, c.backgroundElement]) {
      expect(contrast(c.borderStrong, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('light: the control outline coincides with the border hairline (light rendering unchanged by issue 07)', () => {
    // Issue 07's contrast finding is dark-scoped: light keeps today's
    // quiet hairline, so the token pins the existing light `border` value
    // rather than introducing a new light figure.
    expect(Colors.light.borderStrong).toBe(Colors.light.border);
  });

  it.each(THEMES)('%s: the pressure gradient never drops below AA against background', (scheme) => {
    for (let i = 0; i <= 20; i++) {
      expect(contrast(pressureColorAt(i / 20, scheme), Colors[scheme].background)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('category and celebration colors', () => {
  it.each(THEMES)('%s: category chip pairs clear AA', (scheme) => {
    for (const pair of Object.values(CategoryColors)) {
      expect(contrast(pair[scheme].text, pair[scheme].bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)('%s: unselected category chip labels clear AA on backgroundElement', (scheme) => {
    // FilterChip renders unselected category chips as the .text swatch on
    // the theme backgroundElement fill, so the retheme re-measures that
    // pairing for all six categories, not just the chip-internal pair.
    for (const pair of Object.values(CategoryColors)) {
      expect(contrast(pair[scheme].text, Colors[scheme].backgroundElement)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)('%s: the badge glowSoft composite clears AA under text and textSecondary', (scheme) => {
    const match = CelebrationColors.glowSoft.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    expect(match).not.toBeNull();
    const [, r, g, b, alpha] = match as unknown as [string, string, string, string, string];
    const a = parseFloat(alpha);
    const [br, bg, bb] = rgb(Colors[scheme].background);
    const over = (channel: number, back: number) => Math.round(channel * a + back * (1 - a));
    const composite = '#' + [over(+r, br), over(+g, bg), over(+b, bb)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    expect(contrast(Colors[scheme].text, composite)).toBeGreaterThanOrEqual(AA);
    expect(contrast(Colors[scheme].textSecondary, composite)).toBeGreaterThanOrEqual(AA);
  });
});
