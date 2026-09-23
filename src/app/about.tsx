import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CREATOR_SITE_URL, withAppTag } from '@/constants/links';
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
 *
 * Official-programme round (cycle c04, spec §5.1 2026-09-15 amendment,
 * ADR-0005): adds the method framing (self-esteem + increased self-awareness),
 * a link to the official programme page on nathanielbranden.com via
 * `expo-linking`'s `openURL` (the app itself stays offline; this is the one
 * user-initiated hop to the website), and the permission attribution
 * crediting Leigh Branden — a §5.1 MUST. No new dependencies: expo-linking
 * was already a hard runtime peer of expo-router (see docs/DECISIONS.md).
 */

const OFFICIAL_PROGRAMME_URL = 'https://nathanielbranden.com/sentence-completion-i/';

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
            AwareMe is a quiet place to finish a sentence: no scoring, no feed, nothing leaving your device.
          </ThemedText>

          <ThemedText type="default" themeColor="textSecondary">
            The method is sentence completion, developed by psychologist Nathaniel Branden as an exercise for
            self-esteem and increased self-awareness. You finish sentence stems quickly, without pausing to judge
            what comes out.
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
              onPress={() => Linking.openURL(OFFICIAL_PROGRAMME_URL)}
              accessibilityRole="link"
              accessibilityLabel="The official programme, opens the nathanielbranden.com website"
            >
              <ThemedText type="default">The official programme</ThemedText>
              <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
            </Pressable>

            <Pressable
              style={styles.linkRow}
              onPress={() => Linking.openURL(withAppTag(CREATOR_SITE_URL))}
              accessibilityRole="link"
            >
              <ThemedText type="default">Created by Nicolo&apos; Brandizzi</ThemedText>
              <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
            </Pressable>
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            The sentence completion programme is used with permission from Leigh Branden. Method and original
            programme: Nathaniel Branden, nathanielbranden.com.
          </ThemedText>
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
