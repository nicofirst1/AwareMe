import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getDatabase } from '@/db';
import { exportAndShare, ExportFormat } from '@/export/fileExport';
import { useTheme } from '@/hooks/use-theme';

// Outline Ionicons (2026-09-11, ui-audit-2026-09-11.md cycle 4), same sparse
// decorative idiom as index.tsx's secondary tiles — a scan anchor per
// format, not a replacement for the label (accessible name stays the text).
const FORMATS: { format: ExportFormat; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    format: 'sqlite',
    label: 'SQLite database',
    description: 'A direct copy of the app database. Highest fidelity — recommended for analysis.',
    icon: 'server-outline',
  },
  {
    format: 'json',
    label: 'JSON bundle',
    description: 'A single JSON file with every row, including anything deleted.',
    icon: 'code-slash-outline',
  },
  { format: 'csv', label: 'CSV set (zipped)', description: 'One CSV per table plus a README, zipped.', icon: 'grid-outline' },
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

        {FORMATS.map(({ format, label, description, icon }) => (
          <Pressable
            key={format}
            onPress={() => runExport(format)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null, busy: busy === format }}
          >
            <Card style={[styles.card, { opacity: busy !== null && busy !== format ? 0.5 : 1 }]}>
              <ThemedView style={styles.cardHeader}>
                <Ionicons name={icon} size={20} color={theme.textSecondary} />
                <ThemedText type="subtitle">{label}</ThemedText>
              </ThemedView>
              <ThemedText type="small" themeColor="textSecondary">
                {description}
              </ThemedText>
              {busy === format && <ActivityIndicator style={styles.spinner} />}
            </Card>
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
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spinner: {
    marginTop: Spacing.one,
  },
});
