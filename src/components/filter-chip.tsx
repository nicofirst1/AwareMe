import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CategoryColors, Radius, Spacing, Palette, type CategoryName, type PaletteName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Android's minimum touch-target size (Material, 48dp effective; packet-3
// t8, packet-2 C4) — local because theme.ts's `MinTouchTarget` (44, t4-owned)
// stays the shared 44 layout floor. Both axes bind here: measured review
// chips were 44 high and short numeric labels ("7") under 48 wide; the
// pill's padding absorbs the growth, so the anatomy is unchanged.
const AndroidMinTouchTarget = 48;

/**
 * A small selectable chip (filter/category/preset toggle) — used across
 * History, Review, Settings, Stems, and stem authoring/import for exactly
 * the same "pick one of a short row of options" interaction. Consolidated
 * here rather than duplicated per screen (spec §10, ticket 19) with a
 * `minHeight` tap target that the label's small text alone wouldn't reach.
 *
 * One chip anatomy for every variant (v13-feedback issue 07 — the stems
 * screen's white squares): a pill with a one-pixel border, the label inside
 * it, and — when selected — the hue's tinted fill plus a checkmark. The
 * selected/unselected distinction is never color alone (colorblind users):
 * the checkmark appears only on the selected chip, and unselected chips
 * lose the fill, so both a shape cue and a fill cue change together.
 *
 * Three ways to color one, in priority order:
 *
 * - `category` colors the chip per `CategoryColors` (2026-09-11 addition,
 *   color-audit-2026-09-11.md cycle 2) — saturated `.text` outline/label,
 *   pale `.bg` fill when selected (the pale tint alone measured
 *   near-invisible, so it never carries the distinction alone).
 * - `hue` (2026-09-17 addition, issue 07) resolves the same `{ bg, text }`
 *   shape from a named `Palette` hue, per theme — for filter chips whose
 *   option carries one of the palette's five hues (e.g. the stems screen's
 *   Morning/Evening/Programme filters, "morning and programme have no
 *   color" owner feedback).
 * - `color` (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 *   cycle 1) passes an explicit `{ bg, text }` pair for a chip that wants a
 *   specific hex pair not tied to a category or palette hue.
 *
 * Omitting all three keeps the neutral grey selected/unselected behavior.
 * Passing several is not meaningful; `category` wins over `hue`, and both
 * win over `color`.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  category,
  hue,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  category?: CategoryName;
  hue?: PaletteName;
  color?: { bg: string; text: string };
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const pair = category
    ? CategoryColors[category][scheme === 'dark' ? 'dark' : 'light']
    : hue
      ? Palette[hue][scheme === 'dark' ? 'dark' : 'light']
      : (color ?? null);

  const style = pair
    ? selected
      ? { backgroundColor: pair.bg, borderColor: pair.text }
      : { borderColor: pair.text }
    : selected
      ? { backgroundColor: theme.backgroundSelected, borderColor: theme.text }
      : { borderColor: theme.textSecondary };
  const ink = pair ? pair.text : selected ? theme.text : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, style]}
      accessibilityRole="button"
      accessibilityLabel={label.replace(/_/g, ' ')}
      accessibilityState={{ selected }}
    >
      {selected && <Ionicons name="checkmark" size={14} color={ink} testID="filter-chip-checkmark" />}
      <ThemedText type="small" style={{ color: ink }}>
        {label.replace(/_/g, ' ')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: AndroidMinTouchTarget,
    minWidth: AndroidMinTouchTarget,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
  },
});
