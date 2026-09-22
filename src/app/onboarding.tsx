import { Link, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { EveningPracticeCard } from '@/app/intro';
import { Button } from '@/components/button';
import { StepperRow } from '@/components/stepper-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { requestNotificationPermission, rescheduleNotifications } from '@/notifications/scheduler';
import { isValidHHMM } from '@/session/settingsValidation';

const STEP_COUNT = 5;

/**
 * Onboarding (§6.1, ticket 17): at most 4 screens, skippable, shown once —
 * since v13 (`.scratch/v13-feedback/issues/03-fresh-screen-rebuild.md`) the
 * first-launch flow is five tabs in the owner's stated order: About the
 * method → Here is how it works! → Reminders → Evening practice → Choose
 * your settings. The evening-practice question that used to be a separate
 * pre-onboarding route (/intro) is now tab 4, "towards the end, not before
 * the actual intro"; the standalone route remains only for upgraders whose
 * onboarding completed long ago (they must still be asked exactly once —
 * see intro.tsx and the `_layout.tsx` gate).
 *
 * Kept as one route with a `step` state rather than 5 separate routes — the
 * whole flow is a single linear sequence with one "Skip" affordance that
 * exits it entirely, which a `step` counter expresses more simply than
 * inter-route navigation params would.
 *
 * Tabs page horizontally (swipe) in addition to the Next/CTA button — both
 * drive the same `step` state, so whichever the user uses, the other stays
 * in sync. Paging is a plain `ScrollView` (`pagingEnabled` + snap-to-width);
 * no pager dependency needed for five fixed-size pages.
 *
 * "Shown once" is `Repository.isOnboardingComplete()`
 * (`settings.onboarding_completed`) — checked by `_layout.tsx` before this
 * route is ever reached, not by this screen itself. The evening question's
 * once-marker (`intro_completed`) is written by every exit: each tab-4
 * answer, the footer Skip, and Done — so no path loops the question back.
 *
 * The evening tab reuses `EveningPracticeCard` (intro.tsx's named export):
 * one copy of the question, two surfaces.
 *
 * Notification times are native pickers (v13 issue 03), reusing the
 * settings screen's `TimeField` pattern (`@react-native-community/
 * datetimepicker`; the pattern is restated here rather than shared —
 * settings.tsx is another cycle's file this round): iOS renders the
 * compact system picker inline; Android opens the system time dialog from
 * a row button. The stored value stays the exact "HH:MM" 24h string; only
 * the input surface is native.
 *
 * Layout round 2026-09-15 (cycle 6, finding O1; M3/M2): step 4's private
 * `PrefRow` is retired in favor of the shared `StepperRow` (cycle 5's
 * component — one stepper anatomy app-wide, identical prop contract), and
 * form field labels (Morning/Evening) use the `eyebrow` role per LC6.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [endingsPerSession, setEndingsPerSession] = useState(7);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [morningTime, setMorningTime] = useState('08:00');
  const [eveningTime, setEveningTime] = useState('21:00');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);

  const finish = () => {
    repo.setOnboardingComplete();
    // Every exit marks the evening question asked (the once-marker), so no
    // path — early skip included — loops the question back afterwards.
    repo.setIntroComplete();
    if (isValidHHMM(morningTime)) repo.setSetting('morning_notification_time', morningTime);
    if (isValidHHMM(eveningTime)) repo.setSetting('evening_notification_time', eveningTime);
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
    repo.setIntroComplete();
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

  // Tab 4's answer (the card calls one of these): persist exactly like the
  // standalone card does, then continue to the last tab.
  const answerEvening = (include: boolean) => {
    repo.setSetting('evening_practice_enabled', include);
    repo.setIntroComplete();
    // §6.4: reschedule on a notification-relevant setting change. No-op
    // until permission is granted (tab 3); answering never blocks the flow.
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
    goToStep(4);
  };

  const skipEvening = () => {
    // No answer = the morning default (v14 issue 05): pinned explicitly, so
    // the §7 factory default (enabled) never survives the question.
    repo.setSetting('evening_practice_enabled', false);
    repo.setIntroComplete();
    goToStep(4);
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
            <ThemedText type="title">About the method</ThemedText>
            <ThemedText type="default">
              This app is built on the sentence completion method, developed by the psychologist
              Nathaniel Branden. The method is part of a larger approach aimed at increasing self-awareness.
            </ThemedText>
            {/* accessibilityRole="link" + explicit label: the link convention
                BackHeader documents (index.tsx's Link rows); the label keeps
                the name glyph-free and deterministic. */}
            <Link
              href="/about-method"
              style={styles.navLink}
              accessibilityRole="link"
              accessibilityLabel="Read more about the method"
            >
              <ThemedText type="default" themeColor="textSecondary">
                Read more about the method
              </ThemedText>
            </Link>
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
            {/* v14 issue 03: the owner asked for the exclamation mark, the
                semicolon sentence split, and the quickness paragraph broken
                into short sentences (meaning kept). */}
            <ThemedText type="title">Wow it works</ThemedText>
            <ThemedText type="default">
              You’ll get the start of a sentence and finish it, several times, quickly. Write the first
              thing that comes, without judging it. Repetition or nonsense is fine. That’s part of how it
              works.
            </ThemedText>
            <ThemedText type="default">
              The quickness is the point. Endings written before you can polish them tend to surface how you
              actually respond. The value is in the pattern across many endings, not in any single one.
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
            <ThemedText type="title">Reminders</ThemedText>
            <ThemedText type="default">
              This app can remind you of your daily practice, tap &quot;Allow reminders&quot; if you want to be
              notified.
            </ThemedText>
            {/* v14 issue 04: the primary variant makes the ask read as the
                tab's one button (the default secondary read as body text);
                "Not now" stays the quiet alternative. The hint states what
                allowing does, honestly: decline and nothing is lost. */}
            <ThemedView style={styles.buttonRow}>
              <Button label="Allow reminders" variant="primary" onPress={askForNotifications} />
              <Button
                label="Not now"
                variant="text"
                onPress={() => {
                  setNotificationsEnabled(false);
                  goToStep(3);
                }}
              />
            </ThemedView>
            <ThemedText type="small" themeColor="textSecondary">
              Allowing lets the app send those two daily nudges. Saying no costs nothing: the reminders
              just stay off.
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.page, styles.pageForCard, { width }]}>
            <EveningPracticeCard onAnswer={answerEvening} onSkip={skipEvening} />
          </ThemedView>

          <ThemedView style={[styles.page, { width }]}>
            <ThemedText type="title">Choose your settings</ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              You can change any of this later in Settings.
            </ThemedText>

            <StepperRow
              label="Endings per session"
              value={endingsPerSession}
              rangeKey="endings_per_session"
              onChange={setEndingsPerSession}
            />
            {/* v14 issue 06: the label names a setting, not a meaning — one
                dim line does that job (settings.tsx's Hint pattern, LC3). */}
            <ThemedText type="small" themeColor="textSecondary">
              How many endings you write in one practice.
            </ThemedText>
            <StepperRow
              label="Timer (seconds)"
              value={timerSeconds}
              rangeKey="timer_seconds"
              step={10}
              onChange={setTimerSeconds}
            />

            {notificationsEnabled && (
              <ThemedView style={styles.timeFields}>
                <TimeField
                  label="Morning reminder"
                  accessibilityLabel="Morning notification time"
                  value={morningTime}
                  onConfirm={(next) => {
                    if (isValidHHMM(next)) setMorningTime(next);
                  }}
                />
                <TimeField
                  label="Evening reminder"
                  accessibilityLabel="Evening notification time"
                  value={eveningTime}
                  onConfirm={(next) => {
                    if (isValidHHMM(next)) setEveningTime(next);
                  }}
                />
              </ThemedView>
            )}

            <Button label="Done" onPress={finish} />
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

