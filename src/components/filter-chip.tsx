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
 * `category` (2026-09-11 addition, saturated outline per color-audit-2026-
 * 09-11.md cycle 2) colors the chip per `CategoryColors` — selected chips
 * are filled with the category color, unselected chips are outlined and
 * labeled in the saturated `.text` swatch (not the pale `.bg` tint, which
 * measured near-invisible), so the selected/unselected distinction survives
 * per-category coloring (used by the stems/history screens' filter rows).
 *
 * `color` (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 * cycle 1) generalizes the same `{ bg, text }` shape `category` already
 * resolves internally, for a chip that wants a specific hex pair not tied
 * to a stem category (e.g. an accent-colored filter chip). Backward
 * compatible: omitting both `category` and `color` keeps today's plain
 * grey selected/unselected behavior; passing both is not meaningful and
 * `category` wins.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  category,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  category?: CategoryName;
  color?: { bg: string; text: string };
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const chipColors = category ? CategoryColors[category][scheme === 'dark' ? 'dark' : 'light'] : (color ?? null);

  const style = chipColors
    ? selected
      ? { backgroundColor: chipColors.bg, borderWidth: 1, borderColor: chipColors.text }
      : { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: chipColors.text }
    : { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement };

  return (
    <Pressable onPress={onPress} style={[styles.chip, style]} accessibilityRole="button" accessibilityState={{ selected }}>
      <ThemedText type="small" style={chipColors ? { color: chipColors.text } : undefined}>
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
