import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';

/**
 * Thin timer progress track (§6.3.7: "a thin, calm progress bar with no
 * numerals larger than the text"), shared between write.tsx's active
 * session and review.tsx's meta-stem session (2026-09-11 cycle 3,
 * ui-audit-2026-09-11.md) — the two were byte-identical duplicates before
 * this extraction, which the audit flagged as a drift risk (a future change
 * to one could silently miss the other). `progress` is 0–1.
 */
export function ProgressBar({ progress, accessibilityLabel }: { progress: number; accessibilityLabel: string }) {
  return (
    <ThemedView
      type="backgroundElement"
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <ThemedView type="backgroundSelected" style={[styles.fill, { width: `${progress * 100}%` }]} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
