import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { rescheduleNotifications } from '@/notifications/scheduler';

/**
 * The evening-practice question's copy and answers, shared by its two
 * surfaces (v13 issue 03 folded the standalone card into onboarding as
 * tab 4; both surfaces must ask the identical question):
 *
 * - `/intro` (this file's default export) — the standalone card, reachable
 *   only when onboarding is already complete but the question was never
 *   asked: upgraders whose onboarding completed long ago (they carry
 *   `onboarding_completed` from v1 but have never been asked), asked
 *   exactly once.
 * - tab 4 of `/onboarding` — the same question at the flow's end, for
 *   fresh installs.
 *
 * Two options only (owner feedback 2026-09-18, superseding the
 * 2026-09-16 instruction that made "Start with the morning sitting" the
 * primary button): "Include evening practice" is the primary button, the
 * explicit opt-in, and "Skip for now" is the no-answer exit. The morning
 * sitting is the default state and needs no button of its own: an omitted
 * answer keeps `evening_practice_enabled = false`, so the flow pins the
 * answer explicitly on every exit (true on include, false on skip). The
 * §7 factory default (`true`, riding the settings seed and migration
 * 0004) applies only to rows the question has never reached. The default
 * is never clock-sensitive — deliberately nothing here reads the time.
 *
 * The card carries the method's purpose, not just the mechanics (owner
 * feedback 2026-09-16): the exercise exists to increase self-awareness,
 * and self-esteem is the method's stated purpose — stated factually, no
 * outcome promises (§10). It also says what the method asks and what the
 * app adds: the original method is practised morning and evening, and
 * this app also gives a weekly reflection.
 *
 * The card itself writes nothing: every marker write belongs to the
 * surface that renders it, because "shown once" keys on the marker, not
 * on the press. Both surfaces mark `intro_completed` on every exit
 * (answer or skip), so no path loops the question back.
 *
 * Airplane-mode safe by construction: one DB write per answer, one
 * local-notification reschedule, no network.
 */
export function EveningPracticeCard({
  onAnswer,
  onSkip,
}: {
  onAnswer: (include: boolean) => void;
  onSkip: () => void;
}) {
  return (
    <ThemedView style={styles.card}>
      <ThemedText type="title">Include an evening practice?</ThemedText>
      <ThemedText type="default">
        The exercise is for self-awareness: finishing the beginnings of sentences about yourself, quickly
        and without evaluation. Self-esteem is the method’s stated purpose.
      </ThemedText>
      <ThemedText type="default">
        The original method is practised morning and evening, and this app also gives you a weekly
        reflection. The evening practice adds a short second sitting: the morning’s endings shown once
        more, then one reflection sentence to finish. The app works just as well without it.
      </ThemedText>
      <ThemedView style={styles.buttonRow}>
        <Button label="Include evening practice" variant="primary" onPress={() => onAnswer(true)} />
        <Button label="Skip for now" variant="text" onPress={onSkip} />
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        Skipping keeps just the morning sitting. You can change this anytime in Settings.
      </ThemedText>
    </ThemedView>
  );
}

/**
 * First-run introduction (§7 `evening_practice_enabled`, ADR-0005: "asked
 * once at first launch") — the standalone evening-practice question. Since
 * v13 (issue 03) the fresh-install flow asks it as onboarding's tab 4;
 * this route remains for installs whose onboarding completed long ago
 * (upgraders) and who have never been asked: the root-layout gate routes
 * them here exactly once.
 *
 * The guard against a direct visit (deep link, back navigation) after the
 * intro is done: don't re-ask — exit immediately (the "never shown again"
 * half of the contract; the layout gate is the normal path).
 *
 * "Shown once" is `Repository.isIntroComplete()` (the `settings`-table
 * marker `intro_completed`, mirroring the documented `onboarding_completed`
 * pattern). Both exits mark it complete — so no path can loop the user
 * back into this card. "Skip for now" is the no-answer exit: it pins the
 * morning default (`evening_practice_enabled = false`, v14 issue 05) and
 * reschedules (§6.4) like the answer does; everything else keeps its
 * default and lives in Settings.
 *
 * The screen opens with a welcome beat before anything is explained
 * (v14 issue 02): a greeting naming the app, plus the thirty-week framing
 * the stems screen's programme row uses ("Thirty weeks of guided
 * sittings"), then the evening question.
 */
export default function IntroScreen() {
  const router = useRouter();
  const repo = useMemo(() => getRepository(), []);
  // Guard against a direct visit (deep link, back navigation) after the
  // intro is done: don't re-ask — exit immediately (the "never shown again"
  // half of the contract; the layout gate is the normal path).
  const [done] = useState(() => repo.isIntroComplete());

  // The gate only ever routes here with onboarding already complete (the
  // upgrader path), so the answer's exit target is Home; the onboarding
  // branch only covers a direct visit before onboarding ever ran.
  const exitTarget = useCallback(() => (repo.isOnboardingComplete() ? '/' : '/onboarding'), [repo]);

  useEffect(() => {
    if (done) router.replace(exitTarget());
  }, [done, router, exitTarget]);

  // Both exits persist explicitly (v14 issue 05): include = true, skip =
  // the morning default (false).
  const answer = (include: boolean) => {
    repo.setSetting('evening_practice_enabled', include);
    repo.setIntroComplete();
    // §6.4: reschedule on a notification-relevant setting change. No-op
    // until permission is granted; on upgraded installs permission is
    // already granted, so it applies the answer immediately.
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
    router.replace(exitTarget());
  };

  const skip = () => {
    // No answer = the morning default (v14 issue 05): pin it explicitly —
    // the §7 factory default is enabled, so leaving the row untouched
    // would keep the evening practice on, the opposite of what skipping
    // now means. Reschedule for the same reason (§6.4): the evening
    // notification only fires while the setting is on.
    repo.setSetting('evening_practice_enabled', false);
    repo.setIntroComplete();
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
    router.replace(exitTarget());
  };

  if (done) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.welcome}>
          <ThemedText type="title">Welcome to AwareMe</ThemedText>
          <ThemedText type="default">
            This is a thirty-week guided challenge: short sittings, one day at a time. Before you start, one
            question.
          </ThemedText>
        </ThemedView>
        <EveningPracticeCard onAnswer={answer} onSkip={skip} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center' },
  welcome: {
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
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
