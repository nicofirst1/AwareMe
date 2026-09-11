import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Section label (2026-09-11 design-system foundation, ui-audit-2026-09-11.md
 * cycle 1) — for Settings' section blocks and any grouped list, which today
 * have no visible header beyond a `small`/`textSecondary` line (audit
 * cross-cutting note 3). `eyebrow`-type label, optional trailing hint.
 */
export function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
