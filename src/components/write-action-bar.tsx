import { Animated, Pressable, StyleSheet, TextInput, View, type ColorValue } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Write screen's pinned bottom action bar (layout-audit-2026-09-15, LC8/W1):
 * the input plus every writing-time control (per-stem timer bar, the
 * pressure-gradient Save button, Done, the endings-written count) — the set
 * W1 measured buried below the fold as the endings stack grew. Lives above
 * the keyboard (caller wraps the screen in `KeyboardAvoidingView`).
 *
 * Reused verbatim by review.tsx's `MetaStemSession` (cycle 4, wave 2): that
 * screen's meta-stem is "a normal timed session" (spec §6.5.2) with no
 * Start gate of its own, so it only ever needs this active-writing variant —
 * pass `stemProgress`/`endingsWritten`/`endingsTarget` as `undefined` there
 * (no per-stem timer, always exactly one ending).
 */
export function WriteActionBar({
  inputRef,
  value,
  onChangeText,
  onSubmitEditing,
  placeholder = 'Keep the pen moving.',
  inputAccessibilityLabel = 'Your ending',
  stemProgress,
  onSave,
  saveLabel,
  savePressureColor,
  onDone,
  doneLabel = 'Done',
  endingsWritten,
  endingsTarget,
}: {
  inputRef?: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (text: string) => void;
  /** iOS's fast submit path; the multiline field's Enter-to-submit still goes through `onChangeText` (a trailing "\n") — see write.tsx. */
  onSubmitEditing: () => void;
  placeholder?: string;
  inputAccessibilityLabel?: string;
  /** 0–1 fraction for the optional per-stem timer (`stem_timer_enabled`, spec §6.3.4's "second, independent countdown"). Omit/null to hide. */
  stemProgress?: number | null;
  onSave: () => void;
  /** MM:SS or "Next" — §6.3.7/W6: rendered at `subtitle` scale, never larger than the `stem` text. */
  saveLabel: string;
  /** The pressure-gradient fill (spec §6.3.4/W6 keep-fact) — caller owns the `Animated.Value`/interpolation, this component only paints it. */
  savePressureColor: ColorValue | Animated.AnimatedInterpolation<string | number>;
  onDone: () => void;
  doneLabel?: string;
  /** Endings written so far vs. the session's target. Omit both to hide the row (review's meta-stem has exactly one, cycle 4). */
  endingsWritten?: number;
  endingsTarget?: number;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.bar}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: theme.text }]}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="done"
        multiline
        blurOnSubmit={false}
        contextMenuHidden
        autoCorrect={false}
        accessibilityLabel={inputAccessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
      />
      {stemProgress != null && (
        <ProgressBar progress={stemProgress} accessibilityLabel="Time remaining for this ending" />
      )}
      <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel="Save this ending">
        <Animated.View style={[styles.saveButton, { backgroundColor: savePressureColor }]}>
          <ThemedText type="subtitle" style={styles.saveLabel}>
            {saveLabel}
          </ThemedText>
        </Animated.View>
      </Pressable>
      <View style={styles.footerRow}>
        <Pressable
          onPress={onDone}
          hitSlop={12}
          style={styles.doneButton}
          accessibilityRole="button"
          accessibilityLabel="Finish session"
        >
          <ThemedText type="small" themeColor="textSecondary">
            {doneLabel}
          </ThemedText>
        </Pressable>
        {endingsWritten !== undefined && endingsTarget !== undefined && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={`${endingsWritten} of ${endingsTarget} endings written`}
          >
            {endingsWritten} of {endingsTarget}
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: Spacing.three,
  },
  input: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 34,
    minHeight: 80,
  },
  // Radius.small matches `Button`'s own secondary/countdown radius so this
  // bespoke pressure-animated button reads as the same button family.
  saveButton: {
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed white, not theme-driven: the pressure gradient (constants/theme.ts
  // `PressureColors`) is itself fixed in both themes, and white stays
  // >=4.5:1 across its full range (measured minimum 5.13:1).
  saveLabel: {
    color: '#ffffff',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  doneButton: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    justifyContent: 'center',
  },
});
