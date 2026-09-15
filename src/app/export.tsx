import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { getDatabase } from '@/db';
import { exportAndShare, ExportFormat } from '@/export/fileExport';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
  const scheme = useColorScheme();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  // Icon color role per C5/E2 (layout audit 2026-09-15): the card icons
  // inherit the screen's category hue — the same assertiveness hue Home's
  // Export tile carries (color-audit-2026-09-11.md §2A, "distribution not
  // invention") — instead of an unexplained third grey role. Contrast is
  // documented in theme.ts (7.55:1 light / 8.95:1 dark, above AA).
  const iconColor = CategoryColors.assertiveness[scheme === 'dark' ? 'dark' : 'light'].text;

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
        <ScreenHeader title="Export" />
        <ThemedView style={styles.content}>
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
                  <Ionicons name={icon} size={20} color={iconColor} />
                  <ThemedText type="subtitle">{label}</ThemedText>
                </ThemedView>
                <ThemedText type="small" themeColor="textSecondary">
                  {description}
                </ThemedText>
                {busy === format && <ActivityIndicator style={styles.spinner} />}
              </Card>
            </Pressable>
          ))}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ScreenHeader carries the x24 column + top spacing itself (LC2), so the
  // safe area stays paddingless and the content below insets itself; the
  // inter-block rhythm is 24 throughout (LC3, fixes E3's 16pt gap).
  safeArea: {
    flex: 1,
    gap: Spacing.four,
  },
  content: {
    flex: 1,
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
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
