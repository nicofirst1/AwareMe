import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getRepository, ALL_TABLES } from '@/db';

/**
 * Developer-only: dumps every row of every table. Not part of the product
 * surface (spec §10's restraint doesn't apply here) — this screen exists so
 * M1's data foundation can be verified by eye before there's a writing UI.
 */
export default function DebugScreen() {
  const repository = getRepository();
  const dump = repository.dumpAllTables();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Debug: all tables</ThemedText>
          {ALL_TABLES.map((table) => (
            <ThemedView key={table} style={styles.section}>
              <ThemedText type="subtitle">
                {table} ({dump[table].length})
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" selectable>
                {JSON.stringify(dump[table], null, 2)}
              </ThemedText>
            </ThemedView>
          ))}
        </ScrollView>
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.one,
  },
});
