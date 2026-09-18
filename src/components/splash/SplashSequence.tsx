import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  StyleSheet,
  useAnimatedValue,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The animated entrance sequence (v14 issue 01, owner feedback 2026-09-18:
 * "the logo moves, the AwareMe wordmark appears, then a quote fades in").
 * An overlay hosted by the home screen — it plays once per home mount
 * (i.e. once per app open), then removes itself, revealing the home screen
 * underneath.
 *
 * Choreography (all numbers in TIMING below):
 *   logo  — the splash logo fades in while settling 0.86→1 in scale
 *   name  — the AwareMe wordmark fades in
 *   quote — the quote fades in
 *   exit  — the whole overlay fades away, then unmounts
 *
 * The native splash (app.json, expo-splash-screen plugin) hands off to
 * this overlay seamlessly: the overlay's background is the theme's
 * `background` token — the same cream (#fef5e8, `Palette.cream.base`) the
 * native splash paints in light mode, the same black
 * (`Colors.dark.background`) in dark — and the logo is the same
 * transparent-background artwork (`android-icon-foreground.png`) at the
 * same effective size, so launcher → native splash → animated sequence
 * read as one continuous identity.
 *
 * Reduced motion (house pattern from `write.tsx`'s settle animation): when
 * the OS says reduce motion, every animation is skipped with
 * `setValue(1)` — the composed final state (logo + wordmark + quote) is
 * shown statically for a short hold, then the overlay clears without a
 * fade. Nothing moves at any point.
 */

/**
 * PLACEHOLDER QUOTE (v14 issue 01: the owner asked for "any stub" for now).
 * The app's main quote is an owner decision; this stub is original text
 * written for this ticket — never programme or Branden content (spec §5.1).
 * This constant is the only place the quote lives; swap its value when the
 * owner picks the real one.
 */
export const SPLASH_QUOTE_PLACEHOLDER = 'Meet yourself on the page.';

/** The AwareMe wordmark, sequenced between the logo and the quote. */
const WORDMARK = 'AwareMe';

/**
 * Logo size in dp. The foreground artwork occupies ~45% of its canvas
 * (measured: opaque bbox 463×443 of 1024), so this renders the visible
 * logo at ~126dp — clearly larger than the old native splash's 76dp
 * (app.json's previous `imageWidth: 76`), and sized to match app.json's
 * new `imageWidth: 280` exactly, which is what keeps the native→JS
 * handoff seamless. Change both together.
 */
const LOGO_SIZE = 280;

/**
 * Choreography timings in ms. `nameAt`/`quoteAt`/`exitAt` are absolute
 * offsets from mount; the others are durations.
 */
const TIMING = {
  logoIn: 420,
  nameAt: 560,
  nameIn: 380,
  quoteAt: 1120,
  quoteIn: 420,
  exitAt: 2450,
  fadeOut: 340,
  /** Reduced motion: how long the static final composition stays visible. */
  staticHold: 900,
} as const;

type Phase = 'logo' | 'name' | 'quote' | 'exit' | 'done';

/**
 * Phase rank drives mount gating below: the wordmark joins from the `name`
 * phase onward, the quote from `quote` onward; earlier elements stay
 * mounted, so the sequence reads as one composition assembling itself.
 */
const PHASE_RANK: Record<Phase, number> = { logo: 0, name: 1, quote: 2, exit: 3, done: 4 };

export function SplashSequence() {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('logo');
  // `null` while the OS setting is being read — the sequence holds its
  // first frame (logo, still invisible) until the answer arrives, so a
  // reduce-motion user never sees a single animated frame.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  // One animated value per element: 0 = invisible, 1 = settled.
  const logoAnim = useAnimatedValue(0);
  const nameAnim = useAnimatedValue(0);
  const quoteAnim = useAnimatedValue(0);
  const overlayAnim = useAnimatedValue(1);

  // The OS reduce-motion setting (same read as `write.tsx`'s settle/badge
  // animations). Read once on mount — the whole sequence lives a couple of
  // seconds, so a mid-sequence settings change is not a real case.
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The phase machine: each phase schedules the next (setTimeout) and runs
  // its element's animation. Reduced motion never enters the machine — it
  // settles every value at once and clears the overlay after the static
  // hold. Every setState runs inside a timer callback, so the effect body
  // itself never sets state (keeps the `set-state-in-effect` lint baseline
  // untouched), and the dismissal is timer-driven rather than riding the
  // animation's completion callback, so the sequence ends deterministically.
  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      logoAnim.setValue(1);
      nameAnim.setValue(1);
      quoteAnim.setValue(1);
      const timer = setTimeout(() => setPhase('done'), TIMING.staticHold);
      return () => clearTimeout(timer);
    }
    switch (phase) {
      case 'logo': {
        Animated.timing(logoAnim, { toValue: 1, duration: TIMING.logoIn, useNativeDriver: true }).start();
        const timer = setTimeout(() => setPhase('name'), TIMING.nameAt);
        return () => clearTimeout(timer);
      }
      case 'name': {
        Animated.timing(nameAnim, { toValue: 1, duration: TIMING.nameIn, useNativeDriver: true }).start();
        const timer = setTimeout(() => setPhase('quote'), TIMING.quoteAt - TIMING.nameAt);
        return () => clearTimeout(timer);
      }
      case 'quote': {
        Animated.timing(quoteAnim, { toValue: 1, duration: TIMING.quoteIn, useNativeDriver: true }).start();
        const timer = setTimeout(() => setPhase('exit'), TIMING.exitAt - TIMING.quoteAt);
        return () => clearTimeout(timer);
      }
      case 'exit': {
        Animated.timing(overlayAnim, { toValue: 0, duration: TIMING.fadeOut, useNativeDriver: true }).start();
        const timer = setTimeout(() => setPhase('done'), TIMING.fadeOut + 40);
        return () => clearTimeout(timer);
      }
      default:
        return undefined; // 'done': the overlay is gone (render returns null)
    }
  }, [phase, reduceMotion, logoAnim, nameAnim, quoteAnim, overlayAnim]);

  if (phase === 'done') {
    return null;
  }

  const showWordmark = reduceMotion === true || PHASE_RANK[phase] >= PHASE_RANK.name;
  const showQuote = reduceMotion === true || PHASE_RANK[phase] >= PHASE_RANK.quote;

  return (
    <Animated.View
      testID="splash-overlay"
      style={[styles.overlay, styles.fill, { backgroundColor: theme.background }, { opacity: overlayAnim }]}
      // The entrance beat is decorative: the home screen behind already
      // carries the accessible name ("AwareMe" title), so the overlay hides
      // its subtree from screen readers instead of announcing a duplicate —
      // and a reduce-motion/screen-reader user is never held up by it (the
      // sequence clears itself either way).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        testID="splash-logo"
        style={[
          styles.logoWrap,
          { opacity: logoAnim },
          { transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] },
        ]}
      >
        {/* Same house rule as index.tsx's header icon: relative require, not
            the `@/assets` alias (the jest-expo tsconfig mapping shadows it). */}
        <Image
          source={require('../../../assets/images/android-icon-foreground.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {showWordmark && (
        <Animated.View testID="splash-wordmark" style={[styles.wordmark, { opacity: nameAnim }]}>
          <ThemedText type="title">{WORDMARK}</ThemedText>
        </Animated.View>
      )}

      {showQuote && (
        <Animated.View testID="splash-quote" style={[styles.quote, { opacity: quoteAnim }]}>
          <ThemedText type="default" themeColor="textSecondary">
            {SPLASH_QUOTE_PLACEHOLDER}
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    marginTop: Spacing.three,
  },
  quote: {
    marginTop: Spacing.two,
  },
});
