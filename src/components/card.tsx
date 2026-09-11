import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shared card (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 * cycle 1) — replaces the 4+ duplicated "rounded box, backgroundElement,
 * padding three, radius two" row/card styles in stems.tsx, history.tsx,
 * session-detail.tsx, export.tsx. `backgroundElement` fill, `Radius.medium`,
 * `Spacing.three` padding; `bordered` adds the hairline `border` token
 * (decorative edge, not a text-contrast pairing — see theme.ts).
 */
export function Card({ bordered, style, ...rest }: ViewProps & { bordered?: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.backgroundElement },
        bordered && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
});
