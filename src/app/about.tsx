import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';

/**
 * "About" (Home's eighth tile) — about the *app*, distinct from
 * about-method.tsx which is about Branden's method. Version is read from
 * `app.json` via `expo-constants` (bundled with the managed workflow
 * already, no new dependency); `"1.0.0"` is the fallback for the
 * (untested-in-practice) case `expoConfig` is unavailable.
 */
export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
        <ThemedView style={styles.content}>
          <ThemedText type="title">About</ThemedText>

          <ThemedText type="default" themeColor="textSecondary">
            Six Endings is a quiet place to finish a sentence — no scoring, no feed, nothing leaving your device.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Version {version}
          </ThemedText>

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.link}
            onPress={() => router.push('/about-method')}
            accessibilityRole="link"
          >
            About the method
          </ThemedText>

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.link}
            onPress={() => Linking.openURL('https://nicolobrandizzi.com/')}
            accessibilityRole="link"
          >
            Created by Nicolò Brandizzi
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  backHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  link: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
});