/** "HH:MM" → a Date for the native pickers: today at that wall-clock time. */
function hhmmToDate(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
}

/** A picker result → the exact "HH:MM" 24h string the settings keys store. */
function dateToHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * One notification-time row, reusing the settings screen's `TimeField`
 * pattern (v13 issue 03: tapping a time must spin up the native picker on
 * both platforms, never a free-text field). The stored value stays the
 * exact "HH:MM" 24h string — only the input surface is native:
 *
 * - iOS: the compact system picker renders inline as the row's control
 *   (a button showing the time that opens the system popover).
 * - Android: a row button shows the stored "HH:MM" and opens the system
 *   time dialog via the library's imperative `DateTimePickerAndroid.open`.
 *
 * `onConfirm` fires only on an explicit set — a dismissal carries no date
 * and never reaches storage. The pattern is restated here rather than
 * imported because settings.tsx keeps its copy private this round; if the
 * two ever drift, extraction into a shared component is the fix.
 */
function TimeField({
  label,
  accessibilityLabel,
  value,
  onConfirm,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onConfirm: (next: string) => void;
}) {
  const theme = useTheme();

  const confirmDate = (date?: Date) => {
    if (date) onConfirm(dateToHHMM(date));
  };

  if (Platform.OS === 'android') {
    return (
      <ThemedView style={styles.windowRow}>
        <ThemedText type="eyebrow">{label}</ThemedText>
        <Pressable
          onPress={() => {
            DateTimePickerAndroid.open({
              mode: 'time',
              is24Hour: true,
              value: hhmmToDate(value),
              onChange: (_event, date) => confirmDate(date),
            });
          }}
          style={[styles.timeTrigger, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <ThemedText type="default">{value}</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.windowRow}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      <DateTimePicker
        mode="time"
        display="compact"
        value={hhmmToDate(value)}
        onChange={(event, date) => {
          if (event.type === 'set') confirmDate(date);
        }}
        accessibilityLabel={accessibilityLabel}
      />
    </ThemedView>
  );
}

// Android's minimum touch-target size (Material, 48dp effective) for the
// footer's bare text pressables (packet-3 t8) — see styles.textButton.
const AndroidMinTouchTarget = 48;

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
  // The evening-practice tab: the card brings its own padding and max
  // width, so the page only centers it.
  pageForCard: {
    gap: 0,
    padding: 0,
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
  // Footer Next/Skip (packet-3 t8, packet-2 C4): the bare text pressables
  // measured 34x44 — below Android's 48dp minimum on both axes. Target-size
  // geometry only: the min sizes grow the pressable and the label re-centers
  // inside it; `MinTouchTarget` (44) stays for the non-footer styles below.
  textButton: {
    minHeight: AndroidMinTouchTarget,
    minWidth: AndroidMinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLink: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
  timeFields: {
    gap: Spacing.two,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // The Android trigger shows the stored "HH:MM" verbatim and opens the
  // system time dialog; iOS renders the compact native picker instead.
  timeTrigger: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});
