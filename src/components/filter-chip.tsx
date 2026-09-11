import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CategoryColors, MinTouchTarget, Spacing, type CategoryName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A small selectable chip (filter/category/preset toggle) — used across
 * History, Review, Settings, Stems, and stem authoring/import for exactly
 * the same "pick one of a short row of options" interaction. Consolidated
 * here rather than duplicated per screen (spec §10, ticket 19) with a
 * `minHeight` tap target that the label's small text alone wouldn't reach.
 *
 * `category` (2026-09-11 addition) colors the chip per `CategoryColors` —
 * selected chips are filled with the category color, unselected chips are
 * outlined in it, so the selected/unselected distinction survives per-
 * category coloring (used by the stems screen's category filter row).
 */
export function FilterChip({
  label,
  selected,
  onPress,
  category,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  category?: CategoryName;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const categoryColors = category ? CategoryColors[category][scheme === 'dark' ? 'dark' : 'light'] : null;

  const style = categoryColors
    ? selected
      ? { backgroundColor: categoryColors.bg, borderWidth: 1, borderColor: categoryColors.text }
      : { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: categoryColors.bg }
    : { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement };

  return (
    <Pressable onPress={onPress} style={[styles.chip, style]} accessibilityRole="button" accessibilityState={{ selected }}>
      <ThemedText type="small" style={categoryColors && selected ? { color: categoryColors.text } : undefined}>
        {label}
      </ThemedText>
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
