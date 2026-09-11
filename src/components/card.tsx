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
 *
 * `accentColor` (cycle 3, ui-audit-2026-09-11.md) adds a left-edge stripe —
 * the same idiom stems.tsx's `StemRow` hand-rolls for its active/inactive
 * tint (`ACTIVE_EDGE`/`INACTIVE_EDGE`, left unmigrated in cycle 2 for
 * exactly this reason). Decorative only, not a text pairing, so it isn't
 * held to the 4.5:1 bar — same reasoning as `border`.
 */
export function Card({ bordered, accentColor, style, ...rest }: ViewProps & { bordered?: boolean; accentColor?: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.backgroundElement },
        bordered && { borderWidth: 1, borderColor: theme.border },
        accentColor !== undefined && { borderLeftWidth: 3, borderLeftColor: accentColor },
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
