import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
 * `secondary` — `backgroundElement` fill + hairline `border` (the same
 * decorative divider token `Card.bordered` uses), so it stays defined when
 * placed on a backgroundElement surface (e.g. Home's sitting card).
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
  const scheme = useColorScheme();

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
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        disabled && styles.disabled,
        style,
      ]}
    >
      {/* Symmetric with theme.ts's accent-as-text measurement: white passes
          on light's accent fill (5.79:1), black passes on dark's accent
          fill (6.03:1) — see the `accent` comment in constants/theme.ts. */}
      <ThemedText type="default" style={variant === 'primary' ? { color: primaryLabelColor(scheme) } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * `accent` is per-theme (light: the palette's raw indigo, dark: its
 * lightened derivation) precisely so a
 * *single* label color can't serve both — light needs white on its accent,
 * dark needs black on its (lighter) accent. Reads the actual color scheme
 * rather than pattern-matching `theme.text`'s hex (fragile: broke the
 * moment any theme's `text` stopped being a pure black/white literal).
 * `unspecified` falls back to light, matching `useTheme`'s own fallback.
 */
function primaryLabelColor(scheme: ReturnType<typeof useColorScheme>): string {
  return scheme === 'dark' ? '#000000' : '#ffffff';
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
