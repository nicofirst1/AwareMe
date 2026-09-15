import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';

/**
 * Shared secondary-screen header (layout audit 2026-09-15, constitution
 * LC2): a back row (chevron + label, 44pt, x24) followed 16pt later by a
 * title row (`type="title"`, 44pt) with an optional trailing action
 * vertically centered in its right slot. Composes `BackHeader` for the back
 * row instead of duplicating its router/a11y logic — `BackHeader` stays
 * usable on its own for screens not yet migrated to `ScreenHeader`.
 *
 * Render as the first child inside a screen's `SafeAreaView`; it carries
 * its own x24 horizontal inset (LC1's content column) and top spacing, so
 * callers put nothing above it and add no horizontal padding of their own.
 *
 * Every secondary screen (history, review, settings, export, import,
 * progress, about, …) is meant to adopt this component wave by wave — see
 * `.scratch/layout-audit-2026-09-15/`. Home and Write keep their own
 * anchors per LC2 and are not expected to use it.
 */
export function ScreenHeader({
  title,
  backLabel = 'Back',
  trailingAction,
  style,
}: {
  /** Screen title, rendered `type="title"`. */
  title: string;
  /** Back-row label. Default `'Back'`; pass `'Close'` for modal-ish screens (e.g. stem-edit, stem-import). */
  backLabel?: string;
  /** Rendered right-aligned in the title row, vertically centered — e.g. a `View` wrapping one or more `Button`s. Omitted when a screen has no header-level action. Keep children ≤44pt tall — taller children stretch the title row; trim vertical padding as in stems.tsx `headerActionButton`. */
  trailingAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.container, style]}>
      <BackHeader label={backLabel} />
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        {trailingAction}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: MinTouchTarget,
  },
  title: {
    flexShrink: 1,
  },
});
