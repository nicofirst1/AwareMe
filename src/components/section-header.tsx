import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Section label (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 * cycle 1) — for Settings' section blocks and any grouped list, which today
 * have no visible header beyond a `small`/`textSecondary` line (audit
 * cross-cutting note 3). `eyebrow`-type label, optional trailing hint.
 *
 * The rule below the label picks up a low-alpha `accent` tint (color-audit-
 * 2026-09-11.md cycle 4, finding E) instead of the plain `border` hairline —
 * decorative only, uniform across every section this renders in (Settings,
 * History, Export, Progress, …), not per-section colored. `accent` is a hex
 * with no alpha channel, so it's parsed to rgba inline here rather than
 * adding an `accentMuted`-style token to theme.ts for one hairline.
 */
export function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  const theme = useTheme();
  const ruleColor = hexToRgba(theme.accent, 0.3);

  return (
    <View style={[styles.wrap, { borderBottomColor: ruleColor }]}>
      <View style={styles.row}>
        <ThemedText type="eyebrow">{label}</ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
