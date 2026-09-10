import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';

const CATEGORIES = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'] as const;

/** One stem per non-blank line (§6.6). Trimmed; blank lines dropped. */
function linesToStems(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Bulk import (§6.6): paste text or open a `.txt` file, one stem per line,
 * `origin='imported'`. Shows a preview + count before committing — nothing
 * is written until the user taps Import.
 */
export default function StemImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);

  const [raw, setRaw] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const lines = useMemo(() => linesToStems(raw), [raw]);

  const openFile = async () => {
    try {
      const result = await File.pickFileAsync({ mimeTypes: 'text/plain' });
      if (result.canceled) return;
      const contents = await result.result.text();
      setRaw(contents);
    } catch {
      Alert.alert('Could not read that file.');
    }
  };

  const commit = () => {
    if (lines.length === 0) return;
    const count = repo.bulkImportStems(lines, category);
    Alert.alert('Imported', `Added ${count} stem${count === 1 ? '' : 's'}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Import stems</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            One stem per line.
          </ThemedText>

          <Pressable onPress={openFile} style={[styles.button, { backgroundColor: theme.backgroundElement }]} accessibilityRole="button">
            <ThemedText type="default">Open a .txt file</ThemedText>
          </Pressable>

          <TextInput
            value={raw}
            onChangeText={setRaw}
            placeholder="Paste stems here, one per line"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Stems to import"
          />

          <ThemedText type="small" themeColor="textSecondary">
            Category (optional, applied to all)
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            <FilterChip label="None" selected={category === null} onPress={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <FilterChip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ThemedView>

          <ThemedText type="subtitle">
            {lines.length} stem{lines.length === 1 ? '' : 's'} to import
          </ThemedText>

          {lines.length > 0 && (
            <ThemedView style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
              {lines.map((line, i) => (
                <ThemedText key={i} type="small">
                  {line}
                </ThemedText>
              ))}
            </ThemedView>
          )}

          <Pressable
            onPress={commit}
            disabled={lines.length === 0}
            style={[styles.button, { backgroundColor: theme.backgroundElement, opacity: lines.length === 0 ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: lines.length === 0 }}
          >
            <ThemedText type="subtitle">Import</ThemedText>
          </Pressable>
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 140,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  preview: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});
