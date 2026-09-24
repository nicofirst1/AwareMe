import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clampSetting, SETTINGS_RANGES } from '@/session/settingsValidation';

// Android's minimum touch-target size (Material, 48dp effective; packet-3
// t8, packet-2 C4) — local because theme.ts's `MinTouchTarget` (44, t4-owned)
// stays the shared 44 layout floor. The −/+ buttons measured 44x44.
const AndroidMinTouchTarget = 48;

/**
 * Shared one-line numeric stepper row (layout audit 2026-09-15, findings
 * M3/Se1, constitution LC3): label on the left, −/value/+ on the right —
 * one row, one anatomy. Replaces settings.tsx's stacked `NumberStepper`
 * (label row above a stepper row + a boxed hint between controls, ~132pt
 * per setting measured) and onboarding.tsx's private `PrefRow` (the same
 * control hand-rolled a second way). The two had identical semantics but
 * two anatomies; this component is the one row both screens render.
 *
 * API (stable contract — cycle 6 adopts this in onboarding.tsx, retiring
 * its private `PrefRow`):
 * - `label` — row label, left. Also names the steppers for a11y
 *   ("Decrease {label}" / "Increase {label}").
 * - `value` — current number, rendered between − and +.
 * - `rangeKey` — key into `SETTINGS_RANGES` (spec §7). Every press is
 *   clamped to that key's min/max, so the range is *enforced*, not
 *   displayed — the old settings screen's "min–max" caption is gone with
 *   the one-line anatomy (audit Se1's sanctioned replacement; the step
 *   buttons simply stop moving at the bounds).
 * - `step` — amount per press (default 1; settings' timer uses 10).
 * - `onChange` — called with the clamped next value; callers persist.
 * - `disabled` — p8-t2 replay: renders both buttons disabled
 *   (`accessibilityState.disabled` + the app's 0.5 opacity step, the
 *   button.tsx idiom) so replay writes nothing; default false.
 *
 * Layout contract (LC3): render inside a section with the 8pt row gap;
 * the caller owns anything above/below — settings puts its explanatory
 * hint as one dim `small` line directly under the row (audit Se1).
 */
export function StepperRow({
  label,
  value,
  rangeKey,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  rangeKey: keyof typeof SETTINGS_RANGES;
  step?: number;
  onChange: (next: number) => void;
  /** Inert rendering (p8-t2 replay): both buttons disabled at the app's 0.5 step. */
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(clampSetting(rangeKey, value - step))}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled }}
          style={[
            styles.stepperButton,
            { backgroundColor: theme.backgroundSelected },
            disabled && styles.stepperButtonDisabled,
          ]}
        >
          <ThemedText type="subtitle">−</ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable
          onPress={() => onChange(clampSetting(rangeKey, value + step))}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled }}
          style={[
            styles.stepperButton,
            { backgroundColor: theme.backgroundSelected },
            disabled && styles.stepperButtonDisabled,
          ]}
        >
          <ThemedText type="subtitle">+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: AndroidMinTouchTarget,
  },
  label: {
    flexShrink: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperButton: {
    width: AndroidMinTouchTarget,
    height: AndroidMinTouchTarget,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The app's disabled step (button.tsx's 0.5 opacity), applied to the two
  // −/+ buttons only — approved mockup 03 dims the controls, not the label.
  stepperButtonDisabled: {
    opacity: 0.5,
  },
  stepperValue: {
    minWidth: 40,
    textAlign: 'center',
  },
});
