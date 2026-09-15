import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeCard } from '@/components/badge-card';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WriteActionBar } from '@/components/write-action-bar';
import { WriteTimerStrip } from '@/components/write-timer-strip';
import { MaxContentWidth, MinTouchTarget, PressureColors, Spacing } from '@/constants/theme';
import { getRepository, type StemRow, type TimeOfDay } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeDef } from '@/session/badges';
import { assembleNewlyEarnedBadges } from '@/session/badgeReveal';
import { formatMMSS, sessionDurationLabel } from '@/session/sessionMachine';
import type { StemForSession } from '@/session/useWritingSession';
import { useWritingSession } from '@/session/useWritingSession';

/**
 * The queue for one writing sitting (morning/evening pivot, 2026-09-14): all
 * active stems for the chosen period, in `getActiveStemsForTimeOfDay`'s
 * deterministic order. Recomputed on every mount rather than persisted
 * anywhere — a "sitting" has no row of its own (spec keeps one `sessions`
 * row per stem, ADR-0001/CLAUDE.md), so this is the one place the sequence
 * exists.
 */
function loadQueue(timeOfDay: TimeOfDay): StemRow[] {
  return getRepository().getActiveStemsForTimeOfDay(timeOfDay);
}

/**
 * ADR-0001 resume, extended for a sitting: if a session was left open by a
 * previous run, `useWritingSession`'s own mount effect resumes/finalizes
 * that one `sessions` row exactly as before — this only needs to figure out
 * which period's queue it belongs to (by checking list membership; stems
 * carry no `time_of_day` on `StemRow` itself) and where in that queue to
 * pick back up, so the remaining stems in the sitting still get written
 * rather than the sitting silently ending at one stem. Falls back to a
 * one-stem queue of just the resumed stem when it isn't (or is no longer)
 * in either period's active list — e.g. a single-stem write from the stem
 * library (below), or a stem archived mid-sitting.
 */
function resumeQueue(openStemId: string): { queue: StemRow[]; startIndex: number } {
  const repo = getRepository();
  for (const timeOfDay of ['morning', 'evening'] as const) {
    const queue = repo.getActiveStemsForTimeOfDay(timeOfDay);
    const index = queue.findIndex((s) => s.id === openStemId);
    if (index >= 0) return { queue, startIndex: index };
  }
  const solo = repo.listAllStems().find((s) => s.id === openStemId && s.deleted_at === null);
  return { queue: solo ? [solo] : [], startIndex: 0 };
}

/**
 * The writing session (spec §6.3), driving one multi-stem sitting
 * (morning/evening pivot): every active stem for `timeOfDay` is presented
 * one at a time, in sequence — advancing to the next stem re-runs the same
 * per-stem machinery (`useWritingSession`) rather than anything new, since
 * each stem is still its own `sessions` row. No navigation chrome beyond a
 * single exit affordance (§10) — the stem stays pinned above the input,
 * previously written endings are shown dimmed above it (§6.3.5), and the
 * timer is a thin, calm progress bar with no numerals larger than the text
 * (§6.3.7).
 *
 * `origin` is only 'notification' when this screen was reached by tapping a
 * notification (§6.4) — selection is no longer chosen at schedule time
 * (§6.2's weighted draw is gone), so there is nothing to look up; the
 * sitting still loads fresh from `getActiveStemsForTimeOfDay`.
 *
 * `stemId` (instead of `timeOfDay`) is the stem library's "write on this
 * stem now" entry point (DECISIONS.md Q2: `origin='manual'`, deliberately
 * bypassing period-based selection) — it builds a one-stem queue rather
 * than a whole period's sitting.
 */
