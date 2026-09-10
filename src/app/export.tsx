import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getDatabase } from '@/db';
import { exportAndShare, ExportFormat } from '@/export/fileExport';
import { useTheme } from '@/hooks/use-theme';

const FORMATS: { format: ExportFormat; label: string; description: string }[] = [
  { format: 'sqlite', label: 'SQLite database', description: 'A direct copy of the app database. Highest fidelity — recommended for analysis.' },
  { format: 'json', label: 'JSON bundle', description: 'A single JSON file with every row, including anything deleted.' },
  { format: 'csv', label: 'CSV set (zipped)', description: 'One CSV per table plus a README, zipped.' },
];

/**
 * Export (spec §8): reachable in two taps from the home screen (Home →
 * Export → a format, which opens the system share sheet immediately) — the
 * second tap *is* the share. Three lossless formats; the pure builders that
 * decide what goes in each live in `src/export/`, this screen is just the
 * glue that calls them and shows in-progress/error state.
 */
export default function ExportScreen() {
  const theme = useTheme();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const runExport = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await exportAndShare(getDatabase(), format);
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Export</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Your data stays open to analysis, always. Nothing is ever locked in.
        </ThemedText>

        {FORMATS.map(({ format, label, description }) => (
          <Pressable
            key={format}
            onPress={() => runExport(format)}
            disabled={busy !== null}
            style={[styles.card, { backgroundColor: theme.backgroundElement, opacity: busy !== null && busy !== format ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null, busy: busy === format }}
          >
            <ThemedText type="subtitle">{label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {description}
            </ThemedText>
            {busy === format && <ActivityIndicator style={styles.spinner} />}
          </Pressable>
        ))}
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
    gap: Spacing.three,
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  spinner: {
    marginTop: Spacing.one,
  },
});
