import { useRouter, Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { selectStem } from '@/session/stemSelection';

/**
 * Picks a stem by the weighted rotation (§6.2) and navigates straight to
 * the writing session on it — "start now". Selection itself is the pure
 * `selectStem`; this is just the glue that supplies its (candidates,
 * history, now, seed) from the repository and the clock.
 */
function pickStemNow(): { id: string; text: string } | null {
  const repo = getRepository();
  const candidates = repo.listActiveStems();
  const history = repo.getRecentStemUsage();
  const picked = selectStem(candidates, history, new Date().toISOString(), Date.now());
  if (!picked) return null;
  const full = candidates.find((s) => s.id === picked.id);
  return full ? { id: full.id, text: full.text } : null;
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  const startNow = () => {
    const stem = pickStemNow();
    if (!stem) return; // no stems at all — nothing to start
    router.push({ pathname: '/write', params: { stemId: stem.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Six Endings</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          A quiet place to finish a sentence.
        </ThemedText>
        <Pressable
          onPress={startNow}
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
        >
          <ThemedText type="subtitle">Start now</ThemedText>
        </Pressable>
        <Link href="/stems">
          <ThemedText type="default">Browse stems</ThemedText>
        </Link>
        <Link href="/history">
          <ThemedText type="default">History</ThemedText>
        </Link>
        <Link href="/review">
          <ThemedText type="default">Review</ThemedText>
        </Link>
        <Link href="/export">
          <ThemedText type="default">Export</ThemedText>
        </Link>
        <Link href="/import">
          <ThemedText type="default">Import</ThemedText>
        </Link>
        {__DEV__ && (
          <Link href="/debug">
            <ThemedText type="small" themeColor="textSecondary">
              Debug: dump all tables
            </ThemedText>
          </Link>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});
