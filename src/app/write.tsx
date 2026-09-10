import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { useWritingSession } from '@/session/useWritingSession';

/**
 * The writing session (spec §6.3). No navigation chrome beyond a single
 * exit affordance (§10) — the stem stays pinned above the input, previously
 * written endings are shown dimmed above it (§6.3.5), and the timer is a
 * thin, calm progress bar with no numerals larger than the text (§6.3.7).
 */
export default function WriteScreen() {
  const { stemId } = useLocalSearchParams<{ stemId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const session = useWritingSession();
  const inputRef = useRef<TextInput>(null);

  const [terminator, setTerminator] = useState('...');
  const [pendingStem, setPendingStem] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    const repo = getRepository();
    setTerminator(repo.getSettings().stem_terminator);
    if (stemId) {
      const stem = repo.listActiveStems().find((s) => s.id === stemId);
      if (stem) setPendingStem({ id: stem.id, text: stem.text });
    }
  }, [stemId]);

  useEffect(() => {
    if (session.phase === 'active') {
      // Give the field a beat to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [session.phase, session.state?.activeOrdinal]);

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
  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;

  const submittedEndings = session.state?.endings.filter((e) => e.submittedAt !== null) ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedView style={styles.exitRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Exit session">
              <ThemedText type="small" themeColor="textSecondary">
                Close
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedText type="stem">
            {stemText}
            {terminator}
          </ThemedText>

          {session.phase === 'active' && (
            <ThemedView
              type="backgroundElement"
              style={styles.progressTrack}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Time remaining"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <ThemedView type="backgroundSelected" style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </ThemedView>
          )}

          {submittedEndings.map((e) => (
            <ThemedText key={e.ordinal} type="stem" themeColor="textSecondary" style={styles.pastEnding}>
              {e.text}
            </ThemedText>
          ))}

          {session.phase === 'idle' && pendingStem && (
            <Pressable
              onPress={() => session.start(pendingStem)}
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              accessibilityRole="button"
            >
              <ThemedText type="subtitle">Start</ThemedText>
            </Pressable>
          )}

          {session.phase === 'active' && (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                value={session.activeText}
                onChangeText={session.changeActiveText}
                onSubmitEditing={session.submitActive}
                multiline
                blurOnSubmit={false}
                accessibilityLabel="Your ending"
                placeholder="Keep the pen moving."
                placeholderTextColor={theme.textSecondary}
              />
              <Pressable
                onPress={session.submitActive}
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="button"
              >
                <ThemedText type="subtitle">Next</ThemedText>
              </Pressable>
              <Pressable onPress={session.finishNow} accessibilityRole="button" hitSlop={12}>
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
              <Pressable onPress={() => router.back()} style={[styles.button, { backgroundColor: theme.backgroundElement }]} accessibilityRole="button">
                <ThemedText type="subtitle">Close</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {session.phase === 'active' && (
            <ThemedText type="small" themeColor="textSecondary">
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
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  pastEnding: {
    opacity: 0.5,
  },
  input: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 34,
    minHeight: 80,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  doneBlock: {
    gap: Spacing.three,
  },
});
