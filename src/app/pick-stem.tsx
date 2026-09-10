import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getRepository, StemRow } from '@/db';
import { useTheme } from '@/hooks/use-theme';

/**
 * Temporary stem picker (ticket 04: "a minimal way to reach the session on
 * a chosen stem is acceptable"). Superseded by the real stem library and
 * weighted selection in M3 (ticket 06/07) — this exists only so the writing
 * session has a way to start.
 */
export default function PickStemScreen() {
  const router = useRouter();
  const theme = useTheme();
  const stems = getRepository().listActiveStems();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Choose a stem
        </ThemedText>
        <FlatList<StemRow>
          data={stems}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/write', params: { stemId: item.id } })}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
              accessibilityRole="button"
            >
              <ThemedText type="default">{item.text}</ThemedText>
            </Pressable>
          )}
        />
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
  },
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
});
