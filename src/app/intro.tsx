import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { rescheduleNotifications } from '@/notifications/scheduler';

/**
 * First-run introduction (§7 `evening_practice_enabled`, ADR-0005: "asked
 * once at first launch"): ONE question card — "Include an evening
 * practice?" — shown before anything else on first launch, upgraders
 * included (they carry `onboarding_completed` from v1 but have never been
 * asked). The recommended answer, include, is the primary button.
 *
 * "Shown once" is `Repository.isIntroComplete()` (the `settings`-table
 * marker `intro_completed`, mirroring the documented `onboarding_completed`
 * pattern): the root layout's first-run gate routes here until the marker
 * exists, so the card also survives an app kill between answering and
 * onboarding completion. Both exits mark it complete — "Skip for now"
 * writes nothing (the §7 default `true` stands) while "Include evening
 * practice" persists the answer — so neither path can loop the user back
 * into this card. Everything else keeps defaults and lives in Settings.
 *
 * Ordered before onboarding (§6.1), not instead of it: after answering,
 * first launch continues into the existing 4-step onboarding (or Home for
 * upgraders, whose onboarding already completed long ago).
 *
 * Airplane-mode safe by construction: one DB write, one local-notification
 * reschedule, no network.
 */
export default function IntroScreen() {
  const router = useRouter();
  const repo = useMemo(() => getRepository(), []);
  // Guard against a direct visit (deep link, back navigation) after the
  // intro is done: don't re-ask — exit immediately (the "never shown again"
  // half of the contract; the layout gate is the normal path).
  const [done] = useState(() => repo.isIntroComplete());

  useEffect(() => {
    if (done) router.replace(repo.isOnboardingComplete() ? '/' : '/onboarding');
  }, [done, repo, router]);

  const exitTarget = () => (repo.isOnboardingComplete() ? '/' : '/onboarding');

  const answer = (include: boolean) => {
    repo.setSetting('evening_practice_enabled', include);
    repo.setIntroComplete();
    // §6.4: reschedule on a notification-relevant setting change. No-op
    // until permission is granted (fresh installs grant it later, in
    // onboarding); on upgraded installs it applies the answer immediately.
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
    router.replace(exitTarget());
  };

  const skip = () => {
    // No write: skipping is not an answer — the §7 default (enabled) stands.
    repo.setIntroComplete();
    router.replace(exitTarget());
  };

  if (done) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.card}>
          <ThemedText type="title">Include an evening practice?</ThemedText>
          <ThemedText type="default">
            It adds a short second sitting: the morning&apos;s endings shown once more, then one reflection
            sentence to finish. The app works just as well without it.
          </ThemedText>
          <ThemedView style={styles.buttonRow}>
            <Button label="Include evening practice" variant="primary" onPress={() => answer(true)} />
            <Button label="Skip for now" variant="text" onPress={skip} />
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            Skipping keeps the evening practice on. You can change this anytime in Settings.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center' },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  buttonRow: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
});
