import { Link, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
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
 * Steps page horizontally (swipe) in addition to the Next/CTA button — both
 * drive the same `step` state, so whichever the user uses, the other stays
 * in sync. Paging is a plain `ScrollView` (`pagingEnabled` + snap-to-width);
 * no pager dependency needed for four fixed-size pages.
 *
 * "Shown once" is `Repository.isOnboardingComplete()`
 * (`settings.onboarding_completed`) — checked by `_layout.tsx` before this
 * route is ever reached, not by this screen itself.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

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

  // Drives both the button and the swipe gesture into the same state, so
  // whichever the user uses, the other stays in sync.
  const goToStep = (next: number) => {
    setStep(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setStep(next);
  };

  const askForNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    goToStep(3);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLabel={`Step ${step + 1} of ${STEP_COUNT}`}
          >
            {step + 1} of {STEP_COUNT}
          </ThemedText>
        </ThemedView>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.pager}
        >
          <ThemedView style={[styles.page, { width }]}>
            <ThemedText type="title">Finish the sentence</ThemedText>
            <ThemedText type="default">
              You&apos;ll get the start of a sentence and finish it, several times, quickly. Write the first
              thing that comes — don&apos;t judge it. Repetition or nonsense is fine; that&apos;s part of how it
              works.
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
            <ThemedText type="title">About the method</ThemedText>
            <ThemedText type="default">
              This app is built on sentence completion, a technique from psychologist Nathaniel Branden. Nothing
              here scores or interprets what you write — it just holds space for it.
            </ThemedText>
            <Link href="/about-method" style={styles.navLink}>
              <ThemedText type="default" themeColor="textSecondary">
                Read more about the method
              </ThemedText>
            </Link>
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
            <ThemedText type="title">Reminders</ThemedText>
            <ThemedText type="default">
              This app can nudge you at a random time in a window you choose — a fixed time would let you plan
              an answer, which defeats the point. Notifications never show the sentence or your writing, even on
              the lock screen.
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              Say no and the app stays fully usable — you can always start a session yourself, and it won&apos;t
              ask again.
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
                  goToStep(3);
                }}
                style={styles.textButton}
                accessibilityRole="button"
              >
                <ThemedText type="default">Not now</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
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
          </ThemedView>
        </ScrollView>

        <ThemedView style={styles.footer}>
          <ThemedView style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <ThemedView
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === step ? theme.text : theme.backgroundElement },
                ]}
              />
            ))}
          </ThemedView>

          <ThemedView style={styles.footerButtons}>
            {step < STEP_COUNT - 1 && (
              <Pressable onPress={() => goToStep(step + 1)} style={styles.textButton} accessibilityRole="button">
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
  header: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});
