import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, Fonts, MaxContentWidth, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, type TimeOfDay } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { validateStemText } from '@/session/stemValidation';

// See stem-edit.tsx's identical comment: derived from the palette so the
// two category pickers can never drift apart (ui-audit-2026-09-11.md §2).
const CATEGORIES = Object.keys(CategoryColors) as CategoryName[];

// Same morning/evening/none picker as stem-edit.tsx, applied to the whole batch.
const TIME_OF_DAY_OPTIONS = ['none', 'morning', 'evening'] as const;
type TimeOfDayOption = (typeof TIME_OF_DAY_OPTIONS)[number];

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
 *
 * w1-t7 (s2-9): the paste runs through the same checks Add runs
 * (`validateStemText`, against the existing texts plus the lines already
 * accepted from this paste, so intra-paste duplicates are caught too).
 * Skipped lines are reported in the preview; only accepted lines reach
 * `bulkImportStems` — the repository call itself stays unconditional (the
 * export round-trip seeds through it, contract 5).
 */
export default function StemImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);

  const [raw, setRaw] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayOption>('none');

  const lines = useMemo(() => linesToStems(raw), [raw]);

  // Same semantics as Add's duplicate check (stem-edit.tsx): existing texts
  // come from `listStemTexts` (deleted rows and meta rows excluded), and a
  // line is checked against them PLUS the lines accepted earlier in this
  // paste. Validation failures skip the line; warnings (terminal
  // punctuation) still accept, exactly as Add does.
  const accepted = useMemo(() => {
    const seen = new Set(repo.listStemTexts());
    const kept: string[] = [];
    for (const line of lines) {
      if (validateStemText(line, [...seen]).ok) {
        kept.push(line);
        seen.add(line);
      }
    }
    return { kept, skipped: lines.length - kept.length };
  }, [repo, lines]);

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
    if (accepted.kept.length === 0) return;
    const resolvedTimeOfDay: TimeOfDay | null = timeOfDay === 'none' ? null : timeOfDay;
    const count = repo.bulkImportStems(accepted.kept, category, resolvedTimeOfDay);
    Alert.alert('Imported', `Added ${count} stem${count === 1 ? '' : 's'}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Import stems" backLabel="Close" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="small" themeColor="textSecondary">
            One stem per line.
          </ThemedText>

          <Button label="Open a .txt file" onPress={openFile} />

          <TextInput
            value={raw}
            onChangeText={setRaw}
            placeholder="Paste stems here, one per line"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Stems to import"
          />

          <ThemedText type="eyebrow">Category (optional, applied to all)</ThemedText>
          <ThemedView style={styles.chipRow}>
            <FilterChip label="None" selected={category === null} onPress={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <FilterChip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} category={c} />
            ))}
          </ThemedView>

          <ThemedText type="eyebrow">Time of day (applied to all)</ThemedText>
          <ThemedView style={styles.chipRow}>
            {TIME_OF_DAY_OPTIONS.map((o) => (
              <FilterChip
                key={o}
                label={o === 'none' ? 'None' : o === 'morning' ? 'Morning' : 'Evening'}
                selected={timeOfDay === o}
                onPress={() => setTimeOfDay(o)}
              />
            ))}
          </ThemedView>

          <ThemedText type="subtitle">
            {accepted.kept.length} stem{accepted.kept.length === 1 ? '' : 's'} to import
          </ThemedText>

          {accepted.skipped > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {accepted.skipped === 1
                ? '1 line skipped (duplicate or invalid).'
                : `${accepted.skipped} lines skipped (duplicates or invalid).`}
            </ThemedText>
          )}

          {accepted.kept.length > 0 && (
            <ThemedView style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
              {accepted.kept.map((line, i) => (
                <ThemedText key={i} type="small">
                  {line}
                </ThemedText>
              ))}
            </ThemedView>
          )}

          <Button label="Import" onPress={commit} disabled={accepted.kept.length === 0} variant="primary" />
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
    borderRadius: Radius.small,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  preview: {
    padding: Spacing.three,
    borderRadius: Radius.medium,
    gap: Spacing.one,
  },
});
