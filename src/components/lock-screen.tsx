import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Rendered by `_layout.tsx` in place of the app's normal routes while
 * `useAppLock` reports locked (§9, ticket 18). Deliberately content-free —
 * no stem text, no hint of what's inside — same lock-screen-privacy
 * reasoning spec §6.4 already applies to notification copy.
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Locked</ThemedText>
        <Pressable
          onPress={onUnlock}
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
        >
          <ThemedText type="subtitle">Unlock</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
});
