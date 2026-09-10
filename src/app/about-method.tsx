import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * "About the method" (spec §5.1: onboarding MUST credit Branden and point
 * to his books; this screen SHOULD do the same at more length, and is
 * reachable later from settings). Original prose only — no stem lists or
 * copyrighted phrasing quoted from his books, per §5.1's hard constraint.
 */
export default function AboutMethodScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
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
            <ThemedText type="default" style={styles.italic}>
              The Six Pillars of Self-Esteem
            </ThemedText>{' '}
            and{' '}
            <ThemedText type="default" style={styles.italic}>
              The Art of Living Consciously
            </ThemedText>
            . If this practice is useful to you, his own writing is the place to go deeper — the stems in this app
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  italic: {
    fontStyle: 'italic',
  },
});
