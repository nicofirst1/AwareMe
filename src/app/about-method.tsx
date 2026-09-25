import * as Linking from 'expo-linking';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * "About the method" (spec §5.1: onboarding MUST credit Branden and point
 * to his books; this screen SHOULD do the same at more length, and is
 * reachable later from settings). Original prose only — no stem lists or
 * copyrighted phrasing quoted from his books, per §5.1's hard constraint.
 *
 * v12 feedback round (issue 06, 2026-09-16): the two book titles are
 * tappable links to https://nathanielbranden.com/ via `expo-linking`'s
 * `openURL` — same user-initiated hop pattern as about.tsx's programme
 * link (c04), with accessible labels stating the row opens the website.
 * The app itself stays offline. No new dependency: expo-linking was
 * already a hard runtime peer of expo-router (see docs/DECISIONS.md).
 *
 * p11 t7-fixes (owner instruction on Telegram 2026-09-25, rescoping the
 * original About-screen steer): the intro's three content sections live
 * HERE. The ported "About the method" section is the screen's opening
 * prose — no section title, the page title already says it — superseding
 * the two old opening paragraphs (same duplication class the owner
 * flagged on the About screen); "How it works" and "Include an evening
 * practice?" follow with their titles. Copy is verbatim from the shipped
 * post-t4 intro copy (onboarding.tsx tabs 1–2 + the shared
 * EveningPracticeCard — the p11-t4 normalizations already applied; the
 * why-same-stems section is deliberately not ported, owner's list). The
 * no-interpretation paragraph and the Branden books paragraph stay (spec
 * §5.1; the books links stay). Titles use the app's in-page section-title
 * idiom (subtitle); body stays in this screen's default-text tone.
 */

const BRANDEN_URL = 'https://nathanielbranden.com/';

export default function AboutMethodScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">About the method</ThemedText>

          {/* p11 t7-fixes: the intro's "About the method" section as the
              screen's opening prose — verbatim from the shipped intro copy
              (see docblock), no section title (the page title above). */}
          <ThemedText type="default">
            Without self-awareness, we often run on autopilot, reacting to life out of habit,
            repeating the same mistakes, and feeling confused about why we feel stuck.
          </ThemedText>
          <ThemedText type="default">
            This app uses the sentence completion method, developed by psychologist Nathaniel
            Branden, to break that cycle. Actively practicing self-awareness has a profound
            impact: it shifts you from being a passenger in your life to the driver. It helps
            you uncover hidden motivations, make better daily decisions, and live with
            intention rather than confusion.
          </ThemedText>
          <ThemedText type="default">
            The practice is small but powerful. Just a few minutes in the morning to write, and
            a brief moment in the evening to reflect.
          </ThemedText>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">How it works</ThemedText>
            <ThemedText type="default">
              You’ll get the start of a sentence (a &quot;stem&quot;) and finish it several times, as
              quickly as possible. Write whatever comes to mind first, without judging it.
            </ThemedText>
            <ThemedText type="default">
              Don’t polish. Don’t overthink. Just write.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Include an evening practice?</ThemedText>
            <ThemedText type="default">
              The morning practice brings your hidden thoughts to the surface; the evening practice
              grounds them in reality.
            </ThemedText>
            <ThemedText type="default">
              By adding the evening routine, you take a short moment to reread what you wrote that
              morning and reflect on your day. Did your actions align with your morning insights? Did
              you notice the patterns you wrote about?
            </ThemedText>
            <ThemedText type="default">
              The app works just as well without it, but the evening practice closes the loop.
            </ThemedText>
          </ThemedView>

          <ThemedText type="default">
            This app does not interpret, score, or comment on what you write. It only gives you a quiet place to
            write it and keeps it on your device.
          </ThemedText>

          <ThemedText type="default">
            Branden wrote about this method at length in his own books, including{' '}
            <ThemedText
              type="default"
              style={styles.linkText}
              onPress={() => Linking.openURL(BRANDEN_URL)}
              accessibilityRole="link"
              accessibilityLabel="The Six Pillars of Self-Esteem, opens the nathanielbranden.com website"
            >
              The Six Pillars of Self-Esteem
            </ThemedText>{' '}
            and{' '}
            <ThemedText
              type="default"
              style={styles.linkText}
              onPress={() => Linking.openURL(BRANDEN_URL)}
              accessibilityRole="link"
              accessibilityLabel="The Art of Living Consciously, opens the nathanielbranden.com website"
            >
              The Art of Living Consciously
            </ThemedText>
            . If this practice is useful to you, his own writing is the place to go deeper. The stems in this app
            are original material written in the spirit of his method, not excerpts from his work.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  backHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  // Link affordance for the two book titles: the c04 rows signal "tappable"
  // with a chevron; inline text links take the quietest standard cue, an
  // underline, instead. Text colour unchanged (§10: typography carries the
  // design; no second colour surface on a quiet text screen).
  linkText: {
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
  // The ported intro sections (t7-fixes): title + body paragraphs at the
  // tight internal rhythm, inside the screen's 16pt scroll gap.
  section: {
    backgroundColor: 'transparent',
    gap: Spacing.two,
  },
});
