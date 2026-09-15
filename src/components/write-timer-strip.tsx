import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Write screen's pinned top strip (layout-audit-2026-09-15, LC8/W1/W2): the
 * sitting's position, the session's depletion bar, and its MM:SS — pinned
 * below the safe area, outside the scrolling stack, so none of it disappears
 * as endings accumulate. Per LC2, this strip doubles as write's "header" —
 * the screen's single exit affordance lives beside it in `write.tsx`, not
 * inside this component.
 *
 * Every prop is optional and independently hidden when omitted, so the same
 * component serves the Start gate (position only), an active session
 * (all three), and a single-stem sitting (no position at all) — including
 * review.tsx's meta-stem session (cycle 4), which never has a position to
 * show.
 */
export function WriteTimerStrip({
  positionLabel,
  progress,
  timeLabel,
}: {
  /** e.g. "Stem 2 of 5". Omit for a single-stem sitting — there's no position to report. */
  positionLabel?: string;
  /** 0–1 session depletion fraction. Omit while nothing is timed yet (§6.3.1's pre-Start state). */
  progress?: number;
  /** MM:SS remaining, rendered at `subtitle` scale — §6.3.7/W6: never larger than the `stem` text (22pt). Omit alongside `progress`. */
  timeLabel?: string;
}) {
  if (!positionLabel && progress === undefined && !timeLabel) return null;

  return (
    <ThemedView style={styles.strip}>
      {(positionLabel || timeLabel) && (
        <View style={styles.row}>
          {positionLabel ? (
            <ThemedText type="small" themeColor="textSecondary">
              {positionLabel}
            </ThemedText>
          ) : (
            <View />
          )}
          {timeLabel && <ThemedText type="subtitle">{timeLabel}</ThemedText>}
        </View>
      )}
      {progress !== undefined && <ProgressBar progress={progress} accessibilityLabel="Time remaining" />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
