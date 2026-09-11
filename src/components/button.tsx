import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shared button (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 * cycle 1) — replaces the 7+ duplicated `Pressable` + `styles.button` blocks
 * across write.tsx, stem-edit.tsx, stem-import.tsx, review.tsx, etc.
 *
 * `primary` — `accent` fill, label colored for contrast per theme (white on
 * light's accent, black on dark's accent — see theme.ts's `accent` comment
 * for why the label color has to flip, not just the fill). The one action
 * that matters on a screen (Home's "Start writing").
 * `secondary` — today's only existing treatment (`backgroundElement` fill,
 * default text color), now named rather than copy-pasted.
 * `text` — no fill, no border: Close/Cancel/Skip-style affordances.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'text';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  const fill =
    variant === 'primary' ? theme.accent : variant === 'secondary' ? theme.backgroundElement : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.base,
        { backgroundColor: fill, borderRadius: variant === 'primary' ? Radius.large : Radius.small },
        disabled && styles.disabled,
        style,
      ]}
    >
      {/* Symmetric with theme.ts's accent-as-text measurement: white passes
          on light's accent fill (4.94:1), black passes on dark's accent
          fill (7.97:1) — see the `accent` comment in constants/theme.ts. */}
      <ThemedText type="default" style={variant === 'primary' ? { color: primaryLabelColor(theme) } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * `accent` is per-theme (light: terracotta, dark: amber) precisely so a
 * *single* label color can't serve both — light needs white on its accent,
 * dark needs black on its (lighter) accent. `theme.background` at index 0
 * is `#ffffff` in light / `#000000` in dark, which is exactly the inverse
 * of what's needed, so this picks the opposite of `theme.text`.
 */
function primaryLabelColor(theme: { text: string }): string {
  return theme.text === '#000000' ? '#ffffff' : '#000000';
}

const styles = StyleSheet.create({
  base: {
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
