import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A small selectable chip (filter/category/preset toggle) — used across
 * History, Review, Settings, Stems, and stem authoring/import for exactly
 * the same "pick one of a short row of options" interaction. Consolidated
 * here rather than duplicated per screen (spec §10, ticket 19) with a
 * `minHeight` tap target that the label's small text alone wouldn't reach.
 */
export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
