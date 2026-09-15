import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "About" (Home's eighth tile) — about the *app*, distinct from
 * about-method.tsx which is about Branden's method. Version is read from
 * `app.json` via `expo-constants` (bundled with the managed workflow
 * already, no new dependency); `"1.0.0"` is the fallback for the
 * (untested-in-practice) case `expoConfig` is unavailable.
 *
 * Layout round 2026-09-15 (cycle 6, finding A1; LC2/LC3): `ScreenHeader`
 * replaces the old BackHeader+title pair, and the two bare text links
 * become standard link rows — label left, chevron in the reserved right
 * slot, 44pt touch target — matching Home's "Review available" row idiom
 * (accent chevron-forward: a non-text affordance at the 3:1 floor, while
 * the label itself reads as a primary row line rather than dim body text).
 * Rhythm aligned to LC3: 24pt section gap, 8pt row gap inside the links
 * block.
 */
export default function AboutScreen() {
  const router = useRouter();
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="About" />
        <ThemedView style={styles.content}>
          <ThemedText type="default" themeColor="textSecondary">
            Six Endings is a quiet place to finish a sentence — no scoring, no feed, nothing leaving your device.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Version {version}
          </ThemedText>

          <ThemedView style={styles.links}>
            <Pressable
              style={styles.linkRow}
              onPress={() => router.push('/about-method')}
              accessibilityRole="link"
            >
              <ThemedText type="default">About the method</ThemedText>
              <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
            </Pressable>

            <Pressable
              style={styles.linkRow}
              onPress={() => Linking.openURL('https://nicolobrandizzi.com/')}
              accessibilityRole="link"
            >
              <ThemedText type="default">Created by Nicolò Brandizzi</ThemedText>
              <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
            </Pressable>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  links: {
    gap: Spacing.two,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
  },
});
