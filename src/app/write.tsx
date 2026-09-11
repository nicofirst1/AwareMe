import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, MinTouchTarget, PressureColors, Radius, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { formatMMSS, sessionDurationLabel } from '@/session/sessionMachine';
import type { StemForSession } from '@/session/useWritingSession';
import { useWritingSession } from '@/session/useWritingSession';

/**
 * The writing session (spec §6.3). No navigation chrome beyond a single
 * exit affordance (§10) — the stem stays pinned above the input, previously
 * written endings are shown dimmed above it (§6.3.5), and the timer is a
 * thin, calm progress bar with no numerals larger than the text (§6.3.7).
 *
 * `origin`/`notificationId`/`notifiedAt` are only present when this screen
 * was reached by tapping a notification (§6.4, ticket 10) — the stem was
 * already chosen at schedule time, so this screen just looks it up rather
 * than drawing again.
 */
export default function WriteScreen() {
  const { stemId, origin, notificationId, notifiedAt } = useLocalSearchParams<{
    stemId: string;
    origin?: string;
    notificationId?: string;
    notifiedAt?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const session = useWritingSession();
  const inputRef = useRef<TextInput>(null);

  const [terminator, setTerminator] = useState('...');
  const [pendingStem, setPendingStem] = useState<StemForSession | null>(null);

  // Pressure cue (§6.3.4/13.4, 2026-09-11 addition): the button gradient
  // tracks the per-stem timer when it's on, else the session timer — an
  // urgency cue only, never a numeral or shame copy.
  const buttonPressure = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const repo = getRepository();
    setTerminator(repo.getSettings().stem_terminator);
    if (stemId) {
      // listAllStems, not listActiveStems: the library (ticket 07) allows
      // writing on an archived stem deliberately, outside the weighted
      // rotation that `active` gates. A soft-deleted stem is excluded.
      const stem = repo.listAllStems().find((s) => s.id === stemId && s.deleted_at === null);
      if (stem) {
        setPendingStem({
          id: stem.id,
          text: stem.text,
          origin: origin === 'notification' ? 'notification' : 'manual',
          notificationId,
          notifiedAt,
        });
      }
    }
  }, [stemId, origin, notificationId, notifiedAt]);

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

  if (!pendingStem && session.phase === 'idle') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" themeColor="textSecondary">
            No stem selected.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const stemText = session.stemText ?? pendingStem?.text ?? '';
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/*
            Only shown before a session starts: once writing is under way,
            "Done" (below) is the single exit affordance (§10) — it saves
            and finishes rather than leaving a session dangling open, which
            an equally-visible second exit here would invite.
          */}
          {session.phase === 'idle' && (
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

          <ThemedText type="stem">
            {stemText}
            {terminator}
          </ThemedText>

          {session.phase === 'active' && <ProgressBar progress={progress} accessibilityLabel="Time remaining" />}

          {/*
            Read-only text, not inputs: there is no control that lets the
            user navigate back into an earlier ending (§6.3.6).
          */}
          {submittedEndings.map((e) => (
            <ThemedText key={e.ordinal} type="stem" themeColor="textSecondary">
              {e.text}
            </ThemedText>
          ))}

          {session.phase === 'idle' && pendingStem && (
            <Button label="Start" onPress={() => session.start(pendingStem)} />
          )}

          {session.phase === 'active' && (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                value={session.activeText}
                onChangeText={handleChangeText}
                onSubmitEditing={() => session.submitActive()}
                returnKeyType="done"
                multiline
                blurOnSubmit={false}
                contextMenuHidden
                autoCorrect={false}
                accessibilityLabel="Your ending"
                placeholder="Keep the pen moving."
                placeholderTextColor={theme.textSecondary}
              />
              {stemProgress !== null && (
                <ProgressBar progress={stemProgress} accessibilityLabel="Time remaining for this ending" />
              )}
              <Pressable
                onPress={() => session.submitActive()}
                accessibilityRole="button"
                accessibilityLabel="Save this ending"
              >
                <Animated.View style={[styles.button, { backgroundColor: buttonBackgroundColor }]}>
                  <ThemedText type="subtitle" style={styles.buttonLabelOnPressure}>
                    {buttonLabel}
                  </ThemedText>
                </Animated.View>
              </Pressable>
              <Pressable
                onPress={session.finishNow}
                style={styles.exitButton}
                accessibilityRole="button"
                accessibilityLabel="Finish session"
                hitSlop={12}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Done
                </ThemedText>
              </Pressable>
            </>
          )}

          {session.phase === 'done' && (
            <ThemedView style={styles.doneBlock}>
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
              <Button label="Close" onPress={() => router.back()} />
            </ThemedView>
          )}

          {session.phase === 'active' && (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              accessibilityLabel={`${submittedEndings.length} of ${targetEndings} endings written`}
            >
              {submittedEndings.length} of {targetEndings}
            </ThemedText>
          )}
        </ScrollView>
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
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
  input: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 34,
    minHeight: 80,
  },
  // Only the bespoke pressure-animated save button uses this now (Start/
  // Close moved to the shared `Button`) — `Radius.small` matches `Button`'s
  // own secondary/countdown radius so the two read as the same button family.
  button: {
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed white, not theme-driven: the pressure gradient (constants/theme.ts
  // `PressureColors`) is itself fixed in both themes, and white stays
  // >=4.5:1 across its full range (measured minimum 5.13:1).
  buttonLabelOnPressure: {
    color: '#ffffff',
  },
  doneBlock: {
    gap: Spacing.three,
  },
});