export default function WriteScreen() {
  const { timeOfDay, stemId, origin } = useLocalSearchParams<{
    timeOfDay?: TimeOfDay;
    stemId?: string;
    origin?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const session = useWritingSession();
  const inputRef = useRef<TextInput>(null);

  const [terminator, setTerminator] = useState('...');
  const [queue, setQueue] = useState<StemRow[] | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  // Which queue index `session.start()` has already been called for — -1
  // means none yet. A resumed session (ADR-0001) is seeded to its own
  // index directly, since `useWritingSession`'s mount effect already
  // brought it into 'active' without this screen calling `start()` itself.
  const [startedIndex, setStartedIndex] = useState(-1);

  const stemOrigin: StemForSession['origin'] = origin === 'notification' ? 'notification' : 'manual';
  const pendingStem = queue?.[queueIndex] ?? null;
  // §6.3.1: nothing is timed until Start is tapped — true for every stem in
  // the sitting, not just the first. False while resuming into an
  // already-active session, and false once `start()` has been called for
  // the current index (whether still active or already 'done').
  const awaitingStart = pendingStem !== null && startedIndex < queueIndex;

  // Pressure cue (§6.3.4/13.4, 2026-09-11 addition): the button gradient
  // tracks the per-stem timer when it's on, else the session timer — an
  // urgency cue only, never a numeral or shame copy.
  const buttonPressure = useRef(new Animated.Value(0)).current;

  // Completion celebration (gamification proposal §1.A/§2, cycle 2): a
  // single calm settle on "Saved." — scale 0.92->1 + opacity 0->1, ~400ms,
  // friction-tuned to land without overshoot ("settle, don't bounce").
  // Shown once, after the whole sitting completes — never between stems.
  const settleAnim = useRef(new Animated.Value(0)).current;
  // Badge reveal: fade + 8px upward slide, shared by every stacked badge
  // card (proposal §2) — they appear together, sequenced only against the
  // settle animation above, not staggered against each other.
  const badgeRevealAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState<BadgeDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loads the sitting's queue once on mount: resumes an open session's
  // position if ADR-0001 left one, otherwise starts fresh from either
  // `timeOfDay`'s full active-stem list or a single `stemId` (stem
  // library's "write now"), at index 0.
  useEffect(() => {
    const repo = getRepository();
    setTerminator(repo.getSettings().stem_terminator);

    const open = repo.getOpenSession();
    if (open) {
      const resumed = resumeQueue(open.session.stem_id);
      setQueue(resumed.queue);
      setQueueIndex(resumed.startIndex);
      // `useWritingSession`'s own mount effect resumes this session
      // directly into 'active' — mark it already-started so the Start
      // gate below doesn't ask the user to tap Start on a running timer.
      setStartedIndex(resumed.startIndex);
      return;
    }

    if (timeOfDay) {
      setQueue(loadQueue(timeOfDay));
      setQueueIndex(0);
    } else if (stemId) {
      const solo = repo.listAllStems().find((s) => s.id === stemId && s.deleted_at === null);
      setQueue(solo ? [solo] : []);
      setQueueIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeOfDay, stemId]);

  const isLastInQueue = queue !== null && queueIndex >= queue.length - 1;

  // Advances the queue pointer the moment one stem finishes, unless it was
  // the last — the whole-sitting completion screen (with any badge reveal)
  // only renders on that last stem's 'done' phase (§6.3.11, proposal "never
  // between stems"). Advancing just moves the pointer; §6.3.1's Start
  // control (below, gated by `awaitingStart`) still holds the next stem's
  // timer until the user taps it, same as the first stem.
  useEffect(() => {
    if (session.phase !== 'done' || !queue) return;
    if (isLastInQueue) return;
    setQueueIndex((i) => i + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase]);

  const startPendingStem = () => {
    if (!pendingStem) return;
    setStartedIndex(queueIndex);
    session.start({ id: pendingStem.id, text: pendingStem.text, origin: stemOrigin });
  };

  // Assembles the badge reveal once, when the *last* stem in the sitting
  // lands on 'done' — see badgeReveal.ts for why "before" is derived by
  // excluding this session's id rather than reading before the save (the
  // save already happened by the time this phase renders). `!awaitingStart`
  // (W4's guard, generalized): the render right after the queue-advance
  // effect increments `queueIndex` to the sitting's last position still
  // carries `session.phase === 'done'` from the *previous* (non-final)
  // stem for one commit — without this guard, that stale 'done' would read
  // as "the sitting finished" one stem early.
  useEffect(() => {
    if (session.phase !== 'done' || !session.sessionId || !isLastInQueue || awaitingStart) return;
    setNewlyEarnedBadges(assembleNewlyEarnedBadges(getRepository(), session.sessionId));
  }, [session.phase, session.sessionId, isLastInQueue, awaitingStart]);

  // Drives the settle animation and, sequenced ~300ms later, the badge
  // reveal's fade+slide — only for the sitting's final 'done' (the one that
  // actually renders the completion block below). Reduced motion: skip
  // straight to the final state, no animation at all. Same `!awaitingStart`
  // guard as the badge-assembly effect above, and for the same reason.
  useEffect(() => {
    if (session.phase !== 'done' || !isLastInQueue || awaitingStart) return;
    if (reduceMotion) {
      settleAnim.setValue(1);
      badgeRevealAnim.setValue(1);
      return;
    }
    settleAnim.setValue(0);
    badgeRevealAnim.setValue(0);
    Animated.spring(settleAnim, {
      toValue: 1,
      friction: 10,
      tension: 60,
      useNativeDriver: true,
    }).start();
    // Badge reveal starts ~300ms after the settle animation begins
    // (sequenced, not simultaneous — proposal §2).
    const badgeTimer = setTimeout(() => {
      Animated.timing(badgeRevealAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }, 300);
    return () => clearTimeout(badgeTimer);
  }, [session.phase, isLastInQueue, awaitingStart, reduceMotion, settleAnim, badgeRevealAnim]);

  useEffect(() => {
    if (session.phase === 'active') {
      // Give the field a beat to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [session.phase, session.state?.activeOrdinal]);

  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const stemTimerSeconds = session.state?.config.stemTimerSeconds ?? null;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;
  const stemProgress =
    session.phase === 'active' && stemTimerSeconds && session.stemRemainingSeconds !== null
      ? Math.max(0, Math.min(1, session.stemRemainingSeconds / stemTimerSeconds))
      : null;
  // The per-stem timer drives the button's urgency when it's on (it's the
  // tighter, more immediate deadline); otherwise the session timer does.
  const pressureFraction = stemProgress ?? progress;

  useEffect(() => {
    buttonPressure.setValue(session.phase === 'active' ? 1 - pressureFraction : 0);
  }, [buttonPressure, session.phase, pressureFraction]);

  if (queue !== null && queue.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" themeColor="textSecondary">
            No stems set for this time of day yet. Add one from the stem library.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (queue === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} />
      </ThemedView>
    );
  }

  const stemText = awaitingStart ? (pendingStem?.text ?? '') : (session.stemText ?? '');
  const targetEndings = session.state?.config.targetEndings ?? 0;
  const buttonBackgroundColor = buttonPressure.interpolate({
    inputRange: [0, 1],
    outputRange: [PressureColors.calm, PressureColors.urgent],
  });

  const submittedEndings = session.state?.endings.filter((e) => e.submittedAt !== null) ?? [];

  // Countdown button label (2026-09-11 addition, §6.3.4): the per-stem
  // remaining time when that timer is on, else the session's — same
  // urgency source the button's color gradient already tracks
  // (`pressureFraction` above). Falls back to the static "Next" label if
  // neither timer has a value to show (defensive; shouldn't happen while
  // `session.phase === 'active'`).
  const countdownSeconds = stemTimerSeconds ? session.stemRemainingSeconds : session.remainingSeconds;
  const buttonLabel = countdownSeconds !== null ? formatMMSS(countdownSeconds) : 'Next';

  // Enter submits the ending (2026-09-11 addition, §6.3.4): the input is
  // `multiline` so it wraps a long sentence, which means the platform
  // delivers the return key as a trailing "\n" via onChangeText rather than
  // firing onSubmitEditing (onSubmitEditing still covers iOS's fast path
  // when it does fire). Strip the newline and submit the result directly —
  // `submitActive`'s override param avoids racing the not-yet-committed
  // state that a separate `changeActiveText` call would leave stale.
  const handleChangeText = (nextText: string) => {
    if (nextText.endsWith('\n')) {
      session.submitActive(nextText.slice(0, -1));
      return;
    }
    session.changeActiveText(nextText);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/*
            Pinned top strip (LC8/W1/W2): the sitting's position and the
            running session timer, below the safe area and outside the
            scrolling stack, so neither ever scrolls out of view. Doubles as
            write's "header" (LC2) — the exit affordance below is only shown
            before a stem's Start is tapped; once writing is under way,
            "Done" (in the pinned bottom bar) is the single exit affordance
            (§10), so an equally-visible second exit here would invite a
            session left dangling open.
          */}
          <ThemedView style={styles.topStrip}>
            {awaitingStart && (
              <ThemedView style={styles.exitRow}>
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={styles.exitButton}
                  accessibilityRole="button"
                  accessibilityLabel="Exit session"
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Close
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )}
            <WriteTimerStrip
              positionLabel={queue.length > 1 ? `Stem ${queueIndex + 1} of ${queue.length}` : undefined}
              progress={session.phase === 'active' ? progress : undefined}
              timeLabel={session.phase === 'active' ? formatMMSS(session.remainingSeconds) : undefined}
            />
          </ThemedView>

          <ScrollView
            style={styles.flexOne}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="stem">
              {stemText}
              {terminator}
            </ThemedText>

            {/*
              Read-only text, not inputs: there is no control that lets the
              user navigate back into an earlier ending (§6.3.6). Hidden
              while `awaitingStart`: `session.state` still holds the *just-
              finished* stem's endings until `start()` runs for the pending
              one (W4) — showing them here would stack the previous stem's
              writing under the next stem's Start gate.
            */}
            {!awaitingStart &&
              submittedEndings.map((e) => (
                <ThemedText
                  key={e.ordinal}
                  type="stem"
                  themeColor="textSecondary"
                  style={[styles.pastEnding, { borderTopColor: theme.border }]}
                >
                  {e.text}
                </ThemedText>
              ))}
          </ScrollView>

          {/*
            Pinned bottom (LC8/W5): whichever control belongs to the current
            moment — Start, the writing controls, or the completion block —
            occupies this one fixed slot above the keyboard, never after the
            scrolling stack.
          */}
          <ThemedView style={styles.bottomBar}>
            {awaitingStart && <Button label="Start" onPress={startPendingStem} />}

            {session.phase === 'active' && (
              <WriteActionBar
                inputRef={inputRef}
                value={session.activeText}
                onChangeText={handleChangeText}
                onSubmitEditing={() => session.submitActive()}
                stemProgress={stemProgress}
                onSave={() => session.submitActive()}
                saveLabel={buttonLabel}
                savePressureColor={buttonBackgroundColor}
                onDone={session.finishNow}
                endingsWritten={submittedEndings.length}
                endingsTarget={targetEndings}
              />
            )}

            {session.phase === 'done' && isLastInQueue && !awaitingStart && (
              <ThemedView style={styles.doneBlock}>
                <Animated.View
                  style={{
                    opacity: settleAnim,
                    transform: [{ scale: settleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                  }}
                >
                  <ThemedText type="default" themeColor="textSecondary">
                    Saved.
                  </ThemedText>
                  {session.state?.endedAt && (
                    // Computed at read time from the session's own timestamps
                    // (§13.7 — never store a derived value); quiet, descriptive,
                    // no praise (§13.4).
                    <ThemedText type="small" themeColor="textSecondary">
                      {sessionDurationLabel(session.state.startedAt, session.state.endedAt, submittedEndings.length)}
                    </ThemedText>
                  )}
                </Animated.View>

                {/*
                  Badge reveal (gamification proposal §1.A/§1.B): only the
                  badges newly crossed by *this* completion, computed fresh
                  each render (§13.7) — reopening the app later shows nothing
                  here, which is correct, not a bug. Multiple new badges stack
                  vertically.
                */}
                {newlyEarnedBadges.length > 0 && (
                  <Animated.View
                    style={[
                      styles.badgeReveal,
                      {
                        opacity: badgeRevealAnim,
                        transform: [
                          { translateY: badgeRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                        ],
                      },
                    ]}
                  >
                    {newlyEarnedBadges.map((badge) => (
                      <BadgeCard key={badge.id} badge={badge} earned />
                    ))}
                  </Animated.View>
                )}

                <Button label="Close" onPress={() => router.back()} />
              </ThemedView>
            )}
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },
  // Pinned top (LC8): horizontal inset matches the scroll column below so
  // the strip's content lines up with the stem/endings edge (LC1's 24pt
  // grid); the scroll column carries its own top padding, so this only
  // needs bottom breathing room to separate from it.
  topStrip: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  // Pinned bottom (LC8): `SafeAreaView` already insets the home indicator;
  // this only needs top breathing room to separate from the scroll column
  // and the `KeyboardAvoidingView` above adds the rest when the keyboard
  // shows.
  bottomBar: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  exitRow: {
    alignItems: 'flex-end',
  },
  exitButton: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  // W3: each previously-written ending is its own dim, separated row — a
  // hairline top divider (decorative-only `border` token, not a text
  // pairing — see theme.ts) rather than color/weight, so the stack reads as
  // ordered rows instead of one undifferentiated text block.
  pastEnding: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  doneBlock: {
    gap: Spacing.three,
  },
  badgeReveal: {
    gap: Spacing.two,
  },
});
