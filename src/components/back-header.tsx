import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Android's minimum touch-target size (Material, 48dp effective; packet-3
// t8, packet-2 C4) — local because theme.ts's `MinTouchTarget` (44, t4-owned)
// stays the shared 44 layout floor. The Back pressable measured 58x44; the
// pre-existing hitSlop 8 keeps widening the effective target beyond this.
const AndroidMinTouchTarget = 48;

/**
 * Visible back affordance (visual-test finding, cycle 3: only iOS
 * edge-swipe returned the user from stems/history/etc — no on-screen
 * control, an a11y/discoverability gap). Chevron + "Back", `router.back()`
 * — matches write.tsx's "Close" idiom (a plain text-ish control, not a
 * native Stack header) rather than turning on `headerShown` app-wide, since
 * every screen already builds its own header row inside `SafeAreaView`.
 *
 * `accessibilityRole="link"` (not "button"): this navigates rather than
 * performs an action, same semantic distinction the codebase already draws
 * for `Link` elsewhere (e.g. index.tsx's review link).
 */
export function BackHeader({ label = 'Back', style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.back()}
      style={[styles.pressable, style]}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
      <ThemedText type="default" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: AndroidMinTouchTarget,
    gap: Spacing.half,
    alignSelf: 'flex-start',
  },
});
