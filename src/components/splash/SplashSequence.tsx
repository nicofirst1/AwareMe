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
 * Both text slots (wordmark, quote) are reserved from the overlay's first
 * frame: their Views render immediately with opacity 0 and animate to 1 at
 * their beats. (Owner report 2026-09-25: mounting each text element
 * re-centered the overlay column and hopped the logo upwards — twice.)
 *
 * The logo sits in its OWN absolutely-positioned slot pinned to the
 * screen's exact center, and the text stack is a separate absolute slot
 * below it — nothing is in-flow, so no child's size or mount can move the
 * logo. (Owner report 2026-09-25, second pass: centering the logo+text
 * column as one in-flow stack still hopped the logo at the native→JS
 * handoff — the column's center sat half the text stack (46px) above the
 * screen center, so the handoff read as the logo jumping up. Measured on
 * the owner's delivered APK: native splash logo top y=259 → overlay
 * y=214, before any text is visible; banked with cycle t7-fixes.)
 *
 * The native splash (app.json, expo-splash-screen plugin) hands off to
 * this overlay seamlessly: the overlay's background is the theme's
 * `background` token — the same cream (#fef5e8, `Palette.cream.base`) the
 * native splash paints in light mode, the same black
 * (`Colors.dark.background`) in dark — and the logo is the same
 * transparent-background artwork (`android-icon-foreground.png`) at the
 * same effective size AND the same position (dead-center, matching the
 * native splash's centered `imageWidth: 280` render), so launcher →
 * native splash → animated sequence read as one continuous identity.
 *
 * Reduced motion (house pattern from `write.tsx`'s settle animation): when
 * the OS says reduce motion, every animation is skipped with
 * `setValue(1)` — the composed final state (logo + wordmark + quote) is
 * shown statically for a short hold, then the overlay clears without a
 * fade. Nothing moves at any point.
 */

/**
 * PLACEHOLDER QUOTE (v14 issue 01: the owner asked for "any stub" for now).
 * Owner-picked stub 2026-09-25 (Telegram, packet-11 t7): "A daily practice
 * for self-awareness" — the Home tagline's line (index.tsx), original text,
 * never programme or Branden content (spec §5.1). This constant is the only
 * place the quote lives; it stays the placeholder — swap its value when the
 * owner picks the real one.
 */
export const SPLASH_QUOTE_PLACEHOLDER = 'A daily practice for self-awareness';

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

  return (
    <Animated.View
      testID="splash-overlay"
      style={[styles.fill, { backgroundColor: theme.background }, { opacity: overlayAnim }]}
      // The entrance beat is decorative: the home screen behind already
      // carries the accessible name ("AwareMe" title), so the overlay hides
      // its subtree from screen readers instead of announcing a duplicate —
      // and a reduce-motion/screen-reader user is never held up by it (the
      // sequence clears itself either way).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* The logo's slot is absolute and screen-centered (see docblock):
          its position never depends on the text slots. */}
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

      {/* Reserved text slots in their own absolute stack below the logo's
          slot: rendered from mount with opacity 0 (the animated values'
          start), so nothing re-flows mid-sequence. The phase machine drives
          only their opacity; the reduce-motion path sets every value to 1,
          so the slots show with the final state. The stack's offset (110 =
          center + 110) preserves the shipped composition's wordmark
          position exactly (border-box top at screen center + 110, measured
          in the t7-fixes pre-fix bank); only the logo moved, down to the
          native splash's dead-center. */}
      <Animated.View testID="splash-text-stack" style={styles.textStack}>
        <Animated.View testID="splash-wordmark" style={[{ opacity: nameAnim }]}>
          <ThemedText type="title">{WORDMARK}</ThemedText>
        </Animated.View>

        <Animated.View testID="splash-quote" style={[styles.quote, { opacity: quoteAnim }]}>
          <ThemedText type="default" themeColor="textSecondary">
            {SPLASH_QUOTE_PLACEHOLDER}
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Dead-center on the screen: the native splash renders the same artwork
  // at `imageWidth: 280` centered, so the handoff shows no logo movement.
  // Half-size negative margins (not a transform) keep the logoIn scale
  // animation free to own `transform` alone.
  logoWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -LOGO_SIZE / 2,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  // The text slots' own absolute layer below the logo slot; 110 preserves
  // the shipped wordmark position (center + 110 = the in-flow column's
  // wordmark border-box top: column top center-186 + logo 280 + margin 16).
  textStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: 110,
    alignItems: 'center',
  },
  quote: {
    marginTop: Spacing.two,
  },
});
