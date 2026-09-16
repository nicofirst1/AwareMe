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
 * already a hard runtime peer of expo-router (see DECISIONS.md).
 */

const BRANDEN_URL = 'https://nathanielbranden.com/';

export default function AboutMethodScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">About the method</ThemedText>

          <ThemedText type="default">
            This app is built around sentence completion, a self-reflection technique developed by the psychologist
            Nathaniel Branden. You are given the start of a sentence and asked to finish it, quickly, several times
            in a row, without pausing to judge what comes out.
          </ThemedText>

          <ThemedText type="default">
            The value is in the pattern across many endings, not in any single one. Fast, repeated, unedited writing
            tends to surface things a slower, more careful answer would filter out. Repetition and nonsense along
            the way are expected, not a sign you are doing it wrong.
          </ThemedText>

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
});
