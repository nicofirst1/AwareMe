import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Centered "nothing here" message (2026-09-11 design-system foundation,
 * ui-audit-2026-09-11.md cycle 1) — replaces the 4 one-off `ThemedText`
 * renders in stems.tsx/history.tsx (×2)/review.tsx, each with its own
 * ad-hoc placement and no shared vertical padding. Works both as a
 * `FlatList`'s `ListEmptyComponent` and as a plain inline conditional.
 */
export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <ThemedText type="default" themeColor="textSecondary">
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
});
