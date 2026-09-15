import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { getDatabase } from '@/db';
import { pickAndImportBundle } from '@/export/fileImport';
import { ImportMode } from '@/export/importBundle';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Import (ticket 15): restores a previously exported JSON bundle, with a
 * choice between merge (skip anything already present, by id) and replace
 * (wipe first). Replace is destructive and irreversible from inside the
 * app, so it gets the same confirmation pattern stem deletion uses
 * (`Alert.alert`, ticket 08).
 */
export default function ImportScreen() {
  const scheme = useColorScheme();
  const [busy, setBusy] = useState<ImportMode | null>(null);

  // Icon color role per C5/E2 (layout audit 2026-09-15): the card icons
  // inherit the screen's category hue — the same purpose hue Home's Import
  // tile carries (color-audit-2026-09-11.md §2A, "distribution not
  // invention") — instead of an unexplained grey role. Contrast is
  // documented in theme.ts (9.53:1 light / 8.63:1 dark, above AA).
  const iconColor = CategoryColors.purpose[scheme === 'dark' ? 'dark' : 'light'].text;

  const runImport = async (mode: ImportMode) => {
    setBusy(mode);
    try {
      const result = await pickAndImportBundle(getDatabase(), mode);
      if (result === null) return; // user cancelled the file picker
      Alert.alert('Import complete', `Added ${result.inserted} row${result.inserted === 1 ? '' : 's'}, skipped ${result.skipped} already present.`);
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmReplace = () => {
    Alert.alert(
      'Replace all data?',
      'Everything currently in the app will be deleted and replaced with the contents of the file you pick. This cannot be undone from inside the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => runImport('replace') },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Import" />
        <ThemedView style={styles.content}>
          <ThemedText type="default" themeColor="textSecondary">
            Restore a JSON bundle previously produced by Export.
          </ThemedText>

          <Pressable
            onPress={() => runImport('merge')}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'merge' }}
          >
            <Card style={[styles.card, { opacity: busy !== null && busy !== 'merge' ? 0.5 : 1 }]}>
              {/* Plain View, not ThemedView: a ThemedView inside a Card
                  would repaint the screen background over the card fill
                  (expo-feedback 2026-09-15, issue 01). */}
              <View style={styles.cardHeader}>
                <Ionicons name="git-merge-outline" size={20} color={iconColor} />
                <ThemedText type="subtitle">Merge</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Adds rows from the file that aren&apos;t already here (matched by id). Nothing existing is changed or removed.
              </ThemedText>
              {busy === 'merge' && <ActivityIndicator style={styles.spinner} />}
            </Card>
          </Pressable>

          <Pressable
            onPress={confirmReplace}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'replace' }}
          >
            <Card style={[styles.card, { opacity: busy !== null && busy !== 'replace' ? 0.5 : 1 }]}>
              {/* Plain View, not ThemedView: a ThemedView inside a Card
                  would repaint the screen background over the card fill
                  (expo-feedback 2026-09-15, issue 01). */}
              <View style={styles.cardHeader}>
                <Ionicons name="swap-horizontal-outline" size={20} color={iconColor} />
                <ThemedText type="subtitle">Replace</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Deletes everything currently in the app, then loads the file in its place.
              </ThemedText>
              {busy === 'replace' && <ActivityIndicator style={styles.spinner} />}
            </Card>
          </Pressable>
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
  // inter-block rhythm is 24 throughout (LC3).
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
