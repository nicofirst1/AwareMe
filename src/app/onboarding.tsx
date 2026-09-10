import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { requestNotificationPermission, rescheduleNotifications } from '@/notifications/scheduler';
import { clampSetting, isValidHHMM, SETTINGS_RANGES } from '@/session/settingsValidation';
import { useTheme } from '@/hooks/use-theme';

const STEP_COUNT = 4;

/**
 * Onboarding (§6.1, ticket 17): at most 4 screens, skippable, shown once.
 * Kept as one route with a `step` state rather than 4 separate routes — the
 * whole flow is a single linear sequence with one "Skip" affordance that
 * exits it entirely, which a `step` counter expresses more simply than
 * inter-route navigation params would.
 *
 * "Shown once" is `Repository.isOnboardingComplete()`
 * (`settings.onboarding_completed`) — checked by `_layout.tsx` before this
 * route is ever reached, not by this screen itself.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);

  const [step, setStep] = useState(0);
  const [sessionsPerDay, setSessionsPerDay] = useState(1);
  const [endingsPerSession, setEndingsPerSession] = useState(6);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('21:00');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);

  const finish = () => {
    repo.setOnboardingComplete();
    if (isValidHHMM(windowStart) && isValidHHMM(windowEnd) && windowStart < windowEnd) {
      repo.setSetting('windows', [{ start: windowStart, end: windowEnd }]);
    }
    repo.setSetting('sessions_per_day', sessionsPerDay);
    repo.setSetting('endings_per_session', endingsPerSession);
    repo.setSetting('timer_seconds', timerSeconds);
    if (notificationsEnabled) {
      rescheduleNotifications().catch((error) => {
        if (__DEV__) console.warn('Notification reschedule failed:', error);
      });
    }
    router.replace('/');
  };

  const skip = () => {
    repo.setOnboardingComplete();
    router.replace('/');
  };

  const askForNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    setStep(3);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.content}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={`Step ${step + 1} of ${STEP_COUNT}`}
          >
            {step + 1} of {STEP_COUNT}
          </ThemedText>

          {step === 0 && (
            <>
              <ThemedText type="title">Finish the sentence</ThemedText>
              <ThemedText type="default">
                You&apos;ll be given the start of a sentence and asked to finish it, several times, quickly. Write
                the first thing that comes, without stopping to judge it. Repeating yourself or writing something
                that makes no sense is completely fine — that&apos;s part of how this works, not a mistake.
              </ThemedText>
            </>
          )}

          {step === 1 && (
            <>
              <ThemedText type="title">About the method</ThemedText>
              <ThemedText type="default">
                This app is built around sentence completion, a technique developed by the psychologist Nathaniel
                Branden. Nothing here scores, interprets, or comments on what you write — it just gives you a quiet
                place to write it.
              </ThemedText>
              <Link href="/about-method" style={styles.navLink}>
                <ThemedText type="default" themeColor="textSecondary">
                  Read more about the method
                </ThemedText>
              </Link>
            </>
          )}

          {step === 2 && (
            <>
              <ThemedText type="title">Reminders</ThemedText>
              <ThemedText type="default">
                If you&apos;d like, this app can nudge you at a random time within a window you choose each day — a
                fixed daily time would let you plan an answer in advance, which defeats the point. The notification
                itself never shows the sentence or anything you&apos;ve written, even on your lock screen.
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                If you say no, the app stays fully usable — you can always start a session yourself, and this will
                never ask again.
              </ThemedText>
              <ThemedView style={styles.buttonRow}>
                <Pressable
                  onPress={askForNotifications}
                  style={[styles.button, { backgroundColor: theme.backgroundElement }]}
                  accessibilityRole="button"
                >
                  <ThemedText type="subtitle">Allow reminders</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setNotificationsEnabled(false);
                    setStep(3);
                  }}
                  style={styles.textButton}
                  accessibilityRole="button"
                >
                  <ThemedText type="default">Not now</ThemedText>
                </Pressable>
              </ThemedView>
            </>
          )}

          {step === 3 && (
            <>
              <ThemedText type="title">A few defaults</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                You can change any of this later in Settings.
              </ThemedText>

              <PrefRow
                label="Sessions per day"
                value={sessionsPerDay}
                rangeKey="sessions_per_day"
                onChange={setSessionsPerDay}
              />
              <PrefRow
                label="Endings per session"
                value={endingsPerSession}
                rangeKey="endings_per_session"
                onChange={setEndingsPerSession}
              />
              <PrefRow label="Timer (seconds)" value={timerSeconds} rangeKey="timer_seconds" step={10} onChange={setTimerSeconds} />

              {notificationsEnabled && (
                <ThemedView style={styles.windowRow}>
                  <ThemedText type="default">Window</ThemedText>
                  <TextInput
                    value={windowStart}
                    onChangeText={setWindowStart}
                    placeholder="08:00"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                    accessibilityLabel="Window start time"
                  />
                  <ThemedText type="default">to</ThemedText>
                  <TextInput
                    value={windowEnd}
                    onChangeText={setWindowEnd}
                    placeholder="21:00"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                    accessibilityLabel="Window end time"
                  />
                </ThemedView>
              )}

              <Pressable onPress={finish} style={[styles.button, { backgroundColor: theme.backgroundElement }]} accessibilityRole="button">
                <ThemedText type="subtitle">Done</ThemedText>
              </Pressable>
            </>
          )}

          <ThemedView style={styles.footer}>
            {step < STEP_COUNT - 1 && (
              <Pressable onPress={() => setStep(step + 1)} style={styles.textButton} accessibilityRole="button">
                <ThemedText type="default">Next</ThemedText>
              </Pressable>
            )}
            <Pressable onPress={skip} style={styles.textButton} accessibilityRole="button">
              <ThemedText type="small" themeColor="textSecondary">
                Skip
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PrefRow({
  label,
  value,
  rangeKey,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  rangeKey: keyof typeof SETTINGS_RANGES;
  step?: number;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.prefRow}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedView style={styles.stepper}>
        <Pressable
          onPress={() => onChange(clampSetting(rangeKey, value - step))}
          style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <ThemedText type="subtitle">−</ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable
          onPress={() => onChange(clampSetting(rangeKey, value + step))}
          style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <ThemedText type="subtitle">+</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
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
  textButton: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  navLink: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 40,
    textAlign: 'center',
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  timeInput: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    width: 80,
    minHeight: MinTouchTarget,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.four,
  },
});
